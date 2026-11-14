# Phase A map: storage and the 2.0 prefix

Read-only mapping of branch `claude/verify-project-files-4bchk6-v2` (= `origin/v2` at 5be2eab).
Nothing in the repo was changed and no suite was run. Line numbers are for that commit.
"main" means `origin/main` (02523a6, the live 1.4.1 app); "PR #98" means
`origin/claude/project-thread-rhqjuv` (c875605).

## 0. What the plan must decide

1. **Give the beta its own storage scope.** Live uses `soundlab2.`, the beta at `/next/` uses
   `soundlab2-next.`. With one shared `soundlab2.*` scope, the first beta visit uses up the
   one-time import, and at the flip the live app would show beta-era data instead of the
   user's current 1.x data (section 5.4).
2. **Trigger the import by a marker, never by a version number.** If PR #98 merges, the live
   app is "2.0.0" while still on `guitarlab.*` (section 6).
3. **Run the import synchronously where `App.store` is defined**, before any other script
   loads. `js/midi.js` writes to the store while it loads (section 5.2).
4. **Copy everything except a short deny list.** One-time migration markers must travel with
   the data they guard, or 1.x migrations run again on migrated data (section 5.3).
5. **Never write or delete `guitarlab.*`, and never touch IndexedDB `guitarlab-daw`.** The
   1.x live app keeps using both on the same origin.
6. **Convert the 49 suites that hard-code `guitarlab.`** in the same pull request. Three of
   them would keep passing while testing nothing (section 4.3).
7. Two things outside the prefix itself need an owner: the Pads beat lives in the Studio key
   `st.tracks` (section 2.3), and today's `v2` service worker cannot be flipped to the live
   address as it stands (section 5.6).

## 1. How keys are built, and what bypasses the store

### 1.1 App.store

`js/app.js:525-539` is the whole store. `get(key, fallback)` reads
`localStorage.getItem('guitarlab.' + key)` and JSON-parses it (`:528-529`); `set(key, value)`
writes `JSON.stringify(value)` under `'guitarlab.' + key` (`:536`). Both swallow every
error (`:530-532`, `:537`), so a refused write is silent. There is no remove, no key
listing and no prefix constant: the literal `'guitarlab.'` appears four times in `js/app.js`
and twice in `js/settings.js`.

Modules reach it as `App.store` directly or through small wrappers that add a module prefix:

| Wrapper | File:line | Adds |
|---|---|---|
| `g` / `set` | `js/midihub.js:120-125` | `midihub.` |
| `readBlob` / `flushOne` | `js/synthdeck.js:174`, `:193` | `midihub.` (deck, decklib, deckvals, names) |
| `g` / `set` | `js/synthtab.js:36-37`, `js/synthlive.js:23-24` | `synthtab.` |
| `g` / `set` | `js/remote.js:40-41` | `remote.` |
| `g` / `set` | `js/helix.js:48-49` | `hx.` |
| `get` / `set` | `js/xp.js:16-17` | nothing |
| `arr` / `obj` | `js/practiceplan.js:37-38` | nothing |
| `store` | `js/synthdeck-scope.js:50` | nothing |
| `var g = App.store.get` | `js/chords.js:122`, `js/jam.js:799` | nothing |
| `store()` | `js/help.js:152` | nothing |
| injected `options.store` | `js/practice-progress.js:14`, `:109` | nothing (key `practice.progress.v1`, `:20`) |

All of these end in `App.store`, so one prefix change in `js/app.js` covers them.

### 1.2 Raw localStorage in app code (the complete list)

`grep -rn "localStorage\|sessionStorage" js/ index.html sw.js tools/` finds raw access in
two files only:

| File:line | What it does |
|---|---|
| `js/app.js:528`, `:536` | the store itself |
| `js/app.js:1024` | `colWrite` reads the raw string back to see whether a color write was kept |
| `js/app.js:1031` | `colRead` reads the raw string to cache parsed color settings |
| `js/settings.js:964-966` | backup export: lists every key that starts with `guitarlab.` |
| `js/settings.js:986` | backup import: writes raw strings for keys that start with `guitarlab.` |

`js/studio.js:443` and `js/songs.js:217` only mention localStorage in comments. Nothing in
`index.html`, `sw.js`, `tools/`, `android/` or `ios/` touches it. No app code calls
`removeItem` or `clear`; modules "delete" by writing `null` (about 14 call sites).

### 1.3 Other storage

| Kind | Name | Where | Notes |
|---|---|---|---|
| IndexedDB | `guitarlab-daw`, version 1, one object store `samples` | `js/studio.js:445-452` (open), `:454-479` (put/get/delete), used at `:485`, `:504`, `:988` | Sampler audio bytes keyed by track id. The only IndexedDB use in the repo. |
| Cache Storage | `soundlab2-v3` | `sw.js:4`; opened `:103`, `:126`; cleanup `:112-113` | Cleanup deletes only other `soundlab2-*` caches. |
| Cache Storage (live) | `guitarlab-v130` | main `sw.js:2`; cleanup main `sw.js:107-108` | Cleanup deletes **every** cache that is not its own, including the beta's. |
| sessionStorage | none in app code | | Tests only (section 4). |
| Cookies | none | `grep -rn "document.cookie"` over the repo: no hits | |
| Storage events, `navigator.storage`, BroadcastChannel | none | grep over `js/`, `index.html`, `sw.js`: no hits | Two open tabs never hear each other's writes. |

Origins: the live app (`/GuitarPak/`), the beta (`/GuitarPak/next/`) and the Android app
(`LIVE_URL`, `android/src/com/mreindl/soundlab/MainActivity.java:40`) share one origin and
so one localStorage, one IndexedDB and one Cache Storage. The Android offline fallback
(`file:///android_asset/index.html`, `MainActivity.java:42`), the iOS wrapper
(`ios/Sources/GuitarLabApp.swift:53`) and the claude.ai artifact are separate origins with
their own copies.

## 2. Key inventory by owner

Built by a script over every `store.get/set` call and every wrapper call in `js/`; a second
pass confirmed no `store.get/set` line was missed. About 270 fixed key names plus four
open-ended families (`app.gtab.<group>`, `ws.best.<title>.<mode>`, `ws.ladder.<title>`,
`tr.best.<pair>`).

### 2.1 Keys of features Phase A removes

| Keys | Owner (file:line of the writes) | Other readers | Import |
|---|---|---|---|
| `st.tracks` | `js/studio.js:395`, `js/arrange.js:46`, `:296`, **`js/pads.js:67`, `:125`, `:361`, `:379`** | loaded only by `js/studio.js:379-392` | leave behind, but see 2.3 |
| `st.bars` | `js/studio.js:396` | `js/studio.js:390` | leave behind, but see 2.3 |
| `st.armed` | `js/arrange.js:228`, `:297`, `:524`; `js/studio.js:971`, `:987` | `js/pads.js:440`, `js/piano.js:1766` | leave behind; the two readers go with the Studio space |
| `st.zoomX`, `st.snap`, `st.loop`, `st.follow` | `js/arrange.js:396`, `:706-729` | | leave behind |
| `ideas.list` | `js/studio.js:110`, **`js/woodshed.js:727`** | `js/studio.js:105`, `js/woodshed.js:715` | leave behind. Woodshed appends a capture after every run (`js/woodshed.js:713-728`, up to 100 ideas of up to 800 notes); that block must go in the trim or it keeps filling the new store. |
| `song.name` | `js/studio.js:1149` | `js/arrange.js:737` | leave behind |
| `sd.retroSecs`, `sd.playVoice` | `js/settings.js:298`, `:314` | `js/studio.js:23`, `:209` | leave behind (Studio prefs card, `js/settings.js:287-316`) |
| `plugins.list` | `js/plugins.js:29` | `js/plugins.js:25` | leave behind. It holds JavaScript that `js/plugins.js:34` runs with `new Function` at boot (`:125`). The 2.0 store should never carry stored code. |
| `tr.sessions`, `tr.ccA`, `tr.ccB`, `tr.earBest`, `tr.earHarm`, `tr.best.<pair>` | `js/trainer.js:118`, `:127`, `:275`, `:358`, `:559`, `:563`, `:580` | none outside `js/trainer.js` | leave behind unless the fold re-homes a drill under the same key (open question 5) |
| `app.space` | `js/app.js:1200` | none: written, never read | leave behind |
| `app.tabStudio` | `js/app.js:792` via `tabStoreKey` (`:692`) | `js/app.js:915`, `:1210`, `:1652` | leave behind |
| `app.gtab.gstudio`, `app.gtab.gsketch`, `app.gtab.gpl-<id>` | `js/app.js:780` | `js/app.js:716` | leave behind (Studio groups, and plug-in page groups made at `js/app.js:899`) |
| IndexedDB `guitarlab-daw` | `js/studio.js:447` | | not opened, not copied, not deleted |

