# Phase B map — the Learn and Train pages as they are

Read-only map of the worktree `scratchpad/wt/a4` (branch `claude/verify-project-files-4bchk6-v2-a4`, HEAD `a914df2`,
`git status` clean before and after). Every `file:line` is a line of that tree. Paths are relative to the worktree
root; `quiz.js:1292` means `js/quiz.js` line 1292, `style.css:481` means `css/style.css` line 481, and `game:105`
means `tests/game.test.js` line 105.

The working files and screenshots this document names (work-…/, shots/…) were scratch files of the planning
session. They are not in the repository: pictures are never committed, because both deploys publish the whole
tree.

Pages covered: the Learn bar (`js/learn-instruments.js`), Exercises (`js/quiz.js`), Chords (`js/chords.js`), Circle
(`js/theorytab.js`), Plan (`js/practiceplan.js`) with the Free practice cards (`js/trainer.js`), Woodshed
(`js/woodshed.js`) with the guided performance player (`js/performance-player.js`) and Practice progress
(`js/practice-progress-ui.js`), and Tuner (`js/tuner.js`). These ten files are loaded only by `index.html`
(`index.html:106-138`); soundLAB Gear loads none of them (`CLAUDE.md:1521-1524`).

**How it was made.** Read in full: `docs/ROADMAP-2.0.md`, `docs/DESIGN-SYSTEM.md`, `css/tokens.css`,
`docs/design/home-mockup.html`, the Phase A section of `CLAUDE.md` (`:1260-1900`), `docs/plans/phase-a/PLAN.md`
sections 0-3 and 9-12, `index.html`, `js/learn-instruments.js`, `js/theorytab.js`, and the markup, CSS and drawing
code of the other nine files (line ranges are named where they are used). The rest of those files (question
generators, MIDI and audio code, scoring) was listed by function name and not read. The worktree was served on port
5413 and driven with headless Chromium (Playwright, deviceScaleFactor 1) at 1200 × 900 and 390 × 844, dark and
light: 54 views per combination, 438 pictures in `scratchpad/v2/phaseB/shots/pages-learn/` (436 of the app, two of
the mockup), measured boxes in
`shots/pages-learn/measure-<width>-<theme>.json`. The 390 px runs used touch emulation (`isMobile`, `hasTouch`) and
every 390 px measurement was taken while `(pointer: coarse)` matched (see section 18, item 1, for why that needed
care). Scripts and their outputs are in `scratchpad/v2/phaseB/work-pages-learn/`. The server was stopped afterwards.

**Not checked.** No suite was run. I opened 64 pictures (listed in Appendix A; ten of them were a first phone take
that was later replaced); the rest is covered by the measured boxes only. Nothing was tried on a real phone, with a real or fake MIDI device, or with real audio (the
Tuner was seen only in its "listening…" state with Chromium's fake media device). Not seen at all: the Woodshed's
Tab and Tab+Sheet displays, a drum rudiment session, the Phrases and Ladder modes, the Weak spots card, the Exercises
jump test, drill and sprint result views, the `#qz-save-error` card, the white-key badges on answers (they need a
keyboard), the locked-step card (a picture was taken, I did not open it). Contrast was not measured. Keyboard focus
order, screen readers and reduced motion were not tried. Texts were not audited against "plain words".

---

## 0. Headlines

1. **These ten modules inject 40,807 characters of CSS, more than the whole shared stylesheet** (`css/style.css` is
   32,307 bytes). Exercises alone injects 21,809 characters in 275 rules (`quiz.js:2636-2881`). None of it uses a
   `--sl-*` token; all of it paints with the old variables (table in section 2).
2. **Colours also live outside the CSS blocks.** 34 `var(--old-name)` strings sit in SVG attributes and inline
   styles in `chords.js`, `tuner.js`, `woodshed.js` and `practice-progress-ui.js`, two canvases read four old
   variables by name every frame (`woodshed.js:863-867`, `performance-player.js:239`), and 71 raw colour literals
   (59 hex, 12 `rgb()` / `rgba()`) are in the ten files (section 2.2). A re-skin that only rewrites the CSS strings
   misses the attribute strings, the canvases and about half of the literals.
3. **No page overflows sideways** at 1200 or 390 px in any of the 54 views (document width equals the viewport in
   all four combinations). Geometry is identical in dark and light in all views.
4. **No page has an instrument hero and no page shows "one thing".** Exercises opens with a 116 px Learn bar, a
   stats card and a tab row before the first step of a path that is 9 screens long (57 steps). On a phone, with
   Piano selected and a level started from the top of the page, the Learn bar and the run header take 361 px above
   the question card, and the one action button (`#qz-act`) is below the visible area in the three question types I
   measured (section 4.5).
5. **The same things are built several times.** Four keyboards, three guitar necks (one of them dead code), three
   staves, three chart engines, four kinds of stat tile, seven progress bars, five disclosure looks, six label
   styles, three "back" controls, four instrument selects and three toasts (section 12).
6. **The common control heights today are 28 / 32, 29, 34 / 38, 40, 45, 46, 47 and 52 px** (mouse / touch where two
   are given). The token is 44 px (48 on touch,
   `tokens.css:92,141`). At 390 px with touch, 67 of 67 controls on the Woodshed library and 36 of 39 on Chords are
   under 44 px (section 13).
7. **Three instruments are cut on a phone.** The Chords neck and the Chords keyboard have `min-width:540px` inside
   a 332 px scroller (`chords.js:995,1009`); the performance player's key strip is 725 px wide in a 340 px box whose
   CSS forbids touch panning (`performance-player.js:328`). The design system says "the hero is never cropped"
   (`docs/DESIGN-SYSTEM.md:54`).
8. **Suites pin Exercises, the performance player and the Plan hard; Chords, Circle and Tuner hardly at all.**
   101 `qz-` names in 11 suites, 36 `pf-` names in 10, 21 `pp-` names in 5; Tuner has no selector in any suite
   (section 15). Almost everything pinned is an id, a class or a `data-` attribute, not a pixel.
9. **Two layout assumptions are read from the shell by page code**: `quiz.js:1271-1290` measures `.topbar` and
   `#tabbar-m` to keep the question in view. A new header or key bar changes those numbers.
10. **Things that look wrong today** and that a re-skin should not copy: Chords paints its "I" chord in the wrong
    colour on a fresh profile, XP is printed with six decimals, the Practice progress chart has 5 px axis text on a
    phone, the Plan's selects lose their arrow in the dark theme only (section 18).

---

## 1. The frame every page sits in

- `<main>` is at most 1150 px wide with 26/18/70 px padding (`style.css:455-459`); at ≤ 640 px the padding is
  18/12/60 (`style.css:990`). Each page is a `<section class="panel" id="panel-<id>">` (`index.html:84-98`), shown
  when it has `.active` (`style.css:461-462`).
- Measured content widths at 1200 px: `main` 1150, the Learn bar and every `.card` on Chords, Circle and Woodshed
  1,114 (the Tuner's two cards share that width), the Plan 960 (`practiceplan.js:346`, `.pp-wrap{max-width:960px}`), Exercises 880 (`quiz.js:2639`,
  `.qz-view{max-width:880px}`). So on Exercises the Learn bar is 234 px wider than the page under it; I saw the two
  left edges at 43 and 160 px (`1200-dark/06-quiz-path-fold.png`).
- The header (`.topbar`) is 109 px high at 1200 and 93 px at 390 (measured); the fixed bottom tab bar covers the
  last 64 px at 390 (`style.css:910-925`).
- Shared components the pages use, all in `css/style.css`: `.card` with a Bebas `h2` that carries an amber dot and a
  small-caps `h3` (`:481-518`), `.row` / `.grid2` (`:520-525`), `details.tips` (`:531-557`), `.big-display` /
  `.mid-display` (`:559-575`), `.btn` with `.primary`, `.danger`, `.big`, `.sm` (`:579-629`), `label.field` and
  `.ctl-label` (`:633-654`), `select` and text/number inputs (`:656-697`), `.seg` (`:743-773`), `.chip` (`:776-797`),
  `.list` (`:809-820`), `.error`, `.good`, `.bad` (`:822-832`). Uses in the ten files' markup strings: 41
  `class="card…`, about 35 primary or danger buttons, 27 `App.icon(` calls.
- These shared classes are also what soundLAB Gear's pages use (one stylesheet, `gear.html` links the same
  `css/style.css`; I did not count uses there). Changing them re-skins Gear too, which the roadmap gives to Phase H
  (`docs/ROADMAP-2.0.md:65`).

---

## 2. CSS: what each module injects

### 2.1 Size and variables

Read from the live `<style id="css-…">` elements after boot (`work-pages-learn/css.json`). "Rules" counts top-level
rules; the number after "+" is rules inside `@media` and `@keyframes`.

| Module | CSS lives at | Injected at | Characters | Rules | Breakpoints | Light-only rules | Old variables, most used |
|---|---|---|---|---|---|---|---|
| Exercises | `quiz.js:2636-2881` | `:2885` | 21,809 | 275 + 36 | 640 px; hover + fine pointer | 1 (`:2774`) | `--accent` 52, `--muted` 42, `--text` 19, `--font-body` 13, `--card2` 12, `--green` 9, `--red` 8, `--line` 7, `--card` 7, `--font-display` 6 |
| Chords | `chords.js:984-1072` | `:1336` | 4,629 | 64 + 5 | 640 px | 1 rule, 3 selectors (`:1062-1063`) | `--deg-c` 8 (own), `--line` 7, `--muted` 7, `--accent` 7, `--text` 6, `--card2` 4 |
| Circle | `theorytab.js:360-402` | `:405` | 2,046 | 31 | none | 3 rules (`:399-402`) | `--deg-c` 8 (own), `--accent` 4, `--text` 4, `--muted` 3, `--line` 3 |
| Plan | `practiceplan.js:346-353` | `:305` | 2,644 | 34 + 11 | 600 px (twice) | 0 | `--accent` 6, `--muted` 4, `--line` 4, `--inset` 2 |
| Free practice | `trainer.js:305-317` | `:305` | 747 | 10 | none | 0 | `--accent` 2 |
| Woodshed | `woodshed.js:1532-1553` | `:1532` | 1,319 | 15 + 2 | 520 px | 0 | eleven variables, once each |
| Performance player | `performance-player.js:328` (one line) | `:328` | 2,120 | 30 + 5 | 520 px | 0 | `--line` 3, `--pf-pitch` 3 (own), `--muted` 2 |
| Practice progress | `practice-progress-ui.js:38-40` (one line) | `:38` | 2,722 | 39 + 7 | 520 px | 0 | `--line` 5, `--muted` 4, `--accent` 2 |
| Tuner | `tuner.js:55-88` | `:615` | 1,698 | 26 + 2 | none | 0 | `--green` 4, `--accent-ink` 2 |
| Learn bar | `learn-instruments.js:43-44` (one line) | `:43` | 1,073 | 14 + 3 | 520 px | 0 | `--line`, `--card`, `--label`, `--accent` once each |
| **Total** | | | **40,807** | **538 + 71** | 520, 600, 640 | 5 | |

Observations.

- `var(--sl-` occurs 0 times in all ten blocks.
- Three different phone breakpoints (520, 600, 640 px) are used, and Circle, Tuner and the Free practice cards have
  none of their own: they rely on `.grid2` folding at 820 px (`style.css:525`) and on flex wrap.
