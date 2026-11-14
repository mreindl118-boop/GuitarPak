# Phase B map: tests — how to redesign without breaking or blinding the suites

Read-only map of `tests/` (67 suites, 19,615 lines) and what they lean on, written for the Phase B plan
("Design system + shell": components, key bar, new home, nav, sheets, every kept page re-skinned, light theme;
`docs/ROADMAP-2.0.md:57`).

The working files and screenshots this document names (work-…/, shots/…) were scratch files of the planning
session. They are not in the repository: pictures are never committed, because both deploys publish the whole
tree.

**Tree:** the worktree `scratchpad/wt/a4`, branch `claude/verify-project-files-4bchk6-v2-a4`, commit `a914df2`
(v2 plus all five Phase A steps). Every `file:line` below is a line of that commit. Nothing in it was changed.

**What was run, not only read:**

- The complete suite once, locally, on my port 5416: `ALL SUITES PASS`, 67 suites, 3,541 checks, 15 min 32 s
  (`work-tests/run.log`). Other map jobs were using the machine at the same time (load average up to 7).
- The last GitHub run of the same commit, read through the API: run 43617187646 (pull request #103), job
  "test": the suites took 15 min 24 s, the whole job 15 min 56 s (`work-tests/ci-run-43617187646.txt`).
- A static scan of all 67 suites (`work-tests/inventory.js`; regular expressions over the source, so every
  count in section 2 is a close estimate, not an exact parse).
- Three probes in headless Chromium against the served worktree, `deviceScaleFactor` 1
  (`work-tests/look-probe.js`, `look-probe2.js`, `sw-probe.js`): every page of both apps at 360, 390, 820 and
  1200 px in both themes. They measure what a "look" suite would assert. Results in section 3.
- Screenshots that I looked at: the home mockup at 1200 and 390 px (`shots/tests/mockup-e-1200.png`,
  `mockup-e-390.png`) and today's app, 270 viewport shots (`shots/tests/view/`, index page
  `shots/tests/view/index.html`).

Paths without a folder are relative to the worktree. "Shell" means what `index.html:20-82` and `gear.html:19-81`
hold: the header with the tab bar and the corner tools, the context bar, the pill strip, the phone tab bar and
the two sheets.

---

## 0. The thirteen things that will bite

1. **The suites prove that handlers work, not that a person can see or reach the control.** They click through
   `element.click()` inside `page.evaluate` 577 times and dispatch 160 synthetic events; real pointer actions
   (Playwright click, tap, mouse) number 110 and sit in 16 suites. Visibility is read from the `hidden`
   property 143 times in 34 suites, against 19 `offsetParent` reads and 10 `isVisible` calls. Proof that this
   is blind today: `tests/oneopen.test.js:58-60` passes on "the destinations wait for a file" while the three
   buttons are on screen (`js/songs.js:548` gives the row `class="row"` and `hidden`; `css/style.css:520`
   `.row { display: flex }` wins; see `shots/tests/view/main-songs-1200-dark.png`). A re-skin that hides,
   covers or shrinks a button keeps most suites green.
2. **The key bar.** The design says "The key bar is always there … never buried in a menu"
   (`docs/DESIGN-SYSTEM.md:17-19`). Three suites encode the opposite, a dropdown behind the clef that closes on
   Esc, a tap outside, a page change and Back: `tests/nav.test.js:89-114` and `:140-145`,
   all of `tests/context-global.test.js` (104 checks), `tests/gear.test.js:465-504`.
3. **The new home.** 22 suites wait for `App.active === 'quiz'` at boot and three more assert that a start or
   a fallback lands on Exercises (list in 2.2). If the home becomes a new page, each boot wait hangs until its
   timeout.
4. **`taps` is the only suite that checks real reachability, and it costs 276 of 924 CI seconds.** It assumes a
   clear area that starts 120 px from the top and ends above `#tabbar-m` (`tests/taps.test.js:18,24`). A key
   bar that stays under the header, or a fixed footer line, changes both numbers.
5. **`tests/assets.test.js` compares the shell as HTML text** (`:138-190`) and reads panels and scripts with
   regular expressions over the two HTML files (`:49-54`). Building the shell from JavaScript, which Phase A
   deferred to Phase B (`docs/plans/phase-a/PLAN.md:1198`), fails the comparison at `:179` and makes the
   panel check at `:123` pass on nothing.
6. **The light theme does not meet the contrast the tokens promise.** Computed from `css/tokens.css` alone:
   in light, `--sl-accent` as text is 3.02 to 3.64 to 1 on the four surfaces and the label on the primary button
   (`--sl-accent-ink` on `--sl-accent`) is 3.64 to 1; the comment at `css/tokens.css:109` says 4.5. Today's light
   theme, measured on real elements, has 123 of 863 texts under AA on soundLAB's pages (dark: 9 of 996).
7. **44 px.** The design system wants every control tappable at 44 px (`docs/DESIGN-SYSTEM.md:37`). At 390 px
   today 715 of 953 visible controls are smaller, the five corner icons included (38 × 38).
8. **Six pages have almost no test of their own DOM:** Tuner (no suite names a `tun-` id), Chords and Circle
   (`colors` only), Jam, Pads, Tab and Notation. `smoke` and `context-global` visit them; nothing else would
   notice a broken layout there.
9. **There is no visual test of any kind.** Five `page.screenshot` calls exist, none is compared with anything
   (2.6). CI runs Chromium build 1234, this container 1243, so pixels would not match across the two anyway.
10. **CI budget.** The suites take 15 min 24 s of a 30-minute limit (`.github/workflows/tests.yml:28`). The
    install step took 23 s in that run and nine minutes on a cold runner (`docs/CI-DEPLOYMENT.md:23-24`).
11. **Tokens are not used yet, and most CSS is in JavaScript.** No file reads a `--sl-*` token today (grep: only
    `css/tokens.css` defines them). 29 modules add their styles through `App.injectCSS` (`js/app.js:802-808`),
    so a "no raw colour" scan of `css/` alone sees one tenth of the rules.
12. **Nothing tests that the service worker installs.** `assets` compares lists on disk. 35 of the 53 browser
    suites that load the served app do not block service workers, so the worker installs as a side effect of
    their runs and nobody looks at the result.
13. **Exact pixels and fixed click points.** `nav` expects 12 px gutters (`tests/nav.test.js:145`; the design
    says 16, `docs/DESIGN-SYSTEM.md:51`), `practiceplan` a padding of exactly `13px` and a width of 230
    (`tests/practiceplan.test.js:96-97`); four suites click at fixed screen coordinates
    (`tests/nav.test.js:71,101`, `tests/context-global.test.js:86`, `tests/smoke.test.js:23,77`).

---

## 1. What the suites are and how they drive the app

- One list: `tests/run.sh:17` names all 67 suites and runs them one after the other; a suite passes when
  `node tests/<name>.test.js` exits 0, and the line printed is `pass (N checks)` (`tests/run.sh:19`). On a
  failure only the first 20 lines that match `FAIL|Error` are shown.
- 13 suites are pure Node (`fingering`, `assets`, `note-palette`, `midi-ports`, `midi-ingress`,
  `practice-router`, `performance-engine`, `performance-import`, `practice-progress`, `practice-input`,
  `pages-deploy`, `pages-next`, `release-workflow`). 54 start Chromium: 38 open `index.html` only, 10 open
  `gear.html` only (`helix`, `midihub`, `midihub-lock`, `midihub-player`, `midihub-wheel`, `synthconn`,
  `synthconnect`, `synthdeck`, `synthdeck-scope`, `synthtab`), 5 open both (`gear`, `remote-gear`, `smoke`,
  `trim`, `storage-import`), 1 injects source files into an empty page (`sound-lock`).
- Navigation is almost always `App.switchTo('<id>')` inside `page.evaluate`. Real tab and pill clicks exist
  only in `tests/nav.test.js:40-55,147` and `tests/gear.test.js:387`.
- Every browser suite seeds `soundlab2.*` in an init script. 52 suites seed `qz.landed`, so the one-time landing
  on Exercises never runs in them.
- 24 suites stop at the first failed check (their `ok` throws or asserts), 43 count failures and go on. The ones that stop
  and touch the UI: `context-global`, `display-master`, `learn-instruments`, `lumi-contexts`, `performance`,
  `performance-progress`, `practice-audio`, `practice-progress-ui`, `instrument-session`, `instrument-xp`,
  `midihub-lock`. In a re-skin step these show one failure per run; run them alone
  (`node tests/context-global.test.js`) while fixing.
- Local and CI differ in versions: CI pins Playwright 1.62.1 on Node 24 (`.github/workflows/tests.yml:38,49`;
  its Chromium is build 1234), this container has Playwright 1.63.0 on Node 22 with Chromium build 1243.

---

## 2. (a) What the suites depend on that a re-skin can change

### 2.1 Per suite

Columns: **Checks** = PASS lines of the local run (identical to the CI run). **CI s** = seconds in CI run
43617187646. **Ids / Classes** = distinct ids and class names the suite names in selectors.
**Shell lines** = lines that name a shell id, class or shell API (`#tabbar`, `.subtab`, `#ctx-btn`,
`#ctxbar`, `#cx-*`, `#sheet-*`, `.tb-tools`, `.topbar`, `#app-toast`, `#remote-hud`, `main > .panel`,
`App.ctx(`, `App.openSheet`, …). **Text reads** = reads of `textContent`, `innerText`, `innerHTML`.
**Style+geometry reads** = `getComputedStyle`, `getBoundingClientRect`, `offset*`, `client*`, `scroll*`,
`innerWidth`, `elementFromPoint`, `boundingBox`. **Other**: `screenshot` calls, lines that touch fonts, real
pointer actions.

