# Global Tuner

The header Tuner button opens the existing tuner over the current page. Opening it does not start listening. The old `tuner` route opens the same drawer; there is one tuner controller and one set of `tun-*` controls.

Press **Start listening** to analyse the audio input chosen in Settings. Tuner never turns Hear Input on. It retains A4 calibration (415–466 Hz), string-guide tunings, octave-labelled reference notes, the cents meter and the six-string note-finder game. Flat, in-tune and sharp feedback includes text and numeric cents. The microphone button, references and game controls support normal keyboard activation; shortcuts do not override focused controls.

Tuner shares `App.audioIn` through its own `tuner-analysis` hold and analyser edge. Stop, close, navigation, app hide, device loss and a competing transport claim release only that owner. Other input consumers and Hear Input remain intact. The service closes its stream when no remaining consumer or monitor needs it. Tuner does not call the shared hard-off API, disconnect the shared source broadly, or stop shared tracks directly.

Pending requests carry a generation identity. A canceled result cannot reopen listening, clear a newer same-tag hold, or stop another consumer's stream. Device changes require an explicit new Start. Tone Input is suspended through an owner-scoped lease while tuning and retains its existing manual-restart behavior afterward. Starting Tuner claims the musical transport so backing playback does not become a tuning target. Closing the drawer does not automatically resume a practice attempt.

Reference chips use the existing calibrated `App.pluck` route and shared Scale Lock rules. The tuner remains an analyser; it does not mute acoustic sound or a synth's direct local audio path. The note-finder remains a guitar string/fret exercise.

Run the focused browser checks against a local HTTP server:

```sh
CHROMIUM=/usr/bin/chromium SL_URL=http://127.0.0.1:4593/index.html node tests/tuner-sheet.test.js
```

The test replaces capture with WebAudio-generated `MediaStream`s and exercises the actual tuner, detector, shared input service and drawer. It covers passive open, source ownership, exact device selection, pending close/reopen races, other shared consumers, calibration, text feedback, keyboard controls, themes, mobile widths and persisted settings. These are cloud simulations. Physical microphone/interface compatibility and actual hardware tuning accuracy remain unverified.

`App.tuner.state` is a read-only snapshot for integration checks (`listening`, `pending`, `deviceId`, `visible`, `a4`, `tuning`, `pitch`, `error`); `App.tuner.stop()` releases this owner's capture. They do not expose or grant permission to a hardware stream.