- Border radii in the ten blocks: 3, 4, 5, 8, 9, 10, 12 px, `var(--radius)` (16 px), 50 %, 999 px. The tokens offer
  8, 12, 20 and pill (`tokens.css:86-89`).
- About 30 different font sizes between 9 and 68 px are written in the ten blocks (18 in Exercises alone). Measured
  on screen at 1200 px, most body text is 12.5 or 13 px: 53 % of the characters on the Exercises path are 13 px and
  28 % are 12 px; 57 % on the Progress tab are 12.5 px; 64 % in the performance player are 12.5 px
  (`work-pages-learn/sum.txt`, "text px"). The token scale has 12, 14, 16, 20 and 26 px (`tokens.css:61-65`).
- Old variables these pages use that have no token: `--inset` (segmented tracks, the Plan's inputs and week tiles,
  the Circle's inner ring: `practiceplan.js:346`, `theorytab.js:367`), `--label`, `--ctl-border`, `--line-soft`
  (`quiz.js:2653,2722,2776`), `--teal` (`quiz.js:2752`), `--accent-dim` (`chords.js:1034`).
- The old `--accent-ink` means "the accent as text" (`style.css:62,99`) and is used that way in `quiz.js:2716,2774`,
  `woodshed.js:1547` and `tuner.js:71,77`. The token `--sl-accent-ink` means the opposite, "text on the accent"
  (`tokens.css:30`). A rename by search and replace would put near-black text where amber text is meant.
- "Text on the accent" is written five different ways today: `#221302` (`style.css:602`, `quiz.js:2792,2798,2833`,
  `theorytab.js:374`), `#171106` (`trainer.js:315`), `#1c1206` (`chords.js:221,364,1007`, `theorytab.js:390,402`,
  there as text on a degree colour), `var(--bg)` (`practiceplan.js:346` `.pp-done .pp-number`), and
  `var(--bg,#18151a)` (`practice-progress-ui.js:39`).

### 2.2 Colours outside the CSS blocks

| File | `var(--old)` outside its CSS block | Raw colours outside its CSS block |
|---|---|---|
| `chords.js` | 14, as SVG attributes: `:300,301,309,310,312,320,327,337,340,350` (neck) and `:541,544,557,562` (staff). Variables: `--line` 5, `--muted` 7, `--panel` 1, `--text` 1 | `#8f867c` for a note outside the key (`:159`), `#ffffff` root ring (`:212,359,567,622`), `#1c1206` note name (`:221,364`), `#cfd6e4` nut (`:323`), `rgba(0,0,0,0.35)` (`:359`) |
| `tuner.js` | 16: `:125,126,129,130,132,135` (gauge markup) and `:239,241,249,250,262,264` (set from JS while listening). Variables: `--muted` 7, `--green` 3, `--red` 2, `--line` 2, `--card2` 1, `--accent` 1 | `rgba(122,217,122,0.16)` in-tune zone (`:130`) |
| `woodshed.js` | 3 uses in two inline styles (`:1152,1227`); 4 variables read by name for the canvas (`:863-867`: `--text`, `--muted`, `--card`, `--accent`) | default inks (`:831`), eight judgement colours, four per theme (`:835-839`), grey rules (`:894,938`), key strip (`:922-923`), report bars `#4cc9b0` / `#ffd166` / `#d9484a` with no light variant (`:1289`) |
| `performance-player.js` | 2 variables read by name for the canvas (`:239`: `--text`, `--muted`) | playhead `#e55766` (`:266`), fallbacks `#eee`, `#888` (`:239`) |
| `practice-progress-ui.js` | 1 (`:90`, bar fill `var(--accent,#e6a84b)`) | the fallback in that string |
| `quiz.js`, `theorytab.js`, `practiceplan.js`, `trainer.js`, `learn-instruments.js` | 0 | 0 |

Raw colours inside the CSS blocks: Exercises 8 uses of 6 colours (keyboard ivory and black `quiz.js:2751`, key label
`:2754`, text on accent `:2792,2798,2833`); Chords 11 uses of 9 (pressed keys `chords.js:992-993`, keyboard
`:1005-1007`, hover ring `:1011`, light mix `:1063`); Circle 4 uses of 3; Free practice 1; performance player 6
(`#666`, `#f4f1eb`, `#15151b`, `#25212a`, `#fff`, `#e64961`, all on `performance-player.js:328`); Practice progress 2
(fallbacks); Tuner 2 `rgba()` (`tuner.js:86-87`); Plan, Woodshed and the Learn bar none.

Inline `style="…"` attributes in markup strings: Woodshed 24, Chords 11, performance player 9, Exercises 7, Circle 4,
Free practice 2, Tuner 1, Practice progress 1, Plan 0, Learn bar 0. In the Woodshed they carry the layout (margins,
a nested card's background, `woodshed.js:1148-1169`), so restyling it means editing the markup strings.

---

## 3. The Learn bar

**Built.** `mount()` creates `<section id="learn-instruments">` and inserts it as the first child of `<main>`
(`learn-instruments.js:39-53`). It holds a labelled `<select id="learn-instrument">` with seven instruments
(`:5-6,48`), a row of entry buttons `#learn-instrument-links` (`.btn.sm` with a `<small>` second line, `:81`), a
`details.tips` with `#learn-instrument-note` (`:50-51`) and a status row `#learn-instrument-session` (`:52`).
`refresh()` hides it on every page that is not one of `quiz`, `chords`, `theory`, `practiceplan` (`:10,77`), so the
Woodshed and the Tuner never show it. While an Exercises run is active it disables the select and the entry buttons
and adds a sentence and the button `#learn-stop-exercise` (`:78-82`).

**CSS.** 1,073 characters on `:44`. It is a card of its own: border `--line`, radius 12 px, background `--card`,
padding 12/16 (`:44`), not the shared `.card` (radius 16, padding 20/22, shadow, `style.css:481-488`).

**Seen and measured.** Height 116 px at 1200. At 390: 168 px with Piano (two entries), 223 px with Guitar or Synth
(three entries wrap to two rows), 252 px with Bass, 341 px with Synth and the tips open. During a run: 150 px at
1200, 235 px at 390 with Piano, 290 px at 390 with Guitar (`measure-*.json`, `barH`; pictures
`390-dark/16-quiz-run-keys-fold.png`, `390-dark/20-quiz-run-neck-guitar-full.png`). It is the first thing on all
four Learn pages and it repeats unchanged on each. The entry buttons are 47 px high, the select 34 px (38 with touch).

**Suites.** `learn-instruments` only (23 references): the section must be visible on the four Learn pages
and hidden on the Woodshed (`learn-instruments:81-86`), `#learn-instrument` is read and set as a real `<select>`
(`:44,88,93`), `#learn-instrument-note` and `#learn-instrument-links` are read as text (`:48-49`),
`[data-learn-entry="0"]` is clicked (`:89`), `#learn-stop-exercise` must be **visible** during a run (`:55-56`), and
the bar must fit 390 px (`:202`). The Exercises help tour points at `#learn-instrument` (`help.js:84`).

**Re-skin.** Stays: the ids, the `<select>`, the `data-learn-entry` buttons, the four-page rule, the stop button.
Changes: the box becomes a design-system component (a Select chip for the instrument, ghost buttons or chips for the
entries). Risk: its height. Any taller control makes the phone case worse (it already pushes the question card to
454 px of 844). Whether it stays a block above the page at all is open question 1.

---

## 4. Exercises (`js/quiz.js`, 3,010 lines)

The page has four views and one renderer that replaces the panel's whole markup for each: `render()`
(`quiz.js:1256-1268`) calls `renderHome` (`:1292-1299`), `renderTopic` (`:1331-1350`), `renderRun` (`:1403-1429`) or
`renderDone` (`:1537-1581`). All clicks go through one handler that reads `data-qz*` attributes and ids
(`:2420-2472`).

### 4.1 Home: stats strip and three tabs

- **Markup.** `renderHome` writes a line `#qz-category`, the stats strip, a `.seg.qz-hometabs` with three
  `role="tab"` buttons and `#qz-homebody` (`:1292-1299`).
- **Stats strip** (`statsStrip`, `:1893-1907`): a `.card.qz-strip` with four cells: flame icon and streak number,
  a 40 px goal ring (`goalRing`, an SVG of two circles, `:1885-1891`) with minutes, a level badge with a 5 px bar,
  and the primary button `#qz-cont` ("Start" or "Continue"); under them a note line `.qz-stripnote`. CSS
  `:2766-2776`; on phones it becomes two columns with the button full width (`:2869`).
- **Seen.** At 1200 the strip is one row, 124 px high. At 390 it is 260 px high and, with the Learn bar above it,
  the path's first step starts at 773 px (fresh profile), 7 px above the bottom tab bar
  (`390-dark/06-quiz-path-fold.png`). The
  note line prints "Lifetime: 167.367 XP" (section 18, item 3).
- The strip holds the same three facts as the mockup's footer line: today's minutes against the goal with a ring,
  the streak, and a count (`docs/design/home-mockup.html:147-152`). The mockup's ring is 28 px with a 4 px stroke;
  this one is 40 px with 5 px.

### 4.2 Path tab

- **Markup.** `pathHTML` (`:1912-1931`) writes one `<section class="qz-psec">` per topic with a banner
  (`.qz-pban`: eyebrow "Section n", Bebas title, "x/y levels") and one `.qz-nwrap` per step. A step is a button
  `.qz-node` with a 68 px disc whose ring is a `conic-gradient` driven by an inline `--p` percentage, an icon, and a
  two-line label (`nodeBtn`, `:1933-1940`; CSS `:2786-2801`). States are classes: `locked`, `done`, `cur`, `part`,
  `open`, `sel`. The current step carries a bobbing "Start" tag (`.qz-nstart`, an endless animation, `:2798-2800`);
  the design system asks for "no autoplaying motion on the home" (`docs/DESIGN-SYSTEM.md:61`), and this page is
  today's home.
- **Geometry set from JS.** Each step is shifted sideways by an inline `--x` from the list `ZIG` times
  `--zz: min(54px, 12vw)` (`:1910,1926,2786-2787`).
- **Step card.** Tapping a step inserts `.card.qz-npop` under it (`nodePop`, `:1942-1965`): title, a `<details
  class="qz-nlearn">` lesson, level rows `.qz-lvl`, a primary Start, two `.btn` (sprint, endless), a text link, and
  the answer-clock `.seg` (`clockPicker`, `:2350-2356`). Width `min(440px,100%)` (`:2802`).
- **Seen.** Piano has 57 steps in 5 sections and 137 levels; Guitar 44 steps; Drums 6
  (`work-pages-learn/probe.json`). The path is 7,442 px tall at 1200 and 7,100 px at 390; the page is 8.97 and 9.41
  screens long. The open step card at 390 fills the screen below the header with a lesson, three level rows, three
  buttons, a link and the answer clock (`390-dark/07-quiz-path-node-fold.png`). I saw no overflow of the zig-zag at 390.
- **Light.** Readable; the section banner becomes a pale amber block (`1200-light/06-quiz-path-fold.png`).

### 4.3 Topics tab and topic view

- Topics: a grid of `button.qz-topic` cards with Bebas name, blurb, bar and count (`topicsHTML`, `:2005-2021`; CSS
  `:2657-2664`, `repeat(auto-fill,minmax(230px,1fr))`). Three columns at 1200 (`1200-dark/09-quiz-topics-fold.png`).
- Topic view: a text back link `#qz-home`, an `h2.qz-ttl`, and one `section.card.qz-unit` per unit whose header is a
  full-width button `.qz-uhead` with name, bar, count and a chevron (`renderTopic`, `:1331-1350`). An open unit shows
  mode chips `.chip.qz-mchip`, two text buttons `.qz-learnbtn` (Sprint, Learn), an optional lesson box and level rows
  (`unitBody`, `:1352-1377`; CSS `:2666-2692`). One unit is repainted in place (`repaintUnit`, `:1380-1399`).
- Seen at 1200 (`1200-dark/10-quiz-topic-full.png`): clean, one column of 880 px. The Sprint and Learn text buttons
  are 29 px high.

### 4.4 Progress tab and its charts

- **Markup.** `progressHTML` (`:2081-2113`): four `.qz-tile` stat tiles, then nine `section.card.qz-pcard` blocks:
  This week (seven day dots, `weekStrip`, `:2029-2039`), Daily goal (one button `#qz-progress-settings` that leaves
  for the Woodshed, `:2095,2460`), three charts, a table of topics, Keys lessons, "Legacy / unassigned", Records,
  and a `.seg` for the lesson sound.
- **Charts.** `barChart` (`:2127-2153`) and `lineChart` (`:2155-2195`) build an SVG string at the container's
  pixel width: `W = Math.max(260, box.clientWidth)`, height 170, fixed margins (`:2128,2156`). Marks are styled by
  class (`.qz-barm`, `.qz-linem`, `.qz-area`, `.qz-dot`, `.qz-grid`, `.qz-goalline`, `.qz-axis`, `.qz-val`, CSS
  `:2842-2856`), so their colours follow CSS variables with no colour in the JS. Text labels get a halo in the card
  colour (`.qz-halo`, stroke `var(--card)`, `:2851`). Each column has a transparent `rect.qz-hit` with a `data-tip`;
  one tooltip `div.qz-tip` per chart is positioned from measured boxes (`wireTips`, `:2204-2221`). Each chart is
  followed by a `<details class="qz-tbl">` with the same data as a table (`tableHTML`, `:2197-2202`).
- **Redraw.** Only on a window `resize`, debounced 150 ms, and only while the Progress tab is showing
  (`:2944-2947`); also on every tab switch (`:2261`).
- **Seen.** At 1200 the charts are 834 px wide with 11 px axis text; at 390 they are 332 px wide with the same 11 px
  text (`390-dark/12-quiz-progress-full.png`, `el-quiz-chart-xp.png`). The page is 3.3 screens at 1200 and 4.1 at
  390, with ten cards. The last bar's value label reads "0.266891 XP" and reaches the card's right edge at 390
  (section 18, item 3). Empty state: one muted sentence per chart (`:2227,2247`).

### 4.5 Run view

- **Shell.** `renderRun` builds `#qz-runshell` once per level (`:1403-1424`): a head row (text back link `#qz-back`,
  level tag, XP, count), a credit line `#qz-run-instrument`, ten progress segments `#qz-prog` or a time bar, and a
  `.card.qz-stage` holding the question `#qz-q` and a footer with the feedback `#qz-fb` and one button `#qz-act`.
  Only `#qz-q` is replaced per question (`paintQ`, `:1431-1444`). The button changes in place from a borderless
  "Show answer" to a primary "Next" (`paintFoot`, `:1524-1535`).
- **Answers.** Choices are `button.qz-ch` in an auto-fit grid, 52 px high (`paintAns`, `:1483-1491`; CSS
  `:2711-2721`); right and wrong get a tinted background and border (`.ok`, `.bad`, `:2718-2719`), the others dim.
  Number hints 1-9 show only with hover and a fine pointer (`:2717`).
- **Instruments, all SVG strings.**
  - Keyboard: `keysSVG` (`:823-841`), two octaves C4-B5, 26 px white keys, so 364 × 105 px at natural size, with
    `max-width:100%` (`:2749`). Colours are in CSS: ivory `#f7f3ea`, edge `#b9b0a2`, black `#221d20` (`:2751`);
    marks by class `mk-a` accent, `mk-b` teal, `mk-on` blue, `mk-ok` green, `mk-bad` red (`:2752-2753`).
  - Neck: `neckSVG` (`:843-875`), 36 px per fret, lines styled by class with old variables (`:2757-2764`).
  - Staff: `staffSVG` (`:770-821`), glyphs from the app's own music font at 48 px in a 12 px grid
    (`:760-761,2637,2747`), drawn in `currentColor`.
  - Ear questions: one 84 px round play button (`:1470`, CSS `:2705`).
- **Scrolling done by the page.** `reveal()` scrolls the panel under the header only when its top is outside the
  band between the header's height and 45 % of the window height (`:1271-1278`); `keepVisible()` scrolls the action
  button clear of the bottom tab bar after an answer (`:1282-1290,1697`). Both read `.topbar` and `#tabbar-m`.
- **Seen at 1200** (`1200-dark/15-quiz-run-wrong-fold.png`, `17-quiz-run-chord-keys-full.png`,
  `20-quiz-run-neck-guitar-fold.png`). The run fits one screen. The Learn bar grows to 150 px. The keyboard is 364 px
  wide and the neck 238 px wide inside an 880 px card: the instrument is the smallest block on the screen.
- **Seen at 390, Piano** (`390-dark/14-quiz-run-choice-fold.png`, `16-quiz-run-keys-fold.png`). The Learn bar is
  235 px. The panel's top is at 364 px, inside `reveal()`'s band (it ends at 45 % of 844 = 380 px), so a level
  started from the top of the page, for example with Continue, does not scroll. The question card then starts at
  454 px. With seven answers, two are visible at the start of a note-reading question and four when the question
  shows a keyboard. `#qz-act` sits at 903 px (keyboard question) or 974 px (staff question); the visible area ends
  at 780 px. After an answer `keepVisible()` scrolls the button into view.
- **Seen at 390, Guitar** (`390-dark/20-quiz-run-neck-guitar-full.png`). The Learn bar is 290 px and the panel's top
  is at 419 px, outside the band, so `reveal()` scrolls the run up under the header. My picture was taken after
  scrolling back to the top (question card at 509 px, `#qz-act` at 1,015 px) and does not show the scrolled state;
  I did not capture it. So whether the run is brought into view depends on a 16 px difference in the Learn bar's
  height.
- **Light.** The ivory keyboard on a near-white card keeps its outline (`1200-light/16-quiz-run-keys-fold.png`); the
  wrong and right answers are pale red and pale green with dark text (`390-light/15-quiz-run-wrong-full.png`).

### 4.6 Done view

`renderDone` (`:1537-1581`): one `.card.qz-done` with a 68 px Bebas score, three star characters in the accent
colour, a verdict, three `.qz-tile` tiles (`doneStats`, `:2396-2402`), a list of notes with icons (`doneNotes`,
`:2404-2416`), one primary and up to two secondary buttons, and two text links. Seen at 1200 and 390
(`1200-dark/05-quiz-done-fold.png`): centred, one primary, readable. A tile reads "+0.13".

### 4.7 Components and consistency inside Exercises

- Three button looks beside the shared ones: `.qz-backlink` (text, 29 px high, `:2644`), `.qz-learnbtn` (accent
  text, `:2682`), `.qz-act.qz-quiet` (a `.btn` made borderless, `:2728`).
- Five bar components: `.qz-bar` 5 px (`:2642`), `.qz-prog i` 6 px (`:2698`), `.qz-timebar` 8 px (`:2815`),
  `.qz-abar` 8 px (`:2849`), `.qz-klbar` 6 px (`:2850`).
- Two ring drawings: the SVG goal ring (`:1885-1891,2772`) and the CSS conic disc (`:2788`).
- Seven class names in the CSS have no markup: `qz-hero`, `qz-sub`, `qz-heroact`, `qz-nextup`, `qz-herofoot`,
  `qz-total` (`:2647-2654`) and `qz-goals` (`:2837-2839`). `.qz-wday.frozen` (`:2834`) and the `frozen` branch at
  `:2036` cannot be reached: the state is one of `done`, `today`, `missed` (`:2033`).
- A global helper class `.sr` (visually hidden text) is defined inside this page's CSS (`:2836`).
- The toast `#xp-toast` is created by this module (`:2887-2895`) and styled in `style.css:868-885`.

### 4.8 What suites depend on

101 `qz-` / `data-qz*` names in 11 suites: `game` 144 references, `quiz` 79, `remote-quiz` 35, `practice` 24,
`learn-instruments` 19, `taps` 5, `lumi-contexts` 4, `keys` 3, `lights` 2, `quiz-correction` 2, `smoke` 1 (full list
with lines: `work-pages-learn/refs.txt`). The kinds of dependency:

- **Structure by class**: `.qz-path`, `.qz-strip`, `.qz-node` with `.locked` / `.sel`, `#qz-node-<i>`, `.qz-nstart`,
  `.qz-npop` with `.qz-lockmsg`, `.qz-lvl` rows, `[data-qzjump]`, `[data-qzsprint]`, `[data-qzendless]`,
  `[data-qzclock]` (`game:103-113,208-214,381-389`); `.qz-dstats .qz-tile` must be exactly three, `.qz-dnotes li`
  (`game:124-125`); `.qz-strip .qz-stat b` is read as the streak number (`game:127`).
- **Progress tab**: `.qz-prog2 > .qz-tiles .qz-tile`, `#qz-ch-xp svg` / `#qz-ch-time svg` / `#qz-ch-speed svg`,
  `#qz-ch-time .qz-goalline`, `details.qz-tbl`, the selector chain `.qz-prog2 > section > .qz-tblwrap > .qz-table
  tbody tr`, `.qz-recs li`, `.qz-wday:last-child` (`game:336-341`); a `pointermove` on the last `.qz-hit` must show
  `.qz-tip` (`game:347-349`); no `[data-qzgoal]` may exist (`game:343`).
- **Phone**: at 390 px `#qz-cont`, `[data-qzn="0"]`, `.qz-npop [data-qzsprint]`, `.qz-ch` and
  `#qz-progress-settings` must be the top element at their own centre after `scrollIntoView` (`game:370-398`), every
  card and every `.qz-svg` on Progress must end inside the viewport (`game:394-396`).
- **Run**: `#qz-runshell`, `#qz-q`, `#qz-vis`, `#qz-ans`, `.qz-ch[data-qzc]`, `.qz-key`, `.qz-fz`, `#qz-act`,
  `#qz-fb`, `#qz-count`, `#qz-clockfill`, `#qz-timefill`, `.qz-mu`, `.qz-earbtn` (`quiz:139-167,282-307`;
  `taps:18-41` taps keys and frets by their boxes and checks `#qz-act` is not under the tab bar).
- **Texts**: `#qz-cont` must read "Start" on a fresh profile (`game:108`); tiles must contain "XP earned" and "Time"
  (`game:125`); a note must contain "engaged minutes" (`game:126`); pills must read `Exercises|Chords|Circle|Plan`
  (`quiz:58`).
- The help tour points at `.qz-strip` and `.qz-hometabs` (`help.js:85-86`).

### 4.9 Re-skin

- **Stays**: every id, class and `data-` attribute above; the four views; the SVG builders' element classes; the
  one-handler click model.
- **Changes**: the CSS string is rewritten on tokens. Mapping to the Phase B list (`docs/DESIGN-SYSTEM.md:42-47`):
  `#qz-cont` and the other primaries become the primary pill; `.qz-backlink`, `.qz-learnbtn`, `.qz-quiet` become the
  ghost button; `.qz-topic`, `.qz-unit`, `.qz-npop`, `.qz-stage`, `.qz-done`, `.qz-pcard` become Card; `.qz-lvl` and
  `.qz-rec` become Row; `.qz-mchip` becomes Chip; the goal ring becomes the footer line's ring; `#xp-toast` becomes
  Toast; the three empty sentences become the Empty state. Not on the list and needed here: a tab or segmented
  control, an answer button, a stat tile, a progress bar, a table and a chart.
- **Risky**:
  1. Height on phones. `#qz-act` is 40 px and the choices 52 px today; a 48 px control height and any always-visible
     key bar push the action further below the fold, and move the panel's top across `reveal()`'s 45 % line.
  2. `reveal()` and `keepVisible()` (`:1271-1290`) hard-code the shell's selectors and the 45 % rule.
  3. The keyboard's four raw colours (`:2751,2754`); tokens exist for two of them (`--sl-key-white`,
     `--sl-key-black`, `tokens.css:52-53`).
  4. Chart labels use a halo in `var(--card)` (`:2851`) and a tooltip in `var(--text)` on `var(--card)` (`:2855`):
     both must follow the surface the chart sits on.
  5. The path's sideways shift and the 150 px label width (`:2786-2787,2797`) were tuned for 62-68 px discs; no suite
     checks the path for overflow.
  6. The key marks use teal and blue (`:2752`). Teal has no token; blue's value equals `--sl-info`
     (`tokens.css:39`). "The ONLY accent" rule (`docs/DESIGN-SYSTEM.md:31`) does not say what a second mark colour
     on a key may be.

---

## 5. Chords (`js/chords.js`, 1,414 lines)

**Built.** `buildDOM` writes two `.card` blocks (`chords.js:1074-1157`).

- Card 1 "Chord explorer": a `.chip` showing the key (`#ch-key-label`), a `.seg` Triads / 7ths, seven chord chips
  `.chip.ch-inkeychip` (`:1079-1086`); the chord name in condensed type with three `label.field` selects (Root,
  Chord, View), a primary "Strum" and a `.btn` "+ Progression" (`:1088-1100`); voicing chips (`:1102-1105`); the
  drawing; tone chips, formula and function lines; a chip and a `.btn.sm` "Practice it" (`:1110-1118`); a second
  keyboard wrap and a `.btn.sm` "Piano" (`:1122-1126`).
- Card 2 "Progression player": a preset select, palette chips, the progression as `button.ch-bar` tiles with a
  danger "Clear", a "now playing" box, then a BPM number field `#ch-bpm`, a select, a checkbox and a primary "Play"
  (`:1128-1157`).

**Drawings.**

- Neck: `renderBoard` builds an SVG with the DOM API, viewBox 590 × 244, five frets of 100 units (`:270-368`). Fills
  and strokes are attributes, a mix of `var(--panel)`, `var(--line)`, `var(--muted)` and raw colours (the nut
  `#cfd6e4` `:323`, the root ring `#ffffff` `:359`, the note name `#1c1206` `:364`). Dot colours come from
  `App.colors.forNote` (`:168,355-358`). CSS gives it `width:100%; min-width:540px; max-width:760px` (`:1009`).
- Keyboard: `renderPianoChord`, an SVG string, 15 white keys of 30 units (`:593-634`), keys coloured in CSS with raw
  colours (`:1005-1006`), dots coloured inline. Same 540-760 px rule when it is the main view (`:995`).
- Tab: a `<pre>` in a monospace stack at 22 px with inline note colours (`:486-508,997-999`).
- Notation: an SVG string 320 units wide with a treble clef taken from the system serif font and ellipse note heads
  (`:523-579`, clef at `:543-544`).
- A fourth drawing, the small chord diagram `renderShapeSVG` (`:175-257`), is never called; its five CSS rules
  (`:1026-1030`) serve only it.

**Chips.** Chord, tone and palette chips carry an inline custom property `--deg-c` and use it for the border and the
bold part (`:1015-1018,1021-1022,1032-1035`); a light-theme rule darkens the bold part by mixing with black
(`:1062-1063`).

**Seen at 1200** (`1200-dark/32-chords-playing-full.png`, `31-chords-piano-full.png`). 1.8 screens. The neck and the
keyboard stop at 760 px in a card whose inner width is 1,068 px, leaving the right third empty. Two primary buttons (Strum, Play). 36
of 39 controls are under 44 px (30 of them 34 px). The page has its own tempo field showing 90 while the shared tempo
is 120.

**Seen at 390** (`390-dark/32-chords-playing-full.png`). 2.4 to 2.5 screens. The neck is 540 px wide in a 332 px
scroller: frets 4 and 5 are off screen. The keyboard view is cut the same way; the notation box scrolls by 18 px.
"Strum" is at 628 px.

**Light** (`1200-light/32-chords-playing-fold.png`, `390-light/31-chords-piano-full.png`). Works. The pale nut and
the white root ring are hard to see on the pale neck.

**Suites.** Four names, `colors` only: `.ch-inkeychip` and `.ch-tonechip` are read through
`style.getPropertyValue('--deg-c')` (`colors:67,175,201-203`), and `#ch-ex-root` / `#ch-ex-quality` are set
(`colors:198`). Other suites only visit the page (`smoke:26`, `trim:64`, `context-global:7`, `nav:107`,
`practice:106-114`, `game:185,267,294`). The help tour has no selector here (`help.js:49-52`).

**Re-skin.** Stays: all `ch-` ids, the inline `--deg-c` on the chips. Changes: chips, segmented control, selects and
buttons become components; the two keyboards and the neck are candidates for the shared instrument hero. Risky:
the neck's attribute colours and the staff's (14 `var(--old)` strings outside the CSS block, section 2.2); the
540 px minimum widths; the page's own tempo and key (section 18, items 2 and 6), which collide with "the key bar is
always there" (`docs/DESIGN-SYSTEM.md:17-19`).

---

## 6. Circle (`js/theorytab.js`, 560 lines)

**Built.** `init` writes three `.card` blocks (`theorytab.js:406-452`).

- "Circle of fifths": a hint line, the circle, an `h3` "Circle practice" and a `.row.tight` with a primary button, a
  `.seg` of three buttons (two with arrow icons) and two `label.field` selects (`:408-427`).
- The key guide: an `h2` whose text is the key name (`:430`), three `h3` groups of chips (notes, chords, related
  keys as `.btn.sm`), then a `.btn` and a primary (`:431-440`).
- "Degree ear trainer": seven square buttons `.th-qbtn` 52 × 52 px with a 2 px degree-coloured border, a primary
  "Start", a hidden "Next note", a status text and a feedback line (`:443-451`, CSS `:386-391`).

**Drawing.** `renderCircle` builds an SVG string, viewBox 376 × 376: 24 wedge paths and 37 text elements, the centre
one in condensed type (`:77-118`). Everything is coloured by class from old variables (`:365-378`): outer ring
`--card2`, inner ring `--inset`, selected wedge `--accent`, text on the selected wedge `#221302` (`:374`). The SVG
scales to `max-width:400px` (`:362`).

**Seen at 1200** (`1200-dark/42-circle-quiz-answered-full.png`). 1.9 screens, three full-width cards, three primary
buttons. The circle is 400 px in the middle of a 1,114 px card. The first primary is at 822 px of 900.

**Seen at 390** (`390-dark/40-circle-full.png`). 2.5 screens. The circle is 332 px with 15 px labels. The practice
row breaks into four ragged lines (button, segmented control with one select, second select). The first primary is
at 799 px, under the tab bar.

**Light** (`1200-light/42-circle-quiz-answered-full.png`). Works; the two rings stay distinct. Chips with a yellow
degree border are faint on the white card.

**Suites.** One name: `.th-note` read through `--deg-c` (`colors:65,175`). Other suites only visit the page. No tour
selector (`help.js:90-92`).

**Re-skin.** Stays: the ids, `data-th-maj` / `data-th-min` on the wedges, the inline `--deg-c`. Changes: cards,
chips, the segmented control, selects, the seven answer squares. Risky: little. The circle is the page's natural
hero and is already class-coloured; the only raw colours are three text-on-colour literals (`:374,390,402`).

---

## 7. Plan (`js/practiceplan.js`, 365 lines) with Free practice (`js/trainer.js`, 533 lines)

**Built.** `init` writes one `.pp-wrap` and, after it, a `<details class="pp-tools" id="pp-tools">`
(`practiceplan.js:306-311`).

- Inside `.pp-wrap`: a heading block with a kicker, an `<h1>` "Practice plan" and a `.btn.sm` "Lights & help"; a
  `.pp-profile.card` with a student select, a name input and a button; `#pp-today.card`; `#pp-week.card`; a
  `<details class="card pp-notes">` with a disabled instrument select, a link field, a textarea, a primary "Review
  mapping" and a native file input; `#pp-gaps.card`; a status line `#pp-status` (`:306`).
- `paintProgress` fills `#pp-today` with an ordered list of `li.pp-block`: a 32 px numbered circle (a tick when
  done), a kicker, an `h3`, source and evidence lines, and one `.btn` per block, primary only for the next one
  (`:282-286`); `#pp-week` with seven small tiles (`:289-292`); `#pp-gaps` with a list (`:293`). It runs every three
  seconds while the page is shown (`:359`) and swaps a region only when its HTML changed (`replaceRegion`,
  `:269-278`).
- Free practice: `trainer.js` mounts a `.grid2` of four shared `.card` blocks into `#pp-tools-body`: session log,
  random prompts, one-minute chord changes, and a pointer to Exercises (`trainer.js:324-395`). It uses the shared
  classes only (`label.field`, `.mid-display`, `.big-display`, `.chip`, `.list`, `.btn`) plus 747 characters of its
  own CSS (`:305-317`).

**CSS.** 2,644 characters (`practiceplan.js:346-353`). Two things stand out. First, form controls are styled by
element selectors scoped to the wrapper: `.pp-wrap input, .pp-wrap select, .pp-wrap textarea` get the `--inset`
background, an 8 px radius, 10 px padding and full width (`:346`), so they look different from every other select in
the app (45 px high against 34; no chevron in the dark theme, section 18 item 4). That rule is why the Free practice
section sits outside the wrapper (`:307-310`, `PLAN.md:1247`). Second, the block titles are `h3` inside a `.card`,
so they take the shared small-caps style (`style.css:511-518`) at 19 px (`practiceplan.js:346`): measured 19 px,
uppercase, muted, 1.8 px letter spacing.

**Seen at 1200** (`1200-dark/53-plan-free-practice-full.png`, `1200-light/52-plan-accepted-full.png`). 2.2 screens
closed, 3.5 with Free practice open. The page title is the only `h1` in these pages, 38 px in the body face, while
the card under it has a Bebas `h2` with the amber dot. The first "Start" is at 671 px, after the Learn bar, the
title and the student card. With Free practice open there are five primary buttons and nine cards.

**Seen at 390** (`390-dark/53-plan-free-practice-full.png`, and a first take of `50-plan-fold.png`). 3.3 screens closed, 5.3
open. The student card (select, input, button) fills the first screen; the first "Start" is at 1,025 px. The
blocks' buttons drop under their text (`:346`, the 600 px rule). The week tiles are about 45 px wide with 11 px text.

**Light.** Works. The inputs are a darker beige than the cards; the native file input shows the browser's "Choose
File" button.

**Suites.** Plan: 21 names in `practiceplan` (69 references), `remote-plan` (15), `remote-runners` (5),
`storage-import` (2), `trim` (2). Free practice: 17 names in `practiceplan` (23), `remote-runners` (23), `trim` (9).
The structural checks: `#pp-tools` must be a `<details>` after `.pp-wrap`, not inside it and not a `.card`, closed
by default, with three separate `.card` blocks in `#pp-tools-body` (`practiceplan:66-78`); `#tr-cc-a` and `#tr-cc-b`
must share a row and `#tr-cc-a` must keep the shared select's 13 px left padding (`practiceplan:81-89`); at 390 px
`#pp-today`, `#pp-notes` and the open `#pp-tools` must be at most 390 px wide (`practiceplan:389-403`); at 360 px
the four Learn pills must sit on one row (`practiceplan:404-415`). The help tour points at `#pp-today`, `#pp-gaps`
and `#pp-tools` (`help.js:27-29`).

**Re-skin.** Stays: the ids, `data-pp-open`, the `<details>` placement, the three-second repaint. Changes: the block
list is the design system's "Row (plan block with check state)" (`docs/DESIGN-SYSTEM.md:45`) almost as it is; the
form controls should stop being a local look; the `h1` becomes the page's one headline. Risky: the element-selector
rule at `:346` restyles any shared component placed inside `.pp-wrap`; the `practiceplan:89` padding check is the
guard against that for the cards, and nothing guards the Plan's own controls. Deferred by the Phase A plan and not
to be built in B: the chord changes as an Exercises drill and the prompts as lesson content (Phase C), the session
log joining streak and goal and prompts as plan blocks (Phase D) (`PLAN.md:1200-1201`).

---

## 8. Woodshed (`js/woodshed.js`, 1,609 lines)

The page has five views: library, session, calibration, report, and the guided performance player (section 9).

### 8.1 Library

**Built.** `renderLib` writes one long HTML string (`woodshed.js:1143-1201`): a `.card` with the heading
"Woodshed · <instrument id>" and a status line (`:1148-1151`), a second `.card` nested inside it for "Guided
performance" with a primary and a `.btn` (`:1152-1155`), six `.btn.sm` (one of them a `<label>` wrapping a hidden
file input, `:1160`), a hidden paste box; the host `#ws-progress` for Practice progress (`:1171,1200`); a "Weak
spots" card when there are any (`:1172-1174`); a "Rudiments" card with 40 chips in four `h3` groups (`:1176-1182`);
and "Shared source library", one `.row.spread.ws-row` per score with seven `.btn.sm`, two of them primary
(`:1183-1197`).

