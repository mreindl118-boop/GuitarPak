# Phase A map — the app shell and everything keyed by page id

Read-only map of `origin/v2` at `5be2eab` (working tree `claude/verify-project-files-4bchk6-v2`).
Nothing in the repo was changed and no test suite was run. All line numbers are for that commit.

Files read in full: `js/app.js` (1767 lines), `index.html`, `js/help.js`, `sw.js`, `manifest.webmanifest`,
`tools/artifact_build.py`, `tools/bundle.py`, `android/build.sh`, `android/build.ps1`, `ios/sync-web.sh`,
`.github/workflows/*.yml`, `tests/run.sh`, `css/tokens.css` (head), the structure of `css/style.css`,
`docs/ROADMAP-2.0.md`, `docs/DESIGN-SYSTEM.md`. Everything else was grepped.

## 0. Headlines

1. **Three things define a page and must change together**: its id in `SPACES` (`js/app.js:42-45`), its
   `<section class="panel" id="panel-<id>">` in `index.html:91-116`, and its `<script>` tag (`index.html:121-167`).
   Remove only one or two of them and the result is either an error card ("Module failed to load",
   `js/app.js:1559-1561`) or a blank page (see section 3).
2. **`App.switchTo('<unknown id>')` is not validated** (`js/app.js:742-795`). It blanks the main area, clears the
   tab highlight and stores the bad id in `app.tab`. Every leftover link to a removed page fails this way, so
   Phase A should add a guard (section 3.3).
3. **`NO_CTX` and `LOCK_FREE` no longer exist on v2.** `grep -rn "NO_CTX\|LOCK_FREE"` over `*.js *.css *.html` finds
   nothing; the only trace is `js/app.js:800` (`classList.remove('noctx') // old shell compatibility`). The context
   bar is global (`js/app.js:797-806`) and scale lock is global (`lockActive()` is `lockOn()`, `js/app.js:841`).
   `CLAUDE.md:719,737,746` still describe both lists and is stale.
4. **There are no deep links.** No `location.hash`, `location.search`, `URLSearchParams` or `hashchange` anywhere in
   `js/` or `index.html` (the only `location.href` write is the APK download, `js/app.js:159`).
5. **Per-page CSS is not in `css/style.css`.** Every page injects its own styles with `App.injectCSS`
   (list in section 1). The exceptions are `css/lumi-practice.css` (LUMI pill only) and five shell rules in
   `style.css` that name Studio things (section 2.9). `css/tokens.css` has no per-page content and nothing uses a
   `--sl-*` token yet (0 hits in `js/`, `style.css`, `lumi-practice.css`, `index.html`).
6. **The Songs page depends on the MIDI Hub** for MusicXML and for "Play on synth" (`js/songs.js:694,703,708`).
   Moving `js/midihub.js` to `gear.html` breaks MusicXML → Woodshed and MusicXML → tab in the main app unless the
   reader is extracted first.
7. **`js/daw/engine.js` and `js/daw/synth.js` cannot simply leave `index.html`**: Jam, Woodshed, the performance
   player, Piano and Pads call `DAW.createDrums` / `DAW.createSynth` / `DAW.engine`
   (`js/jam.js:363,372`, `js/woodshed.js:493,497,1428`, `js/performance-player.js:19`, `js/piano.js:277-298`,
   `js/pads.js:45-379`). The roadmap keeps the sounds; the split of engine.js belongs to the Studio map.

## 1. Every page id registered today

28 ids are registered with `App.register` (25 pages in the nav, 2 sheets, 1 overlay page).
"Tour" = the key in `TOURS` in `js/help.js`. "Remote" = `onRemote` / `remoteKey` in the registration.
NO_CTX / LOCK_FREE: not applicable to any page (lists removed, headline 3).
Every `js/*` script tag in `index.html` has a matching entry in `sw.js` ASSETS and on disk (checked with a node
one-liner: 47 scripts, 47 files, 0 mismatches either way).

### Pages that stay in soundLAB (`index.html`)