| Suite | Kind / page | Lines | Checks | CI s | Ids | Classes | Shell lines | Text reads | Style+geometry reads | Viewports (w×h) | Other |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `fingering` | Node | 38 | 16 | 0 | 0 | 0 | 0 | 0 | 0 | - | - |
| `lights` | browser / main | 457 | 69 | 3.9 | 10 | 7 | 6 | 9 | 1 | 1200x900 | - |
| `keys` | browser / main | 434 | 55 | 41.4 | 22 | 17 | 0 | 19 | 1 | 1200x900 | - |
| `chordchart` | browser / main | 119 | 16 | 1.6 | 10 | 7 | 1 | 0 | 0 | 1200x900 | real pointer 1 |
| `practice` | browser / main | 187 | 34 | 4.6 | 11 | 12 | 2 | 11 | 1 | 1200x900 | real pointer 1 |
| `game` | browser / main | 405 | 78 | 31.6 | 17 | 35 | 4 | 24 | 8 | 1200x900 390x844 | real pointer 4 |
| `quiz` | browser / main | 402 | 44 | 6.9 | 20 | 33 | 9 | 15 | 2 | 1200x520 1200x900 | fonts 2, real pointer 7 |
| `quiz-correction` | browser / main | 187 | 33 | 3.9 | 1 | 0 | 0 | 2 | 0 | - | - |
| `nav` | browser / main | 159 | 38 | 10.9 | 13 | 8 | 59 | 9 | 20 | 1280x800 390x844 | real pointer 22 |
| `smoke` | browser / both | 97 | 9 | 6.7 | 3 | 5 | 3 | 1 | 0 | 1280x900 | real pointer 2 |
| `trim` | browser / both | 693 | 130 | 23.4 | 27 | 9 | 10 | 13 | 2 | 1280x900 | real pointer 1 |
| `storage-import` | browser / both | 1296 | 209 | 59.7 | 17 | 10 | 13 | 10 | 2 | 1280x900 | - |
| `assets` | Node | 279 | 44 | 0.1 | 0 | 0 | 1 | 0 | 0 | - | - |
| `taps` | browser / main | 56 | 7 | 275.7 | 4 | 3 | 2 | 0 | 12 | 1280x800 360x740 | fonts 1 |
| `update` | browser / main | 63 | 9 | 10 | 1 | 1 | 0 | 2 | 0 | - | - |
| `audio-level` | browser / main | 183 | 6 | 8.9 | 0 | 1 | 0 | 0 | 0 | 1200x900 | - |
| `midihub` | browser / gear | 470 | 69 | 3.4 | 58 | 14 | 7 | 37 | 1 | 1200x900 | - |
| `midihub-lock` | browser / gear | 167 | 21 | 1.3 | 5 | 0 | 0 | 0 | 0 | - | - |
| `midihub-wheel` | browser / gear | 55 | 5 | 2.3 | 0 | 1 | 0 | 0 | 5 | 1200x700 | real pointer 4 |
| `audioin` | browser / main | 666 | 98 | 41.6 | 15 | 3 | 2 | 21 | 11 | 1200x900 | real pointer 7 |
| `btmidi` | browser / main | 135 | 12 | 5.4 | 5 | 0 | 1 | 6 | 4 | 1200x900 | real pointer 2 |
| `colors` | browser / main | 367 | 60 | 1.8 | 10 | 12 | 2 | 13 | 0 | 1200x900 | - |
| `note-palette` | Node | 37 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | - | - |
| `multiin` | browser / main | 165 | 25 | 3.8 | 7 | 1 | 0 | 4 | 0 | 1200x900 | - |
| `lumidisplay` | browser / main | 198 | 23 | 12.4 | 8 | 6 | 0 | 2 | 2 | 1200x900 | - |
| `lumi-practice` | browser / main | 842 | 104 | 24.5 | 15 | 1 | 0 | 14 | 5 | 1100x1000 1200x950 375x1000 | screenshot 1, fonts 1 |
| `display-master` | browser / main | 202 | 22 | 2.7 | 7 | 0 | 6 | 1 | 0 | 1280x1000 | - |
| `lumi-contexts` | browser / main | 276 | 37 | 5.9 | 14 | 6 | 3 | 9 | 0 | 1280x1000 | screenshot 1 |
| `midi-ports` | Node | 488 | 131 | 0.1 | 0 | 0 | 0 | 0 | 0 | - | - |
| `midi-ingress` | Node | 141 | 57 | 0.1 | 0 | 0 | 0 | 0 | 0 | - | - |
| `practice-router` | Node | 247 | 82 | 0.1 | 0 | 0 | 0 | 0 | 0 | - | - |
| `pitch-lock` | browser / main | 72 | 15 | 1.2 | 0 | 0 | 0 | 0 | 0 | - | - |
| `sound-lock` | browser / injected | 140 | 51 | 0.6 | 0 | 0 | 0 | 0 | 0 | - | - |
| `performance-engine` | Node | 297 | 101 | 0 | 0 | 0 | 0 | 0 | 0 | - | - |
| `performance-import` | Node | 152 | 56 | 0 | 0 | 0 | 0 | 0 | 0 | - | - |
| `performance` | browser / main | 201 | 32 | 1.7 | 13 | 0 | 0 | 6 | 2 | 1280x900 390x844 | screenshot 1 |
| `performance-safety` | browser / main | 203 | 25 | 1.7 | 8 | 1 | 0 | 4 | 0 | 1000x900 | screenshot 1 |
| `practice-progress` | Node | 254 | 130 | 0.1 | 0 | 0 | 0 | 0 | 0 | - | - |
| `practice-progress-ui` | browser / main | 238 | 38 | 4.9 | 6 | 1 | 0 | 24 | 2 | 1280x900 390x844 | real pointer 12 |
| `performance-progress` | browser / main | 128 | 17 | 1.4 | 9 | 0 | 0 | 1 | 0 | - | - |
| `practice-input` | Node | 191 | 63 | 0.2 | 0 | 0 | 0 | 0 | 0 | - | - |
| `practice-audio` | browser / main | 183 | 24 | 2.6 | 8 | 0 | 0 | 3 | 2 | 1280x1000 390x844 | - |
| `pages-deploy` | Node | 164 | 38 | 1.3 | 0 | 0 | 0 | 0 | 0 | - | - |
| `pages-next` | Node | 110 | 21 | 0.3 | 0 | 0 | 0 | 0 | 0 | - | - |
| `release-workflow` | Node | 158 | 37 | 21.4 | 0 | 0 | 0 | 0 | 0 | - | - |
| `practiceplan` | browser / main | 421 | 56 | 7.5 | 23 | 4 | 2 | 11 | 14 | 1200x900 360x844 390x844 | fonts 1, real pointer 10 |
| `learn-instruments` | browser / main | 206 | 43 | 2.9 | 16 | 5 | 0 | 10 | 2 | 1280x900 390x844 | real pointer 5 |
| `instrument-xp` | browser / main | 115 | 34 | 1.3 | 4 | 0 | 0 | 2 | 0 | - | - |
| `instrument-session` | browser / main | 215 | 38 | 1.9 | 2 | 0 | 0 | 0 | 0 | - | - |
| `context-global` | browser / main | 145 | 104 | 9.8 | 11 | 4 | 37 | 1 | 16 | 1440x1000 360x780 390x844 | screenshot 1, real pointer 12 |
| `midihub-player` | browser / gear | 273 | 38 | 7.8 | 14 | 2 | 0 | 13 | 1 | 1200x800 | - |
| `helix` | browser / gear | 294 | 54 | 6.5 | 35 | 21 | 2 | 34 | 0 | 1200x900 | - |
| `synthdeck` | browser / gear | 757 | 137 | 8.7 | 57 | 27 | 4 | 63 | 8 | 1200x900 390x800 | - |
| `synthdeck-scope` | browser / gear | 270 | 42 | 1.6 | 14 | 4 | 0 | 5 | 7 | 1200x900 390x800 | - |
| `synthtab` | browser / gear | 331 | 49 | 14.2 | 41 | 15 | 7 | 21 | 21 | 1200x900 375x812 768x1024 | fonts 1 |
| `oneopen` | browser / main | 200 | 28 | 7.1 | 16 | 2 | 0 | 12 | 4 | 1200x900 | - |
| `synthconnect` | browser / gear | 156 | 21 | 12.2 | 5 | 6 | 0 | 5 | 1 | 1200x900 820x1180 | real pointer 8 |
| `portnames` | browser / main | 73 | 8 | 3.2 | 0 | 0 | 0 | 0 | 0 | 1200x900 | - |
| `synthconn` | browser / gear | 156 | 24 | 9.5 | 4 | 3 | 2 | 4 | 0 | 390x844 | - |
| `gear` | browser / both | 859 | 166 | 38.3 | 45 | 14 | 52 | 35 | 22 | 1200x900 1440x1000 360x780 390x844 | real pointer 12 |
| `remote` | browser / main | 369 | 63 | 19.2 | 4 | 4 | 9 | 9 | 10 | 1200x900 375x812 | - |
| `remote-quiz` | browser / main | 534 | 90 | 17.2 | 7 | 11 | 5 | 9 | 5 | 1200x900 375x812 | - |
| `remote-keys` | browser / main | 636 | 76 | 54.5 | 14 | 7 | 2 | 17 | 0 | 1200x900 | - |
| `remote-shed` | browser / main | 457 | 84 | 18.4 | 15 | 1 | 2 | 4 | 0 | 1200x900 | - |
| `remote-plan` | browser / main | 367 | 58 | 11.7 | 15 | 2 | 3 | 5 | 0 | 1200x900 | - |
| `remote-runners` | browser / main | 343 | 50 | 12.3 | 23 | 4 | 3 | 3 | 0 | 1200x900 | - |
| `remote-gear` | browser / both | 436 | 67 | 26 | 14 | 2 | 5 | 3 | 0 | 1200x900 | - |
| **67 suites** | 54 browser, 13 Node | 19615 | 3541 | 924 | 723 | 332 | 266 | 526 | 194 | | |

The Ids and Classes totals add up the per-suite numbers; counted once across all suites there are about 470
ids and 220 class names.

Where the exposure sits: `nav` (59 shell lines), `gear` (52) and `context-global` (37) hold 148 of the 266 shell
lines. Style and geometry reads are in 30 suites; the heaviest are `gear` 22, `synthtab` 21, `nav` 20,
`context-global` 16, `practiceplan` 14, `taps` 12, `audioin` 11, `remote` 10.

### 2.2 Selectors

