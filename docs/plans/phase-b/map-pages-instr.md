# Map: the instrument pages as they are (input for Phase B and B0)

Written 2026-11-14 against the worktree
`scratchpad/wt/a4`
at commit `a914df2` ("2.0 Phase A4: review fixes", branch `claude/verify-project-files-4bchk6-v2-a4`), clean
working tree when read. **Every `file:line` below is a line of that tree, as a path from its root.** Nothing in
the worktree or in any other checkout was changed.

The working files and screenshots this document names (work-…/, shots/…) were scratch files of the planning
session. They are not in the repository: pictures are never committed, because both deploys publish the whole
tree.

The eight pages of this map: **Guitar** group = Neck (`fretboard`), Tab (`tab`), Notation (`notation`);
**Keys** group = Piano (`piano`, with the scale lessons and the LUMI section), Charts (`chart`), Pads (`pads`);
**Play** group = Songs (`songs`, with the Player card), Jam (`jam`). The groups are `js/app.js:81-83`, the pill
names `js/app.js:114-120`.

Words: "key bar" = the key / scale / tempo dropdown under the clef button (`index.html:47-59`). "Hero" = the
drawn instrument (neck, keyboard, pads). "Old variables" = the colour and size variables of `css/style.css:42-75`
(`--bg`, `--card`, `--accent`, `--h-ctl` ...), as opposed to the `--sl-*` tokens of `css/tokens.css`.

---

## 0. How this map was made, and what was not checked

- **Read in full:** `docs/ROADMAP-2.0.md`, `docs/DESIGN-SYSTEM.md`, `css/tokens.css`, `docs/design/home-mockup.html`,
  `css/style.css`, `css/lumi-practice.css`, `index.html`, `js/note-palette.js`, `js/pads.js`, the "soundLAB 2.0
  Phase A" section of `CLAUDE.md` (lines 1260-1900), and of `docs/plans/phase-a/PLAN.md` the sections 0-3
  (lines 1-183).
- **Read in part** (the lines that build markup, CSS and the drawing, the runner / remote / LUMI calls, found by
  search): `js/fretboard.js` (about 1,800 of 2,290 lines), `js/piano.js` (about 650 of 1,968), `js/keylessons.js`
  (about 350 of 895), `js/lumi-practice.js` (lines 345-480), `js/chordchart.js` (120-250, 330-549), `js/songs.js`
  (326-341, 380-760), `js/scoreplayer.js` (560-655), `js/jam.js` (863-1135), `js/app.js` (56-135, 802-808,
  1258-1363, 1560-1689), `js/midi.js` (520-560, 996-1080, 1128-1200, 1240-1250), `docs/NOTE-PALETTE.md` (1-40).
  **Not read:** the sound and scheduler code of these modules, the MIDI / MusicXML readers, the Jam genre data.
- **Looked at:** the eight pages in headless Chromium 1243, served from the worktree on port 5414, device scale
  factor 1, at 1200 x 900 (mouse) dark and light, 390 x 844 (touch phone) dark and light, and 1024 x 640 dark
  (the size `docs/DESIGN-SYSTEM.md:53` names for the later FL plugin window). Key A Dorian was stored before the
  start, to match the mockup. 158 page pictures and 4 mockup pictures are in `shots/pages-instr/`; I opened and
  looked at 43 of them (40 page pictures and 3 mockups; list in section 12). The numbers come from `shots/pages-instr/measure-<combo>.json` and
  from `work-pages-instr/probe.json`, `lumi.json`, `colors.json`, `refs.txt`, written by the scripts in
  `work-pages-instr/`. The server was stopped when done.
- **A trap worth knowing for every screenshot job:** in a Playwright touch context, one `fullPage: true`
  screenshot switches the `(hover: none)` and `(pointer: coarse)` media queries off for the rest of the session
  (measured: `work-pages-instr/mq.js`: `--h-ctl` goes from 38px to 34px and the Piano's Typing chip comes back).
  My first phone run was spoiled by this and was thrown away. The phone pictures in `shots/pages-instr/390-*/`
  are from a second run without full-page captures; the long phone pictures (`*-tall.png`) use a tall touch
  viewport instead (`work-pages-instr/tall.js`).
- **The table "which suite names which id"** (sections 4-11) is a text search (`work-pages-instr/refs.js`): a
  name counts when it stands as a whole word in a file of `tests/` or in another file of `js/`. **No suite was
  run, and none was run with an id renamed.** A suite that reaches an element another way (an `App.*` call, a
  tag name, a text) is not in the table.
- **Not checked:** a real phone, a real tablet, Safari, Firefox, the Android WebView, a real LUMI (the LUMI
  facts are bytes recorded from a fake Web MIDI port, as `tests/lights.test.js:12-31` does it), print output of
  the Charts page, a screen reader, measured contrast, the pages with sound running for longer than 3 seconds,
  drag gestures (pinch zoom on the neck, chord drag in Jam).

---

## 1. The short version

1. **`css/style.css` holds no page CSS.** It has the shell and nine shared building blocks (card, row, button,
   field label, select / input, segmented control, chip, list, legend dot: `css/style.css:479-836`). Every page
   in this map builds its markup as one `innerHTML` string in its `init()` and injects its own stylesheet from
   JavaScript with `App.injectCSS` (`js/app.js:802-808`). All of it is written with the old variables and raw
   colours. **No file outside `css/tokens.css` reads a `--sl-*` token** (search over `js/`, `css/`, both HTML
   files: no hit).
2. **The instrument is not the hero today.** At 1200 x 900 the neck fills 24 % of the free height, the Piano
   keyboard 24 %, the pads 39 %; on the phone the Piano keyboard starts at y = 580 of 844 and the first Charts
   keyboard at y = 944 (below the first screen). Songs and Jam draw no instrument at all.
3. **"One thing on screen" exists in two places already**, and both are the model to copy: the Piano's lesson
   run (`html.kl-running` hides every page control and leaves the keyboard and the run panel: 1 control on
   screen, `js/keylessons.js:788-790`) and the Neck's fullscreen (`.fb-max`: board, exit, play:
   `js/fretboard.js:1675-1687`).
