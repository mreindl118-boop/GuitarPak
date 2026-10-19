# Browser-local music library

This small library lives inside soundLAB's existing browser origin/profile.
It stores user-supplied originals privately in IndexedDB; it does not upload,
sync, share, recognize notation or contact MIDI hardware. No new dependency is
required. Filename extensions are format hints, not file validation evidence.

## Files and metadata

Original PDF, raster image, uncompressed MusicXML/XML, compressed MXL and MIDI
files are retained byte for byte with filename, size, MIME hint and SHA-256.
The `originals` object store holds these bytes separately from item metadata.
Metadata edits and derived versions never rewrite originals. Downloads use
the original bytes; `getOriginal()` returns a copy rather than a mutable store
reference. Identical uploads remain separate items.

Explicit metadata fields: title, composer, arranger, instrument, key/signature,
time, tempo (including stated beat unit), tags, source/attribution,
license/rights statement and provenance notes. Blank fields are JSON `null`;
unknown values are never inferred from the filename. A filename can be the
list's display fallback without becoming a musical title. User statements are
marked as such; saving metadata does not validate music. Metadata revisions
increment and append evidence.

After a successful limited Score check, **separate source declarations** retain
explicit MusicXML title, composer/arranger and instrument-name declarations;
numeric tempo changes with quarter-note positions; meter changes; and literal
key fifths/mode changes. No tonic/key name is inferred. Missing mode, composer
or instrument stays unknown. Score playback defaults (such as 120 BPM when no
numeric tempo exists) do not become source metadata. Change-map positions use
quarter-note beats, not denominator beats.

## Honest processing states

- **Uploaded / not validated:** retained original; no musical check.
- **Needs recognition / none performed:** PDF or image retained; original
  preview is only a browser rendering. No OMR/photo/PDF/audio transcription is
  implemented.
- **Needs correction / unsupported preview:** the original MusicXML was
  rejected by the bounded Score subset checker. The error is recorded; this
  can mean an unsupported structure rather than a bad source file.
- **Validated for limited Score subset:** the actual Score parser accepted the
  original XML and generated a MIDI version. Evidence states the engine,
  original SHA, output version and limitations. It is not visual proofreading,
  full MusicXML validation, expression preservation or an OMR accuracy claim.

Only uncompressed UTF-8 MusicXML has an implemented processing path. It uses
the subset and limitations in [SCORE.md](SCORE.md). Each successful explicit
check appends an immutable MIDI version (v1–v10), never overwriting a prior
output. Versions retain their original-file hash, output hash and provenance.
Only pitches, rhythm, numeric tempo and meter are exported. MXL/MIDI originals
can be stored/downloaded but are not decoded, recognized or converted.

## Backups and portability

Export one item or the whole library as a standard ZIP **STORE** package:

- `manifest.json`: schema/version, file paths/hashes, explicit metadata,
  source change maps, processing evidence and available derived versions.
- `items/<id>/original`: the exact original bytes; the original filename and
  type are recorded in the manifest.
- `items/<id>/midi-vN.mid`: actual available derived outputs, not placeholders.

Import accepts this bounded soundLAB package format only, with no encryption,
compression, ZIP64 or foreign archive conversion. It checks ZIP structure,
CRC, entry counts, duplicate/traversal paths, sizes and SHA-256, and checks
derived MIDI's link to the original hash. It rejects unlisted files and commits
all imported items atomically. This establishes byte integrity, not authorship
or musical correctness. Packages contain private originals and metadata; they
are ordinary user downloads, not a publish/share mechanism.

Imported items receive new local IDs. Explicit user metadata and file bytes
roundtrip. Source declaration/change-map metadata is retained as an **unverified
package claim** until a local check reconstructs it from the original. Prior
validation status is recorded in import evidence, then downgraded to uploaded
(or needs recognition for PDF/images). Imported derived versions remain
downloadable, clearly labeled unverified. A new local check appends the next
version. Importing a package never overwrites existing originals/items.

## Local storage limits

App limits: 20 MB per original, 50 items, 100 MB total original/derived file
bytes, ten derived versions per item. Backup imports are capped at 120 MB;
metadata/history also consumes browser quota. Browser quota may be lower and
writes can fail. The page reports available quota estimates when supported.
Capacity is rechecked inside the committing IndexedDB readwrite transaction,
including other tabs' committed items. Revision checks reject stale metadata,
validation or deletion writes; originals/derived records use add-only writes.
Concurrent checks cannot overwrite an existing derived version. A stale-tab
error asks the user to retry the action against the current item.

IndexedDB is tied to the exact browser origin/profile; changing host, protocol,
port, app wrapper or browser does not automatically migrate it. Private mode,
browser data clearing, profile removal or eviction may remove everything.
There is no account backup, cloud sync or persistence guarantee. Export and
retain ZIP backups before clearing storage or changing environments. Remove
requires an explicit UI confirmation and deletes the selected original,
metadata and local derived versions from this library only.

## Wiring and verification

Load `css/music-library.css` and `js/music-library.js` after the Score script
and before `App.boot()`. Add page ID `musiclibrary`, panel
`<section id="panel-musiclibrary" class="panel"></section>` and navigation.
The module registers itself. `SLMusicLibrary.module` also supports test-time
`App.addPage`. `Save open Score` retains imported Score original bytes, or the
created Score's actual generated MusicXML. `Open in Score` uses the original
bytes and the real subset parser; it does not mark an item validated by itself.

`tests/music-library.test.js` runs with the existing Node/Playwright/Chrome
test environment and a served app (`SL_URL`). It uses only tiny fixtures
authored/generated for testing, never user copyrighted files. Tests check
immutable bytes, metadata/unknown values, reload persistence, source change
maps, append-only MIDI versions, scoped states, independently read ZIP export,
backup import roundtrip and corrupt/unsupported packages. Browser simulation
does not establish hardware behavior or recognition accuracy.