**Borrowed classes.** The rudiment and weak-spot chips and two session chips use `chip fb-chip`
(`:1173,1179,1219,1221`); `.fb-chip` is defined by the Fretboard's CSS (`fretboard.js:1761`). The calibration
counter uses `.jam-now` (`:1273`), defined by Jam's CSS (`jam.js:994`).

**Seen at 1200** (`1200-dark/60-shed-lib-full.png`). 3.3 screens. Order: guided performance, Practice progress (796
px tall on a fresh profile, about 1,470 px with eight recorded days), 40 rudiment chips, and the user's own scores
last: at 1,990 px on a fresh profile and at about 2,600 px with the history. Five primary buttons with two scores
(two per row). Of the 67 controls, 64 are 34 px high, two are 40 px and one is 23 px.

**Seen at 390** (`390-dark/60-shed-lib-full.png`, `el-shed-lib-rows.png`). 5.1 screens. The user's scores start at
3,310 px on a fresh profile and at about 3,900 px with the history. Each score's seven buttons wrap to two lines. The heading reads "WOODSHED · PIANO": the raw
instrument id, upper-cased by the card heading style (`:1148`).

### 8.2 Session, report, calibration

- **Session** (`renderSession`, `:1203-1258`): one `.card` with an icon-only back button, title, a `.seg` of three
  or five display names, up to two chips, a primary `.btn.sm`, a HUD line and a `<canvas id="ws-cv" width="1100"
  height="360">` styled inline to 100 % width (`:1227`).
