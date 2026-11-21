# soundLAB 2.0 design system — "E · Stage"

Chosen 2026-11-09 after three rounds of home-page mockups. The reference picture
is `docs/design/home-e-stage.png`; its source is `docs/design/home-mockup.html`
(open with `?theme=e`; `?theme=f` is the runner-up kept for comparison). Tokens
live in `css/tokens.css` and load before everything else.

Since Phase B step B1b this document is the specification of that look: the
principles as rules a page can be checked against, every token with both values,
every component with its class name, markup, sizes and states, the page
templates, the layout numbers and the lighting of the instruments.

## How to read this document

- **What is built.** Only the tokens are in the app (step B1a). Everything else
  here is drawn, not built: the drawings are under `docs/design/phase-b/`, and
  the owner's page [design/phase-b/index.html](design/phase-b/index.html) asks
  the open questions beside the pictures. Each later step of Phase B builds its
  piece from this document and corrects the document in the same pull request.
- **Where a number comes from.** Token values: `css/tokens.css`. Class names,
  parts, sizes and states: `docs/design/phase-b/mock.css`, the first draft of
  `css/components.css`. Contrast: `tests/tokens.test.js`, which computes it from
  the token file. Heights "measured" were measured on the drawings in headless
  Chromium (build 1243) on 21 November 2026; the measuring scripts and their
  pictures are not in the repository, and `home.html` prints its own numbers
  under each picture.
- **Two heights.** "48 / 44" means 48 px where a finger can be the pointer
  (`any-pointer: coarse`) and 44 px with a mouse only.
- **Decisions and gates.** A decision named D with a number, a step named B
  with a number and the gates G1 to G4 are those of the plan,
  `docs/plans/phase-b/PLAN.md`.
- **Changed.** Four passages of the earlier one-page text no longer hold. They
  are marked **Changed** where they stand: the headline size, the 44 px rule
  (only if the owner agrees), the card's radius, and what the seven degree
  tokens are.
- **Waiting for the owner.** Four gates: G1 the key bar, G2 the header, G3 the
  home, G4 the instruments' lighting and palette. And one question about this
  document itself: the dense tier (see "Control heights").

## Principles

Each principle keeps its words. Under it stand the rules a page is checked
against; a reviewer can check them on a picture, and the `look` and `home`
suites of Phase B check them by script.

1. **One thing on screen.** A page shows the next step and a Start button. The
   plan, streak and goal are one quiet footer line. Everything else is behind
   "Something else" or a sheet. Dashboards of cards were rejected as "too busy
   and too plain".
   - The home and every practice page have one `h1` and exactly one primary
     button on the first screen at 390 × 844, 1024 × 640 and 1280 × 800.
   - On the home the headline, the button and the whole instrument are on the
     first screen without scrolling at 390 × 844, 1024 × 640 and 1280 × 800.
   - Every other choice is one tap away: the fold "Something else", a fold of
     the page, or a sheet. The first view is never a grid of cards.
   - The nine tool pages keep today's arrangement in Phase B and get one `h1`
     and exactly one primary button on the first screen at the same three
     windows; cards are allowed there. Making them shorter is content work of
     Phases C and D. (A phone lower than 844 px: see "Open points".)
2. **The instrument is the hero.** Keyboard for a keys lesson, neck for guitar
   or bass, pads for drums, lit exactly as the LUMI (or the on-screen neck)
   will be: degree colors, filled key = play this now.
   - On the home and on a practice page the instrument is the largest element.
     On the home it is at least as high as the headline block and at least a
     quarter of the window's height (22 % at 1024 × 640). Both are measured on
     the stage, the box `.sl-hero` with its padding (see "Page templates").
   - It spans the width on tablet and PC and is never cropped.
   - Its colours come from `App.colors`, the source the LUMI's lights take.
   - Keyboard, neck and pads say "in the scale", "now", "next", "the root",
     "held", "right" and "wrong" in one vocabulary (see "Instruments").
   - It stands on its own ground, `--sl-stage`, which is dark in both themes;
     keys are ivory and ebony in both. No ring, outline or glow in the accent
     inside an instrument.
3. **The key bar is always there.** Key · Tempo · Scale lock (with a
   plain-words hint such as "only A Dorian notes sound") · LUMI lights mode ·
   Help level. Same bar on every page; never buried in a menu.
   - In soundLAB the bar is on every page at every width, with the same five
     items in the same order. The header slides away on scroll down; the bar
     never does.
   - The lock's state can be read as a word at every width without opening
     anything. From 641 px up the sentence names the key.
   - The bar is one row (two rows are allowed from 641 to 900 px) and nothing
     scrolls sideways.
   - One exception until Phase H: in soundLAB Gear the bar is folded behind one
     header button that names the key, so that a stray touch during a gig
     cannot switch the lock.
4. **Plain words.** Labels say what happens ("only scale notes sound"), not
   what the setting is called.
   - Every switch and mode shows its effect in words beside it: the lock's
     sentence, a sentence for each Help level, the keyboard's state in the
     header.
   - A button says what a tap does: "Start" only when the tap begins a run,
     otherwise "Open the Tuner", "Open the Woodshed".
   - Sentence case. No text a page shows uses the words *legacy*, *canonical*,
     *context*, *disclosure* or *module*; the lines that do today are listed in
     `docs/plans/phase-b/WORDING.md`.
   - A state is a word or a mark as well as a colour (on, done, connected,
     right, wrong).
5. **Four instruments, one kit.** Guitar, bass, keys and drums get the same
   components: lessons, exercises, Woodshed, Help levels, plan blocks, progress.
   - The same component (class, markup, states) draws a lesson row, a plan
     block and a progress line for every instrument. An instrument differs only
     in its hero.
   - The hero neck takes four, five or six strings and can be drawn without
     fret wires from the start.
   - What each instrument has today is in `docs/INSTRUMENT-MATRIX.md`.

## Tokens (css/tokens.css)

96 tokens on `:root`; 32 of them are re-inked for the light theme, which is a
token swap and nothing else (`data-theme="light"` on `<html>`). Every new 2.0
component uses only `--sl-*` tokens, never a raw colour, an old variable, a
literal duration or a literal layer number. The file holds four rules and no
other: the two theme blocks, the touch block and the reduced-motion block.

"same" in the light column means the light theme does not change the value.

### Surfaces

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sl-bg` | `#0f0d10` | `#f5f1ea` | the page's ground: the dark stage |
| `--sl-bg-raised` | `#161317` | `#efe9df` | header, key bar, footer, sheets |
| `--sl-surface` | `#1c191d` | `#ffffff` | cards, popovers |
| `--sl-surface-2` | `#262128` | `#f1ebe1` | rows inside cards, buttons, messages |
| `--sl-surface-sunken` | `#0a090b` | `#e7e0d3` | wells, inputs, the track of a switch |
| `--sl-stage` | `#0a090b` | `#2a2429` | the ground under an instrument; dark in both themes |
| `--sl-line` | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.08)` | a quiet divider |
| `--sl-line-strong` | `#302a32` | `#d8cfc1` | the edge of a card, a divider between folds |
| `--sl-line-control` | `#80767e` | `#857b82` | the boundary of a control: at least 3:1 on the five surfaces |
| `--sl-overlay` | `rgba(0, 0, 0, 0.6)` | `rgba(20, 16, 12, 0.45)` | the scrim behind a sheet and the tour |

### Ink

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sl-ink` | `#f6f1ea` | `#1d1a1c` | text |
| `--sl-ink-soft` | `#cbc3c9` | `#4a4248` | secondary text, field labels |
| `--sl-ink-muted` | `#9d939b` | `#645b62` | muted text: at least 4.5:1 on the five surfaces |
| `--sl-ink-faint` | `#6a6168` | `#a39aa0` | decorative only, never for text that matters |

### Accent: tube amber

The ONLY accent; never a second hue for emphasis. The accent picker of today's
Settings goes with the key bar's step.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sl-accent` | `#ffab47` | `#c96f0a` | the fill of the primary button, the open tab's line, "LAB" in the wordmark |
| `--sl-accent-ink` | `#1a1206` | same | text ON the accent; never for amber text |
| `--sl-accent-text` | `#ffab47` | `#8a4a00` | amber as text, and the outer colour of the focus ring |
| `--sl-accent-deep` | `#c97f26` | `#9f5606` | the boundary of "on", the dark end of a gradient; never text |
| `--sl-accent-soft` | `rgba(255, 171, 71, 0.14)` | `rgba(201, 111, 10, 0.12)` | the fill of "on" |
| `--sl-accent-line` | `rgba(255, 171, 71, 0.6)` | `rgba(201, 111, 10, 0.55)` | an amber hairline |
| `--sl-accent-glow` | `0 14px 40px rgba(255, 171, 71, 0.28)` | `0 10px 30px rgba(201, 111, 10, 0.22)` | the shadow under the Start button |
| `--sl-accent-glow-color` | `rgba(255, 171, 71, 0.28)` | `rgba(201, 111, 10, 0.22)` | the colour inside that shadow |

