# soundLAB 2.0 — Phase B ("Design system + shell") implementation plan, with Phase B0

Written 2026-11-14 against the worktree `scratchpad/wt/a4`, branch `claude/verify-project-files-4bchk6-v2-a4`,
commit `a914df2` ("2.0 Phase A4: review fixes" = `v2` plus all five Phase A steps). Revised the same day after two
critiques; the last section, "Changes after critique", lists what was done with each of their 51 issues.
**Where Phase A stands:** none of its five pull requests is merged. `origin/v2` as the worktree last fetched it
is `f278585`; the A4 branch is 27 commits and 126 files ahead of it (`git rev-list --count origin/v2..HEAD`,
`git diff --shortstat`), and `docs/ROADMAP-2.0.md:76-80` lists #99-#101 as "ready to merge" and #102-#103 as
draft. The planner did not fetch from GitHub.
Scope source: `docs/ROADMAP-2.0.md:57` (Phase B: "components, key bar, new home, nav, sheets; every kept page
re-skinned; light theme"), `:58` (Phase B0: "gap list per instrument × kit item; each gap becomes a Phase C
task"), `:100-113` (rules for the build); `docs/DESIGN-SYSTEM.md` (all 70 lines); `css/tokens.css`;
`docs/design/home-mockup.html`; the "soundLAB 2.0 Phase A" section of `CLAUDE.md` (`:1260-1900`).
Model: `docs/plans/phase-a/PLAN.md`.
Inputs: the seven maps in this folder (`map-design.md`, `map-shell.md`, `map-pages-learn.md`,
`map-pages-instr.md`, `map-overlays.md`, `map-tests.md`, `map-matrix.md`) and `docs/INSTRUMENT-MATRIX.md`. Where the
maps disagreed, Appendix F says which reading won and why.

The working files and screenshots this document names (work-…/, shots/…) were scratch files of the planning
session. They are not in the repository: pictures are never committed, because both deploys publish the whole
tree.

**Every `file:line` in this plan is a line of `a914df2`.** Lines move after the first merge, so every edit also
names the function, id, selector or table it changes. Find by name once the numbers have drifted. One map
(`map-design.md`) was written two days earlier against `b18e09d`; where this plan takes a fact from it, the line
was looked up again in `a914df2`.

**What the planner did itself.** Read the binding inputs and all seven maps in full. Rendered the mockup in
headless Chromium at 1280, 1200 and 390 px and looked at the three pictures: it is one fixed 1280 × 800 picture;
at 1200 px the gear icon on the right is cut off, at 390 px only the logo, the Key and Tempo pills, "A DORIAN,"
and four white keys are left (`shots/plan/mockup-e-1280.png`, `-1200.png`, `-390.png`). Served the worktree on a
private port and took 36 pictures of today's app (home, key dropdown, Piano, Settings at 360, 390, 820 and
1200 px, dark and light; Gear's home at 390 and 1200 px), opened seven of them, and stopped the server
(`shots/plan/`, script `work-plan/shots.js`). Re-read the lines this plan leans on most: both HTML files, `sw.js`,
`tests/assets.test.js:1-200`, `tests/nav.test.js`, `tests/context-global.test.js`, `tests/taps.test.js`,
`js/app.js:56-140`, `:796-870`, `:930-1524`, `:1523-2067`, `css/style.css:1-160` and its shell rules,
`js/learn-instruments.js`, the Plan's state and launch code, and the anchors of every page module
(`App.injectCSS` lines, markup and CSS ranges). Computed the contrast of every token value this plan proposes
(`work-plan/contrast.js`). Checked by script that each of the 221 `file:line` references written in full in this
plan points at an existing line of `a914df2`, and opened about ninety of them by keyword (the lines the steps
remove, move or pin a test to).

**Done for the revision.** Each of the 51 issues was checked against the worktree before it was taken up: the
lines the critics cite were opened, and their measurements were repeated in headless Chromium on a private port
(`work-plan/probe2.js`, `probe3.js`, output `work-plan/probe2.out`; the server was stopped afterwards and
`git status` of the worktree was empty before and after). Repeated and confirmed: a fresh profile has the
starter plan and its first open block is "Tune up" for Piano, Guitar, Bass and Drums; the course's next level
is `notes/nat/treble/1` ("Natural notes · Treble clef") for Piano, Guitar and Bass and `chords/cdia/theory/1`
("Chords in a key · Theory") for Drums; `App.keysLessons.start()` starts a lesson run after
`App.practicePlan.launch`; deleting the rule `.icon-btn` turns two buttons of Gear's Deck from `flex` to
`block`; `#sg-opendest` on Songs carries `hidden` and is displayed; five Learn pills fit one row at 360 px in
today's style (they end at x = 328) and wrap with 14 px side padding; today's top bar is 109 px high at 1280
and 1024 px and 93 px on phones, the bottom bar 64 px. Not confirmed: that the home would be the first to store
`pp.students` and `pp.sessions` (both keys are already stored at boot today, `probe3.js`). The mockup was
rendered again at 1200 and 390 px and looked at (`shots/plan-final/mockup-e-1200.png`, `-390.png`), and the
fidelity critic's sketch of the chrome stack at 1024 × 640 was opened
(`shots/review-fidelity/sketch-plan-stack-1024x640-2lines.png`). The two script checks of the first draft were
run again on the revised text: each of the 349 `file:line` references written in full points at an existing
line of `a914df2` (`work-plan/checkrefs.py`), and every table row has as many cells as its header
(`work-plan/checktables.py`). The lines that the revision cites for the first time were opened by keyword.

**Not done by the planner.** No suite was run for this plan (the tests map ran the complete suite on `a914df2`:
67 suites, 3,541 checks, all pass; `map-tests.md` section 0). Nothing was tried on a real phone, a real LUMI,
MODX, bass or MIDI guitar, in Safari, Firefox, the Android WebView or the claude.ai viewer. Nothing in the
worktree or in any checkout was changed. No piece of the new look exists yet, so every size this plan gives for
it (the key bar's rows, the home's hero) is arithmetic from the tokens or a critic's sketch, and B1b measures
it on the real drawings.

---

## 0. What is true when Phase B is done

| Area | soundLAB (`index.html`) | soundLAB Gear (`gear.html`) |
|---|---|---|
| Tokens | Every colour, size, radius, duration and layer a component uses is a `--sl-*` token; both themes pass the contrast list of the `tokens` suite (text 4.5:1, control boundaries and the focus ring 3:1) | the same file |
| Shell | Built once by `js/shell.js` for both apps. Header: wordmark (tap = home; the word "beta" beside it at the beta address), five tabs, instrument chip, keyboard-lights status, metronome, help, settings, the link to Gear. At 640 px and narrower: wordmark, instrument, "More", metronome | the same shell: two tabs, no instrument chip, the gear icon opens Settings in soundLAB, and one more button that opens the key bar |
| Key bar | Always on screen under the header on every page: Key · Tempo · Scale lock with its sentence · LUMI lights · Help. It stays when the header slides away on scroll. From 641 px up the lock's sentence is on screen in words; at 640 px and narrower the bar is one row of five chips, each opening a panel, and the lock's chip says "On" or "Off" | the same bar, folded behind one header button as today's dropdown is, until Phase H decides whether Gear keeps it (D14) |
| Pages | 15 pages: the new home (`home`) plus the 14 of Phase A. The five tabs and their pages do not change: Learn (Exercises, Chords, Circle, Plan) · Guitar · Keys · Play · Train. The home stands outside the tabs and is reached by the wordmark (the default; the owner picks among three drawings, gate G3) | 4 pages, unchanged |
| Home | A fresh start opens on the home: one headline (the next step), one button whose words say what it does ("Start" only when a tap starts a run), the instrument showing the scale of the key bar's key, one footer line (today's minutes against the goal, the streak, the plan's blocks). Built only from numbers that are stored today | — (Gear's home is the Deck) |
| Look of the pages | **Practice pages** (the home, Piano, Neck, Tab, Notation, Pads, an Exercises question, a Woodshed run): one headline, the instrument as the largest thing, one primary action, the rest behind folds. **Tool pages** (Exercises' start, Chords, Circle, Plan, Charts, Songs, Jam, the Woodshed library, Tuner): today's arrangement in the new look, with one headline, one primary action on the first screen and 44 px controls (48 on touch); cards stay, and making these pages shorter is Phase C and D (owner item 6). One card keeps its old rules until Phase H: the Player card on Songs, which Gear's Hub shares | the four pages look **exactly as today** (computed styles compared with the stylesheet of the day before Phase B, tested); Phase H redesigns them |
| One lighting model | One **vocabulary** (in the scale, now, next, root, pressed, right, wrong) on all eleven instrument drawings, applied in one step (B16). One **drawing code** (`js/hero.js`) only for the home and the gallery; the pages keep their own drawings until Phase C replaces them (D29) | — |
| Sheets and messages | Metronome, Keyboard lights and Instrument are sheets: a panel on the right above 900 px, a bottom sheet at 900 px and below. One message component; messages stack instead of covering each other and sit above an open sheet | Metronome and Keyboard lights sheets, the same messages |
| Settings | One page, five groups (Look · Sound · Keyboard and lights · Hands-free · Data and about), every control id kept | none (as after Phase A) |
| Light theme | Every page and every shell part passes the same checks as in dark | the shell passes; the pages are as today |
| Old look | `css/style.css` still defines the old variables and the old shared classes, for Gear's pages only. No soundLAB-only file reads an old variable or holds a raw colour outside the allow list | used by Gear's pages until Phase H |
| Tests | 67 + 4 suites: `tokens`, `look`, `hero`, `home`. No picture is compared in CI. `tools/shots.js` makes the reviewers' pictures | |
| Phase B0 | `docs/INSTRUMENT-MATRIX.md`: 56 cells, each of the 37 gap cells names its task candidates or says why it has none; 26 task candidates for Phase C; kept current by every Phase B step that changes a cell | |
| Not changed | `APP_VERSION`, `version.json`, the Android manifest, `releases/`, the storage prefix and every stored key's meaning, what any page records or sends | |

**While Phase B runs.** From B5a until B17 the beta shows the new header and key bar around pages that still
have today's layout and 34 px controls, one page changing per merge. The colours are never mixed (the bridge of
B2 switches all of soundLAB at once), and from B6 the header says "beta" at the beta address, which today looks
like the live app although it keeps its own data (`js/app.js:564`). Owner item 12.

---

## 1. Rules for every Phase B pull request

1. **Draft pull requests into `v2`; the owner merges** (`docs/ROADMAP-2.0.md:102`). Never push to `v2` or
   `main`, never force-push, never open a `v2` → `main` pull request.
