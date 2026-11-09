# Guided performance

Open **Practice → Woodshed → Guided performance**. **Melody and rhythm** and
**Chord journey** generate original exercises in the treble-clef menu's selected
root and scale. Library rows offer **Wait for Me** and **Play at Tempo** for
generated scales, imported MIDI, Studio tracks and pasted ASCII tab.

The player works without a physical keyboard or LUMI. Its piano roll, current
notes, **Coming up**, playable keyboard and optional LUMI targets share one
performance state. Text, note names and **● Target / ✓ Correct / × Wrong**
symbols provide feedback alongside color.

## Playing a run

1. Choose a mode, tempo and optional **4- or 8-beat count-in**. Both modes show
   the first target during count-in; count-in attacks are not graded.
2. Play the on-screen keys, type **A/W/S/E…** for the first displayed octave,
   or enable MIDI and choose **Performance input** under **Section and input**.
   A separate synth can supply answers while LUMI supplies the display. Keyboard
   view changes the virtual register; it does not transpose the score.
3. **Start** begins a run. **Pause / Resume** preserves its musical position;
   release held keys before resuming, and re-enter a partially held chord.
   **Restart** clears the attempt and starts the selected section again.
   **Stop** releases tracked input/sound and keeps the stopped position visible;
   the next Start begins a new attempt.
4. Choose a section with **From beat / To beat**, then optionally **Loop
   section**. Displayed beats start at 1; the end boundary is exclusive. Configure
   mode, section, transposition and count-in before starting. Tempo can change
   during a run without moving the playhead abruptly. Changing it clears held
   sound, so release and rearticulate any keys.

| Mode | What advances | What is measured |
| --- | --- | --- |
| **Wait for Me** | Hold every exact target pitch together, with no extra physical key held. Wrong or partial chords wait. Repeated pitches require a fresh release and attack. Explicit gaps between targets run on the beat clock. | Exact notes and complete target groups; no timing grade or held-duration grade. After a correct answer the next onset is selected, skipping the answered note's hold duration. |
| **Play at Tempo** | The beat clock continues through correct notes, mistakes and rests. Match each exact note onset within **±120 ms**. | Perfect / great / good onset grades, early/late offsets, misses, extra/wrong attacks, complete groups and separate hold measurements. A rolled chord can qualify when each onset lands within the window; simultaneous physical holding is not required in this mode. |

Pitch and octave must match the score. A note held across repeated targets or
held on another input channel cannot supply a fresh attack. Sustain keeps
sound/duration state but does not replace physical rearticulation. In Tempo,
the active display follows written note durations even after an onset was
matched. Rests have no active target; Coming up retains the next score notes.

Completion shows accuracy, notes matched/missed, wrong/extra attacks, complete
target groups, timing and hold samples. Accuracy penalizes unmatched expected
notes and extra attacks; hold measurements are separate. Completed summaries
are saved locally, up to 30 runs. **Stop** shows **partial results**, including
**pending** notes; it does not manufacture misses or mark the piece completed.
Loop statistics accumulate across passes and include pending notes in the
current pass. Stop, navigation and unfinished loops do not save a completed
summary. This player does not claim the older Woodshed modes' XP/Ideas export
behavior.

## Sound, display and color

The treble-clef menu has independent **Scale Lock** and **LUMI Display** master
switches. Scale Lock blocks disallowed sound notes rather than remapping them.
Grading observes the original input **before** Scale Lock and sound-routing
filters, so a muted wrong note still counts as a mistake. The player warns when
the score or transposition contains pitches outside the selected scale.

Virtual key sound uses the guarded DAW synth. Hardware MIDI sound uses existing
app/Hub routes; this player does not create another external MIDI writer. To
lock out an external synth's own engine, its **Local Control must be OFF** and
external echo/Thru routing must be disabled manually. Software cannot suppress
the synth's direct physical keyboard-to-engine path. See
[PRACTICE-ROUTER.md](PRACTICE-ROUTER.md) for independent synth routing.

