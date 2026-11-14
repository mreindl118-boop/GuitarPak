# Phase A map: the split into two apps (soundLAB + soundLAB Gear / `gear.html`)

Read-only map of branch `claude/verify-project-files-4bchk6-v2` = `origin/v2` at `5be2eab`.
Nothing in the repo was changed. All `file:line` references are to that commit.
Roadmap text that binds this: `docs/ROADMAP-2.0.md:9-12` (two apps from one codebase;
Gear = MODX live control, the Helix page, the Hub tools: rules, SysEx, monitor) and
`docs/ROADMAP-2.0.md:55` (Phase A: "move Synth tab + Helix behind `gear.html`").
Phase H (`docs/ROADMAP-2.0.md:64`) gives Gear its own design later; Phase A keeps today's look.

## 0. Bottom line

1. `gear.html` can be a second HTML entry that loads the SAME core scripts
   (`theory`, `note-palette`, `app`, `midi`, `remote`, plus `metronome`, `audioin`, `help`, `lights`)
   and only the seven gear modules. `app.js` picks its page set from `<html data-app="gear">`.
   No build step, no copied logic. The gear modules need no change to run there, with four
   small exceptions listed in section 5.
2. The main app reaches into the gear modules in ONE functional place: `js/songs.js` One Open
   uses `SLMidiHub.player` for "Play on synth" AND for reading MusicXML for "Practice" and
   "Open as tab" (`js/songs.js:693-705`). So `js/midihub.js` cannot simply leave `index.html`:
   the Player and its file readers must come out of it first (section 4).
3. Three Hub behaviours run in the background on every main-app page today, because
   `midihub.js` registers them at boot, not on show: Thru + key splits (`js/midihub.js:568`,
   listener at `:1770`), Rules on what the app hears (`:534-537`, installed at `:1769`), and the
   two-way knob tracking. After the split they only run while `gear.html` is open. This is a
   behaviour change the owner should decide on (open questions 1 and 2).
4. `App.switchTo()` of a page that is not in the document blanks the screen today
   (`js/app.js:768-788`). A cross-app guard at the top of `switchTo` is therefore required,
   not optional.

## 1. What the gear pages need from the shell

### 1.1 Scripts (load order matters)

| Script | Needed by gear? | Why (evidence) |
|---|---|---|
| `js/theory.js` | yes | `app.js` uses `Theory` in the context bar and scale lock (`js/app.js:845-849`, `:1275-1311`); `midi.js` uses `Theory.scaleInfo`/`SCALES`; `lights.js:64-65`. In `midihub.js` only the Player uses it (`:1538`, `:1551`, `:1564`, `:1702-1703`). |
| `js/note-palette.js` | yes, BEFORE app.js | `app.js:1044` reads `window.SLNotePalette` and calls it while the `App` object is built (`:1047-1048`). Order today: `index.html:122-123`. |
| `js/app.js` | yes | the shell: `App.register/store/on/emit/injectCSS/icon/toast/switchTo/active/scaleLock/wake`. |
| `js/midi.js` | yes | `App.midi` (ports, send, raw tap). Auto-reconnects when `midi.wanted` is set (`js/midi.js:1226-1228`), so Gear gets MIDI back without a prompt. |
| `js/remote.js` | yes (after midi.js) | Deck and Live sets implement `onRemote` (`js/synthtab.js:604`, `js/synthlive.js:368`); `remote.js:375` calls `App.midi.setInputClaim` at load. Bindings live in the shared store (`remote.map`), so what was learned in the main app's Settings works in Gear. |
| `js/midihub.js`, `js/synthtab.js`, `js/synthlive.js`, `js/synthdeck-maps.js`, `js/synthdeck-scope.js`, `js/synthdeck.js`, `js/helix.js` | yes | the gear modules, in today's order (`index.html:153-158`, `:163`). Constraints: maps before deck (`js/synthdeck.js:47`); `synthdeck.js` before `App.boot()` because `midihub.js` `render()` mounts it at init (`js/midihub.js:970`). |
| `js/help.js` | yes | fills `#help-btn` (`js/help.js:273-283`); tours for `deck`, `liveset`, `midihub`, `helix` are in it (`js/help.js:97-125`). One file for both apps; tours of absent pages are unused data. |
| `js/lights.js` | yes | the Lights & help sheet (`#sheet-lights`); with the sheet markup present and the module missing, boot prints "Module lights failed to load" (`js/app.js:1559-1561`). It also carries Connect keyboard and the LUMI options, useful in Gear. |
| `js/metronome.js` | recommended | same sheet rule; `#cx-met` emits `met:toggle` (`js/app.js:1492`); the Scope draws its beat grid from `met:beat`/`met:state` (`js/synthdeck-scope.js:476-477`); the Hub clock runs at `met.bpm` (`js/midihub.js:678`). Without it, omit `#met-btn`, `#cx-met` and `#sheet-metronome` from `gear.html` (all three are guarded: `js/app.js:1164-1169`, `:1182-1183`, `:1464-1465`). |
| `js/audioin.js` | recommended | "Hear input" is how a MODX on USB audio sounds through the computer; it restores itself at load (`js/audioin.js:553-575`) and needs no page. Navigating from `index.html` to `gear.html` destroys the main document's audio graph, so without this the MODX goes silent in Gear. Its Settings card stays in the main app. |
| `js/settings.js` | no (Phase A) | monolith with guitar/piano tone, Studio, Backup, Plugins (`js/settings.js:68-252`); `App.setPianoTone` / `App.pianoPlay` come from `piano.js` and are unguarded (`js/settings.js:780-783`). See 3.9. |
| `js/practice-router.js`, `js/learn-instruments.js`, `js/tonein.js`, `js/pitch-detector.js`, `js/practice-input.js`, everything else | no | `midihub.js:568` guards `App.practiceRouter`; `app.js:805` guards `App.learnInstruments`. |

