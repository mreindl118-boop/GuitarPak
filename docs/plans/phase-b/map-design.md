# Phase B map — the design system as a specification

Key: `design`. Written 2026-11-12 against the worktree
`scratchpad/wt/a4`
(branch `claude/verify-project-files-4bchk6-v2-a4`, HEAD `b18e09d`). Every `file:line` below is a line of that
tree as it was when read; paths are relative to its root. Nothing in the worktree or any other checkout was changed.

The working files and screenshots this document names (work-…/, shots/…) were scratch files of the planning
session. They are not in the repository: pictures are never committed, because both deploys publish the whole
tree.

**Short names used below:** DS = `docs/DESIGN-SYSTEM.md`, TOK = `css/tokens.css`, MOCK = `docs/design/home-mockup.html`,
ROAD = `docs/ROADMAP-2.0.md`, STYLE = `css/style.css`, APP = `js/app.js`.

**What was read in full:** DS (70 lines), TOK (146), MOCK (223), ROAD (112), STYLE (997), `index.html` (151), the
"soundLAB 2.0 Phase A" section of `CLAUDE.md` (`:1183-1750`), `docs/plans/phase-a/PLAN.md:1-130` plus its heading list.
**What was run:** headless Chromium 1243 through Playwright at deviceScaleFactor 1 against a private server on port
5411 (stopped at the end): the mockup at 1280, 1200, 1024 and 390 px; the app (both themes, 1200 and 390 px) on ten
pages, the key bar open, both sheets, Settings; Gear's Deck. A Node script computed the WCAG 2 contrast of the token
pairs straight from TOK. All pictures and numbers are in section 10.
**Not checked:** no test suite was run; nothing was tried on real hardware, a real phone, Safari or Firefox; the
contrast of text over the mockup's amber glow was computed for two sample colours, not pixel by pixel; forced-colours
(Windows High Contrast) mode was not rendered.

---

## 0. The ten findings that shape the plan

1. **Nothing uses the tokens yet.** TOK is loaded first in both pages (`index.html:15`, `gear.html:15`) and listed in
   the worker (`sw.js:9`), but no `var(--sl-…)` occurs in `js/`, STYLE or `css/lumi-practice.css` (grep: only TOK, docs
   and one test fixture, `tests/pages-next.test.js:73`). The app is drawn by 29 older variables (`STYLE:42-75`) used
   about 1,080 times in 31 files (section 3.13).
2. **The design system is one page of names.** DS has 5 principles (`DS:10-23`), a token table (`DS:27-38`), one
   sentence listing 15 component families (`DS:42-47`), four layout lines (`DS:51-54`) and four accessibility lines
   (`DS:58-61`). It gives no anatomy, no size, no state and no class name for any component.
3. **The mockup is one static picture of one page at one size.** It is fixed at 1280 × 800 with hidden overflow
   (`MOCK:26`), has no media query, no `:hover` / `:focus` / `:active` / disabled rule, no `<button>`, `<select>`,
   `<input>` or `href` (grep: 0 hits each). At 1200 px it is cut off on the right, at 390 px it is the top-left corner of
   the desktop picture (`shots/design/mock-e-1200.png`, `mock-e-390.png`). There is **no phone mockup, no light mockup,
   and no mockup of any page other than the home** (`docs/design/` holds two files: `home-e-stage.png`,
   `home-mockup.html`).
4. **"Both themes pass AA" is not true for the light tokens.** TOK says "every pairing keeps ≥ 4.5:1" (`TOK:109`), DS
   says "tokens are chosen for it" (`DS:58`). Computed: in light, `--sl-accent` as text is 3.0–3.6:1 on all four
   surfaces, white on the accent (the primary button) is 3.64:1, `--sl-ok` is 3.6–4.4:1, `--sl-info` is 4.42:1 on
   `--sl-bg-raised`. The dark theme passes for all text on plain surfaces (section 6.1).
5. **`--sl-accent-ink` means the opposite of today's `--accent-ink`.** Today `--accent-ink` is "accent as TEXT"
   (`STYLE:62`, 38 uses in 13 files). `--sl-accent-ink` is "text ON the accent" (`TOK:30`). The new set has **no token
   for accent-coloured text**, which is exactly the pair that fails in light.
6. **The degree-colour tokens are not the app's colours.** `--sl-deg-1…7` are red, orange, yellow, green, cyan, blue,
   purple (`TOK:43-49`). The app's defaults are amber, yellow, green, teal, blue, purple, pink (`APP:1287`), they are
   user-editable (`fb.colors`, `APP:1322`, `:1357-1360`), are quantised to the LUMI's 127-colour table before they are
   drawn (`APP:1328-1331`, `js/note-palette.js:41-42`), cover twelve intervals, not seven (`APP:1335`), and have a second
   mode by note name (`APP:1321`, `:1346-1351`). A CSS token cannot be the source of any of that.
7. **Lit dots on white keys fail 3:1: all seven degrees in dark, four of seven in light**, and a "filled key = play
   this now" in yellow, green or cyan is 1.2–1.5:1 against the unlit key next to it in dark (section 6.3). The mockup only works because its one filled key is red.
8. **The key bar in the mockup is not the key bar the app has.** Mockup: Key, Tempo, Scale lock, LUMI lights, Help
   (`MOCK:126-133`), always visible. App: Key, Scale, Mode, BPM, Time, metronome start/stop, LUMI Display, Scale Lock,
   Intervals / Note Names (`index.html:47-59`, `APP:1630-1646`), a dropdown behind the clef button (`STYLE:382-405`).
   The mockup bar is 1,042 px wide (measured) and has no narrow form; it overflows below a 1,186 px window.
9. **Every control in the DS is 44 px (48 on touch); the app's are 34 (38).** `TOK:92`, `:140-142` against `STYLE:64`,
   `:109`. Measured today at 390 px: on 10 of 15 pages all, or all but one or two, of the visible controls are under
   44 px (section 6.5). The mockup itself breaks the rule three times (gear 34 px, stepper 24 px, text link 19 px).
10. **The layer tokens cannot be mixed with today's numbers.** `--sl-z-bar` 20, `-sheet` 40, `-toast` 60
    (`TOK:104-106`); today the top bar is 50, the key bar 60, toasts 400, sheets 420, the help tour 500
    (`STYLE:179`, `:388`, `:873`, `:305`, `js/help.js:247`). A token-built sheet would open under the old top bar.

---

## 1. The sources and how far each one binds

| Source | What it is | What it decides | What it leaves open |
|---|---|---|---|
| ROAD `:36-37`, `:56` | the decision "Look: E · Stage (dark stage, amber, Bebas headlines, one thing on screen, instrument hero, shared key bar)" and the Phase B row "components, key bar, new home, nav, sheets; every kept page re-skinned; light theme" | the scope of Phase B | the order, the page templates, what "new home" contains |
| DS | principles, token groups, the component list, layout and accessibility rules | names and intent | every measurement and every state |
| TOK | 69 custom properties on `:root`, 26 of them re-defined under `:root[data-theme="light"]`, two media queries (`:140-146`) | exact values | whether the values pass the rules they state (`:7`, `:109`) |
| MOCK (`?theme=e`) | one 1280 × 800 picture; `?theme=f` is "the runner-up kept for comparison" (`DS:5`) | the desktop home: sizes, type, spacing | everything interactive, every other width, the light theme |
| `docs/design/home-e-stage.png` | MOCK rendered at 2× (2560 × 1600); it shows the same picture as my render (`shots/design/mock-e-1280.png`; compared by eye, not pixel by pixel) | — | — |

MOCK's own variable block for theme e (`MOCK:13-18`) is **not** TOK: it uses `--muted:#8e858c` where TOK has
`--sl-ink-muted: #9d939b` (`TOK:25`), `--radius:10px` where TOK has 8 / 12 / 20 (`TOK:86-88`), and a status green
`#5fd38a` (`MOCK:44`) where TOK has `--sl-ok: #6fd58f` (`TOK:36`). Where MOCK and TOK differ, TOK is the later, binding
file (`DS:5-6`: "Tokens live in `css/tokens.css`").

---

## 2. The five principles as page rules

Each row: the text, what a page must do to comply (a check a reviewer or a test can make), and where the app stands.

| # | Principle (DS) | Checkable meaning for a page | The app today |
|---|---|---|---|
| 1 | "One thing on screen. A page shows the next step and a Start button. The plan, streak and goal are one quiet footer line. Everything else is behind 'Something else' or a sheet." (`DS:10-13`) | (a) exactly one element at `--sl-display-lg` (`DS:34`); (b) exactly one primary button in the first viewport; (c) at 1280 × 800 and 390 × 844 the headline, the primary button and the hero are visible without scrolling; (d) secondary choices are one link or one sheet away; (e) no grid of cards as the first view ("Dashboards of cards were rejected", `DS:12-13`). | The home (Exercises) is 7,938 px tall at 390 px and 8,072 px at 1200 px (measured); its first view holds an instrument card, a stats card, a 3-way tab and a path (`shots/design/app-quiz-dark-1200.png`). 14 of 15 pages have no `<h1>`; the Plan page has one (`js/practiceplan.js:306`). Pages hold 1–9 `.card` blocks (section 6.5 table). |
| 2 | "The instrument is the hero. Keyboard for a keys lesson, neck for guitar or bass, pads for drums, lit exactly as the LUMI (or the on-screen neck) will be: degree colors, filled key = play this now." (`DS:14-16`) | (a) the largest element of a practice page is the instrument; (b) it "spans the width" on tablet and PC (`DS:52`) and "is never cropped" (`DS:54`); (c) its colours come from the same source as the LUMI's; (d) one lighting vocabulary on all three instruments. | Colours already come from one source for screen and LUMI (`APP:1278-1283`, `:1339-1341`). The Piano keyboard sits inside a card under four rows of controls (`shots/design/app-piano-light-1200.png`). The neck is drawn vertically (`CLAUDE.md:1906` "Fretboard is drawn in horizontal-neck coordinates and rotated 90° cw"; `shots/design/app-fretboard-light-390.png`), the mockup's neck is horizontal (`MOCK:192-218`). "Now" is a ring today, not a filled key (Keys page "now/next rings", `CLAUDE.md:445`). |
| 3 | "The key bar is always there. Key · Tempo · Scale lock (with a plain-words hint …) · LUMI lights mode · Help level. Same bar on every page; never buried in a menu." (`DS:17-19`) | (a) the five controls are visible on every page at every width without a tap; (b) the same markup and order everywhere; (c) the Scale lock hint names the key in words. | The key bar is a dropdown: `html:not(.ctx-open) .ctxbar { display: none }` (`STYLE:405`), opened by `#ctx-btn` (`index.html:43`, `APP:1602`). Help level is not in it; it is on the Keys page and in the Lights & help sheet (`APP:1257-1261`, `shots/design/app-sheet-lights-dark-1200.png`). The whole top bar hides while scrolling down (`STYLE:186`, `APP:1147`). |
| 4 | "Plain words. Labels say what happens ('only scale notes sound'), not what the setting is called." (`DS:20-21`) | every switch and mode shows a short sentence of its effect next to its name; no label is only a feature name. | The lock's sentence exists but is long: "Only <key> pitched notes play across tools, playback and MIDI. Drums and recorded/live audio keep their own sound." (`APP:1656`). Chips read "LUMI Display", "Scale Lock" (`APP:1661`, `:1665`). |
| 5 | "Four instruments, one kit. Guitar, bass, keys and drums get the same components: lessons, exercises, Woodshed, Help levels, plan blocks, progress." (`DS:22-23`) | the same component (class, markup, states) draws a lesson row, a plan block or a progress line for all four instruments; an instrument differs only in its hero. | That is Phase B0 / C work (`ROAD:57-58`); B only has to build the components instrument-neutral. Not mapped here. |