### Status and judgement

Always shown with a word or a mark, never as a colour alone.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sl-ok` | `#6fd58f` | `#156b33` | done, connected, right |
| `--sl-warn` | `#ffb36b` | `#8a500a` | a warning |
| `--sl-bad` | `#ff6f6f` | `#b32e2e` | an error, wrong |
| `--sl-info` | `#6ea8fe` | `#2a5fb8` | a note |
| `--sl-judge-perfect` | `#4cc9b0` | `#12806b` | the judgement of a played note (Woodshed, lessons) |
| `--sl-judge-great` | `#8bd450` | `#3f7a14` | |
| `--sl-judge-good` | `#ffd166` | `#8a6300` | |
| `--sl-judge-miss` | `var(--sl-bad)` | same | follows `--sl-bad` in both themes |

### Keys and strings

Ivory and ebony in both themes: this is the instrument, not chrome. Only the
fret wire is re-inked, to keep its weight on the light theme's lighter stage.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sl-key-white` | `#ece5db` | same | an ivory key |
| `--sl-key-black` | `#1b171c` | same | an ebony key, a pad |
| `--sl-key-line` | `#6b6168` | same | a key's outline |
| `--sl-key-press` | `#cfc5b6` | same | a held key that has no note colour |
| `--sl-string` | `#b9bccb` | same | a string, on the stage |
| `--sl-fret` | `#3a3c4d` | `#4b4e61` | a fret wire: quieter than a string on purpose |
| `--sl-nut` | `#d8cdb8` | same | the neck's nut |
| `--sl-ink-on-stage` | `#cbc3c9` | same | text drawn on the stage: octave names, string names, fret numbers |
| `--sl-ink-on-color` | `#1a1206` | same | a label on a note colour, and the dark ring of a dot |
| `--sl-ink-on-color-light` | `#ffffff` | same | the same label on a dark note colour |

### Degree colours

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sl-deg-1` | `#ffab47` | same | the palette's seven default colours as the app stores them |
| `--sl-deg-2` | `#e8d44d` | same | |
| `--sl-deg-3` | `#7ad97a` | same | |
| `--sl-deg-4` | `#4cc9b0` | same | |
| `--sl-deg-5` | `#6ea8fe` | same | |
| `--sl-deg-6` | `#b48ef0` | same | |
| `--sl-deg-7` | `#ff85b3` | same | |

**Changed in step B1a (decision D12).** The earlier text said "scale-degree
colors; 1 is always the 1 color". The seven now hold the app's own default
colours, and no rule reads them. See "What is not a token".

### Type

Three faces, and only the weights that have a font file: Barlow 400 and 500,
Barlow Condensed 600 and 700, Bebas Neue 400. No new font file; a container
that carries `.sl-skin` sets `font-synthesis-weight: none`, so a weight without
a file is never faked. Caps only for Bebas headlines, the five tabs, the hero
button and small field labels; everything else is sentence or title case.

A flat in a headline. Bebas Neue has capitals only, so the key "Db Natural
Minor" would read "DB NATURAL MINOR". In an `h1` the b of a flat key is wrapped,
`D<span class="sl-flat">b</span>`: it is set in Barlow Condensed 700 and stays
lower case, as the app's chord names do. A sharp needs nothing: the face has
`#`. The flat sign "♭" is not used in a headline, because none of the three
faces has it and a system font would draw it.

| Token | Value | Use |
|---|---|---|
| `--sl-font-display` | `'Bebas Neue', 'Barlow Condensed', 'Segoe UI', system-ui, sans-serif` | headlines, sheet titles, big numbers; caps only |
| `--sl-font-body` | `'Barlow', 'Segoe UI', system-ui, sans-serif` | everything that is read |
| `--sl-font-cond` | `'Barlow Condensed', 'Segoe UI', system-ui, sans-serif` | tabs, the hero button, eyebrows, field labels, labels on an instrument |
| `--sl-weight-regular` | `400` | Barlow |
| `--sl-weight-medium` | `500` | Barlow: buttons, chips, the open pill, `b` and `strong` |
| `--sl-weight-cond` | `600` | Barlow Condensed |
| `--sl-weight-cond-bold` | `700` | Barlow Condensed: the hero button, the open tab, a card's title |
| `--sl-text-xs` | `12px` | field labels, small notes |
| `--sl-text-sm` | `14px` | chips, pills, tabs, hints, messages |
| `--sl-text-md` | `16px` | body text, buttons, inputs (a phone does not zoom into a 16 px field) |
| `--sl-text-lg` | `20px` | a card's title, the hero button |
| `--sl-text-xl` | `26px` | the wordmark's height |
| `--sl-display-sm` | `34px` | the headline of every page but the home, sheet titles, a tile's number |
| `--sl-display-md` | `56px` | big numbers; the home's headline in a low window |
| `--sl-display-lg` | `clamp(44px, 7.8vw, 100px)` | the home's headline |
| `--sl-eyebrow-ls` | `0.16em` | the letter spacing of an eyebrow |
| `--sl-caps-ls` | `0.08em` | the letter spacing of Barlow Condensed caps |
| `--sl-leading-tight` | `0.92` | the line height of a Bebas headline |
| `--sl-leading` | `1.4` | the line height of body text |

**Changed (decision D28).** The earlier text said "one headline per page at
`--sl-display-lg`". It now reads: one headline per page; at `--sl-display-lg`
on the home, at `--sl-display-sm` on every other page. On a page whose hero is
an instrument, a 100 px headline takes the instrument's room.

### Space, shape, controls

| Token | Value | Use |
|---|---|---|
| `--sl-space-1` | `4px` | the 4 px grid |
| `--sl-space-2` | `8px` | |
| `--sl-space-3` | `12px` | |
| `--sl-space-4` | `16px` | |
| `--sl-space-5` | `24px` | |
| `--sl-space-6` | `32px` | |
| `--sl-space-7` | `48px` | |
| `--sl-space-8` | `72px` | |
| `--sl-gutter` | `16px` | the side gutter up to 900 px |
| `--sl-radius-sm` | `8px` | rows, the lower corners of a key, a tab's focus box |
| `--sl-radius-md` | `12px` | inputs and selects, tiles, messages, pads, the error box |
| `--sl-radius-lg` | `20px` | cards, popovers, the instrument's stage, the top of a bottom sheet |
| `--sl-radius-pill` | `999px` | buttons, chips, switches, steppers, pills |
| `--sl-control-h` | `44px` | every tappable control |
| `--sl-control-h-hero` | `64px` | the one Start button of the home |
| `--sl-control-h-dense` | `36px` | rows of a list inside a card or a fold, with a mouse only |
| `--sl-tap-min` | `44px` | the smallest tap target |
| `--sl-focus` | `0 0 0 2px var(--sl-bg), 0 0 0 4px var(--sl-accent-text)` | the focus ring: 2 px of the ground, then 2 px of amber; opaque, follows the theme |

**Changed by the drawings.** The earlier text said "buttons are pills; cards
12 px". Buttons are pills; a card is drawn at `--sl-radius-lg`, 20 px, the
radius of the instrument's stage beside it. 12 px is the radius of the smaller
boxes (inputs, tiles, messages). The pictures the owner sees show 20 px.