- **Canvas.** `draw()` sizes the bitmap to the canvas's CSS width and a height of `clamp(220, 0.36 × width, 360)`
  (`:855-861`), reads four old variables from the root element every frame (`:863-867`) and draws one of four
  displays (`:878-882`): falling blocks with a key strip (`drawHighway`, `:891-933`), a sideways roll (`drawScroll`,
  `:935-953`), six tab lines (`drawTab`, `:964-994`) or five staff lines with ellipse notes and no clef
  (`drawSheet`, `:997-1042`). Judged notes take one of four colours from a table with a dark and a light set
  (`noteColor`, `:833-840`); unjudged notes are drawn in the text colour. Text in the canvas is `sans-serif`
  (`:911,928,984`), not the app's faces.
- **HUD** (`paintHud`, `:1113-1127`): a combo count in condensed type and four judgement counts whose colours are
  set inline from the same table.
- **Report** (`renderReport`, `:1276-1342`): a `.card` whose `h2` is five star characters (bright and dimmed by
  inline opacity) and a percentage; a line of numbers; a coaching sentence; one bar per phrase as inline-styled
  `div`s with three raw colours (`:1288-1290`); a primary "Again" and a `.btn` "Library".
- **Calibration** (`renderCal`, `:1268-1274`): a `.card` with a sentence and a counter. It has no button; it ends by
  itself 6.2 s after it starts (`:1058`).
