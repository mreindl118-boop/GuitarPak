# Map: everything that is not a page, and the soundLAB Gear side (input for Phase B)

Key `overlays`. Tree read: the worktree `…/scratchpad/wt/a4` at commit `a914df2` (branch
`claude/verify-project-files-4bchk6-v2-a4`). Nothing in it was changed. All paths below are relative to that
worktree; `file:line` are its lines as they are now. Pictures are in
`scratchpad/v2/phaseB/shots/overlays/`
(called `shots/` below), the scripts and measured numbers in
`scratchpad/v2/phaseB/work-overlays/`
(called `work/` below).

The working files and screenshots this document names (work-…/, shots/…) were scratch files of the planning
session. They are not in the repository: pictures are never committed, because both deploys publish the whole
tree.

Words used here. **soundLAB** = `index.html`. **Gear** = `gear.html`. **Shared class** = one of the classes
that `css/style.css:5-7` calls "class contracts used by modules": `card`, `row`, `tight`, `spread`, `grid2`,
`muted`, `small`, `big-display`, `mid-display`, `btn` (`primary`, `danger`, `big`, `sm`), `field`, `seg`,
`chip`, `legend-dot`, `list`, `error`, `good`, `bad`, plus the bare form elements styled in the same file
(`select`, `input`, `label.field`, `details.tips`). **Old variables** = the custom properties of
`css/style.css:42-108` (`--bg`, `--card`, `--accent`, `--h-ctl` …). **Tokens** = the `--sl-*` properties of
`css/tokens.css`.

## 0. How this map was made, and what was not checked

- Read in full: `docs/ROADMAP-2.0.md`, `docs/DESIGN-SYSTEM.md`, `css/tokens.css`, `css/style.css`,
  `docs/design/home-mockup.html`, `index.html`, `gear.html`, the Phase A section of `CLAUDE.md` (`:1260-1900`),
  `js/lights.js`, `js/help.js`; `js/settings.js` except lines 331-599 (the wiring of the sound-input card,
  only searched); the markup, style and registration parts of `js/metronome.js`, `js/remote.js`, `js/app.js`;
  the injected style blocks of the six Gear modules. The rest of the Gear modules was searched, not read.
  `docs/plans/phase-a/PLAN.md` was NOT read for this map (only its role is known from `CLAUDE.md:1262-1270`).
- Rendered in headless Chromium (Playwright, `deviceScaleFactor: 1`, private server on port 5415, stopped at the
  end): the mockup, and every overlay at 1200 × 900 and 390 × 844, dark and light. 240 pictures; I looked at the
  ones described below (not at every one of the 240; where I only measured, the text says "measured").
- MIDI was a fake Web MIDI access with two ports, "LUMI Keys BLOCK" and "MODX8+ MIDI 1" (`work/lib.js`). The fake
  has no `addEventListener`; the Helix page therefore prints "acc.addEventListener is not a function" in red in
  my Helix pictures. That line is my fake's fault, not the app's (the `helix` suite has its own fake).
- Phone pictures use a touch context, so `(pointer: coarse)` matches and controls are 38 px high
  (`css/style.css:109`). **A finding about the tooling:** a Playwright `fullPage` screenshot switches the touch
  emulation off for the rest of that page's life (measured in `work/ptr3.js`: `coarse: true, seg 38` before,
  `coarse: false, seg 34` after). Every phone picture here was therefore taken with a tall viewport or as an
  element screenshot, never `fullPage`. A Phase B screenshot check must do the same or it measures the
  desktop sizes at phone width.
