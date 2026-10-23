# Settings, sampler backup and recovery in 1.1

The web app retains its existing `guitarlab.*` names. The additive registry in
`js/storage-manifest.js` records built-in owners and dynamic families; it is not
a deletion list. Unknown and legacy records remain in place, and backups include
their exact stored strings. No automatic migration rewrites earned history.

## Save acknowledgement and recovery

`App.store === App.persistence`. Existing synchronous `get(key, fallback)` and
`set(key, value)` calls still work, including unbound aliases. `set` also returns a
verified result; owners of important records should inspect it.

- `read(key)` returns `ok`, `missing`, `corrupt`, `unsupported` or `unavailable`,
  with the actual durable `raw` string and revision. It never reports a session
  overlay as durable storage.
- `write(key, value, {expectedRevision})` synchronously verifies stored bytes.
  Revisions are opaque strings. This is an optimistic conflict check, not atomic
  compare-and-swap across browser processes.
- A failed ordinary preference is retained in a visible, unsaved session overlay.
  A normal `get` may use that choice for the current session. `retry()` attempts
  ordinary preferences again; closing before saving/exporting can lose them.
- Canonical history, observations, pending session queues and material session
  sidecars require strict readback. Their reads never use the overlay. Original
  observation/session owners retain their retry payloads and use the same IDs.
  Generic persistence does not award XP or retry stale whole-history snapshots.
- Malformed JSON and unsupported known schemas are retained byte for byte.
  Ordinary callers can render a fallback, but automatic setters cannot replace
  the original record. Unsupported canonical practice history fails closed.
- `status()`, `subscribe(listener)` and `store:status` expose pending ordinary and
  strict keys, pending sampler bytes, typed issues, recovery and reload state.
  `checkpoint()` flushes known sampler retries and refuses an unresolved failure.

Settings provides explicit JSON repair for a selected corrupt/unsupported record.
It validates the replacement and durably quarantines the original bytes before
saving. A different practice-history schema cannot be downgraded there. Raw
recovery export remains available if normal archive validation cannot proceed.

## Two explicit archive scopes

**Settings → Export settings + sampler** downloads `soundlab-settings`, version 1:

- all persisted `guitarlab.*` records, including unknown/legacy keys, except
  persistence's own reserved journal keys;
- original `ArrayBuffer` sample records from `guitarlab-daw` / `samples`, including
  orphan sample records, with base64 encoding and SHA-256 verification;
- current unsaved ordinary preference/sample choices when the UI requests them.
  Unconfirmed canonical whole-record candidates remain diagnostic, not activated.

**Music Library → Export/Import archive** is a separate versioned archive owned by
`js/music-library.js`. The Settings link opens that page. Settings does not claim
to back up Music Library originals/revisions, native preferences, OS permission
choices or browser permissions. Export both archives when both contain work.

“Export unsaved changes” is a partial importable settings/sampler bundle plus
recovery diagnostics. “Export raw recovery records” preserves malformed strings,
quarantine and journal information; it is not a complete sampler/library archive.

## Reviewed import, journal and rollback

Import accepts the versioned settings format and recognizes the old settings-only
`{app: 'soundLAB', keys: ...}` format with a scope warning. Size, prefix, duplicate
keys, JSON, known schemas, sample adapters, base64 and SHA-256 are checked before
activation. Unsupported archives leave saved data unchanged. Enabled restored
plugin code is disclosed during preview because it runs on the following launch.

Preview shows added/replaced records and sample counts. Applying it deliberately
calls `App.checkpoint({reason: 'settings-import'})` to finalize active work. Only
unrelated checkpoint writes may rebase an unchanged preview; a changed imported
target requires another review. Import merges unrelated settings/samples and
refuses to remove or rewrite any existing immutable practice session.

The importer saves and verifies a complete before-snapshot in IndexedDB
`soundlab-persistence` / `snapshots`, then writes an owned phase journal in
`guitarlab.__persistence.journal.v1`. It applies samples and verified local records,
then records completion. Sequential localStorage and IndexedDB writes are **not
one atomic transaction**. Failure uses the durable before-snapshot for compensating
rollback. A quota/crash during rollback leaves the journal visible and blocks
normal writes; recovery can be retried or raw data exported. Recovery checks the
snapshot against its journal and verifies sample hashes before restoring bytes.

A freshly loaded app does not perform an unlocked rollback in a constructor.
Startup registers storage adapters, obtains the recovery coordinator and resolves
an interrupted journal before opening the app. A successful recovery requires a
fresh load so modules cannot retain data read before rollback. A malformed or
future journal is retained and blocks startup rather than guessing a reset.

The prior verified before-import archive remains downloadable. Neither import nor
rollback deletes unknown records from the original snapshot. A failed explicit
migration uses this same journal path. `migrate({id, from, to, transform})` requires
a pure archive transform and stores an idempotent schema marker; 1.1 does not
silently run speculative migrations at boot.

## Concurrent tabs and supported storage capability

Browser import, recovery, full settings/sampler export and public sampler writes
use one same-origin Web Locks coordinator. The importer repeats complete durable
revision and immutable-history checks after asynchronous backup work, immediately
before activation. Two stale previews cannot both import competing practice
histories. Every journal mutation verifies its owner. Ordinary synchronous
`App.store.write` reads the live journal and refuses a foreign active transaction;
its unsaved input is retained. A preexisting tab seeing a completed import requires
reload before saving. New tabs never roll back another tab's active transaction.

Browsers without Web Locks fail closed for these asynchronous storage transactions
and expose an error; raw recovery export remains possible. The pure Node tests use
a shared in-process queue for injected test stores only. This is not a browser
cross-tab fallback. Direct writes by old app versions, custom plugins or other
code that bypasses these APIs cannot participate in the coordinator. LocalStorage
ordinary writes retain their explicitly optimistic revision semantics.

## Scope and limits

Settings persist across same-origin web reloads and cached offline reloads while
browser storage remains available. Updating application caches does not imply
clearing local records. This is not a guarantee against site-data clearing, OS
storage eviction, private-mode teardown, quota exhaustion or device loss. Keep
external backups of important work. No cross-device synchronization is claimed.

Device IDs are saved intent, not permission or hardware identity guarantees. MIDI
and audio owners revalidate available devices; restoring an ID does not authorize
microphone capture, MIDI output arming, monitoring or automatic performance resume.

Native wrapper preferences and the old HTTPS-server → bundled-file-origin switch
are outside this web persistence change. Different origins have separate browser
storage; 1.1 cannot promise native-origin continuity without an explicit bridge and
native migration validation. No native build or actual hardware test was run here.

## Validation

`tests/persistence.test.js` covers synchronous compatibility, silent failures,
malformed/future data, strict XP readback, immutable histories, preview validation,
merge preservation, sampler integrity, durable before-snapshots, partial rollback,
crash recovery, corrupt journals, explicit migration idempotence, stale previews
and a gated concurrent import preserving the winning canonical session.

`tests/persistence-ui.test.js` exercises the real Settings UI, localStorage and
sampler IndexedDB. It includes actual localStorage/IDB quota failure injection,
unsaved byte export/retry, repair/quarantine, reviewed import through the real
checkpoint, before-snapshot download, three browser tabs using actual Web Locks,
and same-origin service-worker offline reload. Audio/sample bytes and failures are
synthetic; no microphone, MIDI device, hardware behavior or native origin was
validated. The shared update/startup tests separately cover the application update
checkpoint and blocked startup recovery flow.