4. **Controls on screen at once** (desktop / phone, without the instrument's own keys): Neck 18 / 18, Tab
   10 / 10, Notation 8 / 8, Piano 49 / 45 (plus 9 lesson rows), Charts 37 / 37, Pads 5 / 5, Songs 14 to 34,
   Jam 42 / 42. Nearly all are 34 px high (38 px on touch); the design system wants 44 (48 on touch).
5. **The note-colour rule is mostly built**, but not as the mockup shows it: one service (`App.colors`), default
   "by interval", the same RGB on screen and on the LUMI (measured: 14 of 14 lit keys identical), and the switch
   is already in the key bar. Three things differ from the roadmap and the mockup: the palette is not the
   `--sl-deg-*` tokens, "interval" is not "scale degree" for flat degrees, and "play this now" is an amber ring
   on screen but the key's own colour on the LUMI. Section 3.
6. **Seven keyboards and three necks are drawn by seven different pieces of code** (section 2.6). "Instrument
   heroes sharing one lighting model" (`docs/DESIGN-SYSTEM.md:46-47`) means replacing or wrapping them.
7. **Suites pin names, not looks.** They name 175 ids, classes and data attributes of these pages (25 + 29 + 33
   + 20 + 19 + 7 + 18 + 20 + 4) and a handful of inline style values; they do not pin colours, sizes or
   positions of page controls. A re-skin that keeps the names is safe; moving controls into sheets is safe only
   if the element stays in the document with its id.

---

## 2. What is true for all eight pages

### 2.1 How a page is built

- The static HTML holds one empty `<section class="panel" id="panel-…">` per page (`index.html:86-88`, `:90-93`,
  `:98`) and one script tag per module (`index.html:116`, `:118-122`, `:133-135`).
- At start `boot()` calls every module's `init(panelElement)` once, for all pages, visible or not
  (`js/app.js:1810-1819`). So every page's stylesheet is in the document from the start, and a rule of one page
  can style another page.
- Each `init()` does two things: `App.injectCSS('<name>', '<one long string>')` and `rootEl.innerHTML = '<one
  long string>'`. There is no template, no component function shared between pages.
- `main` is capped at 1,150 px wide (`css/style.css:455-459`); a card has 20 / 22 px padding
  (`css/style.css:481-488`), 16 px on phones (`css/style.css:991`). That is why every hero is at most 1,068 px
  wide at 1200 and 332 px at 390.

### 2.2 The injected CSS, by size

Measured in the running page (`shots/pages-instr/measure-1200-dark.json`, key `css`) and by a scan of the
source (`work-pages-instr/colors.json`).

| Sheet | Where | Bytes | Rules | Raw hex / rgb() colours in the whole file | `var()` of old variables in the whole file | `--sl-*` | Media queries |
|---|---|---|---|---|---|---|---|
| `css-fretboard` | `js/fretboard.js:1672-1786` | 7,045 | 86 | 7 / 8 | 68 | 0 | `max-width:640px` |
| `css-piano` | `js/piano.js:1273-1349` | 3,340 | 51 | 24 / 4 | 19 | 0 | `min-width:1100px`; `hover:none and pointer:coarse and max-width:640px` |
| `css-keylessons` | `js/keylessons.js:780-831` | 5,995 | 79 | 4 / 0 | 48 | 0 | `min-width:900px`; `max-width:640px` |
| `css/lumi-practice.css` (a file) | `css/lumi-practice.css:1-46` | 4,035 | 47 | 14 / 0 | 21 | 0 | `max-width:1100px`; `max-width:700px` |
| `css-chordchart` | `js/chordchart.js:496-530` | 2,709 | 29 | 13 / 1 | 29 | 0 | `print` |
| `css-pads` | `js/pads.js:140-166` | 1,459 | 11 | 3 / 4 | 13 | 0 | `max-width:640px` |
| `css-songs` | `js/songs.js:512-540` | 1,590 | 20 | 1 / 0 | 14 | 0 | `hover:hover` |
| `css-scoreplayer` | `js/scoreplayer.js:610-619` | 769 | 17 | 0 / 0 | 3 | 0 | none |
| `css-jam` | `js/jam.js:993-1034` | 2,282 | 30 | 0 / 2 | 24 | 0 | `max-width:640px` |

Together 29.2 KB, against 32.3 KB for `css/style.css`. On top of the sheets the markup strings carry inline
`style="…"` attributes (fretboard 23, piano 14, jam 14, songs 13, pads 7) and the drawing code writes SVG
`fill` / `stroke` attributes directly (fretboard 29).

Breakpoints used by these pages: 640, 700, 900, 1100 px. The shell's own breakpoint for the bottom tab bar is
900 px (`css/style.css:910`).

Light theme: the pages rely on the variable swap of `css/style.css:81-108`. Only four page rules are written
for light: the jam ring colour (`js/fretboard.js:1735`), the nut colour (`:1768`), the lesson's "good" call
(`js/keylessons.js:811`) and the pad surface (`js/pads.js:157-158`).

### 2.3 Old variables these pages read

`--accent` (the most used: 18 times in the Neck alone), `--accent-soft`, `--accent-line`, `--accent-ink`,
`--accent-glow`, `--text`, `--muted`, `--label`, `--line`, `--ctl-border`, `--card`, `--card2`, `--panel`,
`--teal`, `--red`, `--warn`, `--font-body`, `--font-display`, `--font-condensed`, `--h-ctl`. Three variables are
private to a page: `--fb-nut` (declared in the Neck's sheet, `js/fretboard.js:1768`), `--dc` (a tab cell's note
colour, `js/fretboard.js:1018`, `:1772`) and `--pd` (a pad's lane colour, `js/pads.js:122`, `:150`).

### 2.4 Classes that cross page borders

A page's sheet being loaded for every page (2.1) is relied on:

| Class | Declared by | Also used by |
|---|---|---|
| `.fb-chip` (`cursor:pointer;font-family:inherit`) | the Neck, `js/fretboard.js:1761` | Piano (`js/piano.js:1368`, `:1386`, `:1388`, `:1397`, `:1453`), lessons (`js/keylessons.js:568`, `:575-576`), Pads (`js/pads.js:171`), Jam (`js/jam.js:981`, `:1091`, `:1099`, `:1105`), Woodshed (4 places) |
| `.fb-stroke` (the big amber readout) | the Neck, `js/fretboard.js:1688-1690` | Piano's finger readout `#pn-finger` (`js/piano.js:1434`) |
| `.fb-field` | the Neck, `js/fretboard.js:1673` | Settings (`js/settings.js`, 4 places) |
| `.mh-cv-head`, `.mh-mono`, `.mh-chk`, `.mh-warn`, `.mh-pl*` | the Player, `js/scoreplayer.js:610-619` | the Songs page shows the card; in Gear the Hub declares the same four again (`js/scoreplayer.js:604-609`) |
| `.hint` | **no rule in any file of `js/` or `css/`** | Charts uses it twice (`js/chordchart.js:352`, `:393`); the text falls back to the full ink colour at 15 px (measured, `probe.json` `ccHelp`) |
| `.scale-locked .pn-key:not([data-dc])` | the shell, `css/style.css:423` | dims the Piano's keys under Scale Lock; `tests/lights.test.js:105` reads that filter |
| the focus mode `html.kl-running …` | the lessons, `js/keylessons.js:788-789` | hides parts of the **Piano's** markup by its structure: `#panel-piano .row.spread>span.row`, `#pn-perf`, `#pn-qwpanel`, `.pn-practice`, `#pn-legend`, `.pn-foot`, `#pn-lumi` |

The Neck's sheet also declares the music font face `SLMusic` (`js/fretboard.js:1771`), which Exercises declares
too.

Consequence for the plan: the Neck's sheet cannot be replaced in a step of its own without touching Piano,
lessons, Pads, Jam, Woodshed and Settings; and the lessons' focus mode breaks if the Piano's first row is
restructured without changing `js/keylessons.js:788`.

### 2.5 The key bar's values are repeated on the pages

`CLAUDE.md` says pages must not grow their own copies of key, scale, tempo. Tempo and Help level are repeated
today, each as a real control wired to the shared store:

| Repeated control | Where |
|---|---|
| Tempo input | Neck `#fb-pr-bpm` (`js/fretboard.js:1847`), Piano `#pn-bpm` (`js/piano.js:1435`), Songs `#sg-bpm` (`js/songs.js:586-587`), Jam `#jam-bpm` (`js/jam.js:1049-1050`) |
| Help level | Piano `#pn-assist`, five buttons (`js/piano.js:1356-1358`); the lesson card links to the Lights sheet instead (`js/keylessons.js:569`, `:775`) |
| Colour mode | Neck settings `#fb-colmode` (`js/fretboard.js:1885-1889`), besides the key bar and the Lights sheet (section 3) |
| Labels inside the dots (Notes / Intervals / Degrees) | Neck `#fb-display`, store `fb.display` (`js/fretboard.js:1875-1880`, `:66`); Piano `#pn-display`, store `pn.display` (`js/piano.js:1363-1367`, `:1473`): two keys for one choice |

With the key bar of the design system (Key, Tempo, Scale lock, LUMI lights, Help level:
`docs/DESIGN-SYSTEM.md:17-19`) always on screen, these are the first controls that can leave the pages.
Suites name `#pn-assist` (`keys`, `lights`) and `#fb-pr-bpm` (`remote-runners`); `js/help.js:59` points the
Piano tour at `#pn-assist`.

### 2.6 How many instruments are drawn, by how many pieces of code

| Instrument | Drawn by | How |
|---|---|---|
| Keyboard, Piano page | `js/piano.js:624-761` | SVG, C2-C6, 49 `rect.pn-key` |
| Keyboard, Charts | `js/chordchart.js:154-179` | SVG, 2 or 3 octaves per card |
| Keyboard, LUMI section (two of them) | `js/lumi-practice.js:349-360` | DOM, 24 `span` / `button` blocks each |
| Keyboard, Woodshed | `js/performance-player.js:272-275` | DOM buttons (not in this map) |
| Keyboard, Exercises | `js/quiz.js:829` | SVG (not in this map) |
| Keyboard, Chords page | `js/chords.js:593-633` | SVG (not in this map) |
| Neck, Neck page | `js/fretboard.js:257-444` | SVG, 150 hit rects |
| Neck, Chords page | `js/chords.js:460-536` | SVG (not in this map) |
| Neck, Exercises | `js/quiz.js:843` | SVG (not in this map) |
| Pads | `js/pads.js:117-128` | DOM, 8 buttons |

Ivory and ebony are written four times with two different values: `#f7f3ea` / `#221d20` in Piano
(`js/piano.js:1295-1296`), Charts (`js/chordchart.js:515-516`) and Exercises (`js/quiz.js:2751`); `#f3efe8` /
`#302a2d` in the LUMI section (`css/lumi-practice.css:20`, `:23`). The tokens have a third pair,
`--sl-key-white: #ece5db` / `--sl-key-black: #1b171c`, re-inked to `#ffffff` / `#2a2429` in light
(`css/tokens.css:52-53`, `:131-132`). The Piano's comment says the opposite of the token swap: "ivory + ebony
in both themes — this is the instrument, not chrome" (`js/piano.js:1294`).

### 2.7 What the pedal (the controller remote) and the LUMI reach

| Page | `onRemote` | `remoteKey` | What it sends to the keybed |
|---|---|---|---|
| Neck, Tab, Notation | `prRemote` (`js/fretboard.js:1316-1331`, registered `:2205`, `:2279`, `:2287`) | `prRemoteKey` (`:1344-1351`) | `App.midi.guide(now, next)` from the runner (`js/fretboard.js:818-828`) |
| Piano | lessons first, then the runner; the LUMI section alone while it is open (`js/piano.js:1125-1131`) | only for the open LUMI section (`:1960`) | `App.midi.guide` from runner, Guide mode and lessons (`js/piano.js:817-826`, `:1936-1937`) |
| Charts | none (`js/chordchart.js:532-541`) | none | `App.midi.guide(now, next)` for the picked keyboard (`js/chordchart.js:227-236`) |
| Pads | none (`js/pads.js:291-303`) | none | owns the keybed: `claim('pads')`, then `App.midi.light / dark` directly (`js/pads.js:88-92`, `:105-113`, `:294-295`) |
| Songs | `plRemote` (`js/songs.js:382-401`, registered `:906`) | `plRemoteKey` (`:406-413`) | `App.midi.guide` for the sounding step and the next (`js/songs.js:332-340`) |
| Jam | none | none | nothing |

Transport owners among these pages: the lessons (`'keys'`, `js/keylessons.js:287`), Charts' Play all (`'chart'`,
`js/chordchart.js:249`), Jam (`'jam'`, `js/jam.js:761`). The Neck's runner, the Piano's runner and the Songs
player do not claim the transport (no `transport:claim` in `js/fretboard.js`, `js/piano.js`, `js/songs.js`).

---

## 3. The note-colour rule: where it stands in code

The roadmap: "by scale degree (default; the 1 is always the 1 color in every key) or by note name; the same on
screen and on the LUMI. Switch in the key bar." (`docs/ROADMAP-2.0.md:28-30`), and Phase C lists "degree colors
default" (`:59`).

**What exists.**

1. **One service.** `App.colors` (`js/app.js:1280-1363`), with the mapping in `js/note-palette.js:1-70`. It
   gives a colour per pitch (`forPitch`, `forNote`: `js/app.js:1341-1342`), the matching LUMI colour index
   (`lumiVelocity`, `:1343`) and a label (`:1344-1347`).
2. **Two modes, the default is already "interval".** The store key is `fb.colorMode`; anything but `'note'`
   reads as `'interval'` (`js/app.js:1323`). So "degree colours default" is true in code today; what is open is
   listed under "What differs".
3. **The switch is already in the key bar.** `boot` adds a two-button control "Intervals | Note Names" to the
   dropdown under the clef (`js/app.js:1645-1660`). The same switch exists twice more: "Interval | Note" in the
   Neck's settings, with the colour pickers (`js/fretboard.js:1885-1891`, `:223-247`, `:1958-1977`), and "Color
   notes by" in the Lights & help sheet (`js/lights.js:41-47`, `:150`). Three places, three wordings.
4. **The same on screen and on the LUMI, by construction.** Every colour is first snapped to the nearest of the
   127 colours of the LUMI's default program (`js/note-palette.js:27-41`); the screen shows that table colour
   and the LUMI gets its index as the note-on velocity (`js/midi.js:1042-1048`, `:1158-1160`). **Measured** with
   a fake LUMI on the Piano page in A Dorian: 14 of 14 lit keys have the same RGB as their dot on screen, in
   both modes (`work-pages-instr/lumi.json`). Not seen on hardware.
5. **Who follows the service.** Neck dots, tab cells and noteheads (`js/fretboard.js:43`, `:388`, `:1009-1018`,
   `:1183`); Piano dots, whole keys, legend and the pressed key (`js/piano.js:659-668`, `:704-713`, `:756`,
   `:796-801`); Charts dots (`js/chordchart.js:169`); the LUMI section's two keyboards
   (`js/lumi-practice.js:367`, `:400`). Every page repaints on the `colors` event (`js/fretboard.js:1978`,
   `js/piano.js:1813`, `js/lumi-practice.js:476`, `js/pads.js:288`).

**What differs from the roadmap, the tokens and the mockup.**

| # | Fact | Evidence |
|---|---|---|
| a | **The palette is not the tokens.** The app's seven colours are amber, yellow, green, teal, blue, purple, pink; shown after the snap as `#ffaa2e #ffd429 #7dfc74 #41eab4 #439af5 #7e58f5 #ff6460`. The tokens are red, orange, yellow, green, cyan, blue, purple: `#ff4d4d #ff9a3c #ffd23f #4cd964 #34d0e0 #4d7dff #b36bff`. No code reads `--sl-deg-*`. | `js/app.js:1289`; `css/tokens.css:43-49`; `probe.json` `colors.degrees`, `tokens` |
| b | **The tokens are not LUMI colours.** Run through the same snap they become `#ff5869 #ff9a37 #ffd029 #5ffe86 #26cbe9 #557cfc #8d4def`. If the rule "screen = LUMI table colour" stays, the token values are never what is drawn. | computed with `js/note-palette.js` (`probe.json` `tokenQuant`) |
| c | **The 1 colour is the accent.** Degree 1 is `#ffab47`, the same amber as `--accent` (`css/style.css:55`). The root dots, the runner's "now" ring, the mode box and the "now" cell of the tab are all amber. The design system says the accent is "the ONLY accent; never a second hue for emphasis" (`docs/DESIGN-SYSTEM.md:31`); the tokens solved it by making the 1 red. | `js/app.js:1289`; `js/fretboard.js:325-329`, `:786-797`, `:1774`; seen in `1200-dark/tab-run.png` |
| d | **"Interval" is not "scale degree".** The mode colours the twelve semitones above the root: seven anchors plus five blends for ♭2 ♭3 ♭5 ♭6 ♭7. In A Dorian the third note C is ♭3 and gets the blend `#baf94f`, not the "3" colour; G (♭7) gets `#9d42ea`. The mockup colours by the note's number in the scale: C = 3 = yellow, G = 7 = purple, seven colours, no blends. | `js/note-palette.js:48-63`; `js/app.js:1281-1284`; `docs/design/home-mockup.html:159-160`, `:175`; the Piano legend "R·A 2·B b3·C 4·D 5·E 6·F# b7·G" in `1200-dark/piano-full.png` |
| e | **"Play this now" is three different things.** Screen: an amber ring on the dot, a dashed amber ring on the next (`js/fretboard.js:782-799`, `js/piano.js:927-939`); in Tab and Notation an amber outline or halo (`js/fretboard.js:1774`, `:1198-1199`); in Songs an amber cell (`js/songs.js:517`). LUMI: the key in its own colour, steady; the next one blinking; the rest of the scale dark while a guide runs (`js/midi.js:1165`, `:1175-1181`). Measured while the Piano runner played: one key lit, in its pitch colour; the screen ring's stroke was `var(--accent)` (`lumi.json` `run`). Mockup: the whole key filled with its degree colour, "filled key = play this now" (`docs/design/home-mockup.html:69-70`, `:163`, `:176`). | as cited |
| f | **A pressed key already fills with its colour.** In the Dots look a pressed or runner-played key is filled with its degree colour for the length of the press. This is the closest thing today to the mockup's filled key. | `js/piano.js:796-801`; `tests/keys.test.js:41`, `:84-87` read that fill |
| g | **Pads use the seven degree colours for drums**, plus a grey for the crash. A lane is not a pitch. On a LUMI the eight pad keys get velocity 20 and flash 127, which in the LUMI's colour table are one orange (`#ff9e34`) and white, not the lane colours on screen. Recorded from the fake port: `{48:20, 49:20, 50:20, 52:20, …}`. Read from the code and the bytes, not seen on a LUMI. | `js/pads.js:34-38`, `:88-92`, `:105-108`; `lumi.json` `pads` |
| h | **Songs and Jam have no note colours.** The song tab is plain text with an amber "now" cell; Jam's chords are neutral chips. | `js/songs.js:454-455`, `:516-517`; `js/jam.js:931-938` |
| i | **The label ink on a coloured dot is a raw colour in six files**: `#1c1206`. | `js/fretboard.js:44`, `:1753`, `:1772`; `js/piano.js:1305`, `:1307`; `js/chordchart.js:521`; `js/lumi-practice.js:367`, `:400`; `js/songs.js:517` |
| j | **The default palette is pinned by four suites.** A new default palette changes them. | `tests/colors.test.js:16`, `tests/lights.test.js:54` (LUMI velocities), `tests/note-palette.test.js:7`, `tests/midi-ports.test.js:39` |
| k | **In interval mode a chord chart changes colour with the app's key.** The same C-E-G card was amber / green / blue with the key at C and lime / blue / purple with the key at A. A printed or saved chart therefore looks different depending on the key bar. | seen: `1200-dark/chart-full.png` against `390-dark/chart-tall.png`; `js/chordchart.js:169`, `js/app.js:1328` |

---

## 4. Neck (`fretboard`)

**Markup.** One card `#fb-board`, built in `init` (`js/fretboard.js:1793-1897`): a toolbar row (settings
button, title, jam chip, zoom − / % / + / Fit, rotate, fullscreen: `:1795-1813`), the pentatonic Box row
(`:1814`, filled by `renderPosRow`, `:199-218`), the practice strip (`:1815-1866`), the board's scroll box
`#fb-scroll` (`:1867`), three floating fullscreen controls (`:1868-1870`) and the settings popover
`#fb-settings` (`:1871-1896`).

**CSS.** `js/fretboard.js:1672-1786` (7,045 bytes, 86 rules). Raw colours: the label ink `#1c1206`; the
fullscreen chips `rgba(19,17,20,0.72)` / `#ede8e0` in both themes (`:1681`, `:1699`); the nut `#d8cdb8` /
`#9a8c74` (`:1768`); shadows and the hover wash. The legend is built (`:1597-1607`) and then switched off by
`#fb-legend{display:none}` (`:1784`).

**How the neck is drawn.** One SVG string per render (`renderBoardInner`, `js/fretboard.js:257-444`), 558 nodes
for 24 frets (measured). Geometry is six constants in pixels of the SVG's own space (`:32-37`); frets are
equally spaced. The board is always laid out as a horizontal neck; the vertical view rotates the whole group by
90 degrees and turns every label back (`:297-309`). Parts and where their colour comes from:

| Part | Colour | Line |
|---|---|---|
| Board | `var(--panel)` | `:312-313` |
| Mode box (the 5-fret practice window) | `var(--accent)` at 9 % with dashed amber edges | `:319-330` |
| Inlays | `var(--line)` | `:333-346` |
| Fret wires | `var(--ctl-border)` | `:349-353` |
| Nut | `var(--fb-nut)` | `:354-356` |
| Strings | `var(--muted)`, six widths from a table | `:359-363`, `:46` |
| String names, fret numbers | `var(--muted)` | `:364-366`, `:370-374` |
| Scale dots, r 11.5 | `App.colors` (section 3); the root gets a `var(--text)` outline; outside the mode box 50 % opacity, off the practised string 30 % | `:377-405` |
| Dot label | `#1c1206` | `:402` |
| Chord-tone rings (Jam follow, played MIDI notes) | `rgba(255,255,255,0.85)`; the root and held notes `var(--accent)` | `:409-418`, `:1722-1726`, `:1735` |
| Runner rings (now, next) | `var(--accent)`, `var(--accent-soft)` | `:777-802` |
| Tap flash | `var(--accent)` | `:1643-1658` |
| Hit areas | 150 transparent rects with `data-fb-s`, `data-fb-f`, `data-fb-cx`, `data-fb-cy` | `:421-431` |

Sizing: horizontal = the whole neck spans the box width; vertical = the six strings span the width, capped at
520 px, and the neck scrolls down inside a box of `100dvh - 340px` (`js/fretboard.js:518-528`, `:1713-1715`).
The first orientation is chosen by window width: above 900 px horizontal, else vertical (`:69`).

**Controls.** 18 on screen with a 7-note scale (6 in the toolbar, 12 in the practice strip); 24 with a
pentatonic scale (the Box row adds six); 28 plus seven colour pickers with the settings open. The practice
strip holds six more elements that appear only for some patterns: group size, interval, the string chips,
the one-string picker, Mode box, pause position (`js/fretboard.js:1824-1833`, `:1859`).

**Names suites depend on** (25): `fb-pr-play` (remote-runners x6), `fb-pr-ring` (x3), `fb-pr-dir` +
`data-fbdir`, `fb-pr-bpm`, `fb-pr-status`; `fb-hit` + `data-fb-s` / `data-fb-f` / `data-fb-cx` (practice,
quiz: `tests/quiz.test.js:327` taps the first `#panel-fretboard .fb-hit` at its screen position);
`fb-colors`, `fb-colmode`, `data-fbcolmode`, `data-fbcol`, `data-fbncol`, `fb-col-reset`, `fb-colpick`,
`fb-legend`, `fb-legend-item`, `fb-scroll` (colors); `fb-frets` (storage-import); `fb-alt-play`,
`fb-alt-reset`, `fb-alt-status` (lumi-contexts, remote-runners; see section 5). `tests/practice.test.js:42`
uses the wake tag `fb-run` (`js/fretboard.js:1279`). Full table: `work-pages-instr/refs.txt`.

**Layout seen.**

- 1200, dark and light (`1200-dark/fretboard.png`, `1200-light/fretboard-run.png`): one card, two control rows,
  then a neck 1,068 x 189 px. Dots are 20.7 px, a hit area 41 x 27 px. Below the card about 450 px are empty.
  **Problem:** the hero takes 24 % of the free height.
- Fullscreen at 1200 (`1200-dark/fretboard-max.png`): the same neck, 183 px high, in the middle of an otherwise
  empty 900 px screen. The horizontal neck is sized by width only.
- Vertical at 1200 (`1200-dark/fretboard-rotated.png`): 520 px wide, large dots (it fills the height), 71 %.
- Settings at 1200 (`1200-dark/fretboard-settings.png`): **problem:** the popover is limited to the card's
  height (`max-height: calc(100% - 66px)`, `js/fretboard.js:1727-1730`); on the short horizontal card it ends
  after the colour pickers and the scale's notes are reached only by scrolling inside it.
- 390, dark and light (`390-dark/fretboard.png`, `390-light/fretboard.png`): four control rows (190 px), then
  the vertical neck from y = 316, 504 px high, dots 36 px, hit areas 47 x 73 px. **Problem:** in A Dorian the
  practice box starts at fret 5, which sits at the bottom edge of the first screen, half under the tab bar;
  frets 0-4 with half-faded dots fill the view. After Play the board scrolls to the box by itself
  (`390-dark/fretboard-run.png`).
- Horizontal at 390 (`390-dark/fretboard-rotated.png`): **problem:** the neck is 332 x 59 px, dots about 5 px;
  unreadable without zooming.
- Fullscreen at 390 (`390-dark/fretboard-max.png`): the neck fills the screen, two round buttons top right.
  This is the instrument-hero picture already.
- Light (`1200-light/fretboard-run.png`): works; the half-faded dots outside the box are pale on the pale
  board (yellow and lime the most).
- In every picture the root dots and the "now" ring are the same amber (section 3 c).

**Instrument hero / one thing on screen.**

- Hero: the neck, at the size of today's fullscreen. The headline is the scale name (`#fb-title`), the one
  action is Play (`#fb-pr-play`).
- Fold away: the pattern controls (type, group, interval, strings, one-string picker, Mode box, direction,
  pick, rate, pause, pause position, Notes, Click: `js/fretboard.js:1818-1864`) into one "Pattern" sheet; the
  settings popover (tuning, frets, display, left-handed, Jam auto-switch, colours: `:1871-1896`) into a sheet;
  tempo and colour mode into the key bar (2.5). Zoom / Fit / rotate (`:1803-1810`) are needed only because the
  board does not fit by itself; a hero that sizes itself to the stage needs at most rotate.
- Must not move or change:
  - `#fb-svg` and the group `#fb-rot`: the runner appends its rings to `#fb-rot` in the board's own
    coordinates (`js/fretboard.js:777-800`); the tap flash too (`:1656`).
  - `.fb-hit` with its four data attributes, on top of everything (`:421-431`); press-to-sound for the mouse,
    tap for touch (`:2097-2118`).
  - `.fb-jam-ring` with `data-pc` and `data-midi` (`:413-416`): Jam's chord and every held MIDI or on-screen
    note light them (`:452-477`, `:2016-2030`).
  - The runner's ids and its status text: the pedal reads `#fb-pr-status` to say why it could not start
    (`:1328-1329`) and decides "is something shown" from `#fb-pr-ring`, the status and the stroke readout
    (`:1335-1339`).
  - The runner keeps playing across Neck, Tab and Notation and pauses on leaving the three (`:2176-2186`).
  - `fb:practice` (a Plan block or a Free practice prompt) sets key and tempo, switches to this page and
    starts the runner inside the tap (`:2069-2089`).
  - `.fb-chip`, `.fb-stroke`, `.fb-field` (2.4).

---

## 5. Tab and Notation (`tab`, `notation`)

**Markup.** One function for both, `altInit` (`js/fretboard.js:2214-2265`): a card with the title, a layout
group `.fb-vo` (orientation for Tab only, Fit / Scroll, S / M / L), a transport row (`.fb-alt-play`,
`.fb-alt-reset`, `.fb-alt-status`, a chip "Pattern" that jumps to the Neck page: `:2232-2235`, `:2245`), and
the output box `#fb-tabout` or `#fb-sheetwrap`. The controls carry classes, not ids, because both panels hold
the same set (`:1223-1224`).

**CSS.** Inside the Neck's sheet: `.fb-tabout` (`js/fretboard.js:1746-1748`, `:1775`), `.fbv-n` (`:1749-1753`,
`:1772-1774`), `.fb-sheetwrap` (`:1754-1758`), `.fb-vo` (`:1776`).