- Forced, not reached through the app: the metronome's error line (it only shows when audio cannot start,
  `js/metronome.js:445`, `:449`), and the "progress was not saved" box of `js/xp.js:78` (built by my script from
  that line's markup). Both are marked "forced" where shown.
- Not checked: any real device, a real LUMI or MODX, Safari or Firefox, the Android WebView, the claude.ai
  viewer frame, native `confirm()` / `prompt()` boxes (headless Chromium does not draw them), reduced-motion
  rendering, a screen reader. Contrast ratios were not computed here (the design map does that).
- The "experiment" of section 12 uses a stand-in for the Phase B style rules, written by me from
  `docs/DESIGN-SYSTEM.md` and `css/tokens.css` (`work/exp-variants.css`). The real Phase B rules do not exist
  yet. The numbers show the kind and size of the effect, not the final look.

## 1. Twelve findings that shape the plan

1. **The mockup draws none of these things.** It is a fixed 1280 × 800 frame (`docs/design/home-mockup.html:26`);
   at 390 px wide it renders the same 1280 px picture (`shots/mock-e-390.png`, measured `scrollWidth 1280`). It
   has no sheet, toast, Settings, tour, error or empty state, and its header has a gear icon and two status
   lights but no question mark, no metronome and no lights button (`:114-123`). Every overlay must be designed
   from the token and component list alone (`docs/DESIGN-SYSTEM.md:40-47`).
2. **Five of the overlays are one code path for both apps**: the two sheets (`index.html:63-82` =
   `gear.html:62-81`), the help tour (`js/help.js`, loaded by both: `index.html:139`, `gear.html:107`), the toast
   (`js/app.js:2002-2016`), the remote HUD (`js/remote.js:218-232`), the update banner (`js/app.js:180-219`).
   Settings exists only in soundLAB (`index.html:97`, `:140`; no panel and no script in `gear.html`).
3. **Settings is eight cards and about 3,050 px tall** at 1200 px (measured 3,054), 3,719 px on a 390 px touch
   phone. That is the "dashboard of cards" the design system rejects for pages (`docs/DESIGN-SYSTEM.md:10-13`).
   It uses 7 segmented controls, 4 selects, 2 sliders, 3 checkboxes, 3 disclosures, 1 level meter, 1 colour
   picker and about 16 buttons; **the segmented control, the slider, the plain labelled select, the checkbox,
   the disclosure and the meter are not in the list of components to build** (`docs/DESIGN-SYSTEM.md:42-47`).
4. **No control in any overlay is 44 px today.** Measured: small button, segmented control, select 34 px (38
   on touch); sheet close 34 × 34 (38 × 38); metronome −5/+5 48 × 40 (42 × 38 on a phone); beat dot 30 × 30;
   accent dot 32 × 32; tour "Next" 54 × 34 (54 × 38). The design system asks 44 px, 48 on touch
   (`docs/DESIGN-SYSTEM.md:37`, `css/tokens.css:92`, `:140-142`).
5. **Raising the one control height breaks the phone header.** `--h-ctl` sizes page controls AND the five
   corner icons (`css/style.css:287-289`, `:627`, `:662`, `:749`). With `--h-ctl` at 48 px the header at 390 px
   wraps into two rows in both apps (measured: top bar 93 px → 132 px, `work/facts-hdr.json`); at 360 px it
   holds only because of the 34 px rule at `css/style.css:964-966`. `tests/nav.test.js:135-136` asserts the one
   row.
6. **The floating boxes are half as wide as they may be.** `#app-toast`, `#xp-toast`, `#back-hint` and
   `#app-update` are placed with `left: 50%` and an automatic width (`css/style.css:868-885`, `:888-905`), so
   they shrink to half the window: 195 px at 390 px, 600 px at 1200 px. A long start notice is 195 × 236 px
   on a phone (`shots/toast-long-390-light.png`); the update banner stacks its text and two buttons in three
   rows (195 × 164). Only `#snd-hint` has a real width (`:874`) and fills the phone (358 px).
7. **The boxes share one spot and cover each other.** `#app-toast`, `#xp-toast`, `#back-hint`, `#snd-hint`
   sit at the same bottom offset (`css/style.css:871`, `:952`); the banner at the same 18 px on wide screens and the same 84 px on phones (`:892`, `:952`). Seen:
   the practice toast on top of a start notice (`shots/toast-plus-xp-1200-dark.png`), a toast over the
   banner's "Later" button (`shots/update-plus-toast-390-light.png`), the app toast over the Hub's own toast
   (`shots/gear-mhtoast-plus-apptoast-390-dark.png`). There are **five separate toast implementations**
   (section 6).
8. **Layer order today contradicts the tokens.** Today a toast (400) is under a sheet (420)
   (`css/style.css:873`, `:305`): a toast fired while a sheet is open is dimmed at 1200 px and hidden behind
   the bottom sheet at 390 px (`shots/toast-under-sheet-390-light.png`). The tokens put the toast (60) above
   the sheet (40) (`css/tokens.css:104-106`). Ten different `z-index` values are in use (section 6.4);
   the tokens have three.
9. **The design system allows one accent; Settings offers four** (`docs/DESIGN-SYSTEM.md:31`;
   `js/settings.js:47-52`, `:66-68`; `js/app.js:819-847`). The picker writes `--accent`, `--accent-dim`,
   `--accent-glow` inline on `<html>` (`js/app.js:838-840`) and never a token: measured with Teal chosen,
   `--accent` is `#4cc9b0` and `--sl-accent` stays `#ffab47`. A component built only from tokens ignores the
   picker.
10. **Old variable names are read by scripts**, for canvas colours: `js/synthdeck-scope.js:65-71`,
    `js/woodshed.js:863-867`, `js/performance-player.js:239`. Their fallbacks are the dark values. If the old
    names stop being defined, those drawings stay dark in the light theme. The names must stay defined through
    Phase B, in both apps.
11. **Gear's four pages lean on the shared classes about as much as soundLAB's do, but nothing breaks when the
    shared classes change.** In a stand-in re-skin, none of 16 page states at 2 widths got sideways scroll, a
    clipped label or overlapping controls; pages grow by up to 565 px on a phone and take a mixed look (new
    pill buttons beside old square tiles; a wrapped segmented control becomes a blob). Section 12.
12. **Gear's pages can be frozen exactly, with one prefix and no copy of the stylesheet.** With every new rule
    scoped to "everything except what is inside Gear's `<main>`", 88,024 elements in 64 Gear page states had
    0 changed computed properties and 0 moved boxes, while Gear's header and sheets took the new rules
    (`work/poc2.js`, `work/facts-poc2.json`, `shots/poc-gear-hub-metsheet-1200-dark.png`). Section 12.6.

## 2. Inventory: one row per thing

| Thing | Built by | Styled by | In Gear? | Layer (`z-index`) | Announced as |
|---|---|---|---|---|---|
| Settings (a page that acts as an overlay) | `js/settings.js:54-223`; opened by `js/app.js:1032-1050`, toggled by `:1196-1205` | `js/settings.js:12-45` (25 rules) + shared classes + `.fb-field` from `js/fretboard.js:1673` | no (`gear.html` has no `panel-settings`; its gear icon leaves for `index.html#settings`, `js/app.js:1884-1887`) | page flow | none |
| Sheet frame | `index.html:63-82`, `gear.html:62-81`; `js/app.js:1211-1257`, `:1486-1504` | `css/style.css:302-338`, phone `:981-989` | yes, same markup | 420 (`css/style.css:305`) | `role="dialog" aria-modal="true" aria-labelledby` (`index.html:64`, `:74`) |
| Metronome sheet body | `js/metronome.js:124-182` | `js/metronome.js:83-122` (35 rules) + `css/style.css:841-859` | yes (`gear.html:98`) | in the sheet | — |
| Lights & help sheet body | `js/lights.js:68-134` (rebuilt on every paint) | `js/lights.js:180-194` (24 rules) | yes (`gear.html:108`) | in the sheet | status lines `role="status"` only for the Bluetooth line (`js/lights.js:93`) |
| Help button and tour | `js/help.js:220-240` (layer), `:166-218` (step), `:266-276` (button) | `js/help.js:253-264` (7 rules) | yes; no welcome in Gear (`js/help.js:284`) | 500 (`js/help.js:254`) | no role, no `aria-modal`, focus not moved (measured: `document.activeElement` is `<body>`) |
| App toast `#app-toast` | `js/app.js:2002-2016` | `css/style.css:868-886`, phone `:952` | yes | 400 | `role="status" aria-live="polite"` (`js/app.js:2007-2008`) |
| Practice toast `#xp-toast` | `js/quiz.js:2887-2895` | same rules | no (quiz is not loaded) | 400 | `role="status"` |
| Hub toast `#mh-toast` | `js/midihub.js:177-185`, element `:918` | `js/midihub.js:1236` | Gear only | 50 | none |
| Helix toast `#hx-toast` | `js/helix.js:73`, element `:882` | `js/helix.js:1077` | Gear only | 50 | none |
| Woodshed flash `#ws-flash` | `js/woodshed.js:1555-1558`, used at `:1105` | `js/woodshed.js:1551-1552` | no | 450 | none |
| Remote HUD `#remote-hud` | `js/remote.js:218-232` | `js/remote.js:389-392` | yes | 450 | `role="status" aria-live="polite" aria-atomic="true"` (`:222-224`) |
| Update banner `#app-update` | `js/app.js:180-219` | `css/style.css:888-905`, phone `:952` | yes | 300 | none (no role; two real buttons) |
| Sound hint `#snd-hint` | `js/app.js:1786-1793` (soundLAB only, `:1785`), `js/audioin.js:197-202` (both apps) | `css/style.css:868-883` | only the Hear-input one | 400 | `role="status"` |
| Back hint `#back-hint` | `js/app.js:1454-1459` | `css/style.css:868-885` | yes (names the app, `:1457`) | 400 | `role="status"` |
| "Progress was not saved" box | `js/xp.js:78` | `.card` + an inline style | no | 9999 | `role="status"` |
| Module error card | `js/app.js:1815`, `:1822`, `:1190` | `.error`, `css/style.css:822-829` | yes | page flow | none |
| Deck preset sheet `.st-sheet` | `js/synthtab.js:147-…`, open/close `:470-471` | `js/synthtab.js:550-553` | Gear only | 60 | `role="dialog" aria-modal="true"` (`:147`) |
| Live slot picker `.st-lvpick` | `js/synthlive.js:222`, `:240-243` | `js/synthlive.js:319-320` | Gear only | 60 | none |
| Print style | `js/chordchart.js:525-529` | same | no | — | — |

Two more page-owned layers, listed only for the layer order: the maximised neck `.fb-max` (200,
`js/fretboard.js:1675`) and Jam's drag ghost `.jam-ghost` (600, `js/jam.js:1005`).

## 3. Settings (soundLAB only)

### 3.1 How it is opened and closed

`#settings-btn` (`index.html:42`) calls `toggleSettings` (`js/app.js:1888-1891`, `:1196-1205`). Settings is the
last entry of `PANEL_ORDER` (`js/app.js:111`), not a page of `PAGES`: it has no tab, hides the pill strip, is
never stored as the last page (`js/app.js:1032-1050`), and Back closes it (`:1383`). The module is registered at
`js/settings.js:995-1030`; `onShow` re-reads volume, wake and latency and repaints the remote rows, the rules
line and the Backup line (`:998-1029`). The panel is 760 px wide at most and centred
(`js/settings.js:26`); measured 760 px at 1200 and 366 px at 390.

### 3.2 The eight cards

All cards are `<div class="card">` with an `<h2>` (`css/style.css:481-509`: 16 px radius, 20 × 22 px padding,
a 7 px accent dot before the title, Bebas 21 px). Sub-headings are `.set-sub` (`js/settings.js:14-16`), notes
are `.muted.small.set-theme-note` (`:13`).

| # | Card (`h2`) | Markup | Controls (id, kind) | Wiring |
|---|---|---|---|---|
| 1 | Appearance | `js/settings.js:55-69` | `#set-theme` segmented, 3 buttons `data-theme-pref` (`:59-63`); `#set-accent` row of 4 round buttons `.set-acc[data-accent]` (`:47-52`, `:67`) | theme `:608-624` → `App.setTheme` (`js/app.js:858-862`, sets `data-theme` on `<html>` `:852`); accent `:226-238` → `App.setAccent` (`js/app.js:843-847`) |
| 2 | Sound | `:70-111` | `#set-vol` slider + `#set-vol-val` (`:74-75`); `#set-latency` text (`:79`); `#set-tone` 4 buttons (`:82-87`); `#set-ptone` 4 buttons (`:92-97`); `#set-bass` 2 buttons (`:103-106`); a "Time signature" note with no control (`:109-110`) | `:241-248`, `:626-681`; latency text `:1012-1028` |
| 3 | Backup | `:112-124` | `#set-backup-info` text (`:117`); `#set-backup-out` button (`:119`); "Import settings" = a `<label class="btn sm">` around a hidden file input `#set-backup-in` (`:120`); `#set-copy-again` button (`:121`); `#set-backup-msg` status (`:122`) | `:863-989` |
| 4 | Screen & battery | `:125-131` | `#set-wake` checkbox in a `label.set-check` | `:251-256` |
| 5 | MIDI keyboard (`#set-midi-card`) | `:132-176` | `#set-midi-enable` primary button + `#set-midi-msg` (`:136-137`); `#set-midi-rules` line with a button built on demand (`:140`, `:853-855`); `#set-midi-gear` "Found:" chips `.set-chip` (`:142`, `:763-781`); selects `#set-midi-in`, `#set-midi-out` in `label.field` (`:144-145`); `#set-midi-test`, `#set-midi-bt` buttons (`:146-147`); `#set-midi-voice` 3 buttons (`:150-154`) + note; `details.tips#set-midi-btnote` (`:156-161`); `details.tips#set-midi-more` with `#set-midi-bend` 4 buttons and `#set-open-lights` (`:162-174`) | `:683-861` |
| 6 | Hands-free control (`#set-remote-card`) | `:178-183`; the rows are built by `js/remote.js:342-364` into `#set-remote` | per action a `.rm-row` with name, hint, state text, "Learn" and "Clear" buttons, an optional "Latching" checkbox (`js/remote.js:351-357`); checkboxes `#rm-pt`, `#rm-dbl` in `label.set-check` (`:360-361`); `details.tips` "Which buttons work?" (`:362`) | `js/remote.js:371-386`; style `js/remote.js:393-398` |
| 7 | Sound input & output (`#set-audio-card`) | `:184-215` | `#set-audio-enable` primary button + `#set-audio-msg`; selects `#set-audio-in`, `#set-audio-out` (`:193-194`); `#set-audio-hint`; `#set-ain-mon` 4 buttons `data-mon` with `aria-pressed` (`:198-203`); `#set-ain-gain` slider (`:207`); `#set-ain-meter` (`role="meter"`, `:211`); `#set-ain-warn` (`role="alert"`, `:213`); `#set-ain-msg` | `:258-600` |
| 8 | About | `:216-222` | version text, `#set-update` button, `#set-update-msg` | `:602-606` |

Own classes, all in `js/settings.js:12-45`: `.set-sub`, `.set-theme-note`, `.set-acc` (32 × 32 round, `:17-18`),
`.set-check` (checkbox 20 × 20 with a note under the name, `:22-25`), `.set-meter` (`:28-34`), `.set-ain-hint`,
`.set-ain-warn`, `.set-gear`, `.set-chip` (`:40-42`), `.set-steps`. A "held" state for Hear input:
`#set-ain-mon button.held` (`:38`).

Two things borrowed from elsewhere:

- The wrapper around four segmented controls is `<div class="fb-field">` (`js/settings.js:58`, `:81`, `:91`,
  `:102`). That class is defined by the Fretboard page's style block (`js/fretboard.js:1673`). Settings looks
  right only because the Fretboard module has injected its styles first.
- The "Listening…" Learn button gets the class `active` (`js/remote.js:354`). No rule for `.btn.active` exists
  in `css/style.css` or in any injected block (searched). Seen: the button changes its word but not its look
  (`shots/set-remote-learn-390-dark.png`). The row itself turns accent-tinted when the pedal fires
  (`.rm-row.fired`, `js/remote.js:395`; `shots/hud-390-dark.png`).

A confirmation without a dialog: "Copy my earlier data again" needs two taps within 3 s, the second not sooner
than 0.6 s; after the first tap the button reads "Tap again: this overwrites the settings here" and turns
primary (`js/settings.js:906-934`). Seen: the button grows from one short label to 280 px
(`shots/set-copyagain-armed-390-dark.png`).

### 3.3 What I see

- `shots/set-midi-1200-dark.png`, `-light.png` (LUMI + MODX connected): one 760 px column of eight cards on
  the page background, 3,054 px tall. Each card: amber dot, caps title, small caps sub-headings, grey notes.
  Card heights 279, 631, 219, 127, 388, 614, 298, 132 px. Light is the same layout on cream with white cards;
  the accent is the darker amber.
- `shots/set-midi-390-dark.png`, `-light.png` (touch): the same eight cards full width (366 px), 3,719 px
  tall; card heights 313, 747, 336, 119, 536, 787, 317, 173 px. Nothing is wider than the screen (measured:
  no element past the right edge). The "Found:" chips wrap to two lines; the two selects stack; the three
  Backup buttons wrap to two rows.
- `shots/set-nomidi-*.png`: the MIDI card is three lines ("Connect MIDI" primary button and the sentence "The
  browser asks once if soundLAB may use MIDI. Click Allow."); the Hands-free card adds "MIDI is off: connect it
  in the MIDI keyboard card above…" (`js/remote.js:345-347`); Sound input shows "Find my gear" and the four-way
  switch.
- `shots/set-card4-390-light.png`, `set-card4-1200-dark.png`: the MIDI card with both disclosures open. The
  disclosure is a "?" in a circle and a bold line (`css/style.css:531-557`).
- `shots/set-focus-1200-light.png`: keyboard focus is a 2 px accent outline, 2 px off the control (measured;
  `css/style.css:694`).
- `shots/set-accent-teal-1200-dark.png`: with Teal chosen every amber part is teal, the logo's "LAB" included.
  (The ring stayed on the amber dot only because my script called `App.setAccent` directly; the ring is painted
  on the card's own click, `js/settings.js:232-237`.)

### 3.4 Tests that depend on Settings

| Suite | What it touches (lines of the suite) |
|---|---|
| `audioin` | 53 references to `#set-audio-*` / `#set-ain-*` (ids, `data-mon` values at `tests/audioin.test.js:310`, `:328`, `:496`, `:500`), opens Settings 7 times |
| `btmidi` | `#set-midi-bt`, `#set-midi-btnote`, `#set-midi-msg`, `#set-midi-in` |
| `multiin` | `#set-midi-voice` (`data-voice="off"`, `tests/multiin.test.js:139`), `#set-midi-gear`, `#set-midi-more`, `#set-midi-bend`, `#set-midi-voicenote` |
| `lights` | `#set-midi-bend` (`data-bend`, `tests/lights.test.js:250`, `:254`) |
| `storage-import` | `#set-backup-info`, `#set-backup-in`, `#set-backup-out`, `#set-backup-msg`, `#set-copy-again` (its words and the two taps) |
| `trim` | `#set-midi-card`, `#set-midi-rules`, `#set-backup-*`; and that no card title reads Studio or Plug-ins (`tests/trim.test.js:261`: `#panel-settings h2, h3`) |
| `remote` | `#set-remote .rm-row`, `.rm-what`, `[data-rmlearn]`, `[data-rmclear]` (`tests/remote.test.js:75-96`, `:284`) |
| `gear` | `#panel-settings`, `#set-audio-out`, the way to `index.html#settings` (`tests/gear.test.js:220`, `:753`) |
| `oneopen` | `#panel-settings` active, `#set-midi-enable` (`tests/oneopen.test.js:75`) |
| `context-global` | Settings is the 15th "page" of its matrix (`tests/context-global.test.js:7`, `:89-92`) |
| `nav`, `practice`, `assets` | `#settings-btn` (order of the corner tools `tests/nav.test.js:94`; `tests/assets.test.js:177`) |

No suite reads `#set-theme`, `#set-accent`, `#set-vol`, `#set-wake`, `#set-tone`, `#set-ptone`, `#set-bass` or
`#set-update` (searched `tests/`). No suite reads a computed colour or size inside Settings.

## 4. The two sheets

### 4.1 The frame (same in both apps)

`<div class="sheet" id="sheet-<name>" hidden>` › `.sheet-card` › `.sheet-head` (an `<h2>`, a help button
`[data-sheet-help]`, a close button `[data-sheet-close]`) and `<section class="sheet-body" id="panel-<name>">`
(`index.html:63-82`). `openSheet` shows it, adds `open` and `sheet-open` on `<html>`, calls the module's
`onShow`, focuses the close button and emits `sheet {name, open}` (`js/app.js:1214-1237`); Escape closes and
Tab stays inside (`js/app.js:1852-1866`); a click on the backdrop or the X closes (`:1501-1503`); the pedal
closes it and passes the action to the page (`:1407-1412`); Back closes it (`:1382`).

Style: a fixed layer, backdrop `rgba(8,7,9,0.55)` in both themes (`css/style.css:302-311`); the card is at most
640 px wide and `100vh − 48px` high, 18 px radius, centred (`:313-323`); at 640 px and below it is a bottom
sheet, full width, at most 88 % of the height, top corners rounded (`:981-989`). The design system asks "bottom
on phones, side on wide" (`docs/DESIGN-SYSTEM.md:45`); today's wide form is a centred box.

### 4.2 Metronome

Markup `js/metronome.js:124-182`: a tempo row (`#met-m5`, `#met-m1`, the number `#met-bpm-display.big-display`,
`#met-p1`, `#met-p5`, `:126-135`), a slider `#met-bpm-slider` (`:136`), beat dots `#met-dots` (`:137`, built at
`:291`), `#met-startstop.btn.big.primary` and `#met-tap.btn.met-tap` (`:139-140`), three labelled fields: a text
input with a datalist `#met-sig`, a select `#met-subdiv`, a slider `#met-vol` (`:143-153`), an error line
`#met-err.error` (`:155`), two disclosures `details.met-more` ("Click sounds" with three selects `:157-164`;
"Tempo trainer" `#met-trbox` with a checkbox and three number inputs `:165-180`), and a hint line (`:181`).

Style `js/metronome.js:83-122`. The beat dots are styled twice: by the module (`:91-95`, 26 px) and again in
the stylesheet with a higher-specificity selector (`css/style.css:841-859`, 30 px); the stylesheet wins
(measured 30 × 30). The disclosure `.met-more` (`js/metronome.js:111-114`) is a second disclosure look beside
`details.tips` (`css/style.css:531-557`).

Components used: the 78 px number (`.big-display`, `css/style.css:559-567`; 60 px on phones `:992`), 5 buttons
of three sizes (step 48 × 40, Start 260 × 58, Tap 96 × 58), 2 sliders, 1 select, 1 text input, 3 number
inputs, 1 checkbox, 2 disclosures, beat dots, the error box. Space starts and stops it while the sheet is open
(`js/metronome.js:711-716`).

What I see: `shots/met-1200-dark.png`: a 640 × 552 px box centred over the dimmed Neck page; caps title; "?"
and "X" squares top right, the X with the focus ring; a row −5 −1 **120** +1 +5; a slider; four dots, the
first outlined in amber; a wide amber START and an outlined TAP; Time / Subdivision / Volume in one row; two
closed disclosures; a centred hint. `shots/met-390-light.png`: the same as a bottom sheet from y = 238 to the
bottom edge, covering the bottom tab bar; Time and Subdivision share a row, Volume below. With both
disclosures open the card is 743 px (88 % of 844) and scrolls inside (content 948 px,
`shots/met-open-390-dark.png`); at 1200 it grows to 719 px without scrolling. `shots/met-err-forced-390-dark.png`
(forced): a red-tinted rounded box, 285 × 51 px, centred above the disclosures.

Tests: `nav` opens it from `#met-btn`, checks `aria-expanded`, that `#met-startstop` is inside, that focus is on
`[data-sheet-close]`, Space, Escape, a click at (15, 790) on the backdrop, the X, the sheet's help button, and
on a phone that the card's bottom equals the window height and its width is 390
(`tests/nav.test.js:56-87`, `:149-151`). `practice` checks Back closes it (`tests/practice.test.js:111`),
`remote-quiz` and `remote` that a pedal press closes it (`tests/remote-quiz.test.js:144-154`,
`tests/remote.test.js:165`, `:186`), `context-global` the focus return (`tests/context-global.test.js:96-106`),
`assets` the ids (`tests/assets.test.js:177`). Tour targets inside it: `#met-tap`, `#met-dots`, `#met-trbox`
(`js/help.js:34-36`).

### 4.3 Lights & help

The body is rebuilt as one string on every paint (`js/lights.js:68-134`) and on eight bus events while open
(`:198-199`). Three sections `.lc-sec` with an `<h3>`:

1. **Help level** (`:77-87`): a full-width segmented control `.seg.lc-help` of five buttons `data-lchelp`
   (Full … None), one sentence `.lc-desc`, a note, and, when no LUMI is connected, the "Color notes by"
   Interval | Note switch (`:41-49`, `:85-86`).
2. **Keyboard lights** (`:88-128`): a status line `.lc-status` with one of four kinds (`none`, `connect`,
   `noout`, `ok`; `:51-66`); "Connect keyboard" primary button (`:91`); "Find a Bluetooth keyboard" in the
   Android app (`:92`); "Settings › MIDI" button (`:94`); with a LUMI: the colour switch, a row of 7 or 12
   two-part swatches `.lc-deg` (screen colour over LUMI colour, `:100-103`), a Brightness slider `#lc-bright`
   (`:109`), "Octave keys" 2 buttons (`:110-111`), "Guide focus" 2 buttons (`:113-114`), four grey paragraphs,
   "Keyboard" 3 buttons (`:121-125`), "Test lights" and "Re-send" (`:126`); for another keyboard an On | Off
   switch (`:96-97`).
3. **Hands-free** (`:130-133`): the remote's summary and a "Set up" button that closes the sheet and opens
   Settings at the remote card (`:141-144`).

Style `js/lights.js:180-194`. Components: up to 5 segmented controls, 1 slider, up to 5 small buttons, colour
swatches, status text. No shared `.row` or `.field`: the sheet has its own `.lc-row` / `.lc-lab` (`:187`).

What I see: `shots/lights-nomidi-390-dark.png`: three short sections; "No keyboard connected." in bold and an
amber "Connect keyboard"; the sheet is about 600 px. `shots/lights-lumi-1200-dark.png`: the box fills the
window height (852 px of 900) and scrolls (content 1,001 px); on a phone 743 px with 1,145 px of content
(`shots/lights-lumi-390-light.png`, `-mid-`, `-end-`). The LUMI section is five labelled rows separated by
four paragraphs of small grey text, e.g. "Legacy guides focus the target; the next target blinks. Pitch colors
always follow Intervals or Note Names in the clef menu. Its LUMI Display master controls illumination…"
(`js/lights.js:115-118`). In Gear the same sheet opens over the Hub (`shots/gear-lights-1200-light.png`); its
"Settings › MIDI" and "Set up" buttons leave for `index.html#settings` (`js/lights.js:159`, `:142`;
`CLAUDE.md:1544-1547`).

Against the design system: the key bar is to hold Help level and the LUMI lights mode
(`docs/DESIGN-SYSTEM.md:18-20`), and the note-colour switch is to be in the key bar (`docs/ROADMAP-2.0.md:28-30`).
Those are this sheet's first section and its colour switch. What would stay: connection state, brightness,
octave keys, guide focus, keyboard type, test, the hands-free shortcut. The texts name "the treble-clef menu"
and "the clef menu" (`js/lights.js:96`, `:118`), which the key bar replaces.

Tests: `lights` reads `.lc-status`, `.lc-desc`, `.lc-help .active`, `[data-lchelp]`, `[data-lctype]`,
`[data-lcoct]`, `#lc-resend`, `#lc-bt` (`tests/lights.test.js:219-233`, `:272-276`, `:422`); `colors` reads
`[data-lccolmode]`, `.lc-deg`, and that the switch is in the first section (`tests/colors.test.js:123-134`,
`:307-308`, `:354-357`); `game` opens it from `#lights-btn` and closes with `[data-sheet-close]`
(`tests/game.test.js:274-278`); `gear` opens its tour from `[data-sheet-help="lights"]`
(`tests/gear.test.js:646-648`); `btmidi` looks for a `role="status"` line (`tests/btmidi.test.js:95`);
`lumi-contexts`, `learn-instruments`, `context-global`, `remote`, `remote-quiz` open it through
`App.switchTo('lights')` or `App.sheet`.

## 5. The help system

- **Button**: `#help-btn` (`index.html:41`) gets a hand-written question-mark icon (`js/help.js:268-270`; the
  two sheet help buttons get `App.icon('help')`, `js/app.js:1498`), and pulses (`.hp-pulse`, `js/help.js:262-263`)
  until a tour was finished once (`help.done`, `:155-158`, `:271`). A click opens the tour of the page on screen
  and blurs the button (`:272-275`).
- **Tours**: `TOURS` is keyed by page id (`js/help.js:24-138`): practiceplan, metronome, fretboard, tab,
  notation, chords, piano, songs, jam, shed, tuner, quiz, theory, deck, liveset, midihub, helix, pads, lights,
  settings. There is none for `chart`: it gets the one-step fallback "This page" (`:223-226`; measured). A step
  is `{t, x}` or `{sel, t, x}`. **The 40 selectors in `sel` are a contract for Phase B**: `#pp-today`,
  `#pp-gaps`, `#pp-tools` (`:27-29`), `#met-tap`, `#met-dots`, `#met-trbox` (`:34-36`), `#ctx-btn` (`:40`),
  `#pn-voice`, `#pn-chseg`, `#pn-play`, `#pn-guide`, `#pn-assist`, `.kl-card`, `#pn-lumi` (`:55-61`),
  `#sg-player` (`:66`), `#jam-genre`, `#jam-form`, `#jam-palette` (`:70-72`), `#learn-instrument`, `.qz-strip`,
  `.qz-hometabs` (`:84-86`), `#st-now`, `.st-strips`, `#st-chips`, `#st-explain` (`:94-97`), `#st-lvgrid`,
  `.st-lvopts`, `#st-lvgo`, `.st-lvprof` (`:100-103`), `#mh-views`, `#sdk-now`, `#sdk-tabs`, `#mh-thru`,
  `#mh-profile` (`:106-113`), `#hx-armrow`, `#hx-views`, `#hx-favs` (`:117-119`), `#pd-mode` (`:123`),
  `#lc-remote` (`:130`), `#set-remote-card` (`:136`). A step whose target is missing or off screen silently
  becomes a centred card (`:169-185`).
- **Layer**: `<div id="hp-ov">` with `.hp-ring`, `.hp-card.card` and a close button `.hp-close.btn.sm`
  (`js/help.js:228-232`). The ring is the target's box plus 6 px on each side (`:177-182`), 2.5 px accent
  border, 12 px radius, a glow and a faint white fill (`:255-256`). The card is 320 px wide (86 % of the
  window if narrower), placed under the target, else above, else centred (`:197-211`); it reuses `.card` and
  overrides its padding, border and shadow (`:257-258`). Inside: title `.hp-t`, text `.hp-x`, "n of m", "Back"
  and "Next" / "Done" as `.btn.sm` (`:187-196`). The dim is `rgba(8,7,9,0.5)` in both themes (`:254`).
- **Closing**: a click on the dim, the X, Escape (`:234-238`, `:151-153`), Back (`js/app.js:1380`), the pedal
  (Next / Back press the buttons, Stop closes, `js/app.js:1400-1405`). It emits `tour {open}` (`js/help.js:147`,
  `:233`), which pauses the quiz clock.
- **Welcome**: five centred steps, once, 700 ms after the first start, soundLAB only (`js/help.js:242-250`,
  `:284-290`). Its texts name "the clef button", the five tabs and "the ? in the top bar".
- **Accessibility as built**: the layer has no role and no `aria-modal`; focus is not moved into the card
  (measured: `<body>` has focus) and is not trapped; the page behind stays reachable by Tab. The clef is
  disabled while a tour is open (`js/app.js:1096-1101`).

What I see: `shots/help-ring-1200-dark.png`: the Piano page dimmed; an amber rounded ring around the Sound
select; a 320 × 171 px card under it with an amber border, covering part of the keyboard; an X button in the
top right corner where the metronome icon is. `shots/help-ring-390-light.png`: the same, the card 320 px of a
390 px screen. `shots/help-welcome-390-dark.png`: a centred card "Welcome to soundLAB … 1 of 5 … Next"; the
page is clearly readable behind the 50 % dim. `shots/help-in-sheet-390-dark.png`: a tour inside the open
metronome sheet: the ring around "Tempo trainer", the card above it. `shots/gear-help-390-dark.png`: the Deck
tour in Gear, ring around the strips card. `shots/hud-under-help-1200-dark.png`: the pedal's "NEXT" badge is
drawn under the tour's dim (450 under 500).

Tests: `nav` (`#hp-ov` exists and names the Metronome, a click on it closes, `tests/nav.test.js:77-80`),
`remote` (`.hp-card` text changes on a pedal press, Stop closes, `tests/remote.test.js:167-172`), `gear`
(`#hp-ov .hp-card` text; no welcome in Gear; the welcome's words "Welcome to soundLAB";
`tests/gear.test.js:222`, `:643-649`, `:793-802`), `context-global` (`#help-btn`, `Help.isOpen`,
`tests/context-global.test.js:108-110`), `storage-import` (`:437`), and four suites that read tour TEXTS:
`remote-quiz` (`tests/remote-quiz.test.js:65-66`), `remote-keys` (`:430`), `midihub` (`:67`), `trim` (`:196`).
53 suites seed `help.seen` / `help.done` so that no tour opens by itself.

## 6. Toasts and the other floating boxes

### 6.1 The app toast

`App.toast(msg, ms)` (`js/app.js:2002-2016`): one `<div id="app-toast">` appended to `<body>` on first use,
plain text only, 3.2 s by default, a new call replaces the text; `toast.n` counts calls so the remote can tell
whether a page already said why (`:2013`, `js/remote.js:194-201`). No close button, no action, no kinds (error
and success look the same). Callers pass 4,000 or 8,000 ms for long sentences (`js/remote.js:213`,
`js/midihub.js:1281`); the start notices use `5000 + 4000 × n` ms (`js/app.js:1953`). Who calls it: `js/app.js`
(`:99`, `:1008`, `:1953`), `js/remote.js` (9 places), `js/scoreplayer.js` (11), `js/quiz.js`, `js/songs.js`,
`js/trainer.js`, `js/performance-player.js` (2 each), `js/fretboard.js`, `js/lumi-practice.js`,
`js/practiceplan.js` (1 each), and Gear's `js/synthtab.js`, `js/synthlive.js` (3 each), `js/midihub.js` (2),
`js/synthdeck.js` (1).

Style `css/style.css:868-886`: fixed, centred, 18 px above the bottom (84 px at 900 px and below, clear of the
tab bar, `:952`), 12 px radius, a 1 px full-strength accent border on the card colour, 14 px text.

Measured: "Nothing to move on here" is 181 × 47 px. The two-notice start text is 600 × 89 px at 1200 and
**195 × 236 px at 390** (finding 6). What I see: `shots/toast-short-390-dark.png`: a small amber-outlined pill
box above the tab bar. `shots/toast-long-390-light.png`: a tall narrow column of centred text, ten lines, over
the middle of the page.

### 6.2 The other four toasts

| Box | Where | Differences from the app toast |
|---|---|---|
| `#xp-toast` | `js/quiz.js:2887-2895`; 4 s; removed from the page afterwards | same rules (`css/style.css:868-885`), same spot; drawn over the app toast when both are up (`shots/toast-plus-xp-1200-dark.png`) |
| `#mh-toast` | `js/midihub.js:177-185`, `:918`; 2.2 s | own rule: 76 px above the bottom at every width, 9 px radius, 13 px text, `z-index: 50` (`js/midihub.js:1236`); hides the app toast first while the Hub page is on screen (`:182`); the Deck and Live pages call it although it only shows on the Hub page (`CLAUDE.md:1473-1477`) |
| `#hx-toast` | `js/helix.js:73`, `:882`; 2.2 s | inverted colours (text colour as background), 10 px radius, a shadow, `z-index: 50` (`js/helix.js:1077`) |
| `#ws-flash` | `js/woodshed.js:1105`, `:1551-1558` | fades by opacity, 70 px above the bottom, `z-index: 450` |

`shots/gear-mhtoast-plus-apptoast-390-dark.png`: the app toast drawn on top of the Hub toast, the Hub toast's
outline showing 18 px below it.

### 6.3 Hints, banner, HUD, unsaved box

- **Sound hint** `#snd-hint`: "Your keyboard is connected. Click or tap anywhere to turn on sound…" when a
  MIDI note arrives while audio is locked (`js/app.js:1786-1793`; not in Gear, `:1785`), or "Hear input is on.
  Click or tap anywhere…" (`js/audioin.js:197-202`). Removed on the first tap or key (`js/app.js:1769-1784`).
  Measured 460 × 68 px at 1200, 358 × 89 px at 390. `shots/sndhint-390-light.png`: a full-width amber-outlined
  box of three lines above the tab bar. Besides it, the remote says the same thing through the app toast
  (`js/remote.js:208-214`).
- **Back hint** `#back-hint`: "Press Back again to leave soundLAB." for 2.5 s (`js/app.js:1454-1459`).
  Measured 256 × 47 px at 1200, 195 × 68 px (two lines) at 390.
- **Update banner** `#app-update`: a `<span>` and two `.btn.sm` ("Update now" primary / "Download", "Later"),
  no role, stays until answered (`js/app.js:180-219`); style `css/style.css:888-905` (14 px radius, accent
  hairline, `z-index: 300`). `shots/update-1200-dark.png`: one row, 385 × 56 px, centred at the bottom.
  At 390 px: 195 × 164 px, three stacked rows (`shots/update-plus-toast-390-light.png`, where a toast also
  covers "Later").
- **Remote HUD** `#remote-hud`: an icon and a word ("Next", "Start", "Next works"), shown for 1.1 s at 38 % of
  the window height, never takes a click (`js/remote.js:218-232`, style `:389-392`): Bebas, 30 px (25 px at
  390), a 2 px accent border, a pill (22 px radius at 520 px and below), two lines at most. Measured 216 × 67
  px and 182 × 57 px. `shots/hud-390-dark.png`: "→ NEXT WORKS" over the tinted "Next" row of Settings.
- **"Progress was not saved"** (`js/xp.js:78`): an `<aside class="card">` fixed 12 px above the bottom with an
  inline style and `z-index: 9999`, a sentence and two `.btn`. Forced picture
  `shots/unsaved-forced-390-light.png`: it covers the bottom tab bar (box bottom at 832 px, tab bar from 780).

Tests: `#app-toast` is read by 12 suites through a helper that returns its text when not `hidden` (`gear`,
`midihub`, `remote`, `remote-gear`, `remote-keys`, `remote-plan`, `remote-quiz`, `remote-runners`,
`remote-shed`, `storage-import`, `synthconn`, `trim`; e.g. `tests/remote.test.js:44-46`); `midihub` checks the
one-message-at-a-time rule (`tests/midihub.test.js:124-133`); `#mh-toast` by `midihub`, `synthconn`,
`synthdeck`; `#hx-toast` by `helix` (`:113`); `#xp-toast` by `practice` (`:48`); `#remote-hud` by the seven
remote suites (class `show`, the `<span>`, its role, and that a long label fits its box:
`tests/remote.test.js:118`, `:201`, `tests/remote-quiz.test.js:445`); `#app-update` by `update` (the `<span>`
text and the `.primary` button's word, `tests/update.test.js:19`); `#snd-hint` by `quiz` (`:389-396`) and
`audioin` (`:565-569`); `#back-hint` by `practice` (`:123`) and `gear` (`:674`). All of these read ids, text
and the `hidden` attribute; none reads a position or a colour.

### 6.4 The layer order today

50 top bar (`css/style.css:179`), Hub and Helix toasts · 60 key dropdown (`:388`), phone tab bar (`:918`),
Deck sheet, Live picker · 200 maximised neck · 300 update banner (`:893`) · 400 toasts and hints (`:873`) ·
420 sheets (`:305`) · 450 remote HUD, Woodshed flash · 500 help tour · 600 Jam drag ghost · 9999 unsaved box.
The tokens define three: bar 20, sheet 40, toast 60 (`css/tokens.css:104-106`).

## 7. Dialogs and confirmations

- **Native boxes, 13 calls, all but one in Gear.** `window.confirm`: `js/helix.js:519` (save into a preset),
  `:525` (load a preset), `:905` (safe mode off), `js/synthlive.js:254` (delete a profile), `:259` (delete a
  set), `js/trainer.js:121` (delete the session log; soundLAB, Plan page). `window.prompt`: `js/helix.js:512`,
  `js/synthlive.js:251`, `:252`, `:253`, `:256`, `:258`, `js/synthtab.js:511`. The claude.ai viewer refuses
  these (`CLAUDE.md` "claude.ai Artifact"; the comment at `js/settings.js:906-907`). Suites answer them by
  stubbing (`tests/synthtab.test.js:199`, `:256`, `tests/gear.test.js:364`) or accepting
  (`tests/helix.test.js:66`). No `alert()` anywhere. No `<dialog>` element anywhere.
- **Two taps instead of a box, three implementations**: Settings' Copy again (`js/settings.js:906-934`, 3 s,
  the button turns primary), the Charts page's Delete (`js/chordchart.js:409-412`, 4 s, the word changes), the
  Deck's destructive buttons (`js/synthdeck.js:999-1004`, 4 s, the button turns red through a GLOBAL rule
  `.btn.armed`, `js/synthdeck.js:1726`).
- **In-page modal layers**: the two sheets (section 4), the tour (section 5), Gear's `.st-sheet` (a second
  sheet implementation: bottom sheet below 700 px, centred box above, its own "×" character as close button,
  `js/synthtab.js:147-148`, `:550-553`; `shots/gear-stsheet-390-dark.png`) and `.st-lvpick`
  (`js/synthlive.js:222`, `:319-320`).

## 8. Empty, loading and error states

There is no component for any of the three today.

- **Error card.** One class, `.error` (`css/style.css:822-829`: a red-tinted box with a red hairline, the
  card's radius, red text). Used for: a module that did not load, "Module "tuner" failed to load (script
  error?). Check the console." (`js/app.js:1815`); a module that threw in `init` (`:1822`, `:1190`); the
  metronome's audio error (`js/metronome.js:155`); the Fretboard (`js/fretboard.js:253`, `:264`, `:1614`); the
  Tuner (`js/tuner.js:152`); the Helix page (`js/helix.js:552`). The practice-progress view has its own
  `.pgu-error` with `role="alert"` (`js/practice-progress-ui.js:66`). `shots/error-module-1200-dark.png`: the
  Train tab and the "Tuner" pill are shown as usual; under them one red-outlined line, 1,114 × 51 px, and the
  footer directly below. `shots/error-module-390-light.png`: the same on two lines (366 × 72 px). The words
  speak to a developer ("Check the console"). Three suites look for `.panel .error` with the words "failed to
  load" or "crashed during init" and expect none (`tests/smoke.test.js:88`, `tests/trim.test.js:181`,
  `tests/storage-import.test.js:178`).