The two shadows are re-inked:

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sl-shadow-1` | `0 1px 3px rgba(0, 0, 0, 0.3)` | `0 1px 3px rgba(0, 0, 0, 0.1)` | a card, an ebony key |
| `--sl-shadow-2` | `0 10px 30px rgba(0, 0, 0, 0.35)` | `0 10px 30px rgba(23, 26, 31, 0.08)` | a popover, a sheet, a message |

### Motion and layers

| Token | Value | Use |
|---|---|---|
| `--sl-dur-fast` | `120ms` | a colour, a boundary, a press |
| `--sl-dur` | `200ms` | something that moves: a switch's knob, a fold's caret, the header |
| `--sl-ease` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | the one easing |
| `--sl-z-bar` | `50` | header, key bar |
| `--sl-z-pop` | `60` | bottom tab bar, a panel under a chip |
| `--sl-z-full` | `200` | a page's own full-screen mode |
| `--sl-z-sheet` | `420` | a sheet |
| `--sl-z-tour` | `500` | the help tour |
| `--sl-z-toast` | `600` | messages: above an open sheet |
| `--sl-z-drag` | `700` | what a finger is dragging |

A layer that must sit just above a token is written as a sum, for example
`calc(var(--sl-z-bar) + 1)` for the header, whose "More" panel lies over the
key bar.

### Values that follow the device

| Token | Where | Value |
|---|---|---|
| `--sl-control-h` | `(any-pointer: coarse)` | `48px` |
| `--sl-control-h-dense` | `(any-pointer: coarse)` | `48px` |
| `--sl-dur-fast` | `(prefers-reduced-motion: reduce)` | `0ms` |
| `--sl-dur` | `(prefers-reduced-motion: reduce)` | `0ms` |

The touch query is `any-pointer`, not `pointer`: a laptop with a touch screen
gets 48 px too.

### The contrast pair list

`tests/tokens.test.js` computes these 22 rows from the token file in both
themes, 74 pairs in each, and fails when one is under its bar: 4.5:1 for text,
3:1 for a control's boundary, a graphic and the focus ring. A translucent token
is laid over the surface under it first. The two right-hand columns give the
lowest ratio of the row. "The five surfaces" are `--sl-bg`, `--sl-bg-raised`,
`--sl-surface`, `--sl-surface-2` and `--sl-surface-sunken`.

| What is drawn | On | Needs | Lowest, dark | Lowest, light |
|---|---|---|---|---|
| `--sl-ink` | the five surfaces | 4.5 | 14.05 | 13.15 |
| `--sl-ink-soft` | the five surfaces | 4.5 | 9.16 | 7.39 |
| `--sl-ink-muted` | the five surfaces | 4.5 | 5.32 | 4.98 |
| `--sl-accent-text` | the five surfaces | 4.5 | 8.39 | 5.23 |
| `--sl-ok` | the five surfaces | 4.5 | 8.71 | 5.03 |
| `--sl-warn` | the five surfaces | 4.5 | 8.95 | 4.95 |
| `--sl-bad` | the five surfaces | 4.5 | 5.83 | 4.78 |
| `--sl-info` | the five surfaces | 4.5 | 6.53 | 4.67 |
| `--sl-ink` | `--sl-accent-soft` over each of the five surfaces | 4.5 | 10.49 | 11.72 |
| `--sl-accent-text` | `--sl-accent-soft` over each of the five surfaces | 4.5 | 6.27 | 4.66 |
| `--sl-accent-ink` | `--sl-accent` (the label of a primary button) | 4.5 | 9.86 | 5.08 |
| `--sl-judge-perfect` | `--sl-surface` | 4.5 | 8.53 | 4.85 |
| `--sl-judge-great` | `--sl-surface` | 4.5 | 9.64 | 5.24 |
| `--sl-judge-good` | `--sl-surface` | 4.5 | 12.07 | 5.43 |
| `--sl-judge-miss` | `--sl-surface` | 4.5 | 6.43 | 6.27 |
| `--sl-line-control` | the five surfaces | 3 | 3.62 | 3.11 |
| `--sl-accent-deep` | the five surfaces | 3 | 4.92 | 4.20 |
| the outer colour of `--sl-focus` | the five surfaces | 3 | 8.39 | 5.23 |
| `--sl-key-line` | `--sl-key-white` | 3 | 4.75 | 4.75 |
| `--sl-key-white` | `--sl-stage` | 3 | 15.89 | 12.15 |
| `--sl-nut` | `--sl-stage` | 3 | 12.63 | 9.65 |
| `--sl-ink-on-stage` | `--sl-stage` | 4.5 | 11.53 | 8.81 |

One more check has no bar of its own: on the stage a string has at least 3:1
(10.52 dark, 8.04 light) and a fret wire is quieter than a string (1.83 dark,
1.85 light), so the neck reads the same way in both themes.

The suite also holds: every `var(--sl-…)` in `css/`, `js/` and the two pages
names a token; raw colours and old variables per file only go down; the tokens
load first; both durations are zero under reduced motion.

### What is not a token

**A note's colour is data, not a token.** `App.colors` is its only source. It
reaches an element as the inline custom property `--c`, and a share (a goal
ring, a meter) as `--p`. The reason: the player can change the palette, it has
twelve steps and two modes ("Degree" and "Note name"), and every colour is
snapped to the LUMI's colour table before a page shows it, so that screen and
keys match.

The seven degree tokens therefore hold the **stored** defaults, for
documents; a page shows the **shown** ones. `tests/tokens.test.js` keeps the
stored row equal to `DEGREE_DEFAULTS` in `js/app.js`; `tests/colors.test.js`
pins the shown row.

| Degree | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Stored (the tokens) | `#ffab47` | `#e8d44d` | `#7ad97a` | `#4cc9b0` | `#6ea8fe` | `#b48ef0` | `#ff85b3` |
| Shown on screen and on a LUMI | `#ffaa2e` | `#ffd429` | `#7dfc74` | `#41eab4` | `#439af5` | `#7e58f5` | `#ff6460` |

A drawing of "today's colours" takes the shown row. In today's palette the
root's colour is amber, almost the accent's own. Which palette is the default,
today's or the mockup's red-first one, is the owner's choice at gate G4; the
vocabulary below holds for either.

Also not tokens: the header's height, which script publishes on `<html>` so
that the key bar can stick under it (the drawings call it `--mk-topbar-h`; step
B5a gives it its name in the app), and the plan's own fixed numbers: the two
breakpoints, the sheet's 440 px, a message's 460 px, the home hero's 140 px.
Four print tokens come with the Charts step (B14a).

## Control heights and the dense tier

Three heights, each a token.

| Tier | Token | Mouse | Touch | Where |
|---|---|---|---|---|
| Default | `--sl-control-h` | 44 px | 48 px | every control unless a row below says otherwise |
| Hero | `--sl-control-h-hero` | 64 px | 64 px | the one Start button of the home |
| Dense | `--sl-control-h-dense` | 36 px | 48 px | rows of a list inside a card or a fold |

**Changed, if the owner agrees (decision D9; question 7 on the owner's page).**
The earlier text said "every control is tappable at 44 px". With the dense tier
it reads: every control is tappable at 44 px, 48 px where a finger can be the
pointer; with a mouse only, the rows of a list inside a card or a fold may be
36 px. Until the owner says yes, read 44 px: without his yes the token's value
becomes 44 px, a one-line change, and every 36 in this document reads 44.

The dense tier may be used by:

- the rows of the Woodshed's library,
- the rows inside the Piano page's folds,
- the rows of Settings,
- and the small things inside such rows: `.btn.sm`, `.seg.sm`, `.sl-row`,
  `.fb-chip`.

It is never used in the header, in the key bar, in a sheet, in a message, in
the tour card, on the home, for an icon button or for a page's primary action.
The draft stylesheet enforces this: a `.btn.sm` inside `.sheet-body`,
`.sl-toast` or `.hp-card` takes the default height, a `.sl-row` inside
`.sheet-body` too, and an `.icon-btn` is always 48 / 44 px.

What the tier saves, measured on the drawing
[one row, three heights](design/phase-b/pages.html?w=1280&theme=dark&view=rows&whole=1):
a row of the Woodshed's library with its seven buttons is 46 px high with
36 px buttons, 54 px with 44 px buttons and 58 px on touch; the library's
eight pieces take 396, 460 and 492 px.

## Components to build in Phase B (all from tokens, none hand-colored)

Buttons (primary pill, ghost, icon) · Chips/status dots · Switch (Scale lock) ·
Select chip (Key, LUMI lights) · Stepper (Tempo) · Help-level dots · Key bar ·
Header (wordmark, 5 tabs, status, gear) · Footer line with goal ring · Card ·
Row (plan block with check state) · Sheet (bottom on phones, side on wide) ·
Toast · Empty / loading / error states · Instrument heroes (keyboard, neck,
pads) sharing one lighting model.

That list stands; the tables below give each piece its class, size and states,
and add what the pages need beside it (fold, segmented control, field, tile,
bar, readout, two-tap confirm, popover, tour card).

Class names are the plan's (Appendix A and B). New classes start with `sl-`.
The shared classes of today's app (`.btn`, `.card`, `.chip`, `.seg`, `.field`,
`.sheet`, …) keep their names and get the new look only inside a container that
carries the marker `.sl-skin`; their rules are written
`:where(.sl-skin) .btn { … }`, so they weigh what the old rules weigh. A panel
gets the marker in its own step, the shell's parts in theirs, soundLAB Gear's
pages not before Phase H.

What the marker itself sets on its container:

| Class | Sets |
|---|---|
| `.sl-skin` | the body face (`--sl-font-body`, 16 px, weight 400, line height `--sl-leading`); `font-synthesis-weight: none`; the ink colour `--sl-ink`. Inside it buttons and fields inherit the face, `b` and `strong` are weight 500, a paragraph has no margin, and everything that takes the keyboard shows the one focus ring |

States every control shares:

