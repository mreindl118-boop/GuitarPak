# Helix Stadium XL recall profile

Page ID: `helix-stadium`; panel: `panel-helix-stadium`. Load
`css/helix-stadium.css` and `js/helix-stadium.js` before `App.boot()`.
The module uses the existing `App.midi` service. It never creates MIDI access,
selects the app-wide keyboard output, installs an input filter, or forwards input.

## Use

1. Enable Web MIDI with the page button if necessary. Choose your installed
   firmware, an explicitly named Helix output, and Stadium’s Global MIDI channel.
   v1.4 is the supported mapping; other/unchecked versions keep output disabled.
2. On Stadium, open the Preset List and copy its displayed CC32 and PC values.
   Enter these raw 0–127 numbers and your own name. Optionally choose a snapshot.
   Saving, editing or removing a favorite affects browser storage only.
3. Save device edits before changing presets. Arm output, verify the displayed
   destination, and click Recall. The page cannot confirm device state.
4. Snapshot buttons affect the current preset. Tap tempo sends once per click.
   Optional input monitoring counts incoming messages and clock ticks; it does
   not drive soundLAB transport or send clock.

**Hardware untested:** validation uses mocked ports only. No actual device was
connected or changed during implementation. Matt’s effects-only Fender Blues
Deluxe presets must stay intact; this profile provides no tone editing,
amp/cab/IR, patch-write, Matrix, firmware or audio-routing controls.

## Safety and lifecycle

- Output is disarmed on initialization and every page entry. Output, firmware
  and channel changes, MIDI connection changes, page exit, app hiding and window
  blur disarm it. Arm and port choices are never persisted.
- Every send rechecks the exact selected output ID and its name. Only
  Helix/Stadium named ports qualify; MODX, MONTAGE, LUMI, ROLI and obvious
  virtual/loopback/thru ports are excluded. Generic DIN interfaces are omitted
  because their destination cannot be established from their name.
- Requires Web MIDI’s `explicitPortsSupported`; native backends stay disabled.
  `sendToOutput(id, bytes)` has no fallback to another port. A failed/partial
  command disarms output. There are no retries or automatic recalls.
- Input uses `subscribeInput(id, callback)` with exact `portId` checking. The
  subscription and activity timer are released on page exit/app hiding and
  refreshed on `midi:state`. Input never becomes output.
- `guitarlab.helixStadium.favorites` stores at most 32 manually named addresses.
  No preset content, credentials, detected firmware, port or arm state is stored.

## Documented messages and provenance

Verified 2026-10-19 against the official [Line 6 MIDI reference](https://manuals.line6.com/en/helix-stadium/live/midi)
(live manual v1.4): preset recall sends CC32 bank, then PC program, optionally
CC69 with snapshot minus one. Snapshot shortcuts send CC69 values 0–7;
next/previous send 8/9. Tap sends CC64 value 127. The hardware’s recall sidebar
is the address authority; empty unsaved slots may not be recalled. No full
preset API is claimed. No Showcase messages are implemented because earlier
firmware documentation and the current manual differ.

The official [Global Settings reference](https://manuals.line6.com/en/helix-stadium/live/global-settings)
documents configurable MIDI channels and USB MIDI settings. The Global channel
defaults to 1; Bypass/Control and Matrix use separate channels. This profile
only sends the selected Global channel. The firmware selection is a manual
declaration, not device detection. Manuals are links only; no runtime fetches.

## Validation

Run `node tests/helix-stadium.test.js` with Playwright on `NODE_PATH` and a Chrome
binary supplied through `CHROMIUM` (the shared `tests/env.js` convention).
The suite uses an isolated mocked `App.midi` surface and verifies exact recall,
snapshot and tap bytes, startup silence, firmware/arming guards, destination
isolation, favorite persistence without output, input-only monitoring,
disconnect failure, and lifecycle cleanup. `window.SLHelixStadium` exposes pure
message builders, port validation and read-only state for diagnostics.
