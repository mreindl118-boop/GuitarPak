# SoundLab 1.0.0 — web/PWA

This release consolidates selected stranded practice functionality into the
verified GuitarPak baseline while preserving source branches and provenance.

- **Guided performance:** Wait for Me follows exact notes/chords and physical
  rearticulation; Play at Tempo keeps time and reports matched, missed,
  wrong/extra notes, onset timing and separate hold measurements. In-app piano
  roll, target keys and upcoming notes remain usable without LUMI. Includes
  count-in, pause/resume/restart, tempo, transposition and section loops.
- **Real score sources:** original generated scale/melody/chord exercises,
  Studio note patterns and bounded MIDI/ASCII import. MIDI preserves beat
  positions/durations with an explicit constant initial practice tempo; ASCII
  rhythm is approximate. PDFs/images/prose are not transcribed.
- **Independent clef controls:** one Scale Lock, one LUMI Display master, and
  Intervals / Note Names colors share the existing root/scale. Built-in pitched
  audio and musical MIDI admission obey the same lock, with paired cleanup.
  Raw wrong answers remain visible to scoring before sound filtering.
- **Instructional displays:** lessons, generated sheet/Tab exercises,
  pitch-bearing quiz questions, scale practice, Songs and the guided player
  publish actual targets through shared display ownership. Screen and emitted
  pitch colors use one quantized, documented LUMI program profile, including
  natural-anchor accidental blends and non-color feedback.
- **Instrument inputs:** MIDI/USB-MIDI supports exact chords; local
  monophonic audio through USB/direct interfaces supports confident single
  notes, range/reference tuning, repeated plucks, silence and manual delay
  compensation. Audio chords are incompatible; choose a labeled arpeggio
  adaptation or MIDI pickup. Capture requires deliberate action and is not
  uploaded or monitored by the detector.
- **Progress:** separate instrument histories, measured engaged minutes,
  weighted raw accuracy/timing, observed tempo, daily goals/streaks, immutable
  lifetime earned XP and configurable consistency XP/decay. Calendar, grace,
  vacation, rate/cap/floor settings, charts, export and failed-save recovery
  preserve history without a destructive migration.
- **Release safety:** CI tests the exact deployed source. Pages snapshots
  append to deployment history with ordinary pushes and stale-source checks.

## Capability and validation limits

Hardware LED response/program/firmware, physical input latency/noise, drivers
and synth Local Control remain unverified by cloud simulations. The mapped
palette is an archived LUMI program profile, not a guarantee of calibrated
screen/LED appearance or every installed firmware. Software cannot suppress
an external synth's direct local sound, acoustic sound or opaque recorded
audio. Arbitrary JavaScript plugins can bypass shared guarded APIs.

Audio practice is monophonic and may reject distortion, noise, unstable bends
or ambiguous octaves. It does not perform polyphonic transcription, pitch
shifting or direct guitar muting. Manual timing calibration is required for
real devices. Google Docs/teacher-plan integration remains deferred.

See [validation](VALIDATION-2026-10-23.md), [capability coverage](FEATURE-COVERAGE-2026-10-23.md)
and [release gates/rollback](RELEASE-1.0.0-CHECKLIST.md). The native APK channel
remains **0.75.0**; no new APK/IPA, firmware or signed wrapper is claimed.