- **Inline warnings** with their own colours: `.set-ain-warn` (`js/settings.js:36`), `.lc-warn`
  (`js/lights.js:194`), `.mh-warn` / `.mh-err` (`js/midihub.js:1211`, `:1231`), `.hx-st.bad` (`js/helix.js:1049`).
- **Empty states** are single grey sentences, `class="muted small"` on a `<div>`, `<p>`, `<span>` or `<li>`,
  several dozen (a search for strings that start with "No " or "Nothing " finds about 80 lines in `js/`;
  not all of them are empty states): e.g. "Nothing saved yet — parse a song and hit Save."
  (`js/songs.js:238`), "No sessions logged yet." (`js/trainer.js:139`), "No lessons yet…" (`js/quiz.js:2077`),
  "No rules yet…" (`js/midihub.js:1112`), "No presets yet — save one on the Deck." (`js/synthlive.js:242`).
  Only three have a class of their own: `.pgu-empty` (`js/practice-progress-ui.js:81`), `.qz-empty`
  (`js/quiz.js:2227`), `#sdk-empty` (`js/synthdeck.js:1137`). None has an icon or a button.
- **Loading states** are words in a status line: "Loading band samples… 40%" (`js/jam.js:290`), "Checking…"
  (`js/settings.js:604`), "Looking for Bluetooth MIDI keyboards…" (`js/settings.js:811`, `js/lights.js:161`),
  "Opening the selected audio input…" (`js/practice-input.js:109`), "Reading the edit buffer…"
  (`js/helix.js:700`), "Loading <name>… 3/8" (`js/synthdeck.js:1536`). No spinner, skeleton or progress bar
  exists (searched). The app itself has no start-up state: `App.boot()` builds every page before the first
  paint (`index.html:143`, `js/app.js:1810-1824`).