**Ids.** About 470 distinct ids are named across the suites (the scan finds 477; a few are URL hashes such as
`#deck`). By family: Hub `mh-` 71, Deck `sdk-` 55, Synth tab `st-` 38, Exercises `qz-` 33, Helix `hx-` 33,
Settings `set-` 32, guided performance `pf-` 23, `panel-` 18, LUMI section `lp-` 18, Songs `sg-` 17, Piano `pn-`
14, lessons `kl-` 14, Plan `pp-` 14, neck `fb-` 11, Charts `cc-` 10, Woodshed `ws-` 10, Trainer cards `tr-` 10,
context bar `cx-` 7. The four Gear families (197 ids) belong to Phase H's design, not Phase B's, but the shell
they sit in is shared.

**Classes.** About 220 distinct class names. `active` is used by 21 suites, `subtab` by 9, `tabbar-btn` by 8,
`pn-key` by 7, `show` (the remote HUD) by 6, `panel` by 5, `error` by 4. `css/style.css:5-7` lists the class
names modules rely on ("do not rename"): `card`, `row`, `btn`, `seg`, `chip`, `panel`, `error`, and others.

**Data attributes.** 98 distinct `data-*` attributes appear in selectors, among them the shell's `data-group`
(tab buttons, `js/app.js:940`), `data-page` (pills, `js/app.js:969`), `data-sheet-close`, `data-sheet-help`
(`index.html:67-68`) and `data-cxcolormode` (`js/app.js:1648`).

**Tag structure.** Few checks depend on tags: `main > .panel` (5 suites), `#remote-hud span`
(`tests/remote.test.js:201`, `tests/remote-quiz.test.js:445`), `optgroup` inside `#cx-scale`
(`tests/nav.test.js:120`), `svg.ic` inside the clef (`tests/context-global.test.js:38`),
`select, input[type=number], button` inside `#ctxbar` (`tests/context-global.test.js:33`),
`#panel-quiz button` (`tests/taps.test.js:20`), `.brand .tag` and `.foot` (`tests/gear.test.js:212`).

**State contracts.** These are what the suites read to learn the state of the page. A component library that
shows and hides things another way breaks them all at once:

| Contract | Where it is defined | Used by |
|---|---|---|
| A page is shown when `#panel-<id>` has class `active` | `css/style.css:461-462` | `tests/smoke.test.js:31,85`, `tests/trim.test.js:157`, `tests/storage-import.test.js:175`, `tests/gear.test.js:215` |
| A sheet is open when `#sheet-<name>` is not `hidden` and `App.sheet` names it | `index.html:63,73`, `css/style.css:312` | `tests/nav.test.js:60,72,75,83`, `tests/context-global.test.js:98-106`, 10 suites call `App.openSheet` / `App.sheet` |
| The toast is `#app-toast`, shown when not `hidden`, its message is its whole `textContent` | `js/app.js:2002-2016` | 11 suites, for example `tests/remote.test.js:44`, `tests/trim.test.js:159` |
| The remote HUD is `#remote-hud` with class `show` and one `span` | `js/remote.js:221,392` | 7 suites |
| The active tab / pill / segment has class `active` | `js/app.js:940,968` | 21 suites |
| A tab button's text is exactly its label (the icon adds no text) | `js/app.js:940-941` | `tests/nav.test.js:28,37`, `tests/gear.test.js:216`, `tests/trim.test.js:245` |
| Toggles report through `aria-pressed`, disclosures through `aria-expanded` | `index.html:43-45,55-56` | 140 reads of ARIA or label attributes in 28 suites |
| The context bar is open when `App.ctx()` is true and `html` has class `ctx-open` | `js/app.js:1095-1119`, `css/style.css:405` | 6 suites, 16 calls |
| Something is hidden when its `hidden` property is true | everywhere | 143 reads in 34 suites |

**The shell ids and who names them** (suites / lines):

| Shell part | Ids and classes | Suites / lines |
|---|---|---|
| Tab bars | `#tabbar` 9 / 22, `#tabbar-m` 7 / 15, `.tabbar-btn` 8 / 20 | `nav`, `gear`, `trim`, `quiz`, `game`, `helix`, `midihub`, `synthtab`, `taps` |
| Pills | `#subnav` 9 / 16, `.subtab` 9 / 18 | `nav`, `gear`, `trim`, `quiz`, `helix`, `midihub`, `synthtab`, `practiceplan`, `chordchart` |
| Corner tools | `#ctx-btn` 6 / 36, `#met-btn` 2 / 12, `#app-switch` 4 / 13, `#settings-btn` 5 / 7, `#lights-btn` 5 / 6, `#help-btn` 2 / 2, `.tb-tools` 3 / 4, `.brand` 3 / 5 | `nav`, `context-global`, `gear`, `quiz`, `trim`, `game`, `practice`, `storage-import` |
| Context bar | `#ctxbar` 4 / 10, `#cx-root` 3 / 17, `#cx-scale` 4 / 13, `#cx-led` 5 / 11, `#cx-bpm` 3 / 9, `#cx-lock` 4 / 8, `#cx-tnote` 3 / 3, `#cx-sig` 1, `#cx-met` 1 | `context-global`, `nav`, `gear`, `lights`, `display-master`, `lumi-contexts`, `storage-import`, `taps`, `colors` |
| Sheets | `#sheet-metronome` 2 / 8, `#sheet-lights` 4 / 4, `[data-sheet-close]` 2 / 3, `.sheet-card` 1 | `nav`, `context-global`, `game`, `btmidi`, `gear`, `practice` |
| Messages | `#app-toast` 12 / 27, `#remote-hud` 7 / 12, `#snd-hint` 2 / 5, `#back-hint` 2 / 2, help overlay `#hp-ov` / `.hp-card` 3 / 6 | the seven `remote*` suites, `gear`, `midihub`, `synthconn`, `storage-import`, `trim`, `quiz`, `nav` |
| Top bar and footer | `.topbar` 2 / 6, class `bar-hidden` 1 / 2, `.foot` / `footer` text | `quiz`, `synthtab`, `gear`, `assets` |

**The home page.** 22 suites wait for `App.active === 'quiz'` before they do anything: `audioin:113`,
`btmidi:53`, `chordchart:19`, `colors:43`, `game:29`, `gear:723`, `keys:25`, `lights:35,411`,
`lumi-practice:242`, `lumidisplay:30`, `multiin:35`, `oneopen:45,170`, `portnames:26`, `practice:20`,
`quiz-correction:23`, `quiz:52`, `remote-keys:114`, `remote-quiz:43`, `remote-runners:64`, `remote:57`,
`taps:12`, `remote-gear:85`. Checks whose meaning is "the start or a fallback is Exercises":
`tests/nav.test.js:26`, `tests/quiz.test.js:53,60`, `tests/practice.test.js:116`, `tests/trim.test.js:184,412,639`,
`tests/gear.test.js:734,783`, `tests/storage-import.test.js:380,899`. The home id comes from `js/app.js:93`
(`HOME = PAGES[0]`).

### 2.3 Visible text

45 suites read text, 526 reads in all. Most reads are page content (status lines, scores, messages of the page
under test); they change only when that page's words change. The texts of the shell that are compared exactly:

| Text | Check |
|---|---|
| Tabs `Learn\|Guitar\|Keys\|Play\|Train`, active `Learn` | `tests/nav.test.js:37`, `tests/quiz.test.js:57`; all labels collected in `tests/trim.test.js:242-246` |
| Pills `Piano\|Charts\|Pads`, `Neck\|Tab\|Notation`, `Woodshed\|Tuner`, `Exercises\|Chords\|Circle\|Plan` | `tests/nav.test.js:42,46,50`, `tests/quiz.test.js:58` |
| Gear: tabs `Synth\|Helix`, pills `Deck\|Live\|Hub` | `tests/gear.test.js:231,455`, `tests/midihub.test.js:61-62`, `tests/helix.test.js:90-93`, `tests/synthtab.test.js:63` |
| The link across: text `Gear` / `soundLAB`, `aria-label` "Open soundLAB Gear", `href` | `tests/nav.test.js:38`, `tests/gear.test.js:457` |
| The clef's label: "Key, scale…" and "<key> <scale> · <n> BPM" | `tests/context-global.test.js:67`, `tests/nav.test.js:94,112` |
| Tag beside the logo `gear`, footer "soundLAB Gear alpha", page title | `tests/gear.test.js:227`, `tests/assets.test.js:167,175,185` |
| Scale menu groups `Common:5,Minor family:2,Modes:5,Exotic:1` | `tests/nav.test.js:124` |
| Exercises topics `Notes,Intervals,Chords,Scales,Key signatures` | `tests/quiz.test.js:63` |
| The metronome tour says "Metronome" | `tests/nav.test.js:78` |
| Toast sentences (redirects, notices, refusals) | `trim`, `gear`, `storage-import`, the `remote*` suites, `synthconn` |

Help tours are text plus a selector per step: 20 tours, 43 selectors (`js/help.js:24`). A step whose selector
finds nothing just hides the ring (`js/help.js:169-185`). No suite checks that the selectors resolve; I measured
it (section 3.2).

### 2.4 Computed styles and geometry

`getComputedStyle` is called 33 times in 13 suites, `getBoundingClientRect` 59 times, other box reads 102 times.
What they assert, by kind:

