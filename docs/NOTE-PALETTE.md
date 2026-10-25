# Shared note colors and LUMI program profile

The treble-clef menu provides **Intervals / Note Names**. This changes pitch
identity colors throughout the built-in views and the shared LUMI renderer;
it is independent of **Scale Lock** and **LUMI Display**. The choice persists
as `fb.colorMode`. Root/scale changes redraw current guides. Neither this
control nor the palette utility requests MIDI permission or configures hardware.

`js/note-palette.js` is the single mapping source. `App.colors.forPitch(note)`
(and compatible `forNote(note, oldStep)`) returns its mapped screen RGB;
`App.colors.lumiVelocity(note)` returns the matching table index. MIDI numbers,
pitch classes and enharmonic spellings resolve to the same identity: C♯ = D♭,
B♯ = C, C♭ = B, E♯ = F, and F♭ = E, regardless of octave.

* **Intervals** uses all twelve semitones relative to the selected root.
  R, 2, 3, 4, 5, 6 and 7 have seven configurable natural anchors. ♭2, ♭3,
  ♭5, ♭6 and ♭7 blend their neighboring natural anchors. Thus D is 2 in C
  and 5 in G; an out-of-scale pitch still has a chromatic interval color.
* **Note Names** uses absolute C..B pitch classes. C, D, E, F, G, A and B are
  configurable natural anchors. C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭ and A♯/B♭ blend
  their two neighboring naturals. Changing root does not change an E color.

Each natural anchor is first mapped to a supported program-table RGB value.
An altered pitch takes the rounded per-channel RGB midpoint of the two mapped
neighbors, then maps to the nearest supported entry with the same deterministic
red-mean weighted RGB distance. This is an RGB blend, not calibrated perceptual
mixing. The screen uses the resulting table RGB directly, rather than showing
an arbitrary color while emitting a different approximate one.

The existing `fb.colors` (seven entries), `fb.noteColors` (twelve entries),
and reset controls remain compatible. Old stored accidental entries are retained
in source storage but no longer override derived blends. The note editor shows
seven editable natural anchors and five read-only derived accidental swatches.
Custom natural edits update their adjacent altered-pitch blends immediately.

Correct/wrong/target state keeps its pitch fill. The practice preview adds
◎ Target, ✓ Correct and × Wrong labels, outlines and live text; the guided
player similarly uses labels/icons/outlines. Instructional LUMI frames retain
the mapped pitch hue rather than replacing it with white/green/red. These
semantic frames are owned by the shared MIDI service and obey the single
LUMI Display master. Sound-note filtering never suppresses a permitted
instructional wrong-note display frame.

## Checked on a real LUMI Keys Block (stock ROLI firmware, 2026-10-25)

Matt's LUMI over Bluetooth LE (Chrome with `--enable-features=MidiManagerWinrt`), photos of the
keys, record `tasks/20261025T0100Z-lumi-check-claude.md`, suite `tests/lumi-firmware.test.js`:

- A Note On to the LUMI lights that key in a velocity colour and the light HOLDS until a Note Off
  (`80 nn 00` clears it). The colour is a hue sweep: pink/red at 1, orange, yellow, green, cyan,
  blue, violet at 127. **127 is not white** on this firmware (it is violet, the end of the sweep). A 12-step ladder
  photo matched the archived `colourLookup` within about one step; a precise per-velocity
  calibration (24-key sweep in daylight) is still open - see the task record.
- Every SysEx config frame (colour mode, brightness) is accepted - but it WIPES the keys the app has
  lit. `js/midi.js` therefore sends mode/brightness only when they changed and re-lights every key
  afterwards (`lumiLayout` returns true = "the keys need their colours again").
- "Night" mode (`10 40 62 00`) is a DIM rainbow background, not a black keyboard. "Piano" showed
  white/black for a moment. The ROLI Dashboard colour scheme on the unit was Rainbow.
- A key you press loses its virtual light and does not get it back by itself: the app re-sends the
  key's Note On on the LUMI's own Note Off (`lights.relight`, default on; `App.midi.holdRelight
  (owner, true)` for a lesson that wants a played key to stay dark).
- The LUMI sends notes on channel 1 with release velocities; its octave buttons send nothing
  (the app's 24-key window is inferred from played notes, as designed).
- Device id: both `37` and `00` frames were sent together; which one the unit answers to was not
  separated. The benob LittleFoot program was NOT loaded; nothing was written to the device.

## Evidence and limits

The exact 128-entry lookup is the `colourLookup` array in the archived
[LUMI Keys Block default LittleFoot program](https://github.com/benob/LUMI-lights/blob/ffb63fa3557153e07bc1e0a6b1742a2616d2a8ba/littlefoot/LUMI%20Keys%20Block%20Default%20Program.littlefoot),
revision `ffb63fa3557153e07bc1e0a6b1742a2616d2a8ba`. Its MIDI handler uses
Note On velocity as the table index; Note Off or velocity zero clears the
virtual note color. The app emits indices **1..127**, with **0 reserved for
off** and **127 = white**. RGB byte SHA-256 is
`88c6418070feaecb35169c0ccdc123a391b2d7b084b9f9b8720ebeb6dde780b2`.
The existing app lookup matched this program before consolidation; it is now
shared rather than duplicated. A pressed physical key can override a virtual
key color in that program.

This source is primary implementation evidence for that archived program,
**not an official guarantee that every LUMI firmware uses this lookup**.
The [official ROLI BLOCKS SDK](https://weareroli.github.io/BLOCKS-SDK/group__LittleFootFunctions.html)
exposes RGB drawing and custom LittleFoot functions. Hardware is not limited
to this palette or to two colors. The app's existing native User-mode protocol
has separate root/global color slots; that is a protocol configuration detail,
not a hardware RGB limitation. The existing SysEx messages are documented in
the [protocol research source](https://github.com/benob/LUMI-lights/blob/ffb63fa3557153e07bc1e0a6b1742a2616d2a8ba/SYSEX.txt).
No custom program is uploaded by this change.

The official Dashboard help URL was also checked; the direct page redirected
to vendor sign-in during re-verification, so firmware compatibility is not
inferred from it. The SDK and archived program support the limited claims
above. Brightness steps, the exact per-velocity RGB, the device-id question and synth sound remain
unverified; pressed-key behaviour, config-frame wiping, hold-until-Note-Off, the hue sweep and the
24-key window were checked on the real unit (section above). The suites use simulated ports.

## Checks

`tests/note-palette.test.js` pins every lookup byte and tests supported ranges,
both blend policies, enharmonic identity, all MIDI/root pairs and storage-source
policy. `tests/colors.test.js` checks the clef selector, persistence, custom
natural edits, live built-in redraw and emitted fake-LUMI values.
`tests/midi-ports.test.js` and `tests/lumi-practice.test.js` check semantic frame
color identity without weakening ownership, scale blocking or paired cleanup.

```sh
tests/run.sh note-palette colors midi-ports lumi-practice display-master lights lumidisplay
```