Not storage keys but worth knowing: the LUMI pill (`js/lumi-practice.js:5`) is session-only
and stores nothing. The Synth pill's only key is `pn.synthPreset` (`js/piano.js:1486`,
`:1923`); copy it, the sound picker on Piano can reuse it. `met.trainer`
(`js/metronome.js:216`, `:235`) is the metronome's own speed trainer, not the Trainer page.

### 2.2 Keys that stay (copy all)

| Namespace | Count | Writer | Notes |
|---|---|---|---|
| `app.*` | 9 + `app.gtab.<group>` | `js/app.js`, `js/settings.js`, `js/piano.js:218`, `js/jam.js:1401`, `js/pads.js:313` | accent, theme, vol, pluckTone, pianoTone, bassStyle, click, keepAwake, tab. A stored tab or group member that no longer exists falls back to the first page (`js/app.js:717`, `:1653`), so copying `app.tab` is safe. |
| `fb.*` | 23 | `js/fretboard.js`, `js/app.js:1068-1077`, `:1429-1431` | the shared key, scale, mode and the color palettes. `fb.migr24` is a migration marker. `fb.view` is read and ignored (`js/fretboard.js:71-75`). |
| `tab.*` | 3 | `js/fretboard.js:2250-2256` | |
| `met.*` | 9 | `js/metronome.js`, `js/app.js:1451`, `:1456` | `met.bpm` is the shared tempo, used by 17 files |
| `scale.lock` | 1 | `js/app.js:1742` | |
| `help.*` | 3 | `js/help.js:164`, `:287`; `js/app.js:991` | `pn.assist` is the old fallback for `help.level` (`js/app.js:982`) |
| `learn.instrument` | 1 | `js/learn-instruments.js:35` | |
| `pn.*` | 19 | `js/piano.js` | |
| `kl.*` | 6 | `js/keylessons.js` | lesson progress `kl.prog` |
| `cc.*` | 3 | `js/chordchart.js` | chord charts |
| `ch.*` | 9 | `js/chords.js` | |
| `th.*` | 3 | `js/theorytab.js` | |
| `qz.*` | 7 | `js/quiz.js` | `qz.instrumentProg` is also read by `js/practiceplan.js:144` |
| `practice.progress.v1` | 1 | `js/practice-progress.js:125` | the one XP ledger; the loader throws on an invalid value (`:113-117`) |
| `lesson.observations.v1`, `lesson.pending.v1` | 2 | `js/xp.js:25`, `:35`, `:59` | |
| `xp.total`, `xp.days`, `xp.goal`, `xp.sprint`, `ws.xp`, `ws.streak` | 6 | none (read-only history: `js/xp.js:18-20`, `:89`; `js/woodshed.js:1155-1156`) | copy, so "Legacy / unassigned" still shows |
| `progress.ui.*` | 2 | `js/practice-progress-ui.js` | |
| `pp.*` | 6 | `js/practiceplan.js` | |
| `ws.*` | 15 + `ws.best.*`, `ws.ladder.*` | `js/woodshed.js`, `js/performance-player.js` | `ws.cal` is also read by `js/keylessons.js:217` |
| `sg.*` | 3 | `js/songs.js:224`, `:630`, `:637` | `sg.lib` is the song library and can be large |
| `jam2.*`, `jam.track` | 9 | `js/jam.js:850-856` | `jam2.migr` is a migration marker (`js/jam.js:833-843`) |
| `tun.*` | 7 | `js/tuner.js` | |
| `audio.*` | 8 | `js/audioin.js`, `js/settings.js` | device ids are per origin, so they stay valid |
| `midi.*` | 14 | `js/midi.js`, `js/lights.js:152` | `midi.allIn.v1` and `midi.voiceAuto` are migration markers |
| `lights.*` | 9 | `js/midi.js`, `js/lights.js` | `lights.v1` is a migration marker |
| `remote.*` | 3 | `js/remote.js:64`, `:353-354` | |
| `pads.*` | 5 | `js/pads.js` | `pads.track` is an id inside `st.tracks` (2.3) |
| `midihub.*` | about 32 | `js/midihub.js`, `js/synthdeck.js` | Gear. Also read by `js/practice-router.js:172` (`midihub.thru`) on the soundLAB side. |
| `synthtab.*` | 9 | `js/synthtab.js`, `js/synthlive.js` | Gear |
| `hx.*` | 21 | `js/helix.js` | Gear |

`gear.html` and `index.html` sit in the same folder on the same origin, so both must use the
same prefix and one import serves both. The full per-key list with read and write lines is
in the appendix.

### 2.3 Pads stores its beat in a Studio key

Pads stays, but its pattern is not under `pads.*`. It writes the whole Studio track list to
`st.tracks` (`js/pads.js:67`, `:125`, `:361`, `:379`), finds its track through `pads.track`
(`js/pads.js:49`), and relies on `js/studio.js:379-392` to load `st.tracks` into
`DAW.engine.tracks` at start. When `js/studio.js` is removed, Pads loses its loader. The
trim has to give Pads its own load and save, and the import has to follow that choice:

- Recommended: Pads owns a new key (for example `pads.tracks`) holding drum tracks only.
  The import reads `guitarlab.st.tracks`, keeps entries with `kind === 'drums'`, and writes
  them to the new key. Synth and sampler tracks stay behind (sampler tracks point at audio
  in `guitarlab-daw`, which 2.0 does not have).
- Alternative: Pads keeps the names `st.tracks` and `st.bars`; then those two leave the deny
  list, still filtered to drum tracks.

## 3. Settings backup

Markup `js/settings.js:135-144`, logic `:962-995`.

- **Export** (`:962-974`) walks `localStorage`, takes every key that starts with
  `guitarlab.` and writes `{ "app": "soundLAB", "keys": { "guitarlab.<key>": "<raw stored
  string>" } }` as `soundlab-settings.json`. Keys keep their full prefix. There is no format
  or version field. IndexedDB sampler audio is not included.
- **Import** (`:975-995`) requires `app === 'soundLAB'` and a `keys` object, writes every
  key that starts with `guitarlab.` straight back with `localStorage.setItem`, reports the
  count and reloads after 900 ms. It only adds or overwrites; keys missing from the file are
  kept. Nothing is validated.
