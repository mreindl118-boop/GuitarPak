# Claim: Helix deck (the Synth Deck model applied to the Helix Stadium) — Claude, 2026-10-26T02:00Z

- Author / sole writer: Claude (the session that shipped 1.2.0 = Helix page + Synth Deck).
- Matt, 2026-10-26: "evaluate what we're doing with the MODX UI built into soundLAB and
  try to emulate it for the Helix specifically. USB control read write privileges on the
  Helix like the Helix desktop app does." Status: EVALUATION + DESIGN in progress; no code
  yet; nothing pushed for this work.

## Path claims (Claude)

`js/helix.js`, new `js/helixdeck*.js`, `docs/HELIX-STADIUM.md`, new `docs/HELIX-DECK*.md`,
`tools/helix-bridge.js`, `tools/helix-defs.json`, `tests/helix*.test.js`, the Helix entries
in `js/help.js` TOURS (`helix` key only), `CLAUDE.md` Helix entries, the Helix row in
README. Script tags / sw ASSETS lines for new helix files only. NOT touched: js/synthdeck.js,
js/synthtab.js, js/midihub.js, the deck CSS, Synth tours (the Synth tab session's).

## Base and order

Branch to be cut from `feat/synth-tab` (the 1.3 base, per the 2026-10-25 rule); lands after
1.3 unless Matt says otherwise; it does not stamp a version. Phase 1 = the deck UI over the
routes that exist (USB MIDI + the network bridge); the USB-bulk editor route is a later
phase that needs: the Helix Stadium desktop app on a PC for protocol capture, WinUSB bound
to the pedal's vendor interface (MI_06, driverless today) for WebUSB/libusb, hardware time.

## Facts recorded today

The Stadium (VID 0E41 / PID 4841) on this PC: MI_00 USB Audio 2.0, MI_03 class MIDI,
MI_05 HID keyboard, MI_06 "Helix Stadium Bulk Transfer" vendor class FF with no driver
bound. The desktop app is not installed on this PC. null's task-2 catalog (297 documented
MIDI definitions) is the reference for the MIDI half.