- **Toast.** Achievements and messages use the page's own fixed element `#ws-flash` (`:1104-1111,1551-1558`).

**Seen** (`1200-dark/63-shed-session-highway-fold.png`, `63-shed-session-sheet-fold.png`,
`1200-light/63-shed-session-highway-fold.png`, `390-dark/63-shed-session-highway-fold.png`,
`390-dark/64-shed-report-fold.png`). The session is one screen at both widths; at 390 the segmented control takes a
full row (`:1546`). Notes are white (dark theme) or near-black (light theme) blocks, not degree colours. The canvas
starts 110 px high at 390 px and jumps to 222 px on its first frame (the `width`/`height` attributes give the first
box; measured 332 × 110, then 332 × 222). The report's stars are white, where Exercises' are amber. The report's
status line reads "Legacy / unassigned: Level 1 · 0 XP · …" (`:1136-1141`). A toast with a trophy emoji appeared
(`:433`); the report line can carry a fire emoji (`:1329`). These are the only emoji I found in the ten files.

**Suites.** 13 names: `remote-shed` 14 references, `practice-progress-ui` 7, `performance` 5, `lumidisplay` 3,
`trim` 1. They use `#ws-lib [data-wsid]` rows found by the text of their `<b>` (`remote-shed:63`), `[data-wsplay]`
(`remote-shed:64`, `lumidisplay:155`), `#ws-back`, `#ws-again`, `#ws-tolib`, `#ws-go`, `#ws-cal-btn`,
`#ws-gen-scale`, `#ws-guided-melody`, `#ws-guided-chords`, `#ws-progress`. `quiz.js:2460` scrolls to `#ws-progress`.

**Re-skin.** Stays: the ids and `data-ws*` attributes. Changes: the 24 inline styles become classes; the nested
card, the chip groups, the rows and the report become components; `#ws-flash` becomes Toast. Risky:

1. The canvas reads `--text`, `--muted`, `--card`, `--accent` by name (`:864-867`). If the tokens replace those
   names, the canvas silently falls back to the dark defaults at `:831` in both themes.
2. The judgement colours (eight literals, `:835-839`) have no token; `--sl-ok`, `--sl-warn`, `--sl-bad` cover three
   of four meanings at most.
3. The report's phrase bars use the dark set in both themes (`:1289`).
4. The canvas is not an "instrument hero sharing one lighting model" (`docs/DESIGN-SYSTEM.md:46-47`): it has its
   own key strip, its own staff and no degree colours. Changing that is drawing work, not styling.
5. `.fb-chip` and `.jam-now` come from two other pages' CSS.

---

## 9. Guided performance player (`js/performance-player.js`, 423 lines)

**Built.** `build()` writes the whole player as one string (`performance-player.js:330-337`): a `.card` with a text
back button ("← Library", a typed arrow), an `h2` with the score title and a status word; a row of five labelled
controls (instrument, mode, tempo, count-in, transpose); four transport buttons; a `<details>` "Section and input"
holding eleven more controls and a hidden audio panel with a nested `<details>` of seven number fields; the current
note in large type (`#pf-current`); a feedback line; a `<canvas id="pf-roll">`; an "upcoming" list; a native
`<progress>`; a statistics line; a labelled octave select; a 25-key strip of `<button class="pf-key">`; four status
lines; another `<details>`; and a second `.card` `#pf-report` for the result (`:318-326`). 56 buttons, selects and
inputs in all, 25 of them the keys (counted in the DOM).

**Drawings.** The roll is a canvas 210 px high, sized to its CSS width (`drawRoll`, `:234-271`). Grid and labels
use `--text` and `--muted` read by name (`:239`); notes are filled with `App.colors.forPitch` (`:15,260`); the
playhead is `#e55766` (`:266`); text is `sans-serif` 11 and 12 px (`:250,254,264,267`). The key strip is built from
buttons (`keyboard()`, `:272-277`) coloured by raw values, ivory `#f4f1eb`, black `#25212a`, border `#666`, wrong
`#e64961`, with a pitch-coloured top edge from an inline `--pf-pitch` (`:328`).

**CSS.** One line of 2,120 characters (`:328`). Labels sit left of their controls in 13 px sentence case
(`.pf-controls label`), unlike the shared `label.field`. Three bare `<details>` use the browser's default marker.

**Seen at 1200** (`1200-dark/67-perf-running-full.png`, `68-perf-section-input-open-full.png`,
`69-perf-report-full.png`). 1.5 screens idle, 1.9 with the report. The current note, the roll and the keys are below
ten controls; the key strip is at 895 px, at the bottom edge of a 900 px window. After a finished run two primary
buttons show ("Start" and "Play again") and the large line reads "Ready for your next performance". The progress bar
is the browser's blue.

**Seen at 390** (`390-dark/67-perf-running-full.png`). 1.9 screens. The settings and transport come first; the roll
starts at 682 px. The key
strip is 725 px wide in a 340 px box and shows C3 to B3; the box is a horizontal scroller with `touch-action:none`
on itself and on every key (`:328`), and the keys are 29 px wide. I did not try a finger on it.

**Light** (`1200-light/67-perf-running-full.png`). Works; upcoming notes at 60 % opacity look washed out.

