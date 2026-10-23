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
above. Physical RGB calibration, brightness, pressed-key overrides, firmware,
24-key octave alignment and actual synth sound remain **hardware unverified**.
All reported tests use cloud browser/VM ports and simulations.

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
