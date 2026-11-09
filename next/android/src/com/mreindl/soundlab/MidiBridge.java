package com.mreindl.soundlab;

import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiInputPort;
import android.media.midi.MidiManager;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Android MIDI <-> WebView bridge — the same protocol as the iOS CoreMIDI
 * bridge (ios/Sources/MIDIBridge.swift), so js/midi.js treats both alike.
 * The Android WebView has no Web MIDI; this gives the app USB MIDI, Bluetooth
 * LE MIDI and any other device Android's MIDI service knows (a ROLI LUMI over
 * either cable or Bluetooth).
 *
 * JS -> native: window.SoundLabMidi.post(JSON)
 *   {cmd:"init"}                  start, reply with ports (and reconnect the
 *                                 last Bluetooth keyboard)
 *   {cmd:"send", data:[bytes]}    send to the chosen output (incl. SysEx)
 *   {cmd:"setOutput", id:Int}     choose the output device
 *   {cmd:"bluetooth"}             scan for Bluetooth MIDI keyboards and
 *                                 connect every one found (10 s)
 * native -> JS:
 *   window.__glMIDI.onports({inputs:[{id,name}], outputs:[{id,name}]})
 *   window.__glMIDI.onmidi(srcId, [bytes])
 *   window.__glMIDI.onstatus(text)          Bluetooth progress
 *
 * Every device that sends MIDI is listened to; the web side filters by its
 * chosen input id. Ids are Android's MidiDeviceInfo ids.
 */
final class MidiBridge {

    static final int REQ_BT = 7;
    private static final ParcelUuid BLE_MIDI =
        ParcelUuid.fromString("03B80E5A-EDE8-4B33-A751-6CE34EC4C700");

    private final Activity act;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private MidiManager mm;
    private final Map<Integer, MidiDevice> devices = new HashMap<>();
    private final Map<Integer, MidiOutputPort> listening = new HashMap<>();
    private final List<String> opening = Collections.synchronizedList(new ArrayList<String>());
    private MidiInputPort out;
    private int outId = -1;
    private boolean started = false;
    private BluetoothLeScanner scanner;
    private ScanCallback scanCb;

    MidiBridge(Activity act, WebView web) {
        this.act = act;
        this.web = web;
    }

    /** window.SoundLabMidi */
    final class Js {
        @JavascriptInterface
        public void post(final String json) {
            main.post(new Runnable() {
                @Override
                public void run() { handle(json); }
            });
        }
    }

    private void handle(String json) {
        try {
            JSONObject m = new JSONObject(json);
            String cmd = m.optString("cmd");
            if ("init".equals(cmd)) init();
            else if ("send".equals(cmd)) send(m.optJSONArray("data"));
            else if ("setOutput".equals(cmd)) setOutput(m.optInt("id", -1));
            else if ("bluetooth".equals(cmd)) bluetooth();
        } catch (Exception ignored) { /* malformed message */ }
    }

    // ---- start + device discovery ----

    private void init() {
        if (started) { pushPorts(); return; }
        started = true;
        mm = (MidiManager) act.getSystemService(Context.MIDI_SERVICE);
        if (mm == null) { pushPorts(); return; }
        mm.registerDeviceCallback(new MidiManager.DeviceCallback() {
            @Override
            public void onDeviceAdded(MidiDeviceInfo info) { openDevice(info); }

            @Override
            public void onDeviceRemoved(MidiDeviceInfo info) { closeDevice(info.getId()); pushPorts(); }
        }, main);
        for (MidiDeviceInfo info : mm.getDevices()) openDevice(info);
        pushPorts();
        reconnectBluetooth();
    }

    private void openDevice(final MidiDeviceInfo info) {
        if (mm == null || devices.containsKey(info.getId())) return;
        mm.openDevice(info, new MidiManager.OnDeviceOpenedListener() {
            @Override
            public void onDeviceOpened(MidiDevice device) { adopt(device); }
        }, main);
    }