| id | registered at | group (`app.js:60-68`) | panel `index.html` | script tag `index.html` | CSS prefix / injectCSS id | tour `help.js` | remote | sw.js ASSETS |
|---|---|---|---|---|---|---|---|---|
| `quiz` (home) | `js/quiz.js:2982` | `gtheory` Learn | :91 | :161 (+`xp.js` :160) | `qz-` / `quiz` (`quiz.js:2885`) | :69-76 | onRemote + remoteKey (`quiz.js:3007-3008`), onBack, onKey | :60 (+:59) |
| `practiceplan` | `js/practiceplan.js:331` | `gtheory` | :92 | :162 | `pp-` / `practiceplan` (:291) | :15-19 | onRemote, remoteKey `true` (:332-333) | :61 |
| `chords` | `js/chords.js:1413` | `gtheory` | :97 | :134 | `ch-` / `chords` (:1336) | :37-40 | none (onKey) | :28 |
| `theory` | `js/theorytab.js:556` | `gtheory` | :105 | :142 | `th-` / `theorytab` (:405) | :77-79 | none | :37 |
| `fretboard` | `js/fretboard.js:2200` | `ginst` Guitar | :93 | :133 | `fb-` / `fretboard` (:1672) | :26-30 | onRemote + remoteKey (:2204-2205) | :27 |
| `tab` | `js/fretboard.js:2274` | `ginst` | :94 | :133 (same file) | `fb-` | :31-33 | onRemote + remoteKey (:2278-2279) | :27 |
| `notation` | `js/fretboard.js:2282` | `ginst` | :95 | :133 (same file) | `fb-` | :34-36 | onRemote + remoteKey (:2286-2287) | :27 |
| `piano` | `js/piano.js:1902` | `gkeys` Keys | :98 | :135 (+`keylessons.js` :136) | `pn-`, `kl-` / `piano` (:1240), `keylessons` (`keylessons.js:819`) | :41-48 | onRemote only (:1906) | :29, :30 |
| `chart` | `js/chordchart.js:527` | `gkeys` | :99 | :137 | `cc-` / `chordchart` (:334) | **none** | none (onBack returns false) | :31 |
| `pads` | `js/pads.js:461` | `gkeys` | :111 | :152 | `pd-` / `pads` (:213) | :126-130 | none (onKey) | :50 |
| `songs` | `js/songs.js:851` | `gplay` Play | :101 | :138 | `sg-` / `songs` (:503) | :49-51 | onRemote + remoteKey (:854-855) | :33 |
| `jam` | `js/jam.js:1432` | `gplay` | :102 | :139 | `jam-` / `jam` (:989) | :52-57 | none | :34 |
| `shed` | `js/woodshed.js:1614` | `gprac` Train | :106 | :150 (+:146-149 progress, performance engine/player) | `ws-`, `pf-` / `woodshed` (:1557), `performance` (`performance-player.js:328`) | :58-62 | onRemote + remoteKey (:1622-1623), onKey | :43-47 |
| `tuner` | `js/tuner.js:725` | `gprac` | :103 | :140 | `tun-` / `tuner` (:615) | :63-65 | none (onKey) | :35 |
| `metronome` (sheet) | `js/metronome.js:696` | — (`SHEETS`, `app.js:927`) | :65-74, panel :72 | :132 | `met-` / `met` (:547) | :20-25 | none | :26 |
| `lights` (sheet) | `js/lights.js:177` | — (`SHEETS`) | :75-84, panel :82 | :167 | `lc-` / `lights` (:180) | :136-141 | none | :32 |
| `settings` (overlay page) | `js/settings.js:1001` | — | :107 | :166 | `set-` / `settings` (:10) | :142-145 | none | :38 |

### Pages that leave the main app in Phase A