- The card promises "Updates NEVER clear your settings ... they live on this device and
  survive every version" and mentions "studio tracks" (`:137-139`). The import is what keeps
  the first promise true across the prefix change; the wording needs the Studio part removed.

No suite covers the backup (`grep -n "backup\|soundlab-settings" tests/*` finds only an
unrelated MusicXML tag).

**Effect of a prefix change.** If the two literals are only swapped to the new prefix, an
old backup file restores nothing: every key fails the prefix test at `:986`, the message
reads "0 settings restored — reloading…" and the page reloads. New exports would also be
unreadable by a 1.x app, which is harmless (it restores 0 keys).

**Recommendation.**

- Export: same shape plus `"format": 2` and `"from": "<APP_VERSION>"`, keys written with the
  current scope's prefix, only that scope's keys.
- Import: accept three key prefixes. `soundlab2.` and `soundlab2-next.` are stripped and
  written under the current scope, so a beta backup restores on live and the other way
  round. `guitarlab.` keys go through the same deny list as the one-time import and are
  written under the current scope. Report both counts ("41 restored, 6 from removed
  features skipped"). Never write a `guitarlab.` key.
- Add `App.store.keys()`, `App.store.raw(key)` and `App.store.setRaw(key, raw)` so
  `js/settings.js` no longer names a prefix.
- A 2.0 export no longer contains Studio ideas or tracks. Because `guitarlab.*` is never
  deleted, a user can still export them from the 1.x app before the flip.

Other export files do not embed the prefix and are unaffected: `soundlab-midi-hub.json`
(`js/midihub.js:1090-1094`, short key names), `soundlab-sounds.json` (`js/synthdeck.js:1562`),
Live profiles (`js/synthlive.js:95`), `.chart.json` (`js/chordchart.js:297`),
`soundlab-practice-progress.json` (`js/practice-progress-ui.js:163`), the pending lesson
sessions (`js/quiz.js:2459`) and the plan gap list (`js/practiceplan.js:247`).

## 4. How the tests seed storage

### 4.1 Counts

62 suites. 49 name `guitarlab` (178 lines, 194 occurrences). 13 never touch storage keys:
fingering, midi-ingress, midi-ports, note-palette, pages-deploy, pages-next,
performance-engine, performance-import, practice-input, practice-progress, practice-router,
release-workflow, sound-lock. `tests/env.js` has no storage helper, so every suite spells
the prefix itself. All seeding happens in `addInitScript` (54 uses in 49 suites) or in
`page.evaluate`.

### 4.2 Patterns

| # | Pattern | Occurrences | Example |
|---|---|---|---|
| 1 | first-run flags: `['help.seen','help.done','qz.landed'(,'midi.wanted')].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'))` | 44 lines in 41 suites | `tests/keys.test.js:15`, `tests/pitch-lock.test.js:13` |
| 2 | seed map: `for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]))` | 19 lines in 19 suites | `tests/lights.test.js:18`, `tests/synthconn.test.js:24` |
| 3 | literal write: `localStorage.setItem('guitarlab.<key>', ...)` | 96 in 34 suites | `tests/remote-keys.test.js:36-40` |
| 4 | literal read-back: `localStorage.getItem('guitarlab.<key>')` | 28 in 11 suites | `tests/keys.test.js:136`, `tests/portnames.test.js:41` |
| 5 | read-back with a variable key: `getItem('guitarlab.' + k)` | 3 in 1 suite | `tests/instrument-xp.test.js:15`, `:27`, `:90` |
| 6 | `removeItem('guitarlab.' + PracticeProgress.storageKey)` | 1 | `tests/instrument-session.test.js:29` |
| 7 | prefix inside a regular expression | 3 | `tests/game.test.js:56`, `:72`; `tests/colors.test.js:357` |
| 8 | `App.store.get/set` inside the page | 219 in 26 suites | prefix-free, safe |
| 9 | `sessionStorage` seed-once guard (`__seeded`, `__pp_seeded`) | 5 suites | `tests/game.test.js:12-13`, `tests/practiceplan.test.js:11-12` |
| 10 | a private key with no prefix (`test.master.ports`) | 1 suite | `tests/display-master.test.js:35`, `:74` |

Patterns 1 to 7 add up to the 194 occurrences. The keys most often named directly are
`lights.on` (14), `kl.prog` (11), `midihub.profile` (8), `midi.outputId` (8), `fb.scale` (8).
Three suites name keys of removed features: `tests/helix.test.js:28` (`plugins.list`),
`tests/lights.test.js:127` (`st.armed`), and `tests/nav.test.js:25` / `tests/quiz.test.js:377`
(`app.tab`, which stays).

### 4.3 What breaks, and what breaks silently

With the import in place, pattern 1 to 3 seeds written under `guitarlab.` would still reach
the app on the first load, because the import copies them. That hides the mismatch rather
than fixing it. The read-backs then fail, mostly loudly (`JSON.parse(null)` or a wrong
value). These would keep passing while checking nothing:

- `tests/game.test.js:56`, `:72`, `:86` compares two lists of keys matching
  `/^guitarlab\.xp\./`. After the change both are empty, so "passive practice creates no
  legacy XP" passes for any behaviour.
- `tests/instrument-xp.test.js:15`, `:27-30`, `:90-92` asserts that historical keys are
  "preserved bytewise" by reading `guitarlab.*` back. The 2.0 app never writes those, so the
  check can no longer fail.
- `tests/instrument-session.test.js:29` removes a key that would no longer exist, so the
  "start from an empty ledger" step silently does nothing.

`tests/colors.test.js:357` (a `setItem` stub that throws for `/^guitarlab\.fb\./`) fails
loudly at `:372`, but only because line 361 also reads the old key.

**Recommendation.** In the storage pull request, replace `guitarlab.` with `soundlab2.` in
all 49 suites (the suites load `http://127.0.0.1:4573/index.html`, `tests/env.js:7`, which is
the live scope), including the three regular expressions. Add a pure-Node check that fails if
`guitarlab.` appears in `js/` or `tests/` outside the one legacy constant and the import
suite. Seeds written as `soundlab2.*` before the app starts survive the import because it
never overwrites an existing key.

## 5. Design

### 5.1 Where the prefix lives

In `js/app.js`, replacing `:525-539`. One place decides the scope; nothing else in the
codebase names a prefix.

```js
var STORE_BETA   = /\/next\/[^\/]*$/.test(location.pathname);   // same rule PR #98's sw.js applies to its scope
var STORE_PREFIX = STORE_BETA ? 'soundlab2-next.' : 'soundlab2.';
var STORE_LEGACY = 'guitarlab.';                                 // 1.x: read during the import, never written
var store = { prefix, get, set, raw, setRaw, remove, keys };     // raw/setRaw/keys replace the bypasses in 1.2
importOnce();                                                    // synchronous, before the IIFE returns
```

`soundlab2-next.` is chosen so that it does not start with `soundlab2.`; a key listing for
the live scope must not pick up beta keys. The path rule is false for `/GuitarPak/`, for the
test server, for `file://` and for the artifact, and true for `/GuitarPak/next/`,
`/GuitarPak/next/index.html` and `/GuitarPak/next/gear.html`. `next/beta.json`
(`.github/workflows/pages-next.yml:71`) cannot be used because reading it is asynchronous.

`gear.html` has to load `js/app.js` before any module, as `index.html:123` does. If the Gear
page ends up with a shell that does not load `js/app.js`, move this block to a small
`js/store.js` loaded first by both pages (one more entry in `sw.js` ASSETS; `android/build.sh:33`
and `ios/sync-web.sh:9` copy `js/` whole).

### 5.2 When the import runs

On the first start of a build that finds no marker `<prefix>store.imported` in its own
scope. It runs inside the `js/app.js` IIFE, directly after the store is defined.

It cannot run later (for example in `App.boot`). Modules read and write the store while they
load: `js/midi.js:55-58` sets `midi.inputId` to "all" and writes `midi.allIn.v1` if that
marker is absent, `js/midi.js:121-124` rewrites `midi.appSound`, `js/learn-instruments.js:29`
and `js/quiz.js:1851` read at load, and `js/practice-progress.js:14` builds the XP ledger.
`js/midi.js` is the second script after `js/app.js` (`index.html:123-125`). An import that
ran after it would find those keys already present and skip the user's real values.

### 5.3 What it copies and what it leaves

Steps:

1. Marker present: return.
2. Source: on the beta, `soundlab2.` if the live scope has its own marker, otherwise
   `guitarlab.`. On live, always `guitarlab.`.
3. List the source keys first, then copy raw strings, smallest value first. A key is copied
   only if the destination key does not exist. Each write is in its own try/catch and is
   checked by reading it back; a failure is recorded, not thrown.
4. Write the marker: `{ v: 1, from, at, app, copied, skipped, failed: [keys] }`.

Deny list, applied to the `guitarlab.` source (a `soundlab2.` source is already clean):

```
st.*   ideas.*   song.*   sd.*   plugins.*   tr.*
app.space   app.tabStudio   app.gtab.gstudio   app.gtab.gsketch   app.gtab.gpl-*
```

plus the Pads transform of 2.3. Everything else is copied, including keys this map does not
name.

Why a deny list and not an allow list:

- **Migration markers.** `fb.migr24` (`js/fretboard.js:61-65`), `midi.allIn.v1`
  (`js/midi.js:55-58`), `midi.voiceAuto` (`js/midi.js:121-124`), `lights.v1`
  (`js/midi.js:1054-1057`) and `jam2.migr` (`js/jam.js:833-843`) each guard a one-time
  rewrite. Copy the data without the marker and the rewrite runs again: the neck goes back
  to 24 frets, the chosen MIDI input becomes "All keyboards", "soundLAB plays my keys: Never"
  returns to Auto.
- **Keys added after 1.4.1.** If PR #98 merges, the live app starts writing `cc.*`,
  `remote.*` and `pn.look` under `guitarlab.*`. A list frozen today would drop them.

The marker's `v` is the recipe version. Because the legacy data is never deleted, a later
release can add a step that copies more keys (still only where absent), for example Trainer
bests if a folded drill wants them.

### 5.4 Should the beta share `soundlab2.*` with live?

No. Recommendation: separate scopes.

With one shared scope, the first beta visit after Phase A lands writes the marker. From then
on the beta and the 1.x live app drift apart, which is what the prefix is for. At the flip
the live app starts its first 2.0 build, finds the marker the beta wrote weeks earlier, and
does not import. Whatever was practised on the live app since that beta visit stays behind
in `guitarlab.*`. The roadmap's "one-time import at the flip" (`docs/ROADMAP-2.0.md:55`)
would in fact have happened at the first beta visit. This hits exactly the devices that
opened the beta, the owner's first. The Android app can only load the live address
(`MainActivity.java:40`, `:119`), so daily practice data is on the live side.

With separate scopes:

| Moment | Live `/GuitarPak/` | Beta `/GuitarPak/next/` |
|---|---|---|
| Phase A reaches the beta | 1.x, `guitarlab.*`, unaffected | first start copies `guitarlab.*` to `soundlab2-next.*` |
| Between then and the flip | keeps writing `guitarlab.*` | works in its own copy; never writes `guitarlab.*` |
| The flip (first live build with the new store) | copies the current `guitarlab.*` to `soundlab2.*` | unchanged |
| After the flip | `soundlab2.*` | unchanged; a browser that opens the beta for the first time copies from `soundlab2.*` |

The cost: progress made in the beta does not flow to the live app. If the owner practises
mainly in the beta, that is the wrong trade, so this is listed as open question 1. A cheap
way to soften it either way is one manual action, described in 5.5.

Both scopes also keep later 2.x beta work (possibly with newer data formats) away from the
live app's data, which is the isolation `docs/ROADMAP-2.0.md:74-77` asks the prefix to give.

### 5.5 Writing back, and manual actions

The 2.0 code never calls `setItem` or `removeItem` on a `guitarlab.` key, and never opens or
deletes `guitarlab-daw`. Reasons: the 1.x live app still uses them next to the beta; after
the flip they are the way back if a release is rolled back; and deleting the database from
the beta would destroy the live app's sampler audio.

Optional, small, and recommended: in Settings › Backup, one line showing what the marker
recorded ("Copied your 1.x data on <date>: 143 items"), a two-step "Copy my 1.x data again"
(overwrites; use an in-page confirm, `confirm()` is refused inside the artifact frame), and
on the beta "Copy from the live app again". If the marker lists failed keys, the same place
says so and offers the retry. Removing `guitarlab.*` and `guitarlab-daw` is a separate,
explicit action for a release after 2.0.

### 5.6 IndexedDB and Cache Storage names

IndexedDB: after the sampler is removed, 2.0 uses none. If the Songs library (Phase G) adds
one, name it by scope: `soundlab2` and `soundlab2-next`.

Cache Storage: Phase A edits `sw.js` anyway (removed and added files). Three points, found
by reading the code together with the documented behaviour that `caches.match()` searches
every cache of the origin in creation order; not run in a browser:

- **Today's `v2` worker cannot go live.** It deletes only `soundlab2-*` caches
  (`sw.js:113`), so on the live address the old `guitarlab-v130` cache would stay, and the
  fetch handler's global `caches.match` (`sw.js:123`) would find the 1.x files in it first.
  The live app would keep showing 1.x files. Live and beta would also use the same cache
  names and delete each other's older `soundlab2-*` caches. PR #98 fixes both by naming
  caches per scope and deleting `guitarlab-*` on the live scope (its `sw.js:6-8`,
  `:117-118`). Without PR #98 the same change is needed before any `v2` code reaches the
  live address.
- **The beta can read stale files from the live cache.** The live worker's scope
  (`/GuitarPak/`) includes `/GuitarPak/next/`. In a browser that already has the live app,
  it handles the beta's very first load and stores those responses in its own cache (main
  `sw.js:118-121`). The beta worker's global
  lookup (`sw.js:123`) can then return them in preference to its own newer cache, until the
  next live release clears that cache. Fix on the beta side: look only in the worker's own
  cache (`caches.open(CACHE).then(c => c.match(...))`). PR #98 does not change the lookup.
