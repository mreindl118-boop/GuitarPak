# LUMI guided practice

The illuminated **ROLI LUMI keyboard is the instructional display** while you
play a separate synth. Select the synth's answer input, its sound output, and the
LUMI display output independently. LUMI can optionally provide answer input too;
it is not required to be the keyboard you play. The treble-clef menu has two
independent master toggles: **Scale Lock** controls pitched sound admission,
and **LUMI Display** controls illumination. Both follow the selected root/scale.

This practice recovers the note/major-triad/minor-triad workflow from
`codex/midi-hub-release-0.78.0-20261019` at `b8ccb55`, adapting it to the current
shared MIDI service and the same sole **LUMI Display** master used by Keys
lessons, Songs, exercises and scale practice. Its advanced controls add explicit
port roles and safe test/arm controls; they do not add a second illumination
master. There is no standalone text/matrix display implementation in this slice.
Since soundLAB 2.0 it is a section of the Piano page, not a page of its own.

Physical LUMI/synth behavior remains **EXPERIMENTAL / UNVERIFIED**. All reported
validation uses cloud simulations; no hardware was connected or configured.

## Where it is: a section on the Piano page

LUMI practice has no pill and no page of its own in soundLAB 2.0. Open
**Keys › Piano** and go below the scale lessons to the section
**Notes and triads on the LUMI**. It is closed by default. If the app last
closed on the former LUMI page, it opens the Piano page and says where the
practice went.

**Open = owner, one owner at a time.** Three things on the Piano page use the
pedal and the key lights: the scale lessons, the scale runner and this section.
Only one of them is active at a time.

- **Opening the section** stops a lesson run and the runner. So does starting
  a session.
- **These close the section**, stop its session and disarm its outputs:
  starting a lesson (Start, Listen, Retry or Next level), starting the runner,
  and opening a lesson from the Practice plan or the Learn bar. The section
  folds itself.
- **While the section is open it owns the pedal.** Next and Stop act here (see
  [Hands-free control](CONTROLLER-REMOTE.md)). A press with nothing to do here
  does nothing: it never starts a lesson or the runner. The lessons'
  lowest-key double-tap stands down too. A double-tap on the lesson card
  itself starts the lesson like its Start button, so it closes the section.
- **The double-tap key.** With the opt-in double-tap key on (Settings ›
  Hands-free control) and simulated answers, the keyboard's lowest key is
  reserved on the Piano page while the section is open: it is silent and not
  graded. Close the section to get the key back. With hardware answers the key
  isn't reserved.
- **Closed, nothing changes** for the lessons, the runner, the pedal or the
  double-tap.

Leaving the Piano page, closing the section by hand, losing window focus and
hiding the app stop the session and disarm its outputs, as leaving the old page
did. The LUMI display output is still chosen in this section.

For developers: `js/piano.js` mounts the module into `#pn-lumi-body` inside
`<details id="pn-lumi">` and drives it through `App.lumiPractice` (`init`,
`show`, `hide`, `close(msg)`, `stop`, `remote`, `remoteKey`, and the getters
`open` and `running`). `open` is the fold state alone; the session only runs
while the Piano page is shown and the section is open. The `lp-` ids, the
`SLLumiPractice` test hook and the display leases are unchanged.

## Start with simulation

1. Open **Keys › Piano** and the section **Notes and triads on the LUMI**,
   below the lessons. It starts in **SIMULATED — NO DEVICE I/O**, with
   **Wait until correct** selected. Lesson input/sound choices, acknowledgements, tests, and
   armed routes are session-only. The two master toggles and the app's exact
   configured LUMI display output persist independently.
2. Choose single notes, major triads, or minor triads and start the session.
3. Use **Simulated keyboard answers** to hold notes. A partial chord waits;
   an extra note shows **× Wrong** and never advances. Release the extra note.
4. An exact target shows **✓ Correct**. Hold it for about 700 ms to advance
   automatically. Releasing early or adding a wrong note cancels that advance.
5. **Manual check and next** retains the optional explicit Check/Next workflow.

The preview labels every target/answer state as **◎ Target**, **✓ Correct**, or
**× Wrong**, with an `aria-live` feedback message listing missing/extra pitches.
Meaning does not depend on color. Simulated display preview never supplies an
answer, subscribes to MIDI, sends output, or requests permission. Existing
app-wide MIDI connections continue to obey Settings independently.

## Exact pitches and the selected scale

The initial display window is MIDI **48–71 (C3–B4)**, with **60 = C4**. Choose a
first note from 0 to 104 for any complete 24-note window. Match the physical
LUMI octave manually; this section never operates its octave buttons. Exact pitches
and octaves are graded without folding or transposition. Sustain is not treated
as a physically held answer; channel-specific note holds are tracked separately.

Generated targets contain only notes in the visible selected key/scale, in
simulation and hardware practice alike, independently of both master toggles. Triads are offered only where their
complete shape fits both scale and window. If no such triad exists, the session
stops and asks for another exercise, scale, or window. A key/scale change stops the lesson and sound
route; restart generates targets for the new selection.

Physical held notes survive target transitions until their actual Note Offs
arrive. They cannot disappear from grading because the page changed the target.
Simulated pad selection clears on advance as an explicit virtual release.

## Independent hardware routes

Enable **Web MIDI** in Settings first. Native Android/iOS bridges remain
unsupported for this section's independent routes; simulation remains available.

Choose these routes explicitly; there is no first-port or global-output fallback:

- **Synth answer INPUT:** the keyboard you physically play (for example MODX).
  Optional LUMI answer input is also available. Global/raw/output event buses
  never supply answers; the section observes only the exact selected input port.