- **Status lines** next to a button are `<span class="muted small" role="status">` (three in Settings:
  `js/settings.js:122`, `:137`, `:190`; seven more message lines there have no role, e.g. `:155`, `:204`,
  `:214`, `:222`).

## 9. Print

One print rule exists, in the Charts page's style block (`js/chordchart.js:525-529`): hide everything
(`body * {visibility: hidden !important}`), show `#cc-sheet`, two columns, white cards, a black title
`.cc-ptitle`, colours kept. The "Print" button calls `window.print()` (`js/chordchart.js:389`, `:435`).

- Because that block is injected at start whatever page is open (`js/chordchart.js:339`), **printing any other
  page gives a blank sheet**: measured in print emulation on Settings, the top bar and the cards compute
  `visibility: hidden` (`work/facts-extra.json`, `print-settings-*`).
- What I see in a real print-to-PDF of a chart (`shots/chart-print-dark.pdf`, page 1 rendered to
  `shots/crops/chart-print-dark-pdf-1.png`): white paper, "MY FIRST CHART" in black caps, eight keyboards in
  two columns with the dot I placed. Empty name fields print the grey placeholder "Chord name" (the rule
  `.cc-name:placeholder-shown {color: transparent}` does not reach the placeholder, which has its own colour at
  `js/chordchart.js:511`), and the selected keyboard keeps a faint outline (`.cc-card.sel`, `:508`, is more
  specific than the print rule). The dark and the light theme print the same (the PDFs are 103,456 and 103,461
  bytes).