**How they are drawn.**

- Tab: monospace text in a `pre`-like box; each fret number is a `span.fbv-n` with `data-step` and the note
  colour as `--dc` (`js/fretboard.js:1014-1019`); low E is the top line on purpose (`:1022-1024`). Wraps into
  systems by measured character width (`:1087-1108`). A vertical variant draws strings as columns
  (`:1052-1081`).
- Notation: one SVG (`js/fretboard.js:1129-1216`): staff lines `var(--muted)`, clef and accidentals from the
  bundled `SLMusic` font in `var(--text)`, noteheads filled with the note colour (`:1183`, `:1200-1201`), the
  root outlined, a "now" halo in `var(--accent)` (`:1198-1199`). Note spacing is a fixed 30 px times the size
  factor (`:1138`).
- "Now": the class `now` on the element with the matching `data-step` (`js/fretboard.js:950-958`).

**Controls.** Tab 10, Notation 8.

**Names suites depend on.** `fb-alt-play` (lumi-contexts x4, remote-runners x3), `fb-alt-reset`,
`fb-alt-status`, always reached as `#panel-tab .fb-alt-play` / `#panel-notation .fb-alt-play`
(`tests/remote-runners.test.js:124-127`, `tests/lumi-contexts.test.js:130-163`), and `#panel-notation
[data-step]` (`tests/lumi-contexts.test.js:132`).

