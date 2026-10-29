# My library (Play › Library)

One place for the music you keep in soundLAB:

- **Scans**: sheet music you turned into MIDI with Play › Scan (SheetLab). Each scan keeps its `.mid`, its
  `.musicxml` and a `meta.json` (title, source file, pages, tempo / instrument / transpose, measures, notes,
  chords, length, app version).
- **Played**: what you played in the app. Every idea you capture in the Studio (the ● in the clef menu, or
  **Keep the last 30s** on Studio › Ideas) becomes a Standard MIDI File with its tempo and key, when
  **Save what I play** is on. Any idea (also older ones, and Woodshed runs) has a **Save to library** button.

The library works on this device first, offline and with no account. With an access key it is also kept in
the soundLAB GitHub repository, on a branch of its own called `library`, so the iPad, the phone and the
computer all see the same library.

## Use it

Play › **Library** (also: **My library** on the Woodshed's library card). Newest first; filter **All /
Scans / Played**; search by title, source or key. Each entry:

| Button | What it does |
|---|---|
| **Play on synth** | Opens it in the MIDI Hub Player (tempo, key shifter, loop), ready to play on your synth. |
| **Practice** | Adds it to the Woodshed library and opens the Woodshed (Wait for me / Play at tempo / Run…). |
| **Open as tab** | Shows it as guitar tab on the Songs page. |
| **.mid / .musicxml** | Downloads the file (.musicxml for scans). |
| **Rename** | Changes the title (in `meta.json` only: file names stay, so links keep working). |
| **Delete** | Two taps: the first arms it ("Delete for good?"), the second deletes it here and on GitHub. |

The line under the title says where the entry is: *On GitHub · kept here*, *On GitHub* (another device saved
it; the file is fetched the first time you use it, then kept here), *Waiting to upload*, or *On this device
only* (no key yet). **Sync now** checks GitHub and uploads what is waiting.

## Set up sync (once per device)

Settings › **Library sync**:

1. On a computer or tablet signed in to GitHub open **github.com/settings/personal-access-tokens/new**
   (Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token).
2. Name it `soundLAB library`, choose an **Expiration** (90 days is a good habit).
3. Repository access: **Only select repositories** › **GuitarPak**.
4. Repository permissions › **Contents** › **Read and write** (Metadata: read is added automatically).
   Nothing else.
5. Generate, copy the token (`github_pat_…`), paste it into **Access key**, press **Test connection**.

The first save creates the `library` branch. Repository, branch and folder can be changed on the card
(defaults `mreindl118-boop/GuitarPak`, `library`, `library`); `main`, `master` and `gh-pages` are refused as
the branch, because saving there would redeploy the app. **Save what I play** is on by default once a key is
set; switch it off to keep captured ideas out of the library.

Without a key the library still lists and opens everything on GitHub (the repository is public: GitHub allows
60 such requests an hour per network), and saves on this device; those entries upload once a key is set.

### Security

- The key is stored on this device only, under `localStorage['soundlab.secret.library']`, outside the
  `guitarlab.*` keys, so **Export settings never contains it** (tested). It is sent only to api.github.com,
  only as the `Authorization` header (tested over every request of a session: never in a URL, a body,
  another host or the console). Import settings only writes `guitarlab.*`, so a backup cannot plant a key.
- Pasting is forgiving: spaces, line breaks and zero-width characters around or inside the key are removed
  (left in, the browser refused the header and every request looked like "no network"); anything else that
  no GitHub key contains is refused with a reason.
- A key pasted into Repository / Branch / Folder by mistake is refused there: it would otherwise be stored
  under `guitarlab.*` (so in every backup), sent in URLs and even created as a branch of the public repo.
- The branch can not be `main`, `master`, `gh-pages`, nor `refs/…` / `heads/…` (which name them too).
- A Contents read/write key can change everything in the repository, the app code on `main` too. Protect
  `main` with a ruleset or branch protection (Settings › Rules › Rulesets: block force pushes and deletions,
  require a pull request), so a leaked key cannot touch the app.
- Never share the key or paste it anywhere else. **Forget key** removes it from the device; revoke it on
  GitHub if a device is lost.
- Plugins (Settings › Plugins) run with full access to the app and can read its storage, the key included:
  only install plugins you trust.

## How it works (js/library.js)

### On the device

IndexedDB `soundlab-library`, object store `items` (key path `id`). One record per entry:

```
{ id: 'scans/<slug>' | 'played/<yyyy-mm-dd>-<hhmmss>-<slug>',
  kind: 'scan' | 'played', title, created (ms),
  files: { mid: Uint8Array, musicxml?: string },   // local copies (empty for an entry only listed so far)
  meta,                                            // the meta.json object
  remote: { loc: 'repo@branch:folder', shas: {mid, musicxml, meta}, paths: {...} } | null,
  pending: 'put' | 'delete' | null, dirty: [files the pending put still sends], op: 'add' | 'rename',
  rev,                                             // bumped by every owner change (see Races)
  error, ideaId }
```

Without IndexedDB (rare) the library runs from memory for the session. Settings live in
`guitarlab.library.repo / branch / folder / savePlayed / filter`.

### In git

```
library/                         <- the folder (setting), on the orphan branch 'library'
  README.md                      <- written by the branch's first commit
  scans/<slug>/<slug>.mid
  scans/<slug>/<slug>.musicxml
  scans/<slug>/meta.json         {kind:'scan', title, source, pages, created, options:{tempo, program,
                                  transpose}, summary:{measures, notes, chords, seconds}, app}
  played/<yyyy-mm-dd>-<hhmmss>-<slug>.mid
  played/<yyyy-mm-dd>-<hhmmss>-<slug>.json
                                 {kind:'played', title, created, bpm, key, root, scale, notes, seconds,
                                  source:'idea'|'retro'|'woodshed', ideaId, app}
```

The `library` branch has its own root commit and only these files: no app code, and the Pages workflow
(which deploys on pushes to `main`) never runs for it. Browse it on GitHub by picking the `library` branch.

### GitHub API calls

| When | Call |
|---|---|
| list (Library page shown, Sync now, before any upload) | `GET /repos/{o}/{r}/git/trees/{branch}?recursive=1` (one call). A 404 is followed by `GET /repos/{o}/{r}`: the repository answers = no branch yet; it is 404 too = a wrong / private repository, an error that changes nothing on the device (it used to reset every entry and try to create the branch) |
| entry details | each `meta.json`: `raw.githubusercontent.com/{o}/{r}/{branch}/{path}` without a key, `GET git/blobs/{sha}` (the exact version) with one. The raw CDN keeps files up to 5 minutes (`max-age=300`), so a raw answer is checked against the listing's git id (SHA-1 of `blob <size>\0` + bytes, WebCrypto); a stale copy (or a raw 404) is replaced by `GET git/blobs/{sha}`, which also works without a key on a public repository |
| open / download an entry only on GitHub | the same, for the `.mid` / `.musicxml`; then kept on the device |
| first write, branch missing | `POST git/blobs` (README) -> `POST git/trees` (no base tree) -> `POST git/commits` with `parents: []` -> `POST git/refs` `refs/heads/library` |
| save / rename | `PUT contents/{path}` `{message, content (base64), branch, sha?}`, one per file, in order |
| delete | `DELETE contents/{path}` `{message, sha, branch}` per file |
| Test connection | `GET /repos/{o}/{r}` + the listing |

Commit messages: `soundLAB: add <title>`, `soundLAB: rename <title>`, `soundLAB: delete <title>`,
`soundLAB: start the library`. All requests use `cache: 'no-store'`; with a key they carry
`Authorization: Bearer <key>` and `X-GitHub-Api-Version: 2022-11-28`.

- **Conflict** (409, or 422 "sha wasn't supplied"): the file changed elsewhere since the listing. The
  library fetches the current sha (`GET contents/{path}?ref={branch}`) and retries once; a second failure
  marks the entry *Not uploaded: …* and the rest of the sync goes on. A NEW file's 409 is checked the same
  way: GitHub also answers 409 when the branch moved under the write (another device saving at the same
  moment); the file still free means one more try, only a file that really exists makes it take a free name.
- **No answer**: every request has a time limit (30 s to read, 120 s to write; `App.library.TIMEOUT`).
  A dead mobile link or captive portal ends the sync with "GitHub did not answer in time", everything stays
  pending and the one sync queue is free again (a hung request used to block every later sync until a reload).
- **An answer lost on the way back** (the PUT reached GitHub, the connection dropped before the reply):
  the next sync finds the entry's name taken on GitHub. When *every* file there is byte for byte one of
  ours (git ids compared), it is our own earlier try and the upload carries on with the same name - only the
  missing files are sent. The same happens when the repository / branch / folder is switched away and back.
  (Both used to upload a second copy `<slug>-2` and leave a half entry behind.) Any PUT whose bytes are
  already there is skipped.
- **Rate limit** (429, or 403 with `x-ratelimit-remaining: 0` / `retry-after` / "rate limit"): the sync
  stops, everything stays pending, the status says until when (`x-ratelimit-reset`).
- 401 (key expired/revoked), 403 (key without Contents write) and network failures also stop the sync with a
  plain message; nothing is lost.
- A new entry never overwrites one already on GitHub with the same name (another device's, or anything that
  differs in one byte): it takes the next free name (`fresh-2`). The move to the new id is one IndexedDB
  transaction, so closing the app half way never leaves the entry twice.
- An entry deleted here while another one is uploading is never sent: each file's PUT first re-reads the
  entry (the repository is public, and whatever reaches it stays in its history).
- An entry deleted on another device disappears here at the next listing, unless it still has a change to
  send. If the whole branch is gone, entries with a local copy are uploaded again rather than dropped.

### When the network is used

Nothing is sent at boot or from any other page. Requests happen only:

1. when the **Library page is shown**: one listing (at most every 30 s), the details of new entries, and
   the upload of what the owner already saved (with a key);
2. on an **owner action**: a save, an auto-save the owner switched on (Save what I play), rename, delete,
   Sync now, Test connection, or opening / downloading an entry that is only on GitHub.

Coming back online does not upload by itself: the status says how many changes wait, and the next save,
Sync now or visit to the Library page sends them.

### Races

Syncs run one at a time, in the order asked. Every owner change (save, rename, delete, a new repository /
folder) bumps the entry's `rev`; an upload writes its results back in one IndexedDB transaction and only
clears `pending` when `rev` is unchanged, so a rename tapped during an upload is never lost: it stays
pending and the next sync sends it. New entries are written with IndexedDB `add()` (the first free id of
`<slug>`, `<slug>-2`, … inside one transaction), so two saves of the same title at once keep both, and an
entry learned from the listing never replaces a local one with the same id. `saveScan` runs one save at a
time and returns `{already: true}` for the same scan saved again (same title, byte-identical MIDI and
MusicXML: a double tap, SheetLab's auto-save plus a tap); different content under one title gets `-2`.
`savePlayed` checks "already
in?" and inserts one idea at a time, so the auto-save of a new idea and a tap on its Save to library (or
two quick taps) keep ONE entry. The database connection lets go when another tab upgrades or deletes it
(`onversionchange`) and is opened again after the browser drops it (`onclose`, an `InvalidStateError`).

## For other modules: App.library (window.SLLibrary)

```
App.library.saveScan({title, source, pages, options:{tempo, program, transpose},
                      summary:{measures, notes, chords, seconds}, midi: Uint8Array|ArrayBuffer,
                      musicxml: string})                     -> Promise<{id, title, uploaded, pending, message}>
                                                                ({already: true} for the identical scan again)
App.library.savePlayed(idea, {auto})                         -> same (idea = a Studio idea; refuses a duplicate
                                                                with {already: true})
App.library.savePlayedOn                                     "Save what I play" (getter)
App.library.list() / get(id) / midiBytes(id) / musicxml(id)
App.library.rename(id, title) / remove(id) / sync() / idle()  idle(): resolves when queued syncs are done
App.library.play(id) / practice(id) / openAsTab(id) / download(id, 'mid'|'musicxml')
App.library.open(filter?)                                    show the page ('all' | 'scan' | 'played')
App.library.status                                           {busy, pending, total, error, errorKind, lastSync, hasKey, branch, text}
App.library.mountSettings(el)                                the Settings › Library sync card
App.library.ideaMidi(idea)                                   an idea as an SMF (via SLMidiHub.scoreToMidi)
bus 'library:changed' {status}
```

SheetLab calls `saveScan` with its result (the `.mid` bytes and the MusicXML it exports). The played MIDI is
written by the MIDI Hub's own writer (`SLMidiHub.scoreToMidi`: format 1, a tempo track with the title, one
track, 480 ticks per beat; the idea's seconds become beats at its tempo, velocities kept), so the app has
no third SMF writer.

## Tests

`tests/library.test.js` (Playwright, 94 checks) drives the app against a fake GitHub (page routes for
api.github.com and raw.githubusercontent.com that keep a tree, compute git blob shas, record every request
and inject faults): no request at boot / on other pages / after a reload with pending changes; listing
without a key; saving a scan (MIDI bytes 0-255 and UTF-8 MusicXML round trip); the orphan branch sequence
(tree 404 -> blob -> tree -> parentless commit -> ref -> PUTs); played ideas (auto-save, the idea button,
off switch, duplicates); the offline queue then Sync now; the 409 retry; 403 and 429 rate limits; rename;
a rename tapped while the first upload is still running; two-step delete; another device's entries (meta via git/blobs, Play on synth, Practice, Open as tab,
Download); a name already taken on GitHub; two saves of one title at the same moment; Forget key; a phone without a key reading the public library
(raw files, no Authorization, refused delete, no horizontal scroll); the help tour; the key never in
Export settings. Audit checks (the fake can also answer 409 for a moved branch, hang a request, drop an answer after doing the write,
serve a stale raw copy, or hide the repository): a key pasted with invisible characters, a non-key refused,
the key pasted into Repository / Branch / Folder refused, `refs/heads/main` refused, one entry for an
auto-save plus a tap, a lost answer continued without a `-2` copy, a folder switched away and back with no
upload, a new file's 409 retried, a hung listing ending the sync, an entry deleted during another upload never sent, Test connection
on a rate-limited listing, the key only as Authorization to api.github.com over a whole session, a stale CDN
meta.json replaced by the exact blob, an unreachable repository changing nothing on the device, and the
database letting go when another tab deletes or upgrades it.

Run: `tests/run.sh library` (or `SL_URL=… node tests/library.test.js` against a running `tests/serve.py`).

## Limits

- Real GitHub was not called from these tests (the fake follows the documented API); the first real save
  on each device is the end-to-end check.
- Inside the claude.ai artifact viewer, requests to GitHub and file downloads may be refused by the frame;
  the library then works on the device only.
- Entries are listed from one tree call; a library larger than GitHub's tree limit (100,000 files) would
  be listed partly (nothing is pruned then).
- Woodshed runs are not auto-saved (each run would add an entry); use Save to library on the idea.