- The print colours are raw values (`#fff`, `#000`, `#c0262d`, `#333`), not tokens.
- No suite checks printing (`tests/chordchart.test.js` has no print line; searched).

## 10. Today's parts against the Phase B component list

`docs/DESIGN-SYSTEM.md:42-47` lists: buttons (primary pill, ghost, icon), chips / status dots, switch, select
chip, stepper, help-level dots, key bar, header, footer line, card, row, sheet, toast, empty / loading / error
states, instrument heroes.

| Used by the overlays today | Where | In the list? |
|---|---|---|
| Button, three sizes and three kinds | `css/style.css:579-629` | yes (primary, ghost, icon); `danger`, `big` and "armed" are not named |
| Card with caps title and dot | `css/style.css:481-518` | yes |
| Sheet | `css/style.css:302-338` | yes, but "side on wide" is new |
| Toast | `css/style.css:868-886` | yes; five implementations to fold into it |
| Error / empty / loading | section 8 | yes; nothing to reuse today except `.error` |
| Chip (status) | `.set-chip` `js/settings.js:40-42`, `.chip` `css/style.css:776-797` | yes |
| Tempo −5 −1 +1 +5 | `js/metronome.js:126-135` | yes (stepper), but the mockup's stepper is − / + only (`docs/design/home-mockup.html:128`) |
| Help level, five buttons | `js/lights.js:79-81` | yes, as dots (the mockup shows four dots for five levels, `:132`) |
| Checkbox with a note | `.set-check` `js/settings.js:22-25`, `.met-check` `js/metronome.js:110` | as "switch" only if these become switches |
| **Segmented control** | `css/style.css:743-773`; 7 in Settings, up to 5 in Lights | **no** |
| **Slider** | `css/style.css:700-740`; Settings 2, Metronome 2, Lights 1 | **no** |
| **Labelled select / number / text field** | `css/style.css:633-692`; Settings 4, Metronome 8 | **no** (the "select chip" is the key bar's) |
| **Disclosure** | `details.tips` `css/style.css:531-557`, `.met-more` `js/metronome.js:111-114` | **no** |
| **Big number** | `.big-display` `css/style.css:559-567` | **no** (a token exists: `--sl-display-md`, `css/tokens.css:67`) |
| **Level meter** | `.set-meter` `js/settings.js:28-34` | **no** |
| **Colour dots / swatches** | `.set-acc`, `.lc-deg` | **no** |
| **Tour card and ring** | `js/help.js:253-264` | **no** |
| **Banner with actions** | `css/style.css:888-905` | **no** |
| **HUD** | `js/remote.js:389-392` | **no** |
| **Two-tap confirm** | section 7 | **no** |
| **List row with two buttons** | `.rm-row` `js/remote.js:394-397` | perhaps "Row (plan block with check state)" |

The old variables these parts use, and so what a token mapping must cover: Settings `--label`, `--muted`,
`--text`, `--card`, `--inset`, `--ctl-border`, `--accent-dim`, `--accent`, `--red`, `--accent-soft`,
`--accent-line` (`js/settings.js:12-45`); Metronome 12 names, Lights 4, Help 4, Remote 9 (counted in
`work/facts-gear.json`). `--accent-dim`, `--inset`, `--label` and `--ctl-border` have no token of the same
meaning in `css/tokens.css`.

## 11. Which suites would notice a change

A re-skin that keeps ids, classes named in section 3.4 to 6, texts and the `hidden` attribute passes all of
them. These are the checks that look at shape or position:

| Check | Where |
|---|---|
| The corner tools are in the order help, settings, clef, lights, metronome | `tests/nav.test.js:94` |
| Phone: logo and corner icons in one row, metronome icon within 20 px of the right edge | `tests/nav.test.js:132-136` |
| Phone: the sheet's card ends at the window's bottom and is 390 px wide | `tests/nav.test.js:150-151` |
| Wide: a click at x = 15, y = 790 is outside the sheet's card (a side sheet must dock right, or this line changes) | `tests/nav.test.js:71-72` |
| Focus lands on `[data-sheet-close]` when a sheet opens | `tests/nav.test.js:61-64` |
| The HUD's label fits its box | `tests/remote-quiz.test.js:445`, `tests/remote.test.js:201` |
| The clef has the same box as `#lights-btn` | `tests/context-global.test.js:23`, `tests/gear.test.js:482` |
| Controls of the key dropdown are at least 44 px high (buttons also 44 px wide) | `tests/context-global.test.js:34`, `tests/gear.test.js:493` |
| The shell markup of both HTML files is the same text | `tests/assets.test.js:158-185` |

Texts that suites read and Phase B is likely to reword because they name the clef or today's tabs:
`js/help.js:224-225`, `:245-246` (not read by a suite as far as I found), the tour steps read by
`tests/remote-quiz.test.js:65-66` and `tests/remote-keys.test.js:430`, the welcome title
(`tests/gear.test.js:797`), "Press Back again to leave" (`tests/practice.test.js:123`).

## 12. The Gear side

### 12.1 How much style each Gear module brings

Measured in the loaded page (`work/facts-gear.json`): `gear.html` links `css/tokens.css` and `css/style.css`
(`gear.html:15-16`; 171 top-level rules in `style.css`) and its scripts inject ten style elements at start,
38,242 characters, 526 rules.

| Module | Style block | Characters | Rules | Rules whose selector names a shared class | Raw colours |
|---|---|---|---|---|---|
| Helix | `js/helix.js:1047-1079` | 8,634 | 112 | 0 | 8 |
| Deck engine (`synthdeck`) | `js/synthdeck.js:1678-1730` | 8,176 | 109 | 7 | 3 |
| Deck face (`synthtab`) | `js/synthtab.js:522-560` | 6,216 | 83 | 2 | 4 |
| Hub | `js/midihub.js:1208-1254` | 5,337 | 80 | 4 | 6 |
| Live sets | `js/synthlive.js:310-328` | 2,997 | 44 | 5 | 5 |
| Scope | `js/synthdeck-scope.js:485-501` | injected only when the Scope tab is opened; not measured | | | |
| Score player (also in soundLAB) | `js/scoreplayer.js:610-619` | 769 | 17 | 3 | 0 |
| Shell parts: remote, metronome, lights, help | sections 3 to 5 | 6,113 | 81 | 5 | 5 |

For comparison soundLAB injects 22 blocks, 71,988 characters, 997 rules.

Three Gear rules are written directly on a shared class instead of under the page's own prefix:
`.btn.sdk-big`, `.seg.sdk-tabs` and `.btn.armed` (`js/synthdeck.js:1683`, `:1692`, `:1726`); the last one
restyles any button with the class `armed`. soundLAB has one of the same kind: `.chip.on`
(`js/chordchart.js:504`).

Every Gear block is written with the old variables: `--accent` 21 times in Helix alone, then `--line`,
`--card2`, `--text`, `--muted`, `--accent-soft`, `--accent-ink`, `--accent-line`, `--green`, `--red`,
`--font-display`, `--font-condensed`, `--ctl-border`, `--h-ctl` (`work/facts-gear.json`, `vars`). No Gear block
uses a token. The Deck face and the Live page use `var(--card-2, rgba(255,255,255,.04))` four times
(`js/synthtab.js:538`, `:542`, `:548`, `js/synthlive.js:316`); `--card-2` is not defined anywhere (the
stylesheet's name is `--card2`, `css/style.css:47`), so the white 4 % fallback is what shows: in the light theme
the strips, slots and scene buttons have no visible fill (`shots/gear-deck-390-light.png`).

One Gear rule reaches into the shell: Go live hides `.topbar`, `#tabbar-m` and `.foot`
(`js/synthlive.js:328`; checked by `tests/synthtab.test.js:231-236`). A shell built with other class names must
keep those three or change this rule.

### 12.2 How much the Gear pages use the shared classes

Counted in the page at 1200 px with a MODX and a LUMI connected, elements on screen
(`work/facts-gear.json`, `pages`):

| Page / view | `.card` | `.btn` | of them `.sm` | `.seg` | `.chip` | `.row` | `label.field` | `select` | sliders | number / text inputs | buttons with no shared class |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Deck | 2 | 5 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 8 |
| Live sets | 1 | 5 | 4 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| Hub › Deck | 4 | 13 | 7 | 4 | 0 | 8 | 4 | 4 | 0 | 0 | 17 |
| Hub › Player | 2 | 5 | 3 | 3 | 0 | 11 | 9 | 10 | 2 | 0 | 0 |
| Hub › Keys | 3 | 9 | 9 | 2 | 1 | 7 | 8 | 4 | 4 | 3 | 0 |
| Hub › CCs | 4 | 25 | 25 | 2 | 0 | 7 | 5 | 4 | 12 | 2 | 0 |
| Hub › Rules | 3 | 9 | 9 | 2 | 0 | 7 | 6 | 6 | 0 | 0 | 0 |
| Hub › SysEx | 5 | 6 | 6 | 2 | 0 | 7 | 4 | 4 | 0 | 0 | 0 |
| Hub › Monitor | 2 | 4 | 4 | 2 | 0 | 5 | 4 | 4 | 0 | 0 | 0 |
| Hub › Learn | 2 | 5 | 5 | 2 | 0 | 5 | 5 | 5 | 0 | 0 | 0 |
| Helix › Rig | 9 | 16 | 9 | 2 | 30 | 7 | 0 | 3 | 2 | 7 | 8 |
| Helix › Blocks | 3 | 5 | 5 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| Helix › Presets | 2 | 4 | 4 | 1 | 3 | 1 | 0 | 0 | 0 | 2 | 0 |
| Helix › Looper & Song | 3 | 27 | 6 | 1 | 1 | 1 | 0 | 0 | 0 | 4 | 0 |
| Helix › Mixer | 2 | 4 | 4 | 2 | 1 | 1 | 0 | 0 | 38 | 1 | 38 |
| Helix › Monitor | 3 | 9 | 9 | 1 | 4 | 4 | 0 | 0 | 0 | 4 | 0 |

In the source the same picture: `class="…btn…"` 43 times in `js/midihub.js`, 55 in `js/helix.js`, 36 in
`js/synthdeck.js`, 31 in `js/synthlive.js`, 12 in `js/synthtab.js`; `.card` 15, 17, 6, 5, 3. Across all of
`js/` the shared classes are written roughly 1,500 times (a count by text pattern, so approximate: `.btn`
384, `.muted` 287, `.small` 280, `.row` 168, `.card` 114, `.field` 109, `.primary` 75, `.seg` 58, `.chip` 32);
the suites select by them 24 times in all (`.card` 6, `.muted` 5, `.btn` 4, `.error` 4, `.seg` 2, `.chip` 1,
`.field` 1, `.primary` 1).

The Deck and Live pages were built to touch sizes with their own heights (40 to 60 px: `js/synthtab.js:524-526`,
`:535`, `js/synthlive.js:311-314`, `:326`); the Hub and Helix use the shared 34 / 38 px (measured `btnH` in
`work/facts-exp.json`).

### 12.3 What the pages look like now

`shots/gear-<page>[-<view>]-<width>-<theme>.png`, 40 pictures. Looked at: `gear-deck-1200-dark`,
`gear-deck-390-light`, `gear-liveset-1200-dark`, `gear-midihub-control-1200-dark`, `gear-helix-rig-1200-light`,
`gear-stsheet-390-dark`. Deck: a "?" square and a Perform | Edit switch, a card with the sound's name in 32 px
condensed type and three wide buttons, a card of five "strips" (flat horizontal sliders), two round chips,
eight scene tiles. Live: a row of small buttons and one card with a title, a sentence and "New set"; the
"Import" button (a `<label>`) sits slightly higher than its neighbours (seen, not measured). Hub: a status card with four selects,
an eight-way view switch, then cards of square channel buttons and knob tiles. Helix: nine cards in the Rig
view; 30 chips as footswitch buttons; the six-way and seven-way switches wrap to two rows on a phone. No Gear
page scrolls sideways at 390 px (measured for all 16 states).

### 12.4 The experiment: what a change to each shared class does to the four pages

Method: with the page loaded, one extra style element, added last, holding one variant at a time
(`work/experiment.js`, `work/exp-variants.css`). Measured for all 16 page states, at 1200 and 390 (touch), dark
and light: the panel's height, sideways scroll, button or select labels wider than their box, neighbouring
controls that overlap. Light and dark gave the same numbers.

| Variant | What it changes | Growth of the panel, 1200 px | Growth, 390 px | Seen |
|---|---|---|---|---|
| old variables point at tokens | colour and nothing else | 0 px everywhere | 0 px everywhere | slightly darker ground and cards; light theme: whiter cards, a deeper amber (`shots/exp-all-…-light.png`) |
| `--h-ctl` = 44 px (48 on touch) | every `.btn.sm`, `.chip`, `.seg`, `select`, `input`, and the header icons | Deck 0, Live 0, Hub +40 to +100, Helix +50 to +147 | Deck +6, Live 0, Hub +70 to +250, Helix +49 to +234 | taller rows on the Hub and Helix; Deck and Live barely move (their controls are already 44 to 48); **the header wraps to two rows at 390 px** |
| pill radius on `.btn`, `.seg`, `select`, inputs | shape only | 0 | 0 | every shared button and field is a pill; **a segmented control that wraps (Hub views, Helix views, Helix footswitch modes on a phone) becomes one large rounded blob** (`shots/crops/cmp-hub-control-390-light-top.png`, middle; `shots/crops/cmp-helix-rig-390-light-foot.png`) |
| `.card`: 12 px radius, 24 px padding, no shadow, no title dot, larger title | every card | +16 to +188 (Helix Rig, 9 cards) | +7 to +123 | more air; long card titles ("Stomps (Bypass/Control CCs, Channel 2)") wrap to two lines at 390 |
| `.btn`: no fill, condensed caps, wider padding | every shared button | 0, except Hub CCs +27, Helix Looper +46 | Deck +10, Helix Rig +49, Looper +93, Monitor +46 | two-word labels wrap ("SAVE PRESET", `shots/crops/cmp-deck-390-light.png`); button rows wrap one button earlier |
| `.chip` and `.seg` as 44 px hairline controls | chips and switches | 0 to +64 | 0 to +187 (Helix Rig: 30 chips) | the Helix button field grows by a third |
| `.row`, `.grid2`, `label.field` on the 4 px grid | gaps and field labels | 0 to +15 | 0 to +129 | toolbars wrap one control earlier on phones |
| all of the above | | +16 to +335 | +7 to +565 | below |

In no variant, on no page, at either width, in either theme: sideways scroll, a label wider than its button,
an element past the right edge, or overlapping controls (0 of 512 measured states: 16 page states × 8
variants × 2 widths × 2 themes). So the three Gear suites that assert "no sideways scroll at phone width"
(`tests/gear.test.js:449`, `tests/synthdeck.test.js:739`, `tests/synthtab.test.js:312`) and the "no button
under 40 px" checks (`tests/synthtab.test.js:307`, `:323`) would not trip on changes of this kind.

What "all" looks like (`shots/exp-all-gear-midihub-control-1200-dark.png`, `shots/crops/cmp-*.png`): a **mixed
page**. The shared parts take the new look (pill buttons in caps, pill selects, flat cards), while everything
the Gear modules draw themselves keeps the old one: the Hub's square channel buttons and knob tiles
(`js/midihub.js:1239-1243`), the Deck's strips, slots and scene tiles (`js/synthtab.js:538-548`), the Helix
snapshot and knob tiles (`js/helix.js:1061-1062`). 526 Gear rules stay as they are; about 60 shared rules
change under them.

### 12.5 Three ways to treat Gear until Phase H, with their cost

**A. Gear follows the shared classes now.** No extra mechanism. Cost: every Phase B pull request that touches a
shared class changes 16 Gear page states; each needs a look at both widths and both themes (64 pictures); the
pages get the mixed look of 12.4 for the whole time between B and H and are redesigned again in H; the phone
header rule of finding 5 has to be solved for Gear as well; 12 suites on `gear.html` must stay green (they
check behaviour, so mostly they will).

**B. Gear is frozen on a copy of today's stylesheet.** `gear.html` links a copy of `css/style.css` (997 lines,
32,307 bytes) and soundLAB the new one. Cost: `tests/assets.test.js:158-164` compares the two `<head>`s and
allows only soundLAB-only stylesheets (`:42-43`), so the suite's rule changes; `sw.js` ASSETS gains a file; and
the copy also freezes the SHELL rules (header, tab bars, sheets, toasts: `css/style.css:161-477`, `:868-993`),
while the shell markup and the sheet, tour, toast and metronome modules are one code path for both apps
(finding 2, `CLAUDE.md:1527-1531`). Either Gear keeps an old shell beside soundLAB's new one (two shells to
build and test: the opposite of "the shell built once from JavaScript", `CLAUDE.md:1717`), or the copy is cut
down to the component part (`css/style.css:479-836`, 358 lines) and loaded on top of the new file, which is
option C done with a second file. Two definitions of `.btn` live in the repository until H and drift apart.

