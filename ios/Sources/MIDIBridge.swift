import Foundation
import UIKit
import CoreMIDI
import CoreAudioKit
import WebKit

/// CoreMIDI <-> WKWebView bridge: gives the bundled web app the same MIDI
/// surface it gets from Web MIDI in Chrome, on iOS where WebKit has none.
///
/// JS -> native (window.webkit.messageHandlers.midi.postMessage):
///   {cmd:"init"}                     start CoreMIDI, reply with ports
///   {cmd:"send", data:[bytes]}       send a MIDI message (incl. SysEx)
///   {cmd:"setOutput", id:Int}        choose destination by unique ID
///   {cmd:"bluetooth"}                present the Bluetooth MIDI pairing sheet
///
/// native -> JS:
///   window.__glMIDI.onports({inputs:[{id,name}], outputs:[{id,name}]})
///   window.__glMIDI.onmidi(srcId, [bytes])   raw bytes of one packet
///
/// All sources are connected; the web side filters by its chosen input id.
final class MIDIBridge: NSObject {
    private var client = MIDIClientRef()
    private var inPort = MIDIPortRef()
    private var outPort = MIDIPortRef()
    private var currentOut: MIDIEndpointRef = 0
    private var connected = Set<MIDIEndpointRef>()
    weak var webView: WKWebView?

    func start() {
        guard client == 0 else { pushPorts(); return }
        MIDIClientCreateWithBlock("GuitarLab" as CFString, &client) { [weak self] _ in
            // hot-plug / Bluetooth connects land here
            DispatchQueue.main.async {
                self?.connectAllSources()
                self?.pushPorts()
            }
        }
        MIDIInputPortCreateWithBlock(client, "GuitarLab In" as CFString, &inPort) {
            [weak self] packetList, srcRef in
            self?.receive(packetList, srcRef: srcRef)
        }
        MIDIOutputPortCreate(client, "GuitarLab Out" as CFString, &outPort)
        connectAllSources()
        pushPorts()
    }

    private func connectAllSources() {
        guard inPort != 0 else { return }
        // track what's already wired: re-connecting a source on every setup
        // notification would deliver every packet twice after a hot-plug
        var alive = Set<MIDIEndpointRef>()
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i)
            alive.insert(src)
            guard !connected.contains(src) else { continue }
            // srcRef connRefCon carries the endpoint so receive() can name it
            MIDIPortConnectSource(inPort, src,
                UnsafeMutableRawPointer(bitPattern: UInt(src)))
            connected.insert(src)
        }
        connected = connected.intersection(alive) // forget unplugged endpoints
    }

    private func uid(_ ep: MIDIEndpointRef) -> Int32 {
        var v: Int32 = 0
        MIDIObjectGetIntegerProperty(ep, kMIDIPropertyUniqueID, &v)
        return v
    }

    private func name(_ ep: MIDIEndpointRef) -> String {
        var cf: Unmanaged<CFString>?
        if MIDIObjectGetStringProperty(ep, kMIDIPropertyDisplayName, &cf) == noErr,
           let s = cf?.takeRetainedValue() {
            return s as String
        }
        return "MIDI device"
    }

    private func pushPorts() {
        var ins: [[String: Any]] = []
        for i in 0..<MIDIGetNumberOfSources() {
            let ep = MIDIGetSource(i)
            ins.append(["id": uid(ep), "name": name(ep)])
        }
        var outs: [[String: Any]] = []
        for i in 0..<MIDIGetNumberOfDestinations() {
            let ep = MIDIGetDestination(i)
            outs.append(["id": uid(ep), "name": name(ep)])
        }
        // default destination: first one, or keep the current pick if alive
        if currentOut == 0, MIDIGetNumberOfDestinations() > 0 {
            currentOut = MIDIGetDestination(0)
        }
        emit("onports", jsonOf(["inputs": ins, "outputs": outs]))
    }

    func setOutput(id: Int) {
        for i in 0..<MIDIGetNumberOfDestinations() {
            let ep = MIDIGetDestination(i)
            if uid(ep) == Int32(id) { currentOut = ep; return }
        }
    }

    func send(_ bytes: [UInt8]) {
        // one stack MIDIPacketList holds ~256 data bytes — plenty for note
        // messages and the short LUMI SysEx frames; larger sends are dropped
        guard outPort != 0, currentOut != 0, !bytes.isEmpty, bytes.count < 200 else { return }
        var packetList = MIDIPacketList()
        let size = MemoryLayout<MIDIPacketList>.size
        let packet = MIDIPacketListInit(&packetList)
        MIDIPacketListAdd(&packetList, size, packet, 0, bytes.count, bytes)
        MIDISend(outPort, currentOut, &packetList)
    }

    private func receive(_ packetList: UnsafePointer<MIDIPacketList>, srcRef: UnsafeMutableRawPointer?) {
        let src = MIDIEndpointRef(UInt(bitPattern: srcRef))
        let id = src != 0 ? uid(src) : 0
        var packet = packetList.pointee.packet
        var all: [[UInt8]] = []
        for _ in 0..<packetList.pointee.numPackets {
            let count = Int(packet.length)
            var bytes = [UInt8](repeating: 0, count: count)
            withUnsafeBytes(of: packet.data) { raw in
                for i in 0..<min(count, raw.count) { bytes[i] = raw[i] }
            }
            all.append(bytes)
            packet = MIDIPacketNext(&packet).pointee
        }
        DispatchQueue.main.async { [weak self] in
            for bytes in all {
                let arr = bytes.map(String.init).joined(separator: ",")
                self?.emit("onmidi", "\(id),[\(arr)]")
            }
        }
    }

    func presentBluetoothPairing() {
        let vc = CABTMIDICentralViewController()
        let nav = UINavigationController(rootViewController: vc)
        nav.modalPresentationStyle = .formSheet
        vc.navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(dismissPairing))
        topViewController()?.present(nav, animated: true)
    }

    @objc private func dismissPairing() {
        topViewController()?.dismiss(animated: true)
    }

    private func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        var top = scenes.first?.windows.first { $0.isKeyWindow }?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }

    private func jsonOf(_ obj: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: obj),
              let s = String(data: data, encoding: .utf8) else { return "{}" }
        return s
    }

    private func emit(_ fn: String, _ argsLiteral: String) {
        let js = "window.__glMIDI && window.__glMIDI.\(fn) && window.__glMIDI.\(fn)(\(argsLiteral));"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}