| id | registered at | group | space | panel `index.html` | script tag | CSS | tour `help.js` | remote | sw.js ASSETS | Phase A |
|---|---|---|---|---|---|---|---|---|---|---|
| `arrange` | `js/arrange.js:756` | `gstudio` (`app.js:70`) | studio | :109 | :151 | `ar-` / `arrange` (:573); `.chip.ar-mini` in `css/style.css:649` | :85-90 | none (onKey) | :42 | removed |
| `tracks` | `js/studio.js:1257` | `gstudio` | studio | :110 | :145 | `st-` / `studio` (`studio.js:1161`) | :91-96 | none | :41 | removed |
| `song` | `js/studio.js:1255` | `gsketch` (`app.js:71`) | studio | :108 | :145 | `sd-` | :80-84 | none | :41 | removed |
| `ideas` | `js/studio.js:1256` | `gsketch` | studio | :116 | :145 | `sd-` | :131-135 | none | :41 | removed |
| `trainer` | `js/trainer.js:645` | `gprac` (`app.js:67`) | practice | :104 | :141 | `tr-` / `trainer` (:379) | :66-68 | onRemote, remoteKey `true` (:650-651), onKey | :36 | removed (folded into Plan + Exercises) |
| `synth` | `js/piano.js:1913` | `gkeys` (`app.js:64`) | practice | :100 | :135 (inside piano.js) | borrows the `pn-` DOM; rule `#panel-synth #pn-lessons{display:none}` at `piano.js:1303` | **none** | onRemote only (`piano.js:1944`) | :29 (piano.js) | removed (the voice picker `#pn-voice` already exists on Piano, `piano.js:1340`) |
| `lumipractice` | `js/lumi-practice.js:485` | `gkeys` | practice | :115 | :159; stylesheet link `index.html:17` | `lp-`, all rules scoped `#panel-lumipractice` in `css/lumi-practice.css:2-45` | **none** | onRemote, remoteKey fn (:489-492) | :58 and `css/lumi-practice.css` :10 | removed as a page (folded into Keys lessons; whether the file survives as a mounted card is the fold's decision) |
| `deck` | `js/synthtab.js:520` | `gsynth` (`app.js:65`) | practice | :112 | :154 (+`synthdeck-maps.js` :156, `synthdeck-scope.js` :157, `synthdeck.js` :158) | `st-` / `synthtab` (:523), `sdk-` / `synthdeck` (`synthdeck.js:1657`), `synthscope` (`synthdeck-scope.js:485`) | :97-102 | onRemote, remoteKey `false` (:604-605), onBack | :55 (+:52-54, data file :57) | moves to `gear.html` |
| `liveset` | `js/synthlive.js:306` | `gsynth` | practice | :113 | :155 | `st-lv…` / `synthlive` (:309) | :103-108 | onRemote, remoteKey `false` (:368-369), onBack | :56 | moves to `gear.html` |
| `midihub` | `js/midihub.js:1801` | `gsynth` | practice | :114 | :153 | `mh-` / `midihub` (:1720) | :109-119 | none (onBack, onKey) | :51 | moves to `gear.html` |
| `helix` | `js/helix.js:1077` (`ID = 'helix'`, :47) | `ginst` (`app.js:63`) | practice | :96 | :163 | `hx-` / `helix` (:1044) | :120-125 | none (onKey) | :62 | moves to `gear.html` |

Notes on the table:

- `deck` borrows the Hub's DOM: `js/synthtab.js:28` reads `#panel-midihub`, and its CSS targets
  `#panel-deck .mh-view[data-view=control]` (`synthtab.js:524`). `js/synthdeck.js:526` also reads `#panel-midihub`.
  `deck`, `liveset`, `midihub` and the three `synthdeck*` files therefore move as one unit.
- `js/synthlive.js:327` hides `.topbar`, `#tabbar-m` and `.foot` while live, so `gear.html` needs those same shell
  elements (or the rule changes).
- Prefix clash today: the Studio "Tracks" page and the Synth tab both use `st-` ids (`studio.js`: 24 `id="st-…"`,
  `synthtab.js`: 32, `synthlive.js`: 39). It disappears once Studio is gone.
- Scripts tied to a leaving page but not registering one: `js/practice-router.js` (`index.html:127`, `sw.js:23`) is
  only used by `lumi-practice.js` (:34,91,317,437-444) and one guard in `midihub.js:568`; `js/plugins.js`
  (`index.html:165`, `sw.js:64`) is the plug-in API.

## 2. Registries in `js/app.js` and what must change

### 2.1 `SPACES` — `js/app.js:42-45`

```
practice: ['quiz','practiceplan','fretboard','tab','notation','helix','chords','piano','chart','synth','pads',
           'deck','liveset','midihub','lumipractice','songs','jam','shed','tuner','trainer','theory']
studio:   ['arrange','tracks','song','ideas']
```
After Phase A the main app's list is
`['quiz','practiceplan','fretboard','tab','notation','chords','piano','chart','pads','songs','jam','shed','tuner','theory']`
(14 pages). The gear list is `['deck','liveset','midihub','helix']`.
`SPACES.practice[0]` is the home page everywhere it is used (see 2.7); `quiz` stays first.

### 2.2 `SPACE_LABELS` — `js/app.js:46-52`, `SUB_LABELS` — `js/app.js:75-81`

Drop the entries for `trainer`, `synth`, `song`, `arrange`, `tracks`, `ideas`, `lumipractice` in both maps
(`app.js:49-51` and `:78-80`). `midihub`, `deck`, `liveset`, `helix` stay if one `app.js` serves both apps.
The comment at `app.js:37-41` ("Two workspaces over one app") goes with the Studio space.

### 2.3 `PANEL_ORDER` — `js/app.js:55`

`SPACES.practice.concat(SPACES.studio).concat(['metronome','lights','settings'])`. Becomes the single page list plus
the three overlays. `boot()` walks it (`app.js:1555-1569`) and silently skips an id with no panel (`:1558`), so a
shared `app.js` tolerates ids whose panel is absent, but the nav does not (2.4).

### 2.4 `GROUPS` — `js/app.js:60-73`, `groupOf` — `js/app.js:83-89`

| line | group | today | after Phase A (main app) |
|---|---|---|---|
| :62 | `gtheory` Learn | quiz, chords, theory, practiceplan | unchanged |
| :63 | `ginst` Guitar | fretboard, tab, notation, helix | fretboard, tab, notation |
| :64 | `gkeys` Keys | piano, chart, synth, pads, lumipractice | piano, chart, pads |
| :65 | `gsynth` Synth | deck, liveset, midihub | **removed** (→ `gear.html`) |
| :66 | `gplay` Play | songs, jam | unchanged |
| :67 | `gprac` Train | shed, trainer, tuner | shed, tuner |
| :70 | `gstudio` Studio | arrange, tracks | **removed** |
| :71 | `gsketch` Sketch | song, ideas | **removed** |

- Keep the id `gtheory`: it is referenced outside `app.js` by `css/style.css:282` and `:970` (the "goal due" dot)
  and by `tests/game.test.js:372`. No other group id is referenced outside `app.js` (grep over js/css/html/md;
  only docs mention `gsynth`/`gkeys`).
- `groupOf` concatenates both spaces (`app.js:84`); it becomes a walk over one array.
- `paintSubnav` hides the pill strip for groups with fewer than 2 pages (`app.js:727`), so a one-page Helix group in
  `gear.html` needs no extra work.
- `js/practiceplan.js:329` styles `#subnav:has(.subtab[data-page="practiceplan"])` — unaffected.

### 2.5 Icons — `ICONS` `js/app.js:196-241`

Group icons used: `learn`, `guitar`, `keys`, `sliders`, `note`, `target`, `idea`. Only `idea` (`app.js:219`) becomes
unused: its sole use is the Sketch group (`app.js:71`; `grep "'idea'" js/` finds nothing else). `sliders` is still
used by `fretboard.js:2234` and by the Synth group in gear. `record` is still used by `pads.js:206`.
Recommendation: do not prune `ICONS` in Phase A (many modules call `App.icon` through aliases, so a literal grep
cannot prove an icon is unused).

### 2.6 Default tabs and stored tab keys

- Per group: `goGroup` reads `app.gtab.<gid>` and falls back to `pages[0]` (`app.js:716-717`); `switchTo` writes it
  (`app.js:780`).
- Per space: `tabStoreKey` (`app.js:692`) → `app.tab` (practice) / `app.tabStudio` (studio); written at `app.js:792`,
  read at `:915`, `:1210`, `:1652`.
- `app.space` is written at `app.js:1200` and **never read** (grep: no other occurrence in `js/` or `tests/`).

### 2.7 Home page and the Back stack

- Home = `SPACES[space][0]`: `app.js:778` (visiting home clears `visited`), `:915-916` (settings fallback),
  `:1108` (Back goes home), `:1210-1211`, `:1652-1653` (boot default).
- Back: `visited` / `backNav` / `guarded` (`app.js:1089`), `backStep` (`:1096-1110`). Two lines are space-aware:
  `:1105` (`SPACES[spaceOf(p)]`) and `:1107` (`if (space !== 'practice') … setSpace('practice')`). `:1107` is deleted;
  `:1105` reduces to "is `p` still a page". `visited` is in memory only, so no stale state survives a reload.

### 2.8 Other registries and shell code that name pages or spaces

| what | where | change |
|---|---|---|
| `SHEETS` | `app.js:927` | none |
| `spaceOf`, `tabStoreKey` | `app.js:688-692` | delete or reduce (section 6) |
| `populateNav`, `goGroup` use `GROUPS[space]` | `app.js:700`, `:712` | index one list |
| `switchTo` space crossing | `app.js:768` | delete; add the unknown-id guard (3.3) |
| `addPage` (plug-in surface) | `app.js:885-910`, export `:1758` | see 2.10 |
| `toggleSettings` uses `SPACES[space]` | `app.js:914-916` | one list |
| transport button `#cx-met` | `app.js:1460-1506` | Studio branches `:1467-1470`, `:1477`, `:1484-1491`, listeners `:1495-1497`, `:1505` go; comment `:1460-1463`, `:1471-1473` |
| workspace wipe | `app.js:1194-1255` | delete (section 6) |
| `#space-btn` wiring | `app.js:1625-1631`, `:1641-1650` | delete |
| exports `space`, `setSpace` | `app.js:1755-1756` | section 6 (`switchTo` is exported twice, `:1750` and `:1757`) |

### 2.9 Shell markup and CSS that go with the Studio space

- `index.html:40` `#space-btn`; `index.html:85-89` `#wipe`; `index.html:54-55` `#cx-rec` and `#cx-rec-msg`.
  **`#cx-rec` must be removed in the same change as `js/studio.js`**: the rule that hides it in practice
  (`[data-space="practice"] #cx-rec{display:none}`) is injected by `studio.js:1162`, so without studio.js an empty
  button would appear in the clef dropdown.
- `css/style.css:219-230` (`#wipe`), `:294-296` comment and `:304` (`#space-btn`), `:432-443` (`#ctx-btn.rec`, the
  capture dot), `:465-466` comment, `:649` (`.chip.ar-mini`), `#sd-toast` in the selectors at `:889`, `:906`, `:973`,
  `:981-983`, `:988`, `:1013-1014` (`#space-btn` on phones).
- `help.js` tours to delete: `song` :80-84, `arrange` :85-90, `tracks` :91-96, `ideas` :131-135, `trainer` :66-68.
  Tours `deck` :97-102, `liveset` :103-108, `midihub` :109-119, `helix` :120-125 must be available in `gear.html`
  (`tests/midihub.test.js:47` asserts `Help.TOURS.midihub`).
- Tour and welcome text that names removed things (text edits, no logic): `help.js:21` ("and the Studio all follow
  it"), `:27` ("the Studio's note editor"), `:59` ("captured as a take in your Studio Ideas"), `:61` ("pull in any
  Studio track"), `:128` ("on the Tracks page"), `:143` ("studio capture options … and plugins"), and the welcome
  at `:251` (two workspaces, Studio button), `:252` ("and the Studio follows"), `:253` (lists "Learn, Guitar, Keys,
  Play, Practice" and "Piano / Synth / Pads").

### 2.10 The plug-in surface in the shell

`App.addPage` (`app.js:886-910`) exists for `SoundLab.registerPage` (`js/plugins.js:73-75`). Its only other callers
are tests: `tests/remote.test.js:57` (builds its `rmtest` page with it) and `tests/helix.test.js:18` (an old stored
plug-in). Removing it means rewriting the start of `remote.test.js`.

## 3. Boot with stale stored state

### 3.1 What boot does (`js/app.js:1554-1684`)

1. Init every id in `PANEL_ORDER` that has a panel (`:1555-1569`).
2. Force `space = 'practice'` (`:1643-1645`); the stored `app.space` is ignored.
3. `startTab = store.get('app.tab', SPACES.practice[0])`; if it is not in `SPACES.practice`, use `SPACES.practice[0]`
   (`:1652-1653`); `switchTo(startTab)` (`:1654`).

### 3.2 Each stale key after Phase A

| stored key | stale value | what happens | safe? |
|---|---|---|---|
| `app.tab` | `trainer`, `synth`, `lumipractice`, `helix`, `deck`, `liveset`, `midihub` | not in the page list → boots to `quiz` (`app.js:1653`) | yes, provided the id is removed from `SPACES`. A user whose last page was the Deck lands on Exercises with no explanation |
| `app.tab` | a sheet id such as `metronome` | same fallback (covered by `tests/nav.test.js:25-26`) | yes |
| `app.gtab.gkeys` | `synth` or `lumipractice` | `goGroup` falls back to `piano` (`app.js:717`) | yes (`tests/nav.test.js:46` currently asserts "Keys remembers Synth" and must change) |
| `app.gtab.gprac` | `trainer` | falls back to `shed` | yes |
| `app.gtab.ginst` | `helix` | falls back to `fretboard` | yes |
| `app.gtab.gsynth`, `.gstudio`, `.gsketch` | any | group no longer exists; key is never read | yes (orphan) |
| `app.tabStudio` | any | only read through `tabStoreKey('studio')` (`app.js:692`); unreachable once Studio is gone | yes (orphan) |
| `app.space` | `studio` | never read | yes (orphan) |
| Settings return (`prevTab`) | in memory | re-validated at `app.js:914-916` | yes |

Orphan keys should be left out of the one-time `guitarlab.*` → `soundlab2.*` import: `app.space`, `app.tabStudio`,
`app.gtab.gsynth`, `app.gtab.gstudio`, `app.gtab.gsketch` (and `app.tab` / `app.gtab.*` values naming a removed page).

### 3.3 `App.switchTo('<removed id>')` — the unsafe path

`switchTo` (`js/app.js:742-795`) never checks that `name` is a page. For an id that is neither `settings`, a sheet,
nor in `SPACES.studio`: `spaceOf` returns `'practice'` (`:689`), so it runs the normal path — hides the current
page, sets `active = name` (`:777`), finds no group (`:779`), hides the pill strip, toggles every `.panel` off
(`:786-788`, nothing matches `panel-<name>`), calls no `onShow`, and stores the bad id in `app.tab` (`:792`).
Result: an empty main area with no tab highlighted. The next boot recovers (3.2), the current session does not.

Recommended guard at the top of `switchTo`: if `name` is not `settings`, not in `SHEETS` and not in the page list,
map it through a small redirect table and otherwise go home. Suggested table: `trainer → practiceplan`,
`synth → piano`, `lumipractice → piano`, `arrange/tracks/song/ideas → quiz`, and `deck/liveset/midihub/helix →`
open `gear.html` (section 7).

### 3.4 Every `switchTo` call in `js/` (32 lines outside `app.js`, all listed here)

Calls whose target is removed or moved:

| call site | target | status after Phase A |
|---|---|---|
| `js/learn-instruments.js:64` via `ENTRIES.synth[1]` at `:22` (`page: 'synth'`, "Synth keyboard") | `synth` | **broken link in a kept module** — change to `piano` or drop the entry |
| `js/songs.js:708` → `SLMidiHub.player.show()` → `js/midihub.js:1825` `App.switchTo('midihub')` | `midihub` | cross-app (section 4) |
| `js/midihub.js:1460` (`plOpenAsTab`) | `songs` | Hub (gear) → Songs (main); already guarded by `if (!App.songs)` at `:1456` and the button disables at `:1669` |
| `js/synthtab.js:479`, `:480` | `liveset` | fine inside gear |
| `js/arrange.js:429` | `tracks` | file removed |
| `js/studio.js:898`, `:1151` | `tracks` | file removed |
| `js/studio.js:1152` | `ideas` | file removed |
| `js/studio.js:1153`, `:1154` | `jam`, `piano` | file removed |

Calls whose target stays (no change needed): `chordchart.js:476` (shed), `fretboard.js:2086`, `:2244` (fretboard),
`keylessons.js:758` (lights), `lights.js:142`, `:159` (settings), `practiceplan.js:187` (`item.page`, see section 4),
`practiceplan.js:300` (lights), `quiz.js:1972` (pads), `:1973` (piano), `:1974`, `:1975`, `:2460` (shed), `:1976`
(fretboard), `:1983` (chords), `:1984` (theory), `:2443` (piano), `:2951` (quiz), `settings.js:960` (lights),
`songs.js:719` (shed), `theorytab.js:533` (chords).

Tests that call `switchTo` on a removed id or use the space switch (will fail until reworked):
`tests/display-master.test.js:128`, `tests/lights.test.js:123,130`, `tests/lumi-practice.test.js:99,230,321,442`,
`tests/nav.test.js:46,155-172`, `tests/remote-keys.test.js:317`, `tests/remote-plan.test.js:73,146,184`,
`tests/remote-runners.test.js:199,385`, `tests/smoke.test.js:22-24`, `tests/context-global.test.js:7-8,60-62,89`.
Tests that navigate to a page moving to gear (need `gear.html` as their URL): `helix`, `midihub`, `midihub-lock`,
`midihub-player`, `midihub-wheel`, `multiin`, `nav`, `remote-runners`, `synthconn`, `synthconnect`,
`synthdeck-scope`, `synthdeck`, `synthtab` (`tests/env.js` gives one `URL`, default `…/index.html`).

## 4. Cross-page links by page id that point at a removed or moved page

### 4.1 Hard links (code)

| where | what | problem |
|---|---|---|
| `js/learn-instruments.js:22` | Learn bar entry "Synth keyboard" → page `synth` | blank page (3.3) |
| `js/songs.js:537`, `:706-710` | "Play on synth" button → Hub Player | `SLMidiHub` absent in the main app → message "The MIDI Hub is not loaded" (`songs.js:694`) |
| `js/songs.js:701-704` (`openedAsMidiBytes`), used by "Practice" (`:715`) and "Open as tab" (`:726`) | MusicXML is converted by the Hub Player (`SLMidiHub.player.toMidiBytes`) | **MusicXML → Woodshed and MusicXML → tab stop working** in the main app. No other MusicXML reader exists (`grep -i musicxml js/woodshed.js js/performance-*.js js/chordchart.js` = 0 hits) |
| `js/midihub.js:1454-1462` | "Open as tab" → Songs | disabled automatically in gear (`:1456`, `:1669`) |
| `js/practice-router.js:172-173` | refuses to start while `midihub.thru` is on; message "Turn MIDI Hub Thru off…" | the store check still works (same origin, if both apps share the prefix); the wording points at a page in the other app |
| `js/quiz.js:2951` | first-run landing checks `App.space === 'practice'` | never fires if `App.space` is removed without editing this line |
| `js/pads.js:441` | `App.space === 'studio' && armed` | dead branch after Studio; reduces to `App.active !== 'pads'` |
| `js/piano.js:1766` | `studioArmed = App.space === 'studio' && …` | dead after Studio |
| `js/keylessons.js:84`, `:269` | `App.active === 'synth' ? 'synth' : 'piano'` | dead branch once the Synth page is gone (the card is already piano-only, `:123`, `:137`) |
| `js/plugins.js:58` | "Built in now: open Guitar › Helix" | file removed |

### 4.2 `fb:practice`

Handled only by `js/fretboard.js:2068-2088` (stays). Emitters: `js/chords.js:1287`, `js/practiceplan.js:186`,
`js/quiz.js:1981`, `js/theorytab.js:536` (all stay) and `js/trainer.js:554` (removed with the Trainer). No emitter
points at a removed page. The comment at `fretboard.js:2065` ("from a Trainer prompt") is stale after the fold.

### 4.3 Practice plan `RULES` — `js/practiceplan.js:10-17`

Rule targets: `tuner`, `piano`, `shed`, `chords`, `jam`, `shed`, `quiz`, `fretboard`. Starter rows (`:115-120`):
`tuner`, `shed`, `quiz`, `piano`, `fretboard`. Launch at `:186-187` (`fb:practice` for the fretboard, else
`App.switchTo(item.page)`). **None targets a removed or moved page**, and `git log -S"'trainer'" -- js/practiceplan.js`
is empty, so stored plans (`pp.students`) cannot hold a `trainer` page either.

### 4.4 Text that names a removed or moved page (kept modules)

- `js/settings.js:113-124` "Studio" card (retro capture, idea voice) and `:75`, `:77`, `:123` Studio wording.
- `js/settings.js:199` Hands-free text lists "LUMI practice … the Trainer, Live sets and the Deck".
- `js/settings.js:235-243` and `:680-723` Plugins card and its wiring (`window.SoundLab`).
- `js/settings.js:899` chip text "Helix (use the Helix page)".
- `js/piano.js:1340` voice picker title "the Studio's MPE synth presets".
- `js/woodshed.js:1169` ("lands as a take in your Studio Ideas"), `:1180` button "+ From Studio track", `:1429`,
  `:1431` (import from `DAW.engine.tracks`, `:1428`).
- `js/pads.js:266`, `:285` ("on the Tracks page", "anywhere in the Studio").
- `js/performance-player.js:329` ("MIDI/Studio notes").
- `js/jam.js:351`, `:1090` use "Studio" as a drum-kit name — not the workspace; leave.
- In modules moving to gear, text that points back at main-app chrome: `js/midihub.js:740`, `:748` ("Lights &
  help"), `js/synthdeck.js:642`, `js/synthtab.js:371`, `js/helix.js:642` ("Settings › MIDI"). These stay true only
  if `gear.html` carries Settings and the Lights sheet (section 7).

## 5. Everything outside `js/` that enumerates files or pages

| file | lines | what it lists | Phase A change |
|---|---|---|---|
| `sw.js` | `:5-99` ASSETS, `:4` CACHE | every css/js/font/icon/sample by name | remove `js/trainer.js` :36, `js/studio.js` :41, `js/arrange.js` :42, `js/lumi-practice.js` :58, `css/lumi-practice.css` :10, `js/plugins.js` :64 (and :23 `js/practice-router.js`, :39-40 `js/daw/*` only if those files really go); **add `gear.html`** and any new shared file; bump CACHE (`soundlab2-v3` → next). Entries :51-57 and :62 stay because one worker serves both pages |
| `index.html` | `:15-17` stylesheets, `:91-116` panels, `:121-167` scripts | the page and script list | panels :96, :100, :104, :108-110, :112-116 go; scripts :141, :145, :151, :153-158, :163, :165 go (:159 `lumi-practice.js` per the fold; :143-144 `js/daw/*` per the Studio map); stylesheet :17 goes; `#space-btn` :40, `#cx-rec` :54-55, `#wipe` :85-89 go |
| `manifest.webmanifest` | `:1-25` | no file list beyond two icons; `start_url` and `scope` are `.` | nothing required; `:4` description is optional copy. `gear.html` is inside the same scope |
| `tools/artifact_build.py` | `:20` ASSET_DIRS (`js css fonts icons samples data`), `:21` ASSET_EXT, `:24-41` `page_html()` reads only `index.html` | whole directories, plus one page | `gear.html` is **not staged** (it is a root file). Either stage it as a supporting page or hide the Gear link when `window.SL_ARTIFACT` is set (Web MIDI is refused in the viewer anyway). Deleted js files drop out automatically, but the published artifact keeps old files until they are removed with `null` |
| `tools/bundle.py` | `:12-13` SCRIPTS includes `trainer.js` | superseded single-file build | delete the tool or drop `trainer.js` from the list |
| `android/build.sh` | `:32` (`index.html`, `manifest.webmanifest`), `:33` (`css js icons fonts samples data`) | offline fallback bundle | add `gear.html` to :32 |
| `android/build.ps1` | `:29-30`, `:31` | same | add `gear.html` |
| `ios/sync-web.sh` | `:8` (`index.html`, manifest), `:9` (`css js icons fonts samples`) | iOS bundle | add `gear.html`; **`data/` is already missing here** (the MODX names file never reaches the iOS bundle) |
| `.github/workflows/pages-next.yml` | `:70` | copies the whole tested tree to `next/` | none; `gear.html` is published as `/next/gear.html` automatically |
| `.github/workflows/pages.yml` | `:60-65` whole tree; `:180-189` release probe built from `index.html` scripts and styles | probe list | the probe never sees `gear.html` or gear-only scripts; it only runs for web 1.0.0 (`:132`), so it is dormant for 2.0 |
| `.github/workflows/tests.yml` | `:55` | runs `tests/run.sh` | none |
| `.github/workflows/ios.yml` | `:33-37` | runs `ios/sync-web.sh` | none |
| `tests/run.sh` | `:17` suite list, `:9` default `SL_URL` | 62 suite names | drop or rewrite `lumi-practice` (and anything Trainer/Studio-only); gear suites need the gear URL |
| `tests/context-global.test.js` | `:7-8`, `:60-62` | full page matrix, compared with the panels in `main` | rewrite the two arrays |
| `tests/smoke.test.js` | `:22` | page walk incl. `synth`, `trainer`, `arrange`, `tracks`, `song`, `ideas` | rewrite |
| `tests/nav.test.js` | `:33-48`, `:155-172` | tab and pill labels; the Studio space | rewrite |
| `tests/release-workflow.test.js` | `:18` | same asset derivation as `pages.yml` | none unless the workflow changes |
| `README.md` | `:19-31` tools table; `:61-80` architecture block | rows for MIDI Hub :26, Synth Deck :27, Helix :28, LUMI practice :29, Trainer :31; `js/trainer.js` at :74 | edit rows; add the Gear app |
| `CLAUDE.md` | Layout block and "Cross-module conventions" (`:683-690`, `:719`, `:737`, `:746`) | every file and registry | rewrite for one space, no NO_CTX / LOCK_FREE, `gear.html` |
| `PLUGINS.md`, `plugins/` | whole files | plug-in API docs and samples | remove with the API |
| `releases/soundLAB-windows.bat` | `:14`, `:58` | opens the main URL only | no change in Phase A |
| `android/src/.../MainActivity.java` | `:40`, `:42`, `:125` | `LIVE_URL`, `BUNDLED_URL`, in-app URL check | none: `gear.html` starts with `LIVE_URL`, so it opens inside the Android app without a new APK |

Gap worth closing in Phase A: no test checks that every script in `index.html` (and `gear.html`) is in `sw.js`
ASSETS and on disk. It is true today; a moved file is the easy way to break offline use.

## 6. The workspace switch — what remains and the cleanest end state

### 6.1 Every code path that knows about spaces

| piece | where |
|---|---|
| data | `SPACES` `app.js:42-45`, `GROUPS` keyed by space `:60-73`, `var space` `:90` |
| helpers | `spaceOf` `:688-690`, `tabStoreKey` `:692` |
| nav | `populateNav` `:700`, `goGroup` `:712` |
| `switchTo` | space crossing `:768`; home test `:778`; store `:792` |
| `addPage` | `sp` argument `:886`, `:889`, `:897`, `:899` |
| settings toggle | `:914-916` |
| Back | `:1105`, `:1107`, `:1108` |
| wipe | `wiping`, `wipeId` `:1195-1196`; `applySpace` `:1198-1214` (writes `app.space`, sets `data-space`, paints `#space-btn`, emits `space`); `setSpace` `:1216-1255` |
| transport | `:1477`, `:1484-1491`, `on('space', paintCx)` `:1497` |
| boot | `#space-btn` click `:1625-1631`; `startSpace`, `data-space`, button label `:1643-1650`; start tab `:1652-1653` |
| exports | `get space()` `:1755`, `setSpace` `:1756` |
| markup | `index.html:40` (`#space-btn`), `:85-89` (`#wipe`) |
| CSS | `style.css:219-230`, `:304`, `:983`, `:988`, `:1014` |
| attribute `data-space` | set at `app.js:1201`, `:1645`; its **only** consumer is `studio.js:1162` |
| bus event `space` | emitted `app.js:1213`; its **only** listener is `app.js:1497` |
| readers of `App.space` | `pads.js:441`, `piano.js:1766`, `quiz.js:2951`, `studio.js:1098,1211,1217`; tests `lights.test.js:124`, `smoke.test.js:24`, `nav.test.js:158-169` |
| callers of `App.setSpace` | none in `js/` outside `app.js`; tests `nav.test.js:164,167` |

### 6.2 What is left once Studio is gone

Nothing functional: one page set, one group list, no second tab key, no curtain. `data-space` and the `space` event
lose their only consumers. The three live readers of `App.space` each test for a value that can no longer change.

### 6.3 Recommended end state

Remove the runtime switch completely; do not keep `App.setSpace` as a no-op.

- Delete `applySpace`, `setSpace`, `wiping`, `wipeId`, `spaceOf`, the `#space-btn` and `#wipe` markup and CSS, the
  `data-space` attribute, the `space` event and both exports.
- Fix the three readers in the same change: `quiz.js:2951` (drop the `App.space === 'practice' &&` test),
  `pads.js:441` (→ `if (App.active !== 'pads') return;`), `piano.js:1766` (drop `studioArmed`).
- Replace "space" with a **per-document page set** so one `app.js` serves `index.html` and `gear.html`
  (section 7). `SPACES.practice` / `GROUPS.practice` become that document's `PAGES` / `GROUPS`; `tabStoreKey` keeps
  its shape but returns one key per app.

Reason for not keeping a no-op: nothing in `js/` calls `App.setSpace`, and a constant `App.space` getter would keep
dead branches alive in three modules. The cost is three one-line edits and the rewrite of `tests/nav.test.js:155-172`.

## 7. What `gear.html` needs from the shell

- `js/app.js` reads `window.SLNotePalette` at load (`app.js:1044`, used at `:1047-1048`), so `js/note-palette.js`
  must load before it in `gear.html`, as in `index.html:122-123`. `Theory` is used lazily but by the context bar
  and by `midihub.js` (`Theory.scaleInfo`, `Theory.SCALES`).
- `boot()` tolerates missing chrome: every `getElementById` for `#space-btn`, `#settings-btn`, `#tabs`, `#subnav`,
  sheets and the context bar is guarded (`app.js:1164-1169`, `:1271`, `:1572-1595`, `:1625-1639`), and a
  `PANEL_ORDER` id without a panel is skipped (`:1558`). The nav is the part that is not tolerant: `GROUPS` must
  list only pages that exist in the document.
- Both documents share one origin and therefore one `localStorage`. With a shared `app.tab` each app would
  overwrite the other's last page; the gear app needs its own key. Group keys (`app.gtab.<gid>`) do not clash.
- Shared stores the gear pages read: `met.bpm` (`midihub.js:678,1372`, `helix.js:949`, `synthdeck-scope.js:57`),
  `fb.root` / `fb.scale` / `fb.mode` (`midihub.js:221`, `synthdeck.js:1412`, `synthtab.js:223`), `App.scaleLock`
  (`midihub.js:221`). They read correctly from storage, but a change made in the other window does not reach the
  bus.
- Gear modules use `App.toast`, `App.icon`, `App.midi`, `App.remote` hooks (`onRemote` on `deck` and `liveset`),
  `App.showBar`, `App.wake`. Their help tours live in `js/help.js`.
- `help.js:286-289` shows the welcome tour when `help.seen` is unset. Its text is about the main app, so a first
  visit that lands on `gear.html` would show the wrong welcome.
- One service worker (`sw.js`, scope = the folder) controls both pages; `gear.html` must be in ASSETS.
  A second web manifest is not needed for Phase A.

Lowest-risk shape for Phase A: `gear.html` carries the same header chrome as `index.html` (tab bar, clef dropdown,
metronome and lights sheets, settings page) with its own page set. The text references in 4.4 stay true and the
gear test suites only need a different URL. Phase H redesigns it.

## 8. PR #98 (`origin/claude/project-thread-rhqjuv`) — where it meets this work

`git diff origin/v2 origin/claude/project-thread-rhqjuv` touches 4 files (24 insertions, 15 deletions):

- `sw.js` lines 1-8: `CACHE` becomes `PREFIX + 'v4'` with `PREFIX = 'sl2-next-'` or `'sl2-live-'`; the activate
  filter (v2 `sw.js:113`) also deletes `soundlab2-*` and, on live, `guitarlab-*`. Phase A edits ASSETS and bumps
  CACHE at `sw.js:4`, so **the CACHE line conflicts**. Resolution: keep the scope-named prefix and bump its number.
- `js/app.js:101`: `APP_VERSION` `'1.4.1'` → `'2.0.0'`. Phase A does not need to touch that line.
- `version.json`: `web` → `2.0.0`, notes say "Your progress and settings carry over".
- `CLAUDE.md`.

If #98 merges first, the live site runs 2.0 code on `guitarlab.*` keys and its worker deletes every `soundlab2-*`
cache on each live update, so a Phase A beta that still names its cache `soundlab2-vN` keeps losing it (the known
Phase 0 caveat, `docs/ROADMAP-2.0.md:74-77`). The roadmap's "one-time import at the flip" then happens when Phase A
reaches live, not at the flip itself. No action taken here.

## 9. Found while reading (not Phase A scope, recorded so they are not lost)

- `js/app.js:1063` (`colors.label`) calls `curRoot()`, which is defined only inside `wireContextBar`
  (`app.js:1299`). It would throw in "note" mode. Nothing calls `colors.label(` today (grep), so it is latent.
- `js/synthlive.js:301` calls `App.wake('synthlive')`, but `App.wake` is an object (`app.js:670`). The `try/catch`
  swallows the error, so Go Live never holds the screen awake.
- `ios/sync-web.sh:9` does not copy `data/` (Android does, `android/build.sh:33`).
- `App.switchTo` is exported twice (`app.js:1750`, `:1757`).
- Storage prefix, shell side: `store.get/set` at `app.js:528`, `:536`; the colour cache bypasses `store` and
  hard-codes the prefix at `app.js:1024` and `:1031`; Settings export/import filters on it at `settings.js:964-966`
  and `:986`. 49 test files contain 175 `guitarlab.` literals.
