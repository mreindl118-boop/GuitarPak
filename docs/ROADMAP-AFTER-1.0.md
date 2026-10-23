# After 1.0: user song library and PDF learning

Authorized next-version development, queued after SoundLab 1.0 has passed its
release gates. This is not part of the 1.0 feature gate. Start a separate branch
from the verified 1.0 source; if release remains blocked, report that blocker
before beginning this implementation. Private user songs never belong in the
public source repository or release artifacts.

## Staged implementation

The branch audit found stranded Score/MusicXML and private Music Library code
at `b8ccb55` on the preserved old integration branch. Compare those actual
formats, licenses and data models before adding a duplicate library/importer;
they are candidates, not already integrated PDF recognition.

1. **Durable library and file ingestion.** Define a versioned library schema
   independent of service-worker/app caches, preferably IndexedDB for original
   file blobs and structured scores. Preserve original PDF/MIDI sources, stable
   song IDs, provenance, fingerprints for duplicate detection, explicit instrument
   and part mappings, and resumable learning state. Existing local MIDI/tab
   libraries need non-destructive adapters/migration, not wholesale replacement.
2. **PDF retention and honest viewing.** Add a deliberate local file loader and
   page viewer, with size/type validation and visible storage/quota errors. A
   retained PDF is not a parsed musical score and cannot yet drive note scoring.
   Continue supported MIDI ingestion; evaluate structured MusicXML separately.
3. **Local recognition research and prototype.** Evaluate viable OMR engines,
   licenses, browser/worker dependencies and resource limits using original or
   permissively licensed examples. Compare scanned and digitally generated
   documents. No reliability claim or automatic scored import before measured
   results. No external upload, paid service, OAuth or new credential is approved.
   Surface any necessary consent or unavailable local capability before using it.
4. **Correction and structured practice.** Present uncertain pitches, rhythm,
   accidentals, voices, repeats and part assignments for review. Keep original
   pages alongside an editable structured score. Only reviewed, supported score
   semantics enter Wait for Me/Tempo scoring, section loops and shared cues.
5. **History and resilience.** Persist per-instrument practice observations,
   section learning status and resume position by stable song/part/version IDs.
   Retain score revision history when edits could invalidate prior comparisons.

## Required evidence

Test old-to-new schema upgrades and repeated upgrades, interrupted migration,
rollback-safe backups, exports/imports, malformed files and duplicate imports.
Test quota/unavailable storage, failed writes, partial imports and recovery.
Deletion must be explicit and safe, with an undo/export safeguard as appropriate.
App/service-worker updates must not delete songs or progress. Storage code must
never clear all origin data as a cache-refresh mechanism.

Keep local processing and private blobs out of telemetry/public artifacts.
Browser persistence cannot survive a user clearing site data, loss of the device
or every browser eviction policy; provide export/backup and state these limits.
Cross-device sync is a separate, unimplemented capability.

## Navigation discussion, not an approved refactor

The current Play group contains Songs (MIDI/tab library and looping playback)
and Jam (auto-band, arrangement/mixer and live vamping). Practice contains
Woodshed (guided/legacy scoring and import), Trainer (timer/log, prompts,
chord changes and ear drills) and Tuner (tuning and note-finder game).

A future workflow could launch Practice from material, keep Jam/free playing
inside instrument workspaces, and place measured history under instrument
Progress. Preserve `sg.lib`, `jam2.*`, `ws.*`, `tr.*`, `tun.*` and existing route
and bus contracts. Moving or combining these areas is discussion only; no such
navigation refactor is included in the 1.0 addendum or this queued file work.

The separate teacher Google Doc/text lesson aide remains deferred; see
[its bounded design](FUTURE-LESSON-AIDE.md).