- **Known caveat, unchanged:** the 1.x live worker deletes the beta's caches whenever it
  updates (main `sw.js:107-108`).

Recommended names, matching PR #98: `sl2-live-<n>` and `sl2-next-<n>`, chosen from the
worker's registration scope, each worker deleting only its own prefix plus the retired
`soundlab2-*` and, on live, `guitarlab-*`.

### 5.7 Other origins, quota, two pages

- Android app: it loads the live address, so the import runs inside the WebView at the
  flip. No new APK is needed. The bundled offline copy stays 1.x on its own `file://` store.
- claude.ai artifact and iOS wrapper: separate origins; the same code imports there on the
  first 2.0 start.
- Quota: localStorage has one budget per origin (roughly 5 MB in the common browsers). The
  import adds a second copy of the kept data, the beta scope a third. `ideas.list` alone can
  reach megabytes and stays behind. A refused write is silent in both apps
  (`js/app.js:535-537`), so a full store would also make the 1.x app drop writes. Smallest
  first, per-key failure records and a visible note in Settings keep this recoverable.
- soundLAB and Gear open in two tabs share one store with no change events; the last write
  wins and the other tab sees it after a reload. Same as two tabs today.

### 5.8 Test plan

New suite `tests/storage-import.test.js`, added to the default list in `tests/run.sh:17`.