2. **Stack the branches, and keep the pile low.** B0 branches from the A4 branch
   (`claude/verify-project-files-4bchk6-v2-a4`) as long as Phase A is not in `v2`, otherwise from `origin/v2`.
   Each later step branches from the step before it. Every pull request is a draft with base `v2`, names the
   earlier pull requests it contains, and carries a **compare link** between its own branch and the branch
   before it (`https://github.com/mreindl118-boop/GuitarPak/compare/<branch before>...<this branch>`), so that a
   reviewer sees that step alone, whatever is still unmerged below it. After an earlier step is merged, merge
   `v2` into the later branch (ordinary merge).
   **At most three Phase B pull requests are open at a time.** Three **stop points**, where everything before
   them must be merged before the next step is opened: (1) after B0, B1a and B1b, which may be opened on top of
   the open Phase A pull requests because none of them changes what the app shows: B2 waits until Phase A
   (#99-#103) and these three are in `v2`; (2) after B4; (3) after B9. The beta is built from `v2`, so a step
   reaches a phone or an iPad only by a merge (owner item 13).
3. **Phase B is not a release.** Do not change `APP_VERSION` (`js/app.js:138`), `version.json`,
   `android/AndroidManifest.xml` or anything in `releases/`. No APK build, no republish of the claude.ai artifact.
4. **`sw.js`: change only two things.** The number inside `CACHE` (`sw.js:8`: a step that changes a file the
   app serves takes the next number, section 3; B0 and B1b are documents and leave `sw.js` alone) and the
   `ASSETS` list (`sw.js:9-103`) for files added or removed. Install is `cache.addAll` (`sw.js:105-111`): one
   listed file that is missing stops the whole install without any sign on screen.
5. **`CLAUDE.md`: never edit lines 24-41** (the "soundLAB 2.0 (branch `v2`) — read first" paragraph), unless
   the owner lifts the freeze (owner item 19: Phase A froze it because pull request #98 rewrote it, and #98 is
   merged). Phase B facts go into a new section "soundLAB 2.0 Phase B" placed after the Phase A section and
   directly above `## Cross-module conventions` (`CLAUDE.md:1902`); other entries are edited in place. The new
   section opens with one line that says where lines 24-41 are out of date: "Beta + live share `localStorage`"
   (`:35-36`; ended with A4) and "one phase per draft PR" (`:34-35`; a phase is many).
6. **Every new component uses only `--sl-*` tokens** (`css/tokens.css:6`). No raw colour, no old variable, no
   literal duration or z-index in `css/components.css`, in a rule under `.sl-skin`, or in a module's CSS once
   that module's page is re-skinned. Note colours are data, not tokens: they reach an element as an inline
   custom property set from `App.colors` (decision D12). The `tokens` suite counts raw colours and old-variable
   uses per file and fails when a count rises.
7. **Ids, classes and state contracts that a suite or another module reads are kept**, unless the step's
   section names the element and the test lines that change with it. The contracts are: a page is shown when
   `#panel-<id>` has class `active`; a sheet is open when `#sheet-<name>` is not `hidden`; the toast is
   `#app-toast`, shown when not `hidden`, and its `textContent` is the message and nothing else; "on" is class
   `active` plus `aria-pressed`; hidden is the `hidden` attribute (`map-tests.md` 2.2). New looks come as new
   classes on the same elements.
8. **A re-skin step changes no behaviour.** The steps that change behaviour say so in their goal and carry
   their tests: B3 (a fold can remember whether it is open: one new stored key, first used in B12), B5a (the key
   bar; the accent picker goes; a message says the lock's sentence at every flip), B5b (the Help level and the
   colour switch are set in the key bar only), B6 (the wordmark is the way home, "More" on phones, "beta" at the
   beta address), B7b (messages stack and sit above a sheet; the help tour takes the focus and opens a fold that
   hides its target), B8 (instrument chip), B9 (the new home and `HOME`), B11 (Chords follows the shared tempo;
   deleting practice history asks in the page), B12 (the Help control leaves the Piano page), B13 (the neck
   obeys the Help level; its copy of the colour switch goes), B15a (the Woodshed's own flash message joins the
   app's message stack), B16 (how "now", "next" and the root look on every instrument drawing: today an amber
   ring, afterwards the vocabulary of D30). A fault that a step repairs on the way (a number printed with twelve
   decimals, a print rule that blanks other pages) is named in that step's goal as a fix. Anything else that
   would change what a tap does, what is stored or what is sent belongs to a later phase.
9. **Both apps boot after every commit, and the shell stays one.** Until B4 every edit between `<body>` and
   `<main>` is made in `index.html` and `gear.html` in the same commit (`tests/assets.test.js:170-179`). From B4
   on the shell markup exists once, in `js/shell.js`, and the `look` suite compares what the two apps show.
10. **A page is three things changed in one commit** (its id in `APPS`, its panel, its script tag), and a new
    file is in `sw.js` `ASSETS` in the same commit (`CLAUDE.md:1291-1296`). Scripts stay static `<script src>`
    tags: the release probe and `tools/artifact_build.py:37` read them from the HTML.
11. **Gear's pages do not change.** No rule added, changed or removed in Phase B may change a computed style of
    an element inside `gear.html`'s `<main>` (decision D13). The `look` suite tests it against the stylesheet of
    the day before Phase B (case L16) and against the list of selectors Phase B deleted (case L17); a step that
    fails either is not done. A rule leaves `css/style.css` only when no element inside `<main>` of either app
    matches its selector in any page state of the suite.
12. **The marker is `.sl-skin`.** A container gets the class in the step that re-skins it, and only then do the
    new looks of the shared classes apply inside it (decision D6). A page on the `RESKINNED` list of the `look`
    suite must carry the class; a page that carries it must be on the list. Whatever a module appends to
    `<body>` (the tour layer, the pedal confirmation, a drag ghost) is on the suite's `BODY_LEVEL` list and is
    inside a container that carries the class, or it keeps the old look unseen by every check.
13. **Every step is looked at.** Before the pull request is opened, `tools/shots.js` is run on the branch and on
    its base, at 360, 390, 820 and 1200 px (and 1024 × 640 from B5a on), in dark and light, for every page and
    shell state the step touches, and the agent opens the pictures. The pull request text names the pictures
    that were opened, says in a sentence each what they show, and lists every existing check that was
    rewritten, removed or added. Two traps: a Playwright `fullPage: true` screenshot switches touch emulation
    off for the rest of that page's life (measured by three maps, e.g. `map-overlays.md` section 0), so phone
    pictures use a tall viewport or element screenshots; and no picture is committed to the repository (both
    deploys publish the whole tree, `map-tests.md` 5.3).
14. **A check is replaced by its equal, never loosened.** "12 px from both edges" becomes the gutter token's
    value; "one row" stays "one row". A geometry check that has lost its meaning is deleted with a sentence
    that says why (`map-tests.md` section 7).
15. **New shell checks use real input.** Playwright `click`, `tap` and keyboard, which refuse hidden and covered
    elements, not `element.click()` inside `page.evaluate` (`map-tests.md` section 0, item 1). Existing
    synthetic clicks are not rewritten in bulk.
16. **Plain words.** User-facing text added in Phase B says what happens ("only A Dorian notes sound"), in
    sentence case, without the words *legacy*, *canonical*, *context*, *disclosure*, *module*. Text that exists:
    B1b commits a wording list (`docs/plans/phase-b/WORDING.md`: every line a page shows that uses one of these
    words or names a setting instead of what it does, with file, line, today's text and a proposal). A page step
    rewords the lines of that list that its page shows on its first screen and that no suite pins (grep `tests/`
    for the text first); the rest of the list is written into the Phase C and D rows of the roadmap in B18.
    Three lines the list will hold: `js/woodshed.js:1140` ("Legacy / unassigned … legacy streak"),
    `js/practiceplan.js:292` ("canonical observations"), `js/quiz.js:2088` ("Consistency level").
17. **Nothing of a later phase is built early.** Section 6 lists it. Section 2 says, decision by decision, what
    Phase B leaves room for.
18. **Tests.** The step's fast loop while working, then the complete run before the pull request (section 8).
    New suites go into the one list at `tests/run.sh:17`; `tests/pages-deploy.test.js:53` forbids a second CI
    command, an argument to `run.sh` or a skip variable. `taps` (276 s) runs whenever a fixed bar or the
    Exercises page changes.
19. **Gates.** Four steps wait for the owner's yes to a drawing of B1b, because they build what he has never
    seen: B5a (gate G1, the key bar), B6 (G2, the header), B9 (G3, the home) and B16 (G4, the lighting
    vocabulary and the palette). Section 9 says which picture answers which gate. B2, B3 and B4 change no layout
    and no behaviour (B2 moves soundLAB's colours to the token values) and go ahead without an answer. A yes may
    be one line in the pull request of B1b.

---

## 2. Decisions

Each row is what gets built unless the owner says otherwise. Section 9 lists every row he should see, with the
picture that answers it; four of them are gates (rule 19).

### Scope and order

| # | Decision | Reason and evidence |
|---|---|---|
| D1 | **24 pull requests in seven groups.** The matrix B0. Foundations B1a-B3 (tokens that pass; specification and drawings; colour bridge and `look`; component sheet). Shell B4-B9 (shell from JavaScript; key bar in two steps; header; sheets; messages and tour; instrument chip; home). Pages B10-B15b, one or two pages each. The lighting vocabulary B16. Settings B17. Clean-up B18. | A redesign that lands in one piece cannot be reviewed: 14 pages, two sheets and Settings at four widths in two themes are 270 pictures (`map-tests.md` section 6). Foundations first, because nothing uses a token yet (`grep -rn "var(--sl-" js css index.html gear.html` finds only `css/tokens.css`; `map-design.md` finding 1), so the tokens can still be corrected for free. Shell before pages, because every page sits in it and page code measures it (`js/quiz.js:1271-1290`, `js/keylessons.js:305`). The first draft had 17 steps; seven of them mixed a look change with a behaviour change or held four pages, and were split after the critique (fidelity issue 12): B1 into B0, B1a and B1b, B5, B7, B14 and B15 into two each, and the lighting vocabulary left the Piano step for a step of its own. |
| D2 | **Behaviour changes are kept apart from re-skins** and are in the steps that rule 8 names. | 38 of 67 suites name a shell id, class or call (`map-shell.md` section 7); a step that changes look and behaviour at once cannot tell a broken test from a wanted change. |
| D3 | **The undrawn pieces are drawn before they are built, and the owner's yes to a drawing opens the step that builds it** (B1b; rule 19). Drawn as static HTML pages that read the real `css/tokens.css`, each in dark and light: the key bar and the header at 360, 390, 640, 820, 1024 and 1280 px; the home at 390 × 844, 1024 × 640 and 1280 × 800 in the three placements of D20, with the headlines a fresh profile really gets; sheets and messages; the three instruments in every lighting state, in today's palette and in the tokens' red-first one, beside the amber Start button; a practice page; the three heaviest tool pages (Exercises' start, the Woodshed library, the Plan); a tool row at 44 and at 36 px; Gear's Deck and Hub as they are today inside the new header and key bar. Gates: G1 the key bar → B5a; G2 the header → B6; G3 the home → B9; G4 the instruments → B16. B2, B3 and B4 do not wait. | The mockup is one fixed 1280 × 800 picture of one page with no phone, tablet, light or other-page variant and no state (`docs/design/home-mockup.html:26`; `map-design.md` findings 2-3; seen by the planner at 1200 and 390 px, twice). All seven maps ask for this round. The first draft said "work does not wait for an answer"; the shell would then have been built on drawings the owner may never have opened (fidelity issue 11). The mockup's CSS becomes the first draft of `css/components.css`. |

### Tokens and CSS

| # | Decision | Reason and evidence |
|---|---|---|
| D4 | **The tokens are corrected and completed in B1a**, before any rule reads them (Appendix C has every value). Added: `--sl-accent-text`, `--sl-accent-deep`, `--sl-ink-soft`, `--sl-line-control`, `--sl-surface-sunken`, `--sl-accent-glow-color`, four judgement colours, the instrument's stage, key outline, pressed key, the neck's nut and the two inks for text on a note colour, three control heights, weight tokens, seven layer tokens. Changed in light: `--sl-accent-ink` (dark text on amber, as in dark), `--sl-ink-muted`, the four status colours. `--sl-focus` becomes an opaque two-layer ring. The seven `--sl-deg-*` take the app's default colours (D12). The touch height keys on `any-pointer: coarse` instead of `pointer: coarse` (`css/tokens.css:140`), so a laptop with a touch screen gets 48 px too. | The light tokens fail their own rule (`css/tokens.css:7`, `:109`): accent as text 3.02-3.64:1, white on amber 3.64:1, `--sl-ok` 3.64-4.39:1, `--sl-info` 4.42:1 on the raised surface, the focus ring 1.7:1 (`map-design.md` 6.1-6.4, `map-tests.md` 3.3). `--sl-accent-ink` means "text ON the accent" (`css/tokens.css:30`) while today's `--accent-ink` means "accent as TEXT" (`css/style.css:62`, `:99`), and no token exists for amber text. Five old variables have no token (`--inset`, `--label`, `--ctl-border`, `--teal`, `--accent-dim`: `map-design.md` 3.13; the last one found by the completeness critic: without it the level meter's gradient, `js/settings.js:31`, and a hover border, `js/chords.js:1034`, go flat). The proposed values were computed: every text token is at least 4.6:1 on all five surfaces, ink and amber text at least 4.6:1 on amber-tinted fills, the boundary and focus colours at least 3.1:1 (`work-plan/contrast.js`). |
| D5 | **The old variables stay defined until Phase H. In soundLAB they become names for tokens** (the "bridge", B2): one block in `css/style.css`, on `:root:not([data-app="gear"])`, sets `--bg: var(--sl-bg)` and so on (Appendix C). The bridge covers colours only; `--h-ctl` and `--radius` keep their values. Old-variable *uses* in soundLAB-only files go to zero page by page (the `tokens` suite holds the count per file as a ceiling). The definitions and the bridge are deleted in Phase H. | 29 modules inject CSS written with the old names: `var(--accent` 176 times, `var(--muted` 153, `var(--line` 109 in `js/` (`map-shell.md` 5.4), and Gear's 526 rules use nothing else (`map-overlays.md` 12.1). Three canvases read old names from the root element and fall back to dark values when a name is empty (`js/woodshed.js:863-867`, `js/performance-player.js:239`, `js/synthdeck-scope.js:65-71`), so the names must not disappear. A stand-in bridge moved no box in any Gear page state (`map-overlays.md` 12.4, first row). With the bridge the whole of soundLAB takes the token colours in one step, so the beta never shows two palettes side by side. |
| D6 | **One marker class, `.sl-skin`, switches a container to the new looks.** The shared classes keep their names (`btn`, `card`, `chip`, `seg`, `row`, `field`, `select`, …). Their new rules are written as `:where(.sl-skin) .btn { … }` in `css/components.css`. A panel gets the class in its own step; the shell parts get it in B5a-B7b; Gear's panels never get it before Phase H. One look is written with more weight on purpose: the select, as `:root .sl-skin select` and `:root[data-theme="light"] .sl-skin select`. | The shared classes are written about 1,500 times in `js/` and selected 24 times by suites (`map-overlays.md` 12.2); renaming them means editing every module. `:where()` adds no specificity, so a new rule weighs exactly as the old one and module rules keep winning by order, as today. The proof on today's tree (88,024 elements in 64 Gear states, 0 changed computed properties, `map-overlays.md` 12.5 C) was made with a list of containers, not with this marker; B3's own no-change check is the first test of the marker itself. The maps proposed a negative test ("not inside Gear's `<main>`"); this plan uses a positive marker instead, for two gains: soundLAB's pages can change one step at a time, and Gear is frozen by construction. The select is the exception because one old rule weighs two classes and an element, `:root[data-theme="light"] select` (`css/style.css:116-121`): a `:where()` rule and even `.sl-skin select` lose to it, and the old amber chevron would stay in light (completeness issue 18). |
| D7 | **One new stylesheet, `css/components.css`,** linked by both pages directly after `css/style.css` (so at equal weight it wins over the old rule and loses to a module's injected rule, `js/app.js:802-808`), listed in `sw.js` `ASSETS`. It holds the `.sl-*` components, the `:where(.sl-skin)` looks of the shared classes and, from B5a on, the shell's rules, which leave `css/style.css` as each shell part is rebuilt. At the end `css/style.css` holds fonts, the old variables, the bridge, base rules and the old shared classes, all of it for Gear's pages. | `tests/assets.test.js:158-166` allows the two heads to differ only by the title and `css/lumi-practice.css`; a stylesheet on the same line in both passes. `css/tokens.css:8` requires tokens to stay the first stylesheet. A second file for the shell would be one more `ASSETS` entry and head line for no gain. |
| D8 | **Module CSS stays in the modules** (`App.injectCSS`) and is rewritten in the page's own step: tokens only, sizes from tokens, rules that only restyle a shared class deleted. Colours outside the CSS strings move in the same step: 34 `var(--old)` strings in SVG attributes and inline styles, 71 raw literals in the ten Learn and Train files (`map-pages-learn.md` 2.2), 24 raw colours in `js/piano.js` (`map-pages-instr.md` 2.2). Canvases read colours through a new helper `App.token(name)`, which warns in the console when a token is empty. Classes that cross page borders (`.fb-chip`, `.fb-stroke`, `.fb-field`, `.jam-now`, `.sr`, `.hint`) get a definition in `css/components.css` in B3, so that a page's sheet can be rewritten without touching the pages that borrow from it. | No build step; page CSS belongs to the page; moving 72,000 characters into files adds `ASSETS` rows for nothing. Every module's sheet is loaded for all pages, so the Neck's sheet styles Piano, lessons, Pads, Jam, Woodshed and Settings (`map-pages-instr.md` 2.4). |
| D9 | **Three control heights.** Default `--sl-control-h` 44 px (48 px where a finger can be the pointer); hero `--sl-control-h-hero` 64 px for the one Start button of the home; dense `--sl-control-h-dense` 36 px, with a mouse only (it equals the default wherever `any-pointer: coarse` matches) and only for rows of a list inside a card or a fold: the Woodshed library, Piano's fold rows, Settings rows. Never in the header, the key bar, a sheet, on the home or for a page's primary action. `--h-ctl` stays 34 / 38 px for the old looks. **The dense tier needs the owner's yes** (owner item 7, with the Woodshed library drawn at 44 and at 36 px); without it the token's value becomes 44 px, which is a one-line change. | "Every control is tappable at 44 px" (`docs/DESIGN-SYSTEM.md:37`): a 36 px tier is a departure from that sentence, so it is asked, not decided (fidelity issue 9). The facts: today 715 of 953 controls are smaller than 44 px at 390 px (`map-tests.md` 3.2); at 1280 px 60 of 93 controls on Piano and 71 of 71 on the Woodshed are (the fidelity critic's measure); the Woodshed library has 67 controls (`map-pages-learn.md` 13). A row that goes from today's 34 px to 44 px is 29 % higher; how much longer a page gets was not measured. Raising `--h-ctl` itself wraps the phone header into two rows (93 → 132 px, `map-overlays.md` finding 5). |
| D10 | **Layer tokens keep today's numbers; only messages move up.** `--sl-z-bar` 50, `--sl-z-pop` 60, `--sl-z-full` 200 (a page's own full-screen mode), `--sl-z-sheet` 420, `--sl-z-tour` 500, `--sl-z-toast` 600, `--sl-z-drag` 700. | The three tokens of today (20 / 40 / 60, `css/tokens.css:104-106`) sit below every number in use: top bar 50, tab bar and Gear's own sheet 60, maximised neck 200, messages 400, sheets 420, pedal confirmation 450, tour 500 (`map-overlays.md` 6.4). A shell on 20-60 would put a message under the maximised neck until the Guitar step, and the bottom tab bar under nothing it is under today. A layer that must sit just above a token is written `calc(var(--sl-z-full) + 1)` (the two layers at 205 and 210 over the maximised neck, `js/fretboard.js:1679`, `:1698`). The one wanted change is the order the tokens already state: a message above a sheet (`css/tokens.css:105-106`; today a toast is hidden behind the bottom sheet, `shots/overlays/toast-under-sheet-390-light.png`). |
| D11 | **Amber is the only accent: the accent picker goes, as the first commit of B5a.** `applyAccent` stops writing inline `--accent` values, the row leaves Settings, a stored `app.accent` is left alone and unread, and Settings › Look says one sentence when a stored value was not amber. | "the ONLY accent; never a second hue for emphasis" (`docs/DESIGN-SYSTEM.md:31`). The picker writes `--accent`, `--accent-dim`, `--accent-glow` inline (`js/app.js:838-840`) and never a token: a component built from tokens ignores it (`map-overlays.md` finding 9), so the app would show two accents from the first token-built part on. That part is the key bar, so the picker goes with it and not earlier: B2-B4 put nothing token-built on screen, and the removal waits for the same yes as the bar (gate G1; owner item 2). Keeping it means four accents × two themes in every contrast check. No suite reads `#set-accent`, `App.setAccent` or `App.ACCENTS` (grep of `tests/`: no hit). |
| D12 | **`App.colors` stays the only source of note colours.** Components get a note's colour as an inline custom property (`--c`), as the mockup does (`docs/design/home-mockup.html:66`, `:175`) and today's chips do (`--deg-c`). The seven `--sl-deg-*` tokens are set to the app's seven default colours in B1a and a `tokens` case keeps them equal to `DEGREE_DEFAULTS`; no rule reads them (the live colours can be the user's own, and are snapped to the LUMI's table), and the file says so. The on-screen name of the default mode becomes "Degree" (the engine is unchanged). **Which palette is the default is the owner's choice at gate G4:** today's (the root is amber) stays unless he picks the tokens' red-first one, which would be the extra step B16p. | The palette is user-editable (`fb.colors`, `js/app.js:1324`, `:1359-1362`), snapped to the LUMI's 127-colour table (`js/note-palette.js:27-41`), has twelve steps and two modes (`js/app.js:1323`, `:1337`), and is pinned by four suites (`tests/colors.test.js:16-20`, `lights`, `note-palette`, `midi-ports`). The tokens are red-first, the app amber-first, and the root's colour is exactly the accent's: `DEGREE_DEFAULTS[0]` is `#ffab47` (`js/app.js:1289`), `--sl-accent` is `#ffab47` (`css/tokens.css:29`). The mockup the owner chose shows a red root and a red "now" key beside the amber Start button (`docs/design/home-mockup.html:160`). The first draft left the question for "before Phase C" although D30 and the home's check depended on it (fidelity issue 8); and it left seven tokens in the file with colours the app never shows, for a later reader to use by mistake (fidelity issue 19). The roadmap gives "degree colors default" to Phase C (`docs/ROADMAP-2.0.md:59`); in code the degree mode is already the default (`js/app.js:1323`). |

### soundLAB Gear

| # | Decision | Reason and evidence |
|---|---|---|
| D13 | **Gear gets the new shell and keeps its pages exactly.** The shell, the two sheets, the tour and the messages are one code path, so they change in both apps. Inside `gear.html`'s `<main>` no computed style changes: the bridge does not match Gear's root, no Gear panel carries `.sl-skin`, and the old shared rules stay in `css/style.css`. **The test compares with the day before Phase B**: `css/style.css` of `a914df2` is committed as `tests/fixtures/style.phase-a.css` in B2, and case L16 loads `gear.html` once as it is and once with `css/style.css` answered from that file and `css/components.css` switched off, and compares every element of the four panels in every state. Case L17 holds the list of selectors Phase B removed from `css/style.css`; none may match inside `<main>` of either app. The ground under both apps' pages becomes the stage colour in B6 (`#131114` → `#0f0d10`), set on `html` and `body`, which are outside `<main>`. | Phase H owns Gear's design (`docs/ROADMAP-2.0.md:65`; `docs/plans/phase-a/PLAN.md:29`). The first draft compared Gear's pages "with `css/components.css` switched off and on". That finds a rule that was added, never one that was removed from `css/style.css` (it is gone in both states), and four steps remove about 400 lines from that file. It already went wrong once: the shell range the draft deleted in B6 holds the shared rule `.icon-btn { display: inline-flex; … }` (`css/style.css:288`), and two buttons of Gear's Deck carry the class (`js/synthtab.js:115`, `:148`); with the rule gone both turn from `flex` to `block` (measured by the completeness critic and again by the planner, `work-plan/probe2.out`). The alternative, a copy of the old stylesheet for Gear, would also freeze the shell and so need a second shell (`map-overlays.md` 12.5 B). The other alternative, letting the bridge re-colour Gear's pages (`map-design.md` Q40), is a design change to Gear that nobody checked for contrast, and it cannot be tested as "nothing changed". A pixel comparison is not usable (anti-aliased corners move with the header); computed styles are (`map-overlays.md` 12.5 C). Until B6 Gear's ground is `#131114` (measured), so until then the browser-bar colour stays per app (B2). |
| D14 | **In Gear the key bar is folded until Phase H**: closed at the start and opened by one header button, `#cx-toggle`, which names the key ("A Dorian"); it closes as today's dropdown does (a tap outside, Escape, a page change). Open, it is the same bar. `APPS.gear` carries the flag `keybar: 'fold'`. The metronome and the Keyboard lights sheet stay, in the new look. Go live also hides the bar (`js/synthlive.js:328` gains one selector). | One shell. Whether Gear keeps a key bar is deferred to Phase H (`docs/plans/phase-a/PLAN.md:1205`), and an always-shown bar would decide it early. Its Scale lock filters what the Hub's Thru sends to the synth (`js/midihub.js:275`): a stray touch on a bar that is always on screen would drop notes during live use, which today's dropdown cannot do (fidelity issue 10). B1b draws Gear's Deck and Hub inside the new header, with the bar folded and open (owner item 5). |

### Shell

| # | Decision | Reason and evidence |
|---|---|---|
| D15 | **B4 builds the shell once from JavaScript, with no visible change.** A new `js/shell.js`, fourth script in both pages, inserts today's exact markup before and after `<main>` when it runs. The HTML files keep the head, `<main>` with the panels, the static script tags and the inline boot. `HOME` is named in `APPS` instead of being "the first page". | Deferred to Phase B by Phase A (`docs/plans/phase-a/PLAN.md:1198`, `tests/assets.test.js:17-18`). The scripts sit at the end of `<body>`, so `<main>` exists when `js/shell.js` runs, and the shell exists before `boot()` looks up `#panel-metronome` and `#panel-lights` (`js/app.js:1810-1824`), before `js/help.js` looks up `#help-btn` one tick later (`js/help.js:266`, `:294`) and before `js/learn-instruments.js` mounts (`:41`, `:91`). `tools/artifact_build.py:35-39` needs only the `js/theory.js` tag and the "// Offline support" block, both of which stay. Every later shell step then edits one place. |
| D16 | **The key bar is its own bar, always shown in soundLAB, with five items; each item is a chip and a panel, and each id exists once** (B5a). **Key**: chip `#cx-key` ("A Dorian"); panel `#cx-pop-key` with `#cx-root`, `#cx-scale`, `#cx-mode`. **Tempo**: chip `#cx-tempo` (the number); panel `#cx-pop-tempo` with the click's start and stop `#cx-met`, −, the typed number `#cx-bpm`, +. **Scale lock**: chip `#cx-lockchip` (a lock and the word "On" or "Off"); panel `#cx-pop-lock` with the switch `#cx-lock` and the sentence `#cx-lockhint` ("ON · only A Dorian notes sound"). **LUMI lights**: chip `#cx-lights` (names the state); panel `#cx-pop-lights` with the switch `#cx-led`, the status line `#cx-tnote` and a button to the lights sheet. **Help**: chip `#cx-help` (four dots and the level's name); panel `#cx-pop-help` with the five levels, a sentence each, and "Color notes by: Degree · Note name". Above 640 px the Tempo and the Scale lock panels are laid out inside the bar and always shown, and their two chips are not displayed; at 640 px and narrower all five are chips. A `matchMedia('(max-width: 640px)')` listener keeps the `hidden` attribute of those two panels right for the width, so "hidden is the `hidden` attribute" holds for every panel and nothing is moved in the document. The other panels open under their chip above 900 px and rise from the bottom at 900 px and below, one at a time, and close on a tap outside, Escape, a page change, Back and a pedal press, exactly as the dropdown does today. **Every flip of the lock made in the bar shows a message with the sentence**, at every width ("Scale lock on: only A Dorian notes sound" / "Scale lock off: every note sounds"); a flip made by code shows none. Time signature leaves the bar (it is in the metronome sheet); `#cx-sig` goes. `App.ctx()` stays: `App.ctx(true)` opens the Key panel, `App.ctx('help')` a named one (for a panel laid out in the bar it moves the focus to its first control), `App.ctx(false)` closes, `App.ctx()` says whether one is open. In B5a the Help level and the colour switch are also still in the lights sheet and on the Piano page; B5b removes the sheet's copies, B12 the page's. | "Key · Tempo · Scale lock (with a plain-words hint …) · LUMI lights mode · Help level. Same bar on every page; never buried in a menu" (`docs/DESIGN-SYSTEM.md:17-19`); "Note colors … Switch in the key bar" (`docs/ROADMAP-2.0.md:28-30`). Today it is a dropdown behind the clef (`css/style.css:405`) with nine controls that need 1,217 px (`map-shell.md` section 8, fact 1). The first draft put "the stepper again" into a second place, which means two `#cx-bpm` or a node that moves; five chips with five panels, two of them laid out in the bar on wide screens, need neither (completeness issue 11). The colour switch goes into the Help panel, not into a sixth chip and not under "LUMI lights": it changes what the screen shows with or without a LUMI, and level 3 of Help is called "Colors" (`js/app.js:1264`); it is in the bar's dropdown today under the names "Intervals" and "Note Names" (`js/app.js:1648`). The ids that nine suites use stay on the controls that survive (`map-shell.md` section 7, table "Context bar"). `#cx-met`: the welcome says "Its metronome ▶ starts the click from any page" (`js/help.js:245`); today that is two taps at every width (the clef, then the button); after B5a it is one tap above 640 px and two on a phone (the Tempo chip, then the button). The lock silences every note outside the scale; today a stray touch cannot reach it, in a bar that never hides it can, hence the panel on phones and the message everywhere (fidelity issue 4). In Phase B the lights chip switches on and off as today; its further modes are Phase E. |
| D17 | **Width tiers of the key bar.** *641 px and wider:* the Key chip, the tempo stepper, the lock's switch with its sentence, the lights chip, the Help chip. The sentence is always on screen in words, in the longest of three forms that fits: "ON · only A Dorian notes sound", "ON · A Dorian only", the same with the scale's short name (off: "OFF · every note sounds", "OFF"). Above 900 px the bar is one row and never wraps; labels ("Key", "Tempo", "LUMI lights", "Help") show when there is room, from about 1280 px. From 641 to 900 px (portrait tablets: the tabs are at the bottom and the screen is tall) the bar may take two rows. *640 px and narrower:* one 48 px row of five chips: the key (a short scale name from a table when the full one does not fit), the tempo's number, a lock with "On" or "Off", a bulb with the lights' state in one word, the Help dots; nothing scrolls sideways. At every width the lock's state can be read as a word without opening anything. | The mockup's five pills are 1,042 px wide and need a 1,186 px window (`map-design.md` 4.9); a 360 px phone offers 328 px between the gutters. The hint is part of the principle (`docs/DESIGN-SYSTEM.md:17-19`) and "status by text + icon, not color alone" is a rule (`:60`); the first draft showed the sentence only from 1280 px and icons without words on phones, so no iPad would have shown it (fidelity issue 4). The longest scale name is "Natural Minor (Aeolian)" and the default key reads "A Minor Pentatonic" (`Theory.SCALES`, 13 names, read with Node; `tests/nav.test.js:94`), so the short-name table is part of B5a, not a fallback (fidelity issue 23). The planner's arithmetic for the phone row at 360 px, not a measurement: chips of about 80, 48, 58, 70 and 52 px and four 4 px gaps are 324 of 328 px. B1b draws and measures every tier; risk 5 has the fallback. |
| D18 | **The header still slides away on scroll down; the key bar never does.** The key bar is a sticky sibling after `.topbar`, pinned under the header and at the top edge when the header is hidden. When it is the top element it takes the top safe-area inset that the header carries today; the side insets it has always. | "The key bar is always there." Today the whole top bar hides (`css/style.css:186`, `js/app.js:1149-1167`) and one suite asserts that `.topbar` gets class `bar-hidden` (`tests/quiz.test.js:358-366`); that check stays true. Header, pill row and key bar together are about 177 px with a mouse and 189 px on touch (the fidelity critic's sketch at the token sizes; today's top bar with its pills is 109 px at 1280 and 1024 px and 93 px on phones, measured); pinned for good they would take more than a fifth of a phone screen. The header's inset: `css/style.css:170`; without it the bar would sit under the status bar of an installed iPad or phone app (fidelity issue 25; not tried on a device). |
| D19 | **Header contents** (B6). Above 640 px: wordmark (a link to the home page), tabs, then instrument chip (soundLAB, from B8), keyboard status chip `#lights-btn` ("LUMI" with a dot and the state in words; opens the Keyboard lights sheet), `#help-btn`, `#settings-btn`, the link `#app-switch`, and `#met-btn` in the corner, where it is today. At 640 px and narrower: wordmark, instrument chip, one "More" button whose panel lists Keyboard lights, Help for this page, Settings and the link across, each with its words, and `#met-btn` in the corner. The tabs are text only above 900 px (Barlow Condensed caps with an underline for the open one) and icon over label in the bottom bar at 900 px and below. The mark on the Learn tab while today's goal is open stays, in both bars, with words for a screen reader. The tag beside the wordmark: "gear" in Gear; in soundLAB "beta" at the beta address and nothing at the live one ("alpha" goes). No "FL Studio" status before Phase F. | The mockup's header has a wordmark, five text tabs, two status lights and a gear (`docs/design/home-mockup.html:114-123`); the app also has the link across, help, lights and the metronome (`index.html:40-45`). Five 44 px icons and the link need 283 px beside the logo on a 360 px phone and 247 px are free (`map-shell.md` section 11, item 2). `#app-switch` must stay a real link (`CLAUDE.md:1532-1536`). Status "by text + icon, not color alone" (`docs/DESIGN-SYSTEM.md:60`). The ids stay because `tests/assets.test.js:177`, `nav`, `gear`, `game`, `context-global` and `practice` name them. The goal mark is drawn by `css/style.css:267-279` and `:949` (class `goal-due` on `<html>`, `js/xp.js:30`) and no suite looks at the dot itself (`tests/game.test.js:374` reads the class), so it could vanish unseen (completeness issue 9). The beta keeps its own data (`js/app.js:564`) and would otherwise look exactly like the live app (fidelity issue 17). |
| D20 | **Navigation: the five tabs, their groups and their pills do not change; the home is a page outside the groups** (the default; gate G3). On the home no tab is marked and no pill row is shown, as on Settings today; the wordmark, Back and a fresh start lead to it, and a tap on any tab leaves it. The pill strip stays on every page of a group with two or more pages, drawn as chips; at 900 px and below the pills share one row. B1b draws the home in three placements for the owner: **A** a fifth pill "Today" of Learn, with the pill row on the home; **B** outside the groups, no pill row (the default); **C** as A, with the pills in the header's row above 900 px. Bass will live on the Guitar tab and Pads stays under Keys through Phase B (the matrix's questions 2 and 4: owner items 17 and 18). | "Header (wordmark, 5 tabs, status, gear)" (`docs/DESIGN-SYSTEM.md:44`). The mockup has two rows of chrome and no pill row (`docs/design/home-mockup.html:114-133`). With three rows the home's instrument gets 140 px at 1024 × 640 under a one-line headline and 66 px under two lines (the fidelity critic's sketch, issue 5; the planner opened the picture), and 1024 × 640 is the size the design system singles out (`docs/DESIGN-SYSTEM.md:53`). The first draft read the missing pills as "the mockup draws one page"; that was a reading, not a fact. A page that is in no group needs no new code: `populateNav` marks no tab and `paintSubnav` hides the strip when `groupOf` finds nothing (`js/app.js:937`, `:965`), and `goGroup` then opens the group's last page (`:949-959`). With B the Learn pills stay four: five fit one row at 360 px only in today's narrow style (they end at x = 328; with 14 px side padding "Plan" wraps: measured by the completeness critic and again by the planner), and `tests/practiceplan.test.js:404-415` and `tests/quiz.test.js:58` need no edit. The cost of B: the mockup marks "Learn" on the home (`:116`); B marks nothing. 9 suites name `#subnav` or `.subtab` (`map-shell.md` section 7). |
| D21 | **The new home is a new page, `home`, and `HOME` becomes `home`** (B9). It shows only what is stored today. **The next step** comes from small providers (`App.home.provide`), asked in this order: (1) *the plan*: the next open block of today's plan, but only of a plan made from the player's own notes: the starter plan that every profile has is skipped, and a block the app cannot measure (the Tuner, the Neck) counts as dealt with for today once it was opened; (2) *the course*: the level that Exercises' Continue button would start; (3) *Keys*: the last Keys lesson, for Piano and Synth. On a fresh profile the headline is therefore the course's first level: "Natural notes · Treble clef" for Piano, Guitar and Bass, "Chords in a key · Theory" for Drums. **The button says what a tap does:** "Start" only when the tap begins a run (an Exercises level, a Keys lesson, the Neck's runner); otherwise "Open the Tuner", "Open the Woodshed", "Open Exercises". "Something else" holds the other steps and the instrument's entry points. **The instrument** shows the scale of the key bar's key, which is what a LUMI shows as the scale; it marks no "now" note, is never empty (dots at every Help level, labels at Full), does not sound, and a tap on it does what the button does. **The headline** is cut after two lines and the detail line carries the full title. **The footer line**: today's minutes against the goal, the streak, and "Plan: N of M blocks done" with a plan made from notes. No teacher's name, no "pass 2 of 3", no weekly count, no FL Studio light. | "new home" is Phase B, "streak/goal/review on home" Phase D (`docs/ROADMAP-2.0.md:57`, `:60`). **Every profile has a plan:** `students()` builds "My practice" with `starter()` when nothing is stored (`js/practiceplan.js:41-49`); its id starts with `starter-`, `acceptedAt` is null and its first block is "Tune up" in the Tuner (`:118-126`). A block is marked done only in `refresh()` (`:176`), which returns while `pp.running` is empty (`:160`), and `launch` leaves it empty for every block that is not a Keys lesson, Exercises or the Woodshed (`:190-191`). The first draft's rule, "today's first open plan block", would have read TUNE UP on every profile, every day (both critics; measured for four instruments, `work-plan/probe2.out`). The pedal's Next met the same trap and has the same answer (`:199-202`). **What starts a run:** `launch` opens a page and starts nothing, except the Neck's runner (`:195-196`, `js/fretboard.js:2087-2088`); `App.keysLessons.open` shows the lesson list (`js/keylessons.js:886`) and `App.keysLessons.start` begins the run (`:278`, `:892`; tried: a run is active after `launch` and `start`); `SLQuiz.start` begins a level (`js/quiz.js:2959`; tried); the Woodshed has no call that starts a piece (`js/woodshed.js:1577-1587`). A button that reads "Start" and lands on a page with a second Start breaks principle 1 (fidelity issue 3). **The picture:** "lit exactly as the LUMI … will be" (`docs/DESIGN-SYSTEM.md:15-16`) and the mockup's "The LUMI shows the same lights" (`docs/design/home-mockup.html:163`); a "now" key that the LUMI does not get, or a key other than the bar's, would break both (fidelity issue 15). "Headline never wraps past two lines" (`docs/DESIGN-SYSTEM.md:54`); a provider's title can be a teacher's line of any length. Footer data: `App.practiceProgress.summary(instrument)` with `today.engagedSeconds`, `today.goalMinutes` and the streak (`js/practice-progress.js:329-350`). A teacher, a pass count and FL Studio have no data (`map-shell.md` 9.2). Re-drawing the Exercises start instead would leave a page nine screens long behind "one thing on screen" (`map-pages-learn.md` headline 4). |
| D22 | **Starting.** A stored last page still wins at the start (`js/app.js:1915`), so returning users reopen where they were; a fresh profile, an unknown id and Back end on the home. Existing profiles land on the home once (new key `home.landed`), as Exercises did in 0.69 (`js/quiz.js:2948-2952`, which goes; `qz.landed` is left unread). The wordmark is the way home from anywhere. Whether the app should open on the home at the first start of every day is left to Phase D. | Changing what a start does for every returning user is behaviour beyond "new home"; the precedent for a new first page is the one-time landing. 22 suites wait for `App.active === 'quiz'` at boot (`map-tests.md` 2.2; the planner's grep: 23 lines in 21 files plus `tests/remote-gear.test.js:85`); B2 makes them independent by seeding `app.tab` (D40). Owner item 4. |
| D23 | **The instrument is chosen in the header** (B8): a chip that names it and opens a third sheet, "Instrument", with the `<select id="learn-instrument">`, the entry buttons and the note. The chip's accessible name is "Practising: Guitar. Change instrument", and from 1100 px up it shows the small label "Practising" above the name. The Learn bar above the four Learn pages goes. The seven categories and their ids do not change; the sheet lists Piano, Guitar, Bass, Drums first and Synth, Voice, Other under "More". | The choice decides the Exercises content and whose progress every Woodshed, Plan and lesson run counts for, yet it is shown on four pages only (`js/learn-instruments.js:10`, `:77`; `map-matrix.md` section 2). The bar is 116 px high at 1200 px and 168-290 px on a phone, where it pushes the question's button off screen (`map-pages-learn.md` section 3, 4.5; 116, 168 and 184 px measured again at 1280, 390 and 360 px). The key bar must be "the same bar on every page", so the chip cannot live there. The chip is on every page, so it can read "Guitar" while the Keys tab is open; the label says what it means, and B1b draws it (fidelity issue 28; the mockup has no chip). Changing the list is Phase C task 1 (six files spell the ids, `map-matrix.md` section 2). |
| D24 | **Sheets** (B7a): a panel docked right, 440 px wide, above 900 px; a bottom sheet at 900 px and below. Modal as today: scrim, focus kept inside, Escape, Back and the pedal close it. Two breakpoints are left, both in use today: 900 px (bottom tab bar, bottom sheets, panels from the bottom, a key bar of up to two rows) and 640 px ("More" in the header, the key bar's row of five chips). | "Sheet (bottom on phones, side on wide)" (`docs/DESIGN-SYSTEM.md:45`); today it is a centred card that turns at 640 px while the tab bar turns at 900 px (`css/style.css:302-323`, `:910`, `:981`). `tests/nav.test.js:71` closes the sheet with a click at x = 15, which a right-hand panel leaves on the scrim; `:149-151` wants a 390 px wide bottom sheet on a phone. |
| D25 | **One message component, one stack** (B7b). `#app-toast`, `#xp-toast`, `#back-hint`, `#snd-hint`, `#app-update` and the "progress was not saved" box keep their ids, text and `hidden` contract and become children of one fixed column, `#sl-toasts`, so they stack. The column sits in `#sl-float`, the one body-level container that carries `.sl-skin`; anything else a page must put on `<body>` goes into it (rule 12). Phone width is the screen minus the gutters, at most 460 px elsewhere. No action button inside `#app-toast` (its text is read whole by 12 suites). The Woodshed's own flash joins in B15a; the Hub's and Helix's toasts wait for Phase H. | Five implementations share one spot and cover each other, and four of them shrink to half the window (195 px on a phone) because they are placed with `left: 50%` and no width (`css/style.css:868-885`; `map-overlays.md` findings 6-7). |
| D26 | **The help tour and the welcome stay**, in the new look, announced as a dialog with the focus in its card; the layer `#hp-ov` carries `.sl-skin`. **A step whose target sits in a closed fold opens that fold first** and closes it again when the step is left (one helper, built with the tour in B7b; it never stores the fold's state). The 40 tour selectors are kept or changed in the step that moves their target; every step that puts controls into folds re-reads its page's tour; the steps that name the clef are reworded in B5a. | 53 suites seed `help.seen`; four read tour texts (`tests/remote-quiz.test.js:65-66`, `tests/remote-keys.test.js:430`, `tests/gear.test.js:643-664`, `:797`). Today the layer has no role and the focus stays on the page (`map-overlays.md` section 5); it is appended to `<body>` and built from shared classes (`js/help.js:187-196`, `:228-232`). A step whose target has no box loses its ring and its card is centred (`js/help.js:164-181`): nothing fails, the tour points at nothing. After B12 that would be true of `#pn-chseg`, `#pn-play` and `#pn-guide` (`js/help.js:56-58`), after B14a of `#pd-mode` (`:123`) (completeness issue 7). |
| D27 | **Settings stays a page** (B17), grouped into five sections that are `<details>`: all open above 900 px, closed on phones until tapped or linked to; a group the player opened or closed stays as he left it (`ui.folds`). Every id stays. | Nine suites call `App.switchTo('settings')` 30 times and several click its controls with real input at 1200 px (`map-overlays.md` 3.4); as a sheet it would change Back, focus and the pedal rules for no gain. It is eight cards and 3,050 px today, the "dashboard of cards" the design system rejects (`docs/DESIGN-SYSTEM.md:12-13`). |
| D28 | **Four page templates.** *Home*: headline at `--sl-display-lg` (56 px in a window lower than 700 px), the button, the hero, the footer line. *Practice page* (Piano, Neck, Tab, Notation, Pads, Exercises' run, a Woodshed run): one `h1` at `--sl-display-sm`, the instrument as hero, one primary action, everything else in folds. *Tool page* (Exercises' start, Chords, Circle, Plan, Charts, Songs, Jam, Woodshed library, Tuner): one `h1` at `--sl-display-sm`, **exactly one primary button on the first screen**, cards allowed; today's arrangement stays. *Settings*. A fold is a `<details class="sl-fold">`: the controls stay in the document from the start; a fold that carries `data-keep` remembers whether it is open (the stored key `ui.folds`). | "One thing on screen" (`docs/DESIGN-SYSTEM.md:10-13`) is kept in full for the home and the practice pages. **For the nine tool pages Phase B changes the look and not the arrangement**: that is the largest judgement of this plan, and it is the owner's to confirm (owner item 6; B1b draws the three heaviest). The reason: making Exercises' start (8,072 px at 1280 px, the fidelity critic's measure), the Woodshed library or the Plan short means deciding what leaves the page, which is content work of Phase C and D; "Card" is on the component list while "dashboards of cards were rejected" (`:12-13`, `:44`; `map-design.md` Q22). The headline sizes are a change to the design system, which says "one headline per page at `--sl-display-lg`" (`:34`): on a page whose hero is an instrument a 100 px headline takes the instrument's room; B1b writes the new sentence into the document (fidelity issue 20). Only the Plan page has an `h1` today (`js/practiceplan.js:306`). Suites and the pedal reach controls by id whether or not they are on screen, and a sheet built on first open would break them (`map-pages-instr.md` 13.2); `html.kl-running` already folds the Piano page by hiding (`js/keylessons.js:788-789`). A fold that forgets makes a player open the same fold every day (fidelity issue 22). |
| D29 | **Instrument heroes are drawing functions in a new `js/hero.js`** (B3): `SLHero.keyboard`, `SLHero.neck`, `SLHero.pads`, fed by one lighting model (which notes are in the scale, their colours, now, next, pressed, right, wrong, the Help level). The neck takes a list of strings (4, 5 or 6 pitches) and a "frets drawn" flag from the start. Phase B uses them for the home's picture and in the component gallery. **"One lighting model" is therefore one vocabulary in Phase B and one drawing in Phase C:** the practice pages keep their own interactive drawings and their ids, take the tokens in their own steps and the vocabulary of D30 in B16, and are replaced by the hero functions in Phase C. | "Instrument heroes (keyboard, neck, pads) sharing one lighting model" is on the Phase B list (`docs/DESIGN-SYSTEM.md:46-47`). Seven keyboards, three necks and the pads, eleven drawings, are drawn by code in eight files (`map-pages-instr.md` 2.6), and suites pin 29 names of the Piano's drawing and 25 of the Neck's and tap them by their boxes (`map-pages-instr.md` sections 4 and 6). After Phase B there is one more drawing, not one fewer; the plan says so in section 0 instead of calling it done (fidelity issue 7). Today's neck has six strings written into about fifteen places (`js/fretboard.js:359`, `:46`; `map-matrix.md` row 9); a hero built for six would be rebuilt for bass in Phase C. |
| D30 | **The lighting vocabulary, applied to every instrument drawing in one step (B16; gate G4).** In the scale: a dot in the note's colour with a dark ring; from Help level Colors up, its label inside in the ink that reads on that colour. Now: the key (or the dot on a neck, the pad) filled with its own colour, with an ink-coloured ring. Next: an empty ring in the note's colour, steady when motion is reduced. The root: a thicker ring. Right and wrong: the judgement colour with its mark. **No ring, outline or glow in the accent inside an instrument**; a note may still be amber, because in today's palette the root's own colour is amber. The table of B16 names the eleven drawings and the states each one has. Until B16 every drawing keeps today's states (an amber ring for "now"), drawn from tokens. | The mockup: "filled key = play this now" (`docs/design/home-mockup.html:69-70`, `:163`). Today "now" is an amber ring on screen and the key's own colour on the LUMI, in Tab and Notation an amber outline or halo, and the root is the same amber as the ring (`map-pages-instr.md` 3 c, 3 e). Colour alone fails: every degree dot is under 3:1 on a white key in dark (`map-design.md` 6.3); the dark ring is 3.88:1 or better against all seven of today's colours and the label ink is chosen per colour (`work-plan/contrast.js`). The first draft changed the Piano's "now" inside its re-skin step without naming it as a behaviour change, and named no step for the keyboards and necks of Exercises and Chords, the chart keyboards and the Woodshed's keyboard (fidelity issues 7 and 12). It also said "no amber in the instrument" while the root is amber (fidelity issue 8): with the root as "now" the largest amber shape on a page would be a key. Which palette is the default is decided at gate G4 with both drawn (D12); this row holds for either. |
| D31 | **Keys are ivory and ebony in both themes**, on their own stage surface (`--sl-stage`), with an outline token. | "ivory + ebony in both themes — this is the instrument, not chrome" (`js/piano.js:1294`); the light token swap to white makes the keyboard dissolve into a white card (1.00:1, `map-design.md` 6.3). |
| D32 | **The neck obeys the Help level in B13.** Full: dots and labels. Colors: dots. Target: only now and next. Tonic: only the root. None: the bare neck. | The key bar puts Help on every page; on the Guitar tab it changes nothing today (the drawing is identical at Full, Target and None, `map-matrix.md` 3.3) while the key lights already follow it (`js/midi.js:1150-1183`). The matrix recommends Phase B. Fallback: Phase C task 6, unchanged. |

### Light theme, fonts, icons, motion, print

| # | Decision | Reason and evidence |
|---|---|---|
| D33 | **"Light theme" is three jobs**, none of them a second design: the light token values pass (B1a); no component holds a literal white or black (rule 6); every re-skinned page passes the `look` cases in light as it lands, and B18 is the pass that closes what is left. The switch itself does not change (`data-theme` on `<html>`, `app.theme` dark / light / auto, `js/app.js:849-868`). | 26 of 69 tokens flip (`css/tokens.css:110-138`); there is no light mockup (`map-design.md` section 7). Today's light theme has 123 of 863 texts under AA on soundLAB's pages (`map-tests.md` 3.2); six modules carry their own light rules because a bright colour is used as text on a pale card (`map-design.md` section 7, item 4). |
| D34 | **No new font file. New components use only weights that have a file**: Barlow 400 and 500, Barlow Condensed 600 and 700, Bebas Neue 400 (`css/style.css:9-40`), and `.sl-skin` sets `font-synthesis-weight: none`. Caps only for Bebas headlines, the five tabs, the hero button and small field labels; everything else is sentence or title case. The comment "Bebas buttons and tabs" in `css/tokens.css:70` is corrected to Barlow Condensed. | Today Barlow is drawn at 600-700 on about 1,000 of 1,600 text nodes with no file for it, so the browser thickens the 500 file; the mockup does the same (`map-tests.md` 2.7). A new file is a fetch from outside and an `ASSETS` row for a difference of one weight step. The casing rule is today's (`css/style.css:644-647`), with the mockup's caps for tabs and the Start button (`docs/design/home-mockup.html:38`, `:55`). |
| D35 | **Icons stay Lucide through `App.icon`** (`js/app.js:233-287`). Added from lucide-static: a caret for the select chip and a "more" mark. The instrument chip uses icons that exist (`keys`, `guitar`, `drum`, `mic`, `note`). The help button takes `App.icon('help')` instead of its hand-drawn SVG (`js/help.js:268-270`). The three icons no code names (`idea`, `timer`, `trophy`) are removed in B18. | `CLAUDE.md` visual system rule: icons from lucide-static, never hand-drawn. `map-shell.md` section 3 lists the unused names. |
| D36 | **Motion.** Components animate only through `--sl-dur`, `--sl-dur-fast` and `--sl-ease`. A helper `App.motionOK()` gates motion made in script (the blinking next key in a hero, the beat pulse on the metronome button). The home starts no motion by itself. | "Respect `prefers-reduced-motion`; no autoplaying motion on the home" (`docs/DESIGN-SYSTEM.md:61`). The global rule covers CSS only (`css/style.css:995-997`); only one line of `js/` reads the preference today (`map-design.md` 6.6). |
| D37 | **Print.** B14a limits the Charts print rule to the moment the Charts page is the open one and names its paper and ink as tokens; the shell is hidden in print on every page. | The rule hides everything on every page, so printing any other page gives a blank sheet (`js/chordchart.js:525-529`; `map-overlays.md` section 9). |

### Tests and tooling

| # | Decision | Reason and evidence |
|---|---|---|
| D38 | **Four new suites, no picture compared.** `tokens` (pure Node, B1a): the contrast pair list, every `var(--sl-…)` is defined, raw colours and old-variable uses per file only go down, tokens load first, motion can be switched off. `look` (browser, B2): loose cases on every page of both apps from the first day, strict cases on containers that carry `.sl-skin`, and the two guards of Gear's pages, L16 and L17 (Appendix G). `hero` (pure Node, B3). `home` (browser, B9). | There is no visual test of any kind today, CI's Chromium is build 1234 and a developer's 1243, and the only reference picture is one mockup (`map-tests.md` 2.6, section 0 item 9). The cases were prototyped on today's tree: 55 s + 23 s for 184 states (`map-tests.md` 3.2, 3.4). |
| D39 | **`tools/shots.js` makes the reviewers' pictures**: every page of both apps × 360, 390, 820, 1024 × 640, 1200 px × dark, light, the shell states, a contact sheet with before / after pairs, and with `--measure` a file of boxes. It is a tool, not a suite, and its output never enters the repository. | Phase A's pictures came from throwaway scripts that nobody can run again (`map-tests.md` section 6). A prototype took 57 s for 270 pictures. |
| D40 | **B2 makes the suites independent of the start page**: the 22 suites with a boot wait on Exercises seed `app.tab` = `quiz` beside the keys they already seed, and every suite that seeds `qz.landed` (52 suites) also seeds `home.landed`, the key of B9's one-time landing (D22). That passes today and keeps passing whatever `HOME` becomes; B9 then edits only the checks whose meaning is "the start or the fallback is this page". | `map-tests.md` question 2. A stored page wins over `HOME` (`js/app.js:1915-1928`). |
| D41 | **CI: `timeout-minutes` 30 → 40 in B2.** No other workflow change without the owner's yes. | The suites take 15 min 24 s of 30; `look` adds about 90 s; a cold install once took nine minutes (`.github/workflows/tests.yml:27-28`, `map-tests.md` section 4). No test pins the number. An upload of the pictures from CI needs a yes because `tests.yml` also gates both deploys (owner item 13). |
| D42 | **`taps` keeps its job and learns the chrome.** Its fixed "120 px from the top" (`tests/taps.test.js:24`) becomes `App.chromeTop()`, which `js/quiz.js:1273` and `js/keylessons.js:305` use too. `App.chromeTop()` is the sum of the **layout** heights (`offsetHeight`) of the sticky parts that are meant to be shown: the header unless it is hidden by scrolling, and from B5a the key bar. It is never a painted edge. | `taps` is the only suite that proves a tap lands (`map-tests.md` section 0, item 4). Both callers use the header's layout height today whatever its state: `bar.offsetHeight` (`js/quiz.js:1274`), and `js/keylessons.js:303-305` calls `App.showBar()` first with the comment "layout height: the bar may still be sliding in" (the slide takes 220 ms, `css/style.css:180`). The first draft's "bottom edge of the chrome that is on screen" would answer a half-way value during the slide and put the keyboard card under the header, in a step that promises no visible change (completeness issue 14). |
| D43 | **`tests/assets.test.js` part 5 is replaced in B4**: statically, both HTML files hold the same head and boot script and no shell markup, and `js/shell.js` names the shell's ids; at run time `look` compares a signature of the shell in both apps. | The text comparison of `<body>` … `<main>` (`tests/assets.test.js:170-179`) has nothing to compare once the markup is built from JavaScript, and the panel check at `:121-125` must not start passing on an empty list. |

### Documents

| # | Decision | Reason and evidence |
|---|---|---|
| D44 | **`docs/DESIGN-SYSTEM.md` becomes the specification in B1b** (principles as page rules, every token, every component with class name, anatomy, sizes and states, layout numbers, the lighting vocabulary, and the two sentences this plan changes: the headline sizes of D28 and the dense tier of D9) and is corrected in the step that builds each piece. `docs/ROADMAP-2.0.md` gets a "Phase B status" section in B1a (Appendix E). This plan and the seven maps are committed as `docs/plans/phase-b/` in B1a, like Phase A's (`docs/plans/phase-a/`); the wording list of rule 16 in B1b. No doc file is moved or renamed. | The design system is one page of names today: no anatomy, size, state or class name for any component (`map-design.md` finding 2). |

---

## 3. Order of work, cache numbers, new suites

`CACHE` is `PREFIX + 'v9'` today (`sw.js:8`). A step that changes a file the app serves takes the next number;
B0 and B1b are documents and leave `sw.js` alone. "Strict from this step" = what joins the `RESKINNED` list of
the `look` suite. "Waits for" = a stop point of rule 2 or a gate of rule 19.

| Step | Pull request | Depends on | Waits for | `CACHE` after it | New suites in `tests/run.sh:17` | Strict in `look` from this step |
|---|---|---|---|---|---|---|
| B0 | The instrument matrix (Phase B0), alone | Phase A | — | `v9` (unchanged) | — | — |
| B1a | Tokens that pass, the `tokens` suite, this plan and its maps | B0 | — | `v10` | `tokens` | — |
| B1b | The specification, the drawings, the wording list | B1a | — | `v10` (unchanged) | — | — |
| | **Stop 1:** Phase A (#99-#103), B0, B1a and B1b are in `v2` | | | | | |
| B2 | Colour bridge, the `look` suite, the screenshot tool, suites independent of the start page | B1a | stop 1 | `v11` | `look` | — (loose cases on every page) |
| B3 | Component sheet, gallery, instrument drawings | B2 | — | `v12` | `hero` | the gallery |
| B4 | The shell built once from JavaScript (no visible change) | B3 | — | `v13` | — | — (adds "the shell is the same in both apps" and the deleted-selector guard) |
| | **Stop 2:** B2-B4 are in `v2` | | | | | |
| B5a | Key bar: always shown, the same controls; the accent picker goes | B4 | stop 2, gate G1 | `v14` | — (`context-global` is rewritten) | the key bar |
| B5b | Help level and colour switch are set in the bar only; the sheet is "Keyboard lights" | B5a | — | `v15` | — | — |
| B6 | Header and navigation | B5b | gate G2 | `v16` | — | header, tab bars, pills |
| B7a | Sheets | B6 | — | `v17` | — | both sheets |
| B7b | Messages, the help tour, the pedal confirmation | B7a | — | `v18` | — | tour, messages, pedal confirmation |
| B8 | Instrument chip (the Learn bar goes) | B7b | — | `v19` | — | the Instrument sheet |
| B9 | Home | B8 | gate G3 | `v20` | `home` | `home` |
| | **Stop 3:** B5a-B9 are in `v2` and the owner has used the new shell on his own devices | | | | | |
| B10 | Exercises | B9 | stop 3 | `v21` | — | `quiz` |
| B11 | Chords, Circle, Plan | B10 | — | `v22` | — | `chords`, `theory`, `practiceplan` |
| B12 | Piano, Keys lessons, LUMI section | B11 | — | `v23` | — | `piano` |
| B13 | Neck, Tab, Notation | B12 | — | `v24` | — | `fretboard`, `tab`, `notation` |
| B14a | Charts, Pads | B13 | — | `v25` | — | `chart`, `pads` |
| B14b | Songs, Jam | B14a | — | `v26` | — | `songs`, `jam` |
| B15a | Woodshed, with guided performance and Practice progress | B14b | — | `v27` | — | `shed` |
| B15b | Tuner | B15a | — | `v28` | — | `tuner` |
| B16 | The lighting vocabulary on every instrument drawing | B10-B15a | gate G4 | `v29` | — | case L18 on the eleven drawings |
| B17 | Settings | B16 | — | `v30` | — | `settings` |
| B18 | Clean-up, documents | B17 | — | `v31` | — | everything in soundLAB |

**B16p, only with the owner's yes at gate G4:** a new default palette (the tokens' red-first one), as its own
pull request directly before B16. It takes the next cache number and every number after it rises by one (the
numbers only have to rise).

Why this order. B0 first and alone, so that Phase C can be planned from the matrix while the drawings are still
being looked at. B1a before anything that reads a token, because a token is free to change only while nothing
reads it. B2 before B3 so that `look` exists when the first component arrives. B4 before the shell changes so
that each of them edits one file instead of two. B5a (the bar itself) before B5b (the copies of two of its
controls go), so a failed key-bar check is never mixed with a changed sheet; both before B6 (look), so it is
never mixed with a moved header. B7a before B8, because the instrument chip opens a sheet. B8 before B9,
because the home shows "your instrument" and needs the way to change it. Exercises first among the pages: it is
the heaviest (21,809 characters of CSS, 101 pinned names, `map-pages-learn.md` section 4) and the one whose
phone layout depends most on the shell. Piano before Neck, because the Neck's sheet lends classes to Piano (D8)
and Piano holds the existing focus mode that the practice template copies. The lighting vocabulary after every
page that holds an instrument drawing, so that one pull request shows all eleven drawings side by side and the
owner has had time for gate G4. Settings last among the pages: it uses every form component and nothing depends
on it.

The pages B10-B15b depend only on B9 and on each other through the cross-page classes of D8; if one of them is
held up, the next can go first. A gate that is not answered holds only its own step and what depends on it:
with G1 open, B5a-B9 wait and nothing else can go ahead of them, which is why B1b comes so early.

Appendix D lists the lines that several steps edit.

---

## 4. The steps

One section per pull request, in the shape of `docs/plans/phase-a/PLAN.md`: goal, files added, files modified
(by name and line), what must not change, stored state, tests, docs, acceptance checks with what to look at in
the pictures. Lines of the shell (`js/app.js`, `css/style.css`, both HTML files, `sw.js`, the suites) were
re-read by the planner. Lines inside the page modules (B10-B17) are the maps' lines; the planner looked up again
each module's `App.injectCSS` call, its markup and CSS ranges and every line that a step removes or that a suite
pins, and says "map" beside a line it took over without opening it.

### B0 — The instrument matrix

**Goal.** Phase B0's deliverable is in the repository on its own, before any drawing or code of Phase B, so
that the Phase C plan can be written from it. Documents only: neither app changes and no suite changes.

| File added | Content |
|---|---|
| `docs/INSTRUMENT-MATRIX.md` | Phase B0, section 5: the matrix, the trace from every gap cell to its task candidates, the 26 candidates, the owner's questions |
| `docs/plans/phase-b/map-matrix.md` | its evidence (text only) |

No existing file is modified; `sw.js` is not touched (`docs/` is not in `ASSETS`). Acceptance:
`node tests/assets.test.js` still passes, and every `file:line` of the matrix's evidence table points at a line
of the branch (a ten-line script in the pull request text, not a suite). The pull request text copies the
matrix's questions that wait for the owner (section 9, items 14-18).

---

### B1a — Tokens that pass, the `tokens` suite, this plan and its maps

**Goal.** Before any rule reads a token: the tokens meet their own rules and hold every colour and size the
pages need. Neither app changes on screen: no file but `css/tokens.css` reads a `--sl-*` token (grep: no other
hit).

#### B1a.1 Files added

| File | Content |
|---|---|
| `docs/plans/phase-b/PLAN.md`, the six other `map-*.md` | this plan and its evidence (text only; no pictures, D39) |
| `tests/tokens.test.js` | pure Node, B1a.4 |

#### B1a.2 `css/tokens.css`

Appendix C has every value. By block:

| Lines | Edit |
|---|---|
| `1-9` | header: add "note colours are not tokens: `App.colors` hands them to an element as `--c`"; keep the three rules |
| `15-21` (surfaces) | add `--sl-surface-sunken`, `--sl-stage`, `--sl-line-control` |
| `24-26` (ink) | add `--sl-ink-soft` between ink and muted |
| `29-33` (accent) | add `--sl-accent-text`, `--sl-accent-deep` and `--sl-accent-glow-color`; comment on `--sl-accent-ink`: "text ON the accent; never use it for amber text" |
| `36-39` (status) | add `--sl-judge-perfect`, `-great`, `-good`, `-miss` |
| `41-49` (degrees) | the seven values become the app's defaults, `#ffab47 #e8d44d #7ad97a #4cc9b0 #6ea8fe #b48ef0 #ff85b3` (`js/app.js:1289`); comment: "the palette's default colours, for documents and drawings; no rule reads these: a page shows the colours of `App.colors`, which the user can change (D12)" |
| `52-55` (keys and strings) | add `--sl-key-line`, `--sl-key-press`, `--sl-nut`, `--sl-ink-on-color`, `--sl-ink-on-color-light` |
| `58-72` (type) | add `--sl-weight-regular` 400, `--sl-weight-medium` 500, `--sl-weight-cond` 600, `--sl-weight-cond-bold` 700; `70` comment "Barlow Condensed caps: tabs and the hero button" |
| `92-96` (controls) | add `--sl-control-h-hero: 64px`, `--sl-control-h-dense: 36px`; `--sl-focus` becomes `0 0 0 2px var(--sl-bg), 0 0 0 4px var(--sl-accent-text)` |
| `104-106` (layers) | the seven values of D10 |
| `110-138` (light) | `--sl-accent-ink: #1a1206`; `--sl-ink-muted: #645b62`; `--sl-ok: #156b33`; `--sl-warn: #8a500a`; `--sl-bad: #b32e2e`; `--sl-info: #2a5fb8`; the light values of the new tokens; `--sl-key-white` and `--sl-key-black` are no longer re-inked (`131-132`, D31); `--sl-focus` no longer re-defined (`135`: the new value follows the theme through its two tokens) |
| `140-142` (touch) | the query becomes `(any-pointer: coarse)`; also `--sl-control-h-dense: 48px` |

#### B1a.3 Other files modified, what must not change

| File | Lines | Edit |
|---|---|---|
| `tests/run.sh` | `17` | add `tokens` |
| `sw.js` | `8` | `PREFIX + 'v10'` |
| `docs/ROADMAP-2.0.md` | after `98` | the "Phase B status" section (Appendix E) |
| `CLAUDE.md` | above `1902` | new section "soundLAB 2.0 Phase B (\"Design system + shell\") — state on `v2`": its first line says where lines 24-41 are out of date (rule 5); then the pointer to this plan, rules 6, 11 and 12, what B1a changed. Lines 24-41 untouched |

No file under `js/`, no HTML file, no other stylesheet. No stored key is read or written. `--sl-bg`, the type
stacks and the space scale keep their values.

#### B1a.4 Tests

**New `tests/tokens.test.js`** (pure Node, under a second):

| Case | Check |
|---|---|
| T1 | Contrast, both themes, computed from the two blocks of `css/tokens.css` with translucent tokens composited over their surface. Text at 4.5:1: `--sl-ink`, `--sl-ink-soft`, `--sl-ink-muted`, `--sl-accent-text`, `--sl-ok`, `--sl-warn`, `--sl-bad`, `--sl-info` on `--sl-bg`, `--sl-bg-raised`, `--sl-surface`, `--sl-surface-2`, `--sl-surface-sunken`; `--sl-ink` and `--sl-accent-text` on an `--sl-accent-soft` fill over each surface; `--sl-accent-ink` on `--sl-accent`; the four judgement colours on `--sl-surface`. Graphics at 3:1: `--sl-line-control`, `--sl-accent-deep` and the focus colour on the five surfaces; `--sl-key-line` on `--sl-key-white`; `--sl-key-white` and `--sl-nut` on `--sl-stage`. The pair list lives in the test and is the contract |
| T2 | Every `var(--sl-…)` in `css/` and `js/` names a token that `css/tokens.css` defines (a misspelt token is silently ignored by CSS) |
| T3 | Raw colours only go down: the number of hex, `rgb(` and `hsl(` literals per file is at most the number the test holds (today `css/style.css` 54, `css/lumi-practice.css` 14, `js/*.js` 239 in 27 files, `map-tests.md` 3.4). Palettes that are data (`js/app.js:1289-1294`, `js/note-palette.js`, `js/pads.js:36-38`) are on an allow list with the reason |
| T4 | Old variables only go down: the number of `var(--<name>` per file of `js/` and `css/lumi-practice.css` is at most the number the test holds, for each of the **29** names that `css/style.css:42-75` defines: `bg`, `panel`, `card`, `card2`, `inset`, `line`, `line-soft`, `text`, `muted`, `label`, `ctl-border`, `accent`, `accent-dim`, `accent-glow`, `accent-soft`, `accent-line`, `accent-ink`, `warn`, `h-ctl`, `teal`, `green`, `red`, `blue`, `purple`, `radius`, `shadow-1`, `font-body`, `font-display`, `font-condensed`. The seven Gear modules and `js/scoreplayer.js` are exempt until Phase H |
| T5 | `css/tokens.css` is the first stylesheet of both pages (`index.html:15`, `gear.html:15`) |
| T6 | Motion can be switched off: both reduce blocks exist (`css/tokens.css:144-146`, `css/style.css:995-997`) |
| T7 | `--sl-deg-1` … `--sl-deg-7` are equal to the seven entries of `DEGREE_DEFAULTS`, read from `js/app.js` |

Each later step lowers the ceilings of T3 and T4 for the files it converts, in the same commit.

#### B1a.5 Acceptance checks

```
grep -rn "var(--sl-" js css index.html gear.html | grep -v "^css/tokens.css"     # no hits: nothing reads a token yet
node tests/tokens.test.js
grep -n "sl2\|v10" sw.js | head -3
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh tokens assets pages-next        # pages-next reads tokens.css in a fixture (tests/pages-next.test.js:73)
```

Today's app, base against branch: no pixel differs (nothing reads a token).

---

### B1b — The specification, the drawings, the wording list

**Goal.** The design system is a specification a reviewer or a test can check; every piece the mockup does not
show exists as a drawing built from the real tokens; the owner has one page that asks him each open decision
beside the picture that answers it. Documents only: no file under `js/`, `css/` or `tests/` changes, `sw.js` is
not touched.

#### B1b.1 Files added

| File | Content |
|---|---|
| `docs/design/phase-b/index.html` | the owner's page: every question of section 9 with its default, a link to the drawing that answers it, and which step waits for the answer (gates G1-G4 first) |
| `docs/design/phase-b/shell.html` | header and key bar at 360, 390, 640, 641, 820, 1024 and 1280 px (`?w=`), dark and light (`?theme=`): the tiers of D17 with the lock on and off, the three forms of its sentence, the longest scale name and the default key "A Minor Pentatonic"; the five panels as a popover and as a bottom panel; the message a flip shows; the phone "More" list; the bar with the header slid away; the instrument chip with "Practising"; the goal mark on the Learn tab; the "beta" tag |
| `docs/design/phase-b/home.html` | the home at 390 × 844, 820 × 1180, 1024 × 640 and 1280 × 800, in the three placements of D20 (`?nav=a|b|c`), for keys, guitar, bass and drums. Headlines are the ones the code gives: "Natural notes · Treble clef" and "Chords in a key · Theory" on a fresh profile; a Keys-lesson block of a plan ("C major · RH", button "Start"); a Tuner block ("Tune up", button "Open the Tuner"); a two-line headline; an 80-letter title cut at two lines; the goal reached. Each picture prints the hero's height and its share of the window |
| `docs/design/phase-b/instruments.html` | keyboard, neck (6 and 4 strings, with and without fret wires, flat and upright) and pads in every state of D30 at the five Help levels, both colour modes, dark and light, **in both palettes** (`?palette=app|tokens`; the tokens' colours as the LUMI's table shows them, `map-pages-instr.md` 3 b), each beside the amber Start button |
| `docs/design/phase-b/overlays.html` | sheet as a right-hand panel and as a bottom sheet, the message stack (one, two, a long one), the pedal confirmation, the tour card, empty / loading / error |
| `docs/design/phase-b/pages.html` | a practice page (Piano with a lesson, its folds closed and open); **the tool pages**: Chords, and the three heaviest, Exercises' start, the Woodshed library and the Plan; one tool row at 44 and at 36 px (D9); Settings' five groups; all at 390 and 1280 px |
| `docs/design/phase-b/gear.html` | Gear's Deck and Hub as they render today (a saved copy of each panel's markup and of the modules' style elements, taken from the running app) inside the new header, with the key bar folded and open, at 390 and 1280 px, dark and light |
| `docs/design/phase-b/mock.css` | the drawings' styles, written with the class names of Appendix B and tokens only: the first draft of `css/components.css` |
| `docs/plans/phase-b/WORDING.md` | the wording list of rule 16 |

The drawings link `../../../css/tokens.css` and carry no data of their own beyond sample texts and the two
palettes. They are HTML, not pictures: both deploys publish the tree, and one 322 KB picture is already
published (`map-tests.md` 5.3).

#### B1b.2 Files modified

| File | Lines | Edit |
|---|---|---|
| `docs/DESIGN-SYSTEM.md` | all | rewritten as the specification (D44): the five principles as checkable page rules (`map-design.md` section 2); the token tables with dark and light values and the pair list; every component of Appendix B with class name, markup, sizes and states; the four page templates with their headline sizes (D28); the width tiers (D17, D19, D24); the lighting vocabulary (D30) and its table of drawings; what is not a token (D12); the dense tier and the rows that may use it (D9). Two sentences of today's text change and are marked as changed: "one headline per page at `--sl-display-lg`" (`34`) and "every control is tappable at 44 px" (`37`, if the owner agrees to the dense tier). The mockup recipe (`63-70`) gains the new files. The numbers measured on the drawings are written in: the bar's height per tier, the hero's height and share per window |
| `docs/ROADMAP-2.0.md` | "Phase B status" | row B1b |

#### B1b.3 Acceptance checks

```
git diff --stat <B1a branch>...HEAD -- js css tests sw.js index.html gear.html      # empty: documents only
node tests/assets.test.js
```

Look at (the agent opens them; the owner gets the contact sheet and `index.html`): every drawing at 360, 390,
640, 820, 1024 × 640 and 1280 px in dark and light. In each picture: nothing scrolls sideways; the key bar is
one row (up to two from 641 to 900 px) and the lock's state can be read as a word; the home's headline is at
most two lines; the button and the whole instrument are visible without scrolling at 390 × 844, 1024 × 640 and
1280 × 800, and the instrument is at least as high as the headline block and at least a quarter of the window's
height (22 % at 1024 × 640), with a two-line headline, in the placement that is proposed; in light the keys
stand off their stage and amber text is readable; "now" can be told from "in the scale" without colour (print
the instruments drawing in grey to check); with the root as "now" beside the Start button, say in the pull
request text how the two ambers read in today's palette and how the red root reads in the other. If the
default placement B does not reach the hero's minimum, the pull request says so and proposes the change before
G3 is asked.

---

### B2 — Colour bridge, the `look` suite, the screenshot tool, suites independent of the start page

**Goal.** soundLAB's colours come from the tokens and nothing moves, with one wanted exception: an element that
carries the `hidden` attribute is no longer displayed (on today's tree that is one row of the Songs page).
Gear is untouched. The `look` suite and `tools/shots.js` exist, and Gear's pages are guarded against the look
of the day before Phase B. No suite cares any more which page the app starts on. The small faults that `look`
trips over are fixed.

**Commits, in this order:** (1) suites seed `app.tab`; (2) `look`, its fixture and `tools/shots.js` on today's
app, with the `[hidden]` rule and the four names; (3) the bridge and soundLAB's browser-bar colour. The accent
picker stays until B5a (D11).

#### B2.1 Files added

| File | Content |
|---|---|
| `tests/look.test.js` | browser, both apps; Appendix G. In B2: L1-L6, L9 as a ceiling per page, L14, L16 |
| `tools/shots.js` | D39. `node tools/shots.js --out <folder> [--url <index.html>] [--only quiz,piano] [--measure]`; fake LUMI and MODX ports as `tests/gear.test.js:70-134` builds them; service workers blocked; reduced motion; fonts awaited; focus removed before each shot; never `fullPage` at phone widths |
| `tests/fixtures/style.phase-a.css` | a copy of `css/style.css` as it is in `a914df2`, byte for byte, for case L16 (D13). It is never edited and is not in `ASSETS`. The folder `tests/fixtures/` is new (`ls`: it does not exist today) |

#### B2.2 Files modified

| File | Lines | Edit |
|---|---|---|
| `css/style.css` | after `108` | the bridge block (Appendix C): `:root:not([data-app="gear"]) { --bg: var(--sl-bg); … }`. It has the weight of the light block at `81` and comes after it, so it serves both themes |
| `css/style.css` | after `159` | `:root:not([data-app="gear"]) [hidden] { display: none !important; }` (soundLAB only: Gear has three known cases that Phase H owns, `map-tests.md` 2.8). On today's pages at rest, at 1200 px, it hides exactly one element: `#sg-opendest` on Songs, 1,068 × 40 px (found by the completeness critic, again by the planner). The step runs the same scan over every page state of the suite's table and lists in the pull request each element the rule hides |
| `js/app.js` | `853-855` `applyTheme` | in soundLAB `theme-color` becomes `#f5f1ea` / `#0f0d10`; in Gear it keeps today's two values until B6, because Gear's ground stays `#131114` until then (`css/style.css:44`, `:136-148`; measured `rgb(19, 17, 20)`). The `applyAccent()` call stays |
| `js/app.js` | next to `injectCSS` (`802`) | new `App.token(name)`: the computed value of `--sl-<name>` on `<html>`, trimmed; warns once per name when it is empty |
| `js/jam.js` | `1092`, `1100`, `1106` | `aria-label="Drums volume"` / `"Bass volume"` / `"Chords volume"` |
| `js/settings.js` | `74` | `aria-label="Master volume"` |
| `manifest.webmanifest` | `9-10` | `#0f0d10` twice. The two `theme-color` tags of the HTML files (`index.html:6`, `gear.html:6`) stay `#131114` until B6: the two heads must stay equal (`tests/assets.test.js:158-166`) and `applyTheme` sets the colour at start in both apps anyway |
| `.github/workflows/tests.yml` | `27-28` | `timeout-minutes: 40`; the comment names `look` |
| `docs/CI-DEPLOYMENT.md` | `23` | "forty minutes" |
| `tests/run.sh` | `17` | add `look` |
| `sw.js` | `8` | `v11` (no `ASSETS` change: `tools/` and `tests/` are not served) |

Not touched in B2: the header's and the phone bar's literal backgrounds (`css/style.css:111-113`, `:173`, `:921`,
`:926`), the primary button's `#221302` (`:602`) and the select chevron's amber (`:117`, `:677`). They are shell
and component rules that B5a-B7b and the page steps replace, and Gear uses them too. The accent picker
(`js/app.js:815-847`, `js/settings.js:47-52`): a stored accent other than amber still wins over the bridge,
because it is written inline on `<html>` (`js/app.js:838-840`); it goes in B5a.

#### B2.3 Stored state

No key is added, removed or read differently.

#### B2.4 Tests

| Suite | Change |
|---|---|
| `audioin`, `btmidi`, `chordchart`, `colors`, `game`, `keys`, `lights`, `lumi-practice`, `lumidisplay`, `multiin`, `oneopen`, `portnames`, `practice`, `quiz-correction`, `remote`, `remote-gear`, `remote-keys`, `remote-quiz`, `remote-runners`, `taps` | their init script also sets `soundlab2.app.tab` to `"quiz"` (D40). The boot waits stay as they are (`audioin:113`, `btmidi:53`, `chordchart:19`, `colors:43`, `game:29`, `keys:25`, `lights:35,411`, `lumi-practice:242`, `lumidisplay:30`, `multiin:35`, `oneopen:45,170`, `portnames:26`, `practice:20`, `quiz-correction:23`, `remote-keys:114`, `remote-quiz:43`, `remote-runners:64`, `remote:57`, `taps:12`, `remote-gear:85`) |
| every suite that seeds `qz.landed` (52 suites, e.g. `tests/keys.test.js:20`, `tests/nav.test.js:9`) | the same line also seeds `home.landed` = true. No code reads the key before B9; from B9 on it keeps the one-time landing on the home from moving a suite off the page it seeded (D22). The few checks that test the landing itself remove the key (B9) |
| `quiz`, `nav`, `gear`, `trim`, `storage-import` | not in B2: their lines about the start page are what they test; B9 edits them |
| `context-global` | no edit; re-run: its contrast check on the clef and the dropdown's fields (`117-132`) now measures token colours |
| `look` (new) | L1 no sideways scroll, L2 nothing with `hidden` is displayed (Gear's three cases listed), L3 each control is what a tap hits at 390 and 1200 px, L4 a visible change on keyboard focus, L5 every help-tour selector resolves in the state its tour assumes, L6 reduced motion, L14 the worker installs and both pages start offline, L16 Gear's pages are as on the day before Phase B (against the fixture). Also once: in soundLAB `body`'s background equals the resolved `--sl-bg` in both themes |

#### B2.5 Docs

`CLAUDE.md` Phase B section: the bridge and who may still read an old name, `App.token`, the `[hidden]` rule,
the fixture and what case L16 compares; the dev loop gains `look` and `tools/shots.js` and the full-page
screenshot trap. `docs/ROADMAP-2.0.md` status: B2.

#### B2.6 Acceptance checks

```
node tools/shots.js --measure --out <scratch>/b2-base --url http://127.0.0.1:4574/index.html     # the base: a second worktree served on another port
node tools/shots.js --measure --out <scratch>/b2      --url http://127.0.0.1:4573/index.html
# the two measure files are equal in Gear, and in soundLAB except #sg-opendest and the boxes after it on Songs
# (and whatever else the [hidden] scan listed): no other box of the shell or of a page's first two levels moved
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh look tokens context-global colors oneopen trim smoke gear synthdeck-scope
```

Look at, in soundLAB: all 14 pages and Settings, both sheets and the open dropdown at four widths in both themes. Wanted:
a darker stage; grey text that is slightly cooler; in light whiter cards, a deeper amber and darker amber
text; the Songs page no longer shows three dead buttons before a file is chosen. Not wanted: any moved or
resized box, a control that lost its outline, text that became harder to read (compare the light pictures of
Chords, Circle and Tab, where degree-coloured text sits on pale cards). In Gear: every picture is identical to
the base, pixel for pixel (no geometry changes in this step, so a pixel comparison is valid here).

---

### B3 — Component sheet, gallery, instrument drawings

**Goal.** The components exist, each from tokens only, and can be seen and tested in every state on one
gallery page. The three instruments can be drawn from one lighting model. Neither app changes on screen: no
container carries `.sl-skin` yet.

#### B3.1 Files added

| File | Content |
|---|---|
| `css/components.css` | Appendix B. Three kinds of rule: `.sl-*` components; `:where(.sl-skin) <shared class>` looks, each setting every property the old rule sets and the new look does not want (the title dot `css/style.css:500-509`, the button shadow `:591`); and plain definitions of the cross-page classes of D8 with the values their owners use today. The select is the one look written with weight, `:root .sl-skin select` and `:root[data-theme="light"] .sl-skin select`, so that it beats the old light-theme chevron rule (`css/style.css:116-121`, `:677`; D6). The row component has its done state, `.sl-row.is-done`: a check mark and the word "Done", not a colour alone. The fold component can remember: see `js/app.js` below |
| `js/hero.js` | `window.SLHero` (and `module.exports` under Node): `keyboard(opts)`, `neck(opts)`, `pads(opts)` return an SVG or HTML string; `model(input)` turns key, scale, Help level, now, next, pressed, right, wrong and a colour function into per-note states; `inkOn(colour)` picks `--sl-ink-on-color` or `--sl-ink-on-color-light`. No `App`, no store, no bus: everything is passed in. `neck` takes `strings` (pitches, lowest first: 6, 5 or 4 of them), `frets`, `fretless`, `upright`, `lefty`; `keyboard` takes `from`, `to`; `pads` takes `lanes` and `cols` |
| `docs/design/components.html` | the gallery: links `css/tokens.css`, `css/style.css`, `css/components.css`; one `.sl-skin` block per component with every state (rest, hover, focus, active, on, disabled, error) and both sizes; the heroes from `js/hero.js`; `?theme=light` |
| `tests/hero.test.js` | pure Node, B3.4 |

#### B3.2 Files modified

| File | Lines | Edit |
|---|---|---|
| `index.html` | after `16` | `<link rel="stylesheet" href="css/components.css">` (before `css/lumi-practice.css`) |
| `gear.html` | after `16` | the same line (rule 9; `tests/assets.test.js:163` compares the heads) |
| `js/app.js` | next to `App.token` | new: one listener for the `toggle` event of any `details.sl-fold[data-keep]` stores whether that fold is open under its `data-keep` name in the object `ui.folds`, and a new fold with a stored name starts in its stored state. A fold without `data-keep` is not stored. The help tour opens and closes folds without storing (B7b). No app page has such a fold before B12 |
| `sw.js` | `8`, `ASSETS` after `14` | `v12`; `'css/components.css'` |
| `tests/run.sh` | `17` | add `hero` |
| `tests/look.test.js` | | gallery cases: on `docs/design/components.html`, in both themes, the strict cases L7 (44 px at a touch width, the dense tier 36 px with a mouse), L9 (text contrast on real elements), L10 (tokens only), L11 (every control has a name), L13 (on and off, done and not done differ by more than colour), and the focus ring is the `--sl-focus` shadow plus a transparent outline. A select inside `.sl-skin` shows the component's chevron in light as well as in dark. A fold with `data-keep` is open again after a reload; one without is closed |

`js/hero.js` gets no `<script>` tag in an app page yet: B9 adds it with its first user.

#### B3.3 What must not change

With `css/components.css` loaded, no element of either app has a different computed style (no `.sl-skin`
container exists; the cross-page definitions are equal to, and come before, the module rules that still define
those classes). This is checked, not assumed (B3.5), and it is the first test of the marker itself (D6).

**Stored state.** New key `ui.folds` (an object: fold name → open or closed). Nothing writes it before B12.

#### B3.4 Tests

**New `tests/hero.test.js`** (loads `js/hero.js` with `require`): the neck draws as many string lines as it is
given pitches (6, 5, 4) and no fret wires when `fretless`; the keyboard draws the keys of its range; the pads
draw their lanes; at Help level Full every scale note has a dot and a label, at Colors a dot, at Target only now
and next, at Tonic only the root, at None nothing; "now" carries its own class and the note's colour, "next" a
ring; a label's ink has 4.5:1 against its dot for the twelve colours of today's palette in both modes; the
output holds no colour but the ones passed in and `var(--sl-…)`.

#### B3.5 Docs and acceptance checks

`docs/DESIGN-SYSTEM.md`: class names and states as built. `CLAUDE.md`: layout entries for `css/components.css`
and `js/hero.js`; the visual-system convention points at the gallery. Roadmap status: B3.

```
node tests/assets.test.js && node tests/hero.test.js && node tests/tokens.test.js
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh look assets tokens hero smoke gear
# no-change proof: with css/components.css disabled through document.styleSheets and enabled again, the computed
# styles of every element of all 14 + 4 pages, Settings and both sheets are equal (run once on both apps, at 390
# and 1200 px, both themes; L16 already holds Gear against the fixture)
```

Look at: the gallery at 390 and 1280 px in dark and light, every component in every state; the heroes at 390,
1024 and 1280 px. In each: the focus ring shows on an amber button as well as on a dark one; "on" can be told
from "off" without colour (fill plus a mark or a moved knob); disabled text is readable as disabled, not as
missing; a wrapped segmented control keeps separate rounded segments (`map-overlays.md` 12.4 saw one blob).

---

### B4 — The shell built once from JavaScript (no visible change)

**Goal.** The header, the dropdown, the phone tab bar, the two sheets and the footer exist once, in
`js/shell.js`, and are written into both pages when that script runs. What a user sees and what a suite finds
is exactly as before. Leftovers that Phase A deferred to this step go with it.

#### B4.1 Files added

| File | Content |
|---|---|
| `js/shell.js` | `window.SLShell = { html(app), mount() }`. `html(app)` returns `{ before, after }`: today's markup of `index.html:20-82` and `:100-102` as two strings, with the three things that differ per app taken from `APPS` (the tag text "alpha" / "gear", the footer's app name, nothing else). `mount()` runs at once: `main.insertAdjacentHTML('beforebegin', before)` and `('afterend', after)`. It needs `App.app` only |

#### B4.2 Files modified

| File | Lines | Edit |
|---|---|---|
| `index.html` | `20-82`, `100-102` | removed; `<body>` is followed directly by `<main>` |
| `index.html` | after `105` | `<script src="js/shell.js"></script>` |
| `gear.html` | `19-81`, `88-90`; after `93` | the same |
| `js/app.js` | `76-93` | each app in `APPS` gets `home:` (`'quiz'`, `'deck'`); `HOME = APPS[APP_ID].home` |
| `js/app.js` | `102-108` and its uses (`969`, `1180`, `1184`) | `SPACE_LABELS` is renamed `PAGE_LABELS` |
| `js/app.js` | `1067-1069`, `1844-1850` | the handlers for `.tab` buttons go (no such element exists, `map-shell.md` 2.4) |
| `js/app.js` | `1084` | the `noctx` line goes |
| `js/app.js` | `1956-1957` | unchanged (the footer exists by then) |
| `js/app.js` | public object (`2018-2067`) | new `App.chromeTop()`: the sum of the layout heights (`offsetHeight`) of the sticky parts that are meant to be shown. Today that is the header's `offsetHeight`, or 0 when scrolling has hidden it (`barHidden`, `js/app.js:1142-1148`); never a painted edge (D42) |
| `js/quiz.js` | `1273-1276` | `var hb = App.chromeTop();` (today: `bar.offsetHeight`, `1274`) |
| `js/keylessons.js` | `305` | the same; `App.showBar()` stays the line before it (`304`), so the header counts while it is still sliding in |
| `css/style.css` | `450-453` | the `.tabs` / `.tab` rules go (no element has those classes: `js/app.js:1067-1069` is their only reader); the header comment at `5-7` loses "tab, tabs". `.tab` and `.tabs` are the first two entries of the `DELETED` list of case L17 |
| `sw.js` | `8`, `ASSETS` after `23` | `v13`; `'js/shell.js'` |
| `tests/assets.test.js` | `17-18`, `109`, `129-190` | D43: `gear.html` loads 19 scripts; both start with `theory`, `note-palette`, `app`, `shell`; the head comparison stays; new static checks: between `<body>` and `<main>` and between `</main>` and the first `<script` both files hold nothing but white space; neither file contains `class="topbar"`; `js/shell.js` contains each of the thirteen ids of `needIds` (`:177`); the boot comparison (`:188-190`) stays |
| `tests/look.test.js` | | L12: a signature of `.topbar`, `#tabbar-m`, the two sheets and `.foot` (tag, id, classes, three levels deep, without the tabs, the link's text and the tag's text) is equal in `index.html` and `gear.html`, at 390 and 1200 px. L17 (new, and kept for the rest of the phase): the suite holds `DELETED`, the selectors that Phase B steps removed from `css/style.css`; in every page state of both apps `main <selector>` matches nothing |

`tools/artifact_build.py` is not edited: it strips `<body>` and keeps what is inside (`:27-33`), and its two
anchors stay (`:35`, `:37`).

#### B4.3 What must not change

Every id, class, attribute and text of today's shell and their order (`map-shell.md` section 2); that
`#panel-metronome` and `#panel-lights` exist before `boot()` runs its first loop (`js/app.js:1810-1824`); that
`#help-btn` exists when `js/help.js` initialises (`:266`, `:294`); that `<main>` exists when
`js/learn-instruments.js` mounts (`:41`); the script order rules of `tests/assets.test.js:112-119`.

#### B4.4 Stored state, docs

No key. `CLAUDE.md`: the `index.html` and `gear.html` layout entries ("the shell is built by `js/shell.js`; do
not put shell markup into the HTML files"), a layout entry for `js/shell.js`, the A3b rule "the shell markup
exists twice" marked as ended, `App.chromeTop`, `PAGE_LABELS`. Roadmap status: B4.

#### B4.5 Acceptance checks

```
grep -c 'class="topbar"' index.html gear.html                 # 0 and 0
grep -n "SPACE_LABELS\|noctx\|'\.tab'" js/app.js               # no hits
python3 tools/artifact_build.py <scratch>/artifact && grep -c "js/shell.js\|SL_ARTIFACT" <scratch>/artifact/index.html   # the tag is there, the flag is set
node tests/assets.test.js
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh look assets nav context-global gear smoke trim quiz taps storage-import
```

Proof of "no visible change": `tools/shots.js --measure` on base and branch gives equal box files for both
apps at 360, 390, 820, 901 and 1200 px in both themes (the 20 layouts of `map-shell.md` section 6), and the
`outerHTML` of the five shell parts, with white space collapsed, is equal on base and branch. Look at the
start page, the open dropdown and both sheets at 390 and 1200 px: identical to the base.

---

### B5a — Key bar: always shown, the same controls

**Waits for:** stop 2 and gate G1 (the owner's yes to `docs/design/phase-b/shell.html`).

**Goal (behaviour).** Key, tempo, Scale lock, LUMI lights and Help are on screen on every page of soundLAB, in
one bar under the header that stays when the header slides away (D16-D18); in Gear the same bar is folded
behind one header button (D14). The clef button and its dropdown are gone. Every control of the dropdown is in
the bar and does what it does today, except the time signature, which lives in the metronome sheet. New in the
bar: a Help chip (the level can now be set here as well as in the lights sheet and on the Piano page; B5b and
B12 remove those copies), and a message with the lock's sentence at every flip. The accent picker goes (D11).

**Commits, in this order:** (1) `App.colors.label` and the hoisted readers (a fix that stands alone); (2) the
accent picker out; (3) the bar replaces the dropdown: markup, wiring, styles, texts and suites in one commit,
because the checks that pin the dropdown cannot be green in between (`tests/nav.test.js:90-94` wants the bar
not displayed while closed, `tests/context-global.test.js:76` wants `#ctxbar` hidden after Escape).

#### B5a.1 Files modified

**The accent picker** (commit 2)

| File | Lines | Edit |
|---|---|---|
| `js/app.js` | `815-847` | `ACCENTS`, `applyAccent`, `setAccent` go; one line stays that removes inline `--accent`, `--accent-dim`, `--accent-glow` from `<html>` (nothing sets them any more) |
| `js/app.js` | `855` | the `applyAccent()` call in `applyTheme` goes |
| `js/app.js` | `2064-2066` | `setAccent`, `accent`, `ACCENTS` leave the public object |
| `js/settings.js` | `47-52`, `66-68`, `225-238` | the accent buttons, the row and its wiring go. In their place, only when `App.store.get('app.accent')` is `teal`, `violet` or `coral`: `<p class="muted small" id="set-accent-note">soundLAB 2.0 has one accent colour, amber.</p>` |
| `js/help.js` | `135` | the Settings tour says "theme" instead of "theme and accent color" |

**`js/shell.js`**

| Part | Edit |
|---|---|
| `.tb-tools` | `#ctx-btn` goes. In Gear only: `#cx-toggle` takes its place, a chip that names the key, with `aria-expanded` and `aria-controls="ctxbar"` |
| `#ctxbar` | moves out of `<header class="topbar">` to directly after it; `class="sl-keybar sl-skin"`, `role="region"`, the label stays "Global key, scale, tempo and sound settings". Children as in Appendix A: the five chips `#cx-key`, `#cx-tempo`, `#cx-lockchip`, `#cx-lights`, `#cx-help` and the five panels `#cx-pop-key` (`#cx-root`, `#cx-scale`, `#cx-mode-wrap` / `#cx-mode`), `#cx-pop-tempo` (`#cx-met`, `#cx-bpm-dec`, `#cx-bpm`, `#cx-bpm-inc`), `#cx-pop-lock` (`#cx-lock`, `#cx-lockhint`), `#cx-pop-lights` (`#cx-led`, `#cx-tnote`, `#cx-open-lights`), `#cx-pop-help` (`[data-cxhelp="4"]` … `"0"`, `.cx-colors` with `[data-cxcolormode]`). In Gear the bar starts with `hidden` |

**`js/app.js`**

| Lines | Edit |
|---|---|
| `76-93` `APPS` | each app names its bar: `keybar: 'bar'` (soundLAB), `keybar: 'fold'` (Gear) |
| `1092-1119` | `setCtx(which)`: `false` closes; `true` or `'key'`, `'tempo'`, `'lock'`, `'lights'`, `'help'` opens that panel and closes any other; it sets `aria-expanded` on the chip, class `ctx-open` on `<html>`, the panel's `hidden`, and moves the focus to the panel's first control. For a panel that is laid out in the bar (Tempo and Scale lock above 640 px) it only moves the focus. New `syncTier()`, run at start and by a `matchMedia('(max-width: 640px)')` listener: above 640 px `#cx-pop-tempo` and `#cx-pop-lock` never carry `hidden`; at 640 px and below they carry it unless open. In Gear `#cx-toggle` shows and hides the whole bar; an outside tap, Escape and a page change fold it again. `syncContextAvailability`: while `contextBlocked()` the bar is `inert` and has `aria-disabled="true"` (replaces disabling the clef). `ctxIsOpen` unchanged |
| `1141-1167` | `setBarHidden` also toggles class `bar-hidden` on `<html>`; the header's height is published as `--sl-topbar-h` on `<html>` by a `ResizeObserver`. Line `1163` stays: the header does not hide while a panel is open |
| `1328`, `1346`, `1560-1562` | `curRoot`, `curScale`, `curMode` move from inside `wireContextBar` to the module's scope. `App.colors.label` (`1344-1347`) calls `curRoot()`, which today exists only inside `wireContextBar` and throws in note mode (`map-shell.md` section 8, fact 8; nothing calls it yet, the key chip and the heroes will) |
| `1525-1758` | `wireContextBar` is rewritten around the same stores and events. Kept: the three option lists (`1534-1555`, `1564-1575`), `pushMusic` and the three change handlers (`1687-1706`), the tempo handler and its limits 30-280 (`1707-1714`), `#cx-met` (`1724-1747`), the mirrors (`1750-1754`). New: `paintKeyChip` (replaces `paintCtxBtn`, `1602-1608`: the chip reads "A Dorian", its `aria-label` "Key: A Dorian. Change key, scale and mode"; it also paints `#cx-toggle` in Gear); a table of short scale names (`SCALE_SHORT`: "Minor" for "Natural Minor (Aeolian)", "Min Pent", "Maj Pent", "Harm Minor", "Mel Minor", "Phryg Dom"; the others are short already), used where the full name does not fit; − and + step the tempo by 1 and repeat while held; `#cx-tempo` shows the number; `paintToggles` (`1662-1673`) writes `#cx-lockhint` in the longest form that keeps the bar's rows (`fitHint()`, run again when the bar's width or the key changes), the word "On" or "Off" in `#cx-lockchip`, the lights chip's value ("Scale", "Off", "No keyboard") and `#cx-tnote` (the display reason only); the click handler of `#cx-lock` (not `App.scaleLock.set`) calls `App.toast` with the sentence; `#cx-led` reads "LUMI lights"; `paintHelp` on `help:level` (dots, name, the pressed level); the colour group (`1645-1660`) is built in the Help panel with the labels "Degree" and "Note name". Gone: the clef's handlers (`1609-1640`; their outside-tap, Escape and focus rules move to the panels unchanged), the time-signature list, `showSig` and the `sig` handlers (`1557-1558`, `1579-1589`, `1715-1719`, `1755-1757`) |
| `1219-1221` `openSheet` | when the focus was inside the key bar, a closed sheet returns it to the chip whose panel was open (today: to `#ctx-btn`) |
| `2040` | `App.ctx(on)`: `on` may be `true`, `false` or a panel name |
| `2018-2067` | `App.chromeTop()` adds the key bar's `offsetHeight` where the bar is shown |

**Other files**

| File | Lines | Edit |
|---|---|---|
| `css/components.css` | | `.sl-keybar` (sticky, `top: var(--sl-topbar-h)`; under `html.bar-hidden` `top: 0` and `padding-top: env(safe-area-inset-top, 0px)`; the left and right safe-area insets always; `z-index: var(--sl-z-bar)`), the tiers of D17, `.sl-kchip`, `.sl-pop` (under its chip above 900 px, a bottom panel above the tab bar at 900 px and below, `z-index: var(--sl-z-pop)`), the two panels that are laid out in the bar above 640 px |
| `css/style.css` | `382-422`, `424-448`, `972-979` | the dropdown's rules go, and their selectors join `DELETED` (L17). `423` (`.scale-locked .pn-key…`) stays: `tests/lights.test.js:105` reads that filter |
| `js/lights.js` | `96`, `115-118` | "the key bar" instead of "the treble-clef menu" / "the clef menu" (the sheet's Help section stays until B5b) |
| `js/help.js` | `40`, `77`, `224-225`, `245` | the step on `#ctx-btn` points at `#ctxbar` ("The bar under the top row holds key, tempo, Scale lock, lights and Help; it is the same on every page"); the Woodshed tour's "treble-clef root and scale" becomes "the key bar's root and scale"; the fallback and the welcome name the key bar |
| `js/lumi-practice.js` | `183`, `340`, `378`, `428`, `480` | "in the key bar" for "in the treble-clef menu" / "in the clef menu" |
| `js/performance-player.js` | `219` | the same |
| `js/keylessons.js` | `575` | the lights chip's title names the key bar |
| `js/synthlive.js` | `328` | add `html.st-live #ctxbar` to the list Go live hides |
| `sw.js` | `8` | `v14` |

#### B5a.2 What must not change

The ids `cx-root`, `cx-scale`, `cx-mode`, `cx-mode-wrap`, `cx-bpm`, `cx-met`, `cx-led`, `cx-lock`, `cx-tnote`,
`ctxbar`, the class `cx-colors`, the attribute `data-cxcolormode` and exactly one element of each; native
`<select>` and `<input type="number">` for the fields (suites call `page.selectOption` and set `.value`); what
each control writes and emits (`fb.root`, `fb.scale`, `fb.mode` + `fb:set`; `met.bpm` + `tempo`; `scale.lock`;
`App.midi.setDisplayEnabled`; `App.help.set`; `App.colors.setMode`); that a sheet, a help tour or a modal dialog
blocks the bar (`js/app.js:1096-1101`); that Back and the pedal close an open panel first (`js/app.js:1381`,
`:1406`); the status sentences of `js/midi.js:448`; the lights sheet with its Help section and colour switch;
`#pn-assist`.

#### B5a.3 Stored state

None new. `met.sig` is still written by the metronome sheet. `app.accent`: no reader, no writer; left as it
is. No migration.

#### B5a.4 Tests

| Suite | Change |
|---|---|
| `context-global` | rewritten, same name, the 14 pages and Settings × 1440 and 390 px. Per page: the bar is visible, inside the window, in one row, each of its controls at least 44 px high (buttons also wide), one copy of each id, the Key chip names the key. Once: Enter on `#cx-key` opens the panel and focuses `#cx-root`; Escape closes and returns the focus to the chip; a tap outside, a page change and the focus leaving close it (the focus check moves the focus to `#met-btn`, which is in the header at every width); all five choices update the shared services and survive a reload; **the lock's state can be read as a word without opening anything**: at 1440 px `#cx-lockhint` is displayed and holds the scale's name and "only", or "every note sounds"; at 390 px the chip's text is "On" or "Off", a real tap opens `#cx-pop-lock` with the switch and the full sentence, and a flip there shows the sentence in `#app-toast`; with the key at "Natural Minor (Aeolian)" on C♯ the bar is still one row without sideways scroll at 360 and at 1024 px; with LUMI lights on and no hardware `#cx-tnote` says where to choose an output and no MIDI permission is asked; a sheet and the help tour (opened with `Help.open(App.active)`) make the bar `inert` and a real tap cannot reach a chip; contrast 4.5:1 for the chips' texts and the three fields in both themes. The clef checks (`21-31`, `63-78`, `97-111`, `120-121`, `137-138`) are replaced by these, one for one where an equal exists |
| `nav` | `86`: `#cx-met` is clicked in the bar, without opening anything. `89-114` "clef dropdown" becomes "key bar": shown at the start on desktop; the tools' order is `help-btn,settings-btn,lights-btn,met-btn` (`92-94`); the Key chip's label names the key (`94`, `100`, `112`); picking a scale keeps the panel open; a tap outside, the chip again, Escape and a page change close the panel. `141-145`: on a phone the Key panel has the gutter token's 16 px to both edges and Back closes it |
| `gear` | `172-177` (the helper `setKey`): a real click on `#cx-toggle`, a real click on `#cx-key`, then the two selects and Escape; `347` and `359` are reworded ("the key bar in Gear writes the key to the store"). `465-504`: the four-page matrix: the bar is folded at the start, `#cx-toggle` names the key and opens it, then as in `context-global`. `638-642`: `#cx-toggle`, then `App.ctx('lights')`, instead of the clef click; `654`, `664` unchanged in text. New: with the bar folded no chip can be reached by a real tap |
| `quiz` | `343-356`: the bar is displayed on Exercises and on the neck (was: the clef). `358-366` unchanged (D18) |
| `lights` | `62-67` unchanged (`App.ctx(true)`, `#cx-led`). `95`, `114`: the sentence is read from `#cx-lockhint` and matches `/only C Major notes sound/` |
| `display-master` | `80`: the label matches `/LUMI lights/` |
| `colors` | `84-91`: labels `Degree,Note name`; still one `.cx-colors` |
| `taps` | `24`: `r.top < 120` becomes `r.top < App.chromeTop()` (D42) |
| `storage-import` | `434`, `451`: the key's name is read from `#cx-key` and the tempo from `#cx-bpm` (the chip names no tempo; today both come from the clef's title) |
| `assets` | the id list in `js/shell.js`: `ctx-btn` out, `cx-key`, `cx-help` in |
| `look` | the bar joins `RESKINNED`. New, with real input: at 360, 390, 640, 641, 820, 1024 × 640 and 1200 px a tap on each chip that is displayed opens its panel inside the window; the bar is still at the top after a wheel scroll of 500 px; with a panel open L1 holds; in Gear the bar is not displayed until `#cx-toggle` is pressed; L12 lists `#cx-toggle` as the Gear-only part |
| re-run only | `lumi-contexts` (`99-102`), `lumidisplay`, `remote` and the other `remote-*` suites (the pedal closes a panel), `practice` (Back), `game`, and the suites that flip the lock (`sound-lock`, `pitch-lock`, `midihub-lock`: a flip by `App.scaleLock.set` shows no message; `context-global:81` and `lights:93`, `:110` click `#cx-lock` and do not read the toast) |

#### B5a.5 Docs

`CLAUDE.md`: the context-bar convention is rewritten as "KEY BAR" (always shown in soundLAB, folded in Gear,
five chips and five panels, `App.ctx`, what blocks it, the message at a flip), QUIET CHROME (the header hides,
the bar stays), the `js/app.js` and `js/settings.js` layout entries (accent). `docs/NOTE-PALETTE.md` and
`docs/LUMI-PRACTICE.md`: "key bar" for "clef menu". `docs/DESIGN-SYSTEM.md`: the bar as built. Roadmap status:
B5a.

#### B5a.6 Acceptance checks

```
grep -rn "ctx-btn\|cx-sig" js css                                                    # comments about the icon aside, no hits
grep -rni "clef" js | grep -v "bass-clef\|treble clef\|clef:"                          # read what is left: only staff wording (js/quiz.js, js/fretboard.js:1116-1139, 1769) and the icon's comment
grep -n "setAccent\|ACCENTS" js/*.js                                                 # no hits
for id in cx-root cx-scale cx-mode cx-bpm cx-met cx-lock cx-led cx-tnote cx-lockhint; do grep -c "id=\"$id\"" js/shell.js; done   # 1 each
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh context-global nav gear quiz lights display-master lumi-contexts colors storage-import look assets taps sound-lock pitch-lock
```

Look at, on Exercises, Piano, Neck and Settings in soundLAB, dark and light: 360 px (five chips in one row, a
long scale name shortened, the lock's chip reads "On", nothing touches the edges), 390 px, 640 and 641 px (the
tier change: no control is lost or doubled), 820 px (up to two rows, the full sentence), 1024 × 640 (one row,
the sentence in a form that fits), 1200 px, 1280 px (labels and the full sentence). Each panel open at 390 px
(above the tab bar, 16 px gutters) and at 1200 px (under its chip, inside the window). The message after a flip
of the lock, at 390 and 1200 px. The bar after scrolling down (at the top edge, the header gone) and after
scrolling up (under the header, no jump). The bar behind an open sheet (dimmed, not tappable). In Gear on the
Deck: the bar folded (the header's chip names the key), open, and Go live (no bar). The Scale lock on and off:
fill, knob position and the words differ. Settings › Look without the accent row, and with the sentence for a
stored teal. Not checked by any suite and left to the owner's devices: the bar under the status bar of an
installed iPad or phone app with the header slid away.

---

### B5b — Help level and colour switch are set in the bar only; the sheet is "Keyboard lights"

**Goal (behaviour).** The Help level and "Color notes by" each exist once in the shell: in the key bar's Help
panel. Their copies leave the lights sheet, which is called "Keyboard lights" from here on. The two buttons
that opened the sheet to change the Help level open the bar's Help panel instead. (The Piano page's copy goes
in B12, the Neck's colour copy in B13.)

#### B5b.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/shell.js` | sheet `lights` | title and labels read "Keyboard lights" (`index.html:44`, `:76`, `:77` as they were); `#cx-open-lights` reads "Keyboard lights" |
| `js/lights.js` | `41-49`, `77-87`, `146`, `150` | the Help section and the colour switch leave the sheet; the sheet starts with "Keyboard lights" and one line that says where the two went ("Help level and note colours are in the bar at the top") |
| `js/help.js` | `39`, `126-128` | the Fretboard tour says "Color notes by (in the key bar under Help, or in the Fretboard's settings)"; the `lights` tour's title, its first step, and the colour words "Degree" and "Note name" in its second |
| `js/keylessons.js` | `569`, `775` | the lesson's "Help: …" button opens the key bar's Help panel (`App.ctx('help')`) instead of the sheet |
| `js/practiceplan.js` | `306`, `319` | the button `#pp-help` reads "Help level" and opens the key bar's Help panel instead of the sheet |
| `js/settings.js`, `js/scoreplayer.js`, `js/midihub.js` | `171`; `569`; `732`, `741` | the words "Lights & help" become "Keyboard lights" (two of the three files are also Gear's: a text, not a style) |
| `sw.js` | `8` | `v15` |

#### B5b.2 What must not change, stored state

Everything else in the sheet: on / off, LUMI colours and their swatches `.lc-deg`, brightness, keyboard type,
status `.lc-status`, range, test, the hands-free row `#lc-remote`; `App.help` and `App.colors`; the key bar of
B5a. No stored key changes.

#### B5b.3 Tests

| Suite | Change |
|---|---|
| `lights` | `216-225`, `239-240`: the check "one Help level: set in the sheet, the Keys page follows; set on the Keys page, the sheet follows" becomes "set in the key bar (`[data-cxhelp="3"]` after `App.ctx('help')`), the Keys page follows; set on the Keys page, the bar's chip follows"; `.lc-desc` and `.lc-help .active` are gone and the level's sentence is read from the Help panel; `.lc-status` is still read from the sheet |
| `colors` | `120-143`, `307-314`, `354-357`: the switch is used in the Help panel (`[data-cxcolormode]`); the checks "the sheet opens over the fretboard with an Interval / Note seg" (`142`) and "the sheet mirrors it" (`314`) become "the sheet shows the swatches of the mode chosen in the bar"; `354-357` (the seg sits in the sheet's first section) is deleted with a sentence: the seg is gone on purpose |
| `gear` | `660`: `/Keyboard lights/` |
| `look` | the lights sheet in its new content; L5 for the `lights` tour |
| re-run only | `display-master`, `lumidisplay`, `lumi-contexts`, `keys` (`78` still reads `#pn-assist`), `remote-plan`, `practiceplan`, `remote-keys`, `nav` |

#### B5b.4 Docs, acceptance checks

`CLAUDE.md`: HELP LEVEL (set in the key bar; the Piano page's copy until B12), the `js/lights.js` layout
entry. Roadmap status: B5b.

```
grep -rn "Lights & help\|Lights &amp; help" js                    # comments aside, no hits
grep -n "data-lchelp\|data-lccolmode" js/lights.js tests/*.js     # no hits
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh lights colors gear display-master lumidisplay keys practiceplan remote-plan remote-keys look nav
```

Look at, dark and light, at 390 and 1200 px, in both apps: the Keyboard lights sheet (what is left reads as one
thing: the keyboard); the Help panel beside it; the Plan page's "Help level" button and the lesson's "Help: …"
button each opening the panel.

---

### B6 — Header and navigation

**Waits for:** gate G2 (the owner's yes to the header in `docs/design/phase-b/shell.html`).

**Goal.** The header, the two tab bars and the pill strip take the new look (D19, D20), and the page's ground
and gutters with them. **Behaviour:** the wordmark is a link to the app's home page; the keyboard-lights button
says its state in words; at 640 px and narrower four header tools sit behind one "More" button; soundLAB's tag
beside the logo reads "beta" at the beta address and is gone at the live one (the footer still names the
version). Pages, groups and ids do not change. In both apps the ground under the pages becomes the stage colour
(D13).

#### B6.1 Files modified

**`js/shell.js`** (the header; the lines are where the markup sits in `index.html` today)

| Part | Edit |
|---|---|
| `<header class="topbar">` (`20`) | also class `sl-skin` |
| `.brand` (`21-37`) | becomes `<a class="brand" id="home-link" href="index.html">` (Gear: `gear.html`) with `aria-label="soundLAB, home"`; the SVG is unchanged; the `.tag` (`36`) reads "gear" in Gear and "beta" in soundLAB at the beta address (the flag `STORE_BETA`, `js/app.js:564`, handed to the shell), and is not written otherwise |
| `#tabbar` (`38`) | unchanged; the icons are hidden by CSS above 900 px (text tabs) |
| `.tb-tools#tabs` (`39-46`) | children in this order: `#tb-more-btn` (new: `aria-expanded`, `aria-controls="tb-more"`, label "More"), `<div id="tb-more">` holding `#lights-btn`, `#help-btn`, `#settings-btn`, `#app-switch` (the same four elements with today's ids and attributes), then `#met-btn`. Above 640 px `#tb-more` is `display: contents` and `#tb-more-btn` is not displayed, so the row reads: status, help, settings, the link across, metronome. At 640 px and below `#tb-more` is a `.sl-pop` panel that lists the four with their words, and the row reads: More, metronome |
| `#lights-btn` (`44`) | content becomes a dot, the keyboard's short name and the state (`.sl-status-dot`, `.sl-status-name`, `.sl-status-text`); the painter writes its `aria-label` |
| `#subnav` (`60`), `#tabbar-m` (`62`) | also class `sl-skin` |

**`js/app.js`**

| Lines | Edit |
|---|---|
| `961-973` `paintSubnav` | the open pill also gets `aria-current="page"` |
| beside `1881-1892` | new: a plain click on `#home-link` calls `preventDefault()`, `switchTo(HOME)` and scrolls to the top (with a modifier key it stays a link) |
| beside `1881-1892` | new `paintStatus()`: writes `#lights-btn` from `App.midi` ("LUMI · On", "LUMI · Off", "Keyboard · On" for another output, "No keyboard") and the label "Keyboard lights: LUMI, on. Open Keyboard lights". It runs on `midi:state`, `lights:led` and `lights:display-enabled`, three of the events `paintToggles` already listens to (`1682`). The dot is filled while a keyboard is connected; the words carry the state |
| beside `1881-1892` | new: `#tb-more-btn` opens and closes `#tb-more`; a choice, a tap outside, Escape and a page change close it |
| `1379-1392` `backStep` | an open More panel closes first (one line beside `1381`) |
| `1211-1255` | unchanged: `#lights-btn` and `#met-btn` still get class `active` and `aria-expanded` while their sheet is open |
| `1486-1491` `wireSheets` | the icon is written only into `#met-btn`. Today the loop does `b.innerHTML = icon(name, 18)` for every sheet button at start (`1490`): it would wipe the dot, name and state that `paintStatus` writes into `#lights-btn`, and in B8 it would empty `#inst-btn`, because no icon is called `instrument` (`icon()` returns `''` for an unknown name, `280-282`) |
| `936-947` `populateNav` | the Learn tab's button gets `<span class="sl-goal-sr">, today's goal is open</span>`, which only a screen reader gets and only while `<html>` has class `goal-due` |
| `853-855` `applyTheme` | one pair of browser-bar colours for both apps again, `#f5f1ea` / `#0f0d10` (B2 kept Gear's) |

**Other files**

| File | Lines | Edit |
|---|---|---|
| `js/help.js` | `266-276` | the hand-drawn SVG is replaced by `App.icon('help', 20)`; class `hp-pulse` and the click stay |
| `js/app.js` `ICONS` | `233-287` | two icons from lucide-static: `more` (ellipsis) and `caret` (chevron-down) |
| `css/components.css` | | the header (`.sl-skin.topbar`), the text tabs with the underline for the open one, the bottom tab bar, the pills as chips (with the narrow phone style that `js/practiceplan.js:350` holds today), the status chip, the More panel, **the goal mark on the Learn tab** (`.goal-due .tabbar-btn[data-group="gtheory"]::after`, in both bars) with its screen-reader words; sizes as drawn in `docs/design/phase-b/shell.html`. **The ground:** `html, body { background: var(--sl-bg) }` in both apps (they are outside `<main>`; today's amber glow in the corner goes). **The page's frame, soundLAB only** (`:root:not([data-app="gear"]) main` and `.foot`): the side gutters are `var(--sl-gutter)`, 16 px, on phones, and the footer is drawn from tokens; Gear's `main` keeps `css/style.css:455-459` and `:990` |
| `css/style.css` | `111-113`, `161-287`, the `.tb-tools .icon-btn` half of `289`, `290-299`, `340-380`, and inside the 900 px and 640 px blocks (`910-971`) every rule that names `.topbar`, `.brand`, `.tabbar`, `.tb-tools`, `.subnav` or `.subtab` | these rules go and their selectors join `DELETED` (L17). **Line `288` stays**: `.icon-btn { display: inline-flex; … }` is a shared class like `.btn`, and two buttons of Gear's Deck carry it (`js/synthtab.js:115`, `:148`; D13). The `.sheet-head .icon-btn` half of `289` stays until B7a. The goal mark (`267-279`, `949`) is not lost: it is rebuilt in `css/components.css` in this step |
| `js/practiceplan.js` | `350` | the rule `#subnav:has(.subtab[data-page="practiceplan"]) .subtab{…}` goes: a page module should not style the shell, and its id selector would beat every rule of `css/components.css`; the pill component has the narrow style for every group |
| `index.html`, `gear.html` | `6` | `content="#0f0d10"` (both files, one commit, rule 9) |
| `sw.js` | `8` | `v16` |

#### B6.2 What must not change

The ids `tabbar`, `tabbar-m`, `subnav`, `tabs`, `app-switch`, `help-btn`, `settings-btn`, `lights-btn`, `met-btn`;
the classes `topbar`, `brand`, `tb-tools`, `tabbar-btn`, `subtab`, `active`; `data-group`, `data-page`;
`aria-current="page"` on the open tab; `#app-switch` as an `<a>` with its `href`, text and label
(`tests/nav.test.js:38`, `tests/gear.test.js:386`); five tabs fixed along the bottom in one row at 900 px and
below (`tests/nav.test.js:138`); the metronome in the corner (`:139`); a tap on the open tab scrolls to the top;
`.topbar` gets `bar-hidden` on scroll down; `#tabbar-m` stays outside `<header>`; each group remembers its last
page (`app.gtab.<gid>`, `js/app.js:949-959`); Gear's tag reads "gear" and both footers are unchanged
(`tests/gear.test.js:227`).
The mark on the Learn tab is shown while `<html>` has class `goal-due` and not otherwise (`js/xp.js:30`). Inside
`<main>` of Gear nothing changes (L16); inside `<main>` of soundLAB only the gutters do.

#### B6.3 Stored state

None.

#### B6.4 Tests

| Suite | Change |
|---|---|
| `nav` | `92-94`: the order of the tools is read from `.tb-tools [id]` and is `tb-more-btn, tb-more, lights-btn, help-btn, settings-btn, app-switch, met-btn`. `130-139` keep their meaning (five tabs along the bottom, logo and tools in one row, the metronome in the corner). New at 390 px, with real taps: More is shown, opens a panel inside the window with four entries that have words, "Settings" opens Settings and closes the panel. New at 1200 px: More is not displayed and the four tools are; a real click on the wordmark from Piano ends on the home page at scroll 0. New: at a `/next/` address the tag reads "beta" (the suite's server answers the same files under that path, or the flag is set through the shell's own argument: the step picks one and says which) |
| `gear` | `124-134` (`__head`): at 640 px and below the link counts as seen after More was opened; `inside`, `apart` and `fits` as before. New: Gear's wordmark goes to the Deck. `392`, `406`, `412`, `416`, `724`, `749` (real clicks on the link and the gear) run at 1200 px and are not edited |
| `lights` | new, with its fake LUMI: the header chip reads "LUMI" and "On", then "Off" after `App.midi.setDisplayEnabled(false)`; with no MIDI it reads "No keyboard" |
| `assets` | the id list of `js/shell.js` gains `home-link`, `tb-more-btn` |
| `look` | header, tab bars and pills join `RESKINNED`. At 360, 390, 640, 641, 820, 900, 901, 1024 and 1200 px in both apps: one header row, the wordmark and the tools do not overlap, every tool is 44 px (48 on touch), the Learn pills share one row. With `goal-due` set, the Learn tab's `::after` has a size at 390 and at 1200 px, and the tab's accessible name holds "goal". In both apps `body`'s background is the resolved `--sl-bg`. In soundLAB at 390 px the first card of every page starts 16 px from the left edge. `DELETED` gains this step's selectors (L17), and L16 still passes: Gear's `#st-explain` is `display: flex` |
| `game` | `374`: beside the class on `<html>`, the dot is checked where it is drawn (the Learn tab's `::after` has a width). `274-278` re-read |
| re-run only | `quiz` (`52-58`, `358-366`), `practiceplan` (`404-415`: four pills on one row at 360 px, now by the component's rule), `context-global` (B5a wrote its focus check with `#met-btn` and opens the tour with `Help.open`, so it does not need `#settings-btn` or `#help-btn` to be displayed at 390 px, where they are inside More from this step on), `practice` (`112`), `taps`, `smoke`, `trim` |

#### B6.5 Docs

`CLAUDE.md`: SECTION TAB BAR (text tabs above 900 px, More, the wordmark, the status chip), QUIET CHROME.
`docs/DESIGN-SYSTEM.md`: the header as built. Roadmap status: B6.

#### B6.6 Acceptance checks

```
grep -n "\.tabbar\|\.subnav\|\.subtab\|\.tb-tools\|\.brand" css/style.css      # no hits: the shell's rules are in css/components.css
grep -n "^\.icon-btn" css/style.css                                            # 1 hit: the shared rule stays
grep -n "subnav" js/practiceplan.js                                            # no hits
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh nav gear lights context-global look assets quiz practiceplan taps game practice
```

Look at, in both apps and both themes, at 360, 390, 640, 641, 820, 900, 901, 1024, 1200 and 1440 px: one row;
the wordmark never touches the first tool; the open tab is marked by an underline and weight, not by colour
alone; the bottom bar has icon over label and marks the open tab the same way; the open pill is filled. The
More panel open at 360 px (four rows with words, inside the window). The status chip with a LUMI, with another
keyboard and with none. In light: the header's surface against the page. Gear's "gear" tag beside the logo.
The Learn tab with the goal open and met, in both bars. The header at a `/next/` address ("beta"). Gear's Deck
and Hub on the new ground, dark and light: the cards are as before, only what lies between them is darker.

---

### B7a — Sheets

**Goal.** Sheets dock on the right above 900 px and rise from the bottom at 900 px and below (D24), and the
bodies of the two sheets are drawn from tokens and components. What opens, closes and blocks a sheet does not
change; nothing a tap does changes.

#### B7a.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/shell.js` | sheets (`index.html:63-82`) | `.sheet-card` also gets class `sl-skin`; nothing else. The bodies stay `<section class="sheet-body" …>` |
| `js/metronome.js` | `83-122`, `124-182` | CSS from tokens and component classes; the markup keeps every id |
| `js/lights.js` | `180-194` | the same |
| `css/components.css` | | `.sheet` (a panel 440 px wide on the right, full height, above 900 px; a bottom sheet at 900 px and below; `z-index: var(--sl-z-sheet)`), the scrim, the sheet's head with its two 44 px icon buttons |
| `css/style.css` | the `.sheet-head .icon-btn` rule left from `289`, `301-338`, `838-859`, `981-989` | the sheet and metronome-dot rules go; their selectors join `DELETED` |
| `sw.js` | `8` | `v17` |

#### B7a.2 What must not change, stored state

`#sheet-<name>` is open when it is not `hidden`; `.sheet-card`, `.sheet-body`, `[data-sheet-close]`; the scrim,
Escape, the X, Back, the pedal and the icon close a sheet; Tab stays inside (`js/app.js:1852-1871`); `App.active`
does not change while a sheet is open; the click keeps running after the metronome sheet closes; `#met-btn`
pulses on the beat; `App.sheet`; the event `sheet` `{name, open}` (the Exercises answer clock pauses on it).
The one closing click a suite makes stays on the scrim: `tests/nav.test.js:71` clicks at x = 15, and the panel
covers x from 840 px in a 1280 px window. No stored key.

#### B7a.3 Tests

| Suite | Change |
|---|---|
| `nav` | `149-151` unchanged (a 390 px wide bottom sheet). New at 1200 px: the sheet card's right edge is the window's, its width 440 px, its height the window's. New at 900 and 901 px: bottom sheet, side panel |
| `look` | both sheets join `RESKINNED`; the X and the ? of each sheet are 44 px (48 on touch) |
| re-run only | `smoke`, `game`, `quiz` (the answer clock under a sheet), `gear` (`643-664`), `lights`, `colors`, `remote` (the pedal closes a sheet), `context-global`, `taps` |

#### B7a.4 Docs, acceptance checks

`CLAUDE.md`: OVERLAY SHEETS (side panel, 900 px). `docs/DESIGN-SYSTEM.md`: the sheet as built. Roadmap status:
B7a.

```
grep -n "\.sheet" css/style.css                           # no hits
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh nav look smoke game quiz gear lights remote context-global taps
```

Look at, both themes, both apps: the metronome and the Keyboard lights sheet at 390, 820, 900, 901 and 1200 px
(bottom sheet with a visible top edge and no content under the home indicator; side panel with the page still
readable beside it); the sheet over Piano with the keyboard still in view at 1200 px.

---

### B7b — Messages, the help tour, the pedal confirmation

**Goal.** Messages are one component in one stack (D25). The help tour, the welcome, the pedal confirmation and
the update banner are drawn from tokens and components, and the layer tokens are in use (D10).
**Behaviour:** messages no longer cover each other and are no longer hidden behind a bottom sheet; the tour is
announced as a dialog and takes the focus, and a step whose target sits in a closed fold opens that fold (D26).

#### B7b.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/shell.js` | last element of the shell | new: `<div id="sl-float" class="sl-skin"><div id="sl-toasts" class="sl-toasts"></div></div>` |
| `js/app.js` | `2002-2016` `toast` | `#app-toast` is created inside `#sl-toasts` (inside `<body>` when the stack does not exist); id, `role="status"`, the `hidden` contract and `textContent` stay; also class `sl-toast` |
| `js/app.js` | `181-183`, `1454-1459`, `1789` | `#app-update`, `#back-hint`, `#snd-hint` are created inside the stack, with class `sl-toast` |
| `js/audioin.js` | `197-199` | the same for its copy of `#snd-hint` |
| `js/quiz.js` | `2887-2895` | `#xp-toast` is created inside the stack |
| `js/xp.js` | `78` | `#lesson-progress-unsaved` is created inside the stack (class `sl-toast sl-toast-bad`), with its id and buttons |
| `js/remote.js` | `218-232`, `388-398` | the confirmation's CSS uses tokens and `var(--sl-z-toast)`; its element gets class `sl-skin`; its place (38 % from the top) and width rule stay (`tests/remote.test.js:196-205`) |
| `js/help.js` | `253-264`, the tour and welcome builders (`223-250`) | CSS from tokens, `var(--sl-z-tour)`. The layer `#hp-ov` gets class `sl-skin` (it is appended to `<body>` and built from `card`, `btn sm primary`, `row spread`, `muted small`: `187-196`, `228-232`), `role="dialog"`, `aria-modal="true"` and `aria-labelledby` (the card's title); on open the focus goes to the card's main button, Tab stays in the card, on close the focus returns to where it was. Texts unchanged |
| `js/help.js` | `162-181` `renderStep` | new helper `reveal(target)`, also `Help.reveal` for the suites: before a step is shown every closed `<details>` that contains its target is opened; they are closed again when the step is left or the tour ends. A fold opened this way is not stored in `ui.folds` |
| `css/components.css` | | `.sl-toasts` (a fixed column above the tab bar, as wide as the screen minus the gutters on phones, at most 460 px elsewhere, `z-index: var(--sl-z-toast)`), `.sl-toast` and its variants, `.sl-empty`, `.sl-loading`, the error box (`:where(.sl-skin) .error`) |
| `css/style.css` | `867-905`, `952` | the message and banner rules go; their selectors join `DELETED` |
| `sw.js` | `8` | `v18` |

#### B7b.2 What must not change, stored state

`#app-toast` (12 suites read its text); `#back-hint`'s sentence (`tests/gear.test.js:734`,
`tests/practice.test.js:123-124`); `#snd-hint` can be tapped and starts the sound; how long each message stays;
the event `tour` `{open}` (the Exercises answer clock pauses on it); the tour's texts and the 40 selectors;
everything B7a lists. No stored key.

#### B7b.3 Tests

| Suite | Change |
|---|---|
| `look` | tour, messages and the pedal confirmation join `RESKINNED`. The suite gets `BODY_LEVEL`, the list of what may sit on `<body>` beside the shell, `<main>` and scripts: `#hp-ov`, the pedal confirmation, `#sl-float`; any other child of `<body>` fails the case, and each listed one is inside or is a `.sl-skin` container (rule 12). New: two messages shown together do not overlap; a message shown while a bottom sheet is open is on top of it (`elementFromPoint` at its centre); at 360 px a message is at least 300 px wide; the tour layer has `role="dialog"` and the focus is inside the card; Tab does not leave it; `Help.reveal` on `#pn-lumi-body` opens the closed section `#pn-lumi` on the Piano page and the function it returns closes it again |
| `remote` | `196-205` unchanged |
| `instrument-xp` | re-run: it reads `#lesson-progress-unsaved` (`67-76`) |
| re-run only | `smoke`, `game`, `quiz` (the answer clock under a tour), `remote-quiz` (`65-66`), `remote-keys` (`430`), `gear` (`643-664`, `797`), `practice`, `update`, `audioin`, `trim`, `storage-import` |

#### B7b.4 Docs

`CLAUDE.md`: `App.toast` (the stack), LATENCY RULES unchanged, the layout entries of `js/help.js` and
`js/remote.js`, the body-level rule. `docs/DESIGN-SYSTEM.md`: message, tour, empty / loading / error as built.
Roadmap status: B7b.

#### B7b.5 Acceptance checks

```
grep -n "z-index" css/style.css                           # only Gear-page rules are left, none of the shell
grep -n "z-index:[0-9]" css/components.css                # no hits: layers are tokens
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh look remote smoke game quiz gear practice instrument-xp update taps
```

Look at, both themes: a message alone, two together, a message over an open bottom sheet, the update banner
with its button, the "not saved" box. The tour's card on a target near the top, near the bottom and behind the
key bar. The pedal confirmation at 375 px with a long label. An empty Songs list and a failed module box.

---

### B8 — Instrument chip

**Goal (behaviour).** The instrument is shown and changed from the header on every page of soundLAB: a chip
that names it and opens a third sheet, "Instrument" (D23). The bar above the four Learn pages goes. The seven
categories, their ids, the stored choice and the event do not change. Gear has no chip.

#### B8.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/shell.js` | `.tb-tools`; after the lights sheet | soundLAB only: `#inst-btn` (`class="sl-kchip"`, `aria-haspopup="dialog"`, `aria-expanded`) as the first child of `.tb-tools`, shown at every width; `#sheet-instrument` with a `.sheet-card.sl-skin`, the title "Instrument", the X and `<section class="sheet-body" id="panel-instrument">`. The body must not have class `panel`: `.panel` is `display: none` unless it is the open page (`css/style.css:461-462`), and the sheet would open empty |
| `js/app.js` | `1211` `SHEETS` | in soundLAB also `instrument: 'inst-btn'`. `PANEL_ORDER` (`111`) is not changed: the sheet's content is mounted by `js/learn-instruments.js` and no module is registered for it (`openSheet` copes: it asks `modules[name]` first, `1231`). `wireSheets` writes no icon into the chip (B6) |
| `js/learn-instruments.js` | `39-53` `mount` | the section `#learn-instruments` is mounted into `#panel-instrument` instead of the top of `<main>` (`53`); same ids inside: `learn-instrument`, `learn-instrument-links`, `learn-instrument-note`, `learn-instrument-session`. The `<select>` lists Piano, Guitar, Bass, Drums, then an `<optgroup label="More">` with Synth, Voice, Other (seven options, same values) |
| `js/learn-instruments.js` | `43-44` | CSS from tokens; the rules that placed the bar above a page go |
| `js/learn-instruments.js` | `75-83` `refresh` | line `77` (hide the bar off the Learn pages) goes; new: writes `#inst-btn`: the instrument's icon and label, from 1100 px up the small label "Practising" above it, and "Practising: Piano. Change instrument" as its name; while an Exercises run is on, the chip shows a lock mark and the sheet shows the sentence and `#learn-stop-exercise` as today (`82`) |
| `js/learn-instruments.js` | `55-73` | unchanged; an entry button changes the page, which closes the sheet (`js/app.js:1026-1079`) |
| `js/learn-instruments.js` | `10` | the `PAGES` list goes with its only use |
| `js/help.js` | `84` | the tour step points at `#inst-btn` |
| `css/components.css` | | the chip in the header (`.sl-kchip`), the sheet's rows |
| `sw.js` | `8` | `v19` |

Icons for the chip: `keys` (Piano, Synth), `guitar` (Guitar, Bass), `drum`, `mic` (Voice), `note` (Other); all
exist (`js/app.js:233-287`).

#### B8.2 What must not change

`App.practiceInstrument` / `App.learnInstruments` and every member (`js/learn-instruments.js:84-90`); the stored
choice; the event `learn:instrument`; that a run keeps the instrument it started with and the select is disabled
during a run; the texts of the notes and of the entries; what each entry opens.

#### B8.3 Stored state

None new.

#### B8.4 Tests

| Suite | Change |
|---|---|
| `learn-instruments` | a helper `pick(page, id)`: real click on `#inst-btn`, `page.selectOption('#learn-instrument', id)`, close; it replaces the bare `selectOption` at `34`, `44`, `59`, `76`, `88`, `93`, `120`. `48-49` read the note and the links with the sheet open. `55-57`: the sheet is open; `#learn-stop-exercise` is visible in it; after the click the select is enabled. `81-86` become: on all 15 pages `#inst-btn` is visible and names the instrument, and `#learn-instruments` is not displayed until the chip is pressed (the old check "the bar stays scoped to Learn pages" has lost its meaning: the chip is on every page on purpose). `89`, `94-96`, `114`, `121`: the entry is clicked in the open sheet; new: the sheet is closed afterwards. `198-202`: at 390 px the chip is visible, the open sheet is a bottom sheet and nothing scrolls sideways |
| `nav` | the tools' order (`92-94`) starts with `inst-btn` in soundLAB |
| `gear` | new: `#inst-btn` and `#sheet-instrument` do not exist in Gear |
| `look` | the Instrument sheet joins `RESKINNED`; L12 (one shell) lists `#inst-btn` and `#sheet-instrument` as the two soundLAB-only parts; at 360 px the header row holds wordmark, chip, More and metronome without overlap |
| `quiz` | new: the answer clock does not tick while the Instrument sheet is open (the `sheet` event) |
| re-run only | `remote-plan`, `practiceplan`, `instrument-xp`, `taps` (the Learn pages lost 116 px at the top, `map-pages-learn.md` section 3), `remote` (the pedal closes the sheet) |

#### B8.5 Docs

`CLAUDE.md`: the `js/learn-instruments.js` layout entry, OVERLAY SHEETS (a third sheet), the section-tab-bar
convention. `docs/LEARN-INSTRUMENTS.md`: where the choice is made. `docs/INSTRUMENT-MATRIX.md`: the cell "where
the instrument is chosen". Roadmap status: B8.

#### B8.6 Acceptance checks

```
grep -n "insertBefore(bar" js/learn-instruments.js        # no hits
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh learn-instruments nav gear look quiz taps remote-plan practiceplan instrument-xp
```

Look at, dark and light: the header with the chip at 360, 390, 820 and 1200 px for "Piano" and for the longest
label, and on the Keys tab while it reads "Guitar" (does "Practising" make clear what the chip means?); the sheet at 390 px (bottom) and 1200 px (side) for Piano, Bass and Drums; the sheet during an Exercises
run (sentence and button, the select greyed with a reason); Exercises, Chords, Circle and Plan at 390 × 844
without the bar: on Exercises the question, its answers and the footer button are on screen without scrolling.

---

### B9 — Home

**Waits for:** gate G3 (the owner's yes to `docs/design/phase-b/home.html`: the placement, the headline, the
instrument).

**Goal (behaviour).** A new page, `home`, is the app's home (D20-D22). It shows the next step as one headline,
one button whose words say what a tap does, the instrument with the scale of the key bar's key, and one footer
line, built only from numbers stored today. A fresh profile, an unknown page id and Back end on it; profiles
that exist land on it once. This section is written for placement B (the home outside the tab groups); B9.8
says what changes if the owner picks A or C.

#### B9.1 Files added

| File | Content |
|---|---|
| `js/home.js` | registers page `home` (`init`, `onShow`, `onRemote`); its CSS through `App.injectCSS`, tokens only; the panel carries `sl-skin`. `App.home = { provide(id, fn, order), steps(), refresh() }`. A provider returns nothing or `{ id, eyebrow, title, detail, minutes, action, start() }`; `action` is the button's words and may be "Start" only if `start()` begins a run. The first step is the headline; the others and the instrument's entry points (`App.practiceInstrument.entries()`) are in the fold "Something else" |
| `tests/home.test.js` | browser, B9.5 |

**The built-in providers, in the order they are asked**

| Provider | Offers | `start()` | Button |
|---|---|---|---|
| plan | only with a plan made from the player's notes (the plan's id does not start with `starter-`, `js/practiceplan.js:126`): the block that the new `App.practicePlan.nextOpen()` returns | a Keys-lesson block (`lessonId`): `App.practicePlan.launch(id)`, then `App.keysLessons.start()` | "Start" |
| | | a Neck block (`page: 'fretboard'`): `launch(id)`, which starts the runner (`js/practiceplan.js:195`) | "Start" |
| | | any other block: `launch(id)`, which opens the block's page (`:196`) | "Open the Tuner", "Open the Woodshed", "Open Exercises" (the page's label) |
| course | the level the new `SLQuiz.next()` names | `SLQuiz.start(id)` | "Start" |
| keys | for Piano and Synth: the most recent lesson of `App.keysLessons.summary(instrument)` (`js/keylessons.js:878-885`) | `App.switchTo('piano')`, `App.keysLessons.open(id, instrument)`, `App.keysLessons.start()` | "Start" |

On a fresh profile the plan provider offers nothing (the plan is the starter) and the headline is the course's
first level: "Natural notes · Treble clef" for Piano, Guitar and Bass, "Chords in a key · Theory" for Drums
(`work-plan/probe2.out`).

**Markup of the page** (ids are new): `<p class="sl-eyebrow" id="home-eyebrow">` ("Next · Piano"),
`<h1 id="home-title">` (cut after two lines), `<p id="home-detail">` (the minutes when the step knows them, and
the full title when the headline was cut), `<button id="home-start" class="btn primary sl-hero-btn">` (the
step's `action`), `<details class="sl-fold" id="home-more">` ("Something else"; it has no `data-keep`, so it is
closed on every visit), `<div class="sl-hero" id="home-hero" role="img">` and
`<p class="sl-footline" id="home-foot">`.

**The instrument** is drawn by `js/hero.js`: `SLHero.keyboard` for Piano, Synth, Voice and Other, `SLHero.neck`
with six strings for Guitar and four for Bass, `SLHero.pads` for Drums. It shows the scale of the shared key
(`fb.root`, `fb.scale`: what the key bar names and what a LUMI shows as the scale) in the colours of
`App.colors`: dots at every Help level, labels at Full. It marks no "now" and no "next" note, so it never shows
a light the LUMI does not have. Its `aria-label` says what it shows ("Keyboard, A Dorian"). It does not sound.
A click or a tap on it calls the same function as the button (for a pointer only; the button is the keyboard's
and the screen reader's way). It takes the height that is left between the button and the footer line and is
never lower than 140 px; in a window too low for that the page scrolls. In a window lower than 700 px the
headline is 56 px high instead of `--sl-display-lg` (D28).

**The footer line** has up to three parts, each left out when there is no number for it: "12 of 20 min today"
(`today.engagedSeconds`, `today.goalMinutes`), "4-day streak" (only from 2 days), "Plan: 1 of 3 blocks done"
(only with a plan made from notes; the count of blocks measured complete, as the Plan page counts them); all
from `App.practiceProgress.summary(instrument)` (`js/practice-progress.js:329-350`) and
`App.practicePlan.state()`. On a profile with nothing stored it reads "Nothing practised yet today". The page
repaints on show and on `practice:progress` (`js/practice-progress.js:14`), `learn:instrument`, `fb:set`,
`help:level` and `colors`.

#### B9.2 Files modified

| File | Lines | Edit |
|---|---|---|
| `index.html` | `84` | new first panel `<section class="panel" id="panel-home"></section>` |
| `index.html` | before `139` (`js/help.js`) | `<script src="js/hero.js"></script>` and `<script src="js/home.js"></script>` |
| `js/app.js` | `77-85` `APPS.main` | `pages` starts with `'home'`; no group holds it; `home: 'home'`; the comment "Exercises = the home" is corrected |
| `js/app.js` | `102-108` | `PAGE_LABELS.home` = "Home" |
| `js/app.js` | `1808` | the key is `home.landed` |
| `js/app.js` | before `1928` (`switchTo(startTab)`) | soundLAB only, no `#page`, no `#settings`, `home.landed` not set: set it and start on `HOME` |
| `js/practiceplan.js` | `190`, `354` | new `App.practicePlan.nextOpen()`: of today's blocks for the chosen instrument, the first that is not measured complete and that, if the app cannot measure it, was not opened today (`session.items[id]` is missing). "Can be measured" is the test `launch` makes at `190` (a Keys lesson, Exercises, the Woodshed), moved into a helper both use. It launches nothing. The pedal's rule (`remote`, `215-227`) is not touched |
| `js/quiz.js` | `2956-2972` | new `SLQuiz.next()`: `{ id, title }` of the level the Continue button would start (`nodeLevel(currentNode(…))`, `1861-1876`; the title is the unit's and the mode's name, as `1934` builds it), or `null` |
| `js/quiz.js` | `2948-2952` | the 0.69 landing goes |
| `js/help.js` | `TOURS` (`25-134`) | a `home` tour of three steps: the headline and the button, the instrument chip, the key bar |
| `sw.js` | `8`, `ASSETS` | `v20`; `'js/hero.js'`, `'js/home.js'` |
| `tests/run.sh` | `17` | add `home` |

`MOVED` (`js/app.js:981-989`) needs no row: no page leaves. `gear.html` is not edited. No tab is marked and no
pill row is shown on the home without new code (`js/app.js:937`, `:965`; D20).

#### B9.3 What must not change

A stored last page wins at the start (`js/app.js:1915`); a `#page` wins over it (`:1926`); Exercises' own views,
progress and records; `SLQuiz`; the five tabs and the four Learn pills; the Plan's rules: a block is done only
by measured practice (`js/practiceplan.js:156-179`), and `launch` and the pedal's Next behave as today; what the
pedal does on other pages.

#### B9.4 Stored state

New `home.landed` (true once the one-time landing has happened or a `#page` start has skipped it). `qz.landed`
has no reader and no writer from here on and is never deleted. `app.tab` may hold `home`. Showing the home
stores nothing else: `App.practicePlan.state()` does store the default student and today's empty session entry
(`js/practiceplan.js:47`, `:131-134`), but both keys are stored at every start today before any page is opened
(`pp.students` and `pp.sessions` exist on a fresh profile right after boot, `work-plan/probe3.js`); for an
instrument chosen later it adds that day's empty entry, as the Plan page does.

#### B9.5 Tests

**New `tests/home.test.js`:**

| # | Case |
|---|---|
| 1 | A fresh profile, once per instrument (Piano, Guitar, Bass, Drums): the app starts on `home`; `#home-title` is the title of `SLQuiz.next()`, "Natural notes · Treble clef" for the first three and "Chords in a key · Theory" for Drums; `#home-start` reads "Start"; the footer reads "Nothing practised yet today" and names no plan; a real click on the button starts a run (`SLQuiz.view === 'run'`) |
| 2 | Layout at 390 × 844, 1024 × 640 and 1280 × 800, with a provider added by the test whose title takes two lines: one `h1`; the button and the whole hero are inside the window with the page at scroll 0; **the hero is at least as high as the headline block and at least 25 % of the window's height (22 % at 1024 × 640)**; at 360 px nothing scrolls sideways |
| 3 | A plan made from notes (seeded `pp.students` with `acceptedAt`): the headline is the block `nextOpen()` returns. A Keys-lesson block: the button reads "Start" and a real click leaves a lesson run active on the Piano page (`App.keysLessons.run`). A Tuner block: the button reads "Open the Tuner", a real click opens the Tuner, and back on the home that block is not offered again today: the headline is the next block. The footer reads "Plan: 0 of N blocks done" |
| 4 | **Whatever the provider, a button that reads "Start" starts a run:** for each built-in kind, after a real click a run is active within two seconds (an Exercises level, a Keys lesson, the Neck's runner); a button with other words opens the page it names and starts nothing |
| 5 | The hero follows the instrument (keyboard; neck with six string lines; neck with four; pads) and the key set in the key bar; it shows dots at every Help level and labels only at Full; it has no element in the "now" or "next" state; a real click on it does what the button does |
| 6 | The footer: seeded practice shows its minutes; the streak shows from two days; none of the words "XP", "teacher", "week", "pass" |
| 7 | A title of 80 letters, at 360 and at 1024 px: `#home-title` is not higher than two of its lines, and `#home-detail` holds the whole title |
| 8 | Placement: on `home` no tab has `aria-current` and `#subnav` is hidden; a real click on the wordmark from Piano opens `home`; a tap on Learn from `home` opens Learn's last page |
| 9 | Back from Piano ends on `home`; Back on `home` shows `#back-hint`. With `app.tab` = `piano` and `home.landed` set the app opens Piano; without `home.landed` it opens `home` once and sets the key |
| 10 | `App.remoteAction('next')` on `home` does what the button does; a step added with `App.home.provide` appears where its order says |
| 11 | With reduced motion no element of the page has a running animation, and without it none runs before the first input |
| 12 | No page error, no MIDI permission request, and after the home was shown `localStorage` holds no key that it did not hold after boot, except `home.landed` |

| Suite | Change (each is a check whose meaning is "the start or the fallback is this page") |
|---|---|
| `nav` | `26`: a stored metronome tab falls back to the home |
| `quiz` | `52-53`: the first launch lands on the home, then the suite opens Exercises. `58` (the four pills) is not edited |
| `practice` | `116`: Back walks to the home when the stack is empty (re-read the steps before it) |
| `trim` | `184`, `412-413`, `432`, `639-662`: a stale stored page boots to the home, and the stored page is `home` |
| `gear` | `723`, `734`: after crossing over with nothing stored soundLAB shows the home; `777-783`: a first start without a `#page` lands on the home once and sets `home.landed` |
| `storage-import` | `380`, `899`: soundLAB starts on the home |
| `context-global`, `smoke` | page lists (`7`; `26`) gain `home` |
| `look` | `home` in the page lists and in `RESKINNED`; L8 for the home with the minimum of case 2 |
| re-run only | every suite with a boot wait (they seed `app.tab` and `home.landed` since B2), `remote` (`App.addPage`), `remote-plan` and `practiceplan` (the Plan's own rules), `learn-instruments`, `taps` |

#### B9.6 Docs

`CLAUDE.md`: a layout entry for `js/home.js`; the tab-bar convention (the home is a page outside the groups);
BACK (the home page); `js/quiz.js` ("the practice HOME" becomes "the course"); `App.practicePlan.nextOpen`,
`SLQuiz.next`. `docs/INSTRUMENT-MATRIX.md`: the home row. `docs/DESIGN-SYSTEM.md`: the home template with the
numbers as built. Roadmap status: B9, with two notes: the home's footer already shows the streak and the goal,
two of Phase D's three words for the home ("streak/goal/review on home", `docs/ROADMAP-2.0.md:60`), and Phase D
decides whether Exercises keeps its own strip of the same numbers; and "the home's providers are the place for
the weekly plan, the review and the teacher's notes".

#### B9.7 Acceptance checks

```
grep -n "qz.landed" js/*.js                                  # no hits
grep -n "'home'" js/app.js | head
node tests/assets.test.js
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh home nav quiz practice trim gear storage-import context-global smoke practiceplan remote-plan look taps
```

Look at, dark and light, for Piano, Guitar, Bass and Drums: 360 × 780, 390 × 844, 820 × 1180, 1024 × 640,
1280 × 800. In each: one headline of at most two lines; the button is the only amber **button** (a root note
may be amber too in today's palette: say in the pull request how that reads); the instrument is the largest
thing and is whole; the footer line is one line (two on a phone) and holds only numbers that the test profile
stores; nothing else is on the page until "Something else" is opened. A fresh profile. A plan from notes with
a Tuner block ("Open the Tuner"). A day with the goal reached. 360 × 640: the page scrolls and the instrument
is 140 px, not squeezed. Compare the 1280 × 800 dark picture with `docs/design/home-mockup.html`: same order of
parts, same weight of headline, button and keyboard; what is missing (teacher, week, FL Studio, a "now" key) is
missing on purpose.

#### B9.8 If the owner picks placement A or C at gate G3

`home` joins the Learn group as its first page with the pill "Today" (`js/app.js:80`, `:114-120`); `app.gtab.gtheory`
may hold `home`; `tests/quiz.test.js:58` expects `Today|Exercises|Chords|Circle|Plan` and
`tests/practiceplan.test.js:404-415` five pills on one row at 360 px, which needs the pill component's narrow
style at 380 px and below (13 px text, 8 px side padding: the five then end at x = 311 of 360, measured on
today's pills, `work-plan/probe2.out`). Case 8 changes to "Learn is marked and the pill row is shown". The
hero's minimum of case 2 stays as it is; if A cannot reach it at 1024 × 640, that is said to the owner before
he chooses (B1b measures it). For C the pills move into the header's row above 900 px, which is a change to B6
and is planned only once chosen.

---

### B10 — Exercises

**Waits for:** stop 3.

**Goal.** The Exercises page in the new look: its start view is a tool page with one `h1` and one primary
button on the first screen (Continue, `#qz-cont`, which is a primary button today, `js/quiz.js:1904`), its
question view a practice page (D28). The start view keeps today's arrangement and length (owner item 6). No
behaviour changes. **Fixes on the way:** XP numbers are printed as whole numbers; CSS rules that no markup uses
go.

#### B10.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/quiz.js` | `2636-2881` (CSS), `2885` (inject) | rewritten: tokens only, sizes from tokens, rules that only restyle a shared class deleted. Rules with no markup go: `.qz-hero` … `.qz-total` (`2647-2654`) and `.qz-goals` (`2837-2839`) (map: no markup uses them; grep each name before deleting). Raw colours at `2751`, `2754`, `2792`, `2798`, `2833` (map) become tokens: right and wrong are `--sl-ok` and `--sl-bad`, each with its icon and words as today |
| `js/quiz.js` | `init` | `#panel-quiz` gets class `sl-skin` |
| `js/quiz.js` | `1292` `renderHome`, `1893-1907` `statsStrip`, `1885-1891` `goalRing` | an `h1` "Exercises"; the strip from `.sl-tile`; the ring is the `.sl-ring` component (same numbers, same `title`) |
| `js/quiz.js` | `1403` `renderRun`, `1537` `renderDone` | answers are 48 px buttons in the component look; `#qz-runshell`, `#qz-q`, `#qz-act` and every pinned name stay |
| `js/quiz.js` | the keyboard and the neck inside questions (`829`, `843`: `map-pages-instr.md` 2.6; the planner did not open them) | colours from tokens; the marks for the asked note, a right and a wrong answer keep today's shapes until B16 |
| `js/quiz.js` | `1898`, `2089`, `2230` | `Math.round` before printing XP (a fix; stored values are not touched) |
| `js/quiz.js` | chart builders (map: `drawCharts`) | bar, line and grid colours through `App.token`; text sizes from tokens |
| `sw.js` | `8` | `v21` |

#### B10.2 What must not change

The 101 ids, classes and attributes that suites and the pedal read (`map-pages-learn.md` section 4); `SLQuiz`;
the fixed run shell and its one footer action; the `.kb` badges; `keepVisible` and `reveal`
(`js/quiz.js:1271-1290`); every stored key; the answer clock; that the charts are built at the container's
width and have their table views.

#### B10.3 Tests

No check is edited on purpose. `taps` is mandatory (it is the only suite that proves a tap lands on an answer).
Geometry checks to re-read while working: `tests/game.test.js:374` (the goal ring's dot),
`tests/practice.test.js:48` (`#xp-toast`). `look`: `quiz` joins `RESKINNED` in its four views (start, a topic,
a question, the result) and its three start tabs, at 390 × 844, 1024 × 640 and 1280 × 800 as well as the four
widths. L8: the start view has one `h1` and exactly one primary button on its first screen; in the question
view the question, all answers and `#qz-act` are inside the window with the page at scroll 0. The ceilings of
`tokens` T3 and T4 for `js/quiz.js` go to 0.

#### B10.4 Docs, acceptance checks

`CLAUDE.md`: the `js/quiz.js` entry (views, template). Roadmap status: B10.

```
grep -c "var(--\(bg\|card\|line\|text\|muted\|accent\)" js/quiz.js      # 0
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh quiz game practice quiz-correction remote-quiz learn-instruments instrument-xp taps look tokens lights colors
```

Look at, dark and light, at 360, 390, 820, 1024 × 640 and 1200 px: the start view on Path, Topics and Progress;
an open node card; a staff question, a keyboard question, a neck question and an ear question; a wrong answer
("You chose …" with its mark, readable without colour); the result with its numbers. On a phone the question,
all answers and the footer button are on screen without scrolling. The charts in light (bars against the card,
the goal line, the labels).

---

### B11 — Chords, Circle, Plan

**Goal.** The three other Learn pages as tool pages, each with one `h1` and one primary button on the first
screen; the pull request names that button for each page (the planner did not pick them). **Behaviour:** the
tempo field on Chords shows and sets the shared tempo; "Delete all practice history" on the Plan page asks in
the page instead of with a browser dialog. The neck and the keyboard of the Chords page take the tokens here
and keep their states until B16.

#### B11.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/chords.js` | `984-1072` (CSS), `1336` (inject), `1074` `buildDOM` | tokens only; `h1` "Chords"; `#panel-chords` gets `sl-skin`. The minimum widths at `995` and `1009` are re-checked at 360 px. `renderShapeSVG` (`175`, map: not called) goes after a grep |
| `js/chords.js` | `132`, `1149`, `1181`, `1326` | `#ch-bpm` keeps its id and reads and writes `met.bpm` through the `tempo` event with `source: 'chords'` (guarding its own echo); `ch.bpm` is no longer read or written |
| `js/theorytab.js` | `360-402` (CSS), `405`, `406` | tokens only; `h1` "Circle of fifths"; `sl-skin`; the circle's wedge colours come from `App.colors` and `App.token` |
| `js/practiceplan.js` | `346-353` (CSS), `306` (markup), `282-286` | tokens only; the existing `h1` stays; `sl-skin`; today's blocks as `.sl-rows`. The select arrow fault (map: the page's form rule removes the chevron) is fixed by using the component's select |
| `js/trainer.js` | `305` (CSS), `324` (markup), `121` | tokens only. `confirm()` is replaced by the two-tap pattern Settings already uses (`js/settings.js:907`): the first tap turns the button into "Tap again to delete" for 3 s |
| `css/components.css` | | `.sl-confirm` (the two-tap state) |
| `sw.js` | `8` | `v22` |

#### B11.2 What must not change

The chord explorer's neck and its follow rule; the progression player and its transport claim; the degree ear
quiz on the Circle page; the Plan's rules table, students, sessions and measured completion; `App.practicePlan`;
`fb:practice` links; every id.

#### B11.3 Stored state

`ch.bpm` is left as it is, unread. Nothing new.

#### B11.4 Tests

| Suite | Change |
|---|---|
| `practiceplan` | `96-97` ("13px" select padding and a 230 px label) pinned the old form look against a regression; they are replaced by their equal: the selects on the Plan page have the same computed padding as a select on the Chords page, the two chord selects share one row at 1200 px and nothing overflows |
| `remote-plan`, `practiceplan` | new: two taps within 3 s delete the history, one tap does not, and no browser dialog opens (`page.on('dialog')` stays silent) |
| `practice` (it drives the Chords page) | new: changing the tempo in the key bar changes `#ch-bpm` and the other way round; the progression plays at the shared tempo |
| `look` | `chords`, `theory`, `practiceplan` join `RESKINNED`, at 390 × 844, 1024 × 640 and 1280 × 800 as well as the four widths; L8 for a tool page: one `h1`, exactly one primary button on the first screen |
| re-run only | `game`, `colors`, `learn-instruments`, `taps` |

#### B11.5 Docs, acceptance checks

`CLAUDE.md`: the context-bar rule ("pages must not grow their own duplicate selects") now holds for Chords;
layout entries. Roadmap status: B11.

```
grep -n "confirm(" js/trainer.js js/chords.js js/theorytab.js js/practiceplan.js       # no hits
grep -n "ch\.bpm" js/chords.js                                                           # no hits
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh practiceplan remote-plan practice game colors look tokens taps
```

Look at, dark and light, at 360, 390, 820, 1024 × 640 and 1200 px: Chords with a chord open (the neck, the theory panel, the
progression row; chord names in the condensed face, not Bebas); the Circle with a key chosen (wedge labels
readable in light); the Plan with no notes, with a plan and a running block, and the Free practice cards. In
light look for degree-coloured text on pale cards (`map-design.md` section 7, item 4): it must be text in the
ink colour beside a coloured dot, not coloured text.

---

### B12 — Piano, Keys lessons, LUMI section

**Goal.** The Piano page as a practice page: one `h1`, the keyboard as the largest thing on its stage, one
primary action (the lesson's Start), everything else in folds that remember whether they are open (D28). The
keyboard stays ivory and ebony in both themes (D31). How "now", "next" and the root look does not change in
this step: that is B16. **Behaviour:** the Help-level control leaves the page (it is in the key bar on every
page, D16); four groups of controls are behind folds.

#### B12.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/piano.js` | `1273-1349` (CSS) | tokens only. The 24 raw colours of the file (`map-pages-instr.md` 2.2) become `--sl-key-white`, `--sl-key-black`, `--sl-key-line`, `--sl-key-press`, `--sl-stage` and the inks on a note colour. The rules for now, next and the root keep their shapes (an amber ring, a dashed amber ring) and take `var(--sl-accent)`; the classes that mark these states keep their names |
| `js/piano.js` | `1287` | the keyboard fits the stage's width at every width where it is drawn flat (today only from 1100 px; below it scrolls inside its box). The upright keyboard of narrow screens (`.pn-v`) keeps its rule; the planner did not re-check at which width it starts |
| `js/piano.js` | `1351-1466` (markup) | Every control keeps its id and is in the document from the start (D28); `#panel-piano` gets `sl-skin`. The new order, with the place of each control of today's first row (`1354-1378`), which the first draft left out: |
| | | 1. **`h1#pn-title`** (today an `h2` with the same id and painter, `1354`, `1467`; the rule `.card h2.pn-title`, `1275`, follows) |
| | | 2. **the stage** `#pn-stage` (`1457`), with `#pn-rotate` (`1377`) in its corner |
| | | 3. **one row that is always shown**, directly under the stage: the Sound picker `#pn-voice` (`1374-1375`), `#pn-look` (`1359-1362`), `#pn-display` (`1363-1367`); then `#pn-legend` and `.pn-foot` (`1458-1459`) |
| | | 4. **the lessons** `#pn-lessons` (`1461`) |
| | | 5. **folds** (`<details class="sl-fold" data-keep="…">`): "Chords and arpeggio" = `#pn-perf` (`1380`: Perform); "Practice a scale" = `.pn-practice` (`1406`: the runner); "Computer keys" = `#pn-qw` (`1368`), `#pn-octrow` with `#pn-octdn`, `#pn-octlabel`, `#pn-octup` (`1369-1373`), `#pn-qwmap` (`1376`) and `#pn-qwpanel` |
| | | 6. **"Notes and triads on the LUMI"**: `#pn-lumi` stays the `<details>` it is (`1463`) and takes the fold's look; it has no `data-keep`, because it owns the pedal while it is open (`docs/ROADMAP-2.0.md:91`) and must be closed on every visit |
| | | The wrapper of parts 1-3 keeps the class `pn-card` |
| `js/piano.js` | `1356-1358`, `1339`, `1495`, `1859` | `#pn-assist`, its rule and its wiring go. The page still follows `help:level` |
| `js/keylessons.js` | its CSS string (injected at `836`), `788-789` | tokens only. The focus mode's selector list (`788-789`) is edited in the same commit as the markup: today it hides the header's tools through `.row.spread>span.row`, which no longer exists; it must hide the always-shown row, the legend, the foot, the folds and the LUMI section, and nothing more than today (the title stays) |
| `js/keylessons.js` | `300-307` `focusView` | the scroll target is `#pn-stage`'s closest `.pn-card` (today: its closest `.card`, `302`; without one the function returns and the run starts with the keyboard off screen) |
| `js/lumi-practice.js`, `css/lumi-practice.css` | all 46 lines of the sheet | tokens only (7 lines hold a raw colour today, 4 use `--teal`); markup and ids unchanged; the states of its two keyboards wait for B16 |
| `js/help.js` | `55-61` | the Piano tour is re-read with the folds closed: `#pn-voice` (`55`) is in the always-shown row; `#pn-chseg` (`56`), `#pn-play` (`57`) and `#pn-guide` (`58`) are inside folds, which the tour opens (B7b); the step on `#pn-assist` (`59`) points at `#cx-help`; `#pn-lumi` (`61`) is the section itself |
| `sw.js` | `8` | `v23` |

#### B12.2 What must not change

The 29 names of the keyboard's drawing that suites read (`map-pages-instr.md` section 4); a scale dot takes its
colour from `App.colors` as today; `data-dc`; a pressed key flashes its degree colour at every Help level;
`#pn-look` (dots or whole keys); the dimmed keys under Scale lock (`css/style.css:423`,
`tests/lights.test.js:105`); `App.keys`; that `#pn-voice` is on screen after the "Synth keyboard" entry
(`js/learn-instruments.js:67-70`, `tests/learn-instruments.test.js:104`); the lesson engine (targets, windows,
scores, levels), the double-tap control, the endless mode; what `html.kl-running` hides; that a starting run
brings the keyboard under the chrome; every byte sent to a LUMI; how now, next and the root look.

#### B12.3 Stored state

`ui.folds` (B3) is written for the first time: three names, one per fold of part 5. `pn.assist` stays the
fallback of `help.level` (`CLAUDE.md`, HELP LEVEL). Nothing else.

#### B12.4 Tests

| Suite | Change |
|---|---|
| `keys` | `78`: the level's name is read from the key bar (`#cx-help`) instead of `#pn-assist .active` |
| `lights` | `222`: the same |
| `learn-instruments` | `104-118`: no edit expected, and named here because it decides where the Sound picker may go: `#pn-voice` must be visible after the entry (`104`) and `page.selectOption('#pn-voice', …)` needs a visible control (`110`, `111`, `118`) |
| `remote-keys` | re-run with the focus view in mind: after a start by the pedal the keyboard and the lesson's bar are inside the window, under the header and the key bar |
| `look` | `piano` joins `RESKINNED`: at rest, with each fold open, with a lesson running (focus mode), with the upright keyboard. New: at 390 × 844, 1024 × 640 and 1280 × 800 the whole keyboard is inside the window with the page at scroll 0, and one primary button is on the first screen; a white key against the stage has 3:1 in both themes; a fold opened by a real tap is open again after a reload, the LUMI section is not; L5: every step of the Piano tour has a displayed target while it is shown, and the folds it opened are closed after the tour |
| re-run only | `lumidisplay`, `lumi-practice` (`254`: the simulation `<details>`), `lumi-contexts`, `colors`, `chordchart`, `practice-router`, `fingering`, `multiin`, `taps` |

#### B12.5 Docs, acceptance checks

`CLAUDE.md`: the `js/piano.js` entry (Help level is set in the key bar; page order; folds), the
`js/keylessons.js` entry (focus mode). `docs/INSTRUMENT-MATRIX.md`: the Piano hero cell. Roadmap status: B12.

```
grep -n "pn-assist" js/*.js tests/*.js                    # no hits
for id in pn-look pn-display pn-qw pn-octrow pn-voice pn-qwmap pn-rotate pn-legend pn-perf pn-lumi pn-qwpanel; do grep -c "id=\"$id\"" js/piano.js; done   # 1 each
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh keys lights learn-instruments lumidisplay lumi-practice lumi-contexts remote-keys colors chordchart look tokens taps
```

Look at, dark and light, at 360, 390, 820, 1024 × 640 and 1200 px: the page at rest (the keyboard is the largest
thing; the folds closed; Sound, the look and the labels within reach under the keyboard); each fold open; a
lesson run (only the title, the keyboard and the lesson's bar); the keyboard at Help Full, Colors, Target,
Tonic and None; both colour modes; Scale lock on. In light: ivory keys stand off their stage; black keys are
black. After a reload: the fold that was opened is open.

---

### B13 — Neck, Tab, Notation

**Goal.** The three Guitar pages as practice pages, the neck as the hero. **Behaviour:** the neck obeys the Help
level (D32); the Neck's own copy of the "Color notes by" switch goes (the key bar has it, D16).

#### B13.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/fretboard.js` | `1672-1786` (CSS) | tokens only. The definitions of the classes other pages borrow (`.fb-field` `1673`, `.fb-stroke` `1688`, `.fb-chip` `1761`) go: `css/components.css` has them since B3 (D8). The maximised neck uses `var(--sl-z-full)`, and the two layers above it (`z-index: 205` and `210`, `1698`, `1679`) are `calc(var(--sl-z-full) + 1)` and `+ 2`. The nut's two raw colours on `:root` (`1768`) become `--sl-nut` |
| `js/fretboard.js` | `257` `renderBoardInner` | which dots and labels are drawn comes from the Help level: Full = dots and labels, Colors = dots, Target = only now and next, Tonic = only the root, None = the bare neck. The page repaints on `help:level`. How a dot, "now", "next" and the root look stays as today until B16. The geometry (`32`, `46`, `359`: six strings) is not touched |
| `js/fretboard.js` | `1793` on (markup), `1871` (`#fb-settings`) | `h1` per page ("Neck", "Tab", "Notation" through `altInit`, `2214`); the neck first, then the runner's controls, the rest in folds; `sl-skin` on the three panels |
| `js/fretboard.js` | `1885-1886`, `1955` | the "Color notes by" block `#fb-colmode` and its wiring go |
| `js/fretboard.js` | `518-528` `baseWidth` | the neck fills its stage up to the page's width (hero size); checked at 360 px upright and 1280 px flat |
| `js/help.js` | `39`, the Fretboard, Tab and Notation tours | "Color notes by (in the key bar, under Help)": the Fretboard's own switch is gone; the three tours are re-read with the folds closed (B7b opens a fold that hides a target) |
| `sw.js` | `8` | `v24` |

#### B13.2 What must not change

The 25 names of the neck's drawing that suites read (`map-pages-instr.md` section 6); a scale dot is a
`circle` with `r="11.5"` whose `fill` is the note's colour and whose next sibling is its label
(`tests/colors.test.js:52-54`, `:169-172`, `:338-339`; B16 draws the ring of D30 as that circle's stroke); the runner, its patterns and pick strokes; the trio rule (the runner
keeps playing across Neck, Tab and Notation, `2176`); `fb:set`, `fb:scale`, `fb:practice`; taps on the neck
sound and obey Scale lock; the colour editor (`fb.colors`) and its reset; the pedal (`1316`).

#### B13.3 Stored state

None. The Help level is `help.level`; nothing per page.

#### B13.4 Tests

| Suite | Change |
|---|---|
| `colors` | `221`, `302-305`: the mode is read and set through the key bar's `[data-cxcolormode]` (`#fb-colmode` is gone). New: at Help Full the neck shows dots with labels, at Colors dots without labels, at Target no scale dots (only now and next while the runner runs), at Tonic only root dots, at None none; the LED side is unchanged |
| `look` | `fretboard`, `tab`, `notation` join `RESKINNED`; the whole neck is inside the window at 390 × 844, 1024 × 640 and 1280 × 800, with one primary button on the first screen; L5 for the three tours |
| re-run only | `practice`, `remote-runners`, `lumi-contexts`, `quiz` (`343-356`), `display-master`, `lights`, `keys`, `taps` |

#### B13.5 Docs, acceptance checks

`CLAUDE.md`: HELP LEVEL (the neck follows it), the `js/fretboard.js` entry. `docs/INSTRUMENT-MATRIX.md`: the
guitar cells for Help and hero; candidate 6 (Help on the neck) is marked done. Roadmap status: B13.

```
grep -n "fb-colmode" js/*.js tests/*.js                   # no hits
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh colors practice remote-runners lumi-contexts quiz look tokens taps
```

Look at, dark and light, at 360, 390, 820, 1024 × 640 and 1200 px: the neck at the five Help levels; the runner
running (now and next as today); the maximised neck with a message shown over it; Tab and Notation with the runner; the
folds. In light: string and fret lines against the board, labels inside dots.

**If this step's behaviour part is held back:** the re-skin lands alone and the Help level on the neck stays
candidate 6 of the matrix for Phase C (D32).

---

### B14a — Charts, Pads

**Goal.** The two other pages of the Keys tab in the new look: Charts as a tool page, Pads as a practice page
with the pads as hero. No behaviour changes. **Fix on the way:** printing any page other than Charts no longer
gives a blank sheet (D37).

#### B14a.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/chordchart.js` | `496` `css()`, `339` (inject), `341` on (markup) | tokens only; `h1` "Chord charts"; `sl-skin`. `#cc-note` (`377`) takes the component's field look. The page's `.hint` (`352`) uses the shared definition. The dots on the chart keyboards keep their look until B16 |
| `js/chordchart.js` | `525-529`; `onShow` / `onHide` | the print rule is prefixed with `html.cc-page`, a class the page sets while it is the open one; its four literals become the print tokens `--sl-paper`, `--sl-paper-ink`, `--sl-paper-ink-soft`, `--sl-paper-accent` |
| `css/tokens.css` | after the keys block | the four print tokens (Appendix C); the same values in both themes |
| `css/components.css` | | `@media print`: the header, the key bar, the tab bars, sheets, messages and the footer are not printed, on any page |
| `js/pads.js` | `140-166` (CSS), `168` (markup), `117` (render) | tokens only; `h1` "Pads"; the eight pads as the hero (a hit keeps today's flash until B16); the lane colours (`36-38`) stay data. Remap and the two MIDI maps go into one fold with `data-keep` |
| `js/help.js` | `122-124` (the Pads tour) | re-read with the fold closed: `#pd-mode` (`123`) is inside the fold, which the tour opens (B7b) |
| `sw.js` | `8` | `v25` |

#### B14a.2 What must not change

Charts: the file format, Save MIDI, Practice with LUMI, Play all and its transport claim, `window.SLChart`, the
printed chart itself. Pads: the eight pads by touch, keys and MIDI, both maps, Remap, the key lights, the stored
keys `pads.mode`, `pads.base`, `pads.leds`, `pads.map` and no other `pads.*` key (the fold's state is in
`ui.folds`).

#### B14a.3 Tests

| Suite | Change |
|---|---|
| `chordchart` | new, with `page.emulateMedia({ media: 'print' })`: on Piano the page's content is visible and the header is not displayed; on Charts the sheet `#cc-sheet` is visible and nothing else is |
| `look` | `chart` and `pads` join `RESKINNED`, at 390 × 844, 1024 × 640 and 1280 × 800 as well as the four widths. L8: all eight pads are inside the window with the page at scroll 0; Charts has one `h1` and one primary button on its first screen. L5 for the Pads tour: `#pd-mode` is displayed while its step is shown and the fold is closed afterwards |
| re-run only | `trim` (Pads), `lumidisplay`, `lumi-contexts`, `lights`, `colors`, `taps` |

#### B14a.4 Docs, acceptance checks

`CLAUDE.md`: layout entries. `docs/INSTRUMENT-MATRIX.md`: the pads' hero cell. Roadmap status: B14a.

```
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh chordchart trim lumidisplay lumi-contexts lights colors look tokens taps
```

Look at, dark and light, at 360, 390, 820, 1024 × 640 and 1200 px: Charts with a chart of three rows, and its
print preview (a PDF from `page.pdf()`): black on white, chord names in the paper accent, no shell; the print
preview of Piano: the page, no shell. Pads at rest, with a hit, and with the fold open.

---

### B14b — Songs, Jam

**Goal.** The two pages of the Play tab as tool pages. No behaviour changes. One card on Songs keeps its own
rules: the Player card, which Gear's Hub shares (section 0).

#### B14b.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/songs.js` | `512-540` (CSS), `542` on (markup) | tokens only; `h1` "Songs"; the one-open card and the list as components; an empty list uses `.sl-empty`. The "now" cell of the tab view is a text cursor in the accent, not an instrument state, and stays |
| `js/scoreplayer.js` | `610-619` | **not edited.** The Player card `#sg-player` (`js/songs.js:555`) is built from shared classes (`btn`, `field`, `row`, `seg`, `card`), so inside the re-skinned panel it takes the new shapes through them. Its own ten rules stay, because Gear's Hub uses the same injected sheet; three of them read old variables (`var(--text)`, `var(--muted)`, `var(--red)`), which the bridge points at tokens in soundLAB. `look` L10 has **one named exception until Phase H: the rules of the sheet `#css-scoreplayer`**, and `tokens` T4 keeps the file exempt |
| `js/jam.js` | `993-1034` (CSS), `1036` on (markup) | tokens only; `h1` "Jam"; the band chips, the section editor and the mixer as components; `.jam-now` uses the shared definition |
| `js/jam.js` | `1259-1261` | the drag ghost is appended to `#sl-float` instead of `<body>`: it is a `.chip`, and a shared class takes its new look only inside a `.sl-skin` container (rule 12) |
| `sw.js` | `8` | `v26` |

#### B14b.2 What must not change

Songs: the one-open routes and `App.songs`; what the Player sends. Jam: the song model, the transport, the
mixer's values. Drag in Jam stays pointer-based. In Gear the Hub's player is untouched (L16).

#### B14b.3 Tests

| Suite | Change |
|---|---|
| `look` | `songs` and `jam` join `RESKINNED`, at 390 × 844, 1024 × 640 and 1280 × 800 as well as the four widths; L8 for a tool page; L10 with its one exception, checked both ways: the rules of `#css-scoreplayer` are skipped, and no other rule that matches inside `#panel-songs` holds an old variable. New: while a Jam chip is dragged the ghost is inside `#sl-float` |
| re-run only | `oneopen`, `remote-runners`, `trim` (Jam), `storage-import` (Jam), `performance-import`, `taps` |

#### B14b.4 Docs, acceptance checks

`CLAUDE.md`: layout entries. Roadmap status: B14b.

```
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh oneopen remote-runners trim storage-import look tokens gear
```

Look at, dark and light, at 360, 390, 820, 1024 × 640 and 1200 px: Songs empty, with a file chosen (the three
buttons), and playing, with the Player card beside the page's own cards (same button and field shapes; say in
the pull request what still differs). Jam with a song, a section open, the mixer, and a chip being dragged.

---

### B15a — Woodshed, with guided performance and Practice progress

**Goal.** The Woodshed page (`shed`) in the new look: the library as a tool page, a run as a practice page,
with the two modules it hosts, the guided performance player and the Practice progress panel
(`js/woodshed.js:1200` mounts it). **Behaviour:** the Woodshed's own flash message is shown by the app's
message stack (D25). Nothing else changes.

#### B15a.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/woodshed.js` | `1532` on (CSS), `1143` `renderLib`, `1203` `renderSession`, `1276` `renderReport` | tokens only; `h1` "Woodshed"; the library's rows as `.sl-rows`, with the dense control height on a mouse if the owner agreed to it (D9), else 44 px; `sl-skin` |
| `js/woodshed.js` | `829-840`, `863-867` | the canvas reads its inks through `App.token`; perfect, great, good and miss are the four judgement tokens |
| `js/woodshed.js` | `1105-1107`, `1551-1557` | `#ws-flash` and its rule go; the message is `App.toast(msg)` |
| `js/woodshed.js` | `1140` | the line "Legacy / unassigned: Level … legacy streak" is on the library's first screen and on the wording list (rule 16): it is reworded if no suite pins its text (grep `tests/` for "Legacy / unassigned" first; the planner did not) |
| `js/performance-player.js` | `328` (CSS), `330` (markup), `239`, `272` | tokens only; the canvas through `App.token`; its keyboard is ivory and ebony (D31) and keeps its states until B16 |
| `js/practice-progress-ui.js` | `38` (CSS), `55` (markup), `82` (chart) | tokens only; the chart is drawn at the container's pixel width and keeps one `svg rect` per day and its `desc` |
| `sw.js` | `8` | `v27` |

#### B15a.2 What must not change

`window.Woodshed` (`importMidi`, `addScore`, `importTrack`); the run engine, calibration, Wait mode; what a run
records (`App.practiceProgress`); the key lights during a run; the guided performance player's engine and
safety rules.

#### B15a.3 Tests

| Suite | Change |
|---|---|
| `remote-shed` | re-read while working: it names the Woodshed's ids 43 times; none is renamed |
| `practice-progress-ui` | no edit; the chart's `rect` count and `desc` are what it reads |
| `look` | `shed` (library, a run, the report, the guided performance player) joins `RESKINNED`, at 390 × 844, 1024 × 640 and 1280 × 800 as well as the four widths; L8: the library has one `h1` and one primary button on its first screen; in a run the instrument or the staff and the primary action are inside the window |
| re-run only | `performance`, `performance-import`, `performance-progress`, `performance-safety`, `instrument-session`, `instrument-xp`, `practice-audio`, `pitch-lock`, `lumidisplay`, `oneopen`, `practice` |

#### B15a.4 Docs, acceptance checks

`CLAUDE.md`: layout entries. Roadmap status: B15a.

```
grep -n "ws-flash" js/*.js                                # no hits
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh remote-shed performance performance-import performance-progress performance-safety practice-progress-ui instrument-session practice-audio look tokens
```

Look at, dark and light, at 360, 390, 820, 1024 × 640 and 1200 px: the library with ten pieces; a run (the
falling notes or the staff, the keyboard, the judgement words); the report; the guided performance player;
Practice progress with a month of data and with none. In light: the canvas ground and the judgement colours
against it.

---

### B15b — Tuner

**Goal.** The Tuner in the new look, with its gauge as the hero. No behaviour changes.

| File | Lines | Edit |
|---|---|---|
| `js/tuner.js` | `55-88` (CSS), `139` (markup), `120` (gauge), `615` (inject) | tokens only; `h1` "Tuner"; `sl-skin`; the gauge as the hero: in tune is said by the needle's place, a mark and the word, not by green alone; one primary button on the first screen |
| `sw.js` | `8` | `v28` |

Must not change: the Tuner's detection, its string guide, what it asks the browser for.

| Suite | Change |
|---|---|
| `look` | `tuner` joins `RESKINNED`, at 390 × 844, 1024 × 640 and 1280 × 800 as well as the four widths. New for the Tuner, which has no suite of its own (grep: only `smoke` opens it): the gauge has a name and a text value, and with the microphone refused the page shows its message box |
| re-run only | `smoke`, `audioin`, `practice-audio` |

`CLAUDE.md`: the `js/tuner.js` entry. Roadmap status: B15b.

```
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh smoke audioin practice-audio look tokens
```

Look at, dark and light, at 360, 390, 820, 1024 × 640 and 1200 px: the Tuner in tune, flat and with no signal.

---

### B16 — The lighting vocabulary on every instrument drawing

**Waits for:** gate G4 (the owner's yes to `docs/design/phase-b/instruments.html`: the states, and which
palette is the default).

**Goal (behaviour).** Every instrument drawing of soundLAB says "in the scale", "now", "next", "the root",
"pressed", "right" and "wrong" in the same way, the vocabulary of D30. Today's amber rings and outlines inside
instruments go. Nothing else changes: which notes are lit, when, in which colour, and every byte a LUMI gets.
This is the step that delivers "one lighting model" as far as Phase B takes it (D29).

#### B16.1 The eleven drawings

Lines are those of `map-pages-instr.md` 2.6 and 3 e; the planner did not open them for this table. "States"
are the ones each drawing has today; the step gives each of them the look of D30 and adds none.

| # | Drawing | Code | States | Re-skinned in |
|---|---|---|---|---|
| 1 | Keyboard of the Piano page (also the Keys lessons and the scale runner) | `js/piano.js:624-761`; now and next `927-939` | in the scale, root, now, next, pressed | B12 |
| 2, 3 | The two keyboards of the LUMI section | `js/lumi-practice.js:349-360`, `css/lumi-practice.css` | asked (= now), answered, right, wrong | B12 |
| 4 | Keyboard of the guided performance player | `js/performance-player.js:272-275` | now, right, wrong (to be confirmed in the step) | B15a |
| 5 | Keyboard inside Exercises questions | `js/quiz.js:829` | asked (= now), right, wrong | B10 |
| 6 | Keyboard of the Chords page | `js/chords.js:593-633` | chord tones, root | B11 |
| 7 | Keyboards of the chord charts | `js/chordchart.js:154-179` | dots with finger numbers | B14a |
| 8 | Neck of the Neck page, with the "now" cell of Tab and the "now" note of Notation | `js/fretboard.js:257-444`; `782-799`, `1774`, `1198-1199` | in the scale, root, now, next | B13 |
| 9 | Neck of the Chords page | `js/chords.js:460-536` | chord tones, root, the sounding chord | B11 |
| 10 | Neck inside Exercises questions | `js/quiz.js:843` | asked (= now), right, wrong | B10 |
| 11 | Pads | `js/pads.js:117-128` | hit (= now) | B14a |

The home's picture (drawn by `js/hero.js`) has the vocabulary from B3 on.

#### B16.2 Files modified

| File | Edit |
|---|---|
| the eight files of the table | the rules and the drawing lines for the states of D30: in the scale = a dot in the note's colour with a dark ring (on the neck that ring is the stroke of the existing `circle`), label inside from Help level Colors up in the ink `SLHero.inkOn` picks; now = the key, dot or pad filled with its own colour, with an ink ring; next = an empty ring in the note's colour, steady under reduced motion (`App.motionOK()`); root = a thicker ring; right and wrong = `--sl-ok` and `--sl-bad` with their marks. No ring, outline or glow in `--sl-accent` inside an instrument. The classes and attributes that mark the states keep their names |
| `css/components.css` | nothing new for the pages; the hero's `.is-*` rules are the reference the page rules are written against |
| `sw.js` | `v29` |

#### B16.3 What must not change

Every name the suites pin on the drawings (29 on the Piano's, 25 on the Neck's); a scale dot on the neck is a
`circle` with `r="11.5"` whose `fill` is the note's colour and whose next sibling is its label
(`tests/colors.test.js:52-54`, `:169-172`, `:338-339`); a pressed key is filled with its degree colour
(`tests/keys.test.js:41`, `:84-87`); `data-dc`; the dimmed keys under Scale lock; what a LUMI is sent; the
palette (unless B16p was chosen).

#### B16.4 Tests

| Suite | Change |
|---|---|
| `look` | new case L18, for each of the eleven drawings in a page state that shows the states: "now" differs from "in the scale" in a property that is not a colour (a fill where the other has none, or a ring of another width); "next" is a ring without a fill; the root's ring is thicker than a scale dot's; no element inside an instrument has a stroke, an outline or a shadow in the resolved `--sl-accent`; with the palette set to one grey for all notes the three states are still told apart; a label on a dot has 4.5:1 against it |
| every suite that reads a ring or an outline of today | the step greps the suites for the class and attribute names of today's rings before it starts and lists each check it has to rewrite in the pull request (rule 13). Known to read state looks: `keys` (`41`, `84-87`), `colors`, `lights`, `lumidisplay`, `lumi-practice`, `quiz`, `chordchart`, `remote-runners`, `performance` |
| re-run only | `taps`, `lumi-contexts`, `display-master`, `practice`, `remote-keys`, `remote-quiz` |

#### B16.5 Docs, acceptance checks

`docs/DESIGN-SYSTEM.md`: the vocabulary and the table of drawings as built. `docs/NOTE-PALETTE.md`: what the
screen adds to a note's colour. `CLAUDE.md`: the note-colour convention ("now" is a filled key, not an amber
ring). `docs/INSTRUMENT-MATRIX.md`: the hero cells. Roadmap status: B16.

```
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh look keys colors lights lumidisplay lumi-practice quiz chordchart remote-runners performance practice taps
```

Look at: one contact sheet of the eleven drawings, each at rest, with "now" and "next", with the root as
"now", pressed, right and wrong, at the five Help levels where the drawing follows them, in both colour modes,
dark and light, at 390 and 1280 px; the same sheet printed in grey. Compare with
`docs/design/phase-b/instruments.html`. The Piano page with the root as "now" beside the lesson's Start
button.

#### B16.6 B16p — a new default palette (only with the owner's yes at gate G4)

Its own pull request, directly before B16. `DEGREE_DEFAULTS` (`js/app.js:1289`) takes the tokens' red-first
colours as the LUMI's table shows them (`#ff5869 #ff9a37 #ffd029 #5ffe86 #26cbe9 #557cfc #8d4def`,
`map-pages-instr.md` 3 b) and `--sl-deg-1` … `-7` follow (case T7 keeps them equal). A player's own colours
(`fb.colors`) are not touched. Four suites pin today's values and change with it: `tests/colors.test.js:16-20`,
`tests/lights.test.js:54` (the LUMI velocities), `tests/note-palette.test.js:7`, `tests/midi-ports.test.js:39`;
`docs/NOTE-PALETTE.md` too. It is "degree colors default" of the Phase C row (`docs/ROADMAP-2.0.md:59`) pulled
forward, so the roadmap's status says so. Not planned further unless chosen.

---

### B17 — Settings

**Goal.** Settings as one page of five groups (D27): Look · Sound · Keyboard and lights · Hands-free · Data and
about. Every control keeps its id and does what it does. No behaviour changes.

#### B17.1 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/settings.js` | `54` on (markup) | the eight cards become sections inside five `<details class="sl-fold" data-keep="…">` with ids `set-g-look` (Appearance `55`, Screen & battery `125`), `set-g-sound` (Sound `70`, Sound input & output `184`), `set-g-keys` (MIDI keyboard `132`), `set-g-remote` (Hands-free control `178`), `set-g-data` (Backup `112`, About `216`). The cards' ids (`set-midi-card`, `set-remote-card`, `set-audio-card`) and headings stay; `h1` "Settings"; `sl-skin` |
| `js/settings.js` | `init` | a group the player has opened or closed stays as he left it (`ui.folds`); a group he never touched is open above 900 px and closed at 900 px and below; a group opens when a link leads to one of its controls. New `App.settings.open(id)`: opens the group that holds the element and scrolls it into view; the places that send the user into Settings for one card use it (the status texts that say "Settings › MIDI", `js/lights.js:51-66`) |
| `js/settings.js` | `12-45` (CSS) | tokens only; rules that only restyle a shared class go |
| `js/remote.js` | its Settings rows (mounted into `#set-remote-card`) | tokens only |
| `js/help.js` | `134` on (the `settings` tour) | re-read with the groups closed: the tour's helper (B7b) opens the group that holds a step's target; the first step no longer names the accent (B5a) |
| `sw.js` | `8` | `v30` |

#### B17.2 What must not change

Every `set-*` id (11 suites name them; `tests/audioin.test.js` alone 53 times); Settings is an overlay page
outside the page list, toggled by the gear, never a start page; `#settings` in the address; Backup export and
import with the skipped keys of Phase A; theme dark / light / auto; master volume; keep-awake; the MIDI and
sound cards' logic.

#### B17.3 Tests

| Suite | Change |
|---|---|
| `look` | `settings` joins `RESKINNED`, at 1024 × 640 as well as the four widths. New: on a profile that never touched a group, at 1200 px all five groups are open; at 390 px they are closed, a real tap on a summary opens one and it is open again after a reload, and `App.settings.open('set-midi-card')` opens "Keyboard and lights" with the card in view; L5 for the `settings` tour at 390 px |
| suites that use Settings' controls with real input (`audioin`, `btmidi`, `multiin`, `storage-import`, `trim`, `lights`, `gear`, `oneopen`, `remote`) | no edit expected: they run at 1200 px or wider, where every group is open. A suite that opens Settings at a phone width opens the group first |
| re-run only | `pages-next`, `pages-deploy` (each names a `set-` id once) |

#### B17.4 Docs, acceptance checks

`CLAUDE.md`: the `js/settings.js` entry (five groups, `App.settings.open`). Roadmap status: B17.

```
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh audioin btmidi multiin storage-import trim lights gear oneopen remote look tokens
```

Look at, dark and light, at 360, 390, 820 and 1200 px: the page closed (five rows on a phone); each group open;
the MIDI card with a LUMI and a MODX found; the sound card with the meter; Backup after an import with skipped
keys; the page is no longer 3,050 px of cards at 1200 px without a way to find a group.

---

### B18 — Clean-up, the light-theme check, documents

**Goal.** A last check, not a second round of design: every page already passed the strict `look` cases in
both themes and at 1024 × 640 in its own step. Here the leftovers go: no soundLAB-only file reads an old
variable or holds a raw colour outside the allow list, unused icons and light-theme rules that a token now
covers are removed, and the documents describe what was built. No behaviour changes.

#### B18.1 Files modified

| File | Edit |
|---|---|
| every soundLAB module with its own light rules (six, `map-design.md` section 7, item 4) | the rules go where a token now does the job; what is left is written with tokens |
| a page module | only what the last look in light finds and a token or a component class fixes: a text under 4.5:1, a boundary under 3:1, a state told by colour alone. Each fix is a commit named for its page. A finding that needs a page's markup or more than about thirty changed lines is not fixed here: it gets its own pull request before B18 is opened |
| `tests/tokens.test.js` | the ceilings of T3 and T4 are 0 for every file that only soundLAB loads, for all 29 old names; the exception list holds the seven Gear modules, `js/scoreplayer.js` and the data palettes, each with its reason |
| `tests/look.test.js` | every soundLAB page and shell part is on `RESKINNED`; the one exception of L10 (the sheet `#css-scoreplayer`) is still the only one; `DELETED` is complete |
| `js/app.js` `ICONS` (`233-287`) | `idea`, `timer`, `trophy` go (no code names them: grep) |
| `css/style.css` | comments say what the file is now: fonts, the old variables, the bridge, base rules and the old shared classes, kept for Gear's pages until Phase H. No rule is deleted on a guess: a shared rule goes only if no element of Gear's four pages matches it in any `look` state |
| `sw.js` | `v31` |
| `CLAUDE.md` | the Phase B section is completed; VISUAL SYSTEM, the layout entries of `css/` and of every re-skinned module, the test list (four new suites) and the dev loop (`tools/shots.js`) are corrected. Lines 24-41 untouched |
| `docs/DESIGN-SYSTEM.md` | final: every number as built; the list of what Phase H inherits |
| `docs/ROADMAP-2.0.md` | "Phase B status": done; the Phase C row gains a pointer to the matrix's candidates; the Phase C and D rows gain "the wording list `docs/plans/phase-b/WORDING.md`: what Phase B did not reword" and "shorter Exercises start, Woodshed library and Plan"; Phase H gains "delete the old variables, the bridge and the old shared rules; the Player card on tokens; decide the key bar in Gear" |
| `docs/INSTRUMENT-MATRIX.md` | every cell Phase B changed is current; the candidate list is renumbered only by striking, never by moving |

#### B18.2 What must not change

Gear's pages (L16 still passes); everything listed under "must not change" in B5a-B17.

#### B18.3 Tests

The complete run. `look` and `tokens` carry the step's meaning. No other suite is edited.

#### B18.4 Acceptance checks

```
node tests/tokens.test.js                                  # ceilings 0 outside the exception list
grep -rnE "var\(--(bg|panel|card|card2|inset|line|line-soft|text|muted|label|ctl-border|accent|accent-dim|accent-glow|accent-soft|accent-line|accent-ink|warn|h-ctl|teal|green|red|blue|purple|radius|shadow-1|font-body|font-display|font-condensed)\b" js css/lumi-practice.css | grep -v "^js/\(midihub\|synth\|helix\|scoreplayer\)"     # no hits: all 29 old names
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh           # everything
python3 tools/artifact_build.py <scratch>/artifact            # still stages (not published: rule 3)
```

Look at: the full contact sheet of `tools/shots.js` — 15 pages, three sheets, the key bar's five panels, the
tour, the messages, at 360, 390, 820, 1024 × 640 and 1200 px, dark and light, soundLAB and Gear. In light, page
by page: no white text on amber, no amber text on white below 4.5:1, no card that melts into the page, the
instruments on their stage. Gear: its four pages as on the day before B0 inside the new shell, the key bar folded.

---

## 5. Phase B0: where the instrument matrix lands and how it feeds Phase C

**What it is.** `docs/INSTRUMENT-MATRIX.md` (drafted 2026-11-14 against `a914df2`, finished after the
critique; evidence in `map-matrix.md`): the matrix of four instruments against the kit of the roadmap
(`docs/ROADMAP-2.0.md:23-27`: lessons, exercises, Woodshed, Help levels, plan blocks, progress, note input),
56 cells; four findings behind most gaps; the three other Learn categories; **26 numbered task candidates** in
five groups (groundwork 1-4, guitar 5-9, bass 10-15, drums 16-20, keys and shared pages 21-26) with size, what
each waits for and the roadmap words it answers; a suggested order; the files per task; the questions for the
owner; what was not tested.

**From every gap to a task.** The roadmap's row says "each gap becomes a Phase C task"
(`docs/ROADMAP-2.0.md:58`). The first draft had no path from a cell to a candidate, and five gap cells led
nowhere (fidelity issue 14). Now each of the 37 gap cells (26 "Partly", 11 "Missing") ends with the numbers of
the candidates that close it (checked by script: 37 gap cells, 35 with at least one candidate), and a paragraph
under the table, "Gaps without a task, and why", covers the other 2 (Keys · note input by audio: chords through a microphone are
research, and keys are played over MIDI; Keys · Songs: Phase G rebuilds that page). Three candidates were
changed for it: 8 (chord charts on the neck) now names the bass as well, 17 (Pads as rhythm practice) now
holds the Help level on the pads and the microphone on Pads, and 26 is new (drum tracks in Songs). Candidates 1
and 21 answer roadmap words, not a cell, and say so.

**Where and when.** It is committed as `docs/INSTRUMENT-MATRIX.md` in **B0**, a pull request of its own and the
first of the phase, together with `docs/plans/phase-b/map-matrix.md`. So the matrix is in `v2` before any code
of Phase B, and the Phase C plan can be written from it while the drawings of B1b are still being looked at.
The file carries:

1. "Decisions for you": the seven questions. None is settled by this plan: questions 2 and 4 (where bass and
   drums live) are answered by a default in D20 and are on the owner's list (items 17 and 18), question 5 (the
   Help level on the neck in Phase B) is item 11, question 1 (does "Synth" stay) is item 14, questions 3, 6 and
   7 wait for Phase C (items 15 and 16).
2. A last section, "Changed by Phase B", which starts empty. Every Phase B step that changes a cell adds one
   line there and corrects the cell in the same pull request: B8 (where the instrument is chosen), B9 (the home
   row), B12 (the Piano's hero cell), B13 (the guitar's Help cell; candidate 6 struck as done), B14a (the
   pads' hero), B16 (the hero cells: one vocabulary), B18 (a last pass).

**How the gap list becomes Phase C's input.**

- The numbers are fixed. A candidate that is done or dropped is struck through with a reason; a new one gets
  the next number (26 is the first); the list is never renumbered.
- `docs/plans/phase-c/PLAN.md` starts from it: its section 0 has one row per candidate, saying "step C…",
  "deferred to phase …" or "dropped, because …", and one row per gap cell that has no candidate. A candidate or
  a gap cell that is missing from that table is a fault of the plan. `docs/ROADMAP-2.0.md:59` (the Phase C row)
  gets a pointer to the matrix in B18.
- The matrix's "A sensible order" (groundwork 1 and 2; drums 16-18; guitar 5 and 6; bass 10, 12, 13, 11) is the
  proposed order of Phase C's steps; candidate 6 has left it by then.
- What Phase B hands over, so that Phase C does not rebuild it: `SLHero.neck` for 4, 5 or 6 strings with a
  fretless flag (candidates 8, 10, 11); `SLHero.pads` (17, 19); the home's providers, where a neck lesson, a
  bass lesson or a rudiment becomes "the next step" by one call (5, 12, 18, 22); the Instrument sheet, the one
  place where "Bass, 5 strings, fretless" will be chosen (1); the four judgement tokens (16-19); the practice
  page template with its folds (5, 12, 17); one lighting vocabulary on every drawing (5, 10, 17).
- The owner's answers to the matrix questions are copied into the text of the B0 pull request and, when given,
  into the matrix itself.

---

## 6. Deliberately deferred

| What | Why not in Phase B | Where it goes |
|---|---|---|
| Neck lessons, bass necks, fretless, drum lessons, rudiment course, rhythm exercises | Phase C by the roadmap (`docs/ROADMAP-2.0.md:59`) | Phase C, candidates 1-26 |
| The practice pages drawing their instrument with `js/hero.js` | suites pin 29 names of the Piano's drawing and 25 of the Neck's; replacing a drawing is a rebuild, not a re-skin (D29) | Phase C, with candidates 5, 10 and 17 |
| A new default palette (red-first, as the mockup has it) | four suites pin today's values and the LUMI's colours change with it (D12) | the owner's choice at gate G4: if chosen, step B16p; if not, Phase C ("degree colors default") |
| Removing "Synth" from the instrument list, an instrument table | six files spell the ids (D23) | Phase C, candidate 1 |
| A shorter Exercises start, Woodshed library and Plan; the rest of the wording list | deciding what leaves a page is content work; Phase B changes the look of the nine tool pages, not their arrangement (D28, owner item 6); Phase B rewords only first-screen lines (rule 16) | Phase C and D; B18 writes both into their roadmap rows |
| Pads as rhythm practice; Record and Play loop | Phase C by the Phase A plan | Phase C, candidate 17 |
| Weekly plan, teacher's notes, review, "pass 2 of 3" on the home; opening on the home each day | no stored data today (D21, D22) | Phase D, through `App.home.provide` |
| One shared chart helper for Exercises and Practice progress | two working chart builders; consistency work | Phase D |
| Progress from the Neck, Pads and Jam | changes what is recorded (rule 8) | Phase C, candidate 4 |
| Light modes of the LUMI beyond on and off in the key bar; Pads through the keybed engine; next chord on the lights | LUMI phase | Phase E (candidate 25) |
| An "FL Studio" status in the header | nothing to report before Phase F | Phase F |
| The Songs library | Phase G | Phase G |
| Gear's page design; deleting the old variables, the bridge and the old shared rules; the Hub's and Helix's own toasts; `confirm()` and `prompt()` in Gear's modules; whether Gear keeps the key bar and the metronome; `js/scoreplayer.js` on tokens | Phase H owns Gear (D13, D14) | Phase H |
| A new font file (Barlow 600) | D34 | only if the owner asks after B3 |
| `APP_VERSION`, `version.json`, the APK, the claude.ai artifact | rule 3 | Phase I |
| Pictures compared in CI | D38 | not planned |

**Room left on purpose.** The home takes its steps from providers, so a neck lesson, a rudiment or the weekly
plan is one call (Phases C and D). The neck drawing takes any list of strings and a fretless flag (Phase C).
The LUMI lights panel of the key bar is a panel, not a toggle, so light modes fit in it (Phase E). The header's
status chip is one of a row, so an FL Studio chip fits beside it (Phase F), and the Key chip's panel is where
"the key comes from FL Studio" will be said. The Instrument sheet is a sheet, so
strings, tuning and clef fit under the choice (Phase C, candidate 1). `.sl-skin` is a class, so Phase H re-skins
Gear by adding it to four panels, and deletes the bridge and the old rules when the last panel carries it.

---

## 7. Risks

| # | Risk | What would show it | Fallback |
|---|---|---|---|
| 1 | The bridge changes more than colour: a canvas or an SVG that reads an old name at draw time ends up unreadable in light | the light pictures of B2; the per-page count of low-contrast texts in `look` rises | take that one name out of the bridge until its page step |
| 2 | A `:where(.sl-skin)` rule loses to an old rule of more weight, leaving a half-old control. Known today: one rule, the light theme's select chevron (`css/style.css:116-121`), which the select component out-weighs on purpose (D6). `.btn.primary` and `.card h2::before` weigh the same as their `:where()` twins and lose by order | the gallery and a page disagree in the pictures; `look` L10 finds a computed colour that is no token | for that rule only, write `:root .sl-skin .x` (still cannot match Gear) |
| 3 | Gear's pages change after all: a rule without the marker, a property inherited from a shell container, or a rule that left `css/style.css` although a Gear page used it (`.icon-btn` was one, D13) | `look` L16 names the element and the property, L17 the selector | the rule moves under `.sl-skin` or comes back into `css/style.css`; inherited properties are set on shell parts, never on `main`; `html` and `body` get the ground colour only |
| 4 | The shell from JavaScript (B4) flashes or shifts the page at the first paint, or a script error leaves no header | a picture taken at `DOMContentLoaded`; `look` L12 and L14; `smoke` | `js/shell.js` runs before any module and has no dependency but `App.app`; if the step cannot be made invisible it is dropped alone and B5a-B8 edit both HTML files in one commit each (rule 9 as it stands today) |
| 5 | The key bar's five chips do not fit one row at 360 px (the planner's arithmetic leaves 4 px), or its one row does not hold the lock's sentence at 1024 px | the drawings of B1b; `context-global` at 360 and 1024 px with the longest name of `Theory.SCALES` | on phones the bar keeps today's 12 px side gutter and the Help chip shows its dots without the level's name; above 900 px the labels go first, then the sentence takes its short form; the lock's word never goes |
| 6 | Header, key bar and bottom tab bar together are too much on a phone held sideways (390 px high) | pictures at 844 × 390; `taps` | below 480 px of height the key bar slides away with the header; it returns on any scroll up |
| 7 | A rewritten suite hides a regression (B5a replaces `context-global`, five suites lose their start-page checks in B9) | the pull request lists every replaced check beside its equal (rule 13); the number of checks per suite is in the text and may fall only by the listed deletions | split the commit; restore the old check beside the new one for one step |
| 8 | CI gets too slow: `look` grows with every page | the run's duration on the pull request (40 minutes allowed after B2) | loose cases at two widths (390, 1200) only; strict cases keep all widths |
| 9 | CI's Chromium (build 1234) and a developer's (1243) differ by a pixel or a rounding in contrast | `look` fails on CI only | tolerances are part of the suite from the first day: 1 px for boxes, 0.05 for ratios |
| 10 | The home's step is wrong or thin for an instrument: a drummer's fresh home reads "Chords in a key · Theory", because that is all the course has for drums today (matrix: Drums · Exercises is "Missing", candidate 20); a plan block that cannot start | `home` cases 1, 3 and 4 for the four instruments; the drawings | a provider that cannot start returns nothing and the next one is asked; the last resort is the headline "Pick something to practise" with the entry points; for drums the instrument's entry points ("Drum pads", "Drum & rhythm library") are the first rows of "Something else" |
| 11 | The one-time landing annoys, or repeats when storage cannot be written | `home` case 6; `storage-import:899` | drop the landing (owner item 4) |
| 12 | With `#pn-assist`, `#fb-colmode` and the sheet's Help section gone, the Help level is two taps away while playing and hard to find | the owner's look at B5b and B12 | the Keyboard lights sheet keeps its one line that says where the two went (B5b); if that is not enough, the Piano page gets a "Help: Colors" button in its always-shown row that opens the bar's panel, as the lessons have |
| 13 | A closed fold hides a control that a link or a tour points to (Piano, Pads, Settings on a phone) | `look` L5 with the folds closed; the cases of B12, B14a and B17 | the tour opens the fold (B7b); `App.settings.open` for links; if a control is asked for daily, it moves out of its fold |
| 14 | Text looks thinner once the browser no longer fakes bold weights | the B1b drawings and the B3 gallery beside today's app | one more font file, Barlow 600 (self-hosted, OFL), as an owner decision after B3 |
| 15 | A user's own note colours make a label unreadable | not covered by `hero` (it tests the defaults) | `inkOn` picks the ink per colour at run time, so the better of two inks is always used; the ring is fixed |
| 16 | The stack: 24 pull requests on top of five of Phase A that are not merged. A change to an early one means merges through every branch above it | conflicts in `js/app.js`, `sw.js:8`, `tests/run.sh:17`; a reviewer who sees Phase A in every diff | at most three open at a time and three stop points (rule 2); the compare link shows a step alone; Appendix D lists the shared lines; cache numbers are given out again in merge order (they only have to rise); every edit is named by function, not by line |
| 17 | Engines the suites do not run (Safari on the iPad, the Android WebView): `:where()`, `inert`, `display: contents`, sticky inside the new shell, the safe-area inset of the key bar | no suite can show it | the owner uses the beta on the iPad and the phone at the three stop points, which is why they exist: a step reaches the beta only by a merge (owner item 13); `inert` gets a scripted stand-in (focus guard and `aria-hidden`), `display: contents` a flex wrapper |
| 18 | The claude.ai artifact build breaks on the script-built shell | `python3 tools/artifact_build.py` in B4's and B18's checks | the build script is edited in Phase I, where the artifact is republished |
| 19 | A gate stays open: the owner has not answered a drawing | the step's branch is not opened | the steps that do not depend on it go on (B2-B4 without G1-G3; the pages B10-B15b and B17 without G4); nothing is built "on the default" behind a gate |
| 20 | The home's instrument does not reach its minimum height (a quarter of the window; 22 % at 1024 × 640) under a two-line headline | B1b's measured drawings; `home` case 2 | placement B has one row of chrome less than A; the 56 px headline in low windows; if it still fails at 1024 × 640, the detail line and "Something else" move beside the button, as in the mockup |
| 21 | The message at a flip of the lock replaces a message a suite or a player was reading (`#app-toast` is one element: a new text replaces the one before it, as today) | the suites that click `#cx-lock` (`context-global`, `lights`) and then read `#app-toast` | a flip made by code shows no message (D16); if a real flip still collides, the lock's message gets its own element in the stack from B7b on |
| 22 | With placement A the five Learn pills do not fit one row at 360 px | `tests/practiceplan.test.js:404-415`; the planner's measure: with 14 px side padding "Plan" wraps, with 8 px and 13 px text the five end at x = 311 | the pill component's narrow style at 380 px and below; or the label "Course" for "Exercises" |

---

## 8. Order of test runs

Cloud sessions: `NODE_PATH=/opt/node22/lib/node_modules`; `tests/run.sh` serves the repository on port 4573
itself. The base for a before / after comparison is a second worktree served on another port and passed to
`tools/shots.js --url`.

1. **After every commit, seconds:** `node tests/assets.test.js`, `node tests/tokens.test.js`, and from B3
   `node tests/hero.test.js`.
2. **While working on a step:** `tests/run.sh look` (about 90 s) and the step's own list, which is the last
   block of its acceptance checks.
3. **Whenever a fixed bar or the Exercises page changed** (B4-B10, B12, B13): `tests/run.sh taps` (276 s). It is the
   only suite that proves a tap lands.
4. **Shell steps B4-B9, before pushing:** `tests/run.sh assets look nav context-global gear smoke trim
   storage-import quiz practice remote remote-gear taps`.
5. **Before the pull request is opened:** the complete run, `tests/run.sh` with no argument (67 suites took
   15 min 24 s on `a914df2`, `map-tests.md` section 4; about 17 minutes with the four new ones). Then
   `tools/shots.js` on the base and on the branch, and the agent opens the pictures (rule 13).
6. **After merging `v2` into a later branch:** `assets tokens look smoke` at once; the complete run before the
   pull request leaves draft.
7. **CI** runs the one command it runs today, `bash tests/run.sh` (`.github/workflows/tests.yml:55`). No step
   adds a second command, an argument or a skip (`tests/pages-deploy.test.js:53`).

When a complete run fails, read it in this order: the pure Node suites (`assets`, `tokens`, `hero`,
`fingering`, `note-palette`), then `smoke` and `look`, then the shell suites of item 4, then the page suites,
`taps` last.

---

## 9. For the owner

Phase B changes how the whole app looks, and most of it has never been drawn. So the third pull request of the
phase (B1b) brings no code, only drawings you can open in a browser, and one page,
`docs/design/phase-b/index.html`, that lists every question below beside the drawing that answers it. Four of
the questions are **gates**: the step that builds the thing is not started before you have said yes, or said
what to change. For all the others the default is built unless you say otherwise.

**The four gates**

| Gate | What you look at | The question | What waits |
|---|---|---|---|
| G1 | the key bar on a phone, a tablet and a desktop (`shell.html`) | Is this the bar? On a phone it is five small buttons that open panels; from tablet width up the Scale lock says in words what it does. Each time you flip the lock a short message says it too. The time signature moves to the metronome sheet | B5a and everything after it in the shell |
| G2 | the header (`shell.html`) | Logo, tabs, your instrument, the keyboard's state in words, and on a phone one "More" button for the rest. The word "beta" beside the logo at the beta address; "alpha" goes | B6, B8 |
| G3 | the home for piano, guitar, bass and drums (`home.html`) | Where does the home sit: as a page of its own that the logo leads to (proposed), or as "Today" inside Learn? The button says "Start" only when a tap starts playing; otherwise "Open the Tuner". The picture of your instrument shows the scale and nothing else | B9 |
| G4 | keyboard, neck and pads with lit notes, in two sets of colours (`instruments.html`) | Is this how "play this now", "next" and the root should look? And which colours: today's, where the root is amber like the Start button, or the mockup's, where the root is red? | B16 (and B16p, only if you pick the red-first colours) |

**Decided by default; say so if you want something else**

1. **The key bar on a phone** (part of G1). The bar never slides away. So that one stray touch cannot switch
   the Scale lock, a tap on the lock opens a small panel with the switch and the sentence.
2. **The accent colour picker goes** (with G1). The design says amber is the only accent. Teal, violet and
   coral would mean checking every screen four times, and the new parts would ignore the choice anyway.
   *Default:* removed with the key bar (B5a); a stored choice is left alone and no longer used.
3. **Your instrument is in the header** (part of G2), on every page, with the word "Practising" so that
   "Guitar" on the Keys tab is not a riddle. The bar above the four Learn pages goes. *Default:* yes (B8).
4. **What opens when you start the app.** As today, the page you were on last. New: everybody sees the home
   once, and the logo always leads to it. The home shows only real numbers: minutes against your goal, your
   streak, your plan's blocks; no teacher's name, no "pass 2 of 3", no week count and no FL Studio light until
   the app stores those (Phases D and F). If you have not given the app a plan of your own, the home offers the
   next Exercises level, not the starter plan's "Tune up". *Other choice:* open on the home at the first start
   of every day; planned for Phase D.
5. **soundLAB Gear until its own phase.** Gear gets the new header, sheets and messages. Its key bar stays
   folded behind one button, as it is behind the clef today, so that a stray touch during a gig cannot switch
   the Scale lock. Its four pages look exactly as today until Phase H redesigns them, so for a while the frame
   and the pages will not match: `gear.html` among the drawings shows it. *Other choice:* re-colour Gear's
   pages now; cheap, but nobody has checked those screens for readability.
6. **Nine pages keep today's arrangement.** Exercises' start, Chords, Circle, Plan, Charts, Songs, Jam, the
   Woodshed's library and the Tuner get the new colours, type, one headline, one main button and bigger
   controls, but they stay as long and as full as they are (Exercises' start is about ten screens on a
   desktop). "One thing on screen" is built for the home, Piano, the neck pages, Pads, a question and a run.
   Making the nine shorter means deciding what leaves each page; that is planned for Phases C and D.
   `pages.html` shows the three heaviest. *Other choice:* tell us which of them must be rebuilt now.
7. **Smaller rows for the mouse.** The design says every control is 44 px high. In long lists (the Woodshed's
   library, Settings, Piano's folded rows) the plan would use 36 px when you work with a mouse, and 44 or 48 px
   as soon as the device has a touch screen. `pages.html` shows one row at both heights. *Default:* 36 px with
   a mouse. Say no and every row is 44 px.
8. **Note colours** (part of G4). Unless you pick the red-first set, the colours stay as they are. The seven
   colour values in the design's token file were never what the app shows; they now hold the app's seven
   colours (no answer needed).
9. **Help level and note colours are set in the key bar only.** They leave the Piano page and the lights
   sheet, which is then called "Keyboard lights". "Color notes by" sits in the Help panel, with the words
   "Degree" and "Note name". *Other choice:* keep a second place for them.
10. **Chords follows the one tempo.** Its own tempo box will show and set the tempo of the key bar.
    *Default:* yes (B11).
11. **The Help level also works on the guitar neck** in Phase B (B13), because the Help control is in the key
    bar on every page. *Other choice:* leave it for Phase C; the step then only re-skins the neck.
12. **The beta looks half-done for a while.** From the key bar's step until the last page, the beta shows the
    new frame around pages in the old layout, one page changing with each merge. *Other choice:* we hold the
    page steps back and you merge them together; that makes one very large merge.
13. **How you see a step, and how fast the pile grows.** None of Phase A's five pull requests is merged yet,
    and Phase B adds 24. We open at most three at a time and stop at three points (after the drawings, after
    the groundwork, after the home) until you have merged. Each pull request has a link that shows that step
    alone. The beta address shows a step only after you merged it; that is the only way to try it on your iPad
    or phone, because the claude.ai copy of the app is not republished before the release. Pictures are never
    put into the repository (it is published as a whole). *Proposal:* each pull request comes with a private
    claude.ai page of before / after pictures at phone, tablet and desktop width, dark and light; publishing
    such a page needs your yes once. *Also possible, each only with your yes:* a second preview address for
    the newest unmerged step (a change to the deploy workflow), or an upload of the pictures from CI (a change
    to the workflow that also guards both deploys). The CI time limit goes from 30 to 40 minutes in B2.

**From the instrument matrix**

14. **Does "Synth" stay in the instrument list?** Phase B moves Synth, Voice and Other under "More" and keeps
    all seven. Taking Synth out is a Phase C task.
15. **What should "fretless" do first?** Proposed: a neck without fret wires; intonation practice after it.
    Phase C.
16. **Two smaller ones for Phase C:** may a bass note be recognised a little later than a guitar note
    (proposed: yes, for bass only), and are rudiments graded per hand (proposed: yes on pads and an e-kit).
17. **Where does bass live?** Proposed: on the Guitar tab; Neck, Tab and Notation draw the instrument you
    chose. The header is built in Phase B with five tabs either way, so the answer can wait until Phase C
    starts.
18. **Where do drums live?** Proposed: Pads stays under Keys through Phase B and moves next to the neck when it
    is rebuilt in Phase C.

**One housekeeping question**

19. `CLAUDE.md` has a paragraph at the top that Phase A was told not to touch, because another pull request
    was rewriting it. That pull request is merged. Two of its sentences are no longer true. May we correct it?
    *Default:* it stays untouched and the Phase B section says what is out of date.

---

## Appendix A — The shell after B8 (what `js/shell.js` writes)

A sketch that pins ids, order and nesting; attributes that do not matter here are left out. Parts marked "main"
are written in soundLAB only, parts marked "Gear" in Gear only.

```html
<header class="topbar sl-skin">
  <a class="brand" id="home-link" href="index.html">…wordmark SVG… <span class="tag">beta</span></a>   <!-- the tag: "beta" in soundLAB at the beta address, "gear" in Gear, else none -->
  <nav id="tabbar"></nav>
  <div class="tb-tools" id="tabs">
    <button id="inst-btn" class="sl-kchip"></button>                                                  <!-- main -->
    <button id="cx-toggle" class="sl-kchip" aria-expanded="false" aria-controls="ctxbar"></button>    <!-- Gear -->
    <button id="tb-more-btn" aria-expanded="false" aria-controls="tb-more"></button>
    <div id="tb-more">
      <button id="lights-btn" class="sl-status"><span class="sl-status-dot"></span><span class="sl-status-name"></span><span class="sl-status-text"></span></button>
      <button id="help-btn"></button>
      <button id="settings-btn"></button>
      <a id="app-switch" href="gear.html">Gear</a>
    </div>
    <button id="met-btn"></button>
  </div>
  <div id="subnav" class="sl-skin"></div>
</header>
<div id="ctxbar" class="sl-keybar sl-skin" role="region" aria-label="Global key, scale, tempo and sound settings">   <!-- Gear: starts with hidden -->
  <button id="cx-key" class="sl-kchip" aria-expanded="false" aria-controls="cx-pop-key"></button>
  <button id="cx-tempo" class="sl-kchip" aria-expanded="false" aria-controls="cx-pop-tempo"></button>      <!-- displayed at 640 px and below -->
  <div id="cx-pop-tempo" class="sl-pop sl-stepper">                                                         <!-- laid out in the bar above 640 px -->
    <button id="cx-met"></button><button id="cx-bpm-dec"></button>
    <input id="cx-bpm" type="number" min="30" max="280"><button id="cx-bpm-inc"></button>
  </div>
  <button id="cx-lockchip" class="sl-kchip" aria-expanded="false" aria-controls="cx-pop-lock"></button>    <!-- displayed at 640 px and below -->
  <div id="cx-pop-lock" class="sl-pop">                                                                     <!-- laid out in the bar above 640 px -->
    <button id="cx-lock" class="sl-switch" aria-pressed="false" aria-describedby="cx-lockhint"></button>
    <span id="cx-lockhint"></span>
  </div>
  <button id="cx-lights" class="sl-kchip" aria-expanded="false" aria-controls="cx-pop-lights"></button>
  <button id="cx-help" class="sl-kchip" aria-expanded="false" aria-controls="cx-pop-help"><span class="sl-dots"></span></button>
  <div id="cx-pop-key" class="sl-pop" hidden>
    <select id="cx-root"></select><select id="cx-scale"></select>
    <span id="cx-mode-wrap"><select id="cx-mode"></select></span>
  </div>
  <div id="cx-pop-lights" class="sl-pop" hidden>
    <button id="cx-led"></button><p id="cx-tnote"></p><button id="cx-open-lights"></button>
  </div>
  <div id="cx-pop-help" class="sl-pop" hidden>
    <div class="seg"><button data-cxhelp="4"></button> … <button data-cxhelp="0"></button></div>
    <div class="seg cx-colors"><button data-cxcolormode="interval"></button><button data-cxcolormode="note"></button></div>
  </div>
</div>
<nav class="tabbar tabbar-bottom sl-skin" id="tabbar-m"></nav>
<div class="sheet" id="sheet-metronome" hidden><div class="sheet-card sl-skin">… <section class="sheet-body" id="panel-metronome"></section></div></div>
<div class="sheet" id="sheet-lights" hidden><div class="sheet-card sl-skin">… <section class="sheet-body" id="panel-lights"></section></div></div>
<div class="sheet" id="sheet-instrument" hidden><div class="sheet-card sl-skin">… <section class="sheet-body" id="panel-instrument"></section></div></div>   <!-- main -->
<main>…the panels, in the HTML file…</main>
<footer class="foot"></footer>
<div id="sl-float" class="sl-skin"><div id="sl-toasts" class="sl-toasts"></div></div>
```

The values of `data-cxcolormode` are the ones in use today (`js/app.js:1648`); the step keeps whatever they
are. The order of the parts is today's (`index.html:20-102`: header, the phone tab bar, the sheets, `<main>`,
the footer), with the key bar moved out of the header to directly after it, the third sheet added, and
`#sl-float` as the new last element. `js/shell.js` writes everything before `<main>` in one string and
everything after it in a second. The two panels that have no `hidden` here get and lose it by script at 640 px
and below (D16). The sheet bodies are `sheet-body`, never `panel` (`css/style.css:461-462`).

---

## Appendix B — Components and their class names

New classes all start with `sl-` (no class in `js/`, `css/` or the HTML files does today: grep). Shared classes
keep their names and get their new look only inside `.sl-skin` (D6).

| Component | Class or classes | Built in | Notes |
|---|---|---|---|
| Marker | `.sl-skin` | B3 | sets the body face, `font-synthesis-weight: none`, the ink colour |
| Button | `.btn`, `.btn.primary`, `.btn.sm`, `.btn.ghost`; hero size `.sl-hero-btn` | B3 | 44 / 48 px; small is the dense tier; one primary per view |
| Icon button | `.icon-btn` | B3 | square, 44 / 48 px, needs a name |
| Chip | `.chip` | B3 | on = fill and a check mark, not colour alone |
| Segmented control | `.seg` | B3 | wraps into separate rounded segments |
| Field, select, number, range | `.field`, `label.field`, `select`, `input`, `.select` | B3 | chevron from the icon set in the ink colour |
| Switch | `.sl-switch` | B3 | a `button` with `aria-pressed`; knob moves, fill changes, word beside it |
| Stepper | `.sl-stepper` | B3 | −, a typed number, + |
| Card | `.card` | B3 | no title dot; tool pages and Settings only |
| Rows | `.sl-rows`, `.sl-row`, done state `.sl-row.is-done` | B3 | lists inside a card (library, plan blocks, settings rows); done = a check mark and the word "Done", not a colour alone |
| Fold | `details.sl-fold`; remembers with `data-keep="<name>"` | B3 (first kept fold: B12) | summary 44 / 48 px with a caret; `details.tips` keeps its name and takes this look; the state of a kept fold is in `ui.folds` |
| Tile and ring | `.sl-tile`, `.sl-ring` | B3 | a number with its label; the goal ring |
| Meter and bar | `.sl-bar` | B3 | level, progress, clock |
| Readout | `.sl-readout` | B3 | big tabular numbers (tempo, tuner, streak) |
| Eyebrow, headline, footer line | `.sl-eyebrow`, `h1` inside `.sl-skin`, `.sl-footline` | B3 | Bebas for the `h1` |
| Hint and screen-reader text | `.sl-hint`, `.sl-sr`; `.hint`, `.sr` keep working | B3 | |
| Empty, loading, error | `.sl-empty`, `.sl-loading`, `.error` | B7b | words plus an icon; loading is still when motion is reduced |
| Two-tap confirm | `.sl-confirm` | B11 | the button's armed state for 3 s |
| Key bar | `.sl-keybar`, `.sl-kchip`, `.sl-dots` | B5a | Appendix A; five chips, five panels |
| Popover | `.sl-pop` | B5a | under its chip above 900 px, bottom panel at 900 px and below; the Tempo and Scale lock panels sit in the bar above 640 px |
| Status chip | `.sl-status`, `-dot`, `-name`, `-text` | B6 | words carry the state |
| Tabs and pills | `.tabbar-btn`, `.subtab` inside `.sl-skin`; the goal mark with `.sl-goal-sr` | B6 | the pills' narrow phone style is the component's own |
| Sheet | `.sheet`, `.sheet-card`, `.sheet-body` | B7a | right panel 440 px / bottom sheet |
| Message stack | `#sl-float`, `.sl-toasts`, `.sl-toast`, `-bad`, `-action` | B7b | ids of the six messages kept; `#sl-float` is the one body-level `.sl-skin` container |
| Tour card | the classes of `js/help.js`; `#hp-ov.sl-skin` | B7b | a dialog; opens a closed fold around its target |
| Instrument heroes | `.sl-hero`, `.sl-kbd`, `.sl-neck`, `.sl-pads`; states `.is-scale`, `.is-now`, `.is-next`, `.is-root`, `.is-press`, `.is-right`, `.is-wrong` | B3 (drawings), B9 (first use), B16 (the same vocabulary on the pages' own drawings) | colour arrives as `--c` on the element |
| Cross-page classes | `.fb-chip`, `.fb-stroke`, `.fb-field`, `.jam-now`, `.sr`, `.hint` | B3 | defined once, with today's values, until their owners' steps |

---

## Appendix C — Token changes (B1a) and the bridge (B2)

**New tokens**

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sl-surface-sunken` | `#0a090b` | `#e7e0d3` | wells, inputs inside cards (old `--inset`) |
| `--sl-stage` | `#0a090b` | `#2a2429` | the ground under an instrument; dark in both themes so ivory keys stand off it (ivory on it 15.9:1 and 12.2:1) |
| `--sl-line-control` | `#80767e` | `#857b82` | the boundary of a control (at least 3.1:1 on the five surfaces) |
| `--sl-ink-soft` | `#cbc3c9` | `#4a4248` | secondary text, field labels (old `--label`) |
| `--sl-accent-text` | `#ffab47` | `#8a4a00` | amber as text and as the focus ring |
| `--sl-accent-deep` | `#c97f26` | `#9f5606` | the old `--accent-dim`: the dark end of a gradient, a hover border; never text. As a graphic at least 4.9:1 on the three dark surfaces it was tried on and 4.2:1 on the light sunken one (computed by the planner for the revision; T1 computes it again) |
| `--sl-accent-glow-color` | `rgba(255, 171, 71, 0.28)` | `rgba(201, 111, 10, 0.22)` | the colour inside `--sl-accent-glow`, for the old `--accent-glow` |
| `--sl-judge-perfect` | `#4cc9b0` | `#12806b` | Woodshed and lesson judgements, always with their word |
| `--sl-judge-great` | `#8bd450` | `#3f7a14` | |
| `--sl-judge-good` | `#ffd166` | `#8a6300` | |
| `--sl-judge-miss` | `var(--sl-bad)` | `var(--sl-bad)` | |
| `--sl-key-line` | `#6b6168` | `#6b6168` | a key's outline (4.75:1 on ivory) |
| `--sl-key-press` | `#cfc5b6` | `#cfc5b6` | a pressed key without a note colour; the press is also shown by the key's shadow |
| `--sl-nut` | `#d8cdb8` | `#d8cdb8` | the neck's nut, on the stage (12.6:1 and 9.7:1); today two raw colours on `:root` (`js/fretboard.js:1768`) |
| `--sl-ink-on-color` | `#1a1206` | `#1a1206` | a label on a note colour |
| `--sl-ink-on-color-light` | `#ffffff` | `#ffffff` | the same on the two dark colours of today's palette (4.56:1 and 4.77:1, where the dark ink has 4.06 and 3.88) |
| `--sl-control-h-hero` | `64px` | | the one Start button |
| `--sl-control-h-dense` | `36px`; `48px` where `any-pointer: coarse` matches | | rows of a list with a mouse (D9; 44 px if the owner says no) |
| `--sl-weight-regular`, `-medium`, `-cond`, `-cond-bold` | `400`, `500`, `600`, `700` | | the weights that have a file |
| `--sl-z-bar`, `-pop`, `-full`, `-sheet`, `-tour`, `-toast`, `-drag` | `50`, `60`, `200`, `420`, `500`, `600`, `700` | | D10 |
| `--sl-paper`, `--sl-paper-ink`, `--sl-paper-ink-soft`, `--sl-paper-accent` (added in B14a) | `#ffffff`, `#000000`, `#333333`, `#c0262d` | the same | print |

**Changed values**

| Token | Today | After B1a | Why |
|---|---|---|---|
| `--sl-accent-ink` (light) | `#ffffff` (3.64:1 on the light amber) | `#1a1206` (5.08:1) | text on the accent |
| `--sl-ink-muted` (light) | `#6d646b` (4.34:1 on the sunken surface) | `#645b62` (4.98:1 or more) | |
| `--sl-ok` (light) | `#1f8a46` | `#156b33` (5.03:1 or more) | |
| `--sl-warn` (light) | `#9a5a0c` | `#8a500a` (4.95:1 or more) | |
| `--sl-bad` (light) | `#c23434` | `#b32e2e` (4.78:1 or more) | |
| `--sl-info` (light) | `#2f68c8` | `#2a5fb8` (4.67:1 or more) | |
| `--sl-key-white`, `--sl-key-black` (light) | `#ffffff`, `#2a2429` | not re-inked: `#ece5db`, `#1b171c` in both themes | D31 |
| `--sl-deg-1` … `--sl-deg-7` | `#ff4d4d #ff9a3c #ffd23f #4cd964 #34d0e0 #4d7dff #b36bff` | `#ffab47 #e8d44d #7ad97a #4cc9b0 #6ea8fe #b48ef0 #ff85b3` | the app's seven defaults (`js/app.js:1289`), kept equal by case T7; they change again only with B16p (D12) |
| the touch query of `--sl-control-h` | `(pointer: coarse)` | `(any-pointer: coarse)` | a laptop with a touch screen (D4) |
| `--sl-focus` | a translucent 3 px ring (1.7:1 in light) | `0 0 0 2px var(--sl-bg), 0 0 0 4px var(--sl-accent-text)` in both themes | 3:1 on every surface |
| `--sl-z-bar`, `--sl-z-sheet`, `--sl-z-toast` | `20`, `40`, `60` | `50`, `420`, `600` | D10 |

All ratios are from `work-plan/contrast.js` (the planner's script; B1a's `tokens` suite computes them again from
the file), except the two rows added in the revision, which say so. Everything not listed stays.

**The bridge** (B2, in `css/style.css` after line 108; soundLAB only)

```css
:root:not([data-app="gear"]) {
  --bg: var(--sl-bg);            --panel: var(--sl-bg-raised);     --card: var(--sl-surface);       --card2: var(--sl-surface-2);
  --inset: var(--sl-surface-sunken);  --line: var(--sl-line-strong);  --line-soft: var(--sl-line);
  --text: var(--sl-ink);         --muted: var(--sl-ink-muted);     --label: var(--sl-ink-soft);     --ctl-border: var(--sl-line-control);
  --accent: var(--sl-accent);    --accent-dim: var(--sl-accent-deep);   --accent-glow: var(--sl-accent-glow-color);
  --accent-soft: var(--sl-accent-soft);  --accent-line: var(--sl-accent-line);  --accent-ink: var(--sl-accent-text);
  --warn: var(--sl-warn);        --green: var(--sl-ok);            --red: var(--sl-bad);            --blue: var(--sl-info);
  --shadow-1: var(--sl-shadow-1);
}
```

The old names are defined at `css/style.css:42-75` (dark) and `:81-108` (light): 29 of them. The block has the
weight of the light block and comes after it, so it serves both themes, and the token behind each name follows
the theme. It maps the 22 colour names. Not bridged, and still among the 29 that `tokens` T4 counts down:
`--teal` (9 uses in soundLAB's files: `js/jam.js` 3, `js/keylessons.js` 1, `js/quiz.js` 1,
`css/lumi-practice.css` 4; they go in those pages' steps, to `--sl-judge-perfect` or a note colour),
`--purple` (no use outside Gear's modules), `--h-ctl` (`:64`; 5 uses), `--radius` (2 uses) and the three font
names (63 uses; the stacks are the same as the tokens'). Counts by the planner's grep, Gear's modules and
`js/scoreplayer.js` left out.

---

## Appendix D — Lines that several steps edit

| Place | Steps | What each does |
|---|---|---|
| `sw.js:8` `CACHE` | all but B0 and B1b | the next number (section 3) |
| `sw.js:9-103` `ASSETS` | B3, B4, B9 | `css/components.css`; `js/shell.js`; `js/hero.js`, `js/home.js` |
| `tests/run.sh:17` | B1a, B2, B3, B9 | `tokens`; `look`; `hero`; `home` |
| `index.html`, `gear.html` | B3 (stylesheet), B4 (shell out, script in), B6 (line 6), B9 (`index.html` only: panel, two scripts) | |
| `js/app.js:76-93` `APPS`, `HOME` | B4, B5a, B9 | `home:` named; `keybar:` named; the `home` page |
| `js/app.js:233-287` `ICONS` | B6, B18 | two added; three removed |
| `js/app.js:802-868` | B2, B3, B5a, B6 | `App.token` and Gear's browser-bar colour; the fold memory; the accent code out; one browser-bar colour again |
| `js/app.js:936-973` navigation | B6 | the goal mark's words in `populateNav`; `aria-current` on the open pill |
| `js/app.js:1092-1167` | B5a | panels; the key bar stays when the header hides |
| `js/app.js:1211-1255` sheets | B5a (`1219-1221`), B8 (`1211`) | |
| `js/app.js:1379-1392` `backStep` | B6 | the More panel |
| `js/app.js:1486-1491` `wireSheets` | B6 | the icon only into `#met-btn` |
| `js/app.js:1525-1758` `wireContextBar` | B5a | rewritten |
| `js/app.js:1796-1986` `boot` | B4 (`.tab` handler), B6 (wordmark, status, More), B9 (`1808`, the landing before `1928`) | |
| `js/app.js:2002-2067` | B4, B5a, B7b | `App.chromeTop`; the accent names leave the public object and the key bar joins `chromeTop`; `toast` into the stack |
| `js/shell.js` | B4 (new), B5a, B5b, B6, B7a, B7b, B8 | key bar; the sheet's name; header; sheet cards; `#sl-float`; instrument chip and sheet |
| `css/tokens.css` | B1a, B14a | B14a adds the four print tokens (B16p would change the seven degree values) |
| `css/style.css` | B2 (bridge, `[hidden]`), B4 (`450-453`), B5a (`382-448`, `972-979`), B6 (header, tabs, pills; `288` stays), B7a (sheets), B7b (messages), B18 (comments) | by the end: fonts, old variables, bridge, base rules, old shared classes. Every removed selector is on `DELETED` (L17) |
| `tests/fixtures/style.phase-a.css` | B2 (new) | never edited |
| `css/components.css` | B3 (new) and every later step | |
| `js/help.js` | B5a (texts, `135`), B5b (`39`, `126-128`), B6 (`266-276`), B7b (dialog, `reveal`), B8 (`84`), B9 (`home` tour), B12 (`55-61`), B13 (`39`, three tours), B14a (`122-124`), B17 (`settings` tour) | |
| `js/lights.js` | B5a (texts), B5b (Help and colours out), B7a (CSS) | |
| `js/practiceplan.js` | B5b (`306`, `319`), B6 (`350`), B9 (`nextOpen`), B11 (the page) | |
| `js/quiz.js` | B4 (`1273`), B7b (`2887-2895`), B9 (`2948-2952`, `SLQuiz.next`), B10 (the page), B16 (the question pictures) | |
| `js/keylessons.js` | B4 (`305`), B5a (`575`), B5b (`569`, `775`), B12 (CSS, `788-789`, `300-307`) | |
| `js/piano.js`, `js/fretboard.js`, `js/chords.js`, `js/chordchart.js`, `js/pads.js`, `js/lumi-practice.js`, `js/performance-player.js` | their page step, then B16 | the page; then the states of its drawing |
| `js/jam.js` | B2 (`1092`, `1100`, `1106`), B14b | three labels; the page and the drag ghost |
| `tests/look.test.js`, `tests/tokens.test.js` | B2 / B1a and every later step | `RESKINNED`, `DELETED`, `BODY_LEVEL`; the ceilings |
| `tests/context-global.test.js` | B5a | rewritten |
| `tests/nav.test.js` | B5a, B6, B7a, B8, B9 | |
| `tests/gear.test.js` | B5a, B5b, B6, B8, B9 | |
| `tests/colors.test.js` | B5a, B5b, B13, B16 | |
| `tests/lights.test.js` | B5a, B5b, B6, B12 | |
| `tests/quiz.test.js` | B5a, B8, B9 | |
| `tests/game.test.js` | B6 | |
| `tests/assets.test.js` | B4, B5a, B6 | |
| `CLAUDE.md` (Phase B section and the entries in place), `docs/ROADMAP-2.0.md` (status), `docs/DESIGN-SYSTEM.md`, `docs/INSTRUMENT-MATRIX.md` | every step that changes what they describe | |

---

## Appendix E — The "Phase B status" section for `docs/ROADMAP-2.0.md`

Added in B1a after the Phase A status section (which ends at line 98) and before "Rules for the build" (line
100). Each step fills in its row.

```markdown
## Phase B status (Design system + shell)

Plan: `docs/plans/phase-b/PLAN.md`. 24 draft pull requests into `v2`, at most three open at a time.
Phase B is not a release. The instrument matrix of Phase B0 is `docs/INSTRUMENT-MATRIX.md`.
The owner's questions and the four drawings that open B5a, B6, B9 and B16: `docs/design/phase-b/index.html`.

| Step | What | Pull request | State |
|---|---|---|---|
| B0 | The instrument matrix | # | |
| B1a | Tokens that pass, the `tokens` suite, the plan | # | |
| B1b | The specification, the drawings, the wording list | # | |
| B2 | Colour bridge, `look` suite, screenshot tool | # | |
| B3 | Component sheet, gallery, instrument drawings | # | |
| B4 | The shell built once from JavaScript | # | |
| B5a | Key bar (waits for G1) | # | |
| B5b | Help level and colour switch in the bar only | # | |
| B6 | Header and navigation (waits for G2) | # | |
| B7a | Sheets | # | |
| B7b | Messages, help tour, pedal confirmation | # | |
| B8 | Instrument chip | # | |
| B9 | Home (waits for G3) | # | |
| B10 | Exercises | # | |
| B11 | Chords, Circle, Plan | # | |
| B12 | Piano, Keys lessons, LUMI section | # | |
| B13 | Neck, Tab, Notation | # | |
| B14a | Charts, Pads | # | |
| B14b | Songs, Jam | # | |
| B15a | Woodshed, guided performance, Practice progress | # | |
| B15b | Tuner | # | |
| B16 | The lighting vocabulary on every instrument drawing (waits for G4) | # | |
| B17 | Settings | # | |
| B18 | Clean-up, documents | # | |

Until Phase H: soundLAB Gear has the new shell with its key bar folded, and its four pages in the old look;
`css/style.css` keeps the old variables and shared classes for them; the Player card on Songs keeps its own
rules. The home's footer shows the streak and the goal already (two of Phase D's words for the home); the
review and the weekly plan come in Phase D through the home's providers.
```

---

## Appendix F — Where the maps disagreed, and which reading won

| Question | Readings | Won | Why |
|---|---|---|---|
| Gear's pages between B and H | let the bridge re-colour them (`map-design.md` Q40); freeze them (`map-overlays.md` 12.5, `map-shell.md`, `map-pages-learn.md`) | frozen, by a positive marker `.sl-skin` instead of the maps' negative scope "not inside Gear's `<main>`" | Phase H owns Gear; "nothing changed" can be tested, "re-coloured correctly" cannot (D13, D6) |
| What the key bar holds | a sixth chip for the colour switch (`map-design.md` Q25); the switch under "LUMI lights" (`map-shell.md` Q3) | five items as the design system lists them, each a chip with a panel; the colour switch in the Help panel; `#cx-met` kept in the Tempo panel; `#cx-sig` dropped | the switch changes the screen with or without a LUMI, and Help level 3 is called "Colors" (D16) |
| Layer numbers | the tokens' 20 / 40 / 60; a new 20-60 scale (`map-design.md`); today's numbers (`map-overlays.md` 6.4) | today's numbers as token values, messages raised above sheets | a page's own full-screen layer (200) is rebuilt only in B13; a lower shell would sit under it until then (D10) |
| Degree colours | take the tokens' red-first hues now (`map-pages-instr.md`); change nothing (`map-design.md`) | nothing changes unless the owner picks the red-first set at gate G4 (then B16p); the tokens take the app's values | four suites and the LUMI table pin the palette; the roadmap gives the default to Phase C; the owner chose a mockup with a red root (D12) |
| Instrument heroes | one shared component for every page now; pages keep their drawings (`map-pages-instr.md` 13.1, `map-pages-learn.md` Q5) | drawing functions in `js/hero.js` for the home and the gallery; pages keep their drawings and take the one vocabulary in B16; the neck function takes N strings and a fretless flag (`map-matrix.md`) | 54 pinned names; bass in Phase C must not mean a second hero (D29) |
| Accent picker | keep (`map-shell.md` default); remove (`map-design.md`, `map-overlays.md` finding 9) | removed, with the key bar (B5a) | "the ONLY accent" (`docs/DESIGN-SYSTEM.md:31`); a token component cannot follow the picker (D11) |
| Where the Help level is set | key bar and Lights sheet and Piano page (today); key bar only | key bar only; the copies go in B5b and B12; the Neck's colour copy in B13 | "never add a per-page copy" (`CLAUDE.md`, HELP LEVEL) |
| Help level on the neck | Phase B (`map-matrix.md` Q5); Phase C (candidate 6 as written) | Phase B, step B13, with Phase C as the fallback | the control is on every page from B5a (D32) |
| Sheets on wide screens | centred card as today; side panel | side panel above 900 px, one breakpoint | `docs/DESIGN-SYSTEM.md:45`; today's two breakpoints (640 and 900) disagree with each other (D24) |
| Fonts | add Barlow 600 and 700 files; use the files there are | no new file | D34; reopened only by risk 14 |
| How many suites depend on the start page | 22 (`map-tests.md` 2.2); 27 (`map-shell.md` section 7) | both are right | 22 suites wait for `App.active === 'quiz'` at boot (the planner's grep: 23 lines in 21 files plus `tests/remote-gear.test.js:85`); 27 name Exercises as the home in any form. B2 changes the 20 of the 22 that do not test the start itself |
| Line numbers of `map-design.md` | written against `b18e09d` | looked up again in `a914df2` | e.g. `DEGREE_DEFAULTS` is at `js/app.js:1289` |

---

## Appendix G — The cases of `look` and of the gallery

`tests/look.test.js` drives both apps at 360, 390, 820 and 1200 px, dark and light, with the fake LUMI and MODX
ports of `tests/gear.test.js:70-134`, service workers blocked except in L14. A container that is on
`RESKINNED` is also checked at 390 × 844, 1024 × 640 and 1280 × 800, from the step in which it joins. Page
states come from one table in the suite (per page: at rest, and the states its step names). Three lists live in
the suite: `RESKINNED` (the containers that must pass the strict cases), `BODY_LEVEL` (what may sit on `<body>`
beside the shell, `<main>` and scripts) and `DELETED` (every selector Phase B removed from `css/style.css`).
Tolerances: 1 px, 0.05 in a ratio.

| Case | Kind | From | Check |
|---|---|---|---|
| L1 | loose | B2 | no page state scrolls sideways (`scrollWidth` at most the window's width + 1) |
| L2 | loose | B2 | no element with the `hidden` attribute is displayed (soundLAB: none; Gear: its three known cases are listed until Phase H) |
| L3 | loose | B2 | at 390 and 1200 px every visible control of a page's first screen is the element a tap at its centre reaches |
| L4 | loose | B2 | keyboard focus changes how a control looks (outline or shadow differs from the unfocused state) |
| L5 | loose | B2 | every selector of every help tour resolves to a displayed element while its step is shown. From B7b the case resolves a target the way the tour does (a closed fold around it is opened); every fold is closed again after the tour |
| L6 | loose | B2 | with reduced motion no animation runs and no transition is longer than 0 ms |
| L7 | strict | B3 | controls are at least 44 px high (48 with touch; the dense tier 36 with a mouse, only in the rows D9 names); buttons also wide |
| L8 | strict | B9 | one `h1` per page. On the home and on practice pages the hero and the primary action are inside the window at 390 × 844, 1024 × 640 and 1280 × 800 with the page at scroll 0; on the home the hero is also at least as high as the headline block and at least 25 % of the window's height (22 % at 1024 × 640), with a two-line headline. On a tool page exactly one primary button is on the first screen |
| L9 | strict; loose as a ceiling | B3; B2 | text has 4.5:1 against what is painted behind it (3:1 from 24 px, or 18.66 px bold), both themes. On pages that are not yet re-skinned the count of failing texts per page may only fall |
| L10 | strict | B3 | tokens only: no style rule that matches inside the container holds a raw colour, an old variable, a literal z-index or duration; every font weight in use has a file. One exception by name, until Phase H: the rules of the injected sheet `#css-scoreplayer` (B14b) |
| L11 | strict | B3 | every control has an accessible name |
| L12 | loose | B4 | the shell is one: the signature of header, key bar, tab bars, sheets, footer and stack is equal in both apps, the listed parts aside: `#inst-btn` and `#sheet-instrument` in soundLAB only, `#cx-toggle` in Gear only, the tag's text |
| L13 | strict | B3 | on and off, done and not done differ by more than colour: a pressed control differs from an unpressed one in a property that is not a colour, or carries a mark |
| L14 | loose | B2 | the service worker installs with the step's `ASSETS` and both pages start with the network off |
| L15 | strict | B5a | a container is on `RESKINNED` if and only if it carries `.sl-skin`; from B7b every child of `<body>` that is not the shell, `<main>` or a script is on `BODY_LEVEL` and is, or is inside, a `.sl-skin` container |
| L16 | loose | B2 | Gear's pages are as on the day before Phase B: `gear.html` is loaded as it is, and once more with `css/style.css` answered from `tests/fixtures/style.phase-a.css` and `css/components.css` switched off (`page.route`); every element inside Gear's `<main>` has the same computed style in both, in every state of the four pages, both themes. The six properties that are sizes in px and follow the window (`width`, `height`, `inline-size`, `block-size`, `perspective-origin`, `transform-origin`) are compared as boxes relative to `<main>`. The case sees a rule that was added, changed or removed |
| L17 | loose | B4 | no selector on `DELETED` matches an element inside `<main>`, in any page state of either app |
| L18 | strict | B16 | the lighting vocabulary on each of the eleven instrument drawings: "now" differs from "in the scale" in a property that is not a colour; "next" is a ring without a fill; the root's ring is thicker; no stroke, outline or shadow in the resolved `--sl-accent` inside an instrument; with one grey for every note the states are still told apart; a label has 4.5:1 against its dot |

Gallery cases (B3, on `docs/design/components.html`, both themes): L7, L9, L10, L11 and L13 on every component
in every state; the focus ring is the `--sl-focus` shadow with a transparent outline (so it survives forced
colours); the hero drawings pass the checks of `tests/hero.test.js` in a real browser at 390 and 1280 px.

`tools/shots.js` shares the suite's page-state table, so the pictures and the checks are of the same states.

---

## Changes after critique

Two critics reviewed the first draft: `review-completeness.md` (21 issues: does the plan cover the code?) and
`review-fidelity.md` (30 issues: does it build what the roadmap and the design system say, and is it wise?).
Every issue was checked against the worktree and the binding documents before it was taken up; "checked" below
says what was opened or measured again (scripts `work-plan/probe2.js`, `probe3.js`; output
`work-plan/probe2.out`). Outcomes: **taken** = done as proposed; **adapted** = done another way, with how and
why; **not taken** = with the reason. No issue was found to be wrong as a whole; one part of one was (C2, the
stored keys), and three proposals were answered a different way.

What the edits did to the plan's shape: 17 pull requests became 24 (B0, B1a, B1b, B5a, B5b, B7a, B7b, B14a,
B14b, B15a, B15b and the new B16; the old B16 and B17 are B17 and B18); four steps wait for the owner's yes
(rule 19); three stop points limit the pile (rule 2); the cache numbers run from `v10` to `v31` (section 3);
the matrix has 26 candidates and a path from every gap cell (section 5).

### Completeness review

| # | Severity | Issue | Checked | Outcome |
|---|---|---|---|---|
| C1 | blocker | The guard for "Gear's pages do not change" cannot see a deleted rule; B6 deletes `.icon-btn`, which Gear's Deck uses | `css/style.css:288-289`; `js/synthtab.js:115`, `:148`; measured again: both buttons turn from `flex` to `block` | **Taken**, all four parts. L16 compares with `tests/fixtures/style.phase-a.css` (B2, D13, Appendix G); rule 11 reads "added, changed or removed"; B6 keeps line 288 and B7a takes the `.sheet-head` half of 289. The acceptance line "no deleted selector matches inside `<main>`" became a case that stays in the suite, L17, with the list `DELETED` (from B4) |
| C2 | major | A plan always exists, so the home's order and two test cases cannot work; `state()` is not read-only | `js/practiceplan.js:41-49`, `:118-126`, `:131-134`; measured for four instruments | **Adapted.** The plan provider skips the starter plan and the footer's plan part is left out then, as proposed (D21, B9.1, `home` cases 1 and 3). The `peek()` call is **not taken**: `pp.students` and `pp.sessions` are already stored at every start today, before any page is opened (measured on a fresh profile, `probe3.js`), so the home adds no write; B9.4 says so and `home` case 12 tests it |
| C3 | major | Sheet bodies written with class `panel` are never displayed | `css/style.css:461-462`; `index.html:70`, `:80` | **Taken** (B8.1, Appendix A) |
| C4 | major | The `gear` suite's helper `setKey` clicks the clef | `tests/gear.test.js:172-177`, `:347`, `:359` | **Taken** (B5a.4), adapted to Gear's folded bar: `#cx-toggle`, then `#cx-key` |
| C5 | major | `context-global` breaks at 390 px in B6 | `tests/context-global.test.js:46-48`, `:92`, `:108` | **Adapted:** solved one step earlier. The rewrite of B5a moves the focus to `#met-btn` and opens the tour with `Help.open`, so B6 re-runs the suite and says why (B6.4) |
| C6 | major | B12 does not place nine controls of the Piano page; a suite needs one of them | `js/piano.js:1354-1378`, `:1458-1459`; `tests/learn-instruments.test.js:104-118`; `js/keylessons.js:300-307` | **Taken.** Each control has a place (B12.1); Sound, the look and the labels are in a row that is always shown; `focusView` asks for `.pn-card`; B12.4 names `learn-instruments` and `remote-keys` |
| C7 | major | Tour targets end up in closed folds | `js/help.js:55-61`, `:123`, `:164-181` | **Taken:** one helper in B7b (`reveal`), rows in B12, B13, B14a and B17, D26, Appendix D |
| C8 | major | `songs` joins the strict list while the Player card is untouchable | `js/songs.js:555`; `js/scoreplayer.js:610-619` | **Taken:** said once in B14b; L10 has one named exception, the sheet `#css-scoreplayer`; B18 and section 0 repeat it |
| C9 | major | The goal dot on the Learn tab would vanish unseen | `css/style.css:267-279`, `:949`; `js/xp.js:30`; `tests/game.test.js:374` | **Taken** (B6: the component, words for a screen reader, a `look` check; `game:374` also checks the dot itself) |
| C10 | minor | `wireSheets` rewrites every sheet button | `js/app.js:1486-1491`, `:280-282` | **Taken** (B6.1; B8.1 refers to it) |
| C11 | minor | Where the tempo controls are on a phone; two steppers or a moving node | the draft's Appendix A | **Adapted:** neither. Five chips and five panels; the Tempo and Scale lock panels are laid out in the bar above 640 px; a `matchMedia` listener keeps their `hidden` attribute right; each id exists once (D16, Appendix A). `#cx-met` on a phone is in the Tempo panel: two taps, which is today's count at every width (the clef, then the button); D16's reason was corrected |
| C12 | minor | Five text lines and the acceptance grep | all five lines; the grep run on the worktree | **Taken:** `js/help.js:77`, `js/lumi-practice.js:428`, `js/performance-player.js:219` and `js/help.js:135` in B5a, `js/help.js:128` in B5b; the grep of B5a.6 is the proposed one |
| C13 | minor | Three suite rows name too few lines | `tests/storage-import.test.js:451`; `tests/lights.test.js:223-225`, `:239-240`; `tests/colors.test.js:142`, `:314` | **Taken** (B5a.4 and B5b.3) |
| C14 | minor | `App.chromeTop()` was defined as a painted edge | `js/quiz.js:1274`; `js/keylessons.js:303-305`; `css/style.css:180` | **Taken** (D42, B4.2) |
| C15 | minor | The new ground colour for Gear has no step | `css/style.css:44`, `:136-148`; `js/app.js:853-855`; measured `rgb(19, 17, 20)` | **Adapted:** the ground changes in B6, in both apps, on `html` and `body`; until then B2 keeps Gear's browser-bar colour, and the two `theme-color` tags change in B6 with it |
| C16 | minor | B2's acceptance check contradicts itself about Songs | the scan repeated: `#sg-opendest`, 1,068 × 40 px | **Taken** (B2 goal, B2.2, B2.6) |
| C17 | minor | Five Learn pills fit 360 px only with narrow padding; the rule sits in a page module | measured again: 328; a wrap at 14 px; 311 with 8 px and 13 px text; `js/practiceplan.js:350` | **Adapted:** with the home outside the groups (D20, the default) the pills stay four. The rule moves into the pill component in B6 as proposed; risk 22 and B9.8 hold the fallback for placement A |
| C18 | minor | One old rule out-weighs every `.sl-skin` rule | `css/style.css:116-121` | **Taken** (the first option: D6, B3.1, risk 2) |
| C19 | minor | The end check names 17 of 29 old variables; three values have no token | the 29 names counted; uses per name counted | **Taken:** T4 and the grep of B18 list all 29; `--sl-nut`; `calc(var(--sl-z-full) + 1)`. Added beyond the proposal: `--sl-accent-deep` for `--accent-dim`, so that the meter's gradient does not go flat |
| C20 | minor | Four slips in line references, one in Appendix A | each line | **Taken:** `1219-1221`; `1231`; the sentence about `tests/smoke.test.js` is gone (only `nav:71` is a closing click); Appendix A is in today's order |
| C21 | minor | (a) B5's second commit cannot be green; (b) the tour layer needs the marker; (c) nobody owns `main` and the footer | `tests/nav.test.js:90-94`; `tests/context-global.test.js:76`; `js/help.js:187-196`, `:228-232`; `css/style.css:455-459`, `:469-477`, `:990` | (a) **adapted:** the bar and its suites are one commit, there is no state with the clef still present; (b) **taken** (B7b); (c) **taken** (B6, soundLAB only, with a `look` check of the 16 px gutter) |

### Fidelity review

| # | Severity | Issue | Checked | Outcome |
|---|---|---|---|---|
| F1 | blocker | The home is specified against a state that does not exist: every profile's headline would be "Tune up" | `js/practiceplan.js:41-49`, `:120`, `:160`, `:176`, `:190-191`; measured | **Taken:** the starter plan is skipped; a block that cannot be measured counts as dealt with once opened (`App.practicePlan.nextOpen`, B9.2); `home` case 1 asserts the headline per instrument; B1b's home drawing uses the four real headlines |
| F2 | blocker | None of Phase A is merged; 17 stacked pull requests would each show all of it | `git rev-list --count origin/v2..HEAD` = 27, 126 files; `docs/ROADMAP-2.0.md:76-80` | **Taken:** the real starting point is in the header; a compare link per pull request, at most three open, three stop points (rule 2, section 3); owner item 13 asks how he tries an unmerged step. **Adapted** in one point: the first stop is "Phase A and B0-B1b are merged", because those three change nothing on screen and need not wait for each other |
| F3 | major | The home's "Start" opens a page instead of starting | `js/practiceplan.js:195-196`; `js/keylessons.js:886`, `:892`; `js/quiz.js:2959`; `js/woodshed.js:1577-1587`; tried `launch` + `start` | **Taken, both ways:** a Keys lesson is started (the call exists), and where no call exists the provider gives the button's words ("Open the Tuner"); `home` case 4 |
| F4 | major | The lock's sentence is on screen only from 1280 px; icons without words on phones | `docs/DESIGN-SYSTEM.md:17-19`, `:60` | **Adapted:** the sentence is on screen in words from 641 px, in the longest of three forms that fits (two rows allowed from 641 to 900 px); on a phone the lock's chip says "On" or "Off" and opens a panel with the switch and the sentence; a message says the sentence at every flip, at every width; `context-global` checks that the state reads as a word without opening anything (D16, D17) |
| F5 | major | Three rows of chrome leave the home's instrument 66 px at 1024 × 640; the test accepts any size | `docs/design/home-mockup.html:114-133`; the critic's sketch, opened | **Adapted:** B1b draws the three placements; the default is B, the home outside the groups, with two rows of chrome as in the mockup (D20); a tested minimum for the hero (`home` case 2, L8) |
| F6 | major | Nine pages only get a recolour; not asked | `docs/DESIGN-SYSTEM.md:10-13` | **Taken:** owner item 6 and section 0 say it in plain words; B1b draws Exercises' start, the Woodshed library and the Plan; tool pages get a checked rule (one `h1`, exactly one primary button on the first screen, L8) |
| F7 | major | "One lighting model" is delivered as one more drawing; several drawings have no step | `map-pages-instr.md` 2.6 | **Taken**, and **adapted** in how: section 0 and D29 say "one vocabulary now, one drawing in Phase C"; the table of the eleven drawings is in B16; case L18. Instead of each page step applying the vocabulary, one step (B16) does it for all eleven, so it can wait for a gate and be reviewed as one thing |
| F8 | major | The root's colour is the accent; "no amber in the instrument" cannot hold; the palette question was put off | `js/app.js:1289`; `css/tokens.css:29`, `:43`; `docs/design/home-mockup.html:160` | **Taken:** decided at gate G4 with both palettes drawn (D3, D12); D30 says "no ring, outline or glow in the accent" and allows an amber note; the home's check is "the only amber button"; the red-first palette is its own step, B16p, with the four suites named |
| F9 | major | A 36 px tier contradicts "every control is tappable at 44 px" | `docs/DESIGN-SYSTEM.md:37`; `css/tokens.css:140` | **Taken:** owner item 7 with a drawing; `any-pointer: coarse`; D9 names the rows that may use it; the unmeasured "grow by a third" is gone |
| F10 | major | In Gear the key bar would be always on screen before Phase H decides | `js/midihub.js:275` | **Taken** (the first option): folded behind `#cx-toggle` (D14, B5a); Gear's Deck and Hub are drawn in B1b |
| F11 | major | "Work does not wait"; eleven decisions were not on the owner's list | section 9 of the draft | **Taken:** gates G1-G3 for B5a, B6 and B9 (rule 19); the accent picker left B2; section 9 holds the eleven, each with its drawing. **Adapted:** a fourth gate, G4, for the lighting vocabulary and the palette |
| F12 | major | Seven steps are too big to review | the draft's file tables | **Adapted:** B1 → B0, B1a, B1b; B5 → B5a (the bar) and B5b (the copies go, the sheet is renamed); B7 → B7a and B7b; the vocabulary left B12 for B16 and is named in rule 8; B14 → B14a and B14b; B15 → B15a and B15b; B18 is no longer a bucket (1024 × 640 in each page's own step; a finding beyond about thirty lines gets its own pull request). **Not taken:** a further split of B15a: the Woodshed and the two modules it hosts are one page and one panel, and the marker is per container |
| F13 | major | The plan fails its own test on Songs | as C8 | **Taken** (the second option, an exception by name). The first option, a soundLAB look for the player in `css/components.css`, is **not taken**: the module's own rules would still match inside the panel, so L10 would need the exception anyway |
| F14 | major | No path from a gap cell to a candidate; five cells have none; three questions answered by the plan | `INSTRUMENT-MATRIX.md` | **Taken:** every gap cell names its candidates, and the two without one have their reason under the table; candidate 26 is new, 8 and 17 were widened; questions 2 and 4 are owner items 17 and 18 (section 5) |
| F15 | major | The home's instrument cannot be played, can show another key than the bar, a "now" the LUMI lacks, and nothing at Help None | `docs/DESIGN-SYSTEM.md:15-16`; `docs/design/home-mockup.html:163` | **Taken** as proposed (D21, B9.1, `home` case 5) |
| F16 | major | Nothing cuts a long headline | `docs/DESIGN-SYSTEM.md:54` | **Taken** (two lines, the full title in the detail line, `home` case 7) |
| F17 | major | The beta shows the new shell around old pages; the beta looks like the live app | `js/app.js:564` | **Taken:** section 0, owner item 12, the "beta" tag (B6). "Merge B10-B16 together" is offered as the owner's other choice, **not** made the default: it contradicts the limit of three open pull requests |
| F18 | minor | Plain words are deferred to phases whose rows do not hold them | `js/woodshed.js:1140`; `js/practiceplan.js:292`; `js/quiz.js:2088` | **Taken:** the wording list in B1b; first-screen lines in the page steps (rule 16; `js/woodshed.js:1140` in B15a); the rest into the Phase C and D rows in B18 |
| F19 | minor | Seven degree tokens that no rule reads, with other colours than the app's | `css/tokens.css:43-49` | **Taken** (the second option: equal to the app's defaults, kept equal by case T7) |
| F20 | minor | The headline size is changed silently | `docs/DESIGN-SYSTEM.md:34` | **Taken** (D28; B1b marks the sentence as changed) |
| F21 | minor | 1024 × 640 is checked for most pages only at the end | the draft's "Look at" lists | **Taken** (each page's own step; Appendix G) |
| F22 | minor | Folds forget | — | **Taken** (the first option: `ui.folds` and `data-keep`, built in B3, first used in B12; the most used row of Piano is outside a fold as well) |
| F23 | minor | The Key chip holds about eight letters at 360 px | `Theory.SCALES` read with Node | **Taken** (the short-name table is part of B5a; tested with the longest name) |
| F24 | minor | "The stepper again"; two metronome buttons | as C11 | **Adapted** as C11. The two buttons stay, because they do different things (`#cx-met` starts and stops the click, `#met-btn` opens the sheet); B1b draws them side by side |
| F25 | minor | The bar has no safe-area inset when the header is gone | `css/style.css:170` | **Taken** (B5a's CSS); what it looks like in an installed app is left to the owner's devices and said so |
| F26 | minor | Jam's drag ghost sits on `<body>` outside every skinned container | `js/jam.js:1259-1261` | **Taken** (B14b: into `#sl-float`; the list `BODY_LEVEL` from B7b; rule 12) |
| F27 | minor | The frozen paragraph of `CLAUDE.md` has no reason left and misleads | `docs/plans/phase-a/PLAN.md:47-49`; `CLAUDE.md:34-36` | **Taken** (rule 5, owner item 19, the first line of the Phase B section) |
| F28 | minor | The chip can read "Guitar" on the Keys tab | — | **Taken** ("Practising"; drawn in B1b; D23, B8) |
| F29 | minor | Streak and goal are on the home and on Exercises; two of Phase D's home words arrive in B | `docs/ROADMAP-2.0.md:60` | **Taken** (B9.6, Appendix E) |
| F30 | minor | The row's check state has no name and no test | `docs/DESIGN-SYSTEM.md:45` | **Taken** (`.sl-row.is-done`, B3, the gallery's L13) |