**C. One stylesheet; Gear's page panels are frozen by a scope; the shell and the overlays follow in both
apps. Recommended.** The rule in one sentence: *a new rule for a shared class never applies inside Gear's
`<main>`, and never has a higher specificity than the rule it replaces.*

- How: today's shared rules (`css/style.css:479-836`) stay as they are. Each new rule is written as
  `:where(:root:not([data-app="gear"]), .topbar, .tabbar-bottom, .sheet, #hp-ov, #app-update) .btn { … }`.
  `gear.html` carries `data-app="gear"` on `<html>` (`gear.html:2`) and the stylesheet already keys on it
  (`css/style.css:970`). `:where()` adds no specificity, so a new `.btn` rule has exactly the weight of the old
  one and the module rules that adjust shared classes (39 in soundLAB, 26 in Gear, counted in
  `work/facts-gear.json`) keep winning by order as they do today. For that the new rules must be in a linked
  stylesheet: injected blocks are appended to `<head>` after the links (`js/app.js:802-808`).
- New values of old variables are set on the same list of containers instead of `:root`, so `--h-ctl`, `--card`
  and the rest keep today's values inside Gear's pages.
- New components that have no old class (switch, stepper, select chip, help dots, key bar, footer line, hero)
  get new class names and need no scope. No class in the tree starts with `sl-` today (searched `js/`, `css/`,
  both HTML files).