### 1.2 App services the gear modules call

Collected by grep over the seven gear files (`grep -oE "App\.[a-zA-Z_]+..."`):

- `App.register`, `App.store.get/set` (namespaces `midihub.*`, `synthtab.*`, `hx.*`, plus reads of
  `fb.root`, `fb.scale`, `fb.mode`, `met.bpm`, `midi.wanted`), `App.on/emit`, `App.injectCSS`,
  `App.icon`, `App.toast` (and `App.toast.n`, `js/synthlive.js:146-148`), `App.active`,
  `App.switchTo`, `App.scaleLock.on/allows` (`js/midihub.js:221`, `:243`), `App.wake`
  (`js/synthlive.js:301`), `App.showBar`.
- `App.midi`: `supported, ready, native, platform, enable, inputs, outputs, inputsHeard,
  inputId, outputId, outputName, hasOutput, lightsOn, lumi, sysexOk, setInput, setOutput,
  setLedMode, send, sendTo, bindMusicalOutput, flushMusicalOutputs, setInputFilter, mute`.
- Bus events consumed: `midi:raw`, `midi:out`, `midi:state`, `midi:beforeoutput`, `midi:note`,
  `midi:range`, `tempo`, `lights`, `scale:lock`, `scale:boundary`, `fb:set`, `fb:scale`,
  `met:beat`, `met:state`.
- No gear module touches `localStorage` directly (grep for `localStorage|sessionStorage|indexedDB|guitarlab\.`
  over the gear files, `midi.js`, `remote.js`, `lights.js`, `help.js`: no hits). The `soundlab2.*`
  prefix change is therefore invisible to this split; it lives in `App.store` (`js/app.js:525-539`).
- Main-app services referenced: `App.songs` (Player only: `js/midihub.js:1456-1460`, `:1669`),
  `App.practiceRouter` (guarded, `js/midihub.js:568`), `window.SL_ARTIFACT`.
- `tools/helix-bridge.js` and `tools/helix-defs.json` are Node-side tools. The page never loads
  them; it talks to `ws://127.0.0.1:4575` (`js/helix.js:304-310`). They need no change.
- `data/modx-performances.json` is fetched by relative URL (`js/synthdeck-maps.js:127`,
  `js/synthdeck.js:586-603`). `gear.html` at the repo root keeps that path valid.

### 1.3 Shell DOM and CSS the gear modules assume

- `#panel-deck`, `#panel-liveset`, `#panel-midihub`, `#panel-helix` (`index.html:96`, `:112-114`).
- The Deck's Edit mode borrows the Hub's Control view out of `#panel-midihub`
  (`js/synthtab.js:28-29`, `:50-64`), and the Synth Deck watches `#panel-midihub`
  (`js/synthdeck.js:526-527`). So `deck`, `liveset` and `midihub` must stay in ONE document.
- Go live hides `.topbar`, `#tabbar-m` and `.foot` by class (`js/synthlive.js:327`).
- `js/synthlive.js:205` uses the Hub's `.mh-chk` class (injected by `midihub.js`).
- All gear CSS is injected with `App.injectCSS`; there is no gear selector in `css/` (grep for
  `#panel-(deck|liveset|midihub|helix)` and `.mh-/.st-/.sdk-/.hx-` in `css/*.css`: no hits). `gear.html` needs
  `css/tokens.css` and `css/style.css`; `css/lumi-practice.css` is not needed.

### 1.4 Two hidden dependencies on main-app modules (would break silently in Gear)

1. **A Deck preset's "Key & scale" depends on `fretboard.js`.** `applyApp` only emits
   `fb:set` (`js/synthdeck.js:1415-1418`); the values are written to the store by the
   fretboard's listener (`js/fretboard.js:2038-2063`, `saveState` at `:86-93`), which then
   emits `fb:scale` so the LUMI repaints. Without `fretboard.js`, loading a preset changes
   neither the key nor the lights. Fix: `applyApp` writes `fb.root`, `fb.scale`, `fb.mode`
   before it emits, the way the context bar does (`js/app.js:1426-1433`).
2. **"App voice" has no voice in Gear.** Only `piano.js` honours `mute` on `midi:note`
   (`js/piano.js:1769`; grep `d.mute` over `js/`: one hit). So the mute owners `midihub`
   (`js/midihub.js:694`, `:1804`), `synthtab` (`js/synthtab.js:44-47`) and `synthlive`
   (`js/synthlive.js:362`, `:366`) do nothing in Gear, and the `#mh-hear` checkbox
   (`js/midihub.js:744`, `:995`) and its texts (`:727`, `:915`, `js/help.js:116`) describe a sound
   that is not there. Hide them when `App.keys` is absent. The calls themselves are harmless.

## 2. Every place the two sides reach into each other

"Stays" = stays in the main app (or the shared core). "Moves" = goes to `gear.html`.