    /** a device is open: listen to every port it sends on, then announce it */
    private void adopt(MidiDevice device) {
        if (device == null) return;
        final int id = device.getInfo().getId();
        if (devices.containsKey(id)) { try { device.close(); } catch (Exception ignored) { } return; }
        devices.put(id, device);
        int nOut = device.getInfo().getOutputPortCount();
        for (int i = 0; i < nOut; i++) {
            MidiOutputPort p = device.openOutputPort(i);
            if (p == null) continue;
            p.connect(new MidiReceiver() {
                @Override
                public void onSend(byte[] msg, int offset, int count, long timestamp) { deliver(id, msg, offset, count); }
            });
            listening.put(id * 16 + i, p);
        }
        if (outId == -1 && device.getInfo().getInputPortCount() > 0) setOutput(id);
        pushPorts();
    }

    private void closeDevice(int id) {
        for (Integer k : new ArrayList<>(listening.keySet())) {
            if (k / 16 == id) { try { listening.remove(k).close(); } catch (Exception ignored) { } }
        }
        if (id == outId) { closeOut(); outId = -1; }
        MidiDevice d = devices.remove(id);
        if (d != null) { try { d.close(); } catch (Exception ignored) { } }
    }

    private String nameOf(MidiDeviceInfo info) {
        Bundle p = info.getProperties();
        String n = p.getString(MidiDeviceInfo.PROPERTY_NAME);
        if (n == null || n.isEmpty()) n = p.getString(MidiDeviceInfo.PROPERTY_PRODUCT);
        if (n == null || n.isEmpty()) {
            BluetoothDevice bt = p.getParcelable(MidiDeviceInfo.PROPERTY_BLUETOOTH_DEVICE);
            try { if (bt != null) n = bt.getName(); } catch (SecurityException ignored) { }
        }
        return n == null || n.isEmpty() ? "MIDI device" : n;
    }

    private void pushPorts() {
        try {
            JSONArray ins = new JSONArray(), outs = new JSONArray();
            for (MidiDevice d : devices.values()) {
                MidiDeviceInfo info = d.getInfo();
                JSONObject o = new JSONObject();
                o.put("id", info.getId());
                o.put("name", nameOf(info));
                if (info.getOutputPortCount() > 0) ins.put(o);
                if (info.getInputPortCount() > 0) outs.put(new JSONObject(o.toString()));
            }
            JSONObject all = new JSONObject();
            all.put("inputs", ins);
            all.put("outputs", outs);
            js("onports(" + all.toString() + ")");
        } catch (Exception ignored) { }
    }

    // ---- data both ways ----

    private void deliver(final int id, byte[] msg, int offset, int count) {
        final StringBuilder sb = new StringBuilder(count * 4);
        for (int i = 0; i < count; i++) {
            if (i > 0) sb.append(',');
            sb.append(msg[offset + i] & 0xff);
        }
        main.post(new Runnable() {
            @Override
            public void run() { js("onmidi(" + id + ",[" + sb + "])"); }
        });
    }

    private void send(JSONArray data) {
        if (out == null || data == null || data.length() == 0) return;
        byte[] b = new byte[data.length()];
        for (int i = 0; i < b.length; i++) b[i] = (byte) data.optInt(i);
        try { out.send(b, 0, b.length); } catch (Exception ignored) { /* port gone */ }
    }

    private void setOutput(int id) {
        if (id == outId && out != null) return;
        MidiDevice d = devices.get(id);
        if (d == null || d.getInfo().getInputPortCount() == 0) return;
        closeOut();
        out = d.openInputPort(0);
        outId = out != null ? id : -1;
    }

    private void closeOut() {
        if (out != null) { try { out.close(); } catch (Exception ignored) { } }
        out = null;
    }

    private void js(String call) {
        web.evaluateJavascript("window.__glMIDI&&window.__glMIDI." + call, null);
    }

    private void status(String text) {
        js("onstatus&&window.__glMIDI.onstatus(" + JSONObject.quote(text) + ")");
    }

    // ---- Bluetooth LE MIDI ----