| State | How it is drawn |
|---|---|
| Hover | only where the device hovers; the boundary goes to `--sl-ink-soft`, the fill one step up |
| Pressed | the fill goes to `--sl-surface-sunken`; a button moves 1 px down |
| On | class `active` or `aria-pressed="true"`: a fill (`--sl-accent-soft`) AND a boundary (`--sl-accent-deep`) AND a check mark or a word; never a colour alone. An icon button has no room for a mark: its boundary is 2 px where the unlit button has none, and its name or its aria state says it |
| Focus | `:focus-visible` shows `--sl-focus`, with a transparent outline that survives forced colours |
| Disabled | text stays readable (`--sl-ink-muted` at full strength: the rule sets `opacity: 1`, because a browser fades a disabled select by itself, Chromium to 70 %), the boundary is dashed, the fill is gone |

Hover, pressed and focus are written in the draft stylesheet and are not drawn
in any picture yet.

### Controls

| Component | Class | Size | Notes |
|---|---|---|---|
| Button | `.btn`; `.btn.primary`, `.btn.ghost`, `.btn.sm` | 48 / 44 px high (`--sl-control-h`), at least as wide; side padding 24 px (`--sl-space-5`); Barlow 500, 16 px; a pill | one `.btn.primary` per view: amber fill, `--sl-accent-ink` text, the glow on hover. `.ghost` has no fill and no boundary. `.sm` is the dense tier: 48 / 36 px, padding 16 px, 14 px text |
| Hero button | `.sl-hero-btn` | 64 px (`--sl-control-h-hero`); side padding 32 px (`--sl-space-6`); Barlow Condensed 700, 20 px, caps | the one Start button of the home, with `--sl-accent-glow` under it |
| Icon button | `.icon-btn` | 48 / 44 px square, never dense | needs an accessible name; on is also `.on` or `aria-expanded="true"`: a fill and a 2 px boundary, no check mark. The metronome's name is "Metronome, running" while the click runs |
| Chip | `.chip` | 48 / 44 px high; side padding 16 px; Barlow 500, 14 px | on = fill, amber boundary and a check mark before the words |
| Segmented control | `.seg`, `.seg.sm` | the track is 48 / 44 px (`.sm` 48 / 36 px). A segment's pill is drawn 38 / 34 px high, and its tap area reaches the track's edges: 48 / 44 px (`.sm` 48 / 36 px) | a sunken track with 4 px padding. The tap area is the segment's `::after` (`::before` is the check mark), and look case L7 measures a segment by it. When the control wraps, each segment keeps its own rounded shape and the rows stand 10 px apart, so that the tap areas of two rows meet and do not overlap |
| Field | `label.field`, `.field`; `select`, `.select`, text and number inputs, `textarea` | 48 / 44 px high; radius 12 px (`--sl-radius-md`); 16 px text | the label is Barlow Condensed 600, 12 px, caps. The select's chevron is drawn in `--sl-ink-soft` and is the one look written with weight (`:root .sl-skin select`), because an old light-theme rule would otherwise win. Invalid: `aria-invalid="true"`, a `--sl-bad` boundary |
| Range, checkbox | `input` | a range is 48 / 44 px high; a checkbox 24 px (`--sl-space-5`) | `accent-color` is `--sl-accent` |
| Switch | `.sl-switch` | 48 / 44 px high; the track 44 × 24 px with an 18 px knob | a `button` with `aria-pressed`; the knob moves 20 px, the track fills with `--sl-accent`, and a word stands beside it |
| Stepper | `.sl-stepper` | 48 / 44 px high; two square buttons and a 48 px number (`--sl-space-7`): 144 / 136 px wide | −, a typed number, +; the unit stands under the number in the same field |

```html
<button class="btn primary">Start</button>
<button class="btn sm">Edit</button>
<a class="sl-hero-btn" href="#">Start</a>
<button class="icon-btn" aria-label="Settings">…icon…</button>
<button class="chip active" aria-pressed="true">Arp</button>
<div class="seg"><button class="active" aria-pressed="true">Degree</button><button>Note name</button></div>
<label class="field">Root <select>…</select></label>

<button class="sl-switch" aria-pressed="true" aria-describedby="cx-lockhint">
  <span class="sl-switch-track"></span>
  <span class="sl-switch-label">Scale lock</span>
  <span class="sl-switch-state">On</span>
</button>

<div class="sl-stepper" role="group" aria-label="Tempo">
  <button aria-label="Slower">−</button>
  <input type="number" min="30" max="280" value="120">
  <span class="sl-stepper-unit" aria-hidden="true">BPM</span>
  <button aria-label="Faster">+</button>
</div>
```

Icons stay Lucide through `App.icon`; two are added for the shell, a caret for
a chip that opens a panel and a "more" mark.

### Containers

| Component | Class | Size | Notes |
|---|---|---|---|
| Card | `.card` | padding 24 px, 16 px up to 640 px wide; radius 20 px (`--sl-radius-lg`); a 1 px `--sl-line-strong` edge | `--sl-surface` with `--sl-shadow-1`. Its `h2` is Barlow Condensed 700, 20 px, without the old title dot. Tool pages and Settings only |
| Rows | `.sl-rows`, `.sl-row`; done `.sl-row.is-done` | a row is at least 48 / 36 px high (dense), 48 / 44 px in a sheet and on the home; with buttons in it, their height plus 10 px; radius 8 px | a list inside a card: library, plan blocks, settings rows. Parts: `.sl-row-main` (a name with a smaller line under it), `.sl-row-state`, `.sl-row-acts`. A row that is a link or a button carries a control's boundary; the chosen one has `aria-pressed="true"`. Done = a check mark and the word "Done" in `--sl-ok` |
| Fold | `details.sl-fold`; `details.tips` keeps its name and takes this look | the summary is 48 / 44 px high, with a caret at its end | the controls inside stay in the document from the start. A fold with `data-keep="<name>"` remembers whether it is open (stored as `ui.folds`). The caret turns in 200 ms |
| Tile | `.sl-tile` with `.sl-tile-num`, `.sl-tile-label`, `.sl-tile-note` | the number is Bebas, 34 px (`--sl-display-sm`); radius 12 px | a number with its label |
| Ring | `.sl-ring` | 32 px (`--sl-space-6`); 24 px in the footer line | the goal ring; the share is `--p`, 0 to 100 |
| Bar | `.sl-bar` | 8 px high (`--sl-space-2`) | level, progress, clock; the share is `--p` |
| Readout | `.sl-readout` | Bebas, 56 px (`--sl-display-md`), tabular numbers | tempo, tuner, streak |

```html
<ul class="sl-rows">
  <li class="sl-row is-done">
    <span class="sl-row-main"><b>Tune up</b><small>Tuner · 2 min</small></span>
    <span class="sl-row-state">Done</span>
    <span class="sl-row-acts"><button class="btn sm">Open</button></span>
  </li>
</ul>

<details class="sl-fold" data-keep="pn-practice">
  <summary>Practice a scale</summary>
  <div>…the controls…</div>
</details>

<div class="sl-tile"><span class="sl-tile-num">12</span><span class="sl-tile-label">day streak</span></div>
<span class="sl-ring" style="--p: 60"></span>
<span class="sl-bar" style="--p: 60"></span>
```

### Text

| Component | Class | Size | Notes |
|---|---|---|---|
| Eyebrow | `.sl-eyebrow` | Barlow Condensed 600, 14 px, caps, letter spacing 0.16 em | the small amber line over a headline |
| Headline | `h1` inside `.sl-skin` | Bebas, 34 px (`--sl-display-sm`), line height 0.92; the home sets `--sl-display-lg` itself | one per page |
| Footer line | `.sl-footline`, `.sl-footline-part` | 14 px, muted; numbers in `--sl-ink` | the home's one quiet line: minutes against the goal, the streak, the plan. A reached goal says so in words, with a check mark in `--sl-ok` (`.is-done`) |
| Hint | `.sl-hint`; `.hint` keeps working | 14 px, muted | |
| Screen-reader text | `.sl-sr`; `.sr` keeps working | | in the document, not on screen |

```html
<p class="sl-eyebrow">Next · Piano</p>
<h1>D<span class="sl-flat">b</span> Natural Minor (Aeolian)</h1>

<p class="sl-footline">
  <span class="sl-footline-part"><span class="sl-ring" style="--p: 60" aria-hidden="true"></span><span><b>6</b> of 10 min today</span></span>
  <span class="sl-footline-part">…icon…<span><b>4</b>-day streak</span></span>
  <span class="sl-footline-part"><span>Plan: <b>1</b> of 4 blocks done</span></span>
</p>
<!-- the goal reached: the first part becomes -->
<span class="sl-footline-part is-done">…check mark…<span>Goal reached: <b>10</b> of 10 min today</span></span>
```

### Feedback

