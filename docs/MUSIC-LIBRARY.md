# Local music library

The Library retains original PDF, raster image, MIDI, XML/MusicXML and MXL files in this browser. It sends no files to a server and has no audio or MIDI device writer. Score review offers deliberate **notation recognition beta** for one selected monophonic treble or bass staff on one page at a time. Compare with the source, correct mistakes and explicitly review before practice; retaining a PDF alone does not recognize its notes. A filename chooses the original's kind; retaining a file does not certify that its contents parse or contain playable music.

Open **Library → Music library**, add an original, then open source review. PDF viewing, local notation recognition with mandatory review, target editing and the supported MusicXML parser belong to Score review. Full piano, polyphonic, multistaff, scanned-score and whole-multipage recognition are outside this beta; see [recognition limits](LOCAL-RECOGNITION.md). **Create draft from MIDI** uses the current strict `Woodshed.importMidi(ArrayBuffer, filename)` reader; the original and importer warnings remain intact. Compressed MXL originals can be retained and downloaded but are not unpacked by this review workflow. Unsupported images remain downloadable even when the browser cannot preview them.

Draft revisions cannot launch graded practice. Checking the source and explicitly reviewing creates another immutable revision. The original, draft, spelling, source anchors and earlier reviewed versions remain available. A rhythm-unconfirmed manual target set is for Wait mode; it does not claim measured original timing. The launch service reloads and validates the selected original/revision before opening the current player.

## Storage and recovery

Database: `soundlab.music-library`, schema version **2**. The upgrade retains all version 1 `items`, `originals` and `derived` stores and their data. It adds `revisions`, `selections`, `history`, `resume` and `trash`. No version 1 validation claim is converted into a reviewed practice revision.

Original bytes use `add`, never replacement. Revisions are also append-only, with a source SHA-256, immutable payload checksum, version, parent identity and review state. Metadata, named sections, mappings and resume setup can be edited separately. Item metadata and selections support optimistic revision checks so a stale tab cannot silently overwrite an explicitly versioned edit.

Limits: 20 MB per original, 50 originals and 100 MB of original/legacy derived bytes including Recently removed. JSON records are bounded to 4 MB; revision/selection/history counts are also bounded. Browser quota can be smaller. Quota/denied-storage failures abort the transaction and report failure; they never become a false saved-original message. A blocked upgrade asks for other library tabs to close and can be retried. This is browser storage: private-mode restrictions, site-data clearing and storage eviction still require exported backups.

Removal requires explicit confirmation. It moves the item to Recently removed, retaining bytes, all versions and sidecars for **Undo removal**. It does not reclaim storage. This version offers no permanent purge; export a verified backup before clearing browser site data yourself.

## Backups

**Export full library backup** downloads a versioned JSON archive (`format: soundlab-music-library`, `version: 2`). It includes original bytes as base64, all legacy derived byte records, immutable revisions, named selections/mappings, successful material-practice history, resume setup and Recently removed records. Originals/legacy derived files are checked by SHA-256, and revisions have content checksums. This is separate from the Settings/sampler archive. Legacy branch ZIP backup files are not accepted by this JSON importer; existing version 1 browser data is upgraded directly without rewriting it.

Import validates the entire archive and its references before opening the single write transaction. It merges without replacing local originals or mutable local state. Matching records are skipped for idempotence. Immutable ID conflicts and forked revision-version conflicts reject the whole import. Separate IDs containing a source already present require an explicit **keep separate copies** choice. A removed-state snapshot cannot remove an active local item by importing its recovery record.

The exported JSON is readable private data, including original files and practice history. Keep the downloaded archive somewhere durable. This module does not upload it or promise encryption/account synchronization. Download completion remains the browser's responsibility.

## Practice history and resume

The player emits `performance:session` after the canonical practice record is accepted, with `{recorded:true, material:{kind:'library',itemId,revisionId}, session}`. The library persists a material-history sidecar idempotently by canonical `session.id`; it never awards XP or changes canonical metrics. If this separate IDB write fails, the exact event is retained under `guitarlab.library.pending.v1`, with verified readback and visible Retry/Export pending-history controls. If recovery storage also fails, the event remains exportable in the tab and reload checkpoint fails. Pending-history JSON exports can be restored through Import library backup and retried without awarding XP. The original canonical XP session remains recorded.