| # | Case | Checks |
|---|---|---|
| 1 | Empty browser | app starts; marker written with `copied: 0`; no `guitarlab.*` key created |
| 2 | Only `guitarlab.*` keys: a kept set (key, scale, tempo, `kl.prog`, `qz.instrumentProg`, a valid `practice.progress.v1`, `xp.total`, `sg.lib`, `cc.charts`, `midihub.rules`, `synthtab.live`, `hx.favs`, `remote.map`, first-run flags) and a removed set (`st.tracks` with a drum and a sampler track, `ideas.list`, `song.name`, `sd.*`, `tr.*`, `app.space`, `app.tabStudio`, `plugins.list` whose code sets a global) | every kept key equals the source string byte for byte; no removed key exists under the new prefix; the global is not set; `App.store.get('fb.root')`, the context bar and `SLXP.legacy().total` show the seeded values |
| 3 | Migration markers: `fb.frets` 22 + `fb.migr24`, `midi.inputId` "in-1" + `midi.allIn.v1`, `midi.appSound` false + `midi.voiceAuto` | all three values survive the start |
| 4 | 1.x untouched | a snapshot of all `guitarlab.*` entries is identical after start, after changing key and tempo and switching pages, and after a reload; a stub on `Storage.prototype.setItem` / `removeItem` records no call with a `guitarlab.` key; `indexedDB.databases()` does not list a database opened by 2.0 |
| 5 | Runs once | after a reload the marker is unchanged; a value changed in 2.0 stays; changing the `guitarlab.*` source afterwards and reloading changes nothing |
| 6 | Never overwrites | a `soundlab2.*` key present before the first start keeps its value; the rest is imported |
| 7 | Beta scope | serve the app under `/next/` with a Playwright route; keys go to `soundlab2-next.*`; with only `guitarlab.*` it imports from there; with a live marker it imports from `soundlab2.*`; live keys are unchanged; the live page does not see beta writes |
| 8 | Refused writes | `setItem` throws for one large key: start does not throw, other keys arrive, the marker lists the failed key; with storage fully blocked the app still starts |
| 9 | Backup | a 2.0 export has `format: 2` and only current-scope keys; an old 1.x file restores kept keys under the new prefix, skips removed ones, reports both counts and writes no `guitarlab.*` key; a beta file restores on live |
| 10 | Static guard (pure Node) | `guitarlab.` appears in `js/` and `tests/` only in the legacy constant and this suite |

Plus: the 49 converted suites, the Pads beat surviving the import once 2.3 is decided, and
a `gear.html` start that sees the imported `midihub.*` values.

## 6. PR #98

`git diff origin/v2 origin/claude/project-thread-rhqjuv` touches four files: `CLAUDE.md`,
`js/app.js` (one line, `APP_VERSION` 1.4.1 to 2.0.0 at `:101`), `sw.js` (scope-named caches
`sl2-live-v4` / `sl2-next-v4`, cleanup of `soundlab2-*` and, on live, `guitarlab-*`) and
`version.json`. The store is untouched, so a merged PR #98 means a live app called 2.0.0
that still reads and writes `guitarlab.*`. Its `CLAUDE.md` text says later live releases are
pull requests from `v2` to `main`.

| | PR #98 merges | PR #98 does not merge |
|---|---|---|
| Live app before the storage change | "2.0.0" on `guitarlab.*` | 1.4.1 on `guitarlab.*` |
| When live gets the new store | the first `v2` to `main` release that contains the storage pull request, possibly long before Phase I | Phase I |
| What the import reads | `guitarlab.*`, now also holding keys from 2.0 features (`cc.*`, `remote.*`, `pn.look`); the deny list copies them | `guitarlab.*` as written by 1.4.1 |
| Trigger | marker absent | marker absent |
| Caches | live `sl2-live-*`, beta `sl2-next-*` once `v2` has the same `sw.js` | beta `soundlab2-*`; live `guitarlab-*`; the fix in 5.6 is still needed before the flip |

The design holds in both cases because it never compares version numbers, treats
`guitarlab.*` as the source whatever wrote it, and keeps the beta from using up the import
however long the gap is. The path rule in 5.1 matches the scope rule in PR #98's `sw.js:6`,
so storage and caches end up scoped the same way.

Things to watch if it merges:

- `sw.js:2-4` and `:113` are edited by PR #98 and will be edited again by Phase A (cache
  bump, changed asset list). Merge `main` into `v2` before the Phase A `sw.js` change, or
  expect a conflict there, in `js/app.js:101`, `version.json` and the "read first" paragraph
  of `CLAUDE.md`.
- Until `v2` carries version 2.0.0, the beta shows "soundLAB v2.0.0 is available": it
  compares its own `APP_VERSION` (`js/app.js:101`) with `main`'s `version.json`
  (`js/app.js:102`, `:129-130`).
- PR #98's worker deletes every cache named `soundlab2-*` (its `sw.js:117`). That is Cache
  Storage only and does not touch localStorage keys, but no future cache should use that
  name.
- PR #98's `CLAUDE.md` presents shared storage as a benefit ("progress carries over"). The
  separate beta scope ends that after Phase A; open question 1.

## 7. Files the storage pull request touches

| File | Change |
|---|---|
| `js/app.js:525-539` | prefix constants, store methods, the import |
| `js/app.js:1024`, `:1031` | use `store.raw` |
| `js/settings.js:137-139`, `:962-995` | backup text, export and import through the store |
| `sw.js:4`, `:113`, `:123` | cache name and cleanup, own-cache lookup (with the trim's asset changes) |
| `tests/*.test.js` (49 files) | prefix; `tests/run.sh:17` gains the new suite |
| `tests/storage-import.test.js` | new |
| `CLAUDE.md:6`, `:27-28`, `:42`; `docs/CI-DEPLOYMENT.md:155-159`; `docs/ROADMAP-2.0.md:74-77` | the statements that storage stays `guitarlab.*` or is shared |

Depends on the trim for: the Pads loader (2.3), removal of the Woodshed capture
(`js/woodshed.js:713-728`), and the final list of removed keys.

## 8. Risks

1. A shared `soundlab2.*` scope lets the first beta visit use up the import; the live app
   then starts 2.0 with beta-era data (5.4).
2. An import that runs after `js/midi.js` has loaded loses the chosen MIDI input and voice
   setting (5.2).
3. An allow list, or any filter that drops the five migration markers, re-runs 1.x
   migrations on migrated data (5.3).
4. Any write or delete on `guitarlab.*` or `guitarlab-daw` from the beta damages the live
   1.x app's data (5.5).
5. A swapped literal in the backup importer makes every existing backup file restore
   nothing, without an error (3).
6. Unconverted suites: three keep passing without testing anything; seeds silently reach
   the app through the import (4.3).
7. Pads loses its saved beat and its loader when `js/studio.js` goes (2.3).
8. `js/woodshed.js:713-728` keeps appending to `ideas.list` after the Studio is gone.
9. The copy doubles the kept data inside one per-origin quota; a full store makes both apps
   drop writes silently (5.7).
10. Flipping today's `v2` service worker to the live address leaves the 1.x cache in front;
    the beta can also be served stale files from the live cache (5.6). Derived from the
    code, not run.
11. If PR #98 merges and `v2` is not brought up to date, `sw.js`, `js/app.js:101`,
    `version.json` and `CLAUDE.md` conflict, and the beta shows an update banner (6).

## 9. Open questions, with a recommended answer

1. **Does the beta get its own storage scope?** Recommended: yes, `soundlab2-next.`
   (section 5.4). The cost is that practice done in the beta does not reach the live app.
   If the owner practises mainly in the beta, choose the shared scope instead and add the
   "Copy my 1.x data again" action so the flip can still pick up live data.
2. **Manual copy actions in Settings › Backup?** Recommended: yes, the small set in 5.5.
   They are cheap because the import is one function with a source, a target and an
   overwrite flag.
3. **Where does Pads keep its beat?** Recommended: its own key holding drum tracks only,
   filled from `guitarlab.st.tracks` by the import (section 2.3).
4. **Backup file format.** Recommended: add `format: 2`, keep the shape, accept old files
   through the deny list (section 3).
5. **Trainer bests and history (`tr.*`).** Recommended: leave behind. If a folded drill
   wants them later, add a second import step; the 1.x data is still there.
6. **When are `guitarlab.*` and `guitarlab-daw` removed?** Recommended: not in 2.0. A
   separate, explicit Settings action in a later release.
7. **Service-worker names and lookup.** Recommended: carry PR #98's scope-named caches and
   the own-cache lookup in Phase A's `sw.js` change (merge `main` into `v2` first if PR #98
   has merged), instead of leaving both to Phase I (section 5.6).