**Layout seen.**

- 1200 (`1200-dark/tab-run.png`, `1200-light/notation.png`): one card, the tab box 160 px, the staff 242 px;
  most of the screen is empty. **Problem:** with Fit the staff does not use the width: 17 notes take 592 of
  1,068 px, the noteheads are 13 px wide; yellow and lime heads are faint on the light card.
- **Problem** (`1200-dark/tab-run.png`): the "now" cell is an amber outline; on a root note the cell itself is
  amber, so "now" cannot be told from "root" (section 3 c).
- 390 (`390-dark/tab-run.png`, `390-dark/notation.png`): Tab wraps into two systems and fits one screen;
  Notation is three systems, 566 px, 1.2 screens. No sideways scroll of the page.

**Instrument hero / one thing on screen.** These two are the closest to the principle already: one card, one
primary button, 8 to 10 controls. The hero is the tab or the staff, which should use the freed height (larger
default size instead of S / M / L). Must not move: the two panels each keep their own `.fb-alt-play`,
`.fb-alt-reset`, `.fb-alt-status` and the `data-step` elements; the runner state is shared with the Neck, so a
second transport must stay a mirror (`js/fretboard.js:1247-1259`).

---

## 6. Piano (`piano`) with the scale lessons and the LUMI section

**Markup.** Three blocks in `init` (`js/piano.js:1351-1465`):

1. The card `.pn-card`: title row with Help level, look (Dots / Whole keys), labels, Typing, octave stepper,
   Sound select, Remap, rotate (`:1353-1379`); the Perform row (`:1380-1398`); the remap panel (`:1399-1405`);
   the practice strip (`:1406-1456`); the stage `#pn-stage` (`:1457`); legend and a one-line hint
   (`:1458-1459`).
2. `<div id="pn-lessons">` (`:1461`), filled by `App.keysLessons.init` (`js/piano.js:1838`): one of three
   views, list / run / done (`js/keylessons.js:527-539`).
3. `<details class="card" id="pn-lumi">` with `#pn-lumi-body` (`js/piano.js:1463-1465`), filled by
   `App.lumiPractice.init` (`js/piano.js:1847`, markup `js/lumi-practice.js:419-436`).

**CSS.** `js/piano.js:1273-1349` (3,340 bytes; the most raw colours of all: 24), `js/keylessons.js:780-831`
(5,995 bytes), `css/lumi-practice.css` (4,035 bytes, every rule scoped to `#pn-lumi`).

**How the keyboard is drawn.** One SVG string per render (`js/piano.js:624-761`), C2 to C6 (`:61`), white key
44 x 190, black key 27 x 118 in SVG units (`:63`). From 1100 px up the SVG is scaled to the stage width
(`:1287-1290`); below that it keeps its 1,276 px and the stage scrolls sideways (`:1276`). Portrait rotates the
group like the neck (`:742-748`).