**Suites.** 36 names in 10 suites: `performance` 38 references, `instrument-session` 29, `practice-audio` 26,
`performance-safety` 24, `remote-shed` 15, `performance-progress` 15, `practice-progress-ui` 12, `practice` 6,
`synthtab` 1, `instrument-xp` 1. They drive real controls by id (`#pf-start`, `#pf-pause`, `#pf-stop`,
`#pf-restart`, `#pf-mode`, `#pf-tempo`, `#pf-countin`, `#pf-instrument`, `#pf-input-kind`, `#pf-loop`, …), read
`#pf-current`, `#pf-feedback`, `#pf-upcoming`, `#pf-report` and the roll's `aria-label` (`performance-safety:180`),
count `.pf-target` keys (`performance-safety:181`), press `[data-pf-note]` with pointer events
(`performance:60`), and require no sideways overflow at 390 px with at least 13 keys (`performance:188-194`).

**Re-skin.** Stays: all `pf-` ids, `data-pf-note`, the `.pf-target` / `.pf-held` / `.pf-hit` / `.pf-wrong` state
classes, native `<select>` and `<input>` elements (the suites set `.value` and fire `change`). Changes: the control
block is the clearest case for "everything else is behind a sheet" (`docs/DESIGN-SYSTEM.md:10-13`); the key strip is
a second keyboard hero. Risky: the canvas variable names (`:239`); six raw colours in the one-line CSS; the key
strip's width on phones; `performance:192-194` wants at least 13 keys at 390 px, so the strip cannot simply shrink
to one octave.

---

## 10. Practice progress (`js/practice-progress-ui.js`, 194 lines)

**Built.** `mount()` writes one `section.card.pgu` into the Woodshed's `#ws-progress`
(`practice-progress-ui.js:55-69`, mounted at `woodshed.js:1200`): a heading with an instrument select, eight stat
cells in a `<dl>` (`card()`, `:78,116-123`), a native `<progress>` for today's goal (`:126`), three range buttons,
a chart, a table, and a `<details>` with twelve number or text fields, a checkbox, two buttons and a vacation block
with two native date inputs (`:61-68`).

**Chart.** An SVG string with a fixed viewBox of 760 × 190 (`:82`), scaled to the container by CSS
(`.pgu-chart svg{width:100%;height:auto;min-height:140px;max-height:250px}`, `:39`). One `<rect>` per observed day
filled `var(--accent,#e6a84b)` (`:90`), text in `currentColor` at font-size 11 (`:92,96`). Measured: at 1200 the SVG
is 1,068 px wide, scale 1.4, text about 15 px; at 390 it is 332 px wide, scale 0.44, text 5 to 6 px high
(`390-dark/el-pgu-chart.png`).

**Other components.** The range buttons are three `.btn.sm` with `aria-pressed`, the pressed one filled with the
accent (`:59,39`), not the shared `.seg`. The table has `min-width:700px` inside a scroller (`:39`), so on a phone
it scrolls sideways (700 in 332). The date inputs are not covered by the shared input rule (`style.css:656`, number
and text only) and render 22 px high with the browser's look. The focus ring is this module's own: a 3 px outline
with 3 px offset (`:39`), against the app's 2 px (`style.css:694`).

**Suites.** `practice-progress-ui` only (31 references through four `data-pgu*` attributes). It pins the stat cells
by `[data-pgu-stat="…"] dd` text (`:55-63`), the number of `svg rect` elements equal to the number of observed days
and the text of `svg desc` (`:68-73`), `caption` and `tbody tr` (`:68-70`), `[aria-pressed="true"]` on the range
button (`:71`), the `<progress>` with a matching `<label for>` (`:173-174`), no overflow at 390 px (`:171`), and that
no button's text contains "reset" or "import" (`:175`).

**Re-skin.** Stays: the `data-pgu*` attributes, one `rect` per observed day, `desc`, the `<progress>` and its label,
`aria-pressed`. Changes: stat cells, range control, table, form fields. Risky: replacing this chart with the
Exercises chart code as it is would break `:72`, because that code draws bars as `path` and adds a `rect` per
column for hover (`quiz.js:2144,2150`).

---

## 11. Tuner (`js/tuner.js`, 731 lines)

**Built.** `markup()` returns a `.grid2` of two `.card` blocks (`tuner.js:139-192`).

- "Tuner": a row with a primary "Start listening", a number field and a select under `label.field`; an error box; a
  78 px Bebas note name (`.big-display`); a frequency line; the gauge; six string chips; a hint.
- "Note finder game": a dashed hint box, a 23 px target line, three `.btn.sm` (one danger), two small-caps counters
  with 40 px numbers, six checkboxes, two number fields and a checkbox.

**Drawing.** `gaugeSVG` (`:120-137`): viewBox 320 × 92, five ticks, a track, an in-tune zone, a needle and a cents
text, all coloured by attributes with old variables and one raw `rgba` (`:125-135`). While listening, JS moves the
needle by a transform and sets the needle's stroke and the text's fill to `var(--green)`, `var(--red)`,
`var(--accent)` or `var(--muted)` (`:207-210,233-264`), and sets the note name's colour inline (`:250`).

**Seen** (`1200-dark/70-tuner-full.png`, `390-dark/70-tuner-full.png`, `390-light/71-tuner-listening-fold.png`). One
screen at 1200 with two equal cards; 1.6 screens at 390. The big note name is a dash until a pitch is heard. The
game card is about guitar strings and frets whatever the Learn instrument is. One primary; it turns into a red
outline "Stop listening".

**Suites.** No `tun-` selector in any suite. The page is visited by `smoke:26`, `trim:65`, `context-global:7`,
`nav:52` and as a Plan block (`remote-plan:280`).

**Re-skin.** Stays: the ids (other modules do not reference them; I found none outside `tuner.js`). Changes: cards,
chips, buttons, fields. Risky: 16 `var(--old)` strings outside the CSS block, six of them written while listening
(section 2.2). Free to restructure: nothing pins the layout.

---

## 12. The same thing built several times

| Thing | Versions on these pages |
|---|---|
| Piano keyboard | 4: Exercises SVG, 26 px keys, ivory `#f7f3ea` (`quiz.js:823-841,2751`); Chords SVG, 30 px keys, same ivory (`chords.js:593-634,1005-1006`); performance player buttons, ivory `#f4f1eb`, black `#25212a` (`performance-player.js:272-277,328`); Woodshed canvas strip in grey `rgba` (`woodshed.js:917-925`). The Piano page and the chart maker have their own (outside this map). |
| Guitar neck | 3: Exercises SVG string (`quiz.js:843-875`); Chords SVG by DOM API (`chords.js:270-368`); Chords small diagram, dead (`chords.js:175-257`). |
| Staff | 3: Exercises with the music font (`quiz.js:770-821`); Chords with a system serif clef and ellipses (`chords.js:523-579`); Woodshed canvas without a clef (`woodshed.js:997-1042`). |
| Chart | 3: Exercises, drawn at pixel width (`quiz.js:2127-2195`); Practice progress, fixed viewBox scaled by CSS (`practice-progress-ui.js:79-97`); Woodshed report bars as `div`s (`woodshed.js:1288-1290`). |
| Stat tile | 4: `.qz-tile` (`quiz.js:2024-2027,2822-2824`); `.pgu-stat` in a `<dl>` (`practice-progress-ui.js:78`); `.pf-results div` in a `<dl>` (`performance-player.js:322,328`); `.pp-week > div` (`practiceplan.js:291,346`). |
| Progress bar | 7: five in Exercises (section 4.7) and two native `<progress>` (`practice-progress-ui.js:126`, `performance-player.js:335`). |
| Segmented control | The shared `.seg` on Exercises, Chords, Circle, Woodshed; three `.btn.sm` with `aria-pressed` on Practice progress (`practice-progress-ui.js:59`). |
| Chip, one class in four roles | A label (`#ch-key-label`, `#tr-cc-best`), an on/off switch (`.qz-mchip`, `#ws-guide`), an action (chord chips, 40 rudiments, string chips), a fact (`.th-note`, `.ch-tonechip`). |
| Disclosure | 5 looks: `details.tips` (`style.css:531-557`); `.qz-nlearn` and `.qz-tbl` (`quiz.js:2846,2857`); the Plan's (`practiceplan.js:346,353`); `.pgu-settings` (`practice-progress-ui.js:39`); three bare `<details>` in the player. |
| Field label | 6: `label.field`, caps above (`style.css:633-642`); `.ch-field`, a copy of it (`chords.js:1024-1025`); the Plan's sentence case above (`practiceplan.js:346`); `.pf-controls label`, left of the control (`performance-player.js:328`); `.pgu-field` (`practice-progress-ui.js:39`); `.learn-inst-lbl` (`learn-instruments.js:44`). |
| Back | 3: text link with a left-arrow icon (`quiz.js:1347,1410`); icon-only `.btn.sm` (`woodshed.js:1208`); `.btn.sm` with a typed "←" (`performance-player.js:330`). |
| Page title | Bebas `h2` with a dot in a card (Chords, Circle, Woodshed, Tuner); a 38 px body-face `h1` outside a card (Plan); none (Exercises). |
| Toast | 3: `#xp-toast` (`quiz.js:2887-2895`); `#ws-flash` (`woodshed.js:1551-1558`); `App.toast` (`trainer.js:470`). |
| Instrument select | 4: the Learn bar (`learn-instruments.js:48`); the Plan's disabled copy (`practiceplan.js:306`); Practice progress, with its own stored choice (`practice-progress-ui.js:50,57`); the player (`performance-player.js:331`). The Woodshed shows the choice as text only (`woodshed.js:1148`). |
| Tempo field | The context bar; Chords' own `#ch-bpm` (`chords.js:1149`); the player's `#pf-tempo` for the score (`performance-player.js:331`). |
| Stars | Amber, 28 px (`quiz.js:2737`); white, in an `h2` (`woodshed.js:1325`). |

---

## 13. Measured: length, controls, tap sizes

From `measure-*.json` (dark; light is identical). "Screens" is document height divided by the viewport height.
"< 44" counts visible buttons, selects, inputs, links and summaries under 44 px high, out of all.

| View | 1200: screens | cards | primary | < 44 | 390: screens | < 44 | first primary at (390) |
|---|---|---|---|---|---|---|---|
| Exercises, path | 8.97 | 1 | 1 | 5 / 65 | 9.41 | 5 / 65 | 484 px |
| Exercises, path with a step open | 9.76 | 2 | 2 | 14 / 77 | 10.36 | 14 / 77 | 484 px |
| Exercises, topics | 1.04 | 1 | 1 | 5 / 13 | 1.86 | 5 / 13 | 484 px |
| Exercises, one topic | 1.03 | 3 | 0 | 8 / 16 | 1.24 | 8 / 16 | none |
| Exercises, progress | 3.29 | 10 | 1 | 11 / 14 | 4.13 | 11 / 14 | 484 px |
| Exercises, question (choices) | 1.13 | 1 | 0 | 6 / 15 | 1.45 | 6 / 15 | none; `#qz-act` 974 px |
| Exercises, result | 1.04 | 1 | 1 | 7 / 9 | 1.24 | 7 / 9 | 703 px |
| Chords | 1.78 | 2 | 2 | 36 / 39 | 2.38 | 36 / 39 | 628 px |
| Circle | 1.90 | 3 | 3 | 20 / 29 | 2.50 | 20 / 29 | 799 px |
| Plan | 2.23 | 5 | 1 | 12 / 16 | 3.28 | 11 / 16 | 1,025 px |
| Plan, Free practice open | 3.48 | 9 | 5 | 24 / 29 | 5.29 | 23 / 29 | 1,052 px |
| Woodshed library (2 scores, with history) | 3.27 | 5 | 5 | 67 / 67 | 5.14 | 67 / 67 | 401 px |
| Woodshed session | 1.00 | 1 | 1 | 6 / 6 | 1.00 | 6 / 6 | 226 px |
| Performance player | 1.47 | 1 | 1 | 13 / 38 | 1.94 | 13 / 38 | 400 px |
| Performance player with report | 1.93 | 2 | 2 | 14 / 39 | 3.03 | 14 / 39 | 400 px |
| Tuner | 1.00 | 2 | 1 | 14 / 21 | 1.58 | 14 / 21 | 194 px |