- **Proof on today's tree** (`work/poc.js`, `work/poc2.js`, `work/poc-scoped.css`): the "all" variant of 12.4,
  rewritten with that prefix, added to Gear. In 64 states (16 page states × 2 widths × 2 themes), of 88,024
  elements inside the active panel, **0 have a changed computed property and 0 of the 7,400 on screen have a
  moved or resized box** relative to the panel. At the same time the header link and the metronome sheet's
  buttons take the pill rules (`shots/poc-gear-hub-metsheet-1200-dark.png`: pill "SOUNDLAB", pill −5 −1 +1 +5
  and TAP, over a Hub page with its square buttons). A pixel comparison of panel screenshots is NOT a usable
  check: 9 to 727 pixels differed per state, all on anti-aliased corners, because the taller header moves the
  panel (`work/facts-poc.json`); compare computed styles instead.
- What Gear looks like between B and H: the new header, tab bars, sheets, tour and toast around pages that look
  exactly as today.
- Cost: (1) the prefix on every new shared-class rule, removed in Phase H by search and replace; (2) the old
  shared rules and old variables stay in the stylesheet until H (358 lines, about a third of the file); (3)
  because the old rule still applies in soundLAB, each new rule must also undo what the old one sets and the
  new look does not want (the title dot `css/style.css:500-509`, the shadow `:591`, the select's amber chevron
  `:677`); (4) Gear's overlays that live inside its panels stay old: `.st-sheet`, `.st-lvpick`, `#mh-toast`,
  `#hx-toast` (section 2), so Gear has two sheet looks until H; (5) a browser floor of `:where()` (Chrome 88,
  Firefox 78, Safari 14), which is below what the stylesheet already needs for `color-mix()`
  (`css/style.css:60`); (6) one new check: a suite that compares the computed styles of the four Gear panels
  with and without the new stylesheet, so "frozen" is tested, not promised.