## Appendix: every key, with read (r) and write (w) lines

Entries marked (wrapper) are the module's prefixing helper, not a key. Keys built from
variables and not listed below:
`app.tab` / `app.tabStudio` (`js/app.js:692`), `practice.progress.v1`
(`js/practice-progress.js:20`), `lesson.observations.v1` / `lesson.pending.v1`
(`js/xp.js:25`), `ws.best.<title>.<mode>` (`js/woodshed.js:417`, `:700-701`),
`ws.ladder.<title>` (`js/woodshed.js:678-681`), `tr.best.<pair>` (`js/trainer.js:272-275`),
`met.sndAcc/Beat/Sub` writes (`js/metronome.js:635-640`), `tun.fretMin/Max` writes
(`js/tuner.js:594`, `:675-676`), `midihub.deck/decklib/deckvals/names`
(`js/synthdeck.js:174`, `:193`), and the Hub's export and reset lists
(`js/midihub.js:1092`, `:1104`).

**`app.*`** (11 entries)

- `app.accent` — app.js r:583,1764 w:601
- `app.bassStyle` — jam.js r:425,949,970 w:1401,1412; settings.js r:791 w:801
- `app.click` — daw/engine.js r:480; pads.js r:209,312,351 w:313,318,351; settings.js r:281,1010 w:283
- `app.gtab.<group> (write)` — app.js w:780
- `app.gtab.<group> (read)` — app.js r:716
- `app.keepAwake` — app.js r:643; settings.js r:322,1012 w:324
- `app.pianoTone` — piano.js r:212 w:218
- `app.pluckTone` — app.js r:377 w:383
- `app.space` — app.js w:1200
- `app.theme` — app.js r:622,1618,1749 w:616
- `app.vol` — app.js r:260 w:266

**`audio.*`** (8 entries)

- `audio.inDefault` — settings.js r:475 w:542
- `audio.inGain` — audioin.js r:71 w:436
- `audio.inId` — audioin.js r:68 w:451; practice-input.js r:111; settings.js r:410,475,616,649 w:428,543; tonein.js r:73; woodshed.js r:741
- `audio.inLabel` — audioin.js r:79 w:327,453; settings.js r:455,455
- `audio.inPicked` — settings.js w:541
- `audio.monitor` — audioin.js r:69 w:346,406,468,571; settings.js r:396
- `audio.outId` — settings.js r:491 w:550
- `audio.tonein` — settings.js r:396 w:602; tonein.js r:26

**`cc.*`** (3 entries)

- `cc.active` — chordchart.js r:84 w:91,401,409
- `cc.charts` — chordchart.js r:76 w:78,90,409
- `cc.lumi` — chordchart.js r:531 w:428

**`ch.*`** (9 entries)

- `ch.barsPerChord` — chords.js r:133 w:1330
- `ch.bpm` — chords.js r:132 w:1326
- `ch.key` — chords.js r:128 w:1380
- `ch.libQuality` — chords.js r:125 w:692
- `ch.libRoot` — chords.js r:124 w:691
- `ch.scale` — chords.js r:129 w:780,1381
- `ch.sevenths` — chords.js r:131 w:781,1296
- `ch.track` — chords.js r:138 w:153
- `ch.view` — chords.js r:134 w:1231

**`fb.*`** (23 entries)

- `fb.automode` — fretboard.js r:2005 w:2010
- `fb.colorMode` — app.js r:1040 w:1068
- `fb.colors` — app.js r:1041 w:1077
- `fb.display` — fretboard.js r:66 w:91
- `fb.frets` — fretboard.js r:57 w:63,90
- `fb.lefty` — fretboard.js r:68 w:92
- `fb.migr24` — fretboard.js r:61 w:64
- `fb.mode` — app.js r:1301 w:1431; fretboard.js r:82 w:140; piano.js r:81; songs.js w:794; synthdeck.js r:1412; theorytab.js w:56
- `fb.noteColors` — app.js r:1042 w:1073
- `fb.orient` — fretboard.js r:69 w:1992
- `fb.pr.click` — fretboard.js r:1372 w:1586
- `fb.pr.dir` — fretboard.js r:1360 w:1514
- `fb.pr.pattern` — fretboard.js r:1357 w:1479
- `fb.pr.pause` — fretboard.js r:1365 w:1538
- `fb.pr.pausePos` — fretboard.js r:1366 w:1543
- `fb.pr.pick` — fretboard.js r:1362 w:1550
- `fb.pr.rate` — fretboard.js r:1370 w:1578
- `fb.pr.sound` — fretboard.js r:1371 w:1582
- `fb.pr.ssLock` — fretboard.js r:1364 w:1523
- `fb.root` — app.js r:845,1045,1299,1686,+2 w:1429; chordchart.js r:46; chords.js r:1350; fretboard.js r:51 w:87; jam.js r:170; lumi-practice.js r:322; midi.js r:955,1017,1031,1104,+3; midihub.js r:221; piano.js r:79; practice-router.js r:30; practiceplan.js r:57; songs.js w:792; studio.js r:77,641,1119 w:345; synthdeck.js r:1412; synthtab.js r:223; theorytab.js r:38 w:54; woodshed.js r:51,81,100,719
- `fb.scale` — app.js r:845,1300,1686,1689,+1 w:1430; chords.js r:1350 w:782; fretboard.js r:53 w:88; jam.js r:175; lumi-practice.js r:322; midi.js r:956,1018,1032,1106,+2; midihub.js r:221; piano.js r:80; practice-router.js r:30; songs.js w:793; studio.js r:78,642,1119 w:346; synthdeck.js r:1412; synthtab.js r:223; theorytab.js r:43 w:55; woodshed.js r:52,100,719
- `fb.tuning` — fretboard.js r:55 w:89
- `fb.view` — fretboard.js r:71

**`help.*`** (3 entries)

- `help.done` — help.js r:278 w:164
- `help.level` — app.js r:982 w:991
- `help.seen` — help.js r:286 w:287

**`hx.*`** (22 entries)