The visible area at 390 × 844 ends at 780 px (bottom tab bar). So on a phone the first primary button is out of
sight on Circle and on the Plan.

Control heights, measured (`work-pages-learn/probe.json` and the run of `probe2.js`): `.btn` 40 px; `.btn.sm`,
`.chip`, `.seg` and selects 34 px with a mouse and 38 px with touch (`style.css:64,109,627,662,749`); segmented
buttons 28 / 32 px; `#qz-cont` 46 px; Learn bar entries 47 px; answers 52 px; Circle answer squares 52 px; the
Plan's fields 45 px and its block buttons 40 / 42 px (`practiceplan.js:346`); text back links 29 px; the round hear
button 34 px; `#tr-cc-count` 68 px; native date inputs 22 px. The token is 44 px, 48 px with touch
(`tokens.css:92,141`).

Horizontal scrollers that really scroll at 390 px: `#ch-board` 540 in 332, `#ch-pnwrap` 540 in 332, `#ch-sheetwrap`
348 in 330, `.pgu-table-wrap` 700 in 332, `#pf-keyboard` 725 in 340. None at 1200 px.

---

## 14. Light theme

- Every one of the 54 views renders in light with the same boxes as in dark.
- Light-only rules in these modules: one in Exercises (`quiz.js:2774`), one in Chords (`chords.js:1062-1063`), three
  in Circle (`theorytab.js:399-402`). All five exist because a bright colour is used as text on a pale card.
- Not theme-aware, read from the code: the Woodshed report's phrase bars (`woodshed.js:1289`); the Chords nut,
  root rings and note-name ink (`chords.js:212,221,323,359,364`); the three keyboards' ivory and black (which may be
  intended: a keyboard is ivory in both themes; `tokens.css:131-132` re-inks `--sl-key-white` and `--sl-key-black`
  for light); the player's playhead and wrong-key red (`performance-player.js:266,328`); the Tuner's in-tune zone
  (`tuner.js:130`).
- Seen: degree-coloured chip borders (yellow, pale green) are faint on white; the Chords nut and the white root
  ring nearly vanish on the pale neck; the player's upcoming notes look washed out; the Plan's inputs are a darker
  beige than their card. I did not measure any contrast ratio.
- The Woodshed canvas handles light by a second colour table chosen from `data-theme` (`woodshed.js:832-840`), not
  by variables.

---

## 15. What the suites pin

| Page | Names in suites | Suites (references) | What kind |
|---|---|---|---|
| Exercises | 101 | game 144, quiz 79, remote-quiz 35, practice 24, learn-instruments 19, taps 5, lumi-contexts 4, keys 3, lights 2, quiz-correction 2, smoke 1 | ids, classes, `data-qz*`, a few texts, phone tap geometry, chart parts |
| Performance player | 36 | performance 38, instrument-session 29, practice-audio 26, performance-safety 24, remote-shed 15, performance-progress 15, practice-progress-ui 12, practice 6, synthtab 1, instrument-xp 1 | ids of real form controls, state classes, key count, no overflow at 390 |
| Plan | 21 | practiceplan 69, remote-plan 15, remote-runners 5, storage-import 2, trim 2 | ids, `data-pp-open`, DOM order of `#pp-tools`, widths at 390 and 360 |
| Free practice | 17 | practiceplan 23, remote-runners 23, trim 9 | ids, one row, one padding value; five of the names are checked to be absent (`trim:94`) |
| Woodshed | 13 | remote-shed 14, practice-progress-ui 7, performance 5, lumidisplay 3, trim 1 | ids, `data-ws*`, a row found by its `<b>` text |
| Learn bar | 6 | learn-instruments 23 | ids, visibility per page, a visible stop button, fit at 390 |
| Chords | 4 | colors 6 | inline `--deg-c`, two selects |
| Practice progress | 4 attributes | practice-progress-ui 31 | `data-pgu*`, `svg rect` count, `desc`, `caption`, `aria-pressed`, `<progress>` with a label |
| Circle | 1 | colors 2 | inline `--deg-c` |
| Tuner | 0 | visited by smoke, trim, context-global, nav, remote-plan | nothing but "the page opens" |

What this means for a re-skin.

- **Free to change**: colours, radii, shadows, type, spacing, card and row looks, and the whole layout of Chords,
  Circle and Tuner.
- **Fixed**: the names above; native `<select>`, `<input>` and `<progress>` where a suite sets or reads them
  (`#learn-instrument`, `#pp-student`, `#pp-notes`, every `#pf-*` control, `[data-pgu="instrument"]`); `<details>`
  for `#pp-tools`; one SVG per Exercises chart with `.qz-hit` and `.qz-goalline`.
- **Checked by geometry**: nothing may be wider than the viewport at 390 px on Exercises Progress, the Plan, the
  Learn bar, Practice progress and the player; six Exercises controls must be tappable at their centre at 390 px;
  the four Learn pills must fit one row at 360 px.
- **Texts in checks** are few: "Start" on `#qz-cont`, "XP earned", "Time", "engaged minutes", the pill labels, the
  Learn bar's notes for Drums (`learn-instruments:54`), and several sentences in Practice progress
  (`practice-progress-ui:63,80`).
- Other code that reaches into these pages: the help tours (`help.js:27-29,84-86`) and `quiz.js:2460`
  (`#ws-progress`). I found no other reference from outside the owning file.

---

## 16. Against the five principles (`docs/DESIGN-SYSTEM.md:10-23`)

| Principle | Where these pages stand |
|---|---|
| One thing on screen: the next step and a Start button; plan, streak and goal are one quiet footer line | Exercises has the next step and a Start button (`#qz-cont`), but inside a stats card, above a 57-step path, under the Learn bar. The Plan's next step is its fourth block of content. Chords, Circle, Woodshed library and the player open with 2 to 5 primary buttons or none (section 13). Streak and goal are a card at the top (`quiz.js:1893-1907`), not a footer line. |
| The instrument is the hero | No page gives its instrument the width. Largest drawings at 1200 px, against the width of their card: Chords neck 760 of 1,114; Circle 400 of 1,114; Exercises keyboard 364 of 880; Exercises neck 238 of 880. Three are cropped on a phone (headline 7). |
| The key bar is always there | Chords keeps a key of its own when the shared scale has no chords, and a tempo of its own (section 18, items 2 and 6). The Circle is itself a key picker (`theorytab.js:53-59`). The Plan sets key and tempo when a block starts (`practiceplan.js:192-193`). |
| Plain words | Not audited. Words I saw on screen that a learner may not follow: "Consistency level", "engaged minutes", "canonical instrument history, counted once", "Legacy / unassigned", "Credit category", "Shared source library", "Raw input is scored before Scale Lock". Several are pinned by suites (section 15). |
| Four instruments, one kit | The Tuner's game, the Chords neck and the Circle's "Practice this scale" are guitar-only (`tuner.js:52`, `chords.js:331`); Exercises changes its content per instrument (57, 44 or 6 steps). This is Phase B0's subject, not B's. |

---

## 17. What "re-skin with the Phase B components" means here

One table, by page. "Markup stays" means the HTML strings keep their structure and names and only the CSS block is
rewritten on tokens.

| Page | Markup stays? | Must change | Risk level and why |
|---|---|---|---|
| Learn bar | Yes | Its box and controls; its height on phones | Low for code, high for layout: it is above every Learn page |
| Exercises home, topics, result | Yes | 21,809 characters of CSS; seven dead rules can go | Medium: 101 pinned names; phone tap checks |
| Exercises run | Yes | Heights and spacing under a taller header | High: the action button is already off screen at 390; `reveal()` / `keepVisible()` read the shell |
| Exercises charts | Yes | Variable names only (colours are by class) | Low, if `.qz-hit`, `.qz-goalline`, `.qz-tip` stay |
| Chords | Mostly | 14 attribute colours in JS; 540 px minimums; own tempo field | Medium: drawing code holds colours; almost nothing is pinned |
| Circle | Yes | CSS only | Low |
| Plan | Yes | The local form look; the `h1`; block rows | Medium: element-selector rule; `<details>` order pinned |
| Free practice | Yes | Nearly nothing: it already uses shared classes | Low |
| Woodshed library | No: 24 inline styles, a nested card, borrowed classes | Markup strings | Medium: long string, few pinned names |
| Woodshed session and report | Markup yes, canvas no | Canvas variable names, judgement colours, report bars | High: a missed name fails silently |
| Performance player | Yes for names; the layout wants a sheet | One-line CSS; canvas names; key strip | High: 36 names in 10 suites; 56 controls |
| Practice progress | Yes | Chart scaling, range control, table, fields | Medium: the chart's `rect` count is pinned |
| Tuner | Either | 16 attribute and inline colours | Low: nothing pinned |

Three things cut across the pages and are cheaper done once than ten times:

1. **A list of every old variable name read outside a CSS block** (section 2.2) so that the step which retires an
   old variable also changes these 34 strings and the two canvases.
2. **One decision on control height** before any page is touched, because it changes every row's wrap point.
3. **One place for the missing tokens** these pages need: a sunken surface, text on a degree colour, four judgement
   colours, pressed-key colours, a second key-mark colour.

---

## 18. Found while mapping

1. **Playwright's full-page capture switches touch emulation off.** After `page.screenshot({fullPage:true})` in a
   context with `hasTouch` and `isMobile`, `matchMedia('(pointer: coarse)')` no longer matches for the rest of the
   page's life (measured in this Chromium build; `--h-ctl` went from 38 px back to 34 px and Exercises showed its
   mouse-only number hints). A plain viewport resize does not do this. My phone pictures were re-taken with a tall
   viewport instead (`work-pages-learn/shots.js`). Any Phase B suite or review that takes full-page pictures of the
   phone layout and then measures will measure the mouse layout.
2. **Chords paints the "I" chord in the wrong colour on a fresh profile.** The app's default key is A minor
   pentatonic (`theorytab.js:38,43` read the same defaults). Chords only follows 7-note scales
   (`chords.js:1375-1377`) and otherwise keeps its own key, C major by default (`:128-130`). Its colours come from
   `App.colors`, which counts intervals from the shared root (`app.js:1328`). Measured on a fresh profile: the label
   reads "C Major (Ionian)", the "I C" chip is `#baf94f`, and degree 1 is `#ffaa2e`. After the shared key was set
   to C major the chip was `#ffaa2e`.
3. **XP is printed unrounded.** The stats strip shows "Lifetime: 167.367 XP" (`quiz.js:1898`, `toLocaleString()`
   with its default of up to three decimals), a Progress tile shows "0.266928 earned today" (`:2089`, the raw
   number), and the chart's value label and tooltip show "0.266891 XP" (`:2230`, the raw number); on a phone that
   label reaches the card's edge. XP comes from seconds of
   practice, so fractions are normal.