| Component | Class | Size | Notes |
|---|---|---|---|
| Empty | `.sl-empty` | padding 32 px by 16 px | an icon, a line in `--sl-ink`, a sentence; never a blank box |
| Loading | `.sl-loading` | a 24 px ring that turns once a second (5 × `--sl-dur`) | still when motion is reduced: the duration token is zero then |
| Error | `.error` | radius 12 px; a `--sl-bad` boundary | an icon and words on `--sl-surface` |
| Two-tap confirm | `.sl-confirm`; armed `.is-armed` | the button's own | the first tap arms it for 3 s (15 × `--sl-dur`): the boundary and the words turn `--sl-bad` and a line runs out along the lower edge. Nothing is deleted on the first tap |
| Message | `.sl-toasts`, `.sl-toast`; `.sl-toast-bad`, `.sl-toast-action` with `.sl-toast-acts` | at least 48 / 44 px high; at most 460 px wide, the window minus both gutters up to 640 px; radius 12 px | one stack for every message, above an open sheet (`--sl-z-toast`). A 4 px amber edge on the left says "a message". Buttons stand in one group that drops under the words when the row is too short |

```html
<div class="sl-empty">…icon…<b>Nothing yet</b><span>Generate an exercise above, import a MIDI file, or paste a tab.</span></div>
<div class="sl-loading" role="status"><b>Looking for Bluetooth MIDI keyboards…</b></div>
<div class="error" role="alert">…icon…<span>MIDI import failed: not a MIDI file</span></div>

<button class="btn sl-confirm is-armed">Tap again to delete</button>

<div class="sl-toast sl-toast-action" id="app-update" role="status">
  <span>soundLAB v2.1.1 is available.</span>
  <span class="sl-toast-acts"><button class="btn sm primary">Update now</button><button class="btn sm">Later</button></span>
</div>
<div class="sl-toast sl-toast-bad" role="status">…icon…<span>MIDI import failed: not a MIDI file</span></div>
```

Pictures: [one message](design/phase-b/overlays.html?w=390&theme=dark&touch=1&msg=nothing&page=chart),
[a message over a sheet](design/phase-b/overlays.html?w=1280&theme=dark&sheet=lights&msg=sound),
[empty](design/phase-b/overlays.html?w=390&theme=dark&touch=1&state=empty&page=shed),
[loading](design/phase-b/overlays.html?w=390&theme=dark&touch=1&sheet=lights&lights=none&bt=1),
[error](design/phase-b/overlays.html?w=390&theme=dark&touch=1&state=error&page=shed).

### The shell

The shell is written once, by script, for both apps. Ids that suites and other
code read today stay on the controls that survive.

| Component | Class | Size | Notes |
|---|---|---|---|
| Header | `.topbar` with `.brand`, `.tabbar-top`, `.tb-tools` | see "Layout" | wordmark (the way home), tabs, tools. The tag beside the wordmark: "beta" at the beta address, "gear" in Gear, else none. The wordmark is 26 px high, 22 px up to 640 px |
| Tab | `.tabbar-btn` | 48 / 44 px; Barlow Condensed 600, 14 px, caps | above 900 px text with a 2 px amber line under the open one, which is also weight 700; in the bottom bar an icon over a 12 px label, 64 / 60 px high, with the line at the top edge. While today's goal is open the Learn tab carries a dot, and the words ", today's goal is open" for a screen reader (`.sl-goal-sr`) |
| Pill | `.subtab` | 48 / 44 px; 14 px | the pages of the open tab, in one row. The open pill is filled, bordered and weight 500 |
| Instrument chip | `.sl-kchip` (id `inst-btn`) | 48 / 44 px | names the instrument on every page; from 1100 px the word "Practising" stands over the name. Opens the Instrument sheet |
| Status chip | `.sl-status` with `.sl-status-dot`, `.sl-status-name`, `.sl-status-text`; `.is-connected` | 48 / 44 px; the dot 8 px | the keyboard's state in words: "LUMI · On", "LUMI · Off", "No keyboard". The dot is filled when a keyboard is connected and hollow when not |
| Key bar | `.sl-keybar` | see "Layout" | five items, each a chip and a panel; sticks under the header and at the top edge when the header has slid away |
| Key-bar chip | `.sl-kchip` with `.sl-kchip-label`, `.sl-kchip-value`, `.sl-kchip-caret`; two lines `.sl-kchip-stack` | 48 / 44 px; side padding 16 px; Barlow 500, 16 px | on is `.is-on` (fill, boundary and its word); a chip whose panel is open has `aria-expanded="true"` and a 2 px ink boundary |
| Help dots | `.sl-dots` | four 8 px dots, 4 px apart; 6 px dots, 3 px apart, in the chip of a window up to 640 px wide, where the level's name has no room | filled up to the level, hollow above it; always beside the level's name where there is room |
| Popover | `.sl-pop`, `.sl-pop-title` | radius 20 px; padding 16 px; above 900 px at most 440 px wide, under its chip; up to 900 px a panel from the bottom, at most 576 px wide | closes on a tap outside, Escape, Back, a page change and a pedal press; one at a time |
| Sheet | `.sheet`, `.sheet-card`, `.sheet-head`, `.sheet-body` | above 900 px a panel on the right, 440 px wide and as high as the window; up to 900 px a bottom sheet, at most 648 px wide and 88 % of the window high, top corners 20 px | modal: a scrim (`--sl-overlay`), the focus stays inside, Escape, Back and the pedal close it. The title is Bebas, 34 px |
| Tour card | the layer `#hp-ov` carries `.sl-skin`; `.hp-ring`, `.hp-card`, `.hp-head`, `.hp-t`, `.hp-x`, `.hp-close` | the card is at most 320 px wide | a dialog with the focus in its card; the ring is 2 px of amber around the control it points at |

```html
<button id="cx-key" class="sl-kchip" aria-expanded="false" aria-controls="cx-pop-key">
  <span class="sl-kchip-label">Key</span>
  <span class="sl-kchip-value">A Dorian</span>
  …caret…
</button>

<button id="cx-help" class="sl-kchip" aria-expanded="false" aria-controls="cx-pop-help">
  <span class="sl-kchip-label">Help</span>
  <span class="sl-dots" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="on"></i><i></i></span>
  <span class="sl-kchip-value">Colors</span>
</button>

<button id="lights-btn" class="sl-status is-connected" aria-label="Keyboard lights: LUMI, on. Open Keyboard lights">
  <span class="sl-status-dot"></span>
  <span class="sl-status-name">LUMI</span>
  <span class="sl-status-text">On</span>
</button>

<div class="sheet" id="sheet-lights" hidden>
  <div class="sheet-card sl-skin">
    <div class="sheet-head"><h2>Keyboard lights</h2>…close…</div>
    <section class="sheet-body" id="panel-lights">…</section>
  </div>
</div>

<div id="sl-float" class="sl-skin">
  <div id="sl-toasts" class="sl-toasts">
    <div class="sl-toast" id="app-toast" role="status">Scale lock on: only A Dorian notes sound</div>
  </div>
</div>

<button class="tabbar-btn active" data-group="gtheory" aria-current="page">
  …icon…<span>Learn</span><span class="sl-goal-sr">, today’s goal is open</span>
</button>
<button class="subtab active" aria-current="page">Exercises</button>

<div class="sl-pop" id="cx-pop-tempo">
  <span class="sl-pop-title">Tempo</span>
  …the click's button and the stepper…
</div>

<div id="hp-ov" class="sl-skin" role="dialog" aria-modal="true" aria-labelledby="hp-title">
  <div class="hp-ring"></div>
  <div class="hp-card card">
    <div class="hp-head"><div class="hp-t" id="hp-title">Tap tempo</div>
      <button class="hp-close btn sm icon-btn" aria-label="Close help">…icon…</button></div>
    <div class="hp-x">…the step's sentence…</div>
    <div class="row spread"><span class="muted small">2 of 5</span>
      <span class="row tight"><button class="btn sm" id="hp-back">Back</button><button class="btn sm primary" id="hp-next">Next</button></span></div>
  </div>
</div>
```

A card and a readout have no parts of their own: `<div class="card"><h2>…</h2>…</div>`
and `<div class="sl-readout">120</div>`.

The order of the shell's parts: the header (with the pill row as its second
row), the key bar, the bottom tab bar, the sheets (Metronome, Keyboard lights
and, in soundLAB, Instrument), the page, the footer, and last the one
body-level container for messages, `sl-float`. Anything else a page must put on `<body>`
goes into that container.

**The key bar's five items** (decision D16). Each id exists once.

| Item | Chip | Panel | What the panel holds |
|---|---|---|---|
| Key | `cx-key`, "A Dorian" | `cx-pop-key` | root, scale and mode, three native selects |
| Tempo | `cx-tempo`, the number over "BPM" | `cx-pop-tempo` | the click's start and stop, −, the typed number, + |
| Scale lock | `cx-lockchip`, a lock and "On" or "Off" | `cx-pop-lock` | the switch and the sentence |
| LUMI lights | `cx-lights`, the state in a word | `cx-pop-lights` | the switch, a status line, the way to the Keyboard lights sheet |
| Help | `cx-help`, four dots and the level's name | `cx-pop-help` | the five levels with a sentence each, and "Color notes by: Degree · Note name" |

