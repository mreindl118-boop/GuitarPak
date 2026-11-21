# Map: the shell as it is (input for Phase B and B0)

Written 2026-11-14 against the worktree
`scratchpad/wt/a4`
at commit `a914df2` ("2.0 Phase A4: review fixes", branch `claude/verify-project-files-4bchk6-v2-a4`).
**Every `file:line` below is a line of that tree, as a path from its root.** Nothing in the worktree was
changed. An earlier copy of this report (2026-11-12) was written before the last Phase A merges; it is kept as
`work-shell/old-nov12/map-shell.nov12.md` and its line numbers are no longer right. This file replaces it.

The working files and screenshots this document names (work-…/, shots/…) were scratch files of the planning
session. They are not in the repository: pictures are never committed, because both deploys publish the whole
tree.

"The shell" in this report = everything on screen that is not a page: the header with the wordmark, the tab
bars, the pill strip, the corner tools, the key/scale/tempo dropdown, the two sheets, Settings (a page that
behaves like an overlay), the footer, and the small boxes that float over a page (toasts, hints, the pedal
confirmation). "soundLAB" = `index.html`, "Gear" = `gear.html`.

## 0. How this map was made, and what was not checked

- Read in full: `docs/ROADMAP-2.0.md`, `docs/DESIGN-SYSTEM.md`, `css/tokens.css`, `docs/design/home-mockup.html`,
  `index.html`, `gear.html`, `js/app.js` (2,068 lines), `css/style.css` (997 lines), `js/learn-instruments.js`,
  `tests/assets.test.js`, `tests/nav.test.js`, `tests/context-global.test.js`, `tests/taps.test.js`, the
  "soundLAB 2.0 Phase A" section of `CLAUDE.md` (lines 1260-1900), and of `docs/plans/phase-a/PLAN.md` the
  sections 0-3, 9, 10, 12 and the appendices A-B (the per-step sections 4-8 were not re-read).
- Read in part (the lines that touch the shell, found by search): `js/help.js`, `js/remote.js`, `js/quiz.js`,
  `js/keylessons.js`, `js/xp.js`, `js/practice-progress.js`, `js/practiceplan.js`, `js/lights.js`,
  `js/settings.js`, `js/synthlive.js`, `js/audioin.js`, `js/midihub.js`, `js/midi.js`, and the shell lines of 20
  suites.
