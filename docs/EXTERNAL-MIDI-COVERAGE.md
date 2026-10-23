# External MIDI Scale lock coverage

Scope: soundLAB's built-in MIDI ingress and send services, the MIDI Hub and
the optional synth practice route. The existing treble-clef **Scale lock** is
the master switch. Root/scale membership is shared; rejected note-ons are
blocked, never snapped, remapped or quantized. All sixteen channels are covered,
including MPE member channel 10; channel number alone is not a drum exemption.

| Musical route | Scale lock coverage | Pairing and boundaries |
|---|---|---|
| Incoming MIDI to app sound | Shared ingress marks disallowed notes blocked/muted while preserving grading/visual evidence. Applies regardless of page. | Offs retain source/channel identity; internal audio owners handle their voices. |
| Hub physical-input Thru | Membership checked after remap/transpose/channel/conversion Rules, then at the shared output service. | Source-port/channel/input-note maps to actual sent output notes. Same target from several inputs uses a reference count; the final release stops it. |
| Hub virtual keys/QWERTY | Musical note-ons obey the same post-rule check. | Releases use stored sent notes; channel/rule/output changes clean up before accepting new mappings. |
| Hub CC-to-note rules | Generated note-ons obey output membership. | Original controller identity retains the output note; value zero releases its actual target. |
| Hub raw hex note messages | Shared service parses every complete message, including packed/running-status streams and notes after realtime prefixes. | Shared musical output ledger owns raw notes and exact original output objects. |
| Public `App.midi.send`, `sendTo`, `sendToOutput` and generic lease `send` | All musical note-ons use the shared gate. Calling a low-level public API is not a scale-lock escape. | Shared output ledger tracks actual successful sends and sustain by destination/channel; cleanup pins original Web MIDI objects. |
| Optional practice synth sound | Follows the same master switch; no separate lock mode. | Explicit source, synth output and display output; source/channel ledger, independent arm state, cleanup on boundaries. |
| Semantic key lighting: `light`, `dark`, guide/reveal and lease `frame` | Explicit visual exemption only on an identified LUMI display. Instruction and wrong-answer LEDs remain visible even for an out-of-scale answer; generic synth destinations still receive musical filtering. | Private LED sends are kept distinct from musical sends. Practice display and synth sound reserve different outputs. |
| SysEx, program/bank/configuration CCs and realtime clock/transport | Explicit protocol exemption, not a musical-note exemption. A raw buffer containing note messages still has every note parsed/gated. | Configuration bytes remain unchanged; Stop additionally releases tracked musical notes and sustain. |
| Native Android/iOS shared MIDI backend | Shared musical send/ingress gating applies. | Native bridges cannot support the independent three-port practice workflow; that UI remains unavailable rather than selecting a fallback. |

The Hub flushes tracked musical outputs and discards old source mappings when
rules, channel, output or Thru mode change, on root/scale/lock boundaries and
on Stop, page leave, blur, hiding or MIDI inventory changes. Cleanup uses note
offs and sustain-off on original used channels, not a blanket panic. A failed
or disconnected send cannot establish actual hardware silence. Existing explicit
user-operated Panic remains a separate feature.

The physical synth must have **Local Control OFF** for software note lockout to
control its internal sound. Disable external MIDI Thru and release keys/pedal
before starting an explicit practice route. soundLAB never changes that hardware
setting. Its filter cannot control independent sequencers, patch tuning or
audio paths already inside the instrument.

Arbitrary user-loaded JavaScript plugins that create their own `AudioContext`,
obtain MIDI access and call a physical port directly are outside the shared
service contract. The bundled lo-fi plugin uses the shared DAW path. The
stranded Helix branch is not loaded into this integration; no hardware bridge
or unreviewed plugin is silently enabled.

Tests: `tests/midihub-lock.test.js` exercises the actual Hub and MIDI service
with fake EventTarget ports, including post-rule membership, all channels,
same-name multi-input collisions, MPE releases, rule changes, sustain, Stop,
packed raw streams and protocol exemptions. `tests/midi-ports.test.js` covers
the shared sender's output-object/lifecycle contract; `tests/practice-router.test.js`
covers the explicit sound route and master switch. These are cloud simulations,
not hardware validations. Internal engines and previews have their own coverage
in the overall Scale lock audit.