| Kind | Checks |
|---|---|
| Something is displayed or not (`display`) | tab bars top / bottom: `tests/nav.test.js:29-30,134`, `tests/gear.test.js:446`; context bar: `tests/nav.test.js:90`; clef: `tests/nav.test.js:110`, `tests/quiz.test.js:345`, `tests/context-global.test.js:26`; Go live hides `.topbar` and `#tabbar-m`: `tests/synthtab.test.js:231,236`; lesson focus mode hides the LUMI section: `tests/keys.test.js:362,419`; a shown panel: `tests/trim.test.js:157`, `tests/storage-import.test.js:175` |
| No sideways scroll (`scrollWidth` against the window) | `nav:152` (Songs, 390), `game:394` (Progress, 390), `gear:449,461` (four Gear pages at 390, Deck at 360), `learn-instruments:202` (390), `performance:194` (390), `practice-audio:178` (390), `practice-progress-ui:171` (390), `practiceplan:90,395,412` (1200, 390, 360), `synthdeck:739` (five Deck tabs at 390), `synthdeck-scope:173`, `synthtab:314,326` (768, 375), `lumi-practice:478` (its section, 375) |
| Minimum sizes | context bar fields ≥ 44 px, clef ≥ 34 px and the same box as `#lights-btn`: `tests/context-global.test.js:33-35,65,138`, `tests/gear.test.js:493,498`; Deck buttons and strips ≥ 40 px: `tests/synthtab.test.js:307,314,323,326`; `#sdk-save` ≥ 52, Deck tab ≥ 44: `tests/synthdeck.test.js:748`; LUMI answer key ≥ 36: `tests/lumi-practice.test.js:480`; sound name ≥ 30 px type: `tests/synthtab.test.js:324,326` |
| Exact values | context bar 12 px from both edges on a phone: `tests/nav.test.js:145`; metronome sheet 390 wide, its bottom at the window's: `tests/nav.test.js:151`; bottom tab bar's bottom at the window's: `tests/nav.test.js:138`; select padding `13px`, label 230 px: `tests/practiceplan.test.js:96-97`; `#st-lvgrid` has 4 columns: `tests/synthtab.test.js:311,314` |
| Relative layout | logo and metronome icon on one row, metronome < 20 px from the right edge: `tests/nav.test.js:136,138-139`; header tools inside the screen and clear of the logo: `tests/gear.test.js:125-134,457,461`, `tests/context-global.test.js:30`; chord A and chord B share one row: `tests/practiceplan.test.js:84,96`; Learn pills on one row at 360 px: `tests/practiceplan.test.js:408-415`; HUD ≥ 15 px from both edges and its label fits: `tests/remote.test.js:205`, `tests/remote-quiz.test.js:445` |
| The control is what a tap hits (`elementFromPoint`) | every button, key and fret of every Exercises level on three devices: `tests/taps.test.js:20-31`; Next on screen: `tests/taps.test.js:41-42`; five controls not under the tab bar: `tests/game.test.js:369-388,397`; a sheet covers the clef: `tests/context-global.test.js:101-104` |
| Style values | `user-select`: `tests/taps.test.js:49-50`; dimmed keys use `filter: brightness`: `tests/lights.test.js:105,117`; themed ink differs from paper, SVG has a stroke: `tests/context-global.test.js:120-121`; contrast ≥ 4.5 for five elements: `tests/context-global.test.js:122-132`; canvas `touch-action`: `tests/synthdeck-scope.test.js:173` |
| Scrolling | tapping the open tab scrolls to the top: `tests/nav.test.js:53-55`; the top bar hides on scroll down (class `bar-hidden`): `tests/quiz.test.js:358-366`; the page scrolls when the wheel is over a knob: `tests/midihub-wheel.test.js:31-39` |

### 2.5 Viewports

1200 × 900 is the default (29 suites); 1280 × 900 in 6; eight browser suites give no viewport and get
Playwright's 1280 × 720 (`instrument-session`, `instrument-xp`, `midihub-lock`, `performance-progress`,
`pitch-lock`, `quiz-correction`, `sound-lock`, `update`). Phone and tablet sizes in use:

| Size | Suites |
|---|---|
| 390 × 844 | `nav`, `game`, `context-global`, `gear`, `learn-instruments`, `performance`, `practice-audio`, `practice-progress-ui`, `practiceplan`, `synthconn` |
| 390 × 800 | `synthdeck`, `synthdeck-scope` |
| 375 × 812 / 375 × 1000 | `remote`, `remote-quiz`, `synthtab` / `lumi-practice` |
| 360 × 780 / 360 × 844 / 360 × 740 | `context-global`, `gear` / `practiceplan` / `taps` |
| Pixel 7 (Playwright device, 412 wide, scale 2.625) | `taps` (`tests/taps.test.js:7`) |
| 768 × 1024, 820 × 1180 | `synthtab`, `synthconnect` |
| 1440 × 1000, 1200 × 520, 1200 × 700 | `context-global` and `gear`, `quiz` (auto-hide), `midihub-wheel` |

No suite runs at 1024 × 640, the FL plugin window the design system names (`docs/DESIGN-SYSTEM.md:53`).
Phone contexts are made with `hasTouch`; I measured that this makes `(pointer: coarse)` true, so
`--sl-control-h` is 48 px there (`css/tokens.css:140-142`) and today's `--h-ctl` 38 px (`css/style.css:109`).

### 2.6 Screenshots

Five calls, none compared with a stored picture: `tests/context-global.test.js:13-18,133` (only when the
variable `EVIDENCE_DIR` is set; CI does not set it), `tests/lumi-contexts.test.js:269`,
`tests/lumi-practice.test.js:482` and `tests/performance-safety.test.js:197` (always, to fixed files under
`/tmp`, never read again), `tests/performance.test.js:198` (on failure). There is no snapshot folder and no
pixel comparison anywhere in the repository.

### 2.7 Fonts

- `tests/quiz.test.js:66-67` checks that the music font `SLMusic` loads; `tests/taps.test.js:13` and
  `tests/practiceplan.test.js:405` wait for fonts before they measure. Nothing checks Bebas Neue or Barlow.
- One type size is asserted: `#st-nowname` ≥ 30 px (`tests/synthtab.test.js:324,326`).
- Measured, not asserted anywhere: the pages set Barlow at weight 600, 650 and 700 on about 1,000 of 1,600
  Barlow text nodes (all pages, 1200 px), and only the 400 and 500 files exist (`css/style.css:9-20`), so the browser
  thickens the 500 file itself. The mockup does the same (`docs/design/home-mockup.html:8-9,53`). Whether Phase
  B adds real weights is a design decision; if it does, each new font file is an `ASSETS` entry (section 5).

### 2.8 Where the suites are blind

1. **Hidden by attribute, shown by CSS.** Four elements carry `hidden` and are on screen today:
   `#sg-opendest` on Songs (`js/songs.js:548`), `#mh-ports` and `#mh-hero` on the Hub
   (`js/midihub.js:730,755`), `#st-pins` on the Deck (`js/synthtab.js:130`). The stylesheet has no global rule
   for `[hidden]`, only per-element ones (`css/style.css:296,312,356,405,421,886`). `CLAUDE.md:1654-1659` lists
   two more of the same kind as known. Any check that reads `.hidden` passes on them.
2. **Synthetic clicks** (item 1 of section 0). 38 browser suites have no real pointer action at all.
3. **Pages without a test of their DOM.** Suites that name the page's ids or classes: Tuner none; Chords and
   Circle `colors` only; Jam `trim` (2) and `storage-import` (1); Pads `trim` (3); Charts `chordchart`;
   metronome sheet `nav` only (`#met-startstop`).
4. **Themes.** The light theme is switched on in two places: `tests/context-global.test.js:117-133` (five
   elements) and `tests/synthdeck-scope.test.js:244-253` (canvas colours). No page is looked at in light.
5. **Reduced motion, focus rings, headings, labels:** no check (section 3.1).
6. **Sizes in between.** 820 px is tested only on the Gear connect panel, 1024 × 640 nowhere.
7. **The release probe and the artifact build read `index.html` as text.** `tests/release-workflow.test.js:15-18`
   and `.github/workflows/pages.yml:181-188` take the list of public files from the static `<script src>` and
   stylesheet tags; `tools/artifact_build.py:33-39` needs the literal `<script src="js/theory.js"></script>` and
   the "// Offline support" block. Files loaded another way drop out of both without a failure. No suite runs
   `tools/artifact_build.py`.

### 2.9 The riskiest twenty checks

Ordered by how likely Phase B is to hit them and how many checks fall with them.