- `hx.* (wrapper)` — helix.js r:48 w:49
- `hx.bridge` — helix.js r:304 w:892,893
- `hx.bridgeAuto` — helix.js r:1096 w:892,892
- `hx.ccs` — helix.js r:778 w:960,964,965,968
- `hx.ch` — helix.js r:143 w:969
- `hx.ctlCh` — helix.js r:144 w:970
- `hx.exp` — helix.js r:75 w:935,936
- `hx.favs` — helix.js r:197 w:200
- `hx.followTempo` — helix.js r:592,888 w:950
- `hx.kv` — helix.js r:75 w:125,617
- `hx.mix` — helix.js r:781,1009,1012,1038,+1 w:1009,1041
- `hx.mixCh` — helix.js r:1039
- `hx.mixLayer` — helix.js r:781,1009,1012,1038,+3 w:1008
- `hx.monHex` — helix.js r:558,887 w:1016
- `hx.monMidi` — helix.js r:556,887 w:1014
- `hx.monNet` — helix.js r:557,887 w:1015
- `hx.netTuner` — helix.js r:798,888 w:952
- `hx.prog` — helix.js r:75 w:121,247,908
- `hx.safe` — helix.js r:154 w:903
- `hx.setlist` — helix.js r:75 w:124,247,907
- `hx.view` — helix.js r:70 w:792
- `hx.xy` — helix.js r:75 w:945

**`ideas.*`** (1 entries)

- `ideas.list` — studio.js r:105 w:110; woodshed.js r:715 w:727

**`jam.*`** (1 entries)

- `jam.track` — jam.js r:834

**`jam2.*`** (8 entries)

- `jam2.comp` — jam.js r:805 w:853
- `jam2.energy` — jam.js r:801 w:851
- `jam2.genre` — jam.js r:800,800 w:850
- `jam2.kit` — jam.js r:807 w:854
- `jam2.migr` — jam.js r:833 w:843
- `jam2.mix` — jam.js r:809 w:855
- `jam2.sections` — jam.js r:817 w:856
- `jam2.swing` — jam.js r:803 w:852

**`kl.*`** (6 entries)

- `kl.dbltap` — keylessons.js r:110 w:754
- `kl.prog` — keylessons.js r:99 w:106
- `kl.reps` — keylessons.js r:108 w:735
- `kl.sel` — keylessons.js r:107 w:192,201,733,741,+1
- `kl.speedup` — keylessons.js r:109 w:753
- `kl.tier` — keylessons.js r:527 w:202,734,866

**`learn.*`** (1 entries)

- `learn.instrument` — learn-instruments.js r:29 w:35

**`lights.*`** (9 entries)

- `lights.bright` — lights.js r:71 w:169; midi.js r:929
- `lights.display` — midi.js r:1029 w:1314
- `lights.displayEnabled` — midi.js r:433,1045,1118,1129,+1 w:454
- `lights.led` — midi.js r:435,1063 w:1316,1326
- `lights.octHand` — lights.js r:73 w:149; piano.js r:1791
- `lights.on` — midi.js r:438,1049 w:1317
- `lights.outputId` — midi.js r:406,429,443,453,+1 w:419,453,472
- `lights.outputName` — midi.js r:413 w:420,422,474
- `lights.v1` — midi.js r:1054 w:1056

**`met.*`** (9 entries)

- `met.bpm` — app.js r:1334,1344 w:1451; arrange.js r:566; chordchart.js r:245,306; daw/engine.js r:382; fretboard.js r:1369 w:1565,2082; helix.js r:949,949; jam.js r:846 w:1178; metronome.js r:208 w:253; midihub.js r:678,1372; pads.js r:130; piano.js r:425,1609 w:1666; practiceplan.js r:62 w:183; songs.js r:603,697 w:616; studio.js r:76,1120; synthdeck-scope.js r:57; theorytab.js r:219; woodshed.js r:396
- `met.levels` — metronome.js r:224 w:234
- `met.sig` — app.js r:1335 w:1456; metronome.js r:209 w:274; synthdeck-scope.js r:53
- `met.sndAcc` — metronome.js r:210,210
- `met.sndBeat` — metronome.js r:211,211
- `met.sndSub` — metronome.js r:212,212
- `met.subdiv` — metronome.js r:213 w:662
- `met.trainer` — metronome.js r:216 w:235
- `met.vol` — metronome.js r:215 w:669

**`midi.*`** (14 entries)

- `midi.allIn.v1` — midi.js r:55 w:57
- `midi.appSound` — midi.js r:122,126 w:122,1272,1274
- `midi.bendOn` — midi.js r:67 w:1244
- `midi.bendRange` — midi.js r:63 w:1250
- `midi.inputId` — midi.js r:633,679,682 w:56,577,586,693
- `midi.lights` — midi.js r:1051
- `midi.lumi` — lights.js r:72 w:152; midi.js r:1055,1069 w:1055
- `midi.lumiRoot` — midi.js r:969
- `midi.lumiScale` — midi.js r:970
- `midi.outputId` — midi.js r:637,680,683 w:620,712
- `midi.outputName` — midi.js r:594 w:620
- `midi.rangeLo` — midi.js r:1078 w:1088
- `midi.voiceAuto` — midi.js r:121 w:123
- `midi.wanted` — helix.js r:1095; midi.js r:1226 w:1252; midihub.js r:1803; synthtab.js r:347

**`midihub.*`** (30 entries)

- `midihub.* (wrapper)` — midihub.js r:120 w:124
- `midihub.deck / decklib / deckvals / names` — synthdeck.js r:174 w:193
- `midihub.assignnames` — synthdeck.js r:1322,1751 w:1323
- `midihub.ccs` — midihub.js r:130 w:991,1032,1034,1120,+1
- `midihub.ch` — midihub.js r:127 w:470
- `midihub.dev` — midihub.js r:1190,1210 w:1200
- `midihub.hear` — midihub.js r:694,727,744 w:995; synthlive.js r:362; synthtab.js r:46
- `midihub.hex` — midihub.js r:634,900 w:1076
- `midihub.kv` — midihub.js r:343 w:346,349
- `midihub.lsb` — midihub.js r:411,416,824 w:415,418,1022
- `midihub.model` — midihub.js r:1191,1201,1210 w:1201
- `midihub.msb` — midihub.js r:411,416,823 w:414,418,990,1022
- `midihub.naming` — midihub.js r:146,944,944 w:1089
- `midihub.oct` — midihub.js r:128 w:674
- `midihub.outId` — midihub.js r:301 w:979,1796
- `midihub.plLoop` — midihub.js r:1240 w:1700
- `midihub.plRoute` — midihub.js r:1239 w:1713
- `midihub.plShift` — midihub.js r:1535 w:1469,1706,1708
- `midihub.plTempo` — midihub.js r:1237 w:1697
- `midihub.plTrans` — midihub.js r:1533 w:1705
- `midihub.plVel` — midihub.js r:1238 w:1699
- `midihub.profile` — midihub.js r:126,336 w:989
- `midihub.prog` — midihub.js r:407,825 w:418,545,1022
- `midihub.rules` — midihub.js r:131,132 w:132,555,602,1043,+3
- `midihub.rulesApp` — midihub.js r:239,861 w:1042
- `midihub.rulesIn` — midihub.js r:536,860 w:1041
- `midihub.split` — midihub.js r:586 w:600,601
- `midihub.thru` — midihub.js r:568,727,743 w:994; practice-router.js r:172
- `midihub.vel` — midihub.js r:129 w:1001
- `midihub.view` — midihub.js r:971 w:698; synthtab.js r:62

**`pads.*`** (5 entries)

- `pads.base` — pads.js r:39 w:413
- `pads.leds` — pads.js r:42 w:418
- `pads.map` — pads.js r:71 w:344,429
- `pads.mode` — pads.js r:37 w:406
- `pads.track` — pads.js r:49 w:380,385

