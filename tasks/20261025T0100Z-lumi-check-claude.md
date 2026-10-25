# 20261025T0100Z lumi-check (Claude)

- Objective: make soundLAB's LUMI Keys interface true to Matt's ROLI LUMI Keys Block ("ALXJ"),
  step by step, the way the MODX maps were checked: what the keybed engine claims (docs/
  NOTE-PALETTE.md, docs/LUMI-PRACTICE.md, js/midi.js) versus what the real unit does.
- Authorization: Matt, 2026-10-24/25 ("lets develop the same interface understanding of the
  lumi keys step by step", "Do it here"). No pushes, no release stamps, no artifact publishing
  without his say-so. Nothing was written to the LUMI (no program upload, no factory reset).
- Owner / sole record writer: Claude (this session). Branch `check/lumi-claude`, worktree
  `C:\Users\mrein\AppData\Local\Temp\sl-lumi`, base `main` 358d204 (1.2.0). Not pushed.
- Setup: LUMI over Bluetooth LE (its USB MIDI interface fails with Code 10 on this PC). Chrome
  152 must run with `--enable-features=MidiManagerWinrt` to list "LUMI Keys Block ALXJ
  (Bluetooth MIDI IN/OUT)" - the chrome://flags switch did not take, the command-line switch
  (what the soundLAB launcher uses) did. App served from the worktree on localhost:4596; Matt
  at the keyboard sending photos; every byte in and out tapped off `midi:raw` / `midi:out`.
- Changed paths: `js/midi.js`, `tests/lumi-firmware.test.js` (new), `tests/lights.test.js`
  (one assertion), `docs/NOTE-PALETTE.md`, `docs/LUMI-PRACTICE.md`, `CLAUDE.md`, this record.

## What the real unit does (stock ROLI firmware, Rainbow colour scheme)

1. Ports: `knownLumi()` matches the BLE names; a stale stored `midi.outputId` ("output-1") kept
   the app from auto-picking the LUMI - fixed (a LUMI stands in, the stored choice is kept).
2. Input: notes on ch 1 with release velocities; octave buttons send nothing; the app's 24-key
   window followed played notes (48-71 -> 60-83) as designed.
3. SysEx config frames (benob format) are accepted: Piano mode flashed white/black; Night =
   a DIM rainbow background (not black); brightness 80 % = `10 40 04 14`.
4. A Note On lights its key in a velocity hue and HOLDS until Note Off; `80 nn 00` clears it.
   Photos: a white C-major walk, a degree-coloured walk, a 12-step ladder and a 24-key sweep.
5. EVERY config frame wipes the lit keys. The app re-sent night + brightness on each repaint
   (a MODX plugging in = 4 port events = 12 `midi:state` = 48 frames) - that is why keys went
   "lit, then dim". Fixed: frames only when mode/brightness changed; re-light after them.
6. Pressing a lit key blanks its light and the firmware never restores it (the app sent
   nothing). Fixed: the LUMI's own Note Off re-sends the key's colour (`lights.relight`,
   default on; `holdRelight(owner, on)` so a lesson can let a played key stay dark - Matt's
   pin). 60 ms felt "obstructive"; 0 ms is what shipped.
7. Velocity -> colour: pink/red (1) -> orange -> yellow -> green -> cyan -> blue -> violet
   (127). 127 is NOT white. The sweep sits about one colour step from the archived
   `colourLookup` table (the app's orange C showed pink). Calibration: see "Colour table" below.
8. The MODX: its Data Dial and panel edits transmit nothing (consistent with the MODX check);
   the MODX "USB TO DEVICE" port takes flash drives only, so a stand-alone LUMI -> MODX link
   needs a Bluetooth-to-DIN bridge (CME WIDI) and then nothing can light the LUMI (BLE = one
   host). With the PC as hub (LUMI BLE -> MIDI Hub Thru + Rules -> MODX USB) a key-range split
   onto MODX Parts is a two-rule set and the lights stay - proposed as the next task.

## Colour table

From the 12-step ladder photo (C5..B5 = velocities 1, 12, 23, 35, 46, 58, 69, 81, 92, 104, 115,
127): pink, orange-red, orange, yellow-orange, gold, green, teal, cyan, light blue, blue, blue,
VIOLET. That matches the archived colourLookup within about one step everywhere except the top:
127 is violet on this firmware, not white. The degree-coloured walk looked one key off in a
photo taken right after a white walk (hold-over of the previous frame is the likely cause; not
reproduced in the ladder). Decision (Matt, going to bed: "guesswork for now"): the table stays;
nothing in the app relies on 127 being white on a LUMI (guides and reveals use palette hues);
`App.midi.test()`'s 127 shows as violet. A proper per-velocity calibration needs a daylight,
straight-on photo of the 24-key sweep (60:1 ... 83:127) and is left open.

## Tests

lights 70, lumi-firmware 12 (new), lumidisplay 22, colors 61, keys 33, lumi-practice 97,
midi-ports 130, multiin 17, display-master 20, lumi-contexts 37, practice 33, midihub 45 - all
pass (NODE_PATH=C:\Users\mrein\AppData\Local\Temp\hxprobe\node_modules, served on 4596).

## Open

Device id 37 vs 00 (both sent); brightness steps by eye; the benob LittleFoot program (true
per-key RGB, black background) would need ROLI Dashboard over USB, which this PC cannot do;
Arp/split work on the Hub side; the "Relight after you play" switch needs a place in Lights &
help (API exists, no UI yet).