| Part | Colour | Line |
|---|---|---|
| White / black key | `#f7f3ea` / `#221d20`, both themes | `:1295-1296` |
| Scale dot (look "Dots", the default) | `App.colors`; r 12.5 / 10.5; the tonic ringed `#fff` or `#1c1206`; 60 % outside a mode window | `:704-713`, `:1306-1307` |
| Whole key (look "Whole keys") | the note colour, mixed toward ivory or ebony by fixed factors | `:662-668` |
| Label in the dot, finger numbers, typing letters | `#1c1206`, `#f2ede4`, `#5c2608`, `#e8c48a`, `rgba(28,18,6,.7)`, `#b9b0a2` | `:1305`, `:720`, `:1326-1327`, `:1318-1319` |
| Pressed key | filled with its own colour, white outline, brightness filter; a key without a colour flashes `#ffce7d` / `#b9791f` | `:796-801`, `:1300-1303` |
| Now / next ring | `var(--accent)`, solid / dashed and pulsing | `:907-948`, `:1292-1293` |
| Lesson feedback on a key | `#4cc9b0` (ok), `#ffd166` (meh), `#ff5d5d` + `#ff8f8f` (bad) | `:1333-1335`, `:1892-1901` |
| Range of the connected keyboard | a `var(--accent)` bar and caption under the keys | `:726-735`, `:1338` |
| Octave names | `var(--muted)` | `:1310` |

The ring is placed by looking up `.pn-dotg[data-midi]` (`js/piano.js:929`, `:940-941`), which exists only for
keys of the scale (`:714-721`): a target outside the scale gets no ring.

**The lessons' look.** HTML only, except one small SVG chart on the results (`js/keylessons.js:717-742`). Raw
colours: `#221302` (badge ink, `:801`), `#ffd166` (the "good" call, `:809`), `#4cc9b0` (the timing zone,
`:813`, `:822`). The run view: beat dots, a big Bebas call ("2", "Perfect", "34 ms late"), a timing needle, a
progress bar, a note count (`:591-602`).

**The LUMI section's look.** Its own heading "LUMI practice" inside the fold's summary "Notes and triads on the
LUMI", four cards inside the card, two 24-key keyboards as fully coloured DOM blocks (`js/lumi-practice.js:349-360`,
`:367`, `:400`; `css/lumi-practice.css:19-28`). Raw colours for held, correct and wrong (`#268d78`, `#ff3355`,
`#ff7189`: `css/lumi-practice.css:25-31`).

**Controls.** Desktop: 49, of which 41 on the first screen: 20 on the title and Perform rows, 14 on the
practice strip, 14 in the lesson card's list view, 1 for the LUMI fold; plus 9 lesson rows. Phone: 45 (Typing, the octave stepper, Remap and the key letters are hidden on a touch phone:
`js/piano.js:1347-1348`), 30 on the first screen. Help level changes the count: at Target and below, look and
label switches hide (`js/piano.js:1858-1869`): 44 / 40. With the LUMI section open: 60 / 56 controls plus 33 key
buttons. During a lesson run: 1 (Stop).

**Names suites depend on.**

- Piano (29): `pn-svg` (keys x13, colors, lights, smoke, trim), `pn-key` + `data-midi` + `data-pc` + `data-dc`
  (seven suites), `pn-sdot`, `pn-sroot`, `pn-dott`, `pn-fing`, `pn-fingb`, `pn-now`, `pn-nxt`, `pn-down`,
  `pn-hit-ok`, `pn-hit-bad`, `pn-rangel`, `pn-look` + `data-pnlook`, `pn-assist`, `pn-voice` (keys,
  learn-instruments x5, trim), `pn-play` (remote-keys x9, lumi-contexts x5), `pn-reset`, `pn-status`,
  `pn-guide`, `pn-leg`, `pn-legend`, `pn-lessons`, `pn-lumi` (six suites), `pn-lumi-body`.
  `tests/keys.test.js:41`, `:84-87` read a pressed key's inline `style.fill`; `:97` reads the ring's `opacity`
  attribute and the next ring's `style.display`; `tests/trim.test.js:75-76` reach `#panel-piano #pn-voice
  option:nth-of-type(2)` and `#panel-piano #pn-lumi #pn-lumi-body #lp-mode`.
- Lessons (33): `kl-start`, `kl-stop`, `kl-back`, `kl-listen`, `kl-nextlesson`, `kl-help`, `kl-speedup`,
  `kl-dbltap`, `kl-disp`, `kl-ctl`, `kl-card`, `kl-run`, `kl-runtop`, `kl-title`, `kl-level`, `kl-row`,
  `kl-call`, `kl-count`, `kl-streakn`, `kl-streakl`, `kl-strip`, `kl-dot`, `kl-tile`, `kl-big`, `kl-notes`,
  `kl-verdict`, `kl-infnote`, `kl-taphint`, `data-kl`, `data-klstep`, `data-klreps`, `data-kltier`, and the
  class `kl-running` on `<html>`. `tests/lumidisplay.test.js:104-108` double-taps the lesson card at its
  top-left corner plus 4 px and reads the box of `.kl-runtop`.
- LUMI section (20): `lp-start`, `lp-status`, `lp-mode`, `lp-flow`, `lp-input`, `lp-output`, `lp-check`,
  `lp-result`, `lp-feedback`, `lp-role`, `lp-test`, `lp-arm`, `lp-local-control`, `lp-sound-output`,
  `lp-sound-start`, `lp-mode-badge`, `lp-output-status`, `lp-ports-status`, `data-answer-note`,
  `data-target-note`. `tests/lumi-practice.test.js` loads `js/lumi-practice.js` alone into a mock `App`
  (`CLAUDE.md:1404-1406`).

**Layout seen.**

- 1200 (`1200-dark/piano-full.png`, `1200-light/piano.png`): the card holds four rows of controls (34
  controls), then the keyboard from y = 362, 1,064 x 178 px (a white
  key 36.7 px wide), then the legend. The page is 1.8 screens; the lesson card starts at y = 646 and its Start
  button is on the second screen. **Problems:** the hero is 24 % of the free height; two primary buttons with
  the same weight (Play, Start).
- **Problem, any size:** the card's title is the key bar's scale ("A Dorian") while the lesson card below
  offers "C major · Right hand". Start changes the app's key to the lesson's (`js/keylessons.js:250`), the
  title becomes "C MAJOR (IONIAN)" (`1200-dark/piano-lesson-run.png`), and the key stays C major after the run
  (the Charts picture taken afterwards shows it).
- 390 (`390-dark/piano.png`, `390-light/piano-tall.png`): nine rows of controls; the keyboard starts at
  y = 580 and ends under the bottom tab bar; 7.5 of 29 white keys are visible, the rest scrolls sideways
  (1,280 px in a 332 px box). The page is 2.8 screens (2,356 px). **Problem:** nothing playable is fully on the
  first screen.
- Lesson run, 1200 and 390 (`1200-dark/piano-lesson-run.png`, `390-dark/piano-lesson-run.png`): title, keyboard,
  run panel, one Stop button; fits one screen at both sizes. On the phone the keyboard is scrolled so the
  lesson's octave starts at the left edge (`js/piano.js:763-779`). **This is the target picture.**
- Whole keys (`1200-dark/piano-wholekeys.png`, `1200-light/piano-wholekeys.png`): keys outside the practice
  window are pastel; on the light card they wash out.
- Light (`1200-light/piano.png`): **problem:** ivory keys `#f7f3ea` on a card of `#fffdf9`; only a thin grey
  outline separates keyboard and card; the yellow and lime dots are weak.
- With a LUMI (`1200-dark/piano-with-lumi.png`): an amber bar "LUMI C3–B4" under two of the four octaves.
- Portrait (`390-dark/piano-rotated.png`): a column 308 px wide and 1,838 px long below the same nine rows;
  the page becomes 4.7 screens.
- LUMI section open (`1200-dark/piano-lumi-open-full.png`, `390-dark/piano-lumi-open.png`): 3.5 screens at
  1200, 6 screens (5,064 px) on the phone. **Problems:** a second page inside the page; three keyboards on one
  page in three looks (dots on ivory, and twice fully coloured blocks); cards inside a card; wording for
  developers ("SIMULATED — NO DEVICE I/O", "24-key window starts at MIDI").
- 1024 x 640 (`1024-dark/piano.png`): five control rows, the keyboard from y = 410 to 600, cut on the right
  (the scale-to-fit rule starts at 1100 px), nothing else on the first screen.

**Instrument hero / one thing on screen.**

- Hero: the keyboard, as in the lesson run. The "next step and a Start button" of the design system
  (`docs/DESIGN-SYSTEM.md:10-13`) is the selected lesson with `#kl-start`; the mockup's headline "A Dorian, up
  and down · 72 BPM · pass 2 of 3" maps to `.kl-title`, the level line and the repeat count
  (`js/keylessons.js:556-567`).
- Fold away: Perform (Single / Triads / 7ths, +Bass, Strum, Arp and its four controls:
  `js/piano.js:1380-1398`), Sound, Typing / octave / Remap, look and labels, rotate, and the whole runner strip
  (`:1406-1456`) into sheets or "Something else"; Help level and tempo into the key bar; the lesson list
  (`.kl-list`, tiers) behind "Something else"; the LUMI section into its own sheet or lesson type (deferred in
  Phase A: `CLAUDE.md:1420-1423`).
- Must not move or change:
  - `#pn-svg`, `#pn-rot`, `.pn-key` with `data-midi` / `data-pc` / `data-dc`, `.pn-dotg` with `data-cx` /
    `data-cy`, `#pn-now`, `#pn-nxt`: lessons, runner, Guide mode, Exercises and Charts drive the keyboard
    through `App.keys` (`js/piano.js:1926-1949`).
  - The lessons' focus mode selectors (2.4): change `js/keylessons.js:788-789` in the same commit as the
    Piano's rows.
  - "Open = owner": the LUMI section, a lesson run and the runner never run together; the section is a
    `<details>` whose open state is the ownership (`CLAUDE.md:1387-1407`; `js/lumi-practice.js:505-507`). A
    sheet instead of a `<details>` must keep `App.lumiPractice.open` true exactly while it is shown.
  - The double-tap on empty space of the lesson card (`js/keylessons.js:852-859`): it ignores taps on
    buttons, inputs, labels, `summary`, `details`, `table`. New tappable elements in the card must be one of
    those tags or they will start and stop lessons.
  - `#pn-lessons` is the target id of the Learn bar's "Keys scale lessons" entry
    (`js/learn-instruments.js:21-22`, `:63`), and Exercises scrolls to `.kl-card` (`js/quiz.js:2443`).
  - The pedal order: lessons, then runner; the open LUMI section alone (`js/piano.js:1125-1131`).