Renaming the classes instead (new `sl-btn` beside old `btn`) would also freeze Gear, but it means editing
the class attributes of every soundLAB module (12.2 counts roughly 1,500 uses in all of `js/`, Gear's
included; soundLAB's share was not counted separately); C edits none.

### 12.6 What stays to do in Gear whichever way is chosen

- Old variables stay defined in both apps (finding 10; `js/synthdeck-scope.js:65-71` is checked in both themes
  by `tests/synthdeck-scope.test.js:241-256`).
- `html.st-live` hides `.topbar`, `#tabbar-m`, `.foot` (`js/synthlive.js:328`).
- The Hub's toast hides `#app-toast` by id (`js/midihub.js:182`).
- The tour targets of the four Gear pages (`js/help.js:94-119`).
- The texts in Gear that say "Settings › MIDI" (`js/lights.js:62`, `:94`) lead to soundLAB.

## 13. Pictures (all in `shots/`)

Naming: `<what>-<width>-<theme>.png`, widths 1200 and 390, themes dark and light.

| Family | Files |
|---|---|
| Mockup | `mock-e-1200`, `mock-e-390`, `mock-f-1200`, `mock-f-390` |
| Settings | `set-midi-*` (4, whole page, LUMI + MODX), `set-nomidi-*` (4), `set-card0…7-1200-dark`, `set-card0…7-390-light` (one per card, disclosures open), `set-remote-learn-*` (4), `set-copyagain-armed-*` (2), `set-focus-*` (2), `set-accent-teal-*` (2) |
| Metronome | `met-*` (4), `met-open-*`, `met-open-end-*` (4 each), `met-err-forced-*` (4, forced) |
| Lights & help | `lights-lumi-*`, `lights-lumi-mid-*`, `lights-lumi-end-*`, `lights-nomidi-*` (4 each) |
| Help | `help-first-*`, `help-ring-*`, `help-welcome-*`, `help-in-sheet-*` (4 each), `hud-under-help-*` (2) |
| Toasts and boxes | `toast-short-*`, `toast-long-*`, `toast-plus-xp-*` (4 each), `toast-under-sheet-*` (2), `hud-*` (4), `update-*`, `update-plus-toast-*` (4 each), `sndhint-*` (4), `backhint-*` (4), `unsaved-forced-*` (2, forced) |
| Errors | `error-module-*` (4) |
| Print | `chart-screen-1200-*`, `chart-print-1200-*`, `settings-print-1200-*` (2 each), `chart-print-dark.pdf`, `chart-print-light.pdf`, `crops/chart-print-dark-pdf-1.png` |
| Gear as it is | `gear-deck-*`, `gear-liveset-*`, `gear-midihub-control-*`, `-play-*`, `-controls-*`, `-rules-*`, `-monitor-*`, `gear-helix-rig-*`, `-looper-*`, `-mixer-*` (4 each), `gear-stsheet-*`, `gear-mhtoast-plus-apptoast-*`, `gear-lights-*`, `gear-met-*`, `gear-help-*` (4 each) |
| Experiment | `exp-all-gear-<page>-*` (6 pages × 4), `exp-pill-…`, `exp-height-…`, `exp-btn-…` (3 pages × 2 each), pairs in `crops/cmp-deck-390-light.png`, `crops/cmp-hub-control-390-light-top.png` (today, pill, all), `crops/cmp-helix-rig-390-light-top.png`, `-foot.png`, `crops/cmp-liveset-1200-dark.png` |
| Proof of the scope | `poc-gear-hub-*`, `poc-gear-hub-metsheet-*` (2 each) |

Numbers behind the text: `work/facts-main.json`, `facts-extra.json`, `facts-snd.json`, `facts-more.json`,
`facts-gear.json`, `facts-exp.json`, `facts-hdr.json`, `facts-poc.json`, `facts-poc2.json`.

## 14. Open questions, each with a recommended answer

1. **Is a new-look shell around old-look Gear pages acceptable between Phase B and Phase H?**
   Recommended: yes, with rule C of 12.5 (Gear's page panels frozen by a zero-specificity scope, proven on
   today's tree; shell, sheets, tour and toast change in both apps). The alternative that keeps Gear entirely
   as it is needs a second shell.
2. **Does Settings stay one long page of cards?**
   Recommended: keep it a page in Phase B (the 13 suites of section 3.4 reach it through `App.switchTo('settings')`, `#settings-btn` and its ids),
   keep every id, but group it: one screen of five rows (Look, Sound, Keyboard and lights, Hands-free, Data and
   about), each opening its section, so that "one thing on screen" holds. Do it as its own step after the
   components exist.
3. **Does the accent picker stay?** The design system says amber is the only accent.
   Recommended: remove the picker in Phase B and keep the stored value unread. If the owner wants it kept,
   `applyAccent` must set the five accent tokens and `--sl-focus` for each theme, and every accent needs its
   own contrast check.
4. **Which controls join the component list?** Segmented control, slider, labelled field (select, number,
   text), checkbox or switch, disclosure, big number, meter are used by Settings and both sheets and are not
   listed.
   Recommended: add segmented control, slider, labelled field and disclosure to the list as components; turn
   the three Settings checkboxes into the listed switch; build the meter, the swatches and the big number from
   tokens inside their modules.
5. **How high are controls inside sheets and Settings: 44 / 48 px everywhere?**
   Recommended: yes for anything tapped (buttons, switch, segmented control, fields), through a new
   `--sl-control-h`-based rule; leave `--h-ctl` at 34 / 38 as the old value so Gear's pages and the phone header
   do not move by accident, and size the header icons separately.
6. **One toast or five?**
   Recommended: one component, used by all: full width minus the gutters on phones, at most 460 px on wide
   screens, a queue of one (a new message replaces the old), kinds "note" and "problem", an optional action
   button. Fold `#xp-toast`, `#back-hint` and the Woodshed flash into it in Phase B; the Hub and Helix toasts
   in Phase H. Keep the id `#app-toast` and the `hidden` attribute (12 suites).
7. **Layer order: is a toast above a sheet, as the tokens say?**
   Recommended: yes. Order: page, bars, sheet, tour, toast and HUD on top; define each as a token (the three
   existing ones are not enough for the ten values in use).
8. **Sheets on wide screens: side sheet, as the design system says, or today's centred box?**
   Recommended: a right-hand side sheet for Lights & help (it is long: 1,001 px of content) and for the key
   bar's pickers; keep the metronome a centred box, or dock it right as well, but decide once. Either keeps
   `tests/nav.test.js:71-72` green only if the sheet does not cover x = 15.
9. **Do the tour and the welcome stay?** The mockup has no question mark.
   Recommended: keep both (53 suites know `help.seen`); give the layer `role="dialog"`, move focus to the
   card, keep the page behind out of the Tab order; reword the steps that name the clef once the key bar
   exists. A tour for the Charts page is missing today.
10. **Native `confirm()` and `prompt()`:** replace in Phase B?
    Recommended: only `js/trainer.js:121` (the one in soundLAB), with the two-tap button made into one
    component; the twelve in Gear wait for Phase H.
11. **Printing a page other than a chart gives a blank sheet. Fix in Phase B?**
    Recommended: yes, cheaply: apply the "hide everything" rule only while the Charts page is the active panel
    (`#panel-chart.active`), and give the print colours token names. Not a design task.
12. **Error, empty and loading states: how far in Phase B?**
    Recommended: build the three components and use them in the shell and the pages each step re-skins; reword
    "Module … failed to load (script error?). Check the console." for a player, keeping the words "failed to
    load" that three suites search for.

## 15. Files this job wrote

- This report: `scratchpad/v2/phaseB/map-overlays.md`
- Pictures: `scratchpad/v2/phaseB/shots/overlays/` (240 PNG, 2 PDF, `crops/`)
- Scripts and numbers: `scratchpad/v2/phaseB/work-overlays/`
  (`lib.js`, `mock.js`, `shots-main.js`, `shots-extra.js`, `snd.js`, `more.js`, `gear.js`, `experiment.js`,
  `hdr.js`, `poc.js`, `poc2.js`, `ptr3.js`, `ptr4.js`, `exp-variants.css`, `poc-scoped.css`, `facts-*.json`)

Nothing was written anywhere else. The private server on port 5415 is stopped.