LUMI is optional. Select its display output separately from the performance
input. Turning the sole display master off leaves on-screen practice available;
turning it on restores the current instruction. Structured targets override the
base scale layout. Display notes never supply performance answers. Shared
lighting folds pitches into the LUMI window, while grading still requires the
score's exact synth octave. See [LUMI-PRACTICE.md](LUMI-PRACTICE.md) for display
ownership and the separate Keys → LUMI practice workflow, and
[FEATURE-COVERAGE-2026-10-23.md](FEATURE-COVERAGE-2026-10-23.md) for context and
routing coverage. The performance roll and keyboard use the shared pitch
palette; its editor and color modes are documented in
[NOTE-PALETTE.md](NOTE-PALETTE.md).

Pause/stop, leaving the page, lost focus, hidden app, input changes and selected
root/scale/lock changes clear owned sound and display targets. Input disconnect
releases that source and pauses a selected-source run. Reconnect preserves the
input identity and requires deliberate resume; it does not start playing for
you. Unavailable hardware cannot receive a cleanup message.

## Source limits

- **MIDI files:** formats 0/1 with quarter-note tick timing. Pitches, beat
  positions, durations, velocities and leading/internal/trailing rests are
  retained. Practice uses a constant initial tempo: the last beat-zero tempo,
  or 120 BPM when absent. Later tempo changes are reported but not followed.
  SMPTE timing is unsupported; malformed files are rejected. Imports stop at
  1,500 notes with a warning. Controllers, programs, bends, lyrics and other
  metadata are not performance targets. Mixed-file channel-10 percussion is
  excluded from pitched material; percussion-only imports remain identified.
- **Studio:** existing note pitches, positions, durations and velocities are
  copied at the shared tempo. Recorded audio clips are not transcribed.
- **ASCII tab:** standard tuning, frets 0–24 and aligned chord columns provide
  pitches. Onset groups become even eighths with approximate holds; rhythm,
  rests and techniques are not inferred. Timed results therefore describe the
  assumed grid, not the original performance.
- **PDFs, images, audio and prose:** no parsed targets are invented. Written tie
  marks are not interpreted: supply one sustained note per tied pitch.
  Duplicate simultaneous pitches count once. Overlapping repeated pitches
  retain onsets but have ambiguous hold scoring disabled. Zero-duration notes
  are onset-only; invalid or out-of-range transposed notes are omitted with
  warnings. Practice tempo is limited to 20–300 BPM. Source warnings appear in
  **Source details and scoring limits**.

## Developer contract and verification

`js/performance-engine.js` is a DOM/audio/MIDI-independent state machine.
`PerformanceEngine.normalizeScore(score, {transpose})` groups exact simultaneous
pitches. Construct an engine with `{score, mode: 'wait'|'tempo', tempo, countIn,
clock, section: {startBeat, endBeat, loop}, onChange}`; beats are zero-based.
Call `start`, `tick`, `input`, `control`, `pause`, `resume`, `restart`, `stop`,
`setTempo`, `setSection`, `setTranspose`, `releaseInput` and `snapshot` as needed.
Input includes `{midi, on, velocity, channel, source}`; velocity-zero Note On is
a release. CC64 is channel/source-specific. `snapshot()` exposes current and
upcoming groups, duration-based `activeNotes`, held/sounding input, phase,
progress, results and warnings. The default player clock is the shared
AudioContext clock, polled every 25 ms; tests inject a monotonic clock.

`Woodshed.performanceStart(score, mode, options)` opens the UI in Woodshed.
`PerformancePlayer` owns virtual sound, the raw MIDI listener and lifecycle;
its exported `snapshot()` and `engine` support review/tests. It publishes
targets only through `App.midi.guide`, uses `App.colors.forPitch`, and emits
`performance:cleanup` to release the shared piano voice. Raw decoding preserves
per-port status/fragments, channel pairing, interleaved realtime and sustain;
display output events are not answer input.

Run `tests/run.sh performance-engine performance-import performance
performance-safety lumi-contexts` with Node, Playwright and Chromium available.
Focused results recorded during integration were **75 core**, **55 import**,
**31 full-browser**, **24 independent safety** and **36 context** checks; use
the final validation report for the exact final-run counts. This engine grades
raw arrival against its clock; it does not apply the older Woodshed `ws.cal`
latency calibration. Tests use synthetic
MIDI files, simulated ports/clocks and browser rendering. Web MIDI hardware,
native iOS/Android device behavior, real timing latency, physical color/octave
response and audible external lockout remain unverified. The separate
Keys → LUMI independent port leases are Web MIDI-only; native bridge support
must not be inferred from the player sharing the app's raw event API.