Principle 1 is written for the home and for lesson pages. DS does not say what "the next step and a Start button" is on
a tool page (Tuner, Jam, Charts, Songs, Settings). See question Q22.

---

## 3. Tokens

All values from TOK. "Light" is empty where the token is not re-defined under `:root[data-theme="light"]`
(`TOK:110-138`), so the dark value applies in both themes.

### 3.1 Surfaces (`TOK:15-21`, light `:112-118`)

| Token | Dark | Light | For |
|---|---|---|---|
| `--sl-bg` | `#0f0d10` | `#f5f1ea` | "the stage": the page ground |
| `--sl-bg-raised` | `#161317` | `#efe9df` | "header, footer, sheets" |
| `--sl-surface` | `#1c191d` | `#ffffff` | "cards" |
| `--sl-surface-2` | `#262128` | `#f1ebe1` | "rows inside cards, inputs" |
| `--sl-line` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.08)` | hairline (no comment in TOK) |
| `--sl-line-strong` | `#302a32` | `#d8cfc1` | (no comment; not in the DS table, `DS:29`) |
| `--sl-overlay` | `rgba(0,0,0,0.6)` | `rgba(20,16,12,0.45)` | the scrim under a sheet |

### 3.2 Ink (`TOK:24-26`, light `:119-121`)

| Token | Dark | Light | For |
|---|---|---|---|
| `--sl-ink` | `#f6f1ea` | `#1d1a1c` | text |
| `--sl-ink-muted` | `#9d939b` | `#6d646b` | secondary text; "≥ 4.5:1 on `--sl-bg`" |
| `--sl-ink-faint` | `#6a6168` | `#a39aa0` | "decorative only, never for text that matters" |

### 3.3 Accent (`TOK:29-33`, light `:122-126`)