4. **The Plan's selects have no arrow in the dark theme and have one in the light theme.** `.pp-wrap select` sets
   the `background` shorthand (`practiceplan.js:346`), which removes the shared chevron image (`style.css:677`); the
   light theme's more specific rule puts it back (`style.css:116-121`). Measured: `background-image: none` in dark,
   the data URL in light.
5. **The Practice progress chart is unreadable on a phone**: axis text 5 to 6 px high at 390 px (section 10).
6. **Chords has a second tempo.** `#ch-bpm` is stored as `ch.bpm`, default 90, and never reads or writes the shared
   tempo (`chords.js:132,1149,1323-1326`). `CLAUDE.md:1993` says pages must not grow their own copies of the context
   bar's controls.
7. **Dead code**: `renderShapeSVG` and five CSS rules in Chords (`chords.js:175-257,1026-1030`); seven class rules
   and one unreachable state in Exercises (section 4.7).
8. **The performance player's key strip cannot be panned by touch**, by its CSS (`performance-player.js:328`), and
   shows 12 of 25 keys at 390 px. Not tried with a finger.
9. **The Woodshed canvas changes height on its first frame** on a phone, 110 px to 222 px (section 8.2).
10. **Calibration has no way out** but waiting 6.2 s (`woodshed.js:1058,1268-1274`).
11. **The Woodshed shows the raw instrument id** ("piano", "guitar") in its heading and library note
    (`woodshed.js:1148,1183`), where the Plan and Exercises show the label ("Piano").
12. **Two native date inputs and one native file input** keep the browser's look (`practice-progress-ui.js:67`,
    `practiceplan.js:306`).

Nothing here was changed. Items 2, 3, 4 and 6 are small and independent of the look; whether Phase B fixes them or
only avoids carrying them over is open question 12.

---

## 19. Open questions, each with a recommended answer

1. **Does the Learn bar stay a block above the four Learn pages?**
   Recommended: no. Keep `#learn-instruments`, the `<select id="learn-instrument">` and the `data-learn-entry`
   buttons (the suite needs them), but make the instrument one compact control in the shell and move the entry
   buttons behind it or behind the new home's "Something else". It is 168 to 252 px of every Learn page on a phone.
2. **During an Exercises question, may the Learn bar fold away?**
   Recommended: yes, down to one line that keeps `#learn-stop-exercise` visible (`learn-instruments:55` needs it
   visible). This alone lifts the question card by about 190 px at 390 px.
3. **Who shows streak and goal once the home has its footer line: the home, Exercises, or both?**
   Recommended: Phase B builds the footer line and uses it on the new home; Exercises keeps `.qz-strip`, `.qz-stat`
   and `#qz-cont` (pinned by `game:105,127,345`, `quiz:60`, `help.js:85`) in the new look. Removing the strip is a
   Phase D decision ("streak/goal/review on home", `docs/ROADMAP-2.0.md:60`).
4. **Is Phase B allowed to reorder content, or only to restyle?**
   Recommended: restyle, plus three reorders that the principles ask for and no suite forbids: the user's scores
   before the rudiments and history on the Woodshed; the Plan's student card after today's blocks; the player's
   settings behind a sheet. Everything else (shorter path, lesson types) is Phase C.
5. **Do the four keyboards, two necks and three staves become the shared instrument hero in Phase B?**
   Recommended: no. Phase B builds the hero for the home and gives the existing drawings token colours and sane
   widths. Pages adopt the hero in Phase C, where the lighting model is decided (`docs/ROADMAP-2.0.md:59,61`).
   Reason: `.qz-key`, `.qz-fz`, `[data-pf-note]` and `.pf-target` are pinned, and `taps` taps them by their boxes.
6. **One chart helper?**
   Recommended: yes, the Exercises approach (drawn at pixel width, 11 px text), but as a new shared function that
   keeps one `rect` per observed day and a `desc` for Practice progress (`practice-progress-ui:67-73`), then used by
   both. Do it in the step that re-skins the Woodshed.
7. **Does "every control is tappable at 44 px" apply to chips in dense groups** (40 rudiments, 7 buttons per score,
   21 chips on Chords)?
   Recommended: yes for the touch area, not for the drawn height: a 44 / 48 px hit area with a smaller visible pill.
   Decide before any page step; it changes every row's wrap point.
8. **Which tokens are added for these pages?**
   Recommended: add to `css/tokens.css`, in the first Phase B step, a sunken surface (today's `--inset`), text on a
   degree colour, four judgement colours (perfect, great, good, miss) with light values, and a pressed-key colour.
   Without them the pages cannot meet "only `--sl-*`, never a raw colour" (`tokens.css:6`).
9. **The canvases read variables by name. Rename, or keep an alias?**
   Recommended: while pages are converted one by one, keep the old names as aliases of the tokens in `style.css`,
   and switch the two canvases (`woodshed.js:864-867`, `performance-player.js:239`) in their own page's step, with
   a check that fails when a name returns an empty string.
10. **Chords' own key and tempo against "the key bar is always there".**
    Recommended: remove `#ch-bpm` and use the shared tempo; when the shared scale has no chords, say so in the
    explorer instead of silently keeping another key. Both are behaviour changes, so they need the owner's yes.
11. **Four instrument selects.**
    Recommended: one source, the Learn instrument. The player's and Practice progress's selects stay in the DOM
    (their suites set them) but follow it; the Plan's disabled copy becomes text.
12. **Does Phase B fix the small faults in section 18 (items 2, 3, 4, 6)?**
    Recommended: fix 3 and 4 in the step that touches their page (they are look faults); raise 2 and 6 with the
    owner as part of question 10; leave 8 to the step that handles the player.
13. **Wording.** Many labels are not plain words (section 16) and some are pinned by suites.
    Recommended: Phase B changes look, not words, except on new shell components. Collect the wording list as a
    Phase C / D task so that suites and texts change together.
14. **Free practice cards.**
    Recommended: token colours only in Phase B. Their functions move in Phase C and D (`PLAN.md:1200-1201`), so
    layout work on them now would be thrown away.
15. **The shared classes are Gear's too.**
    Recommended: Phase B introduces the new component classes beside the old ones and converts soundLAB's pages to
    them; the old `.card`, `.btn`, `.chip`, `.seg` rules stay untouched until Phase H, so Gear does not change by
    accident.

---

## Appendix A — screenshots

Folder `scratchpad/v2/phaseB/shots/pages-learn/`: `mockup-1200.png`, `mockup-390.png` (the home mockup; its page is
fixed at 1280 × 800, `docs/design/home-mockup.html:26`, so the 390 px picture is only its left edge), and four
folders `1200-dark`, `1200-light`, `390-dark`, `390-light`. Each view has `<name>-fold.png` (the viewport) and, for
most, `<name>-full.png` (the whole page; at 390 px taken in a tall viewport with the bottom tab bar hidden). The two
dark folders also hold 14 element pictures `el-*.png`. `64-shed-report-fold.png` and `65-shed-calibration-fold.png`
come from `work-pages-learn/shed.js`.

Views (file name stems): `01-quiz-path-fresh`, `02-quiz-progress-empty`, `03-plan-fresh`, `04-shed-lib-fresh`,
`05-quiz-done`, `06-quiz-path`, `07-quiz-path-node`, `08-quiz-path-locked`, `09-quiz-topics`, `10-quiz-topic`,
`11-quiz-topic-learn`, `12-quiz-progress`, `13-quiz-progress-tables`, `14-quiz-run-choice`, `14b-quiz-run-staff-play`,
`15-quiz-run-wrong`, `15b-quiz-run-right`, `16-quiz-run-keys`, `17-quiz-run-chord-keys`, `18-quiz-run-ear`,
`19-quiz-sprint`, `20-quiz-run-neck-guitar`, `21-quiz-path-guitar`, `22-learnbar-bass`, `23-quiz-path-drums`,
`24-learnbar-synth`, `25-learnbar-tips-open`, `30-chords-guitar`, `31-chords-piano`, `31-chords-tab`,
`31-chords-sheet`, `32-chords-playing`, `40-circle`, `41-circle-quiz-asking`, `42-circle-quiz-answered`, `50-plan`,
`51-plan-notes-preview`, `52-plan-accepted`, `53-plan-free-practice`, `54-plan-free-practice-running`, `60-shed-lib`,
`61-shed-lib-progress-settings`, `62-shed-lib-paste`, `63-shed-session-highway`, `63-shed-session-scroll`,
`63-shed-session-sheet`, `64-shed-report`, `65-shed-calibration`, `66-perf-idle`, `67-perf-running`,
`68-perf-section-input-open`, `69-perf-report`, `70-tuner`, `71-tuner-listening`.

Data in the pictures: views 01-04 are a fresh profile; from 05 on, seven recorded practice days were added through
`App.practiceProgress.recordSession` and two Exercises levels were played by script.

Pictures I opened (64). Mockup: both. `1200-dark`: 01 fold, 05 fold, 06 full, 07 fold, 09 fold, 10 full, 12 fold and
full, 15 fold, 17 full, 20 fold, 30 fold, 31-piano full, 32 full, 42 full, 53 full, 60 full, 61 full, 63-highway
fold, 63-sheet fold, 67 full, 68 full, 69 full, 70 full, and 14b full. Eighteen of these were opened in a first take
of the 1200 px run; the re-take differs only in the random question or chord. `1200-light`: 06 fold, 16
fold, 32 fold, 42 full, 52 full, 63-highway fold, 67 full. `390-dark`: 06 fold, 07 fold, 12 full, 14 fold, 16 fold,
20 full, 32 full, 40 full, 53 full, 60 full, 63-highway fold, 64 fold, 67 full, 70 full, `el-pgu-chart`,
`el-quiz-chart-xp`, `el-shed-lib-rows`; and ten from earlier phone takes (since replaced; eight of them had the
mouse layout, section 18 item 1): 05 full, 06 fold, 14 fold and full, 14b fold, 16 full, 30 full, 31-piano full, 50
fold, 60 fold. `390-light`: 15 full, 31-piano full, 71 fold.

## Appendix B — scripts and outputs (`scratchpad/v2/phaseB/work-pages-learn/`)

| File | What it does | Output |
|---|---|---|
| `mock.js` | Renders the home mockup at 1200 and 390 px | `shots/pages-learn/mockup-*.png` |
| `css.js` | Reads the ten injected style elements: size, rules, colours, variables | `css.json` |
| `refs.js` | Lists which suite names which id, class or `data-` attribute of these pages | `refs.txt`, `refs.json`. Five false hits: `ch-xp`, `ch-time`, `ch-speed` (parts of `qz-ch-*`), `data-theme`, `learn-cmm` |
| `shots.js` | The 54 views in four combinations, with measurements | the four picture folders, `measure-*.json`, `run-*.log` |
| `sum.js` | Tables from the measurements | `sum.txt` |
| `probe.js`, `probe2.js` | Single facts: widths, drawing sizes, control heights, the fresh-profile Chords colours | `probe.json`; `probe2.js` prints only |
| `shed.js` | The Woodshed report and calibration | two pictures per combination |
| `crops.js` | Element pictures and chart text sizes | `el-*.png` |