A saved setup pins an immutable revision, named section, mode, tempo, instrument and optional part mapping. Resume means **a new attempt from the saved section start**, not restoration of held notes, a running clock or a partially graded attempt.

## API

Global `SLMusicLibrary` is available synchronously; storage methods are asynchronous.

| API | Result / rule |
| --- | --- |
| `ready()` | Opens the upgraded database or reports blocked/unavailable storage. |
| `addOriginal(file, {metadata, duplicate?})` | File input; `duplicate:'keep'` explicitly preserves a separate copy. Also accepts `{filename,bytes,metadata}`. Duplicate refusal has `code:'DUPLICATE'` and `matches`. |
| `listItems({includeDeleted?})`, `getItem(id)`, `getOriginal(id)` | Metadata and a fresh `Uint8Array` copy of immutable original bytes. |
| `updateMetadata(id, data, {expectedRevision?})` | Metadata only; optional stale-write guard. |
| `saveRevision(id, data)`, `addRevision(id, data)` | Append immutable draft by default. Bounded plain JSON extras such as `editor`, `notation`, `parts`, `rhythmKnown` and anchors are preserved. |
| `listRevisions(id)`, `getRevision(id, revisionId)` | Revisions ordered by ascending version; last is newest. |
| `reviewRevision(id, revisionId, {verified:true,note?})` | Appends a reviewed copy with parent and source identity; does not mutate its draft. |
| `saveSelection(id, {id?,name,revisionId,section,mapping?,mode?,tempo?,instrument?,expectedVersion?})` | Revision-pinned named setup; section is `{startBeat,endBeat}` in score beats. |
| `listSelections(id)` | All named setups for an original. |
| `saveResume(id, {revisionId,selectionId?,section?,mode?,tempo?,instrument?,beat?})`, `getResume(id, revisionId)` | Last setup for that revision; fixed restart policy. |
| `recordPractice(id, revisionId, canonicalSession)`, `getPracticeHistory(id, revisionId?)` | Idempotent sidecar; no XP write. |
| `addHistory(id, data)`, `listHistory(id)` | Bounded immutable local observations. |
| `removeItem(id, {confirm:true})`, `restoreItem(id)` | Reversible removal/undo; bytes remain retained. |
| `exportBackup()`, `validateBackup(archive)`, `importBackup(archive,{mode:'merge',duplicates?})` | Complete validated atomic library archive; duplicate preservation uses `duplicates:'keep'`. |
| `pendingHistory()`, `exportPendingHistory()`, `importPendingHistory(archive)`, `retryPendingHistory()` | Recovery for material-history writes, separate from canonical practice metrics. |
| `checkpoint()` | Waits for admitted writes, refuses while file reading/import is in progress, metadata edits are unsaved or recovery is only in memory. |

Page events are `library:review {itemId,revisionId?}` and `library:practice {itemId,revisionId,selectionId?,resume?}`. `library:change` reports saved operations and storage recovery failures.

## Provenance and checks

The immutable-original/IDB and validated backup foundation was selectively recovered from GuitarPak commit `b8ccb55`, `js/music-library.js`. Its old shell, player, parser, sound/MIDI behavior and hard-delete implementation were not imported. The current implementation uses an additive schema upgrade, append-only review revisions, reversible removal and JSON atomic merge backups. Current MIDI parsing stays in Woodshed.

Run `CHROMIUM=/usr/bin/chromium SL_URL=http://127.0.0.1:<server>/index.html node tests/music-library.test.js`. Tests use real IndexedDB and cloud Chromium fixtures, including version 1 upgrades, full backup/reload restore, corruption/duplicate/conflict rejection, quota rollback, blocked/unavailable storage, file-input UI and recovery checkpoints. They do not validate physical hardware.
