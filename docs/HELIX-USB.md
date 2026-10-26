# Helix Stadium over USB — how soundLAB edits the pedal through the cable

**Short version.** On firmware 1.4 the Stadium's "USB editing" is a network link over the USB cable,
not a special USB protocol. The pedal shows up as a USB network adapter (CDC-NCM; Windows 11 binds
its in-box *UsbNcm* driver), gives itself an IPv6 address ending in `::1` on that link, still answers
`p35x1.local` there, and the same editor services the bridge already speaks over Wi-Fi (TCP 2002
commands, 2001 change stream, 2003 telemetry) answer over it. So the bridge
(`node tools/helix-bridge.js`) is the USB route: it looks for that link first, uses it when the pedal
answers, and falls back to Wi-Fi/mDNS otherwise. The vendor "Helix Stadium Bulk Transfer" USB
interface is only the firmware-update path; soundLAB never touches it. No WebUSB, no driver rebinding.

Sources and confidence: `docs/HELIX-STADIUM.md` (USB paragraph) and the research record of
2026-10-26 (community `helix-stadium-tools` notes verified on a Stadium XL fw 1.4.0; Line 6's own
pages confirm the USB entry in the app and the "Prefer USB" switch but say nothing about NCM). The
one thing nobody has reported yet is Windows 11 binding the NCM adapter for this pedal — the
checklist below is how we find out.

## After the firmware update — the checklist

Plug the pedal into the laptop over USB (its *Remote Access* on, as for Wi-Fi), then:

1. **Device Manager › Network adapters**: a new adapter should appear (named like *UsbNcm Host
   Device* or carrying the pedal's name). If only the audio/MIDI entries appear, Windows did not bind
   the NCM driver — note the exact entry under *Other devices* and stop here.
2. **Addresses**: `ipconfig /all` shows that adapter with an IPv6 address starting `fd` (a unique local
   address). The pedal is that prefix with `::1` at the end.
3. **Name**: `Resolve-DnsName p35x1.local` should answer (mDNS over the link). If it does not, the
   bridge still finds the pedal by its `::1` address.
4. **The bridge**: `node tools/helix-bridge.js -v`. Expected log line: `usb: Helix answered on
   fd…::1 via <adapter>`; then `device: … ports 2001/2002/2003 open`. On the Helix page the **USB**
   badge turns green and the Now bar says *via USB* (or *via MIDI + USB* with the MIDI port too).
5. **Read-only inventory** for the record: `powershell -NoProfile -ExecutionPolicy Bypass -File
   tools/helix-usb-inventory.ps1` lists the pedal's USB functions with their drivers, the adapter,
   its IPv6 addresses, the name lookup and a port-2002 probe at the link's `::1`. `-Json` for a
   task record. It changes nothing.

## What the bridge does (phase 4)

- `--prefer usb|net|auto` (default auto) on the command line; the page can ask for a transport with
  `{op:'transport', want:'usb'|'net'|'auto'}` (the USB badge sends it when the link is reachable but
  the bridge sits on Wi-Fi).
- Discovery: every non-loopback interface's IPv6 unique-local address becomes a candidate
  `<prefix>::1`; candidates are probed on port 2002 in parallel (link-local `fe80::1%zone` as a lower
  fallback); the first that answers is the USB route. On Windows the bridge also lists network
  adapters and attaches the one whose description looks like the link (NCM / Helix / Stadium) —
  informational only.
- Status to the page: `transport: 'usb' | 'net' | 'manual' | null` and `transports: { usb: { present,
  adapter, local, candidate, reachable } | null, net: { host, ip } }`, refreshed on every reconnect
  and on `{op:'status'}` (at most every 5 s).
- A host given on the command line or via `{op:'host'}` is always used as-is (`manual`).

## Still to verify on the real pedal

- Windows binding the NCM adapter at all (checklist step 1).
- Whether the pedal also hands out an IPv4 address on the link (the bridge handles both; the
  community notes only mention IPv6).
- *Remote Access › Require PIN*: the editor protocol's handshake has no password field; how the PIN
  is enforced on the wire is unknown. Leave it off for the first test.
- Firmware 1.4 may have changed some editor answers the page relies on (`/EditBufferStateGet`,
  `/GetContentRef`, snapshot order); re-check the Edit › Blocks and Presets views over Wi-Fi first.

## Why not WebUSB or the desktop app's USB traffic

The NCM function is owned by the operating system's network driver on every platform, so a browser
cannot claim it; the vendor bulk interface a browser could claim carries only the updater's framed
text commands. Capturing the desktop app's USB traffic would show TCP inside NCM frames — the same
packets the bridge sends. The app is still useful for a Wi-Fi capture of editor commands the manual
does not document (model swap, adding and moving blocks, setlist edits), which the Edit views could
grow into later.

## iPad

A Safari web app cannot reach the pedal (no sockets). A USB-C iPad does support USB Ethernet, so the
`ios/` wrapper with a small TCP bridge inside it is the only road there; not built.