**`plugins.*`** (1 entries)

- `plugins.list` — plugins.js r:25 w:29

**`pn.*`** (19 entries)

- `pn.assist` — app.js r:982
- `pn.display` — piano.js r:1435 w:1592
- `pn.hand` — piano.js r:1715 w:1727,1841
- `pn.look` — piano.js r:1438 w:1452
- `pn.orient` — piano.js r:1437 w:1599
- `pn.perf` — piano.js r:1493 w:519
- `pn.pr.click` — piano.js r:1615 w:1708
- `pn.pr.dir` — piano.js r:1607 w:1653
- `pn.pr.guide` — piano.js r:1734 w:1739
- `pn.pr.pattern` — piano.js r:1605 w:1634
- `pn.pr.pause` — piano.js r:1611 w:1690
- `pn.pr.pausePos` — piano.js r:1612 w:1695
- `pn.pr.rate` — piano.js r:1610,1610 w:1680
- `pn.pr.sound` — piano.js r:1614 w:1704
- `pn.qw` — piano.js r:1464 w:1550
- `pn.qwMap` — piano.js r:1467 w:58
- `pn.qwOct` — piano.js r:1465 w:1137
- `pn.synthPreset` — piano.js r:1923 w:1486
- `pn.voice` — piano.js r:1480 w:1485,1929

**`pp.*`** (6 entries)

- `pp.active` — practiceplan.js r:46 w:306,310
- `pp.gaps` — practiceplan.js r:221,229 w:227
- `pp.history` — practiceplan.js r:219 w:219
- `pp.running` — practiceplan.js r:150 w:153,167,182,218,+3
- `pp.sessions` — practiceplan.js r:125,130,274 w:126,134
- `pp.students` — practiceplan.js r:42 w:43,47,306

**`progress.*`** (2 entries)

- `progress.ui.instrument` — practice-progress-ui.js r:50 w:138,178
- `progress.ui.rangeDays` — practice-progress-ui.js r:52 w:141

**`qz.*`** (7 entries)

- `qz.clock` — quiz.js r:2305 w:2435,2437,2970
- `qz.home` — quiz.js r:1851 w:1809,2268
- `qz.instrumentProg` — practiceplan.js r:144; quiz.js r:1174,1180 w:1182
- `qz.items` — quiz.js r:197 w:221
- `qz.landed` — quiz.js r:2949 w:2950
- `qz.prog` — quiz.js r:1175,1194 w:1179
- `qz.sound` — quiz.js r:1224,1234,1302 w:2449

**`remote.*`** (4 entries)

- `remote.* (wrapper)` — remote.js r:40 w:41
- `remote.dbl` — remote.js r:83,108,333,374,+1 w:354,388
- `remote.map` — remote.js r:57 w:64
- `remote.pt` — remote.js r:208 w:353,387

**`scale.*`** (1 entries)

- `scale.lock` — app.js r:840 w:1742

**`sd.*`** (2 entries)

- `sd.playVoice` — settings.js r:306 w:314; studio.js r:209
- `sd.retroSecs` — settings.js r:289 w:298; studio.js r:23

**`sg.*`** (3 entries)

- `sg.click` — songs.js r:606 w:637
- `sg.lib` — songs.js r:220 w:224
- `sg.rate` — songs.js r:604 w:630

**`song.*`** (1 entries)

- `song.name` — arrange.js r:737; studio.js r:954,1147 w:1149

**`st.*`** (7 entries)

- `st.armed` — arrange.js r:165,211,524 w:228,297,524; pads.js r:440; piano.js r:1766; studio.js r:534,971,987,1099,+2 w:971,987
- `st.bars` — studio.js r:390 w:396
- `st.follow` — arrange.js r:666 w:712
- `st.loop` — arrange.js r:667 w:396,706
- `st.snap` — arrange.js r:664 w:719
- `st.tracks` — arrange.js w:46,296; pads.js w:67,125,361,379; studio.js r:380 w:395
- `st.zoomX` — arrange.js r:663 w:724,729

**`synthtab.*`** (10 entries)

- `synthtab.* (wrapper)` — synthlive.js r:23 w:24; synthtab.js r:36 w:37
- `synthtab.explain` — synthlive.js r:85; synthtab.js r:79 w:464
- `synthtab.fav` — synthtab.js r:76 w:481,516
- `synthtab.fsCC` — synthlive.js r:190,342 w:265,341
- `synthtab.live` — synthlive.js r:31 w:37
- `synthtab.mode` — synthtab.js r:78 w:465,601
- `synthtab.octStep` — synthlive.js r:205,355 w:336
- `synthtab.profile` — synthlive.js r:64 w:77,90
- `synthtab.profiles` — synthlive.js r:63 w:81,87,89,90,+2
- `synthtab.row` — synthtab.js r:113,613 w:466

**`tab.*`** (3 entries)

- `tab.fit` — fretboard.js r:78 w:2253
- `tab.orient` — fretboard.js r:76 w:2250
- `tab.size` — fretboard.js r:80 w:2256

**`th.*`** (3 entries)

- `th.cpBars` — theorytab.js r:483,483 w:505
- `th.cpCue` — theorytab.js r:484 w:500
- `th.cpDir` — theorytab.js r:481 w:494

**`tr.*`** (6 entries)

- `tr.best.<pair> (read)` — trainer.js r:234
- `tr.ccA` — trainer.js r:524 w:559
- `tr.ccB` — trainer.js r:525 w:563
- `tr.earBest` — trainer.js r:529 w:358
- `tr.earHarm` — trainer.js r:528 w:580
- `tr.sessions` — trainer.js r:68 w:118,127

**`tun.*`** (7 entries)

- `tun.a4` — tuner.js r:602 w:638
- `tun.anyOct` — tuner.js r:613 w:680
- `tun.bestStreak` — tuner.js r:605 w:505
- `tun.fretMax` — tuner.js r:612
- `tun.fretMin` — tuner.js r:611
- `tun.strings` — tuner.js r:607 w:577
- `tun.tuning` — tuner.js r:603 w:652

**`ws.*`** (19 entries)

- `ws.ach` — woodshed.js r:429,1157 w:432
- `ws.cal` — keylessons.js r:217; woodshed.js r:452,1101 w:1106
- `ws.display` — woodshed.js r:460 w:1256
- `ws.guide` — woodshed.js r:461 w:1262
- `ws.instr` — woodshed.js r:1398
- `ws.ladder.<title> (read, list view)` — woodshed.js r:1197
- `ws.ladder.<title> (read, new session)` — woodshed.js r:457
- `ws.lib` — woodshed.js r:402 w:406
- `ws.performance.audio` — performance-player.js r:352 w:303
- `ws.performance.countIn` — performance-player.js r:416 w:362
- `ws.performance.input` — performance-player.js r:416 w:348
- `ws.performance.inputKind` — performance-player.js r:416 w:351
- `ws.performance.instrument` — performance-player.js r:416 w:415; woodshed.js r:445 w:448
- `ws.performance.mode` — performance-player.js w:362
- `ws.performance.results` — performance-player.js r:77 w:82
- `ws.performance.tempo` — performance-player.js w:343
- `ws.streak` — woodshed.js r:1156
- `ws.weak` — woodshed.js r:438 w:695
- `ws.xp` — woodshed.js r:1155

**`xp.*`** (4 entries)

- `xp.days` — xp.js r:18
- `xp.goal` — xp.js r:20
- `xp.sprint` — xp.js r:89
- `xp.total` — xp.js r:19