| # | Where | What it does | Verdict |
|---|---|---|---|
| 1 | `js/songs.js:537`, `:706-710` | "Play on synth": `openedAsPlayer()` then `SLMidiHub.player.show()` = `App.switchTo('midihub'); view('player')` (`js/midihub.js:1825`) | **Stays**, with the Player moved into the main app (section 4). Not a link. |
| 2 | `js/songs.js:693-700` | `hub.loadFile` / `hub.loadScore` for MIDI, MusicXML and tab | **Stays**: the readers move with the Player. |
| 3 | `js/songs.js:701-705`, `:711-731` | "Practice" (Woodshed) and "Open as tab" of a MusicXML file go through `SLMidiHub.player.toMidiBytes()` | **Stays**. This is the reason `midihub.js` cannot just leave: without the reader, MusicXML practice breaks. Tested at `tests/oneopen.test.js` (the `x1` check). |
| 4 | `js/midihub.js:1454-1462` | Player "Open as tab": `App.songs.fromMidi` + `App.switchTo('songs')` | **Stays** with the Player. If the Player stayed in Gear this would need a payload handed across documents. |
| 5 | `js/performance-player.js:404`, `:28` | Woodshed grading listens to `midi:raw`; pause calls `App.midi.flushMusicalOutputs` | **Stays**. It uses `midi.js`, not the Hub. No Woodshed code references `SLMidiHub` on v2 (grep: no hits in `woodshed.js`, `performance-*.js`). |
| 6 | `origin/feat/review-to-synth:js/score-review.js:71-72`, `:214-225` (NOT merged into v2) | Score review calls `SLMidiHub.player.loadScore/show` and `SLMidiHub.scoreToMidi` | When that branch lands it must point at the new Player module. More proof the Player is a main-app feature. |
| 7 | `js/practice-router.js:172-173` | refuses to start while `midihub.thru` is stored true | **Stays**. After the split it guards against Gear open in a second tab with Thru on. Reword the message ("Turn Thru off in soundLAB Gear › Hub"). Test: `tests/practice-router.test.js:47-48` matches `/MIDI Hub Thru off/`. |
| 8 | `js/midihub.js:568` | Hub Thru stands down while `App.practiceRouter.active` | **Moves** with the Hub; the guard stays (harmless, `App.practiceRouter` is undefined in Gear). `tests/practice-router.test.js:245-246` greps this line in `js/midihub.js`. |
| 9 | `js/remote.js` (whole file) | the controller remote | **Shared core**, loaded by both. Pages' `onRemote`: Deck `js/synthtab.js:492-505`, `:604`; Live sets `js/synthlive.js:129-164`, `:368`. Those move. The Learn UI stays in Settings (`js/settings.js:197-201`, `:998`). |
| 10 | `js/midi.js:266` `midi:raw` | raw tap | **Shared core**. Main users: Woodshed (#5). Gear users: `midihub.js:1770`, `synthdeck.js:517`, `synthdeck-scope.js:471`, `synthtab.js:573`, `synthlive.js:339`. |
| 11 | `js/midi.js:804` `midi:out` | emitted after every send | **Shared core**. Only gear modules listen (`midihub.js:1771`, `synthdeck.js:518`, `synthdeck-scope.js:472`); `helix.js:136` emits it too. |
| 12 | `js/midi.js:159`, `:269`, `:1278` `setInputFilter` | ONE filter before dispatch | **Shared core**, API kept. Its only caller is `js/midihub.js:534-537`. In the main app nothing installs it after the split (open question 1). |
| 13 | `js/midi.js:849`, `:1257` `sendTo` | one chosen output | **Shared core**. Only caller: `js/midihub.js:316`. |
| 14 | `js/midi.js:856`, `:1268` `bindMusicalOutput`; `:825`, `:1267` `flushMusicalOutputs` | tracked note writer | **Shared core**. Callers: Hub send (`js/midihub.js:251`), the Player (`:1626`), Woodshed (#5). |
| 15 | `js/midi.js:129-131`, `:1276` `mute(owner, on)` | per-owner mute of the app voice | **Shared core** (`practice-router.js:82`, `:194` needs it). Owners `midihub`, `synthtab`, `synthlive` move and become no-ops (1.4 item 2). |
| 16 | `js/midi.js:614`, `:641`, `:707` `midi:beforeoutput` | flush before an output change | **Shared core**; listeners move (`midihub.js:1773`, `synthdeck.js:520`). |
| 17 | `js/midi.js:1091` `midi:range` | LUMI octave buttons | **Shared core** (`piano.js:1788`, `keylessons.js:844`, `quiz.js:2921`, `lights.js:198`). The "LUMI octave buttons step the set" option moves with Live sets (`js/synthlive.js:205`, `:336`, `:353-358`, store `synthtab.octStep`). |
| 18 | `js/app.js:43`, `:51`, `:63`, `:65`, `:80` | page ids, labels, groups | Split per app (section 3.1). |
| 19 | `index.html:96`, `:112-114`, `:153-158`, `:163` | panels and script tags | **Move** to `gear.html`. |
| 20 | `js/help.js:97-125` | tours for deck, liveset, midihub, helix | **Shared file**, shown in Gear. Edit `:110` and `:115` (Player steps) and `:116` (App voice) when the Player moves. The welcome tour (`js/help.js:249-257`) is main-app text: skip it in Gear. |
| 21 | `js/settings.js:199` | "…the Trainer, Live sets and the Deck." | **Stays**, reword: Live sets and the Deck are in soundLAB Gear. |
| 22 | `js/settings.js:899` | chip text "Helix (use the Helix page)" | **Stays**, reword to "Helix (in soundLAB Gear)". |
| 23 | `js/lights.js:141-144`, `:159`, text at `:62` | `App.switchTo('settings')` from the sheet | **Shared**. In Gear this becomes a link across (`index.html#settings`). The scroll to `#set-remote-card` (`:143`) is lost across documents; acceptable. |
| 24 | `js/synthtab.js:479-480` | Deck → `App.switchTo('liveset')` | **Moves**; same app, no change. |
| 25 | `js/synthdeck.js:1399`, `:1542`; `js/synthtab.js:225`, `:330-332`, `:388-390` | Deck uses `SLMidiHub.split` / `SLMidiHub.api` | **Moves**; all inside Gear. |
| 26 | `js/plugins.js:45-49`, `plugins/helix-stadium.js:8` | skip an old stored Helix plug-in | Goes away with the plug-in API (another Phase A item). |
| 27 | `js/helix.js:592` | follows the app tempo (`tempo` event) when `hx.followTempo` | **Moves**. In Gear the tempo is still set in the context bar. |
| 28 | `js/midihub.js:277-278` | `note:input {src:'midihub'}` for the Studio capture | **Moves**; the listener (Studio) is cut. Harmless. |
| 29 | `js/app.js:1544-1551` | "Your keyboard is connected. Click or tap to turn on sound" hint on `midi:note` | **Shared**; skip it in Gear (no app voice there). |
| 30 | `js/app.js:1672-1673` | prefetch of guitar samples at boot | **Shared**; skip in Gear (no plucked voice there). |

Grep proof that nothing else in the main app touches the gear hooks:
`grep -nE "SLMidiHub|SLSynthTab|SLSynthLive|SLSynthDeck|SLSynthScope|SLHelix|synthDeck"` outside the seven
gear files and `tests/` returns only `js/songs.js:694,703,708`, `js/plugins.js:49` and
`plugins/helix-stadium.js:8`. Page-id strings `'midihub'|'deck'|'liveset'|'helix'` outside the gear
files: only `js/app.js:43,63,65` and `js/settings.js:362` (an audio device kind, unrelated).

## 3. Architecture for `gear.html`

### 3.1 One flag, one table, in `app.js`

```js
// TWO APPS FROM ONE CODEBASE (docs/ROADMAP-2.0.md): index.html = soundLAB, gear.html = soundLAB Gear
var APP_ID = (window.SL_APP || document.documentElement.getAttribute('data-app')) === 'gear' ? 'gear' : 'main';
var APPS = {
  main: { url: 'index.html', name: 'soundLAB',      tabKey: 'app.tab',  pages: [/* today's practice list minus the four gear pages */], groups: [/* Learn, Guitar (no helix), Keys, Play, Train */] },
  gear: { url: 'gear.html',  name: 'soundLAB Gear', tabKey: 'gear.tab', pages: ['deck', 'liveset', 'midihub', 'helix'],
          groups: [{ id: 'gsynth', label: 'Synth', icon: 'sliders', pages: ['deck', 'liveset', 'midihub'] },
                   { id: 'ghelix', label: 'Helix', icon: 'guitar',  pages: ['helix'] }] }
};
function appOf(name) { for (var k in APPS) if (APPS[k].pages.indexOf(name) !== -1) return k; return name === 'settings' ? 'main' : null; }
```

- `<html lang="en" data-app="gear">` in `gear.html`. An attribute (not only a global) lets CSS
  key on `html[data-app=gear]` and needs no inline script. `window.SL_APP` is accepted too because
  `tools/artifact_build.py:28` strips the `<html>` tag.
- `SPACES.practice` (`js/app.js:43`) and `GROUPS.practice` (`:61-68`) come from `APPS[APP_ID]`.
  `SPACE_LABELS` and `SUB_LABELS` (`:46-52`, `:75-81`) stay as one shared table. This is one
  place for the Studio removal and the three folds to edit too.
- `tabStoreKey` (`js/app.js:692`) returns `APPS[APP_ID].tabKey`. With one shared key each app
  would overwrite the other's last page and both would always open at home.
  `app.gtab.<gid>` needs no change (group ids differ).
- Stored values that now point at the other app fall back safely: `js/app.js:1652-1653`
  (start tab) and `:716-717` (group memory, e.g. `app.gtab.ginst = 'helix'`).
- Export `App.app` (the id) for modules and tests.

### 3.2 Home page of each app

- Main: `quiz`, unchanged (`SPACES.practice[0]`, used at `js/app.js:778`, `:1108`, `:1652`).
- Gear: `deck` (first of its list). The Deck already says what is missing and offers Connect
  (`js/synthtab.js:320-410`), so it is a sound first screen. Tabs: Synth (Deck | Live | Hub) and Helix.
  A single-page group hides the pill strip (`js/app.js:727`).

### 3.3 `App.switchTo` to a page of the other app (a link across)

Today an unknown id passes `spaceOf` as `practice` (`js/app.js:688-690`), becomes `active`
(`:777`), hides every panel (`:786-788`) and is saved as the last tab (`:792`): a blank page.
Add at the top of `switchTo` (before the Settings branch at `:746`):

```js
var owner = appOf(name);
if (owner && owner !== APP_ID && !SHEETS[name]) { goApp(owner, name); return; }
```

`goApp(owner, page)` = `location.href = APPS[owner].url + '#' + page`. Under `window.SL_ARTIFACT`
it shows an `App.toast` instead (the viewer blocks MIDI and `gear.html` is not staged there).
Relative URLs work on GitHub Pages (`/GuitarPak/` and `/GuitarPak/next/`), on `127.0.0.1:4573`,
and under `file://` in the wrappers. Leaving the document already flushes held notes
(`js/midi.js:1222`, `js/midihub.js:1785`).

Callers that will cross: `lights.js:142`, `:159` in Gear (to Settings); nothing in the main app
after the Player moves.

### 3.4 Deep links

There is no hash routing today (grep `location.hash|hashchange`: no hits). Add to `boot()`:
`var want = location.hash.slice(1).split('/')[0]`; if `appOf(want)` is the other app,
`location.replace(APPS[..].url + '#' + want)`; if it is a page of this app, use it as the start
tab (`js/app.js:1652-1654`); `#settings` opens Settings after the start tab so the gear icon
toggles back. Clear the hash when it is consumed (pass the clean URL to the existing
`history.replaceState` at `js/app.js:1144`), or a reload re-applies it. Links that result:
`gear.html`, `gear.html#deck|liveset|midihub|helix`, `index.html#<page>`, `index.html#settings`.

### 3.5 Header, wordmark, the switch between the apps

- `gear.html` copies the shell block of `index.html` (`:20-89`: header, context bar, the two
  sheets, the wipe) and the footer, with these differences: `<title>`, `<span class="tag">gear</span>`
  instead of `alpha` (`index.html:36`; same CSS, `css/style.css:232`), footer text
  (`index.html:119`; `app.js:1656-1657` appends the version), and only four panels in `<main>`.
  Note `.brand .tag` is hidden at 1120 px and below (`css/style.css:183`, `:978`); the switch
  button text carries the name there.
- The switch: reuse the header slot of `#space-btn` (`index.html:40`, wired at
  `js/app.js:1625-1631`, `:1646-1650`), which the Studio removal frees. Main app: "→ Gear";
  Gear: "← soundLAB". Make it a real link (`<a class="btn sm" href="gear.html">`) so Ctrl+click or
  middle-click opens Gear in a second window for side-by-side use; `.btn` has no
  `text-decoration` rule (`css/style.css:600-614`), so add one. Hide it under `SL_ARTIFACT`.
- The static shell is duplicated markup (about 70 lines), not logic. Guard it with a pure-Node
  test that compares the two shell blocks (section 6). Building the shell from `app.js` would
  remove the copy but delays first paint and belongs to Phase B, which rebuilds the shell.
- Back hint text `js/app.js:1154` ("Press Back again to leave soundLAB.") should use the app name.

### 3.6 Manifest and service worker

- **One service worker for both.** `sw.js` is registered at the directory scope and already
  controls every page under it; two workers cannot share a scope, and a `gear/` subfolder would
  need `../` paths and a second asset list. One cache also means the two apps update together,
  which they must, because they share the core files.
- `sw.js` `ASSETS`: add `'gear.html'` after `'index.html'` (`sw.js:7`) and the new Player file.
  The gear entries stay (`sw.js:51-57`, `:62`). Bump `CACHE` (`sw.js:4`). Navigations to
  `gear.html` hit the cache through `caches.match(..., { ignoreSearch: true })` (`sw.js:125`);
  the hash is not part of the request.
- `gear.html` registers the same worker (copy `index.html:168-175`), or move the registration
  into `boot()` next to the `controllerchange` code (`js/app.js:1659-1669`), guarded by
  `!window.SL_ARTIFACT`. In that case check `tools/artifact_build.py:35-36` still passes
  (it only asserts the HTML has no `serviceWorker`).
- **PR #98** (`origin/claude/project-thread-rhqjuv`) changes `sw.js:1-4` (scope-named caches
  `sl2-live-*` / `sl2-next-*`, `CACHE = PREFIX + 'v4'`) and the `activate` filter. `gear.html` is in
  the same scope, so that scheme covers it unchanged. Expect one textual conflict on the
  `CACHE` line when both land; the `ASSETS` edits are in separate hunks. It also bumps
  `APP_VERSION` (`js/app.js:101`) and `version.json`; Phase A should not touch those lines.
- **Manifest:** keep ONE (`manifest.webmanifest`, `start_url` and `scope` "." at `:5-6`).
  `gear.html` links the same file so an installed soundLAB stays standalone when it navigates
  to Gear (same scope). Add `"shortcuts": [{ "name": "soundLAB Gear", "url": "gear.html" }]`.
  A separate installable Gear (own manifest `id`, icon) is Phase H.

### 3.7 Wrappers, shortcut, artifact, Pages

- **Android** (`android/src/com/mreindl/soundlab/MainActivity.java`): the app loads the live site
  (`:40`, `:119`). `route()` keeps every URL under `LIVE_URL` inside the WebView (`:124-125`), so
  `…/GuitarPak/gear.html` (and `…/next/gear.html`) opens in the app. Both JS bridges are attached
  to the WebView, not to a page (`:70-73`), and `MidiBridge.init()` is safe to repeat
  (`MidiBridge.java:108-109`), so MIDI keeps working after the navigation. **No new APK is
  needed.** Back: `onBackPressed` → `web.goBack()` (`:158-162`), so Back at Gear's home returns to
  soundLAB after the in-app hint. The bundled offline copy only has `index.html`
  (`android/build.sh:32`, `android/build.ps1:29`): add `gear.html` to both copy lines for the next
  APK build. The 0.75.0 APK in the field bundles its own old single app, so it is consistent.
- **iOS** (`ios/Sources/GuitarLabApp.swift`): loads the bundled `index.html` (`:51-54`) and
  keeps `file:` navigation in the app (`:107-115`), so a relative link to `gear.html` works once
  it is bundled. `ios/sync-web.sh:8-9` must copy `../gear.html`. It also never copied `../data`
  (existing gap: the MODX names file is missing in the iOS bundle).
- **Windows shortcut** (`releases/soundLAB-windows.bat:14`, `:58`): opens the app with
  `--app=URL`, a window with no address bar. Gear is therefore reachable only through the in-app
  switch. No change needed; a second shortcut is optional later.
- **claude.ai artifact** (`tools/artifact_build.py`): stages `index.html` only (`:24-41`) and
  copies every file under `js/` (`:20`, `:54`). The viewer blocks Web MIDI (CLAUDE.md, artifact
  section), so Gear is useless there. Phase A: no change to the script; the app hides the switch
  and never navigates to `gear.html` under `SL_ARTIFACT`. `.html` is not in `ASSET_EXT` (`:21`),
  so `gear.html` is not staged by accident.
- **Pages workflows:** both publish the WHOLE tree of the tested commit
  (`.github/workflows/pages-next.yml:70` `git read-tree --prefix=next/ "${source_commit}^{tree}"`;
  `.github/workflows/pages.yml:60`). `gear.html` at the root is published with no workflow change:
  `/GuitarPak/next/gear.html` on the beta, `/GuitarPak/gear.html` after the flip. The live-asset
  probe in `pages.yml` (release job) and `tests/release-workflow.test.js:15-18` list only
  `index.html`'s scripts; add `gear.html` there in Phase I, not now.

### 3.8 Shared state between the apps

Same origin, same `App.store` prefix, so everything is shared: MIDI port choices
(`midi.*`, `lights.*`), `midihub.*`, `synthtab.*`, `hx.*`, `remote.*`, key/scale/tempo, theme.
`App.store.get` reads `localStorage` on every call (`js/app.js:526-532`), so a second window sees
changes on its next read; there is no `storage` event listener and none is needed for Phase A.

### 3.9 Where shared settings are edited

Recommendation for Phase A: **Settings lives in the main app only.** Gear's gear icon goes to
`index.html#settings` through the guard in 3.3. Gear does not lose port control, because its
pages carry their own:

- Hub: Connect MIDI, In, Synth out (`js/midihub.js:737-741`, wired at `:975-979`).
- Deck and Live sets: the connect panel with Connect and an output picker
  (`js/synthtab.js:357-402`; Live: `js/synthlive.js:175-177`, `:364`).
- Helix: its own Web MIDI access and Connect (`js/helix.js:100-112`).
- Lights & help sheet: Connect keyboard, Bluetooth, LUMI options (`js/lights.js:91-126`).

Only in Settings: the key-light output (`#set-midi-out`, `js/settings.js:164`), the voice mode,
pitch bend, the remote's Learn rows, theme and accent. All are rarely changed, and all are read
by Gear from the shared store. Loading `settings.js` in Gear too is possible later (hide the
cards that need `piano.js`, the Studio and Backup), but it is not needed for a correct Phase A.

## 4. The Hub Player ("Play on synth")

**Recommendation: the Player lives in the main app, on the Songs page, as its own module
`js/scoreplayer.js` (`window.SLScorePlayer`). Gear's Hub loses the Player view.**

Why:

1. It is reached from Songs (`js/songs.js:537`, `:706-710`) and its "Open as tab" goes back to
   Songs (`js/midihub.js:1454-1462`). In two documents both hops would need the open file handed
   across a page load.
2. Its readers are already main-app infrastructure: MusicXML → Woodshed and MusicXML → tab run
   through them (`js/songs.js:701-705`), and the roadmap's Phase G wants "MusicXML/MIDI →
   Woodshed" in the Songs library (`docs/ROADMAP-2.0.md:62`).
3. The roadmap lists the Hub tools as "rules, SysEx, monitor" (`docs/ROADMAP-2.0.md:11-12`).
   The Player is not one of them.
4. A Player in a background Gear tab would stall: it runs on an 8 ms `setInterval`
   (`js/midihub.js:1631`), which browsers throttle in hidden tabs.

What moves (all from `js/midihub.js`): the logic at `:1228-1716` (readers `readMidi`,
`readMusicXml`, `readMxl`, `plLoadFile`; `finishSong`; `songToMidi`, `scoreToSong`, `scoreToMidi`;
key shifter; transport; `paintPlayer`, `wirePlayer`), the view markup at `:775-802`, its CSS at
`:1763-1764`, the element ids at `:957-958`, and the export at `:1819-1828`. What it needs from
the Hub, and the replacement:

| Hub piece | Used at | In `scoreplayer.js` |
|---|---|---|
| `g`/`set` on `midihub.pl*` | `:1237-1240`, `:1533-1537` | same store keys (keeps users' settings) |
| `hubOutId`, `hubOutName`, `hasOut`, `autoOut` | `:1625-1626`, `:1670` | **move these 25 lines (`:285-307`) into `midi.js` as `App.midi.synthOut {id, name, has, set}`**, still reading `midihub.outId`. The Hub then calls the same service, so there is one copy. |
| `ch()`, `partLabel()` | `:1590`, `:1671-1672` | read `midihub.ch` / `midihub.profile` from the store |
| `toast` | several | `App.toast` |
| Hub Panic pauses it | `:477` | its own Stop; `App.midi.flushMusicalOutputs` already runs on blur and page hide (`js/midi.js:1221-1222`) |
| page hide pauses it | `:1804` | the Songs page's `onHide` (`js/songs.js:831-833`) |

The Player card needs a "Synth out" select of its own in the main app (the Hub's select at
`js/midihub.js:740` is in Gear). Keep the `mh-pl*` element ids in Phase A to limit test churn.
`js/songs.js:694`, `:703`, `:708` switch from `SLMidiHub.player` to `SLScorePlayer`; `show()` scrolls
to the card instead of changing page.

The alternative (Player stays in the Hub, "Play on synth" becomes a link to
`gear.html#midihub` with the file passed through `sessionStorage`, and only the readers are
shared) costs about the same lines, adds a two-way hand-off protocol, and sends the user out of
the practice app to hear a score. Not recommended.

## 5. The smallest correct Phase A version

Scope: move the four pages behind `gear.html`, keep today's look, keep every gear behaviour
inside Gear, keep "Open a score" working in the main app.

### Files to add

| File | Content |
|---|---|
| `gear.html` | `<html data-app="gear">`; head as `index.html:4-16` without `css/lumi-practice.css`, own `<title>`; shell block as `index.html:20-89`; `<main>` with `panel-deck`, `panel-liveset`, `panel-midihub`, `panel-helix`; footer; scripts: `theory`, `note-palette`, `app`, `midi`, `remote`, `audioin`, `metronome`, `midihub`, `synthtab`, `synthlive`, `synthdeck-maps`, `synthdeck-scope`, `synthdeck`, `helix`, `help`, `lights`; then `App.boot()` and the worker registration. |
| `js/scoreplayer.js` | the Player (section 4). Loaded by `index.html` only. |
| `tests/gear-shell.test.js` (pure Node) | the shell blocks of the two HTML files are identical apart from the allowed differences; every script and stylesheet of both files is in `sw.js` `ASSETS`; no gear module is loaded by `index.html`. |
| `tests/gear-nav.test.js` | Gear's tabs, pills, home, the switch link, `switchTo` across (both directions), deep links, the context-bar matrix for the four gear pages. |
| `tests/remote-gear.test.js` | the Live sets and Deck sections cut out of `tests/remote-runners.test.js` (`:237-357`, `:438-end`). |

### Files to change

| File | Change |
|---|---|
| `index.html` | remove panels `:96`, `:112-114` and scripts `:153-158`, `:163`; add `js/scoreplayer.js`; `#space-btn` becomes the link to Gear (`:40`). |
| `js/app.js` | `APP_ID`, `APPS`, `appOf` (3.1); page sets `:42-45`, groups `:60-73`; `tabStoreKey` `:692`; the guard in `switchTo` `:742`; deep link in `boot` `:1651-1654` and `:1144`; the switch button `:1625-1631`, `:1646-1650`; app name in the back hint `:1154`; skip in Gear: the sound hint `:1544-1551`, the sample prefetch `:1672-1673`; export `App.app`. |
| `js/midi.js` | add `App.midi.synthOut` (moved from `js/midihub.js:285-307`). Nothing else: raw tap, filter, `sendTo`, `bindMusicalOutput`, `mute` all stay. |
| `js/midihub.js` | remove the Player (section 4) and its view button (`:752`); use `App.midi.synthOut`; hide `#mh-hear` and its texts when `App.keys` is absent (`:727`, `:744`, `:915`); header comment `:1-31`. |
| `js/synthdeck.js` | `applyApp` writes `fb.root`/`fb.scale`/`fb.mode` before emitting (`:1415-1418`). |
| `js/synthlive.js` | fix the wake call (`:301`, see 7.1). |
| `js/songs.js` | `SLMidiHub.player` → `SLScorePlayer` (`:694`, `:703`, `:708`); mount the Player card; button title `:537`; comment `:835`. |
| `js/help.js` | Hub tour: drop the Player steps `:110`, `:115` and the App voice step `:116`; add a Songs step for the Player; no welcome tour in Gear (`:285-289`). |
| `js/settings.js` | texts `:199`, `:899`. |
| `js/practice-router.js` | message `:173`. |
| `sw.js` | `ASSETS`: `gear.html`, `js/scoreplayer.js`; `CACHE` bump (`:4`). |
| `manifest.webmanifest` | `shortcuts` entry for Gear. |
| `android/build.sh:32`, `android/build.ps1:29`, `ios/sync-web.sh:8-9` | copy `gear.html` (iOS also `data/`). No APK build, no version bump. |
| `tests/env.js` | add `GEAR_URL` (same host, `gear.html`). |
| `tests/run.sh:17` | add the new suites to the default list. |
| `CLAUDE.md`, `docs/SYNTH-TAB.md`, `docs/SYNTH-DECK.md`, `docs/HELIX-STADIUM.md`, `docs/CONTROLLER-REMOTE.md` | where the pages live now. |

Not changed: `tools/artifact_build.py`, `tools/helix-bridge.js`, `tools/helix-defs.json`,
`data/modx-performances.json`, the workflows, `version.json`, `APP_VERSION`, the APK.

## 6. Tests that address these pages, and how they open them

Every browser suite opens `env.URL` (`tests/env.js:7`, `http://127.0.0.1:4573/index.html`) with
`page.goto` and then calls `App.switchTo(...)` inside `page.evaluate`. None navigates by URL to a
page. `tests/serve.py` serves the repo root, so `gear.html` is reachable with no server change.
All of them seed `localStorage` with literal `guitarlab.` keys (for the prefix work).

| Suite | Opens (line) | Pages via `App.switchTo` | After the split |
|---|---|---|---|
| `synthdeck.test.js` | `:53` | `midihub` `:66`; leaves to `piano` `:683` | `GEAR_URL`; leave to another gear page |
| `synthdeck-scope.test.js` | `:38`; reads `index.html` at `:33-35` | `midihub` `:43`, `:191`; `piano` `:190` | `GEAR_URL`; read `gear.html` |
| `synthtab.test.js` | `:42` | `deck` `:53`, `:229`, `:258`; `liveset` `:191`, `:245`; `midihub` `:279` | `GEAR_URL` |
| `synthconnect.test.js` | `:36` | `deck` (8 times from `:53`), `liveset` `:59` | `GEAR_URL` |
| `synthconn.test.js` | `:55` | `deck`, `liveset`, `midihub` `:68-110` | `GEAR_URL` |
| `midihub.test.js` | `:27`, `:248` | `midihub` `:39`, `:71`; `piano` `:65`, `:218` | `GEAR_URL`; the App voice checks `:60-75` change (no voice in Gear) |
| `midihub-lock.test.js` | `:35` | `midihub` `:38`, `:58`; `quiz` `:57` | `GEAR_URL`; `:56-60` asserts Thru keeps running on another page: use a gear page |
| `midihub-wheel.test.js` | `:23` | `midihub` `:25` | `GEAR_URL` |
| `midihub-player.test.js` | `:28` | `midihub` `:74`, `:124`; `piano` `:122` | stays on `env.URL`; drives `SLScorePlayer` on `songs`; view order `:83`, Part pick `:109`, Panic `:119`, "leaving the MIDI tab" `:131` are rewritten |
| `helix.test.js` | `:68` | `helix` `:91`, `:259`, `:275`; `quiz` `:259` | `GEAR_URL`; leave to `deck` |
| `oneopen.test.js` | `:25` | `songs` | stays; "Play on synth" no longer lands on `midihub` (checks `m2`, `t1`); waits on `SLScorePlayer` instead of `SLMidiHub` |
| `remote-runners.test.js` | `:64` | `fretboard`, `tab`, `notation`, `songs`, `trainer`, `liveset` `:240`, `:279`, `deck` `:328`, `:442`, `:465` | split: gear sections to `remote-gear.test.js` |
| `nav.test.js` | `:15` | `:35` expects `Learn|Guitar|Keys|Synth|Play|Train`; `:40-41` Synth tab and the borrowed view; `:45` `Neck|Tab|Notation|Helix` | update; move `:40-41` to `gear-nav.test.js` |
| `context-global.test.js` | `:56` | matrix `:7` includes `helix`, `deck`, `liveset`, `midihub`; `:60-61` requires the matrix to equal the panels in the DOM | remove the four; cover them in `gear-nav.test.js` |
| `multiin.test.js` | `:34` | `midihub` `:97` (the Hub's input picker) | move that check to a gear suite |
| `practice-router.test.js` | pure Node | reads `js/midihub.js` `:245-246`; message regex `:48` | keep the guard line; update the regex with the message |
| `smoke.test.js` | `:17` | its list `:22` has no gear page | add a Gear smoke pass (boot, visit four pages, no page errors) |
| `lumi-practice.test.js`, `audioin.test.js` | | only device names | none |

`tests/run.sh:17` is the suite list CI runs (`.github/workflows/tests.yml:54-55`).

## 7. Risks, incidental findings, open questions

### 7.1 Incidental bugs found while reading (not caused by the split)

- `js/synthlive.js:301` calls `App.wake('synthlive')`, but `App.wake` is an object
  (`js/app.js:670-686`). The `TypeError` is swallowed by the `try`, so Go live never holds the
  screen awake, although the help tour says it does (`js/help.js:106`). `tests/synthtab.test.js:220-222`
  only checks CSS. Fix: `App.wake.acquire('synthlive')`.
- `ios/sync-web.sh:9` never copies `data/`, so the iOS bundle has no MODX names file.
- `js/app.js:1063` calls `curRoot()`, which is defined inside `wireContextBar` (`:1299`).
  `App.colors.label` has no caller (grep), so it is latent.

### 7.2 Risks

1. Background Hub behaviour stops in the main app (Thru, key splits, Rules on input). See
   open questions 1 and 2. `tests/midihub-lock.test.js:56-60` shows Thru on other pages is
   deliberate today.
2. Side-by-side use (Gear in a second window) relies on Chromium sharing a MIDI port between
   two windows of one browser. I believe it does, but it was not tested here; check on the
   owner's Windows PC with the LUMI and the MODX. Inside the Android app there is one WebView,
   so there is no side by side.
3. Two windows both paint the LUMI and both hear the keyboard. Harmless duplicates today;
   with Thru on in Gear and the practice route on in the main app notes would double, which is
   what `js/practice-router.js:172` prevents.
4. The shell markup exists twice until Phase B. Mitigated by `tests/gear-shell.test.js`.
5. Merge order with the other Phase A items: all of them edit `js/app.js:42-81` and the script
   list in `index.html`. Land the `APPS` table first (or last) as its own PR so the other
   edits are one-line changes in it.
6. PR #98: one conflict on `sw.js:4`; it also moves `APP_VERSION`. See 3.6.
7. `feat/review-to-synth` (unmerged) calls `SLMidiHub.player`; it must be re-pointed when it
   lands.

### 7.3 Open questions (with my recommendation)

1. **Rules on what the app hears** (`midihub.rulesIn`, "Apply to what soundLAB hears (every
   page)", `js/midihub.js:860`): after the split it only applies inside Gear. Recommendation:
   keep it working in the practice app by moving `decode`, `matches`, `applyRules` and
   `installFilter` (about 110 lines, `js/midihub.js:156-180`, `:486-537`) into a small shared
   file loaded by both apps; the Rules editor stays in Gear. If that is too much for Phase A,
   relabel the checkbox and say so in the release notes.
2. **Thru and key splits while practising** (LUMI → MODX through the Hub while on a practice
   page): after the split this needs Gear open in a second window. Recommendation: accept for
   Phase A and say it in the Hub's Thru hint; revisit in Phase E/F.
3. **Settings in Gear:** main app only (3.9), with a link across. Recommended.
4. **Does Gear keep the metronome, the Lights & help sheet and the context bar?** Recommended
   yes, for one shell and "today's look"; Phase H can drop them.
5. **Is the Player also offered inside Gear's Hub?** Recommended no: one home, on Songs.
6. **A separate installable Gear** (own manifest and icon, a second Windows shortcut):
   recommended for Phase H, not now.