| # | Check | What it asserts | Why Phase B hits it |
|---|---|---|---|
| 1 | `tests/nav.test.js:89-114`, `tests/context-global.test.js:61-93`, `tests/gear.test.js:465-504`, `tests/quiz.test.js:343-355` | The key, scale and tempo controls are a dropdown: closed at start, opened by `#ctx-btn`, closed by a tap outside, the clef, Esc, a page change, focus leaving, Back | "The key bar is always there" (`docs/DESIGN-SYSTEM.md:17-19`) |
| 2 | `tests/context-global.test.js:65` (15 pages × 2 sizes) and `tests/gear.test.js:498` | On every page the clef is visible, ≥ 34 px, the same box as `#lights-btn` within 1 px, the logo does not overlap the tools, the open bar is inside the window, each field ≥ 44 px | New header, new control sizes (44 px), the mockup's header has no clef, lights or metronome button (`docs/design/home-mockup.html:114-123`) |
| 3 | 22 boot waits on `App.active === 'quiz'` (2.2), for example `tests/taps.test.js:12` | The app starts on Exercises | "new home" (`docs/ROADMAP-2.0.md:57`) |
| 4 | `tests/taps.test.js:20-31,41-42` | Every Exercises control is the element under its own centre once scrolled into the area between 120 px from the top and the bottom bar; Next is on screen | A key bar under the header, a fixed footer line with the goal ring (`docs/DESIGN-SYSTEM.md:44`) |
| 5 | `tests/assets.test.js:170-179`, also `:158-166`, `:182-190`, `:109`, `:121-125` | The block from `<body>` to `<main>` is the same text in both HTML files and holds 13 named ids; the heads match line for line; `gear.html` loads exactly 18 scripts; its panels are read from the HTML | The shell built once from JavaScript; new shared scripts and stylesheets |
| 6 | `tests/nav.test.js:37` with `:42,46,50`, `tests/quiz.test.js:57-58`, `tests/gear.test.js:231,455`, `tests/trim.test.js:242-246` | Tab and pill labels, read as the whole text of `.tabbar-btn` and `.subtab` | New header component: any extra text in a tab (a badge, a hidden label) or a new class name |
| 7 | `tests/nav.test.js:92-95` | The corner tools are `.tb-tools .icon-btn` in the order help, settings, clef, lights, metronome; the clef's label names key and tempo | The mockup's header shows status dots and one gear |
| 8 | `tests/nav.test.js:134-139` | Phone: bottom bar shown and flush with the window bottom, top bar hidden, five tabs, logo and icons on one row, metronome icon in the corner | New phone header and bar |
| 9 | `tests/nav.test.js:145` | Phone: the open context bar is exactly 12 px from both edges | 16 px gutters (`css/tokens.css:83`) |
| 10 | `tests/nav.test.js:57-85,149-151`, `tests/context-global.test.js:96-106` | The metronome sheet: opens over the page, focus moves to its close button, Esc and a tap outside close it, on a phone it is 390 wide and sits on the bottom edge; while a sheet is open the clef is disabled and covered | "Sheet (bottom on phones, side on wide)" (`docs/DESIGN-SYSTEM.md:45`): a side sheet may not cover the header |
| 11 | `tests/nav.test.js:71,101`, `tests/context-global.test.js:86`, `tests/smoke.test.js:23,77` | Clicks at fixed points: (15, 790) and (640, 600) at 1280 × 800, (width − 12, height − 80), (640, 860) at 1280 × 900 | Whatever the new layout puts there gets the click; a footer link at (640, 860) would navigate |
| 12 | `tests/quiz.test.js:358-366` | The top bar gets class `bar-hidden` after scrolling down 500 px and returns on scroll up | A bar that is "always there" |
| 13 | The toast contract, for example `tests/remote.test.js:44`, `tests/trim.test.js:159-160`, `tests/gear.test.js:589` | `#app-toast` exists, `hidden` toggles, the text is the message and nothing else | A Toast component with an icon, a close button or a class for showing |
| 14 | `tests/remote.test.js:205`, `tests/remote-quiz.test.js:445` | The HUD at 375 px: wider than 200, ≥ 15 px from both edges, the label fits its `span` | New toast / HUD component |
| 15 | `tests/practiceplan.test.js:96-97` | `#tr-cc-a` has `padding-left` `13px` (the app's `select` rule) and `#tr-sess-label` is 230 px wide | Any change to the base `select` or input style |
| 16 | `tests/practiceplan.test.js:408-415` | At 360 px the Learn pills (at least four) sit on one row inside the window | New pill strip, longer labels, larger type |
| 17 | `tests/game.test.js:374` and `:369-388,397` | The Learn tab is `#tabbar-m .tabbar-btn[data-group="gtheory"]` and `html` has class `goal-due`; five Exercises controls are not under the tab bar | New nav markup; the goal moves to the footer line in the mockup |
| 18 | `tests/gear.test.js:125-134,457,461`, `tests/gear.test.js:227` | Gear's header at 390 and 360 px: the link reads `soundLAB`, tools inside the screen and clear of the logo; the tag reads `gear`, the footer names the app | The shared shell changes for Gear too, although Gear's design is Phase H |
| 19 | `tests/synthtab.test.js:231,236` | Go live hides `.topbar` and `#tabbar-m` (computed `display`) | Same: a Gear suite reading shell classes |
| 20 | `tests/trim.test.js:157`, `tests/storage-import.test.js:175`, `tests/smoke.test.js:31,85` | "A page is shown" = `#panel-<id>.active`, displayed, taller than 0, with children | Panels created or switched another way |

Close behind: `tests/lights.test.js:117` (dimming must be `filter: brightness`), `tests/keys.test.js:419`
(focus mode `display: none`), `tests/synthdeck.test.js:748`, `tests/synthtab.test.js:314,326`,
`tests/lumi-practice.test.js:480` (minimum sizes), `tests/midihub-wheel.test.js:39` (the Hub page must be taller
than 700 px), `tests/taps.test.js:49-50` (`user-select`), `tests/oneopen.test.js:158` (a row's `display`).

### 2.10 Which suites to run for which part

CI seconds of run 43617187646. "Pages" lists the suites that name the page's ids or classes.

| Part that changes | Suites | CI s |
|---|---|---|
| Shell: header, tabs, pills, link across | `nav` `gear` `trim` `smoke` `quiz` `game` `helix` `midihub` `synthtab` `practiceplan` `chordchart` `assets` | 151 |
| Key bar (today the clef dropdown) | `context-global` `nav` `gear` `quiz` `lights` `display-master` `lumi-contexts` `storage-import` `colors` `taps` | 416 (140 without `taps`) |
| Sheets (metronome, Lights & help) | `nav` `context-global` `game` `btmidi` `gear` `practice` `remote` | 120 |
| Toast and remote HUD | `remote` `remote-quiz` `remote-keys` `remote-shed` `remote-plan` `remote-runners` `remote-gear` `synthconn` `midihub` `storage-import` `trim` `gear` | 294 |
| Home / start page | `quiz` `nav` `trim` `gear` `practice` `storage-import` `remote-quiz`, plus the 22 boot waits | 161 + the full run |
| Exercises (`qz-`) | `quiz` `game` `quiz-correction` `remote-quiz` `taps` `practice` `learn-instruments` `lumi-contexts` `smoke` | 355 (80 without `taps`) |
| Piano, lessons, LUMI section (`pn-`, `kl-`, `lp-`) | `keys` `lumidisplay` `remote-keys` `lumi-practice` `display-master` `remote-plan` `colors` `lights` `lumi-contexts` `audio-level` `trim` `smoke` `learn-instruments` | 201 |
| Neck, Tab, Notation (`fb-`) | `practice` `remote-runners` `lumi-contexts` `colors` `quiz` | 32 |
| Chords, Circle | `colors` | 2 |
| Plan and Free practice (`pp-`, `tr-`) | `practiceplan` `remote-plan` `remote-runners` `trim` | 55 |
| Charts (`cc-`) | `chordchart` | 2 |
| Songs (`sg-`, the Player card) | `oneopen` `lumi-contexts` `lumidisplay` `remote-runners` | 38 |
| Jam | `trim` `storage-import` | 83 |
| Woodshed and guided performance (`ws-`, `pf-`, `pgu-`) | `performance` `performance-safety` `performance-progress` `practice-audio` `practice-progress-ui` `practice` `remote-shed` `instrument-session` `instrument-xp` | 38 |
| Pads | `trim` `lights` `colors` | 29 |
| Tuner | none | 0 |
| Settings (`set-`) | `audioin` `btmidi` `multiin` `storage-import` `trim` `lights` `remote` `oneopen` `portnames` | 167 |

---

## 3. (b) Visual and accessibility checks: what exists, what the app measures today, a suite sketch

### 3.1 What exists today

| Topic | Existing checks |
|---|---|
| Contrast | One: `tests/context-global.test.js:122-132`, five elements (`#ctx-btn`, `#cx-root`, `#cx-scale`, `#cx-bpm`, `#cx-sig`) at ≥ 4.5 to 1 in dark and light, against the nearest painted ancestor |
| Tap targets | Context bar fields ≥ 44 px and the clef ≥ 34 px on every page (`tests/context-global.test.js:33-35,65,138`, `tests/gear.test.js:493,498`); Deck ≥ 40 px (`tests/synthtab.test.js:307,323`); two Deck sizes (`tests/synthdeck.test.js:748`); one LUMI key (`tests/lumi-practice.test.js:480`) |
| Focus | Where focus goes, never whether a ring is drawn: `tests/nav.test.js:62-64`, `tests/context-global.test.js:73-78,93,102-106` |
| Sideways scroll | 13 suites, each on its own page (2.4). Not covered at any phone width: Chords, Circle, Neck, Tab, Notation, Piano, Charts, Pads, Jam, Tuner, Settings, Exercises' Path |
| Reachability by tap | `taps` (Exercises), `tests/game.test.js:369-388,397` |
| Labels and roles | The clef and its bar (`tests/context-global.test.js:67`), the link across (`tests/nav.test.js:38`); otherwise ARIA is read as state |
| Reduced motion, headings, tokens, fonts of the UI, the look in light | None |

### 3.2 What the app measures today (baseline for a look suite)

Both apps, the 15 + 4 pages and the two sheets, at 360, 390, 820 and 1200 px, dark and light: 184 states.
No MIDI ports, default stored state. Raw data: `shots/tests/look-probe.json`, `work-tests/probe-b/`,
summaries `work-tests/probe-summary2.out`, `work-tests/probe2b.out`.

| Measure | Result today | Would a strict check pass? |
|---|---|---|
| Sideways scroll of the document | None in any of the 184 states | Yes, from the first step |
| One `h1` per page | Only the Plan page has one ("Practice plan", `js/practiceplan.js:306`); the other 22 states have none | No. Strict only for pages that were re-skinned |
| Controls ≥ 44 × 44 px at 390 px (touch) | 715 of 953 visible controls are smaller; 27 are under 24 px. The corner icons are 38 × 38, pills 32 high (`css/style.css:289,361,627`) | No. Strict only for the shell and re-skinned pages |
| A visible change on keyboard focus | 3,696 controls focused after a Tab key (19 pages × 4 widths, dark), 0 without a change (the global rule is `css/style.css:694`) | Yes |
| `[hidden]` elements that are displayed | 4 (2.8 item 1) | After those four are fixed or listed |
| Controls without any name | 5: `#jam-vol-drums`, `#jam-vol-bass`, `#jam-vol-comp`, `#set-vol`, `#hx-skind` | After those are named |
| Every control is hit at its own centre (390 and 1200 px) | 1,178 controls on 19 pages; 6 misses, all on Helix (`#hx-save`, `#hx-favactive` and one input, twice) | Yes for soundLAB |
| Help-tour selectors resolve | 38 selectors on the 19 pages: 34 resolve and are shown; `#sg-player` is there but hidden until a score is open; three Live-set selectors exist only once a set exists | Yes, with a state per tour |
| Text contrast on real elements, soundLAB, 1200 px | Dark: 9 of 996 under AA (degree-coloured numerals on Chords, Circle and Tab, the tuner's placeholder dash) plus 8 on disabled controls. Light: 123 of 863 under AA: inactive segment buttons at 4.47 to 1 (56), `.muted` text at 4.41, accent-coloured labels at 2.64 to 2.98 | Dark nearly; light no |
| Text contrast, Gear, 1200 px | Dark 0 of 316 (33 on disabled controls); light 49 of 296 | — |
| Reduced motion | With `prefers-reduced-motion: reduce` emulated: 0 running animations and 0 elements with a transition, against 50 to 77 running animations and 360 to 850 elements with a transition without it (the rule is `css/style.css:995-997`) | Yes |
| Token use | 29 style sheets in the two documents, 6,376 colour-bearing declarations, 208 with a raw colour, 453 through the old variables, 0 through `--sl-*` | A ratchet, see below |
| Page paint | `body` is `rgb(19, 17, 20)` in dark (`--sl-bg` is `#0f0d10`, `css/tokens.css:15`) and `rgb(243, 239, 232)` in light | Shows a page is on tokens once it equals the token |
| Service worker | On the test server the worker activates in 0.8 s, cache `sl2-live-v9` holds 137 entries (= `ASSETS`), and both pages start offline from it with all stylesheets | Yes |

The probe took 55 s for the 184 states with the first five measures and the focus pass, and 23 s for tours,
reach and contrast on 76 states.

### 3.3 Contrast of the token pairs (computed from `css/tokens.css`, both themes)

`work-tests/contrast.js`, output `work-tests/contrast.out`. Text needs 4.5 to 1, large text and non-text 3 to 1.

| Pair | Dark | Light |
|---|---|---|
| `--sl-ink` on the four surfaces | pass | pass |
| `--sl-ink-muted` on the four surfaces | pass | pass |
| `--sl-accent` as text on `--sl-bg` / `-bg-raised` / `-surface` / `-surface-2` | pass | **3.24 / 3.02 / 3.64 / 3.07** |
| `--sl-accent-ink` on `--sl-accent` (the primary button's label) | pass | **3.64** |
| `--sl-ok` as text on the four surfaces | pass | **3.90 / 3.64 / 4.39 / 3.70** |
| `--sl-info` on `--sl-bg-raised` | pass | **4.42** |
| `--sl-warn`, `--sl-bad` | pass | pass |
| `--sl-ink-faint` (decorative, held to 3 to 1) | 2.92 and 2.65 on the two card surfaces | 2.26 to 2.73 |
| `--sl-line-strong` as a control border (3 to 1) | 1.13 to 1.38 | 1.28 to 1.54 |
| Degree dots on `--sl-key-white` (3 to 1) | all seven under 3 (1.16 to 2.95) | 2, 3, 4, 5 under 3 |

So `css/tokens.css:109` ("every pairing keeps ≥ 4.5:1") and `docs/DESIGN-SYSTEM.md:58` ("tokens are chosen for
it") hold for body and muted text in both themes and for every text pair in dark, and do not hold in light for
the accent as text, the primary button's label and the "ok" colour. The button label passes only as large text
(3 to 1). The degree dots are a separate matter: they are the LUMI's colours and are told apart by position and
label as well; the plan should say whether the 3 to 1 rule applies to them.

A naming trap for the same job: today's `--accent-ink` means "the accent as text" (`css/style.css:62,99`);
the new `--sl-accent-ink` means "text on the accent" (`css/tokens.css:30`).

### 3.4 Sketch: two suites, no pixel snapshots

Two names in the one list at `tests/run.sh:17`. Class names of new components are assumed to start with `sl-`
(no class, id or string in `js/`, `css/` or the two HTML files starts with `sl-` today; I searched).

**`tokens`** (pure Node, under a second)

| Case | How it is computed |
|---|---|
| T1 The documented pairs meet their contrast in both themes | Parse the `:root` and `:root[data-theme="light"]` blocks of `css/tokens.css`, composite translucent tokens over their surface, WCAG ratio. The pair list is the contract and lives in the test (ink and muted on four surfaces, accent as text, accent-ink on accent, status on surfaces, focus ring against surfaces). Fails today on the light rows of 3.3, so the tokens or the pair list change in the same step |
| T2 Every `var(--sl-…)` that `css/` or `js/` uses is defined | Regular expression over the files against the parsed token names. Catches a misspelt token, which CSS otherwise ignores silently |
| T3 Raw colours only go down | Count hex, `rgb(` and `hsl(` literals per file; the test holds the allowed number per file and fails when one rises. Today: `css/style.css` 54, `css/lumi-practice.css` 14, `js/*.js` 239 in 27 files (`js/app.js` 45, `js/piano.js` 28, `js/woodshed.js` 23, `js/chords.js` 20, …). Palettes that are data (note colours, the accent choices at `js/app.js:819-824`) stay on an allow list with a reason |
| T4 `css/tokens.css` is the first stylesheet of both pages | Read the heads (`index.html:15`, `gear.html:15`); the rule is `css/tokens.css:8` |
| T5 Motion can be switched off | The two reduce blocks are present (`css/tokens.css:144-146`, `css/style.css:995-997`) |

**`look`** (browser, both apps; pages × widths 360, 390, 820, 1024 × 640, 1200 × themes dark, light)

The suite carries two lists: `ALL` (every page and sheet of both apps) and `RESKINNED` (the shell and the pages
a step has rebuilt; it grows step by step). Loose cases run on `ALL` from the first step, strict cases on
`RESKINNED` only.

| Case | On | How it is computed |
|---|---|---|
| L1 No sideways scroll | `ALL` | After `App.switchTo(id)`: `document.documentElement.scrollWidth <= innerWidth`; also with each sheet open and the key bar shown |
| L2 Nothing with `hidden` is displayed | `ALL` | Every `[hidden]` element has no client rects |
| L3 Each control is what a tap hits | `ALL`, 390 and 1200 | For every visible button, select, input, link and summary of the active panel and the shell: scroll it to the centre, `document.elementFromPoint` at its centre is the element or inside it. "Visible" = `checkVisibility()` and not inside a closed `details` (Chromium still reports a size there) |
| L4 Keyboard focus is visible | `ALL`, one width | Press Tab once, then focus each control and compare outline, box-shadow, border and background with the unfocused style; on `RESKINNED` require the `--sl-focus` shadow |
| L5 Help tours point at something | `ALL` | For each `Help.TOURS[page]` step with a selector: it resolves and has a size, in the state the tour assumes |
| L6 Reduced motion | `ALL`, one width | Context with `reducedMotion: 'reduce'`; after a page change, a sheet and a toast: no running animation, no element with a transition duration above 0 |
| L7 Controls are ≥ 44 × 44 px | `RESKINNED`, 360 and 390 with touch | `getBoundingClientRect` of every visible control; exceptions (piano keys, fret hit areas, links inside a sentence) on a list with a reason |
| L8 One headline | `RESKINNED` | Exactly one visible `h1`; its height is at most two lines; it does not reach past the window (`docs/DESIGN-SYSTEM.md:54`) |
| L9 Text contrast on real elements, both themes | `RESKINNED` | Every visible text node: computed colour (with inherited opacity) against the composited background colours of its ancestors; 4.5 to 1, or 3 to 1 for type ≥ 24 px or ≥ 18.66 px bold; text over a gradient or picture is reported, not judged; disabled controls are skipped |
| L10 Tokens only | `RESKINNED` | Walk `document.styleSheets` (linked and the injected `style#css-…`): in every rule whose selector has `.sl-`, no colour-bearing declaration holds a raw colour; `body`'s computed background equals the resolved `--sl-bg` in both themes |
| L11 Every control has a name | `RESKINNED` | Text, `aria-label`, `aria-labelledby`, a wrapping or linked `label`, or `title` |
| L12 The shell is the same in both apps | both pages, 390 and 1200 | A signature of `.topbar`, `#tabbar-m`, the two sheets and the footer (tag, id, classes, three levels deep, without the tabs, the link's text and the tag text) is equal in `index.html` and `gear.html`. This is the run-time form of `tests/assets.test.js:170-179` |
| L13 The app's fonts are the ones drawn | one page per app | `document.fonts.check` for Barlow, Barlow Condensed and Bebas Neue; the `h1` on `RESKINNED` pages computes to the display family |
| L14 The worker installs and both pages start offline | once | `navigator.serviceWorker.ready`, the cache named in `sw.js` holds as many entries as `ASSETS`, then `context.setOffline(true)` and both pages boot with their stylesheets |

Cost: about 80 to 90 s locally for the whole matrix (measured: 55 s + 23 s for the cases I prototyped, plus 3 s
for L14); CI and this machine ran the complete suite within 1 % of each other.

What these cases cannot see: spacing and alignment, a hero cropped inside its own box, wrong but legal colours,
missing icons, overlapping text inside one element. That is what the screenshots in section 6 are for.

---

## 4. (c) The CI budget

**The workflow** (`.github/workflows/tests.yml`): runs on every `pull_request` (`:4`), on a push to one old
review branch (`:7`), by hand and when called by the two deploy workflows (`:8-9`). One job on `ubuntu-latest`
with `timeout-minutes: 30` (`:26-28`). It installs Node 24 (`:36-38`), Playwright 1.62.1 into the runner's
temp folder with `npm install --no-save --ignore-scripts` (`:49`) and Chromium with its system packages
(`playwright install --with-deps chromium`, `:50`), then runs `bash tests/run.sh` (`:54-55`). On a failure it
prints the last 100 lines of each failing log (`:56-66`). It uploads nothing.

**Times now** (commit `a914df2`):

| | Suites | Whole job |
|---|---|---|
| GitHub, run 43617187646 | 15 min 24 s (924 s), 3,541 checks | 15 min 56 s; install 23 s |
| GitHub, run 43167760384 (an earlier Phase A commit) | 14 min 20 s | install 47 s; the job waited 15 min in the queue first |
| This container, complete run | 15 min 32 s (932 s), 3,541 checks | other jobs were running beside it |

Slowest in CI: `taps` 276 s (30 % of the run), `storage-import` 60, `remote-keys` 55, `audioin` 42, `keys` 41,
`gear` 38, `game` 32, `remote-gear` 26, `lumi-practice` 25, `trim` 23, `release-workflow` 21. The 13 Node suites
take 24 s together.

**Headroom.** 30 min − 16 min = 14 min in a normal run. `docs/CI-DEPLOYMENT.md:23-24` records a cold runner
that spent nine minutes installing; with that the job would be at about 25 min today.

**After a merge** the suite runs again: `pages-next.yml` calls the same workflow on `v2` before it deploys the
beta (`.github/workflows/pages-next.yml:23-31`), and a second merge cancels the first run (`:17-20`). So each
Phase B step costs about 16 min per push to its pull request and 16 min more after its merge.

**What new passes would add** (measured locally; CI is about the same speed):

| Addition | Time | Notes |
|---|---|---|
| `tokens` suite | < 1 s | pure Node |
| `look` suite as sketched | 80 to 90 s | 5 widths × 2 themes × 23 page states |
| Screenshot pass, viewport shots: 19 pages + 4 shell states, 5 widths, 2 themes = 270 pictures | 57 s, 22 MB | `work-tests/shots.js`; 0.2 s per picture including the page change |
| Screenshot pass, full-page shots: 184 pictures | 70 s with the measures, 14.5 s of it capture, 25 MB | Exercises is 8,000 px tall as a full page and unreadable when scaled down; fixed bars land in the middle of the picture |
| Uploading the pictures as a workflow artifact | not measured | `actions/upload-artifact@v4` is already used in `.github/workflows/ios.yml:59` |

With `look` in the list and a screenshot step on pull requests the job would run about 18.5 min. No test pins
`timeout-minutes`; raising it to 40 in the step that adds `look` keeps the cold-install case safe.

A screenshot pass must not be a gate: CI's Chromium (build 1234) and a developer's differ, and text rendering
differs between machines.

---

## 5. (d) Rules every step must follow: service worker, `assets`, the deploy tests

### 5.1 `sw.js`

- **The number.** `CACHE` is `PREFIX + 'v9'` (`sw.js:8`); Phase A raised it once per step, v5 to v9
  (`CLAUDE.md:1319-1321`, `:1851`). The app is cache-first (`sw.js:123-136`), so a step that changes any served
  file and keeps the number leaves returning users on the old files (`CLAUDE.md:2127-2129`). Each Phase B step
  takes the next number (v10, v11, …). **No test checks this**: `tests/assets.test.js:74` only prints the name.
  It stays a rule of the plan and a line in each pull request's acceptance checks.
- **`ASSETS`** (`sw.js:9-103`, 137 entries). Install is `cache.addAll` (`sw.js:105-111`): one listed file that
  is missing fails the whole install, and nothing on screen says so. A file that is added, renamed or deleted
  changes `ASSETS` in the same commit.
- **A new CSS file** (for example `css/components.css`): link it in both heads, after `css/tokens.css`
  (`index.html:15-17`, `gear.html:15-16`); add it to `ASSETS`; raise the number. `css/tokens.css:8` requires
  tokens to stay the first stylesheet.
- **A new font file**: `@font-face` in CSS, the file in `fonts/`, an `ASSETS` entry (`sw.js:16-21` lists today's
  six).
- **A new folder at the top level** (pictures, for instance) is not copied by the native build scripts, which
  name the folders (`android/build.sh:32-33`, `ios/sync-web.sh:8-9`, `android/build.ps1:29-32`), nor by
  `tools/artifact_build.py:20`. Files inside `css/`, `js/`, `fonts/`, `icons/` need no change there.
- Phase A's rule that `sw.js` changes only in the number and `ASSETS` (`CLAUDE.md:1266-1268`) fits Phase B too:
  nothing in a redesign needs the handlers.
- Not a release: Phase A never touched `APP_VERSION`, `version.json`, the Android manifest or `releases/`
  (`CLAUDE.md:1266-1267`). `tests/update.test.js:29` reads the version from the source and does not care.

### 5.2 `tests/assets.test.js` (pure Node, 44 checks), for both pages

| Lines | Rule | What a Phase B step must do |
|---|---|---|
| `:74-78` | `ASSETS` is readable, every entry is a file on disk, none is listed twice | Keep `ASSETS` in step with the disk |
| `:86-95` | Each page: more than 10 scripts and at least one stylesheet; every script and stylesheet exists, is in `ASSETS`; the page itself is in `ASSETS`; no script for `studio`, `arrange`, `plugins`; no script twice | A new script or stylesheet is on disk and in `ASSETS` before the test passes |
| `:101-104` | `index.html` loads none of the seven gear modules, and **no line of it contains** `midihub`, `synthtab`, `synthlive`, `synthdeck` or `helix` | Not even a comment or a class name in `index.html` may contain those words |
| `:107-109` | `gear.html` loads all seven, the Deck's maps before the Deck, and **exactly 18 scripts** | A shared script added to both pages changes this number in the same commit |
| `:112-119` | The scripts both pages load come in the same order (at least 8); both start with `theory`, `note-palette`, `app`; `gear.html` loads only shared scripts and the seven | A new shared script (shell, components) goes into both pages at the same relative place, after `app.js` unless `:117` is changed with it |
| `:121-127` | Panels read from the HTML: none of Gear's in `index.html`, exactly Gear's four in `gear.html`; `data-app="gear"` only there | If panels are made by JavaScript, `:125` fails and `:123` passes on an empty list: rewrite both as a browser check |
| `:158-167` | The two heads are the same lines apart from the title and `css/lumi-practice.css` (`MAIN_ONLY_CSS`, `:43`) | A new stylesheet is linked on the same line in both heads, or added to that list with a reason |
| `:170-179` | The text from `<body>` to `<main>` is identical apart from the tag beside the logo, and holds `tabbar`, `app-switch`, `settings-btn`, `ctx-btn`, `lights-btn`, `met-btn`, `ctxbar`, `subnav`, `tabbar-m`, `sheet-metronome`, `panel-metronome`, `sheet-lights`, `panel-lights` | Until the shell is built from JavaScript: every shell edit is made in both files in one commit. When it is: this block is replaced by the run-time comparison (L12) and a static check that both pages hold the same mount markup |
| `:182-190` | The footer and the inline boot script are the same text; the boot calls `App.boot()` and registers `sw.js` | Same |
| `:201-276` | Storage: the old prefix is spelled on one line of `js/`; no string in `js/` starts with a key the deny list matches (`st.`, `ideas.`, `song.`, `sd.`, `plugins.`, …) | A new store key must not start with those. Note the look-alike: class prefix `sl-` is fine, store names under `st.` are not |

### 5.3 `tests/pages-deploy.test.js`, `tests/pages-next.test.js`, `tests/release-workflow.test.js`

These run the workflows' own shell against throwaway repositories and pin workflow text:

- `tests/pages-deploy.test.js:51`: `tests.yml` keeps the plain `pull_request` trigger, no inherited secrets, no
  persisted checkout credential. `:52`: Playwright 1.62.1, Node 24, `playwright install --with-deps chromium`.
  `:53`: the line `run: bash tests/run.sh` with nothing after it, and no `SL_SKIP` or `SKIP_UPDATE` anywhere in
  the file. `:50`: `permissions: contents: read`.
- So: a new suite goes into the one list in `tests/run.sh:17`, never behind an argument or a skip variable.
  A new suite must run on Playwright 1.62.1. The regular expression at `:53` does not forbid a further step in
  the workflow (I read it), which is what a non-gating screenshot upload would be; `PLAN.md` rule 12
  (`docs/plans/phase-a/PLAN.md:66-68`) still wants everything that gates in the one list.
- `tests/pages-next.test.js:46-51` pins the beta workflow: only from `v2`, the same reusable test job, its own
  concurrency group, no forced push.
- **Both deploys publish the whole tree** (`.github/workflows/pages-next.yml:69-70`,
  `.github/workflows/pages.yml:60`). Any picture committed to the repository is published under
  `/GuitarPak/next/` and later at the live address. `docs/design/home-e-stage.png` (322 KB) already is. Reference
  screenshots therefore do not belong in the repository.
- `tests/release-workflow.test.js:15-18` builds the release's file list from `index.html`'s static tags and
  uses `js/performance-engine.js` as its stale-file case (`:131`): that script tag stays in `index.html`, and
  scripts stay static tags.

---

## 6. (e) Screenshots for reviewers

**What the pictures show today** (I opened them). The mockup at 1280 px: wordmark, five text tabs, two status
dots and a gear in the header; under it one row of five pill controls (Key, Tempo, Scale lock with its
sentence, LUMI lights, Help); one headline, a Start button, a keyboard with degree dots across the width; a
footer line with the goal ring, streak and week. Today's app at 1200 px (`shots/tests/view/main-quiz-1200-dark.png`):
the header has the wordmark with an "alpha" tag, five tabs with icons, the Gear link and five icon buttons;
a pill row; then cards. Key, scale and tempo show only after the clef is pressed, as a card under the header
(`main-_keybar-1200-dark.png`) or across the screen on a phone (`main-_keybar-390-light.png`). The metronome
is a centred card at 1200 px (`main-_sheet-metronome-1200-dark.png`). At 390 px the five tabs are a bar along
the bottom (`main-quiz-390-dark.png`). There is no footer line and, except on the Plan page, no headline.

**How looks were checked in Phase A.** Each step wrote a throwaway script in the session's scratch folder
(`hand.js`, `overflow.js`) that started the app with fake MIDI ports, took a handful of pictures and printed
measurements; the agent then opened the PNG files. Examples left in the scratch folder: 24 pictures of A3b
named like `gear-deck-360.png`, `main-header-1200.png`, `notice-both-360.png`; 10 pictures of A4's Backup card
at 390 and 1200 px. Sizes used were 360 or 390 and 1200. None of the scripts is in the repository, the names
and states differ per step, and nothing can be run again by a reviewer. The repository itself has one recipe,
for the mockup (`docs/DESIGN-SYSTEM.md:63-70`), and one opt-in evidence shot
(`tests/context-global.test.js:13-18`).

**What a repeatable script should produce** (prototype: `work-tests/shots.js`, 270 pictures in 57 s):

- **A tool, not a suite:** `tools/shots.js <out-folder>`, started against a served tree (`SL_URL`), not in
  `tests/run.sh`.
- **Matrix:** every page of both apps (15 + 4) × widths 360, 390, 820, 1024 × 640, 1200 × dark and light.
- **Shell states on the home page of each app:** key bar, metronome sheet, Lights & help sheet, a toast; later
  the remote HUD, a help-tour step, the first-run welcome, the phone bar with the goal dot.
- **Page states that matter for a re-skin**, each reached through the hooks the suites already use: an
  Exercises question and its answered state (`SLQuiz.start`), a lesson run in focus mode, the Player card with a
  score, Settings with ports listed (fake LUMI and MODX ports as in `tests/gear.test.js:70-134`), an empty, a
  loading and an error state per page once those components exist (`docs/DESIGN-SYSTEM.md:46`).
- **Viewport-sized pictures** (what a person sees first), plus one full-page picture per page at 390 and 1200
  only where the page is short. Full pages of Exercises are 8,000 px tall.
- **Fixed conditions:** `deviceScaleFactor` 1, service workers blocked, `reducedMotion: 'reduce'` (the panel
  entrance animates for 240 ms, `css/style.css:462`), `document.fonts.ready` awaited, the caret hidden, focus
  removed before each shot (in my set the clef keeps a focus ring after the key bar closes), a fixed stored
  state and, for pages that show dates or streaks, a fixed clock.
- **Names:** `<app>-<page or _state>-<width>-<theme>.png` and an `index.html` contact sheet in the same folder.
- **Before and after:** run it on the base (`v2`) and on the branch (two servers through `SL_PORT`) into two
  folders; the contact sheet shows pairs side by side. A pixel-difference count per pair is a useful hint for
  "which pages did this step change"; it is information for the reviewer, never a pass or fail.
- **Where they go:** a folder outside the repository when run by hand; in CI an artifact of the pull-request
  run (a step with `if: github.event_name == 'pull_request'`, kept a week). Not committed (5.3). The pull
  request text links the artifact and names the three or four pictures a reviewer should open first.
- **The mockup is the only reference picture**, and it is one fixed canvas of 1280 × 800
  (`docs/design/home-mockup.html:26`). Rendered at 1200 px the right edge is cut (status dots and gear); at
  390 px only the left third shows. There is no phone, tablet or light-theme picture to compare against, and no
  picture of any page other than the home.

---

## 7. Rules proposed for every Phase B pull request (tests only)

1. **Ids and state contracts are the test interface.** A step keeps every id the suites name and the contracts
   of 2.2 (`hidden`, class `active`, `aria-pressed`, `aria-expanded`, `#app-toast` text). New looks come as new
   classes on the same elements. Where an element really goes away (the dropdown, a corner button), the step
   that removes it edits the suites of 2.10 in the same pull request and lists, in its text, each check that was
   rewritten, removed or added.
2. **A check is replaced by its equal, never loosened.** `l === 12` becomes the gutter token's value, "one row"
   stays "one row". A geometry check that no longer has a meaning is deleted with a sentence saying why.
3. **Make the suites independent of the home page first**, in a commit that passes on today's app (question 2).
4. **`look` and `tokens` arrive in the first step**, with `RESKINNED` holding only what that step rebuilt. Each
   later step adds its pages to the list.
5. **Run order per step:** the group of 2.10 while working; `taps` whenever a fixed bar or the Exercises page
   changes; the complete run before the pull request; the screenshots, looked at, before the pull request.
6. **Shell edits go into both HTML files in one commit** until the shell is built from JavaScript.
7. **`sw.js`: next number, `ASSETS` in step** (5.1). **No picture in the repository** (5.3).
8. **Use real input for new shell behaviour.** New checks for the header, key bar, sheets and toast use
   Playwright's `click` / `tap` / keyboard, which refuse hidden and covered elements, not `element.click()`.

---

## 8. Open questions, each with a recommended answer

1. **May Phase B rename ids, or are they frozen?**
   Recommended: frozen, with listed exceptions per step (rule 1). About 470 ids are named by the suites; a
   re-skin does not need new ids, only new classes.
2. **Is the new home a new page id, or Exercises with a new face?**
   Recommended: decide in the design map; for the tests, first remove the dependence. In a preparatory commit
   the 22 suites with a boot wait seed `app.tab` = `quiz` next to the keys they already seed (boot reads the
   stored tab, `js/app.js:1915`). That passes today and keeps passing whatever `PAGES[0]` becomes; the home step
   then changes only the checks about landing (`nav:26`, `quiz:53`, `practice:116`, `trim:184,412,639`,
   `gear:734,783`, `storage-import:380,899`).
3. **How does "the key bar is always there" meet three suites that test a dropdown?**
   Recommended: keep `#ctxbar`, the seven `cx-` ids and `App.ctx()`; on wide screens the bar is always shown and
   `context-global` becomes "on every page the bar is visible, inside the window, each control ≥ 44 px, both
   themes ≥ 4.5 to 1"; on phones, if the design folds the bar behind one control, the existing open / close
   checks stay for the phone size. The design map has to say what a phone shows: the mockup's bar needs about
   1,040 px (it runs from 72 to 1,114 px of the 1,280 px canvas) and has no phone layout.
4. **Pixel snapshots in CI?**
   Recommended: no. Different Chromium builds locally and in CI, no reference pictures beyond one mockup, and
   committed pictures would be published by both deploys. Code checks (`look`) gate; pictures inform.
5. **Where is `look` strict from day one?**
   Recommended: on every page for sideways scroll, `[hidden]`, reach by tap, focus, tours and reduced motion
   (all pass today, after four `[hidden]` cases and five unnamed controls are fixed or listed); on re-skinned
   pages only for 44 px, one `h1`, tokens only and contrast in both themes (all fail today).
6. **The light theme's tokens fail their own contrast rule (3.3). Fix the tokens or narrow the rule?**
   Recommended: fix the tokens before any component uses them: a separate token for the accent as text (as
   today's `--accent-ink` does, `css/style.css:99`), a darker "ok" in light, and a decision whether the primary
   button's label counts as large text. `tokens` case T1 then holds the agreed pair list.
7. **Is the 30-minute limit enough?**
   Recommended: raise `timeout-minutes` to 40 in the step that adds `look` (about 18.5 min expected, 27 min with
   a cold install). No test pins the number. Keep `taps` as it is in Phase B: it is the only suite that proves
   taps land, and `look` case L3 is a one-state check, not a replacement for every level on three devices.
8. **Should CI upload screenshots?**
   Recommended: yes, as a step that never fails the job and runs on pull requests only. It needs the owner's
   yes because `tests.yml` is also the gate of both deploy workflows; `tests/pages-deploy.test.js:50-53` does not
   forbid it.
9. **When the shell is built from JavaScript, what replaces the text comparison in `assets`?**
   Recommended: L12 at run time plus a small static check that both HTML files hold the same head and the same
   mount element; keep script tags static so the release probe and `tools/artifact_build.py` keep working
   (2.8 item 7).
10. **Barlow is drawn at weights it has no file for (2.7). Add 600 and 700 files?**
    Recommended: decide with the design map. If added: two `ASSETS` entries and a `look` check that no text
    uses a weight without a file. If not: leave it, it is today's look and the mockup's.
11. **The accent picker (four accents, `js/app.js:819-824`) against "amber is the only accent"
    (`docs/DESIGN-SYSTEM.md:31`).**
    Recommended: the plan says whether the picker stays. If it stays, contrast is checked for each accent in
    both themes, which multiplies T1 and L9 by four.
12. **May new checks require real input (rule 8) for existing suites too?**
    Recommended: no bulk rewrite. 577 synthetic clicks work; replace them only in the checks a step rewrites
    anyway, and let L2 and L3 cover visibility for all pages.

---

## 9. Not checked

- The suite and the probes ran on Playwright 1.63.0 / Node 22 / Chromium 1243 here. I did not run anything on
  CI's Playwright 1.62.1 / Node 24.
- The probes used the default stored state without MIDI ports. Pages look different with a LUMI or a MODX
  listed (long port names are known to be 3 px too wide at 360 px, `CLAUDE.md:1654-1656`), with a score loaded,
  during a lesson or with progress stored. None of those states was measured.
- The per-suite counts come from regular expressions over the test sources. I read `nav`, `context-global`,
  `taps`, `smoke`, `assets`, `pages-next` in full and the cited lines of the others; I did not read all 3,541
  checks.
- The contrast measurement on real elements composites solid background colours only. Text over a gradient or
  picture is counted as "unknown" (16 texts on Pads in light). The focus measurement accepts any style change
  as "visible"; it does not judge whether the ring itself has enough contrast.
- A first attempt to run the suite with `TMPDIR` pointed at a deep folder failed before any check: Chromium
  refused the long socket path. That was my setup; the run reported here used the default temp folder, where
  three suites also write their evidence pictures (2.6).
- Nothing was run in Safari, Firefox, on an iPad, in the Android WebView or in the claude.ai artifact viewer.
- `tools/artifact_build.py` was read, not run. Upload time and size of a CI artifact were not measured.
- Whether the degree colours and `--sl-line-strong` are meant to meet 3 to 1 is a design question; I only
  report the numbers.

## Appendix: files of this map

All under `scratchpad/v2/phaseB/`:

| File | What |
|---|---|
| `work-tests/inventory.js`, `inventory.json`, `table.js`, `table.md` | the static scan and the table of 2.1 |
| `work-tests/run.log`, `work-tests/logs/` | the complete local run |
| `work-tests/ci-run-43617187646.txt`, `ci.json` | per-suite times of the GitHub run |
| `work-tests/contrast.js`, `contrast.out` | token pair contrast (3.3), a prototype of `tokens` case T1 |
| `work-tests/look-probe.js`, `look-probe2.js`, `probe-summary.js`, `probe-summary2.out`, `probe2b.out`, `probe-b/` | the baseline measures (3.2), prototypes of `look` cases L1 to L11 |
| `work-tests/sw-probe.js` | the service-worker install and offline start (L14) |
| `work-tests/shots.js`, `shots/tests/view/` (270 PNG + `index.html`) | the reviewers' screenshot script and today's app |
| `shots/tests/mockup-e-1200.png`, `mockup-e-390.png`, `mockup-e-1280.png` | the home mockup as rendered |
| `shots/tests/*.png` (184 full-page shots), `look-probe.json` | the first probe run |