Above 640 px the Tempo and the Scale lock panels are laid out inside the bar
and always shown, and their two chips are not displayed. Every flip of the lock
made in the bar shows a message with the sentence: "Scale lock on: only A
Dorian notes sound" or "Scale lock off: every note sounds".

**Cross-page classes.** `.fb-chip`, `.fb-stroke`, `.fb-field`, `.jam-now`,
`.sr` and `.hint` are used by pages other than the one that defines them. They
get one definition in the component sheet, with today's values, until their
owners' steps.

## Instruments: one lighting vocabulary

Three drawing functions share one lighting model: a keyboard (`.sl-kbd` of
`.sl-key`), a neck (`.sl-neck`, an SVG) and pads (`.sl-pads` of `.sl-pad`),
each inside a box with class `.sl-hero`, which is the stage: `--sl-stage`,
radius 20 px. Its own rule gives it 16 px padding; every place that is drawn
sets less: the home 12 px (8 px up to 640 px wide), and a page's keyboard none
at the top, where the keys start at the stage's edge, and 12 px at the sides
and under it on the Piano page (8 px at the sides in the instruments drawing). A note's colour
arrives as `--c` on its element. Keys, strings and pads look the same in both
themes. The markup inside the stage is whatever the three drawing functions
return (`keyboard`, `neck`, `pads` of `mock-hero.js`, the draft of
`js/hero.js`): a keyboard is `.sl-kbd` > `.sl-key` (an ebony key also
`.sl-key-b`) > `.sl-dot` or `.sl-mark`, with `.sl-kbd-name` under each C; a
neck is one SVG with a group `.sl-pos` per lit spot (`.sl-pos-dot`,
`.sl-pos-rim`, `.sl-pos-ring`, `.sl-pos-label`, `.sl-pos-mark`); a pad is
`.sl-pad` with `.sl-pad-dot`, `.sl-pad-name` and `.sl-pad-hint`. An inlay of the neck that a lit
spot on a neighbouring string would cover in part is not drawn.

**The vocabulary** (decision D30; gate G4). A state is a class on a key, on a
spot of the neck or on a pad. "Now" can be told from "in the scale" without
colour: one is a filled key, the other a dot.

| State | Class | On a key | On a neck | On a pad |
|---|---|---|---|---|
| In the scale | `.is-scale` | a dot (`.sl-dot`) in the note's colour with a 2 px dark ring. The dot is 86 % of the key's width and at most 28 px; at most 36 px on the home's large keys (the home's script sets the class `is-roomy` on its stage; that rule is the home's own, in `home.html`, and reaches the component sheet with the home's step) | a dot with a 2 px dark ring | a 20 px dot with a 2 px dark ring |
| The root | `.is-root` | a larger dot, 80 % of the key's width and at most 32 px (40 px on the home's large keys), with a thicker ring, 4 px, and a fine line in the note's own colour around it. On a narrow key the ring thins down to 2 px and the dot is no larger than a scale dot (the Piano page on a phone: 16 px beside 18 px): there the root is told by the line in its own colour, not by a thicker ring | the same | a pad has no root |
| Play this now | `.is-now` | the whole key is filled with its colour, with a 3 px ring in dark ink inside its edge (5 px when it is the root) | a 3 px ring in the stage's ink that stands off the dot | the pad is filled, with the same ring |
| Next | `.is-next` | an empty 3 px ring in the note's colour, between two dark hairlines on ivory | an empty 3 px ring in the note's colour | a 3 px ring in the pad's colour inside its edge |
| Held down | `.is-press` | the key takes its colour, without a ring, and its front edge shows; a key outside the scale takes `--sl-key-press` | a larger dot without a ring | the pad takes its colour |
| Right | `.is-right` | `--sl-ok` with a check mark (`.sl-mark`) | the same | the same |
| Wrong | `.is-wrong` | `--sl-bad` with a cross | the same | the same |

The dark ring and the label are `--sl-ink-on-color`. On a dark note colour the
label takes `--sl-ink-on-color-light` (class `.is-ink-light`) and carries a
hairline outline in the dark ink. The drawing function sets `.is-scale` on
every lit element; the draft stylesheet has no rule of its own for it, because
the dot is the look. "Next" blinks slowly on a practice page and
stands still where the device asks for less motion.

Measured on the drawings' colours:

- A note colour alone can vanish on an ivory key: the lowest of today's twelve
  Degree colours has 1.00:1 there (the ♭3), the yellow 2 has 1.14:1. That is
  why every dot has the dark ring: the ring has at least 3.88:1 against each
  of today's twelve Degree colours and 3.89:1 against the twelve Note name
  colours.
- A label reaches 4.5:1 by its ink alone on every one of today's Degree
  colours (lowest 4.56:1). Two labels do not: A# in Note name mode (4.43:1) and
  ♭7 in the mockup's palette (4.38:1). Both are read against their outline
  (18.53:1). The test that step B3 writes must count the outline, or it fails
  on A#.

**The Help level** decides what a drawing shows, the same on screen and on a
LUMI. Held, right and wrong show at every level.

| Level | Name | Shows |
|---|---|---|
| 4 | Full | the scale's dots with their labels, the root, now, next |
| 3 | Colors | the scale's dots, the root, now, next |
| 2 | Target | the root, and the note to play now |
| 1 | Tonic | the root |
| 0 | None | nothing |

This is what the app does today, and what the drawings show. The plan's letter
differs in three places (labels from Colors up; "next" at Target too; no root
at Target); the model takes the first two as numbers, the owner sees the drawn
reading at gate G4, and the plan records it under "Changes made while
building". The
home's picture is never empty: it draws the scale at every Help level, marks no
"now" note and does not sound.