| Token | Dark | Light | For |
|---|---|---|---|
| `--sl-accent` | `#ffab47` | `#c96f0a` | "tube amber"; "the ONLY accent; never a second hue for emphasis" (`DS:31`) |
| `--sl-accent-ink` | `#1a1206` | `#ffffff` | "text ON the accent" |
| `--sl-accent-soft` | `rgba(255,171,71,0.14)` | `rgba(201,111,10,0.12)` | tinted fill of an "on" control |
| `--sl-accent-line` | `rgba(255,171,71,0.6)` | `rgba(201,111,10,0.55)` | border of an "on" control |
| `--sl-accent-glow` | `0 14px 40px rgba(255,171,71,0.28)` | `0 10px 30px rgba(201,111,10,0.22)` | a complete `box-shadow` value (the Start button's glow, `MOCK:57`) |

### 3.4 Status (`TOK:36-39`, light `:127-130`)

| Token | Dark | Light |
|---|---|---|
| `--sl-ok` | `#6fd58f` | `#1f8a46` |
| `--sl-warn` | `#ffb36b` | `#9a5a0c` |
| `--sl-bad` | `#ff6f6f` | `#c23434` |
| `--sl-info` | `#6ea8fe` | `#2f68c8` |

### 3.5 Scale degrees (`TOK:43-49`; not re-defined in light)

`--sl-deg-1` `#ff4d4d` · `-2` `#ff9a3c` · `-3` `#ffd23f` · `-4` `#4cd964` · `-5` `#34d0e0` · `-6` `#4d7dff` ·
`-7` `#b36bff`. Comment: "the default color mode: 1 is always the 1 color in every key; the LUMI gets the same seven"
(`TOK:41-42`). MOCK uses the same seven as literals (`MOCK:160`).

### 3.6 Keys and strings (`TOK:52-55`, light `:131-134`; not in the DS table)

| Token | Dark | Light |
|---|---|---|
| `--sl-key-white` | `#ece5db` | `#ffffff` |
| `--sl-key-black` | `#1b171c` | `#2a2429` |
| `--sl-string` | `#b9bccb` | `#6f7384` |
| `--sl-fret` | `#3a3c4d` | `#c9ccd8` |

### 3.7 Type (`TOK:58-72`; same in both themes)

| Token | Value | For |
|---|---|---|
| `--sl-font-display` | `'Bebas Neue', 'Barlow Condensed', 'Segoe UI', system-ui, sans-serif` | headlines; Bebas is caps-only (`STYLE:33-34`) |
| `--sl-font-body` | `'Barlow', 'Segoe UI', system-ui, sans-serif` | body |
| `--sl-font-cond` | `'Barlow Condensed', 'Segoe UI', system-ui, sans-serif` | labels, tabs, buttons in MOCK |
| `--sl-text-xs / sm / md / lg / xl` | 12 / 14 / 16 / 20 / 26 px | body sizes |
| `--sl-display-sm` | 34 px | "wordmark, sheet titles" |
| `--sl-display-md` | 56 px | "big numbers (streak)" |
| `--sl-display-lg` | `clamp(44px, 7.8vw, 100px)` | "the one headline on a page" |
| `--sl-eyebrow-ls` | 0.16em | "small caps labels" |
| `--sl-caps-ls` | 0.08em | "Bebas buttons and tabs" |
| `--sl-leading-tight` / `--sl-leading` | 0.92 / 1.4 | headline / body line height |

Font files that exist: Barlow 400 and 500, Barlow Condensed 600 and 700, Bebas Neue 400 (`STYLE:9-40`, `fonts/`).
There is no weight token. MOCK asks for Barlow 600 (`MOCK:53`, `:80`, `:90`), which is not shipped; the browser
thickens Barlow 500 artificially (my render reports only 400 and 500 loaded).

### 3.8 Space (`TOK:75-83`)

`--sl-space-1…8` = 4, 8, 12, 16, 24, 32, 48, 72 px. `--sl-gutter` = 16 px, "phone side gutter".

### 3.9 Shape (`TOK:86-89`)

`--sl-radius-sm` 8 px · `-md` 12 px · `-lg` 20 px · `-pill` 999 px. DS: "buttons are pills; cards 12 px" (`DS:36`).

### 3.10 Controls and elevation (`TOK:92-96`, light `:135-137`, touch `:140-142`)

| Token | Dark | Light | For |
|---|---|---|---|
| `--sl-control-h` | 44 px; 48 px under `(pointer: coarse)` | same | "every tappable control" |
| `--sl-tap-min` | 44 px | same | smallest tap target (not in the DS table) |
| `--sl-focus` | `0 0 0 3px rgba(255,171,71,0.55)` | `0 0 0 3px rgba(201,111,10,0.5)` | the focus ring, a `box-shadow` value |
| `--sl-shadow-1` | `0 1px 3px rgba(0,0,0,0.3)` | `0 1px 3px rgba(0,0,0,0.1)` | small elevation |
| `--sl-shadow-2` | `0 10px 30px rgba(0,0,0,0.35)` | `0 10px 30px rgba(23,26,31,0.08)` | sheets, toasts |

### 3.11 Motion (`TOK:99-101`, reduce `:144-146`)

`--sl-dur-fast` 120 ms · `--sl-dur` 200 ms · `--sl-ease` `cubic-bezier(0.2, 0.7, 0.2, 1)`. Under
`prefers-reduced-motion: reduce` both durations are `0ms`.

### 3.12 Layers (`TOK:104-106`; not in the DS table)

`--sl-z-bar` 20 · `--sl-z-sheet` 40 · `--sl-z-toast` 60.

### 3.13 Today's variables against the tokens

Uses = occurrences of `var(--name)` in STYLE, `css/lumi-practice.css` and `js/` (grep on the tree; module CSS lives in
JavaScript strings, one `App.injectCSS` per module, `APP:800-806`, 30 files).

| Today (`STYLE:42-75`, light `:81-108`) | Dark / light | Uses (files) | Nearest token | Dark / light | Verdict |
|---|---|---|---|---|---|
| `--bg` | `#131114` / `#f3efe8` | 5 (4) | `--sl-bg` | `#0f0d10` / `#f5f1ea` | corresponds; darker stage. `#131114` is also in `index.html:6`, `gear.html:6`, `manifest.webmanifest:9-10` and `APP:852`. |
| `--panel` | `#191518` / `#efe9df` | 2 (2) | `--sl-bg-raised` | `#161317` / `#efe9df` | corresponds |
| `--card` | `#1e191c` / `#fffdf9` | 30 (16) | `--sl-surface` | `#1c191d` / `#ffffff` | corresponds |
| `--card2` | `#292328` / `#f1ebe1` | 71 (20) | `--sl-surface-2` | `#262128` / `#f1ebe1` | corresponds |
| `--inset` | `#141114` / `#e7e0d3` | 10 (4) | none | | **no token** for "sunken tracks: seg controls, sliders, LEDs" (`STYLE:48`) |
| `--line` | `#342c2f` / `#d8cfc1` | 121 (27) | `--sl-line-strong` | `#302a32` / `#d8cfc1` | corresponds by value. `--sl-line` is the 8 % hairline, which is nearer to `--line-soft`. |
| `--line-soft` | 5 % white / 5 % black | 8 (5) | `--sl-line` | 8 % white / 8 % black | corresponds |
| `--text` | `#ede8e0` / `#2b241d` | 92 (24) | `--sl-ink` | `#f6f1ea` / `#1d1a1c` | corresponds |
| `--muted` | `#a29889` / `#756b5c` | 161 (29) | `--sl-ink-muted` | `#9d939b` / `#6d646b` | corresponds (warm grey becomes mauve grey) |
| `--label` | `#c9beac` / `#6e6355` | 22 (12) | none | | **no token** between ink and muted ("form labels — brighter than muted", `STYLE:53`) |
| `--ctl-border` | `#4d4247` / `#c2b6a2` | 22 (9) | none | | **no token**; `--sl-line-strong` is fainter (`#302a32`) |
| `--accent` | `#ffab47` / `#d97e0f` | 204 (28) | `--sl-accent` | `#ffab47` / `#c96f0a` | **conflict:** `--accent` is overwritten inline by Settings › Accent (amber, teal, violet, coral: `APP:817-839`, `js/settings.js:66-67`, `:235`); `--sl-accent` is fixed and DS forbids a second accent (`DS:31`). |
| `--accent-dim` | `#c97f26` / `#b96a10` | 3 (3) | none | | drop |
| `--accent-glow` | a **colour**: `rgba(255,171,71,.35)` / `rgba(217,126,15,.28)` | 22 (9) | `--sl-accent-glow` | a **shadow list** | **type conflict:** today it is used inside `text-shadow`, `drop-shadow()` and `box-shadow` (`STYLE:203`, `:216`, `:298`, `:508`, `:857`); the token cannot replace it there. |
| `--accent-soft` | `color-mix(accent 13%, transparent)` | 29 (11) | `--sl-accent-soft` | 14 % / 12 % fixed | corresponds; loses "follows the picked accent" |
| `--accent-line` | `color-mix(accent 60%, transparent)` | 34 (12) | `--sl-accent-line` | 60 % / 55 % fixed | corresponds |
| `--accent-ink` | `var(--accent)` / `color-mix(accent 70%, #000)` = `#98580b` | 38 (13) | `--sl-accent-ink` | `#1a1206` / `#ffffff` | **meaning conflict:** today = accent as text on a surface (`STYLE:62`, `:97-99`); token = text on the accent (`TOK:30`). Same name, opposite job. |
| `.btn.primary` label `#221302` (`STYLE:602`) | literal | — | `--sl-accent-ink` | `#1a1206` / `#ffffff` | corresponds in dark; light changes from dark-on-amber to white-on-amber |
| `--warn` | `#ffb36b` / `#9a5a0c` | 4 (3) | `--sl-warn` | identical | same |
| `--green` | `#77d98b` / `#2c7f3e` | 30 (7) | `--sl-ok` | `#6fd58f` / `#1f8a46` | corresponds; the light value got lighter and now fails (6.1) |
| `--red` | `#ff6f6f` / `#c23434` | 35 (12) | `--sl-bad` | identical | same |
| `--blue` | `#6ea8fe` / `#2f68c8` | 2 (1) | `--sl-info` | identical | same |
| `--teal` | `#4cc9b0` / `#12806b` | 11 (4) | none | | **no token** |
| `--purple` | `#b48ef0` / `#7449c2` | 0 | none | | unused |
| `--h-ctl` | 34 px, 38 px on touch (`STYLE:64`, `:109`) | 12 (6) | `--sl-control-h` | 44 / 48 px | **conflict in size:** +10 px on every toolbar control |
| `--radius` | 16 px | 4 (2) | `--sl-radius-md` 12 / `-lg` 20 | | cards go from 16 to 12 (`DS:36`) |
| `--shadow-1` | `0 1px 3px rgba(0,0,0,.22)` / `.1` | 8 (2) | `--sl-shadow-1` | `.3` / `.1` | corresponds |
| `--font-body`, `--font-display` | same stacks | 50 (14), 32 (13) | `--sl-font-body`, `--sl-font-display` | identical | same |
| `--font-condensed` | same stack | 17 (11) | `--sl-font-cond` | identical | same value, shorter name |
| body 15 px, line height 1.5 (`STYLE:142-143`) | | | `--sl-text-md` 16 px, `--sl-leading` 1.4 | | body text grows by 1 px |

Also in use and private to a module, so untouched by a token swap: `--deg-c` (16), `--qz-track` (7), `--pd` (4),
`--dc` (3), `--pf-pitch` (3), `--fb-nut` (1). `var(--card-2, …)` (4 uses, `js/synthtab.js:538`, `:542`, `:548`,
`js/synthlive.js:316`) names a variable that is never defined, so its fallback always applies (Gear files).
Raw colour literals inside module CSS and drawing code, per file (rough grep count): piano 21, chords 15, fretboard 12,
chordchart 11, woodshed 10, app 8, pads 6, quiz 5.

### 3.14 Values the mockup uses that no token holds

| In MOCK | Where | Nearest token |
|---|---|---|
| stage glow `radial-gradient(1200px 600px at 50% 110%, rgba(255,171,71,.16), transparent 60%)` | `MOCK:28` | none (16 % amber; `--sl-accent-soft` is 14 %) |
| pill fill `rgba(255,255,255,.03)` | `MOCK:86` | none |
| lock pill fill `rgba(255,171,71,.08)` | `MOCK:98` | `--sl-accent-soft` is 14 % |
| switch knob `#fff`, off track `rgba(255,255,255,.14)`, off knob `#9a9aa6` | `MOCK:95-97` | none |
| help dot off `rgba(255,255,255,.18)`; goal ring track `rgba(255,255,255,.12)` | `MOCK:105`, `:148` | none |
| status dot `#5fd38a` | `MOCK:44` | `--sl-ok` `#6fd58f` |
| white-key divider `rgba(0,0,0,.18)`, black-key shadow `0 4px 10px rgba(0,0,0,.5)`, dot glow `0 0 22px var(--c), 0 0 6px var(--c)` | `MOCK:64-66` | none |
| neck: board `#141520`, nut `#e9e6f0`, inlay `#2a2c3a`, "now" ring `#fff` | `MOCK:203-205`, `:214` | none (string `#b9bccb` and fret `#3a3c4d` are tokens) |
| sizes 13 px (`MOCK:72`, `:83`, `:100`), 15 px (`MOCK:79`, `:86`), 22 px (`MOCK:55`), 30 px | | scale is 12 / 14 / 16 / 20 / 26 |
| spacing 36 px (`MOCK:32`, `:63`, `:79`), 10, 14, 18, 22, 26, 28, 34, 38 px | `MOCK:32-55`, `:85-86` | scale is 4, 8, 12, 16, 24, 32, 48, 72; only 72 px (`MOCK:48`, `:85`) is on it |
| radii 10 px and 8 px for key bottoms | `MOCK:64-65` | 8 / 12 |
| label letter spacing .1em, key names .06em, wordmark .01em | `MOCK:88`, `:72`, `:33` | `--sl-eyebrow-ls` .16em, `--sl-caps-ls` .08em |

---

## 4. Components to build in Phase B

The list is one sentence (`DS:42-47`). For each family below: **Given** = what DS, TOK and MOCK state (quoted);
**Measured** = sizes from my render of MOCK at 1280 × 800; **Tokens** = the mockup's values named as tokens;
**States** = what is drawn, and what is not; **Today** = the element the app has now, with the ids and classes the
67 suites lean on. Nothing under "not drawn" is decided anywhere; section 9 proposes answers.

**State hooks that already exist and should be kept**, because the suites select on them: the class `.active` for
"on / selected" (roughly 70 selector or `classList` checks in about 20 suites; an approximate grep, the word
`active` is also a property name), `aria-pressed` (38 uses in 14 soundLAB files), the `hidden` and `disabled`
attributes, and hover only under `@media (hover: hover)` (`STYLE:595-597`: "on touch it sticks after a tap and a
pressed button looks selected").

### 4.1 Button — primary pill

- **Given:** "buttons are pills" (`DS:36`). Markup `MOCK:139`: `<div class="btn"><span class="tri"></span>Start</div>`.
  CSS `MOCK:55`: `.btn{display:inline-flex;align-items:center;gap:14px;background:var(--accent);color:var(--accent-ink);border-radius:999px;padding:20px 38px;font-weight:700;font-size:22px;font-family:var(--font-cond);text-transform:var(--caps);letter-spacing:.08em}`,
  glow `MOCK:57`: `box-shadow:0 14px 40px rgba(255,171,71,.28)`, play mark `MOCK:58`: a 16 × 20 px CSS triangle.
- **Measured:** 165 × 66 px; Barlow Condensed 700, 22 px, uppercase, letter spacing 1.76 px.
- **Tokens:** fill `--sl-accent`, label `--sl-accent-ink`, radius `--sl-radius-pill`, glow `--sl-accent-glow`, font
  `--sl-font-cond`, spacing `--sl-caps-ls`. 22 px and the 20 / 38 px padding are not tokens. Height 66 px is taller than
  `--sl-control-h` (44): this is a hero size; DS names no second size.
- **States:** rest only. Not drawn: hover, focus-visible, active, disabled, a normal-size primary.
- **Today:** `.btn.primary` (`STYLE:600-608`; 55 uses in 21 files), `.btn.big` (`STYLE:613-621`; 3 uses). Radius 11 /
  13 px, Barlow 15 px, title case.

### 4.2 Button — ghost

- **Given:** the word only (`DS:42`). MOCK has no ghost button. The nearest thing is a text link, `MOCK:140`:
  `<div class="link"><u>Something else</u> · 2 blocks left this week</div>`, CSS `MOCK:59-60`:
  `.link{color:var(--muted);font-size:16px}` `.link u{text-decoration:none;color:var(--ink);border-bottom:1px solid var(--muted)}`.
- **Measured:** the link is 19 px tall (below `--sl-tap-min`).
- **States:** none drawn.
- **Today:** the default `.btn` (`STYLE:579-598`, 207 uses in 26 files) is a filled, bordered button, not a ghost; the
  header icons are ghosts (`STYLE:290-291`).

### 4.3 Button — icon

- **Given:** the gear, `MOCK:121` `<span class="gear"><svg width="16" height="16" …>`, CSS `MOCK:46`:
  `.status .gear{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;color:var(--muted)}`.
- **Measured:** 34 × 34 px, 16 px icon. Below `--sl-control-h` and `--sl-tap-min`.
- **Tokens:** border `--sl-line`, icon `--sl-ink-muted`, radius `--sl-radius-pill`.
- **States:** rest only.
- **Today:** `.icon-btn` in `.tb-tools` (`STYLE:286-299`): square, borderless, `--h-ctl` (34 / 38 px), 20 px icon, "on"
  = `.active` with accent tint (`STYLE:299`). Ids `#help-btn`, `#settings-btn`, `#ctx-btn`, `#lights-btn`, `#met-btn`
  (`index.html:41-45`; 37 hits in 7 suites). Icons are Lucide through `App.icon` (`CLAUDE.md:1909-1911`); DS does not
  mention icons at all.

### 4.4 Chips and status dots

- **Given:** `MOCK:118-120`: `<div class="status"><span><i></i>LUMI</span><span><i></i>FL Studio</span>…`, CSS
  `MOCK:42-45`: `.status{display:flex;align-items:center;gap:18px;color:var(--muted);font-size:14px}`
  `.status i{width:8px;height:8px;border-radius:50%;background:#5fd38a;display:inline-block}` `.status i.k{background:var(--accent)}`.
- **Measured:** each 17 px tall, 8 px dot, 7 px gap.
- **Tokens:** text `--sl-ink-muted`, dot `--sl-ok` (MOCK's literal differs slightly), `--sl-text-sm`.
- **States:** "connected" only. Not drawn: disconnected, connecting, error, and whether a chip can be tapped.
  A dot alone signals the state, which DS forbids ("status by text + icon, not color alone", `DS:60`).
- **Today:** `.chip` (`STYLE:776-797`; 42 uses in 13 files) is a tappable pill, on = `.chip.active`. No connection
  status lives in the header today.

### 4.5 Switch (Scale lock)

- **Given:** `MOCK:130`: `<div class="ctl lock"><span class="sw"></span><span class="l" style="color:var(--ink)">Scale lock</span><span class="on">ON · only A Dorian notes sound</span></div>`.
  CSS `MOCK:94-97`: `.sw{width:44px;height:24px;border-radius:999px;background:var(--accent);position:relative;flex:none}`
  `.sw::after{content:"";position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:50%;background:#fff}`
  `.sw.off{background:rgba(255,255,255,.14)}` `.sw.off::after{right:auto;left:3px;background:#9a9aa6}`; the pill
  around it `MOCK:98`: `.ctl.lock{border-color:var(--accent);background:rgba(255,171,71,.08)}`; the hint `MOCK:100`:
  `.ctl.lock .on{color:var(--accent);font-family:var(--font-cond);font-weight:700;letter-spacing:.08em;font-size:13px}`.
- **Measured:** track 44 × 24 px, knob 18 px; the whole pill 335 × 44 px.
- **Tokens:** on track `--sl-accent`; pill border `--sl-accent` (MOCK) or `--sl-accent-line`; pill fill
  `--sl-accent-soft`; hint text needs an accent-as-text token (finding 5).
- **States:** on (drawn) and off (CSS only, never shown in the picture). Not drawn: focus, disabled, the off pill and
  what the hint says when off.
- **Today:** `#cx-lock`, a `.chip` with `aria-pressed` (`index.html:56`, `APP:1651`, `:1664-1667`); there is no
  `role="switch"` anywhere in soundLAB's files (grep: 0).

### 4.6 Select chip (Key, LUMI lights)

- **Given:** `MOCK:127`: `<div class="ctl"><span class="l">Key</span><b>A Dorian</b><span class="car">▼</span></div>`;
  `MOCK:131` the same for "LUMI lights / Scale". CSS `MOCK:86`:
  `.ctl{display:flex;align-items:center;gap:10px;height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.03);font-size:15px;color:var(--ink)}`,
  label `MOCK:88`: `.ctl .l{font-family:var(--font-cond);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600}`,
  value `MOCK:90`, caret `MOCK:91` (the character ▼, 11 px).
- **Measured:** 142 × 44 px and 168 × 44 px.
- **Tokens:** height `--sl-control-h`, radius `--sl-radius-pill`, border `--sl-line`, label `--sl-text-xs` +
  `--sl-ink-muted`, value `--sl-ink`; padding `--sl-space-4`.
- **States:** closed only. Not drawn: the open list, a selected option, focus, disabled. Whether it is a native
  `<select>` or a custom list is not stated.
- **Today:** native `<select>` with a chevron background image whose amber is a literal in a data URL
  (`STYLE:671-687`, light copy `:116-121`): `#cx-root`, `#cx-scale`, `#cx-mode`, `#cx-sig` (`index.html:48-52`); 72
  native selects in 18 soundLAB files. One chip "A Dorian" stands for three stored values, root, scale and mode
  (`APP:1674-1679`).

### 4.7 Stepper (Tempo)

- **Given:** `MOCK:128`: `<div class="ctl"><span class="l">Tempo</span><b>100</b><span class="pm"><i>−</i><i>+</i></span></div>`,
  CSS `MOCK:92-93`: `.ctl .pm{display:inline-flex;gap:4px;margin-left:4px}`
  `.ctl .pm i{width:24px;height:24px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-style:normal;font-size:14px;color:var(--muted)}`.
- **Measured:** pill 166 × 44 px; each round button 24 × 24 px with 4 px between them, far below `--sl-tap-min`.
- **States:** rest only. Not drawn: typing a number, press-and-hold repeat, the limits (30–280 today, `APP:1581`).
- **Today:** `#cx-bpm`, `<input type="number" min="30" max="280">` (`index.html:51`, `APP:1693-1700`); 24 number
  inputs in 10 files.

### 4.8 Help-level dots

- **Given:** `MOCK:132`: `<div class="ctl"><span class="l">Help</span><span class="help"><i></i><i></i><i></i><i class="o"></i></span><b>Colors</b></div>`,
  CSS `MOCK:103-105`: `.help{display:inline-flex;gap:4px;margin-left:2px}` `.help i{width:8px;height:8px;border-radius:50%;background:var(--accent)}` `.help i.o{background:rgba(255,255,255,.18)}`.
- **Measured:** four 8 px dots; pill 168 × 44 px.
- **Reading:** the app has five levels, `['None', 'Tonic', 'Target', 'Colors', 'Full']` = 0…4 (`APP:1262`). Three of
  four dots lit with the word "Colors" fits level 3, so four dots = levels 1–4 and no dot = None. MOCK does not say so.
- **States:** one level. Not drawn: how the level is changed (no caret, no − / +).
- **Today:** a five-button `.seg` on the Keys page and in the Lights & help sheet
  (`shots/design/app-sheet-lights-dark-1200.png`; `APP:1257-1276`).

### 4.9 Key bar

- **Given:** `DS:17-19` (the five items, every page, never in a menu). Markup `MOCK:126-133`, a flex row
  `MOCK:85`: `.strip{position:absolute;top:84px;left:72px;right:72px;display:flex;align-items:center;gap:10px}`,
  divider `MOCK:102`: `.sep{width:1px;height:28px;background:var(--line);margin:0 6px}`, `white-space:nowrap` on
  everything (`MOCK:106`). Order: Key, Tempo, divider, Scale lock, LUMI lights, Help.
- **Measured:** top 84 px (20 px under the 64 px header), height 44 px, children 142 + 166 + 1 + 335 + 168 + 168 px,
  natural width 1,042 px; with the 72 px insets it needs a 1,186 px window. At 1024 px the Help pill is cut
  (`shots/design/mock-e-1024.png`).
- **States:** one. Not drawn: any width under 1280, a page that is scrolled, a disabled bar (a sheet or a
  tour: the clef is disabled today while a sheet or a help tour is open, `APP:1624`), a LUMI that is not connected.
- **Today:** `#ctxbar` (`index.html:47-59`): Key, Scale, Mode, BPM, Time, `#cx-met`, then `#cx-led`, `#cx-lock`, a
  colour-mode pair added by script (`APP:1631-1635`: "Intervals" / "Note Names"), and the note line `#cx-tnote`. It is
  an absolutely placed panel, 720 × 149 px at 1200 px and 366 × 253 px at 390 px (measured), hidden unless
  `html.ctx-open` (`STYLE:384-405`). Its controls are already 44 px tall, by rule (`STYLE:415-416`) and by test
  (`tests/context-global.test.js:34`). `cx-*` ids: 62 hits in 8 suites; `ctxbar` / `ctx-btn`: 46 hits in 6 suites.
  ROAD adds a sixth item the mockup lacks: "Note colors: by scale degree (default) … or by note name … Switch in the
  key bar" (`ROAD:28-30`). The mockup shows no Time signature and no metronome button.

### 4.10 Header

- **Given:** "Header (wordmark, 5 tabs, status, gear)" (`DS:44`). Markup `MOCK:114-123`. CSS `MOCK:32`:
  `header{position:absolute;top:0;left:0;right:0;height:64px;display:flex;align-items:center;padding:0 36px;gap:28px}`;
  wordmark `MOCK:33-36` (text "sound" + `<b>LAB</b>` in the accent, Bebas 34 px); tabs `MOCK:37-40`:
  `nav{display:flex;gap:26px;margin-left:12px}`
  `nav a{font-family:var(--font-cond);font-weight:600;font-size:14px;text-transform:var(--caps);letter-spacing:.08em;color:var(--muted)}`
  `nav a.on{color:var(--ink);border-bottom:2px solid var(--accent);padding-bottom:3px}`.
- **Measured:** 64 px high, no background and no bottom border; tab labels 22 px tall text with no padding; active tab
  = ink colour plus a 2 px amber underline.
- **Tokens:** `--sl-display-sm` (wordmark), `--sl-font-cond`, `--sl-text-sm`, `--sl-caps-ls`, `--sl-ink-muted`,
  `--sl-ink`, `--sl-accent`; "header" belongs on `--sl-bg-raised` by `TOK:16`, MOCK draws it on the stage.
- **States:** tab rest and tab on. Not drawn: tab hover / focus, the phone form, the 14 pages under the five tabs.
- **Today:** `<header class="topbar">` (`index.html:20-61`): the wordmark as custom SVG letterforms
  (`index.html:22-35`) and an "alpha" tag (`:36`); `#tabbar` filled by `populateNav` with icon + label buttons
  (`APP:934`, `STYLE:239-265`); `.tb-tools` with the link to Gear `#app-switch` and five icon buttons
  (`index.html:39-46`); the key-bar panel; the page pills `#subnav` / `.subtab` (`index.html:60`, `STYLE:346-380`).
  109 px tall at 1200 px, 93 px at 390 px (measured); sticky, blurred, z-index 50 (`STYLE:163-181`), hides on scroll
  down (`STYLE:186`). The whole block exists twice, in `index.html` and `gear.html`, and
  `tests/assets.test.js:163`, `:169-179` compare the copies; Phase A deferred "the shell built once from JavaScript"
  to B (`CLAUDE.md:1445-1449`, `:1606`).

### 4.11 Footer line with goal ring

- **Given:** "The plan, streak and goal are one quiet footer line" (`DS:11-12`). Markup `MOCK:147-152`:
  `<footer><span><span class="ring"><svg width="28" height="28" …stroke-dasharray="69.1" stroke-dashoffset="20.7"/></svg></span>Today <b>14</b> of 20 min</span><span><b>12</b>-day streak</span><span>This week <b>1</b> of 3 blocks done</span><span class="hint" id="hint"></span></footer>`.
  CSS `MOCK:79-83`: `footer{position:absolute;left:0;right:0;bottom:0;height:64px;display:flex;align-items:center;padding:0 36px;gap:34px;color:var(--muted);font-size:15px;border-top:1px solid var(--line);background:var(--bg)}`,
  hint right-aligned at 13 px.
- **Measured:** 64 px high, pinned to the bottom; ring 28 px, stroke 4 px, r = 11 (circumference 69.1).
- **Tokens:** `--sl-ink-muted`, `--sl-ink` (numbers), `--sl-accent` (ring), `--sl-line` (top border). `TOK:16` puts
  "footer" on `--sl-bg-raised`; MOCK uses the stage colour.
- **States:** one. Not drawn: goal reached, no plan, the phone (where the tab bar is pinned to the same edge).
- **Today:** `.foot` is a text line at the end of the page, "soundLAB alpha — runs entirely in your browser"
  (`index.html:100-102`, `STYLE:469-477`). Streak, minutes and a goal ring exist on the Exercises home
  (`js/quiz.js:1900-1901`).

### 4.12 Card

- **Given:** the word (`DS:44`); "cards 12 px" (`DS:36`); `--sl-surface` = "cards", `--sl-surface-2` = "rows inside
  cards, inputs" (`TOK:17-18`). **MOCK has no card.**
- **States:** none drawn.
- **Today:** `.card` (`STYLE:481-518`; 71 uses in 20 files): `--card` fill, 1 px `--line`, 16 px radius, 20 / 22 px
  padding, an `h2` in Bebas with an amber dot before it (`STYLE:500-509`).

### 4.13 Row (plan block with check state)

- **Given:** the words (`DS:45`). **MOCK has no row.** The home only says "2 blocks left this week" (`MOCK:140`).
- **Today:** the Plan page's blocks (`js/practiceplan.js`, own CSS at `:346`); not mapped here.

### 4.14 Sheet

- **Given:** "Sheet (bottom on phones, side on wide)" (`DS:45`); `--sl-bg-raised` = "sheets" (`TOK:16`);
  `--sl-overlay`, `--sl-shadow-2`, `--sl-z-sheet`; `--sl-display-sm` = "sheet titles" (`TOK:66`). **MOCK has no
  sheet.**
- **Today:** `.sheet` / `.sheet-card` (`STYLE:302-338`): a **centred** dialog, `min(640px, 100%)` wide, scrim
  `rgba(8,7,9,.55)`, z-index 420, title 22 px; a bottom sheet at 640 px and below (`STYLE:981-989`). Measured: at
  1200 px the card is 640 × 555 px in the middle; at 390 px it is 390 × 630 px on the bottom edge. Two sheets,
  `#sheet-metronome` and `#sheet-lights` (`index.html:63-82`), `role="dialog"`, `aria-modal`; opened and closed in `APP:1209-1237`, Tab kept inside in
  `APP:1836`. "Side on wide" and the 640 px switch point both differ from DS.

### 4.15 Toast

- **Given:** the word (`DS:46`); `--sl-z-toast` (`TOK:106`). **MOCK has no toast.**
- **Today:** `#app-toast`, `role="status"`, `aria-live="polite"` (`APP:1982-1994`), styled together with `#snd-hint`,
  `#back-hint`, `#xp-toast` (`STYLE:868-886`): bottom centre, `--card` fill, 1 px accent border, z-index 400, lifted
  above the tab bar at 900 px and below (`STYLE:952`). 27 `App.toast` calls in 9 files; 25 hits in 12 suites. Other
  floating pieces DS does not name: the update banner `#app-update` (`STYLE:888-905`), the remote's HUD
  (`js/remote.js:384`), the Woodshed's flash (`js/woodshed.js:1551`), the help tour (`js/help.js:247`).

### 4.16 Empty, loading and error states

- **Given:** the words (`DS:46`). **Nothing drawn.**
- **Today:** `.error` box (`STYLE:822-829`; 9 uses in 5 files); the boot's "Module … failed to load" text
  (`CLAUDE.md:1216-1217`).

### 4.17 Instrument heroes (keyboard, neck, pads) sharing one lighting model

- **Given:** `DS:14-16`, `DS:46-47`. The footer hint states the model in words: "The LUMI shows the same lights ·
  filled key = play this now" (`MOCK:163`).
- **Keyboard (theme e):** container `MOCK:63`: `.kbd{position:absolute;left:36px;right:36px;bottom:92px;height:230px}`;
  white key `MOCK:64`: `background:var(--key-w);border-radius:0 0 10px 10px;border-left:1px solid rgba(0,0,0,.18)`;
  black key `MOCK:65`: `height:140px;background:var(--key-b);border-radius:0 0 8px 8px;…box-shadow:0 4px 10px rgba(0,0,0,.5)`;
  a scale note = a dot, `MOCK:66-68`: `width:22px;height:22px;border-radius:50%;background:var(--c);box-shadow:0 0 22px var(--c),0 0 6px var(--c)`,
  70 px above the bottom of a white key; on a black key an 18 px dot 22 px above its bottom; "now" = the whole white key
  filled, `MOCK:69-70`: `.kbd .w.now{background:var(--c)}` with its dot removed; a fade into the stage over the lowest
  70 px (`MOCK:71`); note names under the keys, only for scale notes, 13 px muted (`MOCK:72`, `:177`). Built by script
  for two octaves from A plus one key, 15 white keys (`MOCK:164-190`).
- **Measured:** 1,208 × 230 px; white key 81 px wide; black key 47 × 140 px (58 % of a white key, `MOCK:185`).
- **Neck:** drawn only in the rejected theme f (`MOCK:192-218`): horizontal, 13 frets, six strings, scale notes as
  filled circles r = 12 (the 1 is r = 15), "now" = an extra white ring r = 20 (`MOCK:212-214`). Its hint says "filled
  dot = play this now" (`MOCK:195`) although every scale dot is filled and "now" is the ring: the neck picture and its
  own caption disagree.
- **Pads:** nothing drawn anywhere.
- **Tokens:** `--sl-key-white`, `--sl-key-black`, `--sl-string`, `--sl-fret`, `--sl-deg-*`.
- **States drawn:** off, in scale, now. Not drawn: next, pressed, correct, wrong, out of scale under Scale lock, the
  five Help levels, note-name colour mode, labels inside dots, an interactive (playable) hero.
- **Today:** Piano draws one dot per scale key with a letter inside, the tonic with a dark ring, finger numbers and
  the typing keys above the dots (`shots/design/app-piano-light-1200.png`; "pn.look 'dots'", `CLAUDE.md:505`,
  `ROAD:43-45`); lighting goes through one engine with a "now" and a "next" layer (`CLAUDE.md:182-183`:
  `guide(now, next)`, "next blinks"); colour per pitch comes from
  `App.colors.forPitch` and the same value's LUMI velocity from `App.colors.lumiVelocity` (`APP:1339-1341`).

### 4.18 What the pages use today that the list does not name

Counted in 34 of the 39 scripts `index.html` loads (`index.html:103-141`; all but theory, note-palette,
pitch-detector and the two sound-library files): segmented control `.seg` 46 uses in 14 files
(`STYLE:743-773`); native `<select>` 72 in 18; `label.field` 65 in 13 (`STYLE:633-642`); number input 24 in 10;
checkbox 22 in 14 (`STYLE:697`); `<details>` 21 in 12 (`details.tips`, `STYLE:531-557`); range slider 12 in 6
(`STYLE:700-740`); file input 7 in 6; table 5 in 3; text input 4, textarea 3; the page pills `.subtab`
(`STYLE:358-380`; 38 hits in 10 suites); the big numbers `.big-display` / `.mid-display` (`STYLE:559-575`); the help
tour; `confirm()` in 2 files. "Every kept page re-skinned" (`ROAD:56`) needs a rule for each of these.

---

## 5. Layout

### 5.1 What is stated

| Rule | Source |
|---|---|
| "Phone first: 16 px gutters, no horizontal scroll, bottom tab bar ≤ 900 px." | `DS:51`; `--sl-gutter` `TOK:83` |
| "Tablet and PC: the hero spans the width; type scales with `clamp()`." | `DS:52`; `--sl-display-lg` `TOK:68` |
| "FL plugin window (later): everything must work at 1024 × 640." | `DS:53` |
| "Headline never wraps past two lines; the hero is never cropped." | `DS:54` |
| 4 px grid, steps 4 to 72 px | `TOK:75-82` |

**One breakpoint is stated: 900 px.** No max width, no tablet rule, no rule for height.

### 5.2 The mockup at 1280 × 800 (measured)

| Band | Top – bottom (px) | Left / right inset | Source |
|---|---|---|---|
| Header | 0 – 64 | 36 | `MOCK:32` |
| Key bar | 84 – 128 | 72 | `MOCK:85` |
| Eyebrow | 176 – 193 | 72 | `MOCK:48-49` |
| Headline, 100 px Bebas, one line (`white-space:nowrap`) | 207 – 299 | 72 | `MOCK:51` |
| Sub line, 20 px | 317 – 341 | 72 | `MOCK:52` |
| Start button and link | 369 – 435 | 72 | `MOCK:54-55` |
| Keyboard | 478 – 708 | 36 | `MOCK:63` |
| Key names | 718 – 734 | | `MOCK:72` |
| Footer line | 736 – 800 | 36 | `MOCK:79` |

The picture uses all 800 px. The stage has a second layer, an amber glow rising from below the bottom edge
(`MOCK:28`).

### 5.3 Other widths and heights (computed from the mockup's own sizes)

- **1024 × 640 (the FL window):** the stack needs 800 px of height; 160 px are missing. The key bar needs 1,186 px of
  width; 162 px are missing. `shots/design/mock-e-1024.png` shows both cuts. The headline token gives 80 px at this
  width, which saves about 18 px.
- **Headline** `clamp(44px, 7.8vw, 100px)` with the real Bebas file, text "A Dorian, up and down" (21 characters):

  | Window | Font size | Text width | Column (window − 2 × 16) | Lines |
  |---|---|---|---|---|
  | 320 | 44 px | 329 px | 288 | 2 |
  | 360 | 44 px | 329 px | 328 | 2 |
  | 390 | 44 px | 329 px | 358 | 1 |
  | 768 | 59.9 px | 448 px | 736 | 1 |
  | 900 | 70.2 px | 525 px | 868 | 1 |
  | 1024 | 79.9 px | 597 px | 992 | 1 |
  | 1280 | 99.8 px | 747 px | 1,248 | 1 |

  Bebas runs at about 0.356 em per character (748 px for 21 characters at 100 px; a 43-character title measures
  1,513 px). So "never past two lines" holds at 320 px for titles up to about 36 characters, at 390 px up to about 45.
  Line height 0.92 gives 40.5 px per line at the smallest size.
- **Phone keyboard:** two octaves plus one key are 15 white keys; in a 358 px column that is 23.9 px per key, about
  half of `--sl-tap-min`. "Never cropped" and "tappable at 44 px" cannot both hold for a playable two-octave keyboard
  at 390 px.
- **Phone key bar:** 1,042 px of pills against a 358 px column.

### 5.4 Where the shell sits today (measured)

| Piece | 1200 × 800 | 390 × 844 | Source |
|---|---|---|---|
| Top bar | sticky, 109 px: logo row (tabs in it) + pill row | sticky, 93 px: logo + tools row, pill row | `STYLE:163-181`, `:955-962` |
| Section tabs | in the top bar, 38 px high buttons | fixed bottom bar, 64 px high, five 76 × 55 px buttons | `STYLE:239-265`, `:910-953` |
| Page pills | 32 px high | 32 px high | `STYLE:358-366` |
| Key bar | dropdown, 720 × 149 px, right-aligned under the clef | dropdown, 366 × 253 px, full width | `STYLE:384-405`, `:972-979` |
| Page body | max 1,150 px, 18 px side padding | 12 px side padding (at 640 px and below) | `STYLE:455-459`, `:990` |
| Sheets | centred 640 px card | bottom sheet | `STYLE:302-323`, `:981-989` |
| Toast | bottom centre, 18 px up | 84 px up (above the tab bar) | `STYLE:868-883`, `:952` |
| Footer text | end of page | end of page, 84 px bottom padding | `STYLE:469-477`, `:951` |

Breakpoints in STYLE: 1120–901 (hide the tag, `:183`), **900** (tab bar moves, `:910`), 820 (`.grid2`, `:525`),
**640** (compact bar, bottom sheet, 12 px gutters, `:955`, `:972`), 600 (`:417`), 420 (`:969`), 380 (`:964`). No page
scrolls sideways at 1200 or 390 px today (`scrollWidth` = window width on all 15, section 6.5). Gear uses the same
shell: 2 tabs, same heights (`shots/design/gear-deck-dark-1200.png`).

### 5.5 Positions the specification needs, and what is known

| Piece | Desktop (> 900 px) | Phone (≤ 900 px) |
|---|---|---|
| Header | drawn: 64 px, wordmark + 5 text tabs + status + gear | **not drawn.** Stated only: tabs move to a bottom bar (`DS:51`). |
| Key bar | drawn: one row under the header, 44 px | **not drawn**, and it does not fit (5.3) |
| Page pills (14 pages in 5 tabs) | **not drawn** | **not drawn** |
| Hero | drawn: full width minus 36 px, 230 px high, above the footer | **not drawn** |
| Footer line | drawn: pinned, 64 px | **not drawn**; collides with the bottom tab bar |
| Bottom tab bar | none | stated (`DS:51`); exists today (`STYLE:910-949`) |
| Sheet | stated: "side" (`DS:45`) | stated: "bottom" |

---

## 6. Accessibility

DS states four rules (`DS:58-61`): AA contrast for all text in both themes; a visible focus ring on every control and
a full keyboard path; a label for every control and status by text and icon, not colour alone; respect reduced motion,
no autoplaying motion on the home.

### 6.1 Text on surfaces (WCAG 2 contrast ratio; AA needs 4.5 for normal text, 3.0 for text ≥ 24 px or ≥ 18.7 px bold)

Computed from TOK by `work-design/contrast.js`; translucent tokens are flattened onto the surface first.
**Bold = below 4.5.**

**Dark**

| Text token | on `--sl-bg` | on `--sl-bg-raised` | on `--sl-surface` | on `--sl-surface-2` |
|---|---|---|---|---|
| `--sl-ink` | 17.22 | 16.40 | 15.49 | 14.05 |
| `--sl-ink-muted` | 6.52 | 6.21 | 5.87 | 5.32 |
| `--sl-ink-faint` (decorative by rule) | **3.25** | **3.09** | **2.92** | **2.65** |
| `--sl-accent` as text | 10.29 | 9.80 | 9.26 | 8.39 |
| `--sl-ok` | 10.68 | 10.17 | 9.61 | 8.71 |
| `--sl-warn` | 10.98 | 10.45 | 9.88 | 8.95 |
| `--sl-bad` | 7.15 | 6.81 | 6.43 | 5.83 |
| `--sl-info` | 8.01 | 7.63 | 7.21 | 6.53 |
| on an `--sl-accent-soft` fill: `--sl-ink` | 13.51 | 12.58 | 11.70 | 10.49 |
| on an `--sl-accent-soft` fill: `--sl-accent` | 8.07 | 7.52 | 6.99 | 6.27 |
| on an `--sl-accent-soft` fill: `--sl-ink-muted` | 5.12 | 4.76 | **4.43** | **3.97** |

`--sl-accent-ink` on `--sl-accent` (primary button): 9.86.

**Light**

| Text token | on `--sl-bg` | on `--sl-bg-raised` | on `--sl-surface` | on `--sl-surface-2` |
|---|---|---|---|---|
| `--sl-ink` | 15.33 | 14.29 | 17.26 | 14.56 |
| `--sl-ink-muted` | 5.06 | 4.72 | 5.70 | 4.81 |
| `--sl-ink-faint` (decorative by rule) | **2.43** | **2.26** | **2.73** | **2.30** |
| `--sl-accent` as text | **3.24** | **3.02** | **3.64** | **3.07** |
| `--sl-ok` | **3.90** | **3.64** | **4.39** | **3.70** |
| `--sl-warn` | 4.86 | 4.53 | 5.47 | 4.61 |
| `--sl-bad` | 4.86 | 4.54 | 5.48 | 4.62 |
| `--sl-info` | 4.74 | **4.42** | 5.34 | 4.50 |
| on an `--sl-accent-soft` fill: `--sl-ink` | 13.49 | 12.65 | 15.04 | 12.86 |
| on an `--sl-accent-soft` fill: `--sl-accent` | **2.85** | **2.67** | **3.18** | **2.72** |
| on an `--sl-accent-soft` fill: `--sl-ink-muted` | **4.45** | **4.18** | 4.97 | **4.25** |

`--sl-accent-ink` (`#ffffff`) on `--sl-accent` (`#c96f0a`): **3.64**. It passes only as large text, which the 22 px
bold Start label is; a primary button with 14–16 px text fails.

**Failures to fix before any light page is built:**
1. Light: accent-coloured text (the eyebrow `MOCK:49`, the lock hint `MOCK:100`, an active label) on every surface.
2. Light: white on the accent for any primary button smaller than the hero button.
3. Light: `--sl-ok` on all four surfaces; `--sl-info` on `--sl-bg-raised` (and 4.50 on `--sl-surface-2` is on the line).
4. Both themes: `--sl-ink-muted` on an accent-soft fill (dark on `--sl-surface` and `--sl-surface-2`; light on three
   of four).
5. Both themes: `--sl-ink-faint` fails as text everywhere, which the rule allows ("never for text that matters",
   `TOK:26`); it must then never carry text.

For comparison, the variables the app uses today pass in dark everywhere; in light `--muted` is 4.33 on `--panel`,
4.41 on `--card2` and 3.99 on `--inset`, and the accent as text is handled by a darker `--accent-ink` (`#98580b`,
4.7–5.5 on bg, panel, card and card2). The light token set dropped that fix.

### 6.2 Things that are not text (WCAG 1.4.11 asks 3.0 for the parts needed to see a control or a state)

| Pair | Dark: bg / raised / surface / surface-2 | Light: bg / raised / surface / surface-2 |
|---|---|---|
| `--sl-line` (border) | **1.20 / 1.23 / 1.25 / 1.27** | **1.19 / 1.19 / 1.20 / 1.19** |
| `--sl-line-strong` (border) | **1.38 / 1.32 / 1.25 / 1.13** | **1.37 / 1.28 / 1.54 / 1.30** |
| `--sl-accent-line` (border of an "on" control) | 4.29 / 4.23 / 4.13 / 3.92 | **1.86 / 1.80 / 1.97 / 1.82** |
| `--sl-focus` ring colour | 3.78 / 3.75 / 3.68 / 3.52 | **1.75 / 1.71 / 1.84 / 1.72** |
| `--sl-accent` fill (switch on, goal ring, button edge) | 10.29 / 9.80 / 9.26 / 8.39 | 3.24 / 3.02 / 3.64 / 3.07 |
| `--sl-ink-faint` as a graphic | 3.25 / 3.09 / **2.92** / **2.65** | **2.43 / 2.26 / 2.73 / 2.30** |

In the mockup: the pill border against the stage is 1.20 and against its own fill 1.13; the switch's off track 1.46;
an unlit help dot 1.75; the goal ring's track 1.36; the white knob on the amber track 1.88. A pill, an "off" switch and
an unlit help dot are found by their text only. (Today's borders fail the same measure: `--ctl-border` on `--card` is
1.80 dark, 1.97 light. It is not a step back; it is a rule DS states and the tokens do not meet.)

### 6.3 The instrument

| Pair (needs 3.0) | Dark | Light |
|---|---|---|
| Degree 1 – 7 dot on a white key | **2.62, 1.69, 1.16, 1.47, 1.49, 2.95, 2.60** | 3.27, **2.11, 1.44, 1.84, 1.87**, 3.69, 3.25 |
| Degree 1 – 7 dot on a black key | 5.41, 8.38, 12.26, 9.63, 9.48, 4.80, 5.45 | 4.64, 7.19, 10.52, 8.26, 8.13, 4.12, 4.67 |
| Degree 1 – 7 dot on the stage (`--sl-bg`) | 5.25 – 13.40 | **2.91, 1.88, 1.28, 1.63, 1.66**, 3.28, **2.89** |
| Degree 1 – 7 dot on a card (`--sl-surface`) | 4.72 – 12.06 | 3.27, **2.11, 1.44, 1.84, 1.87**, 3.69, 3.25 |
| White key against the stage | 15.48 | **1.13** (and 1.00 on a card) |
| Black key against a white key | 14.16 | 15.19 |
| String against the stage / a card | 10.24 / 9.22 | 4.18 / 4.71 |
| Fret against the stage / a card | **1.78 / 1.60** | **1.42 / 1.60** |

Text that would sit **on** a degree colour: `#1a1206` (dark `--sl-accent-ink`) passes on all seven (5.0 – 12.8);
white fails on all seven (1.4 – 3.7). So a label inside a dot must be dark in both themes, and the light theme's
`--sl-accent-ink` (white) must not be used for it. `--sl-ink` on a white key is 1.11 in dark; `--sl-ink` on a black key
is 1.14 in light: ink colours cannot be used on keys.

"Filled key = play this now" is the degree colour against the neighbouring unlit white key: the same numbers as the
first row. In dark, no degree reaches 3.0; yellow is 1.16. Colours also sit close to each other and to the status set:
degree 1 red against `--sl-bad` 1.21, degree 2 orange against the accent 1.12, degree 4 green against `--sl-ok` 1.02.
Colour alone cannot carry "which degree" or "play now"; the mockup's hero has no second cue except the dot's position.

In the light theme a token swap of the mockup makes the keyboard dissolve: white keys on a `#f5f1ea` stage, a pill
border nobody can see (`shots/design/tokens-home-light-1280.png`).

### 6.4 Focus ring

- **Given:** "Visible focus ring (`--sl-focus`) on every control; full keyboard path" (`DS:59`). The token is a 3 px
  half-transparent amber `box-shadow` (`TOK:94`, `:135`).
- **Computed:** 3.5 – 3.8 against dark surfaces; **1.7 – 1.8 against light surfaces**. On a control that is itself
  amber (the Start button, a switch that is on) the ring is amber on amber in both themes.
- A `box-shadow` is not painted in forced-colours mode (a browser rule, not measured here), so the ring would vanish
  for those users.
- **Today:** `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` (`STYLE:694`), measured on
  `#met-btn` as `solid 2px rgb(255,171,71)` in dark and `rgb(217,126,15)` in light; text fields and selects use a
  3 px `--accent-soft` halo instead (`STYLE:691-692`).
- MOCK has no focusable element.

### 6.5 Tap target

- **Given:** "every control is tappable at 44 px" (`DS:37`); `--sl-control-h` 44 px, 48 px on touch; `--sl-tap-min`
  44 px (`TOK:92-93`, `:140-142`).
- **Mockup against the rule:** gear 34 px (`MOCK:46`), stepper buttons 24 px with a 4 px gap (`MOCK:93`), "Something
  else" 19 px, tab labels 22 px with no padding. The pills (44 px) and the Start button (66 px) comply.
- **Today**, visible controls in the open page, counted in the browser (`work-design/taps.js`; a control counts when
  its height or width is under 43.5 px):

  | Page | 390 px: controls / under 44 / smallest height | 1200 px: controls / under 44 | Page height at 390 px | `.card` blocks |
  |---|---|---|---|---|
  | Exercises | 61 / 3 / 32 | 61 / 3 | 7,938 | 1 |
  | Chords | 35 / 35 / 16 | 35 / 35 | 2,010 | 2 |
  | Circle | 16 / 11 / 32 | 16 / 11 | 1,922 | 3 |
  | Plan | 28 / 22 / 23 | 28 / 23 | 2,744 | 9 |
  | Neck | 24 / 24 / 16 | 24 / 24 | 1,133 | 1 |
  | Tab | 10 / 10 / 32 | 10 / 10 | 844 | 1 |
  | Notation | 8 / 8 / 32 | 8 / 8 | 883 | 1 |
  | Piano | 89 / 54 / 16 | 93 / 84 | 2,329 | 7 |
  | Charts | 45 / 44 / 22 | 45 / 44 | 2,630 | 2 |
  | Pads | 13 / 5 / 16 | 13 / 5 | 925 | 2 |
  | Songs | 13 / 13 / 16 | 13 / 13 | 1,387 | 4 |
  | Jam | 42 / 40 / 16 | 42 / 40 | 1,798 | 2 |
  | Woodshed | 71 / 71 / 16 | 71 / 67 | 3,568 | 5 |
  | Tuner | 21 / 21 / 16 | 21 / 21 | 1,335 | 2 |
  | Settings | 34 / 34 / 20 | 34 / 34 | 3,402 | 8 |

  Header at 390 px: every tool is 38 × 38 px (the Gear link 53 × 38 px), the bottom tabs 76 × 55 px, the page pills
  32 px high. The 16 px rows are checkboxes (`STYLE:697`). The count includes piano keys and neck positions where they
  are buttons.
- The key-bar dropdown is the one place already at 44 px, with a test: `tests/context-global.test.js:34`.

### 6.6 Reduced motion

- **Given:** "Respect `prefers-reduced-motion`; no autoplaying motion on the home" (`DS:61`); the two duration tokens
  become 0 ms (`TOK:144-146`).
- **Today:** one global rule switches off every CSS animation and transition (`STYLE:995-997`). It covers CSS only.
  Motion made in script (canvas drawing, a blinking "next" key, the metronome's pulse on `#met-btn`, `STYLE:298`) is
  outside it; in `js/` only one line mentions the preference, in a Gear file (`js/synthtab.js:532`).
- The tokens only help where a component writes `transition: … var(--sl-dur)`. Today's rules use literal times
  (`STYLE:258`, `:324`, `:406`, `:462`).
- On the LUMI the "next" key blinks (`CLAUDE.md:182-183`, `:227`). A hero that copies the LUMI "exactly"
  (`DS:15-16`) would blink too: motion that starts by itself, which the home must not have (`DS:61`).

### 6.7 Labels and status

- **Given:** "Labels for every control; status by text + icon, not color alone" (`DS:60`).
- MOCK: the header status is a coloured dot plus a device name (`MOCK:119-120`); the dot's colour is the only sign of
  "connected". The help level is dots plus the level's name (complies). The switch shows "ON ·" in words (complies).
- Today the shell's icon buttons all carry `aria-label` and `title` (`index.html:41-45`), the key bar is a labelled
  region (`index.html:47`), sheets are labelled dialogs (`index.html:64`, `:74`), and one suite checks contrast of the
  key-bar fields in both themes (`tests/context-global.test.js:117-131`).

---

## 7. What "light theme" means concretely

1. **Which tokens flip:** 26 of 69 (`TOK:110-138`): the 7 surface tokens, 3 inks, 5 accent tokens, 4 status colours,
   the 4 key and string colours, `--sl-focus` and the 2 shadows. **Not flipped:** the 7 degree colours, all type,
   space, shape, control sizes, motion and layers.
2. **Is there a light mockup?** No. MOCK's two themes are both dark: e (amber) and f (violet) (`MOCK:13-24`).
   `docs/design/` holds nothing else. DS describes light in one clause: "light theme is a token swap" (`DS:29`).
3. **What a token swap gives:** `shots/design/tokens-home-light-1280.png` is MOCK with its seven colour variables
   pointed at the light tokens and nothing else changed. Visible there: white keys nearly invisible on the stage;
   pill borders and fills gone (they are white at 3–8 % opacity, `MOCK:17`, `:86`); the unlit help dot and the goal
   ring's track gone (`MOCK:105`, `:148`); yellow, green and cyan dots weak on white keys; the amber eyebrow and lock
   hint under AA (6.1). The dark render of the same swap (`tokens-home-dark-1280.png`) matches the mockup except for
   the lighter muted grey.
4. **What the current light theme does:**
   - One attribute, `data-theme="light"` on `<html>`, set by `applyTheme` (`APP:847-854`); the preference `app.theme`
     is `'dark' | 'light' | 'auto'`, default dark, `'auto'` follows the device live (`APP:808-811`, `:856-866`,
     `:1854`). The same function sets the browser bar colour to `#f3efe8` / `#131114` (`APP:851-852`).
   - STYLE re-defines 22 variables (`STYLE:81-108`) and adds three explicit rules: the top bar's translucent fill
     (`:111-113`), the select chevron in a darker amber (`:116-121`), the bottom tab bar's fill (`:926`).
   - The chosen accent is re-applied per theme (`APP:817-839`, `:853`).
   - Settings › Appearance has the three-way switch (`js/settings.js:57-65`, `:631-638`).
   - Six soundLAB modules carry their own light rules inside their injected CSS: `js/chords.js:1062-1063`,
     `js/fretboard.js:1735` and `:1768`, `js/keylessons.js:811`, `js/pads.js:157`, `js/quiz.js:2774`,
     `js/theorytab.js:399-402`; the Woodshed reads the attribute for its canvas (`js/woodshed.js:832`); in Gear,
     `js/synthdeck-scope.js:70`, `:453`.
   - Three suites touch the theme: `tests/context-global.test.js:117-131` (contrast of the key-bar fields in both
     themes), `tests/gear.test.js:435`, `tests/synthdeck-scope.test.js:244-253`.
   - It works today: `shots/design/app-quiz-light-1200.png`, `app-piano-light-1200.png`,
     `app-fretboard-light-390.png`. Both themes share TOK's selector, so the token values already follow the switch
     (measured: `--sl-bg` reads `#f5f1ea` in light).
5. **So "light theme" in Phase B is three jobs:** (a) correct the light token values that fail (6.1 – 6.4);
   (b) give every colour the components need a token, so no component holds a literal white or black (3.14);
   (c) decide the instrument in light: keys need an outline against the stage, dots need a ring or a label.

---

## 8. Contradictions

| # | Between | What |
|---|---|---|
| C1 | TOK and its own rule | "both themes … must pass WCAG AA" (`TOK:7`), "every pairing keeps ≥ 4.5:1" (`TOK:109`); section 6.1 lists the pairs that do not. |
| C2 | DS and MOCK | "every control is tappable at 44 px" (`DS:37`) against the 34 px gear, 24 px stepper buttons and 19 px link (`MOCK:46`, `:93`, `:59`). |
| C3 | DS and MOCK | "status by text + icon, not color alone" (`DS:60`) against the status dots (`MOCK:44`, `:119-120`). |
| C4 | TOK and MOCK | "Bebas buttons and tabs" (`TOK:70`) against buttons and tabs in Barlow Condensed (`MOCK:38`, `:55`). |
| C5 | TOK and MOCK | header and footer on `--sl-bg-raised` (`TOK:16`) against a header with no fill and a footer on the stage colour (`MOCK:32`, `:79`). |
| C6 | TOK and MOCK | muted `#9d939b` (`TOK:25`) against `#8e858c` (`MOCK:14`); status green; radii 8 / 12 / 20 against 10 (`MOCK:16`); the sizes and spacings in 3.14. |
| C7 | ROAD and DS / MOCK | "Note colors … Switch in the key bar" (`ROAD:28-30`) against a key bar of five items without it (`DS:17-19`, `MOCK:126-133`). The app has the switch twice: in the key bar (`APP:1631-1635`) and in the Lights & help sheet (`js/lights.js:41-45`). |
| C8 | DS and the app | "the ONLY accent" (`DS:31`) against the four-accent picker (`APP:817-822`, `js/settings.js:66-67`). |
| C9 | TOK and the app | degree colours (finding 6): different defaults, user-editable, LUMI-quantised, twelve steps, two modes. With the token colours degree 1 would be red; today it is amber, the accent. |
| C10 | DS and the app | "never buried in a menu" (`DS:19`) against the key bar as a dropdown (`STYLE:405`) and a top bar that hides on scroll (`STYLE:186`). |
| C11 | MOCK and the app | a text wordmark in Bebas (`MOCK:33-36`, `--sl-display-sm` "wordmark", `TOK:66`) against the custom SVG wordmark (`index.html:22-35`). |
| C12 | MOCK and the app's rule | uppercase tabs and button (`MOCK:38`, `:55`) against "nav, pills, buttons and chips are title case" (`STYLE:646-647`, `CLAUDE.md:1915-1916`). |
| C13 | MOCK with itself | the key bar says Tempo 100 (`MOCK:128`), the lesson line says 72 BPM (`MOCK:137`). The app has one shared tempo, `met.bpm` (`APP:1698-1699`, `CLAUDE.md:1885`). |
| C14 | MOCK with itself | the neck's hint "filled dot = play this now" (`MOCK:195`) against a picture where "now" is a white ring (`MOCK:214`). |
| C15 | DS with itself | "Dashboards of cards were rejected" (`DS:12-13`) and "Card" in the component list (`DS:44`); 71 `.card` uses in 20 files. |
| C16 | DS and the app | "Sheet (bottom on phones, side on wide)" (`DS:45`) against a centred dialog that turns into a bottom sheet at 640 px (`STYLE:302-323`, `:981`). |
| C17 | DS and layout | "the hero is never cropped" and 44 px targets against 15 white keys in 358 px (5.3). |
| C18 | ROAD phases | "new home" is Phase B (`ROAD:56`); "streak/goal/review on home" is Phase D (`ROAD:59`); the mockup's home shows a teacher's lesson, a weekly plan and "FL Studio" connected (`MOCK:120`, `:135`, `:150`), which are Phases D and F (`ROAD:59`, `:61`). |
| C19 | MOCK and the app | a header with wordmark, tabs, two status items and a gear (`MOCK:114-123`) against a header that also has the link to Gear, help, the clef, lights and the metronome (`index.html:40-45`); the link to Gear must stay a real link (`CLAUDE.md:1450-1457`). |
| C20 | TOK and the app | layer numbers (finding 10). |

---

## 9. Open questions, each with a recommended answer

**Tokens**

- **Q1. Accent as text has no token and fails in light.** Add `--sl-accent-text`: dark `#ffab47`, light `#8a4a00`
  (computed 5.7 – 6.9 on the four light surfaces and 5.0 – 6.0 on accent-soft fills). Use it for every amber word;
  keep `--sl-accent` for fills and graphics. Write in DS that today's `--accent-ink` maps to it, not to
  `--sl-accent-ink`.
- **Q2. White on amber in light is 3.64.** Set light `--sl-accent-ink` to `#1a1206` (5.08 on `#c96f0a`): dark text on
  amber in both themes, as today (`STYLE:602`). The alternative, white on a deeper `#a85a00` (5.09), changes the amber.
- **Q3. Light `--sl-ok` and `--sl-info`.** `--sl-ok: #187538` (4.78 – 5.77), `--sl-info: #2c64c2` (4.69 – 5.66).
- **Q4. Muted text on an accent-soft fill.** Make it a rule, not a colour change: on an "on" fill the text is
  `--sl-ink` or `--sl-accent-text`, never `--sl-ink-muted` (the mockup's lock pill already does this, `MOCK:130`).
- **Q5. Borders at 1.2:1.** Add `--sl-line-control` for a boundary that alone shows a control (input, select chip,
  stepper button, off switch, empty checkbox): dark `#80767e` (3.6 – 4.4), light `#857b82` (3.4 – 4.1). Keep
  `--sl-line` for separators. Owner call whether pills keep the quiet 8 % border when their label identifies them.
- **Q6. Focus ring.** Make it opaque and two-layered so it shows on any fill, and add an outline for forced colours:
  `outline: 2px solid transparent; box-shadow: 0 0 0 2px var(--sl-bg), 0 0 0 4px var(--sl-accent-text)` (dark 8.4 –
  10.3, light 5.7 – 6.9 against the surfaces). Re-define `--sl-focus` to that list.
- **Q7. Degree colours: tokens or `App.colors`?** Keep `App.colors` as the only source (user-editable, LUMI-quantised,
  twelve steps, two modes). Components receive the colour as an inline custom property, as the mockup does with `--c`
  (`MOCK:66`, `:175`) and the app with `--deg-c`. Phase B changes no colour. Whether the seven defaults become the
  token set is the Phase C item "degree colors default" (`ROAD:58`); if yes, `APP:1287` and `TOK:43-49` must hold the
  same seven values and a test compares them. Tell the owner the token set turns degree 1 from amber into red.
- **Q8. The missing tokens.** Add: a sunken track (`--inset` today), a label ink or decide labels use
  `--sl-ink-muted`, a control fill (the mockup's 3 % white), switch knob and off-track, a "dot off" grey, the stage
  glow, an instrument outline. Decide `--teal` (11 uses) case by case in the page re-skins.
- **Q9. `--sl-accent-glow` is a shadow, `--accent-glow` a colour.** Keep both ideas apart: `--sl-accent-glow` stays
  the button shadow; add `--sl-accent-glow-color` for the 22 places that need a colour.
- **Q10. Type and spacing the mockup uses off the scale.** Snap: 13 → 12 or 14 px, 15 → 14 (labels in pills) or 16
  (body), 22 → 20; 36 → 32, 10 → 8 or 12, 26 / 28 → 24, 34 → 32. Add weight tokens (400, 500; condensed 600, 700)
  and use Barlow 500 for emphasis, or ship `barlow-600.woff2` (one more file in `sw.js` ASSETS).
- **Q11. Layers.** Extend the token set (bar 20, popover 30, sheet 40, tour 50, toast 60) and convert the whole shell
  in one step: top bar, tab bar, key bar, sheets, toasts, help tour, remote HUD. Module numbers (200 – 9999) move with
  each page.
- **Q12. The accent picker.** Remove it in Phase B (amber only, `DS:31`); `app.accent` is ignored, not deleted. Needs
  the owner's yes, it is a feature he can see.

**Components**

- **Q13. States nobody drew.** One model for every control: hover only under `(hover: hover)`: fill one surface step
  lighter; focus-visible: the ring of Q6; active: fill one step darker, no movement; disabled: `--sl-ink-faint` text,
  no shadow, `aria-disabled` or `disabled`; on: `--sl-accent-soft` fill, `--sl-accent-line` border,
  `--sl-accent-text` label, plus `.active` and `aria-pressed` so the suites keep working.
- **Q14. Sizes.** Three heights: hero 64 px (the one Start button on a page), default `--sl-control-h` (44 / 48),
  and a compact 36 px tier only on fine pointers inside dense tool rows, with the hit area padded to 44 px. Without
  the compact tier the Piano page's 89 controls grow by a third in height.
- **Q15. Select chip: native or custom?** Keep a native `<select>` inside the chip (keyboard, screen reader and phone
  pickers for free; `#cx-root`, `#cx-scale`, `#cx-mode`, `#cx-sig` keep working in 8 suites); draw the caret with an
  icon from `App.icon`, not a data URL.
- **Q16. Stepper.** − and + are 44 px targets (visible circle 28 px); the number is a real `input type="number"`
  that can be typed (`#cx-bpm` stays); press-and-hold repeats; limits 30 – 280 as today.
- **Q17. Help dots.** A button showing four dots and the level name; it opens a short list of the five levels with
  their one-line descriptions (the texts are in the Lights & help sheet). No dots lit = None.
- **Q18. Switch.** A `<button role="switch" aria-checked>` that also keeps `.active` and `aria-pressed`; the off pill
  reads "Scale lock · off: every note sounds".
- **Q19. Status chips.** Text states the state ("LUMI connected", "No LUMI"), the dot only repeats it; a chip opens
  the Lights & help sheet. "FL Studio" does not appear before Phase F.
- **Q20. Lighting model.** In scale = a dot with a dark 1.5 px ring (`--sl-key-black` is 4.8 – 12.3 against all seven)
  and, from Help level Colors up, its degree number or note name in dark text; now = the filled key (or filled dot on
  the neck) plus a dark outline; next = an empty ring in the degree colour, steady under reduced motion; pressed,
  correct, wrong keep today's text and icon cues. Needs a mockup of all three instruments before it is built.
- **Q21. Heroes.** On a practice page the hero is the real, playable instrument; on the home it is a picture of the
  first bar, not playable, so 24 px keys are acceptable there. The neck is horizontal above 900 px and vertical below,
  as today. Pads: a 4 × 2 grid with the same now / next vocabulary. All three need a phone mockup.
- **Q22. Page templates.** Define four and say which page uses which: home (headline, Start, hero, footer line);
  practice page (key bar, instrument hero, one primary action, controls in a sheet); tool page (Tuner, Jam, Charts,
  Songs: a title at `--sl-display-sm`, cards allowed); settings (cards). "One headline at `--sl-display-lg`" then
  applies to home and practice pages only.
- **Q23. Class names and file.** New components get an `sl-` prefix (`.sl-btn`, `.sl-chip`, …) in one new file
  `css/components.css` loaded after TOK; it joins both `<head>` blocks, `sw.js` ASSETS and the head comparison in
  `tests/assets.test.js:163`. The old class contracts (`STYLE:5-7`) are re-pointed at tokens, not renamed.
- **Q24. A bridge for the old variables.** First re-skin step: define today's variables from tokens in STYLE
  (`--bg: var(--sl-bg)` and so on, table 3.13), so 30 files change colour at once with no edit, Gear included. Then
  clean up page by page. The four with no token (Q8) and the two conflicts (`--accent-ink`, `--accent-glow`) are
  settled first.

**Shell and layout**

- **Q25. Key bar contents.** Six items: Key (one chip for root, scale and mode), Tempo, Scale lock, LUMI lights, Help,
  Colors (Degree | Note name, `ROAD:28-30`). Time signature and metronome start / stop move into the Tempo chip's
  popover and stay in the metronome sheet; `#cx-sig` and `#cx-met` keep their ids.
- **Q26. Key bar under 1,190 px and on phones.** One sticky row of compact chips (values only, labels hidden: "A
  Dorian", "100", a lock, a light, the dots); each opens a bottom sheet with the full control. The hint sentence drops
  first, then labels. This is the largest undrawn piece: mock it at 390, 768 and 1024 px before building.
- **Q27. Does the bar hide on scroll?** No. The header may hide on phones as today; the key bar stays.
- **Q28. Header contents.** Wordmark (the SVG, C11), five tabs, status chips, then the tools that exist: metronome,
  help (?), settings, and the link to Gear (a real link, `CLAUDE.md:1450-1457`). The clef and lights buttons go when
  the key bar is always visible; that changes 6 suites (`ctxbar` / `ctx-btn`). The "alpha" tag becomes "beta" or goes.
- **Q29. Where are the 14 pages?** Keep the pill row under the header (`#subnav`, 10 suites), drawn as chips. The
  mockup simply has none because the home has no siblings in the picture.
- **Q30. Is the home a new page?** Yes: a page `home`, first in the Learn group, `HOME = 'home'`. 22 suites contain
  `App.active === 'quiz'` (25 places), most as the boot wait; they get a seeded `app.tab: 'quiz'` or are updated in
  the same step.
  The alternative, re-drawing the Exercises home, keeps the suites but leaves a 7,900 px page behind the "one thing".
- **Q31. What feeds the home in Phase B.** What exists: the Exercises "Continue" node, today's minutes, goal and
  streak (`js/quiz.js:1900-1901`), the Plan's blocks. Build the home on those; "from James", the weekly review and FL
  status arrive with Phases D and F (C18).
- **Q32. Footer line.** Home and result views only. Pinned on wide screens; on phones it is the last block of the
  page above the tab bar, shortened to ring, minutes and streak. The old text footer (`index.html:100-102`) goes.
- **Q33. Sheets.** Right-hand side panel, 420 – 480 px, above 900 px; bottom sheet at 900 px and below: one switch
  point for the whole shell instead of 900 and 640. Ids, `role="dialog"` and the focus trap stay.
- **Q34. Max width and gutters.** Text column max 1,136 px with `--sl-space-8` (72 px) insets above 900 px; the hero
  may run to `--sl-space-6` (32 px) from the edges; 16 px gutters at 900 px and below (today 12 px at ≤ 640 px).
- **Q35. 1024 × 640.** Add a height rule: headline `min(7.8vw, 11vh)` inside the clamp, hero height = what is left,
  never under 120 px; the footer line folds into the header's status area under 700 px of height. Add a test at
  1024 × 640 for "no vertical scroll on the home".
- **Q36. Casing.** Follow the mockup for the five tabs and the hero button (caps, Barlow Condensed, `--sl-caps-ls`);
  everything else stays title or sentence case (`STYLE:646-647`). Correct the comment at `TOK:70`.
- **Q37. One tempo on screen (C13).** The bar shows the tempo that will sound. A lesson with its own tempo writes it
  to the bar when it starts; the home's sub line shows the lesson's tempo, and the bar shows the same number.
- **Q38. Browser bar and install colours.** Move `#131114` / `#f3efe8` to `#0f0d10` / `#f5f1ea` in `APP:852`,
  `index.html:6`, `gear.html:6`, `manifest.webmanifest:9-10`.
- **Q39. Motion made in script.** One helper, `App.reducedMotion()`, read by canvas drawing, blinking and pulses;
  the home never starts motion by itself.
- **Q40. Gear.** The shell is built once for both apps (`CLAUDE.md:1445-1449`), so Gear gets the new shell in Phase B
  and its four pages keep their layout until Phase H (`ROAD:64`); the bridge of Q24 gives them the new colours.
- **Q41. A contrast suite.** Add a pure-Node suite that parses TOK and fails on any listed text pair under 4.5 and any
  listed control boundary under 3.0, in both themes (`work-design/contrast.js` is a starting point), so C1 cannot come
  back.

---

## 10. Evidence

All under `scratchpad/v2/phaseB/`.

| File | What |
|---|---|
| `shots/design/mock-e-1280.png`, `-1200`, `-1024`, `-390` | the mockup, theme e, at four window sizes |
| `shots/design/mock-f-1280.png` (+ 1200, 1024, 390) | the runner-up, the only neck picture |
| `shots/design/mock-e-1280-measure.json` | boxes, fonts and colours of every mockup element |
| `shots/design/tokens-home-dark-1280.png`, `tokens-home-light-1280.png` | the mockup drawn with the real tokens, both themes |
| `shots/design/tokens-measure.json` | headline widths per window size, key-bar widths, the vertical stack |
| `shots/design/app-<page>-<theme>-<width>.png` | the app today: quiz, piano, fretboard, practiceplan, chords, shed, jam, songs, tuner, pads, ctx (key bar open), sheet-lights, sheet-met, settings, focus; dark and light; 1200 and 390 |
| `shots/design/gear-deck-dark-1200.png`, `-390` | Gear's Deck |
| `shots/design/app-measure.json` | shell boxes, tool and tab sizes, focus style, sheet position, per theme and width |
| `shots/design/tap-baseline.json` | controls under 44 px per page (6.5) |
| `work-design/contrast.js`, `contrast.txt`, `contrast.json` | the contrast computation and its full output (352 lines) |
| `work-design/fix.js` | the candidate values in Q1 – Q6 |
| `work-design/mock.js`, `app.js`, `tokens-render.js`, `taps.js` | the Playwright scripts |