---

## 7. Charts (`chart`)

**Markup.** `init` (`js/chordchart.js:341-396`): a card `.cc-top` (title input, chart picker, New, Copy,
Delete, a four-step help paragraph), a card `#cc-tools` with five rows (tap tool Dot / 1-5 / Erase + Undo; the
picked keyboard's hand, Chord / Line, Add fingers, Name it, Hear, Clear, move, Remove; a note input; Play it
in, Light the LUMI, Play all, lowest key, octaves; Practice with LUMI, Print, Save file, Save MIDI, Open file),
and the grid `#cc-sheet`. Each keyboard is a `.cc-card` with a name input and one SVG
(`js/chordchart.js:181-191`); the grid ends with an "Add a keyboard" tile (`:198-200`).

**CSS.** `js/chordchart.js:496-530` (2,709 bytes), including a print block that hides everything but the grid
and re-inks it with raw colours (`:525-529`).

**How a keyboard is drawn.** SVG, white key 24 x 104, black 15 x 64 units (`js/chordchart.js:28`,
`:154-179`), scaled to the card width (`:514`). Keys `#f7f3ea` / `#221d20` (`:515-516`); a dot per placed note
in the `App.colors` colour, falling back to `#e5484d` (`:169`); finger numbers above the dot in blue
`#1d4ed8` / `#9cc2ff` (`:519-520`); order numbers of a line in `#1c1206` (`:521`); octave names `#8a8073`
(`:522`). The picked card has an amber border (`:508`).

**Controls.** 37 plus one name input per keyboard (8 on a new chart).

**Names suites depend on** (19): `cc-sheet` (chordchart x6), `cc-card` (x5), `data-ci` (x5), `cc-k`, `cc-dot`,
`cc-fing`, `cc-ord`, `cc-name`, `cc-nameit`, `cc-undo`, `cc-new`, `cc-listen`, `cc-practice`, `cc-export`,
`cc-import`, `cc-pick` (also storage-import), `data-cchand`, `data-cckind`, `data-m`. The suite drives most of
the page through `window.SLChart` (`js/chordchart.js:543-548`).

**Layout seen.**

- 1200 (`1200-dark/chart-full.png`, `1200-light/chart.png`): two cards of controls (410 px), then three
  keyboards per row from y = 546, each 334 x 98 px. 1.3 screens.
- **Problem** (all sizes): the note input `#cc-note` is unstyled: `css/style.css:656` styles
  `input[type="text"]`, the input has no type (`js/chordchart.js:377`). Measured: browser default background,
  radius 0, 13.3 px (`probe.json` `ccNote`). It shows as a grey box in dark and a white box in light.
- **Problem:** the help paragraph and the status line use the class `hint`, which has no rule (2.4).
- 390 (`390-dark/chart-tall.png`): one keyboard per row; the two cards of controls fill more than the
  first screen, so **the first keyboard starts at y = 944, below the first screen**, and the tools are out of sight while one works on the fourth
  keyboard. 3.1 screens (2,630 px).
- 1024 x 640 (`1024-dark/chart.png`): only the top edge of the first row of keyboards is on the first screen.

**Instrument hero / one thing on screen.** Hero: the keyboards (the sheet). The tap tool and Undo are the only
controls needed while placing dots; they want to stay in reach (a bar that sticks under the key bar, or a
bottom sheet on phones). Fold away: chart management (picker, New, Copy, Delete), the picked keyboard's
actions, the window (lowest key, octaves), and the five file / practice actions. Must not move: `#cc-sheet`
with `.cc-card[data-ci]` and `.cc-k[data-m]`; the click logic that picks a card first and applies the tool on
the second tap (`js/chordchart.js:455-463`); the print block needs `#cc-sheet` and `.cc-ptitle` (`:525-529`);
"Light the LUMI" goes through `App.midi.guide` and is cleared on hide (`:227-236`, `:539`). Charts has no
pedal action today.

---

## 8. Pads (`pads`)

**Markup.** `init` (`js/pads.js:168-196`): a card with the Remap chip, Reset map, a hint, the grid `#pd-grid`
and one sentence; a second card "MIDI & ROLI" with the mapping switch, the base key and Key lights. The eight
pads are buttons built by `render` (`js/pads.js:117-128`).

**CSS.** `js/pads.js:140-166` (1,459 bytes). The grid is four columns, capped at 720 px (`:143`).

**How the pads are drawn.** DOM buttons, a gradient over `var(--card2)` (`js/pads.js:146`), a 5 px colour bar
at the top in the lane colour `--pd` (`:149-150`); a hit fills the pad with the lane colour and a glow for
110 ms (`:95-101`, `:151-152`). Lane colours = the seven degree colours plus `#c8c2b8` (`:36-38`).

**Controls.** 5 (Remap, two mapping buttons, base key, Key lights) plus the 8 pads.

**Names suites depend on** (7): `pd-grid`, `pd-pad`, `pd-hit`, `pd-remap`, `pd-mapreset`, `pd-maphint` (all
`trim`), `data-lane` (`trim`; `synthdeck-scope` uses the same attribute name for its own lanes).
`js/help.js:123` points the tour at `#pd-mode`.

**Layout seen.**

- 1200 (`1200-dark/pads.png`, `1200-light/pads.png`): pads 171 x 149 px in a 720 px grid; **problem:** the
  right third of the card is empty, the hero is 39 % of the free height.
- 390 (`390-dark/pads-tall.png`): **problem:** pads are 77 x 77 px and the whole grid is 162 px high; the rest
  of the first screen is text and settings. For finger drumming this is the smallest target in the app.
- Light works (a separate pad surface rule, `js/pads.js:157-158`).

**Instrument hero / one thing on screen.** Hero: the pads, filling the stage (2 x 4 on a phone would give
about 160 px pads). Fold away: Remap and the "MIDI & ROLI" card into one sheet. Phase C rebuilds this page as
rhythm practice (`docs/ROADMAP-2.0.md:21-22`, `:59`), so Phase B should only re-skin and enlarge. Must not
move: `.pd-pad[data-lane]` inside `#pd-grid` (pointerdown on the grid, `js/pads.js:234-245`); `onKey` for
Z X C V / A S D F (`:296-302`); the keybed claim on show and its release on hide (`:294-295`).

---

## 9. Songs (`songs`) with the Player card

**Markup.** `init` (`js/songs.js:542-601`), four blocks: the card "Open a score" `#sg-open` (file button,
status, the row of three destinations `#sg-opendest`: `:543-553`); the Player host `#sg-player`, hidden until
"Play on synth" (`:555`), filled by `SLScorePlayer.mount` (`js/songs.js:696-703`, card markup
`js/scoreplayer.js:568-598`, ids `mh-pl*`); the card "Add a song" (paste box, Parse tab, Import MIDI, name,
Save to library, Export tab, the library chips: `:556-571`); the song card (title, detected key, transport
strip, the tab `#sg-tabout`: `:572-601`).

**CSS.** `js/songs.js:512-540` (1,590 bytes) and the Player's `js/scoreplayer.js:610-619` (769 bytes).

**How the song is drawn.** No instrument. The song is monospace text in systems of 24 steps
(`js/songs.js:436-460`), each step a `span[data-sgstep]`; the sounding step gets the class `now` = an amber
cell (`:315-319`, `:517`). High e is the top line here (`:417`), low E is the top line on the Tab page
(`js/fretboard.js:1022-1024`): two tab conventions in one app.

**Controls.** 14 with nothing loaded, 17 with a song, 34 with the Player card shown. Six primary (amber)
buttons are then on the page: Choose a file, Play on synth, Open file, Play, Parse tab, Play.

