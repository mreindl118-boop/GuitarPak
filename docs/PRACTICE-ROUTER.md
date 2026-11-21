# Synth sound and the shared Scale lock

LUMI practice (the section *Notes and triads on the LUMI* on the Piano page,
below the lessons) has three independent routes: the selected keyboard
answer input, the LUMI target/feedback display output, and an optional synth
sound output. Display notes never become answers or synth sound. The sound
route follows the existing **Scale lock** switch in the treble-clef dropdown.
There is one switch for soundLAB. With it on, the route reads the selected root
and scale and forwards only Note Ons whose original MIDI pitches belong to that
scale. Other pitches are **blocked**, with no quantization, transposition or
substitute note. With the switch off, original note pitches pass unchanged.

## Starting sound

1. Enable Web MIDI and choose the answer input, LUMI display output and synth
   sound output explicitly. Sound and display outputs must differ. Native
   Android/iOS bridges do not support these independent routes.
2. Turn **Local Control OFF on the synth**, disable external MIDI Thru/echo
   routing, turn MIDI Hub Thru off, and release keys and sustain pedal. Since
   2.0 the Hub is in soundLAB Gear (`gear.html`): its Thru box is on the Hub
   page there, and the switch is saved for both apps.
   Acknowledge these prerequisites in the practice section. The app never
   changes the synth's Local Control setting. Without Local Control OFF the
   instrument's internal keyboard-to-voice path can still sound blocked keys.
3. Start the practice session, then deliberately start the scale-locked sound
   route. Scale lock applies automatically from the shared switch; there is no
   additional lock setting here. The display has its own arm control. Neither route is
   restored from storage or automatically restarted after a disconnect.

Only named synth ports qualify; LUMI/ROLI, Helix/Stadium, mixed names and obvious
virtual/loopback/Thru outputs are excluded. A synth that is the shared key-light
output with lights enabled cannot become the sound destination: first select
the LUMI for shared lights or turn those lights off. Starting the sound route
reserves its output against shared LED painting and mutes soundLAB's piano
voice to avoid doubling the hardware synth. It does not change saved MIDI
choices, lighting preferences, synth presets, program banks or credentials.

## Notes and cleanup

Allowed notes keep their exact pitch, velocity and channel, including MPE
member channels. Held notes are tracked by channel and pitch. A normal Note
Off or velocity-zero Note On releases only a note that this route attempted
to sound, even if membership is no longer allowed. Repeated ons of an already
held channel/pitch are ignored until release. Rapid re-strikes retain their
paired offs; byte-echo fingerprints never suppress an owned note's release.

Sustain CC64 is forwarded on its original channel; pedal-up still works after
all keys are released. Polyphonic pressure applies only to a forwarded held
note, and channel pressure requires a forwarded note on that channel. Pitch
bend is suppressed for this strict note-key lockout. Other CCs, program
changes, SysEx and realtime messages are not forwarded by this route.

Stop, closing the practice section, leaving the Piano page, a scale lesson or
the runner starting, app hiding, window blur, port/inventory changes and a changed
root, scale or master lock stop input subscription and disarm the route. Cleanup attempts
the original note-offs and CC64=0 only on channels used by this route. The
output lease pins the actual Web MIDI port object as well as its ID/name; a
replacement device cannot receive an earlier device's cleanup. Cleanup never
replays a shared LED frame onto the synth, and no broad panic or patch command
is sent. Failed/disconnected cleanup is reported as uncertain, retained across
repeated Stop calls, and cleared on a fresh successful start. An unplugged
device cannot receive note-offs; release any remaining voices on the instrument.

Since 2.0 the MIDI Hub and its Thru are in soundLAB Gear (`gear.html`), a
second window over the same saved settings. Thru forwards only while a Gear
window is open. The Hub lacks a complete ledger of notes it forwarded before
this route existed. Starting refuses while the saved Thru switch is on,
wherever it was switched on ("Turn MIDI Hub Thru off in soundLAB Gear and
release all keys/pedal before starting this route."), and the explicit
prerequisite to release keys/pedal prevents inheriting those unknown voices.

The switch is read at Start only, and the route in soundLAB cannot see a Gear
window. (Before Phase A, in 1.x and the live 2.0.0, the Hub was a page of the
same app and kept its Thru quiet
while the route ran; in Gear that test finds no route.) The two still do not
run together: the route stops when its window loses focus or is hidden, which
happens as soon as you click into a Gear window, so it is already stopped
before the Thru box there can be ticked; and it does not start again while
Thru is on. Nothing here rewrites the Thru switch or claims prior hardware
voices can be inferred from software.

## Loop and hardware limits

The route observes only its exact selected input, never the global outgoing
event bus. A synchronous send guard, held-note/controller duplicate guards,
short consumed controller echo fingerprints and a 1,000-message/second
excessive-input cutoff limit feedback. These protections cannot distinguish
every delayed hardware echo from a deliberate new press. External MIDI Thru
must remain disabled; arbitrary hardware loops are not proven safe. Existing
synth patch tuning, internal effects, external sequencers and physical audio
paths are outside the note-message filter. No hardware compatibility or
audible pitch result is established by the cloud checks.

## Software verification and provenance

`node tests/practice-router.test.js` uses only Node VM mocks and checks explicit
ports, excluded destinations, all twelve pitch classes across sixteen channels,
velocity-zero releases, MPE channel pairing, root/route cleanup, sustain,
original-object output binding, lifecycle stops, fast retriggers and echo/flood
guards. The LUMI browser suite exercises the actual page's separate input,
display and sound routes with fake devices. No test opens physical hardware.

The shared scale predicate is `App.scaleLock.contains(midi)`, derived from the
existing `Theory.scaleInfo` membership. The route obeys `App.scaleLock.on` on
every page, with no page exception or second lock mode. The ledger/cleanup design recovers the
principle present in `b8ccb55`'s stranded MIDI Hub work while preserving current
main's independent synth output, multi-input MIDI and lighting engine.

Runtime API: `App.practiceRouter.start({inputId, outputId, displayOutputId,
localControlOff: true})`, `.stop(reason)`, `.active`, `.state`, `.allows(midi)`
and `.validPort('inputs'|'outputs', port)`. `practice:route` carries a fresh
state snapshot for UI status. Starting and stopping are explicit session state;
no arm, port, attestation or input subscription is stored.