- **Synth SOUND OUTPUT:** the synth that should sound the allowed notes.
  This route is optional and separate from the display. Select its sound output,
  start a lesson, acknowledge that you have manually set **Local Control OFF**
  and disabled external MIDI Thru/loops, release all keys and the sustain pedal,
  then explicitly start the synth sound route.
  The app does not set Local Control and cannot silence the synth's own physical
  local sound. When Scale Lock is ON, disallowed scale notes are blocked rather than
  remapped; when it is OFF, the route admits all valid note pitches. See
  `js/practice-router.js` and its tests for paired-note/sustain cleanup.
- **LUMI display OUTPUT:** the illuminated instructional board. Test this exact
  output with LUMI Display ON first (a 300 ms target), observe its physical response yourself, then
  explicitly arm it. A successful software send does not verify lighting.

Virtual/loopback, mixed-role, and unrelated ports are excluded. A ROLI brand name
alone is insufficient for display output; Seaboard and Lightpad are excluded.
The selected synth sound output cannot be the LUMI display output. Every route
is revalidated before use. No hardware route starts automatically after restart,
reconnection, or a port/configuration change.

## Instructional display frames and shared ownership

The clef menu provides the sole LUMI Display master switch. Turning it ON shows
the selected scale on the exact configured LUMI, or honestly reports that the
output is unconfigured/disconnected. It never requests MIDI permission or picks
an unrelated output by itself. An active lesson, sheet-music, exercise, or
practice target overrides this base scale, even at Help None. Turning it OFF
releases owned display notes and active display leases while synth sound and
Scale Lock remain unchanged. Existing shared guides retain their current target
for a later ON; advanced practice leases remain disarmed until explicitly tested
and armed again. **Guide focus** in lessons/Lights & help changes target emphasis,
not the master illumination state.

While armed, the target stays lit until it changes or the route is disarmed:
Every key retains its shared pitch color in Intervals or Note Names mode.
The preview uses **◎ Target**, **✓ Correct**, and **× Wrong**, with outlines
and live text so feedback does not depend on color. Target/correct/wrong
frames preserve pitch hue on the device; correctness is explicit on screen.
See [the shared palette and protocol evidence](NOTE-PALETTE.md). Wrong notes outside the
24-key display window remain in the textual grading feedback, without sending
out-of-window display notes. Hardware color appearance still needs verification.

The section does not encode a second hardware protocol. It requests semantic
frames from the existing MIDI service's temporary exact-output lease. The
service owns the LUMI velocity palette, frame diffing, original output object,
channel/pitch tracking, and Note Off cleanup. Only changed frame notes are sent.
Armed targets are sustained; only the initial deliberate test is a timed pulse.

If the display is also the app's shared lighting output, the service first
releases cached shared lights, then suspends shared note/SysEx painting on that
exact output. This prevents a target Note Off corrupting the shared scale cache.
On cleanup, it restores the **current** shared layout on the original connected
port with its unchanged name. It never replays cleanup onto a same-ID replacement
or renamed device. Failed Note Offs remain tracked for retry; an unconfirmed
cleanup reports failure instead of pretending the shared layout safely resumed.

Direct instructional frames contain only ordinary channel Note On/Off messages.
They do not send SysEx, custom programs, patch changes, or persistent hardware
writes. Resuming the existing shared layout can include its normal LUMI SysEx
mode/brightness messages; those remain governed by app-wide lighting settings.

Stop, closing the section, leaving the Piano page, a scale lesson or the runner
starting, lesson leave/change, input/output/configuration change, MIDI inventory
notification, disconnect, blur, app hide, or selected scale change cancels
queued advancement, stops synth routing, releases exact display frame notes,
disarms output, and unsubscribes answers. Unplugged hardware cannot receive a
Note Off; that uncertainty is reported. None of these events re-arms a route.

## Service contract and cloud verification

```js
App.midi.setDisplayOutput(displayId); // exact LUMI, persisted separately
App.midi.setDisplayEnabled(true);     // sole illumination master
App.midi.subscribeInput(inputId, fn) // exact raw {bytes, portId}; unsubscribe/null
const display = App.midi.leaseKeybedOutput(displayId, 'lumipractice');
display.frame({target: [60,64,67], correct: [60], wrong: [61], channel: 0});
display.clear(); // exact tracked Note Offs; boolean result
display();       // release + current shared layout restore, when safe
App.practiceRouter.start({inputId, outputId: synthId,
  displayOutputId: displayId, localControlOff: true});
App.practiceRouter.stop('Practice stopped.');
```

Run the focused checks with Node, Playwright and Chromium available:

```sh
tests/run.sh note-palette colors midi-ports display-master lumi-practice practice-router lights lumidisplay multiin
```

`tests/lumi-practice.test.js` combines isolated fixtures with the served full app,
real MIDI service and simulated EventTarget ports. It covers manual/guided flow,
partial/wrong/correct feedback, independent roles, output/answer isolation,
sustained frames, physical held notes, exact ownership/restoration, stale ports,
timers/lifecycle cleanup, separate sound routing, scale-safe targets, and phone
layout. `tests/midi-ports.test.js` verifies semantic frames and failed releases;
`tests/practice-router.test.js` verifies synth scale blocking and cleanup.
`tests/keys.test.js`, `tests/remote-keys.test.js` and `tests/remote-plan.test.js`
cover the open = owner rule on the Piano page.
These checks provide software evidence only. Physical color response, actual
port names, octave alignment, Local Control behavior, and hardware sound remain
unverified.