**Names suites depend on** (18 + the Player's 20): `sg-open`, `sg-openfile`, `sg-openmsg`, `sg-opendest`,
`sg-opensynth`, `sg-openpractice`, `sg-opentab`, `sg-player` (oneopen x8), `sg-paste`, `sg-parse`, `sg-play`,
`sg-reset`, `sg-status`, `sg-tabout`, `sg-loopa`, `sg-loopb`, `sg-file`, `data-sgstep`; of the Player
`mh-pl`, `mh-plplay`, `mh-plout`, `mh-plinfo`, `mh-plports`, `mh-plsynth`, `mh-plch`, `mh-plconnect`,
`mh-pltab` and eleven more, shared with the Gear suites (`midihub`, `midihub-player`, `gear`).
`tests/oneopen.test.js:37`, `:156` check that `#sg-player` is not hidden, has a height and sits in the active
`#panel-songs`; `:58`, `:64` check the `hidden` attribute of `#sg-opendest`.

**Layout seen.**

- 1200 (`1200-dark/songs-player-full.png`): three cards, four with the Player; the song itself is the last
  card (y = 819 without the Player, y = 1,317 with it). 1.3 to 1.9 screens.
- **Problem (a visible bug):** the three destination buttons "Play on synth / Practice / Open as tab" are on
  screen before any file is chosen. `#sg-opendest` has the `hidden` attribute (`js/songs.js:548`), but it is a
  `.row`, and `.row { display: flex }` (`css/style.css:520`) beats the attribute. Measured: `display: flex`,
  40 px high (`probe.json` `sgOpendest`). A tap does nothing (`js/songs.js:747`, `:753`). The suite reads the
  attribute, not the display. The same clash is already written down for two other rows
  (`CLAUDE.md:1654-1659`).
- 390 (`390-dark/songs-tall.png`): 1.6 screens empty, 2.8 with a song and the Player (2,363 px); the song is at
  the very bottom. The paste box scrolls sideways inside itself (388 in 330 px), on purpose
  (`js/songs.js:520-521`).
- The Player card: two big buttons (48 px), a seek slider, then about a dozen options in three rows; the "From / To"
  key selects show although "Change key" is unticked (known, `CLAUDE.md:1656-1658`).

**Instrument hero / one thing on screen.** There is no instrument to make a hero of. The "one thing" is the
loaded song with its Play button; "Open a score", "Add a song" and the Player's options are three ways of
bringing a song in or sending it out and belong behind one "Add or open" sheet. Phase G rebuilds this page as
a library (`docs/ROADMAP-2.0.md:20-21`, `:63`) and the final home of the Player is deferred to G
(`CLAUDE.md:1720`), so Phase B should re-skin and reorder, not rebuild. Must not move: ONE mount of the Player
per document, with its `mh-pl*` ids (`js/scoreplayer.js:24`, `:626`); `#sg-player` must be a visible box in
`#panel-songs` after "Play on synth" (`js/songs.js:702`); the pedal reads `#sg-status` and looks for `.now`
in `#sg-tabout` (`js/songs.js:391`, `:398`).

---

## 10. Jam (`jam`)

**Markup.** `init` (`js/jam.js:1036-1118`), two cards. "Band": genre, energy, swing, tempo, New song
(`:1039-1052`); Play, Finish and the now-playing display `#jam-now` / `#jam-nowsub` (`:1053-1061`); the form
chips `#jam-form` (`:1062-1065`, built `:898-909`); the section editor (`:1066-1078`, built `:911-929`); the
chord palette `#jam-palette` with the key caption (`:1079-1083`, built `:931-942`). "The band": six band
chips and three mixer rows (mute, volume, sound: `:1087-1117`).

**CSS.** `js/jam.js:993-1034` (2,282 bytes). Two raw colours, both shadows (`:999`, `:1006`). "On air" is
teal (`var(--teal)`, `:999`, `:1002`), a second emphasis hue beside the amber.

**How it is drawn.** No instrument. The only large element is the sounding chord's name in Barlow Condensed
40 px (`js/jam.js:994`, `:871-881`); it is empty while stopped (measured width 0).

**Controls.** 42; on the phone 20 on the first screen. No pedal action.

**Names suites depend on** (4): `jam-play`, `jam-finish` (`trim`), `jam-genre`, `data-jen`
(`storage-import`, as `#panel-jam button[data-jen="3"]`, `tests/storage-import.test.js:1018`). `js/help.js:70-72`
points the tour at `#jam-genre`, `#jam-form`, `#jam-palette`; the Woodshed names `jam-now` once.

**Layout seen.**

- 1200 (`1200-dark/jam-full.png`): two cards, 1.2 screens; Play is the one big button (55 px, Bebas), which
  fits the design system; around it sit 41 smaller controls.
- 390 (`390-dark/jam-tall.png`): 2.1 screens (1,798 px); the mixer puts each sound select on its own line
  (`js/jam.js:1019-1020`).
- The palette's Roman numerals and the active chips use the amber ink; nothing shows the key's note colours.

**Instrument hero / one thing on screen.** Jam accompanies; the instrument one plays is on another page. The
Neck and the Piano already follow Jam's chord (`jam:chord`: `js/fretboard.js:2016-2020`, `js/piano.js:1814`).
The honest hero for Jam is the now-playing chord (the Bebas headline) with Play, and the form as one quiet
line. Fold away: the section editor and the mixer. Phase C makes Jam "slim" (`docs/ROADMAP-2.0.md:20-21`,
`:59`); Phase B should re-skin and fold, not redesign. Must not move: `jam2.*` values are saved together on
any change and are guarded against overwriting a waiting copy (`CLAUDE.md:1800-1803`), so a re-skin must not
add a write on show; drag of palette chips and section chords is pointer-event code tied to `.jam-pal`,
`.jam-edch`, `[data-jsec]` (`js/jam.js:1003-1009`, classes; the drag code itself was not read).

---

## 11. What the heroes need that the tokens do not have yet

`css/tokens.css` has for instruments: seven degree colours, two key colours, string, fret (`:43-55`). The
pages use these further instrument colours today, each as a raw value or an old variable:

| Need | Today |
|---|---|
| Fingerboard surface, inlay, nut | `var(--panel)`, `var(--line)`, `--fb-nut` (`js/fretboard.js:313`, `:337`, `:1768`) |
| Key outline | `#b9b0a2` / `#000` (`js/piano.js:1295-1296`), `#6d655a` (`js/chordchart.js:515`), `#9a9187` (`css/lumi-practice.css:20`) |
| Ink on a note colour | `#1c1206` in six files (section 3 i) |
| Ink on a black key | `#f2ede4`, `#e8c48a`, `#b9b0a2`, `#9cc2ff` (`js/piano.js:720`, `:1327`, `:1319`; `js/chordchart.js:520`) |
| Finger number | `#5c2608` (Piano), `#1d4ed8` (Charts) |
| Now / next marker | `var(--accent)` everywhere on screen (section 3 e) |
| Pressed key without a colour | `#ffce7d`, `#b9791f`, `#e8912a` (`js/piano.js:1300-1301`) |
| Right / nearly / wrong on a key | `#4cc9b0`, `#ffd166`, `#ff5d5d`, `#ff8f8f` (`js/piano.js:1333-1335`); `#268d78`, `#ff3355` (`css/lumi-practice.css:25-28`); the status tokens `--sl-ok / -warn / -bad` exist but are not these values |
| Five blend colours and twelve note-name colours | computed in `js/note-palette.js:48-58`, source `js/app.js:1293-1294`; no token |
| Dim state (outside the practice window) | opacity 0.5 / 0.3 / 0.6 (`js/fretboard.js:397-398`, `js/piano.js:712`), a hex mix for whole keys (`js/piano.js:663-665`) |
| Pad surface, eighth lane colour | a gradient over `var(--card2)` (`js/pads.js:146`), `#c8c2b8` (`js/pads.js:37`) |

Because the dots are SVG `fill` attributes computed in JavaScript, a degree colour cannot simply become
`var(--sl-deg-N)` in CSS: the palette is user-editable (`fb.colors`, `fb.noteColors`), has two modes and is
snapped to the LUMI table. Either the tokens become the palette's defaults in `js/app.js:1289`, or the palette
writes its current values into the `--sl-deg-*` variables at run time.

---

## 12. Every problem seen, in one list

| # | Page, size | What is seen | Picture | Cause |
|---|---|---|---|---|
| 1 | Neck, 1200 | Neck 189 px high, 450 px empty below | `1200-dark/fretboard.png` | horizontal neck sized by width only, `js/fretboard.js:520-528` |
| 2 | Neck fullscreen, 1200 | 183 px neck in an empty 900 px screen | `1200-dark/fretboard-max.png` | same |
| 3 | Neck settings, 1200 | Popover cut at the card's height; notes of the scale need inner scrolling | `1200-dark/fretboard-settings.png` | `js/fretboard.js:1727-1730` |
| 4 | Neck, Tab, Piano | Root colour = accent colour; "now" on a root note is amber on amber | `1200-dark/tab-run.png` | `js/app.js:1289`, section 3 c |
| 5 | Neck, 390 | Practice box starts at the bottom edge of the first screen | `390-dark/fretboard.png` | four control rows + the box at fret 5 |
| 6 | Neck horizontal, 390 | Neck 332 x 59 px, unreadable | `390-dark/fretboard-rotated.png` | fit to width |
| 7 | Notation, 1200 | Staff uses 592 of 1,068 px; 13 px noteheads; pale heads in light | `1200-light/notation.png` | fixed 30 px spacing, `js/fretboard.js:1138` |
| 8 | Piano, 1200 | Four control rows, 41 controls on the first screen, keyboard 24 % | `1200-dark/piano-full.png` | `js/piano.js:1353-1456` |
| 9 | Piano, 390 | Keyboard starts at y = 580, ends under the tab bar; page 2.8 screens | `390-dark/piano.png` | same, nine rows |
| 10 | Piano | Title "A Dorian" above a lesson "C major"; Start changes the app's key and leaves it changed | `1200-dark/piano-full.png`, `piano-lesson-run.png` | `js/keylessons.js:250` |
| 11 | Piano, light | Ivory keys on a near-white card | `1200-light/piano.png` | `js/piano.js:1295`, `css/style.css:85` |
| 12 | Piano, 1024 x 640 | Keyboard cut on the right, five control rows | `1024-dark/piano.png` | fit rule from 1100 px, `js/piano.js:1287` |
| 13 | LUMI section | A page inside the page, three keyboards in three looks, 6 screens on the phone | `1200-dark/piano-lumi-open-full.png` | `js/lumi-practice.js:419-436` |
| 14 | Charts | Unstyled note input; unstyled hint text | `1200-dark/chart-full.png`, `1200-light/chart.png` | `js/chordchart.js:377`, `:352`; `css/style.css:656` |
| 15 | Charts, 390 and 1024 x 640 | First keyboard below the first screen | `390-dark/chart-tall.png`, `1024-dark/chart.png` | five rows of tools above the sheet |
| 16 | Charts | The same chord has other colours when the app's key changes | `1200-dark/chart-full.png` vs `390-dark/chart-tall.png` | interval mode, section 3 k |
| 17 | Pads, 1200 | Right third of the card empty | `1200-dark/pads.png` | `max-width:720px`, `js/pads.js:143` |
| 18 | Pads, 390 | Pads 77 x 77 px, grid 162 px high | `390-dark/pads-tall.png` | four columns, `js/pads.js:143`, `:164` |
| 19 | Songs | Three destination buttons visible before a file is chosen; they do nothing | `1200-dark/songs-player-full.png` | `.row` beats `hidden`, `css/style.css:520`, `js/songs.js:548` |
| 20 | Songs | Six primary buttons; the song is the last card | `1200-dark/songs-player-full.png`, `390-dark/songs-tall.png` | four stacked cards |
| 21 | Jam | No hero; 42 controls; the now-playing line empty while stopped | `1200-dark/jam-full.png`, `390-dark/jam-tall.png` | `js/jam.js:1036-1118` |
| 22 | All eight | Controls 34 px high (38 px on touch) against the system's 44 / 48 | `measure-*.json`: Piano 47 of 49 under 44 px, Charts 36 of 37, Jam 35 of 42 | `--h-ctl`, `css/style.css:64`, `:109` |
| 23 | Tab against Songs | Low E on top on the Tab page, high e on top on Songs | `1200-dark/tab-run.png`, `songs-player-full.png` | `js/fretboard.js:1022-1024`, `js/songs.js:417` |

No page scrolls sideways as a whole at 390 px (`docW` = 390 in every measurement); the sideways scrollers are
the Piano stage and the Songs paste box, both on purpose. No page error and no console error in any of the
five runs (`measure-*.json`, key `errors`).

Pictures I looked at (43): the three mockups `mockup-e-1200`, `mockup-e-390`, `mockup-f-1200`; `1200-dark/`
`fretboard`, `fretboard-run`, `fretboard-settings`, `fretboard-rotated`, `fretboard-max`, `tab-run`,
`piano-full`, `piano-lesson-run`, `piano-wholekeys`, `piano-lumi-open-full`, `chart-full`, `pads`,
`songs-player-full`, `jam-full`, `piano-with-lumi`; `1200-light/` `fretboard-run`, `piano`, `notation`,
`chart`, `pads`, `piano-wholekeys`; `390-dark/` `fretboard`, `fretboard-settings`, `fretboard-run`,
`fretboard-rotated`, `fretboard-max`, `tab-run`, `notation`, `piano`, `piano-rotated`, `piano-lesson-run`,
`piano-lumi-open`, `chart-tall`, `pads-tall`, `songs-tall`, `jam-tall`; `390-light/` `fretboard`,
`piano-tall`; `1024-dark/` `piano`, `chart`. The other 118 page pictures were written and not opened; their
numbers are in the measure files.

About the mockup itself: it is a fixed 1280 x 800 canvas (`docs/design/home-mockup.html:26`); at 1200 px it is
cut on the right and at 390 px it shows the left 390 px of the desktop layout. **There is no phone design for
the instrument hero**, and the neck hero is drawn only in the rejected theme F
(`docs/design/home-mockup.html:192-219`).

---

## 13. What follows for the Phase B plan

1. **The hero is a shared component, and it does not exist yet.** Seven keyboards and three necks (2.6). The
   cheapest safe order: restyle the Piano's and the Neck's own SVG in place first (names kept), then decide
   whether Charts, the LUMI section, Exercises and Chords take the same drawing function. Replacing a drawing
   function touches the most suite names of all (Piano 29, Neck 25).
2. **Fold by hiding, not by removing.** Suites and the pedal reach controls by id whether or not they are on
   screen (`#pn-play`, `#fb-pr-play`, `#kl-start`, `#sg-play` are clicked from page code). A control that
   moves into a sheet must stay in the document from start-up, and a sheet that is built on first open would
   break them. The existing pattern is CSS that hides rows under a class on `<html>` (`kl-running`).
3. **The two existing focus modes are the pattern**: `html.kl-running` and `.fb-max`. Generalising them (one
   "stage" state per page: hero + one headline + one action) is less risk than new layouts.
4. **Page CSS has to move in one piece per page**, and the Neck's sheet first carries three classes for other
   pages (2.4). A step "components" that provides chip, stroke readout and field label from tokens must land
   before the Neck's sheet is rewritten.
5. **The `hidden` attribute on a `.row`** is a known trap with a third victim (problem 19); a single rule
   `.row[hidden] { display: none }` in the shell would fix all three. No suite reads those displays as flex
   (`tests/oneopen.test.js:158` reads the Player's port row display, which already has its own rule,
   `js/scoreplayer.js:617`). Not run.
6. **Note colours are a decision before they are a re-skin** (section 3 a-e). The default palette is pinned by
   four suites and stored in users' `fb.colors`.
7. **Phone and FL-window layouts need a design**: the mockup has none, and at 1024 x 640 and 390 x 844 the
   Piano, Charts and Pads heroes do not fit with today's rows.
8. **Pages that are rebuilt later** (Pads in C, Jam "slim" in C, Songs in G, the LUMI section as lesson types
   in C/E) should get tokens, the shared buttons and the folding in Phase B, and nothing more.

---

## 14. Open questions, each with a recommended answer

1. **Which seven colours are "the degree colours": the tokens (`--sl-deg-*`, 1 = red) or today's palette
   (1 = amber)?** Recommended: the tokens' hues, because today's 1 is the accent colour and makes "root" and
   "now" the same amber; but store them in the palette as their LUMI-table values (`#ff5869 #ff9a37 #ffd029
   #5ffe86 #26cbe9 #557cfc #8d4def`) so screen and LUMI stay identical, and update `css/tokens.css` to those
   values. Users with a stored `fb.colors` keep theirs. Four suites change (`colors`, `lights`,
   `note-palette`, `midi-ports`). The roadmap puts the default into Phase C; the hero components of Phase B
   need the decision earlier.
2. **Does "by scale degree" mean the note's number in the scale (the mockup: seven colours, the 3 of a minor
   scale has the 3 colour) or the interval above the root (today: ♭3 has its own blend colour)?**
   Recommended: keep the interval rule as the engine, because it also colours notes outside the scale and
   keeps chord charts and wrong notes coloured, and name the mode "Degree" on screen. Ask the owner, with the
   two A Dorian pictures side by side, whether the blends read as wrong.