    private boolean btAllowed() {
        if (Build.VERSION.SDK_INT >= 31) {
            return act.checkSelfPermission("android.permission.BLUETOOTH_SCAN") == PackageManager.PERMISSION_GRANTED
                && act.checkSelfPermission("android.permission.BLUETOOTH_CONNECT") == PackageManager.PERMISSION_GRANTED;
        }
        return act.checkSelfPermission("android.permission.ACCESS_FINE_LOCATION") == PackageManager.PERMISSION_GRANTED;
    }

    private void bluetooth() {
        if (!started) init();
        if (!btAllowed()) {
            act.requestPermissions(Build.VERSION.SDK_INT >= 31
                ? new String[] { "android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT" }
                : new String[] { "android.permission.ACCESS_FINE_LOCATION" }, REQ_BT);
            return;
        }
        scan();
    }

    /** MainActivity forwards the permission answer */
    void onPermission(boolean granted) {
        if (granted) scan();
        else status("Bluetooth permission was declined.");
    }

    private BluetoothAdapter adapter() {
        BluetoothManager bm = (BluetoothManager) act.getSystemService(Context.BLUETOOTH_SERVICE);
        return bm == null ? null : bm.getAdapter();
    }

    private void scan() {
        BluetoothAdapter a = adapter();
        if (a == null || !a.isEnabled()) { status("Turn Bluetooth on, then try again."); return; }
        try {
            scanner = a.getBluetoothLeScanner();
            if (scanner == null) { status("Bluetooth isn't ready."); return; }
            final List<String> found = new ArrayList<>();
            scanCb = new ScanCallback() {
                @Override
                public void onScanResult(int type, ScanResult r) {
                    BluetoothDevice dev = r.getDevice();
                    if (dev == null || found.contains(dev.getAddress())) return;
                    found.add(dev.getAddress());
                    connectBluetooth(dev);
                }
            };
            List<ScanFilter> filters = new ArrayList<>();
            filters.add(new ScanFilter.Builder().setServiceUuid(BLE_MIDI).build());
            scanner.startScan(filters, new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCb);
            status("Looking for Bluetooth MIDI keyboards… (wake your LUMI: press a key)");
            main.postDelayed(new Runnable() {
                @Override
                public void run() {
                    stopScan();
                    if (found.isEmpty()) status("No Bluetooth MIDI keyboard found. Is it on and not connected to another device?");
                }
            }, 10000);
        } catch (SecurityException e) {
            status("Bluetooth permission is missing.");
        }
    }

    private void stopScan() {
        try { if (scanner != null && scanCb != null) scanner.stopScan(scanCb); } catch (Exception ignored) { }
        scanCb = null;
    }

    private void connectBluetooth(final BluetoothDevice dev) {
        if (mm == null) return;
        final String addr = dev.getAddress();
        if (opening.contains(addr)) return;
        opening.add(addr);
        mm.openBluetoothDevice(dev, new MidiManager.OnDeviceOpenedListener() {
            @Override
            public void onDeviceOpened(MidiDevice device) {
                opening.remove(addr);
                if (device == null) { status("Couldn't connect to that keyboard."); return; }
                prefs().edit().putString("btAddr", addr).apply();
                adopt(device);
                status("Connected: " + nameOf(device.getInfo()));
            }
        }, main);
    }

    /** the last Bluetooth keyboard reconnects by itself on the next launch */
    private void reconnectBluetooth() {
        String addr = prefs().getString("btAddr", null);
        if (addr == null || !btAllowed()) return;
        BluetoothAdapter a = adapter();
        if (a == null || !a.isEnabled()) return;
        try { connectBluetooth(a.getRemoteDevice(addr)); } catch (Exception ignored) { }
    }

    private SharedPreferences prefs() { return act.getSharedPreferences("midi", Context.MODE_PRIVATE); }

    void close() {
        stopScan();
        for (Integer id : new ArrayList<>(devices.keySet())) closeDevice(id);
    }
}