- Looked at: both apps in headless Chromium 1243 served from the worktree on port 5412, at 360, 390, 820, 901
  and 1200 px, dark and light, device scale factor 1. 360 and 390 were opened as touch phones (so the "coarse
  pointer" rules apply); 820, 901 and 1200 as a mouse desktop. **A real tablet at 820 px has a coarse pointer;
  that combination was not opened.** 163 files are in `shots/shell/` (list in section 12); the numbers quoted
  come from `shots/shell/measure.json`, which the same script wrote. I opened and looked at 37 of the images.
- The table "which suite names which id" (section 7) is a text search (`work-shell/refs2.js`): a name counts
  when it stands as a whole word on a line of code of a file in `tests/` or `js/`. **No suite was run with an
  id renamed.** A suite that reaches an element another way (through an `App.*` call, by tag name) is not in
  the table. The only suite I ran is `tests/assets.test.js` (pure Node, reads files): ALL PASS.
- Not checked: Safari, Firefox, the Android WebView, the iOS wrapper, the claude.ai artifact, a real LUMI,
  print styles, right-to-left, zoomed text, a screen reader. Contrast was not measured.

## 1. The two pages

Both files are the same skeleton. What differs is listed in the last column.

| Block | `index.html` | `gear.html` | Difference |
|---|---|---|---|
| `<html>` tag | 2 | 2 | Gear has `data-app="gear"` (`gear.html:2`); `js/app.js:74-75` reads it |
| `<head>` | 3-18 | 3-17 | the `<title>` (`:7`), and soundLAB also links `css/lumi-practice.css` (`index.html:17`) |
| Header `<header class="topbar">` | 20-61 | 19-60 | the word in `<span class="tag">`: "alpha" (`index.html:36`) / "gear" (`gear.html:35`) |
| Phone tab bar `<nav id="tabbar-m">` | 62 | 61 | none |
| Metronome sheet | 63-72 | 62-71 | none |
| Lights & help sheet | 73-82 | 72-81 | none |
| `<main>` with the panels | 83-99 (14 pages + `panel-settings`) | 82-87 (4 pages, no Settings) | each app's own |
| Footer `<footer class="foot">` | 100-102 | 88-90 | "soundLAB alpha" / "soundLAB Gear alpha" |
| Script tags | 103-141 (39 files) | 91-108 (18 files) | each app's own |
| Inline boot script | 142-149 | 109-116 | none |

Stylesheets linked: `css/tokens.css`, `css/style.css` (both pages, `index.html:15-16`, `gear.html:15-16`) and
`css/lumi-practice.css` (soundLAB only, `index.html:17`). Section 5 describes them.

The static markup holds almost no content. The tab bars, the pill strip, every icon, the link to the other
app, the option lists of the dropdown and the bodies of both sheets are empty in the HTML and filled by
JavaScript at start (section 3).

## 2. The shell, part by part

For each part: its markup, what fills and drives it, its style rules. Who else names it is in section 7; how
it sits at each width is in section 6.

### 2.1 Header and wordmark

- Markup: `<header class="topbar">` (`index.html:20`). Inside, in this order: `.brand` (`:21-37`), the top tab
  bar (`:38`), the corner tools (`:39-46`), the dropdown `#ctxbar` (`:47-59`), the pill strip `#subnav` (`:60`).
- Wordmark: an inline SVG, `class="wordmark"`, `viewBox="0 0 399 106"`, `aria-label="soundLAB"`
  (`index.html:22-35`). "sound" is drawn in `currentColor`; "LAB" is the group `.wm-lab` filled with
  `var(--accent,#ffab47)` (`:29-34`). It is not text and not a link; nothing happens when it is tapped (no
  listener on `.brand` or `.wordmark` anywhere in `js/`, section 7).
- The tag beside the logo: `<span class="tag">alpha</span>` (`index.html:36`), "gear" in Gear (`gear.html:35`).
- Style: `.topbar` is a wrapping flex row, `position: sticky; top: 0; z-index: 50`, a translucent background
  with a 12 px blur and a bottom hairline (`css/style.css:163-181`). `.brand` `:188-198`, `.wordmark` 26 px high
  `:209-213`, the glow on "LAB" `:215-217`, `.brand .tag` `:219-232`. The tag is hidden from 901 to 1120 px
  (`:183`) and at 640 px and below (`:957`); the logo is 21 px high at 640 px and below (`:959`).
- Light theme: the header background is the one explicit light rule for it (`css/style.css:111-113`).
- Quiet chrome: the whole header slides out of view while the window scrolls down and comes back on any
  scroll up, at the top, or when something in it gets the focus. `wireAutoHideBar` (`js/app.js:1149-1167`),
  class `.bar-hidden` (`css/style.css:186`), `App.showBar()` (`js/app.js:1148`, public at `:2034`). It does not
  hide while the BPM field is being typed in (`:1159`) or while the dropdown is open (`:1163`). Hiding the bar
  closes the dropdown (`:1146`).
- Three modules measure the header's height to scroll a page under it: `js/quiz.js:1273-1277`,
  `js/keylessons.js:304-306`, and Gear's "Go live" hides it with
  `html.st-live .topbar, html.st-live #tabbar-m, html.st-live .foot {display:none!important}`
  (`js/synthlive.js:328`).

### 2.2 Tab bars

- Markup: two empty `<nav>` elements with the same class `tabbar`: `#tabbar` (`class="tabbar tabbar-top"`,
  inside the header, `index.html:38`) and `#tabbar-m` (`class="tabbar tabbar-bottom"`, after the header,
  `index.html:62`). The phone bar is outside the header on purpose: the header's blur and its slide-away
  transform would trap a fixed child (comment `css/style.css:234-238`).
- Filled by `populateNav()` (`js/app.js:936-947`): one `<button class="tabbar-btn" data-group="<group id>">`
  per tab group, with an icon (20 px) and a `<span>` label; the current group gets class `active` and
  `aria-current="page"` (`:940-941`). The same HTML string is written into both bars (`:943-946`).
- The groups come from one table, `APPS` (`js/app.js:76-92`):
  soundLAB: Learn `gtheory` (quiz, chords, theory, practiceplan) · Guitar `ginst` (fretboard, tab, notation) ·
  Keys `gkeys` (piano, chart, pads) · Play `gplay` (songs, jam) · Train `gprac` (shed, tuner) (`:79-85`).
  Gear: Synth `gsynth` (deck, liveset, midihub) · Helix `ghelix` (helix) (`:88-91`).
- A click on either bar is caught once per bar (`js/app.js:1827-1836`) and calls `goGroup(id)`
  (`:949-959`): the group's remembered page (`app.gtab.<group id>` in the store, `:954`) or its first page; a
  tap on the tab that is already open scrolls the page to the top (`:953`).
- Style: `.tabbar` `css/style.css:239`, `.tabbar-btn` `:243-265`. At 900 px and below the top bar is not
  displayed and the bottom bar is fixed along the bottom, `z-index: 60`, each button a column (icon over an
  11 px label), the active one marked by a pill behind its icon (`:910-953`).
- One more rule hangs on a tab: a dot on the Learn tab while today's goal is not met:
  `.goal-due .tabbar-btn[data-group="gtheory"]::after` (`css/style.css:269-279`, phone position `:949`). The
  class `goal-due` is put on `<html>` by `js/xp.js:30`.

### 2.3 Pill strip

- Markup: `<div class="subnav" id="subnav" hidden>` (`index.html:60`), the last child of the header.
- Filled by `paintSubnav(name)` (`js/app.js:961-973`): one `<button class="subtab" data-page="<page id>">` per
  page of the current group; hidden when the group has fewer than two pages (`:965`). Labels come from
  `SUB_LABELS` (`:114-120`), else `SPACE_LABELS` (`:102-108`). Clicks: `js/app.js:1837-1843`.
- Hidden while Settings is open (`js/app.js:1044-1045`).
- Style: `.subnav` takes a whole row of the header (`flex-basis: 100%`, `css/style.css:346-354`); `.subtab` is a
  32 px high pill, 13.5 px text (`:358-380`).
- One page module styles the strip from outside: the Plan page narrows the pills of its own group at 600 px
  and below with `#subnav:has(.subtab[data-page="practiceplan"]) .subtab{…}` (`js/practiceplan.js:350`).

### 2.4 Corner tools

Markup: `<div class="tb-tools" id="tabs">` (`index.html:39-46`). The id `tabs` is a leftover: a click handler
on it looks for `.tab` buttons (`js/app.js:1844-1850`) and `switchTo` toggles `.tab` buttons (`:1067-1069`),
but no element with class `tab` is produced anywhere in `js/`, `index.html` or `gear.html` (search: no hit),
and `css/style.css:450-453` says "the tab row itself is gone".

| Element | Markup | Filled / wired by | What it does |
|---|---|---|---|
| `#app-switch`, an `<a class="btn sm">` | `index.html:40`, empty | `boot()` `js/app.js:1896-1906` | the link to the other app: text "Gear" → `gear.html` in soundLAB, "soundLAB" → `index.html` in Gear; `title` and `aria-label` "Open <name>"; hidden when `window.SL_ARTIFACT` is set (`:1899`) |
| `#help-btn` | `:41` | `js/help.js:266-276` (run by `setTimeout(init, 0)`, `js/help.js:294`) | opens the tour of the page that is showing (`:272-275`); draws its own SVG (`:268-270`), not the `help` icon of `js/app.js:259`; pulses (class `hp-pulse`) until a tour was finished (`js/help.js:271`, `:156-158`) |
| `#settings-btn` | `:42` | `js/app.js:1881-1892` | `toggleSettings()` (`:1196-1205`); class `active` while Settings shows (`paintGear`, `:975-978`); in Gear its title is "Settings (in soundLAB)" (`:1884-1887`) and the click leaves for `index.html#settings` (`resolvePage` → `goApp`, `:1003-1006`, `:97-101`) |
| `#ctx-btn` (the clef) | `:43`, `aria-controls="ctxbar"`, `aria-expanded` | `wireContextBar` `js/app.js:1601-1640` | opens and closes the dropdown (section 2.5); its `title` and `aria-label` name the key and tempo, e.g. "Key, scale & tempo: A Minor Pentatonic · 120 BPM" (`:1602-1608`); disabled while a sheet, a help tour or any modal dialog is open (`:1096-1106`) |
| `#lights-btn` | `:44`, `aria-haspopup="dialog"`, `aria-controls="sheet-lights"` | `wireSheets` `js/app.js:1486-1492` | opens / closes the Lights & help sheet |
| `#met-btn` | `:45`, `aria-controls="sheet-metronome"` | `wireSheets` `js/app.js:1486-1516` | opens / closes the metronome sheet; class `on` while the click runs and `tick` for 110 ms on each beat (`:1506-1515`) |

Style: `.tb-tools` is pushed to the right with `margin-left: auto` (`css/style.css:286`). The five icons are
squares of `--h-ctl` (34 px, 38 px with a coarse pointer: `:64`, `:109`), transparent until hovered or active
(`:287-292`, `:299`). `#app-switch` `:295-296`. At 640 px and below the gap between them is 2 px (`:961`); at
380 px and below the icons are 34 px wide (`:965`); in Gear at 420 px and below the link is set in 12 px type
(`:970`).

### 2.5 The key / scale / tempo dropdown ("context bar")

- Markup: `<div class="ctxbar" id="ctxbar" role="region" aria-label="…" hidden>` (`index.html:47-59`):
  five labelled fields (`label.cx-field`): Key `#cx-root`, Scale `#cx-scale`, Mode `#cx-mode` (wrapper
  `#cx-mode-wrap`), BPM `#cx-bpm` (number, 30-280), Time `#cx-sig`; the button `#cx-met`; and `.cx-toggles`
  with the chips `#cx-led` and `#cx-lock` and the status line `#cx-tnote`.
- Filled by `wireContextBar()` (`js/app.js:1525-1758`): 12 keys (`:1534-1538`), the scales in groups
  (`:1539-1555`), 8 time signatures (`:1523`, `:1557-1558`), the mode list, shown only for seven-note scales
  (`:1564-1575`). The chips get their words there: "LUMI Display" (`:1675`), "Scale Lock" (`:1679`). A third
  control is created in JavaScript and is not in the HTML: a two-button group `.seg.cx-colors` "Intervals |
  Note Names" (`data-cxcolormode`, `:1645-1660`).
- It is a dropdown, not a bar: `position: absolute` under the header, right-aligned, at most 720 px wide,
  `z-index: 60` (`css/style.css:384-404`); not displayed unless `<html>` has class `ctx-open` (`:405`).
  `setCtx(on)` (`js/app.js:1107-1118`) sets the class, `aria-expanded`, the `hidden` attribute and moves the
  focus to the first field.
- It closes on: a press outside (`js/app.js:1620-1622`), Escape (`:1623-1629`), the focus leaving it
  (`:1630-1632`), Shift+Tab on its first field (`:1633-1637`), any page change (`paintChrome`, `:1083-1090`),
  the header sliding away (`:1146`), a sheet opening (`:1222`), Back (`:1381`), a pedal press (`:1406`).
- What each control does: Key / Scale / Mode write `fb.root`, `fb.scale`, `fb.mode` and emit `fb:set`
  (`:1687-1706`); BPM writes `met.bpm` and emits `tempo` (`:1707-1714`); Time writes `met.sig` and emits `sig`
  (`:1715-1719`); `#cx-met` emits `met:toggle` (`:1724-1747`); `#cx-led` calls
  `App.midi.setDisplayEnabled` (`:1676`); `#cx-lock` calls `App.scaleLock.set` (`:1680`); the colour group calls
  `App.colors.setMode` (`:1656-1659`). Changes made elsewhere are mirrored back (`:1750-1757`).
- `#cx-tnote` is the only words of explanation, and only while a toggle is on: for the lock, "Only A Dorian
  pitched notes play across tools, playback and MIDI. Drums and recorded/live audio keep their own sound."
  (`:1667-1672`).
- Tap sizes inside it are 44 px by rule (`css/style.css:415-416`), and two suites assert it
  (`tests/context-global.test.js:33-35`, `tests/gear.test.js:492-494`).
- At 640 px and below it spans the screen with 12 px margins (`css/style.css:972-979`).

### 2.6 The two sheets

- Markup, the same for both: `<div class="sheet" id="sheet-<name>" hidden>` › `.sheet-card`
  (`role="dialog" aria-modal="true" aria-labelledby`) › `.sheet-head` (an `<h2>`, a help button
  `[data-sheet-help="<name>"]`, a close button `[data-sheet-close]`) and `<section class="sheet-body"
  id="panel-<name>">`. Metronome `index.html:63-72`, Lights & help `:73-82`.
- The body is a module's panel: `boot()` initialises every name of `PANEL_ORDER` into `#panel-<name>`, and
  `PANEL_ORDER` ends with `metronome`, `lights`, `settings` (`js/app.js:111`, `:1810-1824`). The modules are
  `js/metronome.js:696` and `js/lights.js:177`.
- `SHEETS = { metronome: 'met-btn', lights: 'lights-btn' }` (`js/app.js:1211`). `openSheet` (`:1214-1237`)
  shows the element, adds class `open` (the entrance animation) and `sheet-open` on `<html>`, closes the
  dropdown, disables the clef, calls the module's `onShow`, focuses the close button and emits
  `sheet {name, open: true}`. `closeSheet` (`:1239-1255`) undoes it and gives the focus back. Wiring of the
  icons, the X, the help button and the tap on the backdrop: `wireSheets` (`:1486-1504`).
- While a sheet is open: Escape closes it and Tab stays inside the card (`js/app.js:1852-1866`); keys go to
  the sheet's module (`:1869-1870`); the page underneath stays the active page (`App.active` does not change).
  `App.switchTo('metronome')` opens the sheet (`:1052`); going to any page closes it (`:1027`).
- Style: a fixed full-screen layer, `z-index: 420`, a centred card at most 640 px wide (`css/style.css:302-338`).
  At 640 px and below the card is a bottom sheet, full width, at most 88 % of the height (`:981-989`).
- The Lights & help sheet holds the Help level (five buttons) and a second copy of the colour switch
  ("Color notes by: Interval | Note", `js/lights.js:41-47`, `:150`), next to the one in the dropdown
  (`js/app.js:1648`).

### 2.7 Settings: a page that behaves like an overlay

- soundLAB only: `<section class="panel" id="panel-settings">` (`index.html:97`), built by `js/settings.js`
  (`init` at `:11`, registered at `:995`). It is not in the page list and has no tab or pill
  (`js/app.js:65-67`).
- `switchTo('settings')` has its own branch (`js/app.js:1032-1050`): it remembers the page it came from
  (`prevTab`), hides the pill strip, repaints the tab bars with no tab marked, and is never stored as the
  last page. The gear icon toggles back (`toggleSettings`, `:1196-1205`). Back closes it (`:1383`).
- Gear has no Settings panel; its gear icon navigates to `index.html#settings` (section 2.4), and
  `boot()` opens Settings from that hash (`js/app.js:1802`, `:1929`).

### 2.8 Main, panels, footer

- `<main>` holds one `<section class="panel" id="panel-<page id>">` per page (`index.html:83-99`,
  `gear.html:82-87`). `switchTo` shows one by toggling class `active` (`js/app.js:1070-1072`); style
  `css/style.css:461-467`. `main` is at most 1150 px wide and centred (`:455-459`).
- Footer: `<footer class="foot">` with one sentence (`index.html:100-102`); `boot()` appends " · v2.0.0"
  (`js/app.js:1956-1957`, `:138`). Style `css/style.css:469-477`. It is ordinary page content at the end of
  the document, not a fixed bar.

### 2.9 Boxes that float over a page

None of these is in the HTML; each is created on first use and appended to `<body>`.

| Element | Created by | What it says | Style |
|---|---|---|---|
| `#app-toast` (`role="status"`) | `App.toast(msg, ms)` `js/app.js:2002-2016` | the one app-wide message; 3.2 s by default | `css/style.css:868-886` |
| `#app-update` | `showUpdateBanner` `js/app.js:180-219` | "soundLAB v… is available." with "Update now" / "Later" | `:888-905` |
| `#snd-hint` | `js/app.js:1786-1793` (soundLAB only, `:1785`) and `js/audioin.js:197-202` | "…Click or tap anywhere to turn on sound…" | `:868-883` |
| `#back-hint` | `js/app.js:1454-1459` | "Press Back again to leave soundLAB." (names the app, `:1457`) for 2.5 s | `:868-885` |
| `#xp-toast` | `js/quiz.js:2887-2891` | "Today counts…" / "Daily goal reached." | `:868-885` |
| `#remote-hud` | `js/remote.js:218-232`, style injected at `js/remote.js:388-391` | the pedal's confirmation ("Next", "Start"…), 1.1 s, at 38 % of the height, `z-index: 450` | in `js/remote.js` |
| `#hp-ov` (the help tour) | `js/help.js:228-233`, style `js/help.js:253-264` | a dimmed layer, a ring around the explained element, a card, a close button; `z-index: 500` | in `js/help.js` |

At 900 px and below the five boxes of `css/style.css` sit 84 px above the bottom, clear of the tab bar (`:952`).

Pages also bring their own boxes of the same kind, each with its own rules: `.mh-toast` (`js/midihub.js:1236`),
`.hx-toast` (`js/helix.js:1077`), `#ws-flash` (`js/woodshed.js:1551`), and the full-screen layers `.st-sheet`
(`js/synthtab.js:550`) and `.st-lvpick` (`js/synthlive.js:319`).

### 2.10 The Learn bar

- Not in the HTML. `js/learn-instruments.js` builds `<section id="learn-instruments">` and inserts it as the
  first child of `<main>` (`:39-53`). Its style is injected from the same file (`:43-44`).
- Contents: the select `#learn-instrument` with seven categories (piano, synth, guitar, bass, drums, voice,
  other: `:5-6`), entry buttons `[data-learn-entry]` in `#learn-instrument-links` (`:49`, `:81`), a closed
  "About instrument categories" note (`:50-51`), and a line while an exercise is running
  (`#learn-instrument-session`, `:82`).
- Shown only on the four Learn pages (`:10`, `:77`). `paintChrome` calls `refresh()` on every page change
  (`js/app.js:1089`). The choice is stored as `learn.instrument` (`js/learn-instruments.js:29`, `:35`) and
  announced as `learn:instrument` (`:36`).

### 2.11 State kept on `<html>`

| Class / attribute | Set by | Read by |
|---|---|---|
| `data-app="gear"` | the HTML file, or `js/app.js:74-75` | `css/style.css:970` |
| `data-theme="dark"｜"light"` | `applyTheme` `js/app.js:849-856` (also sets the `theme-color` meta to `#131114` / `#f3efe8`, `:853-854`) | `css/style.css:81`, `:111`, `:116`, `:926`; `css/tokens.css:110`; nine modules read it to pick colours they draw themselves (section 7, row `data-theme`) |
| inline `--accent`, `--accent-dim`, `--accent-glow` | `applyAccent` `js/app.js:826-841` for the three non-amber accents of Settings (`:819-824`) | every rule that uses `var(--accent)` |
| `ctx-open` | `js/app.js:1109` | `css/style.css:405-406` |
| `sheet-open` | `js/app.js:1227`, `:1244` | no style rule; `tests/practice.test.js:111` |
| `scale-locked` | `js/app.js:1136` | `css/style.css:423` (dims the Piano keys that are outside the scale) |
| `goal-due` | `js/xp.js:30` | `css/style.css:269`, `:949` |
| `kl-running` (a Keys lesson is running) | `js/keylessons.js:291`, `:509` | `js/keylessons.js:788-790`: hides parts of the Piano page, nothing of the shell |
| `st-live` (Gear "Go live") | `js/synthlive.js:300` | `js/synthlive.js:328`: hides the header, the phone tab bar and the footer |
| `noctx` | only removed, `js/app.js:1084` | nothing (a leftover) |

## 3. `js/app.js`: what builds and drives the shell

| Piece | Lines | What it does |
|---|---|---|
| `APP_ID`, `APPS` | 74-92 | which app this document is, and per app: url, name, page list, tab groups, the store key of the last page |
| `PAGES`, `GROUPS`, `TAB_KEY`, `HOME` | 93 | taken from `APPS[APP_ID]`; `HOME = PAGES[0]` ('quiz' in soundLAB, 'deck' in Gear) |
| `SPACE_LABELS`, `SUB_LABELS` | 102-108, 114-120 | page names (long) and pill names (short), one table for both apps |
| `PANEL_ORDER` | 111 | the pages plus `metronome`, `lights`, `settings`: the order in which `boot()` initialises modules |
| `ICONS`, `icon(name, size)` | 233-278, 280-287 | 44 inline SVG paths (Lucide; the clef is its own drawing, `:229-232`); `App.icon` returns `<svg class="ic">…`. Never named as a string anywhere in `js/`: `idea`, `timer`, `trophy`, `drum` (search) |
| `App.injectCSS(id, css)` | 802-808 | appends `<style id="css-<id>">` to `<head>` once; 29 modules use it (section 5.4) |
| Theme and accent | 813-868 | `app.theme` dark / light / auto; `app.accent` amber / teal / violet / coral |
| `populateNav`, `goGroup`, `paintSubnav`, `paintGear` | 936-978 | sections 2.2-2.4 |
| `MOVED`, `otherApp`, `resolvePage`, `hashPage`, `hashHere` | 981-1024 | where an id that is not a page of this app goes: the other app, the page that took the feature in, or `HOME` |
| `switchTo(name)` | 1026-1079 | the one way to change page: closes a sheet, resolves the id, hides the old page (`onHide`), keeps the Back list, repaints tab bars and pills, shows the panel (`onShow`), stores the last page, then `paintChrome` |
| `paintChrome` | 1083-1090 | after every page change: closes the dropdown, shows the header, refreshes the Learn bar |
| Dropdown open / close | 1095-1119 | section 2.5 |
| Scale lock | 1124-1136 | `scale.lock` in the store, class `scale-locked` |
| Quiet chrome | 1141-1167 | section 2.1 |
| `addPage` | 1171-1194 | adds a page at run time with its own one-page tab group `gpl-<id>`; used only by `tests/remote.test.js` (comment `:1169-1170`) |
| Sheets | 1211-1257, 1486-1516 | section 2.6 |
| Help level | 1264-1278 | `help.level` 0-4, event `help:level` |
| Note colours | 1287-1363 | `App.colors`; mode in `fb.colorMode` |
| Back | 1372-1392, 1427-1463 | Back walks: help tour → dropdown → sheet → Settings → the page's own `onBack` → earlier pages → `HOME` → a hint that the next Back leaves |
| Pedal | 1398-1423 | `App.remoteAction`: tour, dropdown, sheet, then the page |
| `#page` in the address | 1468-1484, 1800-1803 | `gear.html#midihub`, `index.html#settings` |
| `wireContextBar` | 1525-1758 | section 2.5 |
| Sound warm-up | 1766-1794 | starts audio on the first tap or key; `#snd-hint` |
| `boot()` | 1796-1986 | in this order: the hash (`:1800-1808`), module `init` for every panel (`:1810-1824`), click handlers for tab bars and pills (`:1827-1850`), the global key handler (`:1852-1871`), theme (`:1873`), dropdown, warm-up, auto-hide, sheets, Back, hash (`:1874-1879`), the gear icon (`:1881-1892`), the link across (`:1896-1906`), the first paint of the tab bars (`:1908`), the start page (`:1914-1930`), the start notices (`:1932-1954`), the version in the footer (`:1956-1957`), the update checks (`:1959-1985`) |
| `toast` | 2002-2016 | section 2.9 |

`boot()` writes "Module "<name>" failed to load" into a panel whose module is missing (`js/app.js:1814-1816`).
A panel that does not exist is skipped without a word (`:1813`).

## 4. Where the shell's state is stored

All through `App.store`, under the prefix `soundlab2.` (`soundlab2-next.` on the beta) (`js/app.js:564-566`).

| Key | Meaning | Written at |
|---|---|---|
| `app.tab` / `gear.tab` | last page of soundLAB / of Gear | `js/app.js:1076` (`TAB_KEY`, `:77`, `:86`) |
| `app.gtab.<group id>` | last page inside a tab group | `js/app.js:1064` |
| `app.theme`, `app.accent` | theme, accent | `js/app.js:860`, `:845` |
| `fb.root`, `fb.scale`, `fb.mode` | key, scale, mode | `js/app.js:1690-1692` (and by pages) |
| `met.bpm`, `met.sig` | tempo, time signature | `js/app.js:1712`, `:1717` |
| `scale.lock` | Scale Lock | `js/app.js:2044` |
| `lights.displayEnabled` (and the older `lights.led`) | LUMI Display | `js/midi.js:455`, `:1364` |
| `fb.colorMode` | colours by interval or by note name | `js/app.js:1323`, `:1351` |
| `help.level` | Help level 0-4 | `js/app.js:1275` |
| `learn.instrument` | the Learn instrument | `js/learn-instruments.js:35` |
| `help.seen`, `help.done` | the welcome was shown; a tour was finished | `js/help.js:287`, `:156` |
| `qz.landed` | the one-time first landing on Exercises happened | `js/quiz.js:2949-2950`, `js/app.js:1808` |
| `gear.told`, `gear.thruTold` | two one-time notices | `js/app.js:1920`, `:1936` |

## 5. The style sheets

### 5.1 Files and order

1. `css/tokens.css` (146 lines), first in both pages. The `--sl-*` tokens of the new look: dark values on
   `:root` (`:11-107`), light values on `:root[data-theme="light"]` (`:110-138`), 48 px controls with a coarse
   pointer (`:140-142`), zero durations under reduced motion (`:144-146`). **No rule anywhere uses a `--sl-*`
   token yet**: a search of `js/`, `css/`, `index.html` and `gear.html` finds the string only inside
   `css/tokens.css`.
2. `css/style.css` (997 lines), the look the app has today, on its own older variables (`--bg`, `--card`,
   `--accent`, `--h-ctl`…).
3. `css/lumi-practice.css` (46 lines, soundLAB only): every rule is scoped to `#pn-lumi`, a section of the
   Piano page (`:1-2`); two breakpoints of its own, 1100 and 700 px (`:45-46`). Not shell.
4. After those, in the order the scripts run, one `<style id="css-<id>">` per module from `App.injectCSS`
   (`js/app.js:802-808`). They come later in the document than the three linked files, so at equal
   specificity a module's rule wins over `css/style.css`. `css/style.css:838` has a block "higher specificity
   than injected module CSS" for that reason.

### 5.2 `css/style.css`, section by section

| Lines | Section |
|---|---|
| 1-7 | header comment; the list of class names "used by modules (do not rename)": card, row, tight, spread, grid2, muted, small, big-display, mid-display, btn (primary/danger/big/sm), field, seg, chip, legend-dot, list, error, good, bad, tab, tabs, panel |
| 9-40 | five `@font-face` rules: Barlow 400 and 500, Barlow Condensed 600 and 700, Bebas Neue |
| 42-75 | **variables, dark** (`:root`): surfaces, text, accent and its tints, status colours, `--h-ctl: 34px`, `--radius: 16px`, three font stacks |
| 77-108 | **the light theme block**: the same variables re-inked on `:root[data-theme="light"]` |
| 109 | `--h-ctl: 38px` with a coarse pointer |
| 111-121 | the only two explicit light-theme rules outside the block: the header background and the arrow of `select` (a third is at `:926`, the phone tab bar background) |
| 123-159 | **base**: box sizing, no double-tap zoom, form controls inherit the font, `html, body` (15 px text, a faint amber glow in the background), text selection off except in fields, `.ic` |
| 161-232 | **top bar**: `.topbar`, the tag's hide rule, `.bar-hidden`, `.brand`, `.wordmark`, `.brand .tag` |
| 234-279 | **tab bars**: `.tabbar`, `.tabbar-top`, `.tabbar-bottom`, `.tabbar-btn`, the goal dot |
| 281-299 | **corner tools**: `.tb-tools`, `.icon-btn`, `#app-switch`, the states of `#met-btn`, `#settings-btn`, `#lights-btn`, `#ctx-btn` |
| 301-338 | **sheets**: `.sheet`, `.sheet-card`, `@keyframes sheet-in`, `.sheet-head` |
| 340-380 | **pill strip**: `.subnav`, `.subtab` |
| 382-448 | **dropdown**: `.ctxbar`, `@keyframes ctx-in`, `#ctx-btn` and its caret, the 44 px rule, `.cx-toggles`, `.cx-tnote`, `.scale-locked`, `.cx-field`, its fields, `#cx-met` |
| 450-453 | the leftover `.tabs` / `.tab` |
| 455-477 | **layout**: `main`, `.panel`, `@keyframes panel-in`, `.foot` |
| 479-575 | **components 1**: `.card` and its headings, `.row`, `.spread`, `.grid2`, `.muted`, `.small`, `details.tips`, `.big-display`, `.mid-display` |
| 577-629 | **buttons**: `.btn`, `.primary`, `.danger`, `.big`, `.sm`, disabled, `a.btn` |
| 631-697 | **form controls**: `label.field`, `.ctl-label`, `select` / number / text fields, focus rings (`:689-695`), checkbox |
| 699-740 | range sliders |
| 742-773 | `.seg` (the segmented control) |
| 775-797 | `.chip` |
| 799-836 | `.legend-dot`, `.list`, `.error`, `.good`, `.bad`, SVG helpers |
| 838-859 | **per-area rules**: the metronome's beat dots (`#panel-metronome .met-dot`); the only page-specific block in the file |
| 861-865 | scroll bars |
| 867-905 | **floating boxes**: `#snd-hint, #back-hint, #xp-toast, #app-toast` (`:868-886`; the comment above them still says "update banner") and `#app-update` (`:888-905`) |
| 907-993 | **small screens** (next table) |
| 995-997 | reduced motion: every animation and transition off |

### 5.3 Every media query in `css/style.css`

| Line | Condition | What changes |
|---|---|---|
| 109 | `pointer: coarse` | `--h-ctl` 38 px |
| 183 | 901 to 1120 px | the tag beside the logo is hidden |
| 260, 291, 374, 555, 597, 607, 611, 685 | `hover: hover` | hover looks only where there is a hover |
| 417 | 600 px and below | 16 px type in the dropdown's fields |
| 525 | 820 px and below | `.grid2` becomes one column |
| 910-953 | **900 px and below** | top tab bar off, bottom tab bar on; `main` and `.foot` get bottom padding; the floating boxes move up |
| 955-962 | 640 px and below | tighter header, tag hidden, smaller logo, 2 px between the corner tools |
| 964-966 | 380 px and below | corner icons 34 px wide |
| 969-971 | 420 px and below, Gear only | the link "soundLAB" in 12 px type |
| 972-993 | 640 px and below | the dropdown spans the screen; sheets become bottom sheets; `main` padding 18 / 12 / 60 px; smaller cards and big numbers |
| 995-997 | `prefers-reduced-motion: reduce` | no motion |

Two breakpoints matter for the shell and they are not the same: the tab bar moves to the bottom at **900 px**,
the sheets become bottom sheets and the dropdown spans the screen at **640 px**. Between 641 and 900 px the
tab bar is at the bottom while the sheets are centred cards.

A detail of rule order: at 640 px and below `main { padding: 18px 12px 60px }` (`:990`) comes after
`main { padding-bottom: calc(96px + …) }` (`:950`) and wins, so on phones `main` has 60 px of bottom padding
(measured). The page still clears the 64 px tab bar because the footer below it has 84 px (`:951`, measured).

### 5.4 Injected styles

`App.injectCSS` is called by 29 files: chordchart, chords, fretboard, helix, help, jam, keylessons,
learn-instruments, lights, metronome (id `met`), midihub, pads, performance-player, piano,
practice-progress-ui, practiceplan, quiz, remote, scoreplayer, settings, songs, synthdeck-scope, synthdeck,
synthlive, synthtab, theorytab, trainer, tuner, woodshed (line numbers in section 7, row `App.injectCSS(`).
Those strings use the old variables: counted over `js/`, `var(--accent` 176 times, `var(--muted` 153,
`var(--line` 109, `var(--text` 82, `var(--card2` 63. The old variables therefore have to stay defined for as
long as any page, in either app, keeps its present look.

## 6. What it looks like at 360, 390, 820, 901 and 1200 px

Dark and light were both opened at every width in both apps: 20 runs, each with the start page, the open
dropdown, both sheets, and two more pages. **The geometry is identical in dark and light in all 20 pairs**
(header, corner tools, pill strip, dropdown and metronome card compared box by box: 0 differences) and no run
logged a page error or a console error (`shots/shell/measure.json`, field `errs`).

### 6.1 Measured boxes, soundLAB (x,y width×height in CSS px)

| | 360 (touch) | 390 (touch) | 820 | 901 | 1200 |
|---|---|---|---|---|---|
| Header, a page with pills | 360×93 | 390×93 | 820×105 | 901×109 | 1200×109 |
| Header, Settings (no pills) | not measured | 390×51 | not measured | not measured | 1200×59 |
| Tab bar | bottom, 0,716 360×64, five buttons 70×55 | bottom, 390×64, five 76×55 | bottom, 820×64, five 162×55 | top, at 142,10 445×38 | top, at 214,10 445×38 |
| Tag "alpha" | hidden | hidden | shown, 60×23 | hidden | shown |
| Logo | 79×21 | 79×21 | 98×26 | 98×26 | 98×26 |
| Corner tools box | 233×38 at x 115 | 253×38 at x 125 | 253×34 at x 549 | 253×34 at x 630 | 253×34 at x 929 |
| One icon | 34×38 | 38×38 | 34×34 (mouse) | 34×34 | 34×34 |
| Link "Gear" | 53×38 | 53×38 | 53×34 | 53×34 | 53×34 |
| Pills | 32 high, row at y 54 | same | row at y 60 | row at y 64 | row at y 64 |
| Learn bar (Learn pages) | 336×184 | 366×168 | 784×116 | 865×116 | 1114×116 |
| Dropdown, five-note scale | 336×253 at 12,98 | 366×253 at 12,98 | 720×149 at 82,110 | 720×149 at 163,114 | 720×149 at 462,114 |
| Dropdown, seven-note scale, both toggles on | not measured | 366×390 | not measured | not measured | 720×251 |
| Metronome card | 360×625, bottom sheet | 390×606, bottom sheet | 640×552, centred | 640×552, centred | 640×552, centred |
| Lights & help card | 360×630 | 390×630 | 640×555 | 640×555 | 640×555 |
| Toast "Nothing to move on here" | 180×68 (two lines) at y 628 | 181×47 at y 649 | 181×47 at y 669 | 181×47 at y 735 | 181×47 at y 735 |
| `main` bottom padding / footer bottom padding | 60 / 84 px | 60 / 84 px | 96 / 84 px | 70 / 34 px | 70 / 34 px |
| Sideways scroll | none | none | none | none | none |

The 34×38 icon at 360 px: the rule for 380 px and below sets width and height to 34 px
(`css/style.css:965`), but `.btn.sm` has `min-height: var(--h-ctl)` = 38 px with a coarse pointer (`:627`),
so only the width shrinks.

At 1024×640 (the size the design system names for the FL Studio plugin window, `docs/DESIGN-SYSTEM.md:53`):
header 109 px, top tab bar, tag hidden, the metronome card 640×552 starting at y 44, so it ends at 596 and
fits (`shots/shell/index-dark-1024x640-*.png`).

### 6.2 Gear

The same shell with two tabs. Bottom tab buttons 174×55 at 360, 189×55 at 390, 404×55 at 820. The link reads
"soundLAB": 64×38 at 360 and 390 (the tight rule, `css/style.css:970`), 86×34 from 820 up. The tag "gear" is
52×23, shown at 820 and 1200. On the Helix page (a group of one page) there is no pill strip and the header is
51 px (phones), 55 px (820) and 59 px (901, 1200). There is no Learn bar. The dropdown and both sheets have
exactly soundLAB's boxes.

### 6.3 What the screenshots show

- **1200, soundLAB, start page** (`index-dark-1200-1-home.png`, `index-light-1200-1-home.png`): one header row:
  the logo, the tag "ALPHA", five tabs with icons ("Learn" marked with an amber outline and tint), then, at
  the right, a bordered button "Gear" and five borderless icons (question mark, gear, clef with a small caret,
  bulb, metronome). Second row: four pills, "Exercises" marked. Then the page: the Learn bar as a full-width
  card, and under it, narrower, the Exercises start: a strip with the streak, today's minutes ring, the
  "Consistency level" and an amber Start button; three tabs Path / Topics / Progress; the path. Nothing shows
  the key or tempo. Light is the same picture on warm off-white with a darker amber.
- **1200, dropdown open** (`index-dark-1200-2-ctx.png`): a card hangs from the right edge under the header and
  covers the right half of the Learn bar: Key, Scale, BPM, Time, a small metronome-and-play button; under a
  hairline three controls: "LUMI Display", "Scale Lock", and "Intervals | Note Names". The clef is tinted.
- **1200, metronome sheet** (`index-dark-1200-3-met.png`): the page is dimmed; a centred card with a caps title,
  a help and a close button, the big tempo number, a slider, four beat dots, START and TAP, Time,
  Subdivision, Volume and two folded sections. The clef in the header is greyed out.
- **1200, Settings** (`index-dark-1200-5-settings.png`): the header loses its second row, no tab is marked, the
  gear icon is tinted; the page is a 760 px column of cards.
- **901** (`index-light-901-1-home.png`): as 1200 without the tag; the tabs start right after the logo.
- **820** (`index-dark-820-1-home.png`, `index-dark-820-2-ctx.png`): the header has no tabs: logo, tag, and the
  corner tools; pills below; the five tabs sit in a bar along the bottom, icon over label, the active one with
  a tinted pill behind its icon. The open dropdown is 720 px wide and covers most of the Learn bar.
- **390** (`index-dark-390-1-home.png`): logo (smaller, no tag), "Gear" and five icons on one row; four pills;
  the Learn bar is a tall card (the select, two entry buttons side by side, the note line); the Exercises
  strip is stacked; the bottom tab bar. The first screen is filled by the header (93 px), the Learn bar
  (168 px) and the strip.
- **390, dropdown** (`index-dark-390-2-ctx.png`, `extra-390-ctx-full.png`): the card spans the screen under
  the header. Rows: Key and Scale; BPM, Time and the metronome button; the two chips; the colour switch. With
  a seven-note scale a Mode field joins and the metronome button drops to its own row; with both toggles on a
  four-line status text is added and the card is 390 px high, half of the 780 px screen.
- **390, sheets** (`index-dark-390-3-met.png`, `index-light-390-4-lights.png`): a full-width sheet rises from
  the bottom and covers the lower 80 % of the screen, the tab bar included.
- **360** (`index-dark-360-1-home.png`): as 390; the icons stand closer; the second entry button of the Learn
  bar wraps to two lines.
- **Header hidden** (`extra-390-bar-hidden.png`): after scrolling 500 px down the header is gone (its top is at
  -97 px, measured) and the page fills the screen to the bottom tab bar, which stays.
- **Floating boxes at 390** (`extra-390-back-hint.png`, `extra-390-app-update.png`, `index-dark-390-7-toast.png`,
  `extra-390-snd-hint.png`): the Back hint is a 195 px wide box in two lines, the update banner a 195 px wide
  box of three rows (text, "Update now", "Later") 164 px high; the sound hint is 358 px wide. The first two
  are narrow because they are placed with `left: 50%` and no width, so they can grow only to half the screen
  (`css/style.css:869-871`, `:885`, `:888-905`); the sound hint has a width (`:874`).
- **Pedal confirmation** (`extra-390-remote-hud.png`): an amber-outlined pill "→ START" over the upper third of
  the page.
- **Help tour** (`extra-1200-help-tour.png`): the page is dimmed, a card "Exercises … 1 of 6 … Next" in the
  middle; the tour's own close button sits in the top right corner, on top of the metronome icon.
- **Gear** (`gear-dark-1200-1-home.png`, `gear-dark-360-1-home.png`, `gear-light-820-6-helix.png`,
  `gear-light-390-2-ctx.png`): the same header with the tag "GEAR", two tabs (Synth, Helix), the button
  "soundLAB", the same five icons; pills Deck / Live / Hub. On a phone two wide tabs along the bottom.

### 6.4 The home mockup

`docs/design/home-mockup.html` rendered with `?theme=e` (`mockup-e-1280.png`, `mockup-e-1200.png`,
`mockup-e-390.png`).

- It is a fixed picture of 1280×800 px: `html, body { width: 1280px; height: 800px; overflow: hidden }`
  (`docs/design/home-mockup.html:26`), every block absolutely placed (`:32`, `:48`, `:63`, `:79`, `:85`). At
  1200 px the right 80 px are cut off (the gear icon is missing in the picture); at 390 px one sees the left
  390 px only: the logo, part of the tabs, the Key and Tempo chips, "A DORIAN," and four white keys.
  **There is no design for a phone or a tablet in this file.**
- What it shows at 1280 px, top to bottom: a 64 px header with the wordmark as text in Bebas, five text-only
  tabs (LEARN underlined in amber), and at the right "LUMI" and "FL Studio" each with a green dot and a gear
  in a circle (`:114-123`). No tag, no question mark, no clef, no bulb, no metronome, no link to Gear.
- At y 84 a row of five 44 px pills (`:126-133`): "KEY A Dorian ▾", "TEMPO 100 − +", a switch with "SCALE LOCK
  ON · only A Dorian notes sound" (amber outline), "LUMI LIGHTS Scale ▾", "HELP ●●●○ Colors". The row runs
  from x 72 to x 1114: 1,042 px (measured).
- An amber small-caps line "NEXT UP · KEYS LESSON 7 · FROM JAMES", a headline in 100 px Bebas "A DORIAN, UP AND
  DOWN", a line "72 BPM · pass 2 of 3 · about 6 min", an amber pill button "▶ START" and beside it "Something
  else · 2 blocks left this week" (`:134-142`).
- A keyboard across the width, 230 px high: one coloured dot per scale key, one key filled red ("play this
  now"), note names under the keys (`:144`, drawn by the script `:162-191`).
- A 64 px footer line: a small goal ring with "Today 14 of 20 min", "12-day streak", "This week 1 of 3 blocks
  done", and at the right "The LUMI shows the same lights · filled key = play this now" (`:147-152`).
- The mockup has its own variables (`:13-18`), not the `--sl-*` tokens; `css/tokens.css` is the binding file
  (`docs/DESIGN-SYSTEM.md:5-6`).

## 7. Which suites name which part

`tests/run.sh:17` lists 67 suites. 54 of them open the app in a browser (they `require('playwright')`); 13
are pure Node: assets, fingering, midi-ingress, midi-ports, note-palette, pages-deploy, pages-next,
performance-engine, performance-import, practice-input, practice-progress, practice-router, release-workflow.

38 suites name at least one id, class or call of the tables below in code: assets (pure Node, it reads the
HTML) and the 37 browser suites audioin, btmidi, chordchart, colors, context-global, display-master, game,
gear, helix, instrument-xp, keys, learn-instruments, lights, lumi-contexts, midihub, multiin, nav, oneopen,
practice, practiceplan, quiz, remote, remote-gear, remote-keys, remote-plan, remote-quiz, remote-runners,
remote-shed, smoke, storage-import, synthconn, synthconnect, synthdeck-scope, synthtab, taps, trim, update.
(synthdeck appears in the tables only through the Deck's own attributes, see below.) The other 16 browser
suites name none of them, but they load the page and wait for the app to be up, so they need the shell to
boot without an error: audio-level, instrument-session, lumi-practice, lumidisplay, midihub-lock,
midihub-player, midihub-wheel, performance-progress, performance-safety, performance, pitch-lock, portnames,
practice-audio, practice-progress-ui, quiz-correction, sound-lock.

How to read the tables: "Suites that name it" = the suites that would have to change if the name were renamed
or the element removed. A row with "none" in both columns is named only by `css/style.css` and the HTML.
Three rows carry hits that are not the shell's: `data-group` and `data-page` in `js/synthdeck.js` and
`tests/synthdeck.test.js` are the Deck's own attributes, and `.icon-btn` in `js/synthtab.js:115,148` is the
Deck using the shell's class for two of its own buttons.

**Header and wordmark**

| Id / class / call | Named in `js/` (file:lines) | Suites that name it in code (suite:lines) | Suites |
|---|---|---|---|
| `.topbar` | app.js:1141,1143,1145,1150,1151,1155,1159,1166 · keylessons.js:305 · quiz.js:1273 · synthlive.js:328 | quiz:363,365 · synthtab:231,236,246,249 | 2 |
| `.bar-hidden` | app.js:1145 | quiz:363,365 | 1 |
| `.brand` | none | context-global:24 · gear:127,212,483 · nav:133 | 3 |
| `.wordmark` | none | none | 0 |
| `.wm-lab` | none | none | 0 |
| `.tag (beside the logo)` | none | assets:156,172 · gear:212 | 2 |

**Corner tools**

| Id / class / call | Named in `js/` (file:lines) | Suites that name it in code (suite:lines) | Suites |
|---|---|---|---|
| `.tb-tools` | none | context-global:25 · gear:127,483 · nav:92 | 3 |
| `#tabs` | app.js:1844 | none | 0 |
| `.icon-btn` | synthtab.js:115,148 | nav:92 | 1 |
| `#app-switch` | app.js:1896 | assets:177 · gear:127,385,386,392,395,… (8) · nav:35,38 · trim:626 | 4 |
| `#help-btn` | help.js:157,262,266 | context-global:108 · nav:94 | 2 |
| `#settings-btn` | app.js:976,1881 | assets:177 · context-global:92 · gear:412,416,749 · nav:94 · practice:112 | 5 |
| `#ctx-btn` | app.js:1103,1110,1221,1601 · help.js:40 | assets:177 · context-global:21,63,71,75,78,… (17) · gear:174,477,480,640,642 · nav:86,93,94,96,97,… (11) · quiz:345 · storage-import:434 | 6 |
| `.ctx-caret` | app.js:1610 | none | 0 |
| `#lights-btn` | app.js:1211 | assets:177 · context-global:23 · game:274 · gear:482,646 · nav:94 | 5 |
| `#met-btn` | app.js:1211,1506 · help.js:247 | assets:177 · nav:59,61,66,68,70,… (11) | 2 |

**Tab bars and pill strip**

| Id / class / call | Named in `js/` (file:lines) | Suites that name it in code (suite:lines) | Suites |
|---|---|---|---|
| `#tabbar` | app.js:943,1827 | assets:177 · gear:216,446 · helix:90 · midihub:62 · nav:28,29,31,40,134 · quiz:54,55 · synthtab:63 · trim:246,421 | 8 |
| `#tabbar-m` | app.js:943,1827 · quiz.js:1284 · synthlive.js:328 | assets:177 · game:374 · gear:216,445,446 · nav:30,131,134,135,147 · synthtab:231,312,324 · taps:18 · trim:246 | 7 |
| `.tabbar-top` | none | none | 0 |
| `.tabbar-bottom` | none | none | 0 |
| `.tabbar-btn` | app.js:940,1831 | game:374 · gear:216,445 · helix:90 · midihub:62 · nav:20,28,31,33,40,… (7) · quiz:54,55 · synthtab:63,312,324 · trim:242,245,421 | 8 |
| `data-group` | app.js:940,1833 · synthdeck.js:815 | game:374 · synthdeck:164,215 | 2 |
| `group ids (gtheory ginst gkeys gplay gprac gsynth ghelix)` | app.js:80,81,82,83,84,89,90 | game:374 · storage-import:98 · trim:419,427,429,434,436 | 3 |
| `aria-current` | app.js:941 | none | 0 |
| `#subnav / .subnav` | app.js:962,1044,1837 · practiceplan.js:350 | assets:177 · gear:217,387 · helix:93 · midihub:61 · nav:42,43,46,48,50,… (6) · practiceplan:60,408 · quiz:56 · synthtab:63 · trim:422 | 9 |
| `.subtab` | app.js:968,1840 · practiceplan.js:350 | chordchart:26 · gear:217,387 · helix:93 · midihub:61 · nav:33,42,43,46,48,… (7) · practiceplan:60,408 · quiz:56 · synthtab:63 · trim:242,422 | 9 |
| `data-page` | app.js:969,1841 · practiceplan.js:350 · synthdeck.js:709,754,955,974,975 | chordchart:26 · synthdeck:331,352 | 2 |

**Context bar**

| Id / class / call | Named in `js/` (file:lines) | Suites that name it in code (suite:lines) | Suites |
|---|---|---|---|
| `#ctxbar / .ctxbar` | app.js:1110,1220,1601 | assets:177 · context-global:21,32,67,75 · gear:480,491,500 · nav:90,142 | 4 |
| `html.ctx-open` | app.js:1095,1109 | none | 0 |
| `App.ctx(` | none | context-global:27,73,75,78,87,… (9) · display-master:77 · gear:486,503 · lights:66 · lumi-contexts:99 · nav:142,144 | 6 |
| `#cx-root` | app.js:1526 | context-global:32,36,73,80,127 · gear:175,355,397,491 · storage-import:433,502,545,573,589,… (8) | 3 |
| `#cx-scale / .cx-scale` | app.js:1527 | context-global:32,36,80,127 · gear:176,355,397,491 · nav:98,115,119 · storage-import:433,502 | 4 |
| `#cx-mode` | app.js:1528 | none | 0 |
| `#cx-mode-wrap` | app.js:1529 | none | 0 |
| `#cx-bpm` | app.js:1530 | context-global:127 · storage-import:433,502,545,643,1173,… (7) · taps:49 | 3 |
| `#cx-sig` | app.js:1531 | context-global:127 | 1 |
| `#cx-met` | app.js:1724 | nav:86 | 1 |
| `#cx-led` | app.js:1644 | context-global:32,37,81 · display-master:79,92,101,103 · gear:491 · lights:64 · lumi-contexts:99,102 | 5 |
| `#cx-lock` | app.js:1644 | context-global:32,37,81 · display-master:93 · gear:491 · lights:93,95,110 | 4 |
| `#cx-tnote / .cx-tnote` | app.js:1644 | context-global:85 · gear:641 · lights:95 | 3 |
| `.cx-colors` | app.js:1646 | colors:89 | 1 |
| `data-cxcolormode` | app.js:1648,1651,1652,1657,1658 | colors:86,88 · context-global:82 | 2 |
| `.cx-field` | none | none | 0 |
| `.cx-toggles` | none | none | 0 |

**Sheets**

| Id / class / call | Named in `js/` (file:lines) | Suites that name it in code (suite:lines) | Suites |
|---|---|---|---|
| `#sheet-metronome` | none | assets:177 · nav:60,61,68,72,75,… (7) | 2 |
| `#sheet-lights` | none | assets:177 · btmidi:95 · game:278 · gear:647 | 4 |
| `'#sheet-' + name` | app.js:1217,1241,1488,1856 | context-global:102 | 1 |
| `.sheet` | none | none | 0 |
| `.sheet.open` | none | game:320 | 1 |
| `.sheet-card` | app.js:1856 | nav:150 | 1 |
| `.sheet-head` | none | none | 0 |
| `.sheet-body` | none | none | 0 |
| `data-sheet-close` | app.js:1234,1494,1502 | game:278 · nav:62,74 | 2 |
| `data-sheet-help` | app.js:1496 | gear:647 · nav:77 | 2 |
| `html.sheet-open` | app.js:1227,1244 | practice:111 | 1 |
| `#panel-metronome` | none | assets:177 | 1 |
| `#panel-lights` | none | assets:177 · btmidi:95 · lights:425 | 3 |
| `App.sheet / openSheet / closeSheet` | lights.js:142,198,199 · quiz.js:2315 | colors:122,219,309,358 · context-global:98,106 · game:275 · gear:649 · learn-instruments:180 · lights:219 · lumi-contexts:221,224 · nav:60,81,83,85 · remote-quiz:144,145 · remote:164,165 | 10 |

**Settings, main, panels, footer**

| Id / class / call | Named in `js/` (file:lines) | Suites that name it in code (suite:lines) | Suites |
|---|---|---|---|
| `#panel-settings` | app.js:1039 · settings.js:26 | gear:220,753 · oneopen:75 · trim:261 | 3 |
| `App.switchTo('settings')` | app.js:1203,1929 · lights.js:142,159 · songs.js:701 | audioin:302,372,389,407,429,… (7) · btmidi:76,104,122 · context-global:89 · gear:550,568 · lights:248 · multiin:98,134 · remote:74,91,182,284 · storage-import:337,346,905,1134 · trim:495,559,567,576,583,… (6) | 9 |
| `.panel (class)` | app.js:1038,1070,1177 | context-global:59 · gear:213,214,215,239,471,… (6) · smoke:85,87,88 · storage-import:176,177,178 · trim:158,180,181 | 5 |
| `.panel.active` | none | gear:215,239,744 · smoke:85 · storage-import:176 · trim:158 | 4 |
| `#panel-<page>` | keylessons.js:788 · quiz.js:2638 · synthdeck.js:532 · synthlive.js:328 · synthtab.js:27,523 | colors:65,175 · gear:232,267,641,763 · instrument-xp:109 · lumi-contexts:130,132,142,146,161,… (6) · midihub:87 · oneopen:37,156 · practiceplan:55,68,69 · quiz:327,371 · remote-gear:150,232 · remote-runners:124,126,127 · storage-import:1018 · synthconnect:46 · synthdeck-scope:59 · synthtab:66,67,68,80,88,… (36) · taps:20 · trim:74,75,76 | 16 |
| `'#panel-' + id` | app.js:1071,1178,1811 | gear:244 · smoke:30,84 · storage-import:174 · trim:156,217,223 | 4 |
| `.foot` | app.js:1956 · synthlive.js:328 | gear:212 | 1 |

**Floating layers**

| Id / class / call | Named in `js/` (file:lines) | Suites that name it in code (suite:lines) | Suites |
|---|---|---|---|
| `#app-toast` | app.js:1950,2003,2006 · midihub.js:182 | gear:523,589,590,595,621,… (6) · midihub:128,130,131,133 · remote-gear:64,65 · remote-keys:55 · remote-plan:45,47 · remote-quiz:61 · remote-runners:50,51 · remote-shed:55 · remote:44,46 · storage-import:179 · synthconn:29,102 · trim:159,160 | 12 |
| `App.toast` | fretboard.js:1329 · lumi-practice.js:285 · midihub.js:1281 · performance-player.js:132,139 · practiceplan.js:225 · quiz.js:2562,2568 · remote.js:194,197,201,213,298,319,328,377 · scoreplayer.js:278,279,281,441,446,449,451,528,… (10) · songs.js:386,399 · synthdeck.js:59 · synthlive.js:27,146,148 · synthtab.js:389,474,494 · trainer.js:470,474 | midihub:128,131,133 · remote:62 | 2 |
| `#app-update` | app.js:181,183 | update:19 | 1 |
| `#snd-hint` | app.js:1789 · audioin.js:197,199 | audioin:565,569 · quiz:389,393,396 | 2 |
| `#back-hint` | app.js:1455 | gear:674 · practice:123 | 2 |
| `#xp-toast` | quiz.js:2890,2891 | practice:48 | 1 |
| `#remote-hud` | remote.js:221,389,392 | remote-gear:66,304,389 · remote-keys:54 · remote-plan:46 · remote-quiz:60,445 · remote-runners:52 · remote-shed:54 · remote:45,118,201 | 7 |
| `#hp-ov / .hp-*` | app.js:1402 · help.js:175,176,189,193,194,213,216,229,… (13) | gear:648,797 · nav:78,80 · remote:168,170 | 3 |
| `Help.open / isOpen / close` | app.js:1097,1380,1400,1401,1499 · quiz.js:2315 · remote.js:189 | context-global:109,110 · gear:222,649,793,797,802 · remote:167,172 · storage-import:437 | 4 |

**Learn bar**

| Id / class / call | Named in `js/` (file:lines) | Suites that name it in code (suite:lines) | Suites |
|---|---|---|---|
| `#learn-instruments` | learn-instruments.js:43,44,45 | learn-instruments:83,86 | 1 |
| `#learn-instrument (select)` | help.js:84 · learn-instruments.js:48 | learn-instruments:22,34,44,51,57,… (13) | 1 |
| `#learn-instrument-links` | learn-instruments.js:49,81 | learn-instruments:49,94,114 | 1 |
| `data-learn-entry` | learn-instruments.js:58,60,81 | learn-instruments:89,121 | 1 |
| `#learn-instrument-note` | learn-instruments.js:50,80 | learn-instruments:48 | 1 |
| `#learn-instrument-session` | learn-instruments.js:52,82 | none | 0 |
| `#learn-stop-exercise` | learn-instruments.js:56,82 | learn-instruments:55,56 | 1 |
| `.learn-inst-*` | learn-instruments.js:44,48,49,52,80 | none | 0 |

**State on the `html` element, and helpers**

| Id / class / call | Named in `js/` (file:lines) | Suites that name it in code (suite:lines) | Suites |
|---|---|---|---|
| `html.scale-locked` | app.js:1136 | lights:94,111 | 1 |
| `html.goal-due` | xp.js:30 | game:374 | 1 |
| `html.noctx` | app.js:1084 | none | 0 |
| `html.kl-running` | keylessons.js:291,509,788,789,790 | keys:366 | 1 |
| `data-theme` | app.js:836,852 · chords.js:1062,1063 · fretboard.js:1735,1768 · keylessons.js:811 · pads.js:157 · quiz.js:2774 · settings.js:60,61,62,613,618,620 · synthdeck-scope.js:70,453 · theorytab.js:399,400,401,402 · woodshed.js:832 | synthdeck-scope:244,253 | 1 |
| `data-app` | app.js:74,75 | assets:127 · gear:211,228 · trim:215,221 | 3 |
| `App.setTheme / themePref` | settings.js:611,620 | context-global:57,118 · gear:470 | 2 |
| `.ic (icon svg)` | app.js:284 · help.js:262,268 · quiz.js:1847,2707,2771,2804,2811,2826,2866 · remote.js:392 · woodshed.js:843,1544 | context-global:38,120 · gear:484 | 2 |
| `App.icon(` | chordchart.js:200,219,347,370,372,373 · chords.js:1116,1124 · fretboard.js:769,1249,1252,1257,1797,1804,1806,1809,… (22) · help.js:231 · jam.js:892,920,1054 · keylessons.js:558,560,572 · midihub.js:758,760,815,1092,1123 · piano.js:968,1370,1372,1377,1392,1393,1394,1407,… (12) · quiz.js:1347,1369,1410,1435,1470,1529,1565,1577,… (14) · remote.js:228 · songs.js:246,276,582,583,585 · synthdeck.js:449,646,701,722,797,819,933,945,… (11) · theorytab.js:415,416,438,439 · trainer.js:358 · tuner.js:164 · woodshed.js:842,1195,1208,1222,1335 | none | 0 |
| `App.injectCSS(` | app.js:802 · chordchart.js:339 · chords.js:1336 · fretboard.js:1672 · helix.js:1047 · help.js:253 · jam.js:993 · keylessons.js:836 · learn-instruments.js:43 · lights.js:180 · metronome.js:547 · midihub.js:1208 · pads.js:140 · performance-player.js:328 · piano.js:1273 · practice-progress-ui.js:38 · practiceplan.js:305 · quiz.js:2885 · remote.js:388 · scoreplayer.js:610 · settings.js:12 · songs.js:512 · synthdeck-scope.js:485 · synthdeck.js:1678 · synthlive.js:310 · synthtab.js:522 · theorytab.js:405 · trainer.js:305 · tuner.js:615 · woodshed.js:1532 | none | 0 |
| `App.showBar` | app.js:1087,1114,1148,1166,2034 · help.js:221 · keylessons.js:304 · synthlive.js:303 | none | 0 |

### 7.1 Suites that depend on the shell's words

| Words | Where they come from | Suites |
|---|---|---|
| Tab labels "Learn｜Guitar｜Keys｜Play｜Train" | `js/app.js:80-84` | `tests/nav.test.js:37`, `tests/trim.test.js:68` (used at `:257`), `tests/quiz.test.js:57`; clicked by label at `tests/nav.test.js:40-54`, `:147`, `tests/trim.test.js:421-428` |
| Tab labels "Synth｜Helix" | `js/app.js:89-90` | `tests/gear.test.js:231`, `:455`, `tests/midihub.test.js:70`, `tests/synthtab.test.js:71` |
| Pill labels | `js/app.js:114-120` | "Exercises｜Chords｜Circle｜Plan" `tests/quiz.test.js:58`; "Piano｜Charts｜Pads", "Neck｜Tab｜Notation", "Woodshed｜Tuner" `tests/nav.test.js:42-51`, `tests/trim.test.js:435-437`; "Deck｜Live｜Hub" `tests/gear.test.js:231`, `tests/midihub.test.js:70`, `tests/synthtab.test.js:71`; /plan/ `tests/practiceplan.test.js:60` |
| "Gear" / "soundLAB", "Open soundLAB Gear" | `js/app.js:1902-1904` | `tests/nav.test.js:38`, `tests/gear.test.js:386`, `:399`, `:457` |
| The tag "gear", the footer "soundLAB Gear alpha" | `gear.html:35`, `:89` | `tests/gear.test.js:228`, `tests/assets.test.js:175`, `:185` |
| The clef's label "Key, scale & tempo: … · N BPM" | `js/app.js:1604-1605` | `tests/nav.test.js:94`, `:112`, `tests/context-global.test.js:67`, `tests/gear.test.js:500` |
| The order of the corner icons `help-btn,settings-btn,ctx-btn,lights-btn,met-btn` | `index.html:41-45` | `tests/nav.test.js:92-94` |
| "Press Back again to leave <app>." | `js/app.js:1457` | `tests/practice.test.js:124`, `tests/gear.test.js:695`, `:728`, `:734` |
| "Nothing to move on here" | `js/remote.js:44` | `tests/remote.test.js:188`, `tests/remote-shed.test.js:100`, `tests/remote-runners.test.js:142`, `tests/remote-gear.test.js:411`, `:414` |
| "v… is available", "Update now" | `js/app.js:185-199` | `tests/update.test.js:37-45` |
| "failed to load" / "crashed during init" in a panel | `js/app.js:1815`, `:1822` | `tests/smoke.test.js:88`, `tests/trim.test.js:181`, `tests/storage-import.test.js:178` |
| The scale menu's groups "Common:5,Minor family:2,Modes:5,Exotic:1" | `js/app.js:1543-1551` (from `js/theory.js`) | `tests/nav.test.js:124` |

### 7.2 Suites that assert how the shell behaves or how big it is

| What is asserted | Suite and lines |
|---|---|
| The dropdown is closed at the start; opens on the clef; stays open after a pick; closes on a tap outside, the clef again, Escape, a page change | `tests/nav.test.js:89-114` |
| The dropdown on every page of soundLAB (15) and of Gear (4): the clef is visible, enabled, as big as its neighbour icon and at least 34 px, does not overlap the logo, the card is inside the screen, there is one copy of each control, every control in it is at least 44 px | `tests/context-global.test.js:19-41`, `:61-69`; `tests/gear.test.js:473-503` |
| Enter and Arrow-down open it and focus `#cx-root`; Escape gives the focus back to the clef; Shift+Tab closes; the focus leaving closes | `tests/context-global.test.js:70-93` |
| A sheet or a help tour disables the clef, a click cannot reach it, closing restores it | `tests/context-global.test.js:96-111` |
| Text contrast of the clef and the dropdown's fields at least 4.5:1 in dark and light | `tests/context-global.test.js:117-134` |
| At 360 px the clef keeps its size and the fields stay 44 px, without the header parts colliding | `tests/context-global.test.js:135-139` |
| Desktop 1280 px: top tab bar shown, bottom one not; phone 390 px: the reverse, five tabs, the bar's bottom edge = the screen's | `tests/nav.test.js:27-39`, `:130-138`; Gear `tests/gear.test.js:440-457` |
| Phone: the logo and the metronome icon are on one row (tops less than 24 px apart) and the metronome icon is less than 20 px from the right edge | `tests/nav.test.js:132-139` |
| Phone: the open dropdown has 12 px to each edge; Back closes it | `tests/nav.test.js:141-145` |
| Phone: the metronome card's bottom = the screen's bottom and its width = 390 | `tests/nav.test.js:149-151` |
| The metronome sheet: opens over the page, `aria-expanded`, focus on the X, Space starts the click and the icon gets class `on`, Escape / a tap outside / the X close it, its own help tour, `switchTo('metronome')` opens it, going elsewhere closes it | `tests/nav.test.js:57-87` |
| A tap on the open tab scrolls to the top | `tests/nav.test.js:53-55` |
| The header hides on scroll down and returns on scroll up (class `bar-hidden`) | `tests/quiz.test.js:360-366` |
| Gear "Go live" hides the header and the phone tab bar | `tests/synthtab.test.js:231-249` |
| The goal dot: `<html>` has `goal-due` and the phone bar has a button `[data-group="gtheory"]` | `tests/game.test.js:374` |
| Every button of an Exercises question is the element under its own centre, between the header (120 px assumed) and the bottom tab bar | `tests/taps.test.js:18-31` |
| Gear phone header: the link and the tools are inside the screen and clear of the logo, at 390 and 360 px | `tests/gear.test.js:124-131`, `:457-458` |
| No sideways scroll at 390 px | `tests/nav.test.js:152-153`, `tests/gear.test.js:447-456` |

### 7.3 Suites that assume Exercises is where the app starts

`HOME` is `PAGES[0]` = `quiz` (`js/app.js:93`, `:78`). 27 suites name `App.active === 'quiz'`, most of them as
the line that waits for the app to be up: audioin, btmidi, chordchart, colors, game, gear, keys,
learn-instruments, lights, lumi-practice, lumidisplay, multiin, nav, oneopen, portnames, practice,
quiz-correction, quiz, remote-gear, remote-keys, remote-plan, remote-quiz, remote-runners, remote,
storage-import, taps, trim. Twelve lines say in words that Exercises is where the app lands or falls back:
`tests/quiz.test.js:53`, `tests/nav.test.js:26`, `tests/practice.test.js:116`, `tests/storage-import.test.js:380`,
`tests/gear.test.js:777`, `:783`, `tests/trim.test.js:15`, `:50`, `:185`, `:412`, `:432`, `:641`. 52 suites
seed `qz.landed` before the app starts so that the one-time landing does not move the page.

## 8. "The key bar is always there", against today's dropdown

What the documents ask for:

- Principle 3: "Key · Tempo · Scale lock (with a plain-words hint such as "only A Dorian notes sound") · LUMI
  lights mode · Help level. Same bar on every page; never buried in a menu." (`docs/DESIGN-SYSTEM.md:17-19`)
- The component list names: "Switch (Scale lock) · Select chip (Key, LUMI lights) · Stepper (Tempo) ·
  Help-level dots · Key bar" (`docs/DESIGN-SYSTEM.md:42-43`).
- The roadmap adds one control: note colours "by scale degree (default…) or by note name… Switch in the key
  bar." (`docs/ROADMAP-2.0.md:28-30`)

What exists today:

| | Today | The mockup and the documents |
|---|---|---|
| Where | a dropdown behind the clef icon; closed on every page until tapped (`css/style.css:405`, `tests/nav.test.js:94-95`) | a row under the header, always shown |
| How one sees the key and tempo without opening it | only as the clef's tooltip and `aria-label` (`js/app.js:1602-1608`) | printed in the bar |
| Key | two or three fields: Key, Scale, and Mode for seven-note scales (`index.html:48-50`) | one chip "A Dorian" |
| Tempo | a number field (`index.html:51`) | a stepper − + |
| Time signature | a select (`index.html:52`) | not in the bar |
| Metronome start / stop | `#cx-met` (`index.html:53`) | not in the bar |
| Scale lock | a chip "Scale Lock"; its sentence appears below only while it is on, 23 words (`js/app.js:1670`) | a switch with the hint beside it, always |
| LUMI | a chip "LUMI Display", on or off (`js/app.js:1675-1676`) | a select "LUMI lights: Scale" (a mode, not on / off) |
| Help level | not here: in the Lights & help sheet (`js/lights.js:146`) and on the Piano page (`#pn-assist`, `js/piano.js:1356`, `:1872`) | in the bar, as dots |
| Colours by interval or by note name | here ("Intervals｜Note Names", `js/app.js:1648`) and again in the Lights & help sheet (`js/lights.js:44-47`) | "in the key bar" (roadmap); not drawn in the mockup |

Facts a permanent bar has to deal with:

1. **Room, wide.** Today's nine controls add up to 1,121 px without gaps and 1,217 px with the 12 px gaps;
   the header's inner width at 1200 px is 1,164 px (measured, `work-shell/widths.js`). They do not fit one
   row at 1200 px. The mockup's five pills take 1,042 px.
2. **Room, phone.** The same nine controls need 1,109 px; a 390 px screen offers 354 px. Today's open
   dropdown is 253 to 390 px high on a phone (section 6.1). The mockup shows nothing for a phone
   (section 6.4). On the four Learn pages the header (93 px) and the Learn bar (168 px) already take 279 px
   of a 780 px screen before the page starts.
3. **The header hides on scroll.** A bar inside `.topbar` would slide away with it (`css/style.css:186`), which
   is not "always there"; a bar that stays needs its own place or the hiding has to stop. One suite asserts
   the hiding (`tests/quiz.test.js:360-366`).
4. **The suites describe a dropdown.** `tests/nav.test.js:89-114` and `:141-145`,
   `tests/context-global.test.js` (all 145 lines, 15 pages × 2 widths) and `tests/gear.test.js:473-503` assert
   closed-at-start, open, close on outside / Escape / navigation, `aria-expanded`, `role="region"`, "inside
   the screen", the clef's size. `App.ctx()` is called by six suites (section 7). They must be rewritten in
   the pull request that makes the bar permanent; the ids `#cx-root`, `#cx-scale`, `#cx-bpm`, `#cx-led`,
   `#cx-lock`, `#cx-tnote` can stay and would keep 9 suites unchanged in those lines.
5. **Blocking.** Today a sheet or a tour disables the clef so nothing behind a modal can be changed
   (`js/app.js:1096-1106`). A permanent bar is behind the sheet's dimmed layer anyway (`z-index` 420 over 60),
   but the rule has to be kept for keyboard focus.
6. **Copies of the same control.** There would be three Help-level controls (bar, Lights & help sheet, Piano
   page) and three colour switches unless the old ones go. `CLAUDE.md` already says "never add a per-page
   copy" of the Help level (the cross-module conventions, entry "HELP LEVEL").
7. **Gear has the same shell.** Whether Gear keeps the dropdown / bar at all is listed as a Phase H decision
   (`docs/plans/phase-a/PLAN.md:1205`).
8. **A latent error next to the colour switch.** `App.colors.label(note)` calls `curRoot()`
   (`js/app.js:1346`), a function that exists only inside `wireContextBar` (`js/app.js:1560`). In the browser
   it throws "curRoot is not defined" as soon as the colour mode is "note" (run: `work-shell/bug.js`). Nothing
   calls `App.colors.label` today (search of `js/` and `tests/`: no hit), so nothing fails; a key bar that
   prints note names through it would.

## 9. "New home", against today's home

### 9.1 Today

- The home is the Exercises page: `HOME = PAGES[0]` (`js/app.js:93`). It is where a first start lands
  (`js/quiz.js:2948-2952`, store key `qz.landed`), where a stored page that no longer exists falls back
  (`js/app.js:1009`, `:1927`), where Back ends (`js/app.js:1390`), and where the Back list is emptied
  (`js/app.js:1062`). A later start opens the last page instead (`js/app.js:1915`).
- A first start also opens a five-card welcome tour after 0.7 s (`js/help.js:242-250`, `:284-290`); not in Gear.
- What the Exercises start view shows (`js/quiz.js:1292-1299`): the Learn bar above it; a line "<Instrument>
  exercises"; a strip with the day streak, today's engaged minutes against the goal as a ring, the
  "Consistency level" and a Start / Continue button (`js/quiz.js:1893-1907`); then the tabs Path / Topics /
  Progress.
- The wordmark is not a way home: it has no handler (section 2.1). The only "home" gesture is Back, or the
  Learn tab followed by the Exercises pill.

### 9.2 What a home page would have to read, and where that is today

| The home shows | Where the data is today | How to read it | State |
|---|---|---|---|
| The instrument | store `learn.instrument`; seven categories | `App.learnInstruments.current`, `.label()`, `.entries()`; event `learn:instrument` (`js/learn-instruments.js:84-90`, `:36`) | exists. The roadmap names four instruments (guitar, bass, keys, drums: `docs/ROADMAP-2.0.md:23`), the code seven (`js/learn-instruments.js:5`); "whether Synth stays a category" is a B0 item (`docs/plans/phase-a/PLAN.md:1199`) |
| Streak ("12-day streak") | store `practice.progress.v1` (`js/practice-progress.js:20`), per instrument | `App.practiceProgress.summary(instrument).currentStreak` / `.bestStreak` (`js/practice-progress.js:329-350`); or `SLXP.streak()` → `{n, best, today}` (`js/xp.js:85`) | exists |
| Daily goal ("Today 14 of 20 min") | same store; goal in its settings, default 10 minutes (`js/practice-progress.js:21`) | `summary(instrument).today.engagedSeconds`, `.today.goalMinutes`, `.today.qualifies` (`js/practice-progress.js:336-341`); `SLXP.goal()` (`js/xp.js:86`); change event `practice:progress` (`js/practice-progress.js:14`) | exists. The ring is drawn by `goalRing` in `js/quiz.js:1885-1891` |
| "Goal not met yet" dot | class `goal-due` on `<html>` | `js/xp.js:30` | exists |
| The plan's next block ("Next up · Keys lesson 7") | store `pp.students`, `pp.active`, `pp.sessions`, `pp.running` (`js/practiceplan.js:42-51`, `:130-143`, `:159`) | `App.practicePlan.state()` → `{student, instrument, plan, session, availableItems, preservedItems, gaps, week}` (`js/practiceplan.js:243`, `:354`); a block has `title`, `page`, `minutes`, and where the notes gave them `bpm`, `root`, `scale`, `help`, `lessonId` (`:67`, `:76-77`, `:120-125`) | exists for **today's** session |
| Start | — | `App.practicePlan.launch(blockId)` (`js/practiceplan.js:180`, `:354`) | exists |
| "This week 1 of 3 blocks done", "2 blocks left this week" | — | the plan is one session per day: sessions are keyed student / day / plan / instrument (`js/practiceplan.js:130`), the page's heading is "Today's … session" (`:282`); `week` is seven rows of recorded minutes, not blocks (`:243`, `:289`) | **does not exist**; the weekly plan is Phase D (`docs/ROADMAP-2.0.md:60`) |
| "from James" (the teacher) | — | a student has `id`, `name`, `docUrl`, `instrument`, `plan` (`js/practiceplan.js:44`); `name` is the student | **does not exist** |
| "pass 2 of 3" | — | not found in `js/practiceplan.js` or in what `App.keysLessons` exports; other files were not searched for it | **not found** |
| The last lesson, when there is no plan block | Keys lessons: store `kl.sel`, `kl.tier`, `kl.prog` (`js/keylessons.js:23`, `:119`) | `App.keysLessons.summary(instrument)`, newest first, each with `id`, `name`, `hand`, `level`, `last` (`js/keylessons.js:876-884`); open with `App.keysLessons.open(id, instrument)` (`:886`) | exists, keys only |
| The next Exercises level | store `qz.prog` | `SLQuiz.current()` = the index of the step you are on (`js/quiz.js:2967`, `currentNode` `:1861-1873`); the Continue button carries the level id (`:1904`); start with `SLQuiz.start(levelId)` (`:2959`) | exists |
| The last page | store `app.tab`, `app.gtab.<group>` | `App.store.get('app.tab')` (written at `js/app.js:1076`, `:1064`) | exists |
| The hero instrument with its lights | key and scale in `fb.root`, `fb.scale`, `fb.mode`; colours in `App.colors` | `App.colors.forPitch(note)` (`js/app.js:1342`), `Theory.scaleInfo` | exists as data. The Piano page's keyboard and the fretboard are drawn inside their own modules; whether they can be mounted on another page was not checked here |
| The key bar's values | `fb.root`, `fb.scale`, `fb.mode`, `met.bpm`, `scale.lock`, `lights.displayEnabled`, `help.level` (section 4) | events `fb:set`, `tempo`, `scale:lock`, `lights:display-enabled`, `help:level` | exists |
| "LUMI" connected (header) | the MIDI service | `App.midi` and event `midi:state`; `js/midi.js` was not read for this map beyond the display switch | exists, not mapped here |
| "FL Studio" connected (header) | — | — | **does not exist** (Phase F, `docs/ROADMAP-2.0.md:62`) |

So of the mockup's home, the streak, the daily minutes, the instrument, a next step (a plan block of today,
else the next Exercises level, else the last Keys lesson) and Start can be shown from what is stored today.
The weekly counts, the teacher's name, the pass count and the FL Studio light cannot.

### 9.3 What moving the home touches

- `HOME` is used at `js/app.js:1009`, `:1062`, `:1199-1200`, `:1390`, `:1915-1927`.
- The one-time landing in `js/quiz.js:2948-2952` would pull a first start to Exercises one tick after boot.
- Section 7.3: 27 suites wait for or assert `App.active === 'quiz'` on a profile without a stored page. A new
  first page breaks every one of them at its first line unless each seeds `app.tab` (a stored page wins over
  `HOME`, `js/app.js:1915-1928`).
- `tests/context-global.test.js:7` and `:59-60` compare the list of panels in `<main>` with a fixed list of 15;
  `tests/smoke.test.js`, `tests/trim.test.js` and `tests/storage-import.test.js` walk the same list
  (section 7, rows `.panel`).
- A new page is three things in one commit (its id in `APPS`, its panel, its script tag: `CLAUDE.md:1291-1296`)
  plus its file in `sw.js` `ASSETS` (the list starts at `sw.js:9`) and a new `CACHE` number (`sw.js:8`, now `v9`).

## 10. The rule of `tests/assets.test.js`, and how a shell change must be made

`tests/assets.test.js` is pure Node and runs in every full run (`tests/run.sh:17`). Its fifth part compares
the two HTML files as text (`:129-190`). Four blocks are cut out at fixed marks and must be equal after the
app's name is evened out:

| Block | Cut | May differ in |
|---|---|---|
| head | `<head>` … `</head>` (`:159`) | the `<title>` text, and the one line that links `css/lumi-practice.css` (`:43`, `:161-164`) |
| shell | `<body>` up to the first `<main>` (`:170`) | the text inside `<span class="tag">` (`:156`, `:172-174`); Gear's must read "gear" (`:175`) |
| footer | `</main>` up to the first `<script` (`:182`) | "soundLAB Gear" for "soundLAB" (`:184-185`) |
| boot | the last `<script>` to the end of the file (`:188-190`) | nothing |

It also requires that thirteen ids are inside Gear's shell block: tabbar, app-switch, settings-btn, ctx-btn,
lights-btn, met-btn, ctxbar, subnav, tabbar-m, sheet-metronome, panel-metronome, sheet-lights, panel-lights
(`:176-179`). And outside that part: every script and stylesheet of both pages exists and is in `sw.js`
`ASSETS` (`:87-90`); no `ASSETS` entry is missing on disk or listed twice (`:75-78`); the scripts both pages
load come in the same order (`:112-115`); both start with theory, note-palette, app (`:116-117`); Gear loads
exactly 18 scripts (`:109`) and nothing but shared scripts and its seven modules (`:118-119`); soundLAB loads
none of the seven and names none of them (`:100-104`); Gear's `<main>` holds exactly deck, liveset, midihub,
helix (`:121-125`).

**As long as the shell is static markup, a shell change is made like this:**

1. Make the same edit in `index.html` and `gear.html`, in the same commit (`CLAUDE.md:1527-1531`). A changed
   line between `<body>` and `<main>` that is in one file only fails the suite and prints the first line that
   differs (`tests/assets.test.js:147-151`).
2. Keep the thirteen ids, or change the list at `tests/assets.test.js:177` in the same commit.
3. A new stylesheet goes into both `<head>`s on the same line (or onto the `MAIN_ONLY_CSS` list,
   `tests/assets.test.js:43`) and into `sw.js` `ASSETS` (`sw.js:13-15` are today's three).
4. A new script that both apps need goes into both pages at the same place in the order, into `ASSETS`, and
   the number 18 at `tests/assets.test.js:109` changes.
5. Raise the number in `CACHE` (`sw.js:8`): the worker is cache-first and looks only in its own cache
   (`sw.js:128`).
6. `tools/artifact_build.py` strips the head and body tags and hangs on two anchors in `index.html`: the tag
   `<script src="js/theory.js"></script>` (`tools/artifact_build.py:37`) and the comment "// Offline support"
   of the inline script (`:35`). Keep both or change the tool.

**When the shell is built from JavaScript** (decided for Phase B: `docs/plans/phase-a/PLAN.md:121`, `:1198`;
the suite's own comment, `tests/assets.test.js:17-18`), these orderings hold today and must keep holding:

- `#panel-metronome` and `#panel-lights` live inside the sheets (`index.html:70`, `:80`). `boot()` looks them up
  and initialises their modules in its first loop (`js/app.js:1810-1824`); a panel that is not there yet is
  skipped silently (`:1813`), and the sheet would stay empty. The sheets must exist before that loop.
- `#help-btn` must exist when `js/help.js` runs its `init` one tick after the scripts (`js/help.js:294`,
  `:266`).
- `<main>` must exist when `js/learn-instruments.js` mounts (`:41`, `:91`).
- `wireContextBar` returns at once when `#cx-root` is missing (`js/app.js:1532`), and nothing would say so.
- The comparison in `tests/assets.test.js` needs a non-empty block (`:153`) and the thirteen ids in the static
  HTML (`:177-179`): with the markup gone from the files, that part of the suite must be rewritten in the
  same pull request.
- The 54 browser suites open `index.html` or `gear.html` from the test server and query the live document, so
  where the markup comes from does not matter to them, as long as the ids, classes and words of section 7 are there
  by the time `App.active` is set (most suites wait for exactly that).

## 11. Things found on the way that Phase B will meet

1. **No rule uses a token yet**, and the tokens differ from today's variables: stage `#0f0d10` against
   `#131114` (`css/tokens.css:15`, `css/style.css:44`); light accent `#c96f0a` against `#d97e0f`
   (`css/tokens.css:122`, `css/style.css:94`); control height 44 / 48 px against 34 / 38 px
   (`css/tokens.css:92`, `:141`; `css/style.css:64`, `:109`); card radius 12 px against 16 px
   (`css/tokens.css:87`, `css/style.css:70`).
2. **Tap sizes.** The design system says "every control is tappable at 44 px" (`docs/DESIGN-SYSTEM.md:37`).
   Measured today: corner icons 34 to 38 px, pills 32 px high, top tabs 38 px high, bottom tabs 55 px. At
   360 px the header row is 336 px wide inside its padding (`css/style.css:956`); the logo and its gap take
   89 px and leave 247 px. Five icons of 44 px, the 53 px link and five 2 px gaps need 283 px; with 48 px
   icons 303 px. With targets of the token size the present set of six does not fit beside the logo on a
   360 px phone. The mockup's header has two status lights and one icon.
3. **The accent picker.** Settings offers four accents and writes `--accent` inline (`js/app.js:819-847`). The
   design system says the amber is "the ONLY accent" (`docs/DESIGN-SYSTEM.md:31`), and `--sl-accent` is not
   touched by the picker. New components on tokens would ignore the user's choice.
4. **Literal colours outside the variables**: the `theme-color` meta (`index.html:6`, `js/app.js:854`), the
   manifest (`manifest.webmanifest`, `background_color` and `theme_color` `#131114`), the header and phone bar
   backgrounds (`css/style.css:173`, `:112`, `:921`, `:926`), the text on a primary button `#221302` (`:602`),
   the sheet's backdrop (`:310`).
5. **Stacking order.** Today: header 50, dropdown 60, phone tab bar 60, update banner 300, toasts 400, sheets
   420, pedal confirmation 450, help tour 500 (`css/style.css:179`, `:388`, `:918`, `:893`, `:873`, `:305`;
   `js/remote.js:389`; `js/help.js:254`). So a toast is drawn under an open sheet. The tokens put toasts above
   sheets: bar 20, sheet 40, toast 60 (`css/tokens.css:104-106`).
6. **Sheets.** The design system wants "Sheet (bottom on phones, side on wide)" (`docs/DESIGN-SYSTEM.md:45`).
   Today a sheet is a centred card above 640 px (`css/style.css:302-323`). Pages have five more layers of
   their own kind (section 2.9).
7. **Toasts on phones are half as wide as the screen** (section 6.3).
8. **Two apps, one stylesheet.** Any change to a shell rule in `css/style.css` changes Gear too. The Phase A
   plan says Gear keeps "today's look (Phase H redesigns)" (`docs/plans/phase-a/PLAN.md:29`), and the roadmap
   puts Gear's design in Phase H "same design system" after B (`docs/ROADMAP-2.0.md:65`).
9. **Leftovers that can go with the shell rebuild**: the id `tabs` and the `.tab` handlers
   (`js/app.js:1067-1069`, `:1844-1850`, `css/style.css:450-453`); `noctx` (`js/app.js:1084`); the four unused
   icons; the names `SPACE_LABELS` (`docs/plans/phase-a/PLAN.md:1198` defers both renaming it and pruning
   `ICONS` to Phase B).
10. **The help button's icon is not from the icon set** (`js/help.js:268-270`), and the tour's close button
    covers the metronome icon (section 6.3).
11. **`aria-current="page"` is set on the active tab** (`js/app.js:941`) but not on the active pill
    (`js/app.js:968-969`).

## 12. Files this job wrote

All under `scratchpad/v2/phaseB/`.

- `map-shell.md`: this report.
- `shots/shell/`: 163 files.
  `<app>-<theme>-<width>-<n>-<name>.png` for app `index` / `gear`, theme `dark` / `light`, width 360 / 390 /
  820 / 901 / 1200; soundLAB: `1-home`, `2-ctx`, `3-met`, `4-lights`, `5-settings`, `6-piano`, `7-toast`;
  Gear: `1-home`, `2-ctx`, `3-met`, `4-lights`, `6-helix`, `7-hub` (130 pictures).
  `extra-390-*.png` and `extra-1200-*.png`: `ctx-full`, `bar-hidden`, `remote-hud`, `snd-hint`, `app-update`,
  `back-hint`, `help-tour`, `light-lights`, `light-met`, `light-settings` (20).
  `index-dark-1024x640-*.png`, `gear-dark-1024x640-*.png` (4). `mockup-{e,f}-{1200,1280,390,390-full}.png` (8).
  `measure.json`: every box quoted in section 6.
- `work-shell/`: the scripts (`shots.js`, `extra.js`, `snd2.js`, `fl.js`, `mock.js`, `widths.js`, `bug.js`,
  `refs2.js`, `table.js`), the search results with all line numbers (`refs2.txt`, `refs2.json`,
  `refs-table.md`), and `old-nov12/` (the earlier report and scripts).
- `shots/shell-old-nov12/`: the pictures of the earlier run, taken before the last Phase A merges.

The server on port 5412 was stopped.

## 13. Open questions, each with a recommended answer

1. **Is the new home a new page, or a new first view of Exercises?**
   Recommended: a new page with its own id, panel and file, and `HOME` named explicitly in `APPS` instead of
   "the first page". Do it in its own pull request after the shell is rebuilt. In that pull request the 27
   suites of section 7.3 seed `app.tab = "quiz"`, the one-time landing in `js/quiz.js:2948-2952` goes, and the
   wordmark becomes the way home. Exercises stays the first pill of Learn.

2. **What does the home show before Phase D exists?** The weekly counts, the teacher's name and "pass 2 of 3"
   have no data (section 9.2).
   Recommended: Phase B shows only what is stored: the next step (today's first open plan block, else the next
   Exercises level, else the last Keys lesson), Start, "Something else", and a footer line with today's
   minutes against the goal, the streak and "Today N of M blocks done". Phase D replaces the day by the week
   and adds the teacher. No invented numbers.

3. **Which controls are in the permanent key bar?** Today's bar has nine, the mockup five, and they overlap
   only in part (section 8).
   Recommended: the mockup's five. Key = one chip that opens a sheet with key, scale and mode. Tempo = the
   stepper; a tap on the number opens the metronome sheet, which already has Time and Start. Scale lock = the
   switch with the short hint. LUMI lights = a chip whose sheet holds the lights mode and the colour switch
   (which satisfies "switch in the key bar", `docs/ROADMAP-2.0.md:28-30`). Help = the dots. The Help buttons
   and the colour switch leave the Lights & help sheet; `#pn-assist` on the Piano page goes with the Piano
   re-skin. Keep the ids `cx-root`, `cx-scale`, `cx-bpm`, `cx-led`, `cx-lock`, `cx-tnote` on the new controls
   where a control still exists.

4. **What is the key bar on a phone?** There is no mockup below 1280 px and five 44 px pills need 1,042 px.
   Recommended: the owner sees a 390 px and an 820 px mockup before this step is built. Proposal to draw: one
   48 px row of five compact chips (value only: "A Dor", "100", a lock, a bulb, the dots), each opening a
   bottom sheet; no sideways scrolling (`docs/DESIGN-SYSTEM.md:51`).

5. **Does the header still hide on scroll?** "Always there" and the slide-away header contradict each other
   for a bar inside the header (section 8, fact 3).
   Recommended: the key bar is its own sticky row and never hides; the header row above it (logo, tabs) may
   keep hiding on phones only. `tests/quiz.test.js:360-366` changes with it.

6. **Where do the question mark, Lights & help, the metronome and the link to Gear go?** The mockup's header
   has none of them.
   Recommended: Help level moves into the key bar; the "LUMI" status light opens the Lights & help sheet; the
   Tempo chip opens the metronome; the question mark stays as the second icon beside the gear; the link to
   Gear stays a text link in the header from 901 px up and moves into Settings on phones. This also solves
   the 360 px row (section 11, item 2).

7. **Is Gear's shell re-skinned in Phase B or in Phase H?** One stylesheet and one shell serve both.
   Recommended: the shell (header, tab bars, sheets, toasts) changes for both apps in Phase B, because it is
   one code path and two copies would have to be kept apart by `data-app`. Gear's four pages keep today's
   look until Phase H, so the old variables of `css/style.css:42-108` stay defined through Phase B. Whether
   Gear shows the key bar at all: yes in B (unchanged behaviour), decide in H.

8. **In which step is the shell built from JavaScript, and what stays in the HTML?**
   Recommended: first step of Phase B, with no visual change: one function (in `js/app.js` or a new
   `js/shell.js` loaded right after it in both pages) writes today's exact markup before any other script
   runs; the two HTML files keep `<main>`, the panels, the scripts and one mount line. The same pull request
   rewrites part 5 of `tests/assets.test.js` and proves "no visual change" by comparing the 20 measured
   layouts of `shots/shell/measure.json`. Every later shell step then edits one place.

9. **Does the accent picker of Settings survive?** The design system allows one accent (section 11, item 3).
   Recommended: ask the owner. Default if no answer: keep the picker and let it set `--sl-accent` and its four
   companions per theme, so nothing a user chose is lost; the four accents each need a contrast check in both
   themes first.

10. **Does Settings stay a page?** The design system lists a Sheet component, and Settings behaves like an
    overlay.
    Recommended: stay a page in Phase B, re-skinned. Nine suites call `App.switchTo('settings')` 30 times and
    three name `#panel-settings` (section 7); turning it into a sheet changes Back, focus and the pedal rules
    for no user gain in this phase.

11. **Where is the instrument chosen in the new shell?** The Learn bar is not in the mockup and is 116 to
    184 px high.
    Recommended: an instrument chip on the home page and at the left end of the key bar on the Learn pages,
    opening a sheet with the entry points; decide the list of instruments in B0 first. Keep the id
    `learn-instrument` on the control: `tests/learn-instruments.test.js` names it on 13 lines.

12. **Which breakpoint do sheets and the key bar follow?** Today the tab bar turns at 900 px and the sheets at
    640 px (section 5.3); the design system names only "bottom tab bar ≤ 900 px"
    (`docs/DESIGN-SYSTEM.md:51`).
    Recommended: one breakpoint, 900 px, for the tab bar, the bottom sheets and the compact key bar, so a
    portrait tablet gets the phone shell throughout. `tests/nav.test.js:149-151` (sheet at 390 px) still holds.