3. **How is "play this now" shown on screen?** Recommended: as the mockup and the LUMI do it: the key or dot
   in its own colour, filled or enlarged, with a neutral (ink-coloured) ring, and no amber. That removes the
   amber-on-amber case and makes screen and LUMI say the same thing. The Piano's pressed-key fill
   (`js/piano.js:796-801`) is the starting point.
4. **One colour switch or three?** Recommended: keep the key bar's, remove the copy in the Neck's settings,
   keep the colour pickers in Lights & help only. `tests/colors.test.js` names the Neck's copy (`fb-colmode`,
   `fb-colors`, `data-fbcol*`) and has to move with it.
5. **Do keys stay ivory and ebony in the light theme (today's rule) or follow the token swap to white?**
   Recommended: one pair for both themes (the instrument is not chrome), and give the keyboard its own darker
   stage in light so it separates from the card. Then `css/tokens.css:131-132` should not re-ink the keys.
6. **Does Phase B fold the pages' own tempo inputs and the Piano's Help level into the key bar?**
   Recommended: yes for Help level and tempo on Neck, Piano and Songs once the key bar shows them
   permanently; keep the elements in the document (hidden) for one step so `keys`, `lights` and
   `remote-runners` stay green, then change the suites. Jam's tempo field can stay until Jam is slimmed.
7. **Is the lesson the Piano page's "one thing", with the free keyboard behind "Something else"?**
   Recommended: yes. The page opens on the selected lesson with Start and the keyboard as hero; the runner,
   Perform, Sound and the lesson list are sheets. It also ends problem 10, if the page's headline is the
   lesson's key whenever a lesson is selected.
8. **Should a lesson leave the app's key changed after it ends?** Recommended: no; restore the key that was
   set before Start when the run ends or is stopped. This is behaviour, not look: a Phase C item, but the
   headline of the hero depends on it.
9. **What is the phone picture of the hero?** There is no mockup. Recommended: before the page steps of Phase
   B, one mockup round for 390 x 844 and 1024 x 640 with keyboard, neck and pads (key bar as one line that
   scrolls sideways or folds to chips; the hero from under the key bar to above the tab bar; Start
   overlapping the hero's lower edge).
10. **How deep does Phase B go on Pads, Jam, Songs and the LUMI section?** Recommended: tokens, shared
    buttons, folding of settings into sheets, larger pads; no new structure, because Phase C (Pads, Jam, LUMI
    targets as lesson types) and Phase G (Songs) rebuild them.
11. **Should Pads light a LUMI in the pads' own colours?** Today all eight keys are one orange and flash
    white (read from the code and the recorded bytes, not seen on hardware). Recommended: leave it for Phase
    E ("one lighting engine everywhere"), where Pads would go through the keybed engine instead of
    `App.midi.light`; note it in the B0 matrix as a drums gap.
12. **Fix the three small visible bugs (problems 14 and 19) in Phase B's first page step, or separately?**
    Recommended: fix them where the shared components land: `.row[hidden]`, an input rule that does not
    depend on the `type` attribute, and a real "hint" text style. They are one line each and would otherwise
    be copied into the new components' markup.

---

## 15. Files of this job

- Report: `scratchpad/v2/phaseB/map-pages-instr.md`
- Pictures: `scratchpad/v2/phaseB/shots/pages-instr/`
  (`1200-dark/` 34, `1200-light/` 33, `390-dark/` 29, `390-light/` 29, `1024-dark/` 33, four `mockup-*.png`,
  five `measure-<combo>.json`). File names: `<page>.png` = the first screen; `<page>-full.png` = the whole
  page (desktop); `<page>-tall.png` = the whole page (phone); `-run`, `-settings`, `-rotated`, `-max`,
  `-pent`, `-wholekeys`, `-help0`, `-help2`, `-lesson-run`, `-lumi-open`, `-loaded`, `-player` = that state.
- Scripts and raw results: `scratchpad/v2/phaseB/work-pages-instr/`
  (`shots.js`, `tall.js`, `mock.js`, `probe.js` + `probe.json`, `lumi.js` + `lumi.json`, `mq.js`, `colors.js`
  + `colors.json`, `refs.js` + `refs.json` + `refs.txt`, `sum.js` + `sum.txt`).
