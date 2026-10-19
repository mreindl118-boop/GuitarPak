# LUMI practice scaffold

This page presents note and major/minor triad targets, checks exact held answer
notes, and optionally sends temporary notes to an independently selected display
output. Physical LUMI/MODX behavior has **not** been verified. Hardware lighting
is labeled **EXPERIMENTAL / UNVERIFIED** throughout the hardware flow.

## Simulated practice

1. Open **LUMI practice** under Keys. The initial mode is **SIMULATED — NO
   DEVICE I/O**. No device choices, arm state, or test results are restored.
2. Choose Single notes, Major triads, or Minor triads, then Start session.
3. Read the highlighted reference target. Select the corresponding notes in
   **Simulated MODX answers**, then Check answer. Buttons toggle held notes;
   Release simulated answers clears them.
4. Next target advances the exercise. Preview simulated display shows an
   explicitly simulated output message and does not supply an answer.

All simulated controls are local UI state. They neither subscribe to an actual
input port nor send to an output. No MIDI permission or connected hardware is
needed for this mode.

## Exact pitches and the 24-key window

The initial window is MIDI **48–71 (C3–B4)**. Set the first MIDI note from 0 to
104 to configure any complete 24-note window. This page uses **MIDI 60 = C4**;
instrument octave names may differ. Match the physical LUMI octave to the
displayed range manually. The page never operates the device's octave buttons.

Targets are generated entirely inside this window. Chord roots are constrained
so the full triad fits. Pitches are never folded or transposed into the window.
An answer an octave away is wrong, including when its pitch classes match.
Held notes outside the window remain visible in the answer text and count as
unexpected pitches. MPE channels are tracked separately and then compared as a
set of exact MIDI pitches; sustain CC is not interpreted.

## Optional hardware workflow

Independent routing requires an enabled **Web MIDI** backend. Enable MIDI in
Settings before choosing Hardware mode. Native Android/iOS MIDI bridges do not
expose independent ports through this scaffold; their unsupported state is
shown explicitly. Simulated practice remains available.

1. Explicitly choose the **MODX answer INPUT** and, optionally, a separate
   **LUMI display OUTPUT**. Only MODX-named inputs and LUMI-named outputs
   qualify (case insensitive); mixed device names, obvious virtual/loopback
   ports, and other devices are excluded. A ROLI brand name alone does not qualify:
   Seaboard, Lightpad BLOCK, and bare ROLI ports are excluded. There is no generic-port override.
   Roles are rechecked during input callbacks, test/arm, and every send, even
   if a port keeps the same ID after a name change. No first-port fallback is used. The shared MIDI
   selections, input filter, lighting settings, and Hub Thru state are untouched.
2. Start session. Output is **OFF**, even after a previously armed session.
   Play the exact target pitches on the selected answer input, hold them, then
   Check answer. The display output is optional for grading.
3. To try display output, deliberately choose **Test selected output**. It sends
   one ordinary Note On at the lowest window note on the chosen display channel,
   followed by Note Off after approximately 300 ms. It may make a sound on a
   synth. A completed send only proves a software send succeeded; it does not
   verify device lighting.
4. Only after observing the response on the intended device, choose **I observed
   the test — arm output**. The current target, and each subsequent target, sends
   an ordinary Note On/Off pulse lasting approximately 650 ms. This generic note
   approach may not light a LUMI as expected. No compatibility claim is made.
5. Disarm output or Stop & release notes ends output. Restart requires another
   test and arm. Changing mode, exercise, port, window, or display channel stops
   the session and forgets the previous test.

This module sends only standard, in-window, channel Note On/Off messages to the
exact chosen output. It contains no SysEx, custom LittleFoot programs, program
changes, patch changes, CC/panic broadcast, or persistent hardware writes. It
does not claim or invoke the existing shared lighting engine.

Pending Note Offs retain their original output ID, channel, and pitch. Stop,
page leave, disconnect, window blur, `pagehide`, and document hiding cancel
timers, attempt those exact Note Offs, disarm, and unsubscribe answer input.
An unplugged device cannot receive a Note Off; the UI reports that delivery
could not be confirmed. Reconnection never re-arms this page automatically.

## Input isolation and service contract

The page uses only these independent routing additions to `App.midi`:

```js
App.midi.explicitPortsSupported === true // enabled independent Web ports only
App.midi.inputs                         // [{id, name}], connected ports
App.midi.outputs                        // [{id, name}], connected ports
App.midi.subscribeInput(portId, fn)       // unsubscribe function, or null
// fn receives { bytes, portId } from the exact input port, before global rules
App.midi.sendToOutput(portId, bytes)      // boolean; exact output, no fallback
```

`midi:state` refreshes inventories and exact-port subscriptions. Only a running
hardware session subscribes to the chosen answer input. Incoming callbacks also
verify the source port ID and accept only complete valid Note On/Off messages.
The grader does not listen to `midi:note`, `midi:raw`, `note:input`, or `midi:out`;
targets, outgoing display notes, and other on-screen instruments cannot become
answers through those event buses. The module emits no note/capture events.

## Integration and focused verification

The module registers `lumipractice`; the shell provides
`<section class="panel" id="panel-lumipractice"></section>`, the Keys navigation
entry, `css/lumi-practice.css`, and `js/lumi-practice.js` loaded after `app.js` and
`midi.js`, before `App.boot()`. Add both assets to the service worker manifest.
The release owner handles the shell, navigation, version, and cache updates.

Run the focused browser suite with Node and Playwright available:

```sh
node tests/lumi-practice.test.js
```

Set `NODE_PATH` and `CHROMIUM` as documented in `tests/env.js` when necessary.
The suite builds an isolated fixture with mock `App.midi` ports; no web server,
MIDI permissions, or actual devices are used. It verifies simulated mode, exact
note/chord checking, rejected global/outgoing events, separate port routing,
test/arm gating, bounded pulses, cleanup boundaries, range limits, failed sends,
unsupported native routing, and rejected wrong-role/renamed ports independently
of the UI choices. It is software evidence only. Physical port
names, octave alignment, LUMI lighting response, and MODX behavior remain for
an explicit, separately authorized hardware session.