Pictures:
[every state of a key](design/phase-b/instruments.html?w=1280&theme=dark&view=states&hero=keyboard&palette=app),
[of the neck](design/phase-b/instruments.html?w=1280&theme=dark&view=states&hero=neck&palette=app),
[of a pad](design/phase-b/instruments.html?w=1280&theme=dark&view=states&hero=pads&palette=app),
[the five Help levels](design/phase-b/instruments.html?w=1280&theme=dark&view=help&hero=keyboard&palette=app),
[six, five and four strings, with and without fret wires](design/phase-b/instruments.html?w=1280&theme=dark&view=necks&palette=app),
[the same states in grey](design/phase-b/instruments.html?w=1280&theme=dark&view=states&hero=keyboard&palette=app&grey=1),
[the mockup's palette](design/phase-b/instruments.html?w=1280&theme=dark&view=states&hero=keyboard&palette=tokens).

**The eleven instrument drawings of the app.** Phase B adds the hero functions
for the home and keeps the pages' own drawings; each takes the tokens in its
page's step and the vocabulary in step B16, with the states it has today and no
new ones. Until then each keeps today's states, drawn from tokens.

| # | Drawing | File | States it has | Re-skinned in |
|---|---|---|---|---|
| 1 | Keyboard of the Piano page (also the Keys lessons and the scale runner) | `js/piano.js` | in the scale, root, now, next, held | B12 |
| 2, 3 | The two keyboards of the LUMI section | `js/lumi-practice.js` | asked (= now), answered, right, wrong | B12 |
| 4 | Keyboard of the guided performance player | `js/performance-player.js` | now, right, wrong (to be confirmed in its step) | B15a |
| 5 | Keyboard inside Exercises questions | `js/quiz.js` | asked (= now), right, wrong | B10 |
| 6 | Keyboard of the Chords page | `js/chords.js` | chord tones, root | B11 |
| 7 | Keyboards of the chord charts | `js/chordchart.js` | dots with finger numbers | B14a |
| 8 | Neck of the Neck page, with the "now" cell of Tab and the "now" note of Notation | `js/fretboard.js` | in the scale, root, now, next | B13 |
| 9 | Neck of the Chords page | `js/chords.js` | chord tones, root, the sounding chord | B11 |
| 10 | Neck inside Exercises questions | `js/quiz.js` | asked (= now), right, wrong | B10 |
| 11 | Pads | `js/pads.js` | hit (= now) | B14a |

## Page templates

Four templates. A page keeps its content; the template says what its first
screen holds.

| Template | Headline | First screen | Pages |
|---|---|---|---|
| Home | `h1` at `--sl-display-lg`; at most 56 px in a window lower than 700 px; never more than two lines | eyebrow, headline, one detail line, the hero button, "Something else", the instrument, the footer line | the home (step B9) |
| Practice page | one `h1` at `--sl-display-sm` (34 px) | the instrument as hero, one primary action, everything else in folds | Piano, Neck, Tab, Notation, Pads, an Exercises run, a Woodshed run, Voice |
| Tool page | one `h1` at `--sl-display-sm` | exactly one primary button; cards allowed; today's arrangement | Exercises' start, Chords, Circle, Plan, Charts, Songs, Jam, the Woodshed's library, Tuner |
| Settings | one `h1` at `--sl-display-sm` | five groups, each a fold that remembers: Look, Sound, Keyboard and lights, Hands-free, Data and about; all open above 900 px, closed on phones | Settings |

The Voice page (Train › Voice, added by soundLAB 2.1.0) is a practice page:
its hero is the pitch graph. It is not drawn yet and gets the new look in a
step of its own, beside the Tuner's.

Rules of the home, measured on the drawings (placement B, the proposed one: a
page of its own outside the tabs, without a pill row):

- The headline is cut after two lines; the detail line then carries the whole
  title.
- The instrument takes the height that is left between the button and the
  footer line, up to the largest height its proportions allow, and is never
  lower than 140 px. A key is at most six and a half times as long as it is
  wide; a neck is at most 1.75 times its drawing size; a pad is at most 1.3
  times as high as it is wide, and at most square once it is 100 px wide. The
  instrument stands on the footer line; room beyond its largest height stays
  empty between the button and the instrument: 187 to 271 px at 820 × 1180,
  up to 128 px at 390 × 844 (drums), 51 px at 1280 × 800 for the bass neck.
- The button and the whole instrument are on the first screen.

| Window | Pointer | Headline, one / two lines | Hero with a one-line headline | With two lines | With an 80-letter title | Needs |
|---|---|---|---|---|---|---|
| 390 × 844 | touch | 40.5 / 80.9 px | 224 px, 26.5 % | 224 px, 26.5 % | 217.8 px, 25.8 % | 25 % |
| 820 × 1180 | touch | 58.8 / 117.7 px | 318 px, 26.9 % | 318 px, 26.9 % | 318 px, 26.9 % | 25 % |
| 1024 × 640 | mouse | 51.5 / 103 px | 246.8 px, 38.6 % | 195.3 px, 30.5 % | 195.3 px, 30.5 % | 22 % |
| 1024 × 640 | touch | 51.5 / 103 px | 238.8 px, 37.3 % | 187.3 px, 29.3 % | 187.3 px, 29.3 % | 22 % |
| 1280 × 800 | mouse | 91.8 / 183.7 px | 318 px, 39.8 % | 257.5 px, 32.2 % | 235.1 px, 29.4 % | 25 % |
| 1280 × 800 | touch | 91.8 / 183.7 px | 318 px, 39.8 % | 249.5 px, 31.2 % | 227.1 px, 28.4 % | 25 % |
| 360 × 740 | touch | 40.5 / 80.9 px | 210.2 px, 28.4 % | 175.3 px, 23.7 % | 140 px, 18.9 % | 25 % |

Each cell is the lowest of the four instruments (piano, guitar, bass, drums);
the share is of the window's height. The height is the stage's, the box
`#home-hero` with its padding of 12 px (8 px up to 640 px wide); the instrument
drawn inside is lower by that padding at the top and at the bottom. The
narrowest case of "at least as high as the headline block" is 1280 × 800 with
a two-line headline: the block from the eyebrow to the detail line is
244.5 px, the stage 257.5 px with a mouse and 249.5 px with touch, so the rule
holds by 13 and 5 px, and the keyboard inside the padding (233.5 and 225.5 px)
is lower than the block. The plan names 390 × 844, 1024 × 640 and
1280 × 800: all hold. 360 × 740 is not a size the plan names, and there
placement B misses the quarter with a two-line headline and with the 80-letter
title; the owner's page says so. Placements A and C make the home the pill
"Today" of Learn, so the home keeps a pill row (in C the pills move into the
header's row where they fit: at 1280 px, not at 1024 px). Both miss at
1024 × 640 on touch with a two-line headline (140 px, 21.9 %), and at
390 × 844 with the 80-letter title (165.8 px, 19.6 %).

On the Piano page, a practice page, the keyboard is 149 px high at 390 × 844,
185 px at 1024 × 640 and 228 px at 1280 × 800, whole on the first screen in
each.

Pictures: [the home on a phone](design/phase-b/home.html?w=390&theme=dark&touch=1),
[at 1024 × 640 with the longest title](design/phase-b/home.html?w=1024&theme=dark&nav=b&step=long),
[in light at 1280 px](design/phase-b/home.html?w=1280&theme=light),
[the Piano page](design/phase-b/pages.html?w=1280&theme=dark&view=piano),
[Exercises' start](design/phase-b/pages.html?w=390&theme=dark&touch=1&view=quiz),
[the Woodshed's library](design/phase-b/pages.html?w=1280&theme=dark&view=shed),
[the Plan](design/phase-b/pages.html?w=1280&theme=dark&view=plan),
[Settings](design/phase-b/pages.html?w=390&theme=dark&touch=1&view=settings&whole=1).

## Layout

- Phone first: 16 px gutters, no horizontal scroll, bottom tab bar ≤ 900 px.
- Tablet and PC: the hero spans the width; type scales with `clamp()`.
- FL plugin window (later): everything must work at 1024 × 640.
- Headline never wraps past two lines; the hero is never cropped.

### Width tiers

Two breakpoints, both in use today: 640 px and 900 px. One more number changes
one label and not the layout: from 1100 px the instrument chip shows the word
"Practising". Whether the key bar shows its labels, and which form the lock's
sentence takes, is not a breakpoint: script measures what fits.

| | 640 px and narrower | 641 to 900 px | Wider than 900 px |
|---|---|---|---|
| Tabs | bottom bar, icon over label | bottom bar, icon over label | text in the header's row |
| Header tools | wordmark, instrument chip, "More", metronome | wordmark, instrument chip, keyboard status, help, settings, the link to Gear, metronome | the same, after the tabs |
| "More" | a panel that lists Keyboard lights, Help for this page, Settings and the link across, each with its words | not shown | not shown |
| Key bar | one row of five chips; each opens its panel | two rows: Key, the tempo stepper, lights, Help; under them the lock's switch with its sentence in full | one row that never wraps: Key, the tempo stepper, the lock's switch with its sentence, lights, Help |
| A key-bar panel | rises from the bottom | rises from the bottom | opens under its chip |
| Sheet | bottom sheet | bottom sheet | panel on the right, 440 px |
| Messages | the window minus both gutters, above the tab bar | at most 460 px, above the tab bar | at most 460 px, 24 px from the lower edge; beside an open sheet |
| Page margin | 16 px at the sides, 24 px on top | the same | 24 px at the sides, 32 px on top |

**The key bar's words.** Above 900 px the bar takes the longest forms that fit
its one row, in this order: labels ("Key", "Tempo", "LUMI lights", "Help") and
the key's full name; then without labels; then the lock's sentence shorter;
then the key's short name; then Help as dots only and the lights' state in one
word; last the switch without the words "Scale lock". An ellipsis is the last
resort; in the measured cases below no name was cut.

| The lock's sentence | On | Off |
|---|---|---|
| Full | ON · only A Dorian notes sound | OFF · every note sounds |
| Shorter | ON · A Dorian only | OFF |
| Shortest | ON · A Min Pent only (the scale's short name) | OFF |
| On a phone's chip | On | Off |

Measured with three keys (A Dorian, A Minor Pentatonic, Db Natural Minor): at
1280 px the full sentence fits for all three; at 1100 px for two of them (A
Minor Pentatonic takes the shorter form); at 1024 px only for A Dorian with a
LUMI connected; at 901 px every key takes the shorter or the shortest form.
From 641 to 900 px the sentence has the second row to itself and is always
full.

Short scale names, for a chip that is too narrow for the full one: Natural
Minor (Aeolian) → Minor; Minor Pentatonic → Min Pent; Major Pentatonic → Maj
Pent; Harmonic Minor → Harm Minor; Melodic Minor → Mel Minor; Phrygian Dominant
→ Phryg Dom. Any other scale is short once the words in brackets are left out.
On a phone the five chips are set in Barlow Condensed 600 between 14 and 16 px.

### Measured heights of the shell

Touch / mouse, in px. Measured in 160 cases: ten widths, both pointers and
eight states (three keys, each with the lock on and off, and A Dorian also
without a keyboard). None scrolls sideways, none breaks the header into two
rows, none cuts a key's name, and in every one the lock's state is a word.

| Width | Header row | Pill row | Key bar | Key bar rows | All three | Bottom tab bar |
|---|---|---|---|---|---|---|
| 360, 390, 640 | 56 / 52 | 52 / 48 | 57 / 53 | 1 | 165 / 153 | 65 / 61 |
| 641, 820, 900 | 64 / 60 | 52 / 48 | 121 / 113 | 2 | 237 / 221 | 65 / 61 |
| 901, 1024, 1100, 1280 | 64 / 60 | 52 / 48 | 65 / 61 | 1 | 181 / 169 | none |

Each height is a sum of tokens. Header row: `--sl-control-h` plus 4 px above
and below, 8 px from 641 px. Pill row: `--sl-control-h` plus 4 px. Key bar:
`--sl-control-h` plus the same padding as the header row plus a 1 px line; with
two rows, one more control and an 8 px gap. Bottom tab bar: `--sl-control-h`
plus 16 px plus a 1 px line. A page with one page in its tab group, Settings
and the home in placement B have no pill row.

When the header has slid away the key bar is the top element and takes the top
safe-area inset the header carries otherwise.

Pictures: [the key bar on a phone](design/phase-b/shell.html?w=390&theme=dark&touch=1),
[on an upright tablet](design/phase-b/shell.html?w=820&theme=dark&touch=1),
[on a desktop](design/phase-b/shell.html?w=1280&theme=dark),
[the lock's panel](design/phase-b/shell.html?w=390&theme=dark&touch=1&pop=lock),
[the message a flip shows](design/phase-b/shell.html?w=390&theme=dark&touch=1&toast=lock),
["More"](design/phase-b/shell.html?w=390&theme=dark&touch=1&pop=more),
[the header slid away](design/phase-b/shell.html?w=1280&theme=dark&scrolled=1),
[the Train tab](design/phase-b/shell.html?w=390&theme=dark&touch=1&page=vocal),
[Gear with its bar folded](design/phase-b/gear.html?w=1280&theme=dark&page=deck)
and [open](design/phase-b/gear.html?w=1280&theme=dark&page=deck&bar=open).

## Motion

- Components animate only through `--sl-dur`, `--sl-dur-fast` and `--sl-ease`.
  Under `prefers-reduced-motion` both durations are zero, so everything a
  component moves stands still: the spinner, the confirm's line, a fold's
  caret, the header's slide.
- Motion made in script (the blinking "next" key, the beat's pulse on the
  metronome button) is gated by one helper that Phase B adds, `App.motionOK()`.
- The home starts no motion by itself: its instrument marks no "now" and no
  "next" note, so nothing blinks.
- What moves, and how long: a colour or a boundary 120 ms; a switch's knob, a
  fold's caret, a bar's width and the header's slide 200 ms; the loading ring
  one turn a second; the confirm's line 3 s.

## Accessibility

- Contrast AA for all text in both themes (tokens are chosen for it).
- Visible focus ring (`--sl-focus`) on every control; full keyboard path.
- Labels for every control; status by text + icon, not color alone.
- Respect `prefers-reduced-motion`; no autoplaying motion on the home.

How each is checked: the pair list above; one focus rule for everything that
takes the keyboard inside `.sl-skin`; an accessible name on every icon button
and chip (a chip says its value and what a tap does: "Key: A Dorian. Change
key, scale and mode"); the table of shared states; the two duration tokens.
A sheet and the tour are dialogs that keep the focus inside.

## Open points

- The home at 360 × 740 with a two-line headline (23.7 %) or an 80-letter title
  (18.9 %) is under the quarter.
- On an upright tablet (820 × 1180) the home leaves 187 to 271 px empty
  between the button and the instrument, because the instrument stops at its
  largest height; not settled whether that room is shared out above the words
  instead.
- On a phone lower than 816 px the primary button of the Piano page is under
  the first screen, and lower than 792 px that of Chords and the Plan: at
  360 × 740 it ends at 751 px on Piano and at 727 px on Chords and the Plan,
  and the tab bar starts at 675 px. 360 × 740 is not a size the plan names;
  the step of each page (B11, B12) decides whether the layout or the rule gives
  way.
- Two labels are under 4.5:1 by their ink alone and are read against their
  outline (A# in Note name mode; ♭7 in the mockup's palette).
- In soundLAB Gear the header's key button cuts five key names on a 360 px
  phone, and up to fourteen in a touch window 641 to about 648 px wide.
- Not drawn: hover, pressed and focus states; the Voice page; the weak-spot map
  on Exercises' Progress tab; the home for Voice, Synth and Other.
- The "it failed" icon of the drawings was written from memory; it is compared
  with the icon set before the messages' step adds it.
- Nothing was tried on a real phone, iPad or Windows PC, or in Safari or
  Firefox.

## The drawings, and re-rendering the mockups

The drawings are static HTML pages under `docs/design/phase-b/`. Each loads
`css/tokens.css`, then `mock.css`, then `mock.js`, and no app script and no app
stylesheet, so a drawing does not change when the app's code does. The sample
texts, page names and colours in `mock.js` are copies of the app's, as of
soundLAB 2.1.0: 15 pages, and the Train tab is Woodshed, Voice, Tuner.

| File | What it shows | Answers |
|---|---|---|
| [index.html](design/phase-b/index.html) | the owner's page: every open question beside its picture | |
| [shell.html](design/phase-b/shell.html) | header and key bar at every width, the five panels, "More", the flip's message: 29 states | G1, G2 |
| [home.html](design/phase-b/home.html) | the home for piano, guitar, bass and drums, in three placements, with the headlines the code gives: 20 states | G3 |
| [instruments.html](design/phase-b/instruments.html) | keyboard, neck and pads in every state, at the five Help levels, in two palettes: 29 states | G4 |
| [overlays.html](design/phase-b/overlays.html) | the three sheets, the message stack, the pedal's confirmation, the tour card, empty, loading, error: 37 states | |
| [pages.html](design/phase-b/pages.html) | the Piano page, Chords, Exercises' start, the Woodshed's library, the Plan, a row at three heights, Settings: 17 states | owner's questions 6 and 7 |
| [gear.html](design/phase-b/gear.html) | soundLAB Gear's Deck and Hub as they are today inside the new header: 6 states | owner's question 5 |
| `mock.css` | the drawings' styles: tokens only, the plan's class names; the first draft of `css/components.css` | |
| `mock.js` | the shell, the sample data, the contact view | |
| `mock-hero.js` | the three instruments and the lighting model; the first draft of `js/hero.js` | |

**Opening a drawing.** Without a parameter a drawing shows its contact view:
every state at every width it needs, dark and light, each in a labelled frame.
A tap on a frame's caption opens that state alone. Every state has its own
address:

| Parameter | Meaning |
|---|---|
| `w=<px>` | the state alone, laid out for the window it is given; the number is the width its frame had |
| `theme=dark` or `light` | the theme |
| `touch=1` or `0` | forces the touch heights (48 px) or the mouse heights (44 and 36 px), whatever the device is |
| `only=<state>` | contact view: one state only |
| `key=A-dorian`, `bpm=120`, `lock=1`, `lights=scale`, `help=3`, `inst=guitar` | the shell's state in any drawing that embeds the shell |
| `pop=key`, `tempo`, `lock`, `lights`, `help` or `more` | the open panel |
| `sheet=metronome`, `lights` or `instrument` | the open sheet |
| `page=<page id>`, `app=gear`, `nav=a`, `b` or `c`, `scrolled=1`, `goal=1`, `beta=1`, `met=1` | the page, the app, the home's placement, the header slid away, the goal mark, the beta tag, the click running |

A drawing's own parameters (the home's `step=` and `day=`, the instruments'
`view=`, `hero=` and `palette=`, the pages' `view=`) are listed in the comment
at the top of that file; the conventions all drawings share are in the header
comments of `mock.css`, `mock.js` and `mock-hero.js`. The frames' window sizes
are 360 × 740, 390 × 844, 640 × 900, 641 × 900, 820 × 1180, 1024 × 640 and
1280 × 800. In a page's console, `Mock.frames()` lists every frame of a contact
view with its address.

**A picture of one state.** Pictures are never committed: both deploys publish
the whole repository. Write them to a folder outside it (`OUT` below). Never
take a full-page screenshot of a phone picture: it switches touch emulation off
for the rest of that page's life.

```
OUT=/tmp/shots node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});const p=await c.newPage();
await p.goto('file://'+process.cwd()+'/docs/design/phase-b/shell.html?w=390&theme=dark&touch=1&pop=lock');await p.evaluate(()=>document.fonts.ready);
await p.screenshot({path:process.env.OUT+'/shell-390-lock.png'});await b.close();})()"
```

**The chosen mockup**, the one picture that is in the repository:

```
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();
const c=await b.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2});const p=await c.newPage();
await p.goto('file://'+process.cwd()+'/docs/design/home-mockup.html?theme=e');await p.evaluate(()=>document.fonts.ready);
await p.screenshot({path:'docs/design/home-e-stage.png'});await b.close();})()"
```
