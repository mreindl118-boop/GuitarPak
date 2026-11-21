# soundLAB 2.0 — Phase A ("Trim") implementation plan

Written 2026-11-11 against `origin/v2` at `5be2eab` (working tree `claude/verify-project-files-4bchk6-v2`).
Scope source: `docs/ROADMAP-2.0.md:55` (the Phase A row), `:9-17` (two apps, the cut list), `:68-77` (build rules).
Inputs: the seven map reports in this folder (`map-studio-daw.md`, `map-folds.md`, `map-gear.md`, `map-storage.md`,
`map-shell.md`, `map-tests-ci.md`, `map-docs-rules.md`). Where the maps disagreed, section 2 says which reading
won and why. The lines this plan leans on most were re-read in the tree before writing.

**Every `file:line` in this plan is a line of `5be2eab`.** Lines move after the first merge, so every edit also
names the function, id or registry it changes. Find by name once line numbers have drifted.

Nothing in the repository was changed to write this plan and no suite was run.

**Revised 2026-11-11 after two critiques.** Every issue was checked against the tree before it was taken up; the
last section ("Changes after critique") lists what changed and what was not adopted as proposed.

---

## 0. What is true when Phase A is done

| | soundLAB (`index.html`) | soundLAB Gear (`gear.html`) |
|---|---|---|
| Tabs and pages | Learn (Exercises, Chords, Circle, Plan) · Guitar (Neck, Tab, Notation) · Keys (Piano, Charts, Pads) · Play (Songs, Jam) · Train (Woodshed, Tuner) = 14 pages | Synth (Deck, Live, Hub) · Helix = 4 pages |
| Overlays | Metronome sheet, Lights & help sheet, Settings page | Metronome sheet, Lights & help sheet; the gear icon opens Settings in soundLAB |
| Gone | Studio space (Timeline, Editor, Song, Ideas, capture), the workspace switch, the loop/song sequencer, the sampler and every use of its database, FX slots, WAV export, the plug-in API | |
| Folded | Trainer cards live on the Plan page; the Synth pill is the Sound picker on Piano; LUMI practice is a section under the Keys lessons | |
| Sounds kept | `DAW.createSynth`, `DAW.SYNTH_PRESETS`, `DAW.guardPitched`, `DAW.createDrums`, `DAW.DRUM_LANES` for Piano, Jam, Woodshed, the guided performance player and Pads | |
| Storage | `soundlab2.*` at the live address, `soundlab2-next.*` on the beta, filled once by a copy of `guitarlab.*`; `guitarlab.*` and the `guitarlab-daw` database are never written, deleted or opened | same store, same prefix rule |
| Look | today's look everywhere (Phase B redesigns) | today's look (Phase H redesigns) |
| Both open at once | a bound pedal press acts here while a soundLAB window is visible; "Hear input" sounds in one window only | acts on the pedal only while no soundLAB window is visible; says "your other window has Hear input" when it does not own it |

---

## 1. Rules for every Phase A pull request

1. **Draft pull requests into `v2`; the owner merges** (`docs/ROADMAP-2.0.md:70`). Never push to `v2` or `main`,
   never force-push, never open a `v2` → `main` pull request.
2. **Stack the branches.** A1 branches from `origin/v2`; each later step branches from the step before it. Open
   every pull request as a draft with base `v2` and say in its text which earlier pull request it contains. Work on
   the next step does not wait for a merge. After an earlier step is merged, merge `v2` into the later branch
   (ordinary merge).
3. **Phase A is not a release.** Do not change `APP_VERSION` (`js/app.js:101`), `version.json`,
   `android/AndroidManifest.xml` or anything in `releases/`. No APK build, no artifact republish.
4. **`sw.js`: change only three things.** The number inside `CACHE` (`sw.js:4`), the `ASSETS` list (`sw.js:5-99`),
   and, in A1 only, the cache lookup inside the fetch handler (`sw.js:123`, decision D40). Never the comment at
   `sw.js:1-3` and never the activate filter at `sw.js:113`: PR #98 rewrites exactly those lines.
5. **`CLAUDE.md`: never edit lines 17-30** (the "soundLAB 2.0 — read first" paragraph). PR #98 rewrites it. Phase A
   facts go into a new section placed directly above `## Cross-module conventions`; every other entry is edited in
   place.
6. **Removed-feature data is never written or deleted.** From A1 on, no 2.0 code writes `st.*`, `ideas.list`,
   `song.name`, `sd.*`, `plugins.list`, `app.space`, `app.tabStudio` or `app.click`, and no 2.0 code opens or
   deletes the IndexedDB database `guitarlab-daw`. The live app on the same origin still uses all of them.
   From A4 on, no 2.0 code writes any `guitarlab.*` key at all.
7. **A page is three things that change in one commit:** its id in the page list (`js/app.js:42-45`), its
   `<section class="panel" id="panel-…">` (`index.html:91-116`) and its `<script>` tag (`index.html:121-167`).
   `boot()` prints "Module failed to load" for a panel without a module (`js/app.js:1559-1561`).
8. **A deleted file leaves `sw.js` `ASSETS` in the same commit.** Install uses `cache.addAll`
   (`sw.js:101-106`); one missing file makes the whole install fail and the old cache keeps serving the old app.
9. **Today's look.** No new components, no re-skin. New controls reuse existing classes (`.btn.sm`, `.chip`,
   `.card`, `details.tips`). If a new CSS rule needs a colour, it uses a `--sl-*` token (`css/tokens.css`), never
   a raw colour (`CLAUDE.md:24-25`).
10. **Nothing is silently lost.** A removed control disappears together with every text that points at it, or a
    line on the page says where the feature went. Section 9 lists what is deferred, so nobody builds it early.
11. **Never delete by prefix.** The Synth tab uses `st-` ids too (`js/synthtab.js:124-126`, `:425`, `:534-546`).
    Appendix C lists the other look-alike words.
12. **Tests.** Run the step's fast loop while working, then the full run before opening the pull request
    (section 11). New, renamed or removed suites are edited in the one list at `tests/run.sh:17`;
    `tests/pages-deploy.test.js:53` forbids a second CI command or arguments to `run.sh`.
13. **If PR #98 is merged while Phase A is in flight:** the next Phase A branch starts with an ordinary merge of
    `main`. Resolve `sw.js` to `PREFIX + 'v<current Phase A number>'`, take `APP_VERSION` and `version.json` from
    `main`, take PR #98's `CLAUDE.md` paragraph. Nothing else in this plan changes. If it is closed unmerged,
    nothing changes at all.

---

## 2. Decisions

Each row is final for Phase A unless the owner says otherwise (section 12 lists the four he should see).

### Scope and order

| # | Decision | Reason |
|---|---|---|
| D1 | Five pull requests: **A1** Studio, sequencer, sampler, plug-in API out · **A2** the three folds · **A3a** the main app stops depending on the Hub (no behaviour change) · **A3b** `gear.html` · **A4** storage prefix. | The task's A1-A4 with one split. A3 is split because Songs' "Open a score" runs through the Hub's Player (`js/songs.js:693-710`); taking that dependency out is a pure refactor that the existing suites can prove on its own, before the document is split in two. |
| D2 | Storage comes last. | The deny list is only final after the trims; the prefix change rewrites 49 suites and would conflict with every other step's test edits. The two data-safety changes that cannot wait (Pads and Woodshed writing Studio keys) are in A1. |

### Studio, sequencer, sampler

| # | Decision | Reason |
|---|---|---|
| D3 | The kept sound code stays where it is: `js/daw/synth.js` whole, `js/daw/engine.js` slimmed to the drum kit, global `window.DAW`. | Five consumers and `tests/sound-lock.test.js:42,60-61` need no edit; the diff is deletions only; `SYNTH_PRESETS[2]` is used by index (`js/woodshed.js:497`, `js/performance-player.js:19`). Rename in Phase C when Pads and the Woodshed drums are rebuilt. |
| D4 | The sampler, FX builders, WAV export, loop engine, song mode and `DAW.engine` are deleted. | No surviving consumer (grep: only `js/plugins.js:79`, `js/pads.js`, `js/woodshed.js:1428`, `js/app.js:1468,1483`, all edited in A1). The roadmap cuts them. They can be recovered from `main`. |
| D5 | Pads is play-only until Phase C: eight pads by touch, keys and MIDI, both MIDI maps, Remap, key lights. Play loop, Record hits, Click, Clear, the drum-track picker and "+ Drum track" go. This is the largest visible loss on a kept page, so it is owner item 4 (section 12). | They are the sequencer the roadmap cuts (`docs/ROADMAP-2.0.md:13-14`); Phase C rebuilds Pads as rhythm practice (`:21-22`, `:58`). The sound is unchanged: today's path is `createDrums(ctx, defaultDrums())` with no FX at gain 1 (`js/daw/engine.js:389`, `:415-436`). Pads has no kit choice today (`js/pads.js:250-262`). An unchanged Pads would also overwrite the live app's Studio tracks (`js/pads.js:67`). |
| D6 | The setting `app.click` ("Metronome click during Studio playback") is removed from Settings and Pads. | With play-only Pads nothing reads it. |
| D7 | Woodshed loses "every run lands in Ideas" (`captureRun`) and "+ From Studio track". `importTrack` stays. | Both are Studio features; `captureRun` would keep filling `ideas.list` (up to 100 runs of 800 notes) that no page can open and would trim the live app's ideas. `tests/remote-shed.test.js:60` uses `importTrack` as a helper. |
| D8 | The workspace code is removed completely: `SPACES`, `setSpace`, the wipe, `#space-btn`, `data-space`, the `space` event, `App.space`, `App.setSpace`. The three readers are fixed in the same commit. | Nothing in `js/` calls `App.setSpace` (grep); a constant getter would keep dead branches alive in `js/quiz.js:2951`, `js/pads.js:441`, `js/piano.js:1766`. |
| D9 | Stored Studio data is ignored, never written, never deleted. The sampler database is never opened. Deleting either is an explicit action in a release after 2.0. | The live app on the same origin still uses them (`docs/ROADMAP-2.0.md:74-77`). |
| D10 | `App.switchTo` gets a guard: an id that is not a page of this app goes through a small table `MOVED` (where it went, and a sentence to show) and otherwise to the home page. Boot uses the same function for the stored tab. | Today an unknown id blanks the screen and is saved as the last tab (`js/app.js:742-795`). The table is also how "say where the feature went" is done for old links and stored tabs. |

### Plug-in API

| # | Decision | Reason |
|---|---|---|
| D11 | Delete `js/plugins.js`, the `plugins/` folder, `PLUGINS.md` and the Settings card. **`App.addPage` stays** as an internal hook with its signature unchanged (the space argument is ignored). | `js/plugins.js:34` is the only dynamic code execution in the app. `addPage` runs no stored code and `tests/remote.test.js:57` builds its test page with it; removing it would mean rewriting that suite for no user gain. |
| D12 | From A1 the Backup import skips the keys of removed features and says how many it skipped. The full rework (format 2, three prefixes) is A4. | Until A4 the beta and the live app share `guitarlab.*`; a beta import must not write `plugins.list` (code the live app would run) or Studio keys. |

### The three folds

| # | Decision | Reason |
|---|---|---|
| D13 | **Trainer → Plan + Exercises.** The session log, the random prompts and the one-minute chord changes move, with their own look, into one collapsed section "Free practice" on the Plan page. The section is mounted **after** the Plan's `.pp-wrap` block, not inside it. The interval ear trainer is dropped; the section links to Exercises › Intervals › All intervals › Ear, and says why when the selected Learn instrument has no ear mode (Drums). `js/trainer.js` stays as a card library; ids keep `tr-`, stores keep `tr.*`. | "Folded" means the function survives. The Plan never launched the Trainer (`js/practiceplan.js:9-18`), so nothing else changes. Exercises already has the ear trainer's content with more modes (`js/quiz.js:913-916`, `:991-992`), but refuses a level whose mode the instrument does not allow (`js/quiz.js:1587-1589`, `js/learn-instruments.js:9`). The Plan's form rules are scoped only by `.pp-wrap` and would restyle the cards (`js/practiceplan.js:325`). Hosting the chord drill inside Exercises now would cost four hooks in the largest module; it becomes a real drill in Phase C. |
| D14 | **Synth pill → Sound picker.** The `synth` page is deleted. `#pn-voice` is relabelled "Sound". New `App.keys.setVoice(id)`. The Learn entry "Synth keyboard" opens Piano with the last synth sound. `pn.synthPreset` is kept as "last synth sound". The four sampled piano tones are not merged into the picker. | The picker already exists (`js/piano.js:1340-1341`, `:294-304`); the page only re-parents the Keys DOM (`js/piano.js:1909-1947`). Merging the piano tones changes the format of `pn.voice`: Phase B/C. |
| D15 | **LUMI pill → a collapsed section under the Keys lessons** (`#pn-lumi` after `#pn-lessons`). Same module, same 42 `lp-` ids, same `SLLumiPractice` hook, same leases; `js/practice-router.js` unchanged. **Open = owner, one owner at a time.** Opening the section, or starting a session, stops a lesson run and the runner. Starting a lesson or the runner, or opening a lesson from the Plan or the Learn bar, closes the section (which stops a session). While the section is open it alone answers the pedal (no fall-through to the lessons or the runner) and, with the opt-in double-tap key in simulated mode, reserves the lowest key; closed, nothing changes for lessons and runner. The display output is still chosen in the section. | The roadmap says "folded into Keys lessons" (`:16`). Triad targets held until correct, a separate answer keyboard and the scale-locked synth route exist nowhere else. Three suites survive with a new mount point. "Asks the section first whenever it is open" was not enough: NEXT with no session running starts one (`js/lumi-practice.js:279`), so a section left open would abort a lesson run from the pedal, and the lesson results' BACK would start a lesson under a running session (`js/keylessons.js:173`). Fallback if this slips: keep the page, drop only the pill, reach it from a button in the lessons card (map-folds 4.3 C). |
| D16 | Old ids redirect through `MOVED`: `trainer` → Plan, `synth` → Piano, `lumipractice` → Piano, each with one sentence. | D10. |

### soundLAB Gear

| # | Decision | Reason |
|---|---|---|
| D17 | `gear.html` is a second entry page over the same scripts, today's look. `js/app.js` picks its page set from one table `APPS`, chosen by `<html data-app="gear">` (or `window.SL_APP`). | "Two apps from one codebase" (`:9`); no build step; the gear modules run unchanged; the gear suites change a URL and a boot wait. Phase H does the design. |
| D18 | The static shell markup (header, context bar, two sheets, footer) is copied into `gear.html`. A pure-Node test compares the two copies. | About 70 lines of markup, no logic. Building the shell from JavaScript belongs to Phase B, which rebuilds it. |
| D19 | Gear loads `theory`, `note-palette`, `app`, `midi`, `remote`, `midirules`, `audioin`, `metronome`, `scoreplayer`, the seven gear modules, `help`, `lights`. It keeps the context bar, the metronome and the Lights & help sheet. Hear input is limited to one window by D45. | One shell for both apps; "Hear input" keeps a MODX on USB audio sounding after the page change (the launch restore and the keep-while-hidden rule, `js/audioin.js:542-551`, `:564-587`); the Scope and the Hub clock use the metronome (`js/synthdeck-scope.js:476-477`, `js/midihub.js:678`). None of these files references a main-only module unguarded (grep). |
| D20 | Settings exists only in soundLAB. In Gear the gear icon opens `index.html#settings`. The one switch Gear needs from Settings, Hear input, is on its Hub page (D45). | `js/settings.js` needs `piano.js` unguarded (`:780-783`); every gear page has its own Connect and port pickers (`js/midihub.js:737-741`, `js/synthtab.js:357-402`, `js/helix.js:100-112`). |
| D21 | `js/remote.js` loads in both apps and both claim a bound message. Only one of them acts on it (D44). | A pedal bound in soundLAB must stay claimed in Gear, or it reaches the Deck and Thru as a normal message (`docs/CONTROLLER-REMOTE.md:26-29`). Bindings are in the shared store. |
| D22 | The switch between the apps is a real link (`<a id="app-switch" class="btn sm">`) in the header slot the Studio button frees. Hidden when `window.SL_ARTIFACT` is set. | A link can be opened in a second window for side-by-side use; the Windows shortcut has no address bar (`releases/soundLAB-windows.bat:58`); Web MIDI is refused in the artifact viewer. |
| D23 | One service worker, one manifest. No manifest `shortcuts` entry, no separate install: Phase H. | Two workers cannot share a scope; the two apps share the core files and must update together. |
| D24 | Gear remembers its last page under its own key `gear.tab`. | With one shared `app.tab` each app would reset the other's last page. |
| D25 | **The Player becomes its own module `js/scoreplayer.js` (`window.SLScorePlayer`)**, mounted on the Songs page in soundLAB and in the Hub's Player view in Gear. Its API includes `paint()`: the host repaints it when ports or the Part change, and it repaints itself on `midi:state` and `lights`. Texts that point at the host ("connect MIDI above", "Open as tab") are per mount. | The roadmap names the Player on neither side. Songs needs it for all three "Open a score" buttons; the Hub has it today. One module with one mount per document loses nothing and leaves the final home to Phase G/H. Today the Player is repainted only by the Hub (`js/midihub.js:405`, `:967`); without `paint()` the moved card would stay on "No synth output yet" and `tests/midihub-player.test.js:79,84` would fail. |
| D26 | "Which output is the synth" (25 lines, `js/midihub.js:285-307`) moves into `js/midi.js` as `App.midi.synthOut`, still stored as `midihub.outId`. | The Player needs it in soundLAB; the Hub then uses the same copy. |
| D27 | The Hub's "Apply rules to what soundLAB hears" keeps working in soundLAB: the rule engine and the input-filter install move to a small shared file `js/midirules.js`. The Rules editor stays in Gear. The install re-runs on a `storage` event for `midihub.rulesIn`, and soundLAB › Settings › MIDI keyboard shows one line while Hub rules shape its input. | The checkbox says "every page". Without this a stored rule set would silently stop shaping practice input. The engine reads the rules on every call, but the filter is installed or removed from `midihub.rulesIn` at call time (`js/midihub.js:534-537`), so a visible soundLAB window would not notice the box being ticked in Gear; and nothing in soundLAB would show that a filter is on. The filter stays `null` when off because `tests/midihub.test.js:155` and the other users of the one filter slot rely on it. |
| D28 | Hub Thru and key splits run only while Gear is open. The Hub says so next to the Thru box, and soundLAB shows one notice if Thru is stored on. The practice route's "Hub Thru must be off" check stays. | Thru in soundLAB would mean moving the Hub's whole Thru path (rules, key splits, scale lock, the LUMI guard) into a shared file and then choosing the one window that forwards; a lock alone does not do it. That is routing work for Phase E/F, not a trim. The check at `js/practice-router.js:172` is what prevents doubled notes. |
| D29 | Three fixes in files A3b already touches: a Deck preset's key restore writes the store before it emits (`js/synthdeck.js:1415-1418`); the "App voice" controls are hidden where there is no app voice (`js/midihub.js:727,744,915`); Go live calls `App.wake.acquire` (`js/synthlive.js:301` calls an object today). | The first two break silently in Gear; the third never worked. |
| D30 | `gear.html` is added to the Android and iOS copy lines. No APK. `tools/artifact_build.py` is unchanged; the artifact stays soundLAB only. | The live-site path needs nothing (`MainActivity.java:124-125`); the bundles need the file for the next native build. |
| D31 | Boot understands `#page`: `gear.html#midihub`, `index.html#settings`. The hash is cleared once used. | Needed for the links across; there is no hash routing today (grep). |
| D44 | **One window acts on a pedal.** soundLAB keeps today's rule: it acts whenever its document is visible, focused or not, and while visible it holds a Web Lock (shared mode). Gear still claims a bound MIDI message but acts on it only when it can take that lock for an instant, which means no soundLAB window is visible. Without Web Locks, Gear acts only while it has focus. | With the two windows side by side (D22, D28) one press would advance the lesson and also step the Deck preset or the Live slot, which sends Bank Select and Program Change to the synth (`js/remote.js:156-157`, `js/synthtab.js:492-504`, `js/synthlive.js:133-140`). A focus test in soundLAB is rejected: soundLAB must keep answering the pedal while another program, FL Studio in particular, has focus (`docs/ROADMAP-2.0.md:3-5`). Live sets keep their own foot switch, which the remote does not touch (`js/synthlive.js:341-342`). |
| D45 | **One window plays Hear input.** `js/audioin.js` routes the input to the speakers only in the document that holds a Web Lock. The first window opened holds it; pressing On or Off in another window moves it there; a waiting window takes over when the holder closes. Gear gets one Off / On switch with a status line on the Hub page. Without Web Locks the service behaves as today. | Each document restores a stored `audio.monitor` at launch and keeps it while hidden (`js/audioin.js:542-551`, `:564-587`), so soundLAB plus Gear would play a MODX on USB audio twice. Leaving `js/audioin.js` out of Gear is rejected: opening Gear in the same window would then silence a synth that is heard through Hear input. The only control and the only painter today is the Settings card (`js/settings.js:566-630`), which Gear does not have (D20). |

### Storage

| # | Decision | Reason |
|---|---|---|
| D32 | One prefix constant in `js/app.js`, chosen by address: `soundlab2-next.` when the path ends in `/next/<file>`, otherwise `soundlab2.`. | With one shared scope the first beta visit would use up the one-time import, and at the flip the live app would start 2.0 on beta-era data. The roadmap wants the import "at the flip" (`:55`). The same code gives the live prefix at the live address, so nothing breaks at the release. The rule matches PR #98's cache scoping. |
| D33 | The import runs once per scope, triggered by a marker key (never a version number), synchronously where the store is defined, copy-only, never overwriting an existing key. | `js/midi.js:55-58` and `:121-124` write to the store while loading, two scripts after `js/app.js`. A marker works whether or not PR #98 merges. |
| D34 | A **deny list**, not an allow list: `st.*`, `ideas.*`, `song.*`, `sd.*`, `plugins.*`, `app.space`, `app.tabStudio`, `app.click`, `pads.track`, `app.gtab.gstudio`, `app.gtab.gsketch`, `app.gtab.gpl-*`, `tr.earBest`, `tr.earHarm`. Everything else is copied, including `tr.sessions`, `tr.ccA`, `tr.ccB`, `tr.best.*`, `pn.synthPreset`, `midihub.*`, `synthtab.*`, `hx.*`. | Five one-time migration markers must travel with their data (`fb.migr24`, `midi.allIn.v1`, `midi.voiceAuto`, `lights.v1`, `jam2.migr`) or 1.x migrations run again. A frozen allow list would drop keys added later. Pads has no stored beat any more (D5), so no Pads transform is needed. |
| D35 | Backup: export writes format 2 with the current scope's keys only; import accepts `soundlab2.`, `soundlab2-next.` and old `guitarlab.` files (through the deny list), string values only, and never writes a `guitarlab.` key. | A swapped literal would make every existing backup restore zero keys with no error (`js/settings.js:986`). |
| D36 | Settings › Backup shows what the import copied, what did not fit and what was left alone, and offers "Copy again" (two taps, in-page, overwrites). | It is the same function with an overwrite flag, and it is the answer if the beta's copy goes stale. Keys that did not fit are retried without it (D46). |
| D37 | All 49 suites are converted to the new prefix in A4, including three regular expressions; one new suite covers the import; a static check forbids the old literal. | Three suites would keep passing while testing nothing (`tests/game.test.js:56,72`, `tests/instrument-xp.test.js:15,27,90`, `tests/instrument-session.test.js:29`). |
| D46 | The copy is ordered and guarded. Order: every small value first (settings, flags, the migration markers), then large progress keys, then large libraries, then any other large key. After the copy it keeps about 200,000 characters of headroom by undoing its own lowest-priority copies. Keys that did not fit are retried at each start until they fit or until 2.0 has its own data under that key. A copy with failures is announced by an app-level notice at each start, not only by the Settings line. | localStorage has one budget per origin and `App.store.set` swallows a refused write (`js/app.js:534-538`). A copy ordered by size alone fails on exactly the largest keys, which are progress and libraries (`ws.lib` keeps 40 scores of up to 1,500 notes, `js/woodshed.js:313-316`, `:406`), still writes its "done" marker, and can leave the origin full, so both apps drop later writes without a word. Sizes were not measured on a real profile. |

### Service worker and the other open pull requests

| # | Decision | Reason |
|---|---|---|
| D38 | Phase A keeps the cache name `soundlab2-vN`. Numbers: A1 `v5`, A2 `v6`, A3a `v7`, A3b `v8`, A4 `v9`. PR #98's scope-named caches are not ported. | The task says not to act on PR #98. `v4` is skipped because PR #98 uses `'v4'` under its own prefix; a number that only rises keeps the later merge a one-token choice. |
| D39 | If PR #98 merges while Phase A is in flight, the next step starts by merging `main` into its branch (rule 13). If it is closed, nothing changes. | Otherwise the beta shows "v2.0.0 is available" on every visit (`js/app.js:129-130`) and four files conflict at the next `v2` → `main` pull request. |
| D40 | In A1 the fetch handler looks only in its own cache: `caches.open(CACHE).then(c => c.match(req, {ignoreSearch: true}))` instead of the global `caches.match` (`sw.js:123`). | Read from the code, not run in a browser: the live worker's scope covers `/next/`, so it handles a browser's very first beta load and stores those files in `guitarlab-v130`; the beta worker's global lookup then finds those older copies first. Phase A is the first time the beta's file set shrinks, so a stale mix would be visible. The line is outside PR #98's hunks. It also means a later flip no longer serves 1.x files from a leftover cache. |
| D41 | PR #90 (SheetLab, base `main`) is outside 2.0 and is not accounted for in code. | The roadmap puts sheet-music recognition last (`:63`). |

### Documents

| # | Decision | Reason |
|---|---|---|
| D42 | No doc file is moved or renamed. Moved or removed features get a one-line banner at the top of their doc. `PLUGINS.md` is deleted. `docs/ROADMAP-2.0.md` gets a "Phase A status" section (Appendix D) that each pull request updates. | About 40 cross-links; `docs/RELEASE-NOTES-1.0.0.md` is read by `.github/workflows/pages.yml:139` and `tests/release-workflow.test.js:13`. |
| D43 | Not done in Phase A: pruning `ICONS`, renaming `SPACE_LABELS`, a README rewrite, deleting `tools/bundle.py`. | No user effect; they only widen the diff. |

---

## 3. Order of work and cache numbers

| Step | Pull request | Depends on | `CACHE` after it | New suites in `tests/run.sh:17` |
|---|---|---|---|---|
| A1 | Remove the Studio space, sequencer/arranger, sampler + database use, plug-in API | — | `soundlab2-v5` | `trim`, `assets` |
| A2 | Fold Trainer, the Synth pill and the LUMI pill | A1 | `soundlab2-v6` | — (extends `trim`) |
| A3a | The main app stops depending on the Hub: score player, synth-out, rule engine become shared files | A2 | `soundlab2-v7` | — |
| A3b | `gear.html`: Deck, Live sets, Hub and Helix leave `index.html` | A3a | `soundlab2-v8` | `gear`, `remote-gear` (extends `trim`, `assets`) |
| A4 | Storage prefix `soundlab2.*` with the one-time copy | A3b | `soundlab2-v9` | `storage-import` |

Why this order: A1 removes the second page set, which lets A2 and A3b edit one flat page list instead of two.
A2 before A3 keeps the Keys group settled before the Synth group leaves. A4 last, see D2.

The same few lines are edited by several steps; Appendix B lists them so reviewers expect it.

---

## 4. A1 — Remove the Studio space, the sequencer/arranger, the sampler and the plug-in API

**Goal.** One page set. No Studio button, no capture button, no Timeline/Editor/Song/Ideas, no loop or song
engine, no sampler, no FX slots, no WAV export, no plug-in runtime. Piano, Jam, Woodshed, the guided performance
player and Pads sound exactly as before. The live app's Studio data on the same origin is untouched.

**Commits, in this order (each leaves the app bootable):**

1. Consumers first, Studio still present: Pads play-only, Woodshed, `js/piano.js:1764-1769`, `js/quiz.js:2951`.
2. Delete `js/studio.js` and `js/arrange.js` together with the shell edits (`js/app.js`, `index.html`,
   `css/style.css`, `js/help.js`, `js/settings.js`, `sw.js`).
3. Slim `js/daw/engine.js` **and** delete the plug-in API in one commit (`js/plugins.js:79` writes
   `DAW.fxPlugins`; the shipped sample calls it).
4. `sw.js` lookup (D40), tests, docs.

### 4.1 Files deleted

| File | Lines | Note |
|---|---|---|
| `js/studio.js` | 1268 | pages `song`, `ideas`, `tracks`; capture; the IndexedDB sample store (`:445-479`); live routing |
| `js/arrange.js` | 776 | page `arrange` |
| `js/plugins.js` | 126 | `window.SoundLab`; `new Function` at `:34`; boot run at `:125` |
| `plugins/sample-lofi.js`, `plugins/helix-stadium.js` | 50, 10 | nothing loads them; the folder goes |
| `PLUGINS.md` | 77 | referenced only from files in this cut |

### 4.2 Files added

| File | Content |
|---|---|
| `tests/trim.test.js` | browser suite, section 4.5 |
| `tests/assets.test.js` | pure Node, section 4.5 |

### 4.3 Files modified

**`js/app.js`**

| Lines | Edit |
|---|---|
| `37-45` | `SPACES` becomes one flat list `var PAGES = [...]` with today's 21 practice ids in today's order; `var HOME = PAGES[0]`; rewrite the comment (one app, Settings is an overlay). |
| `46-52`, `75-81` | drop the `song`, `arrange`, `tracks`, `ideas` entries from `SPACE_LABELS` and `SUB_LABELS` (names stay, D43). |
| `55` | `PANEL_ORDER = PAGES.concat(['metronome', 'lights', 'settings'])`. |
| `57-58` | comment: drop "st:edit, plugin pages". |
| `60-73` | `GROUPS` becomes a plain array holding today's six practice groups (`gtheory`, `ginst`, `gkeys`, `gsynth`, `gplay`, `gprac`); `gstudio` and `gsketch` go. Keep the id `gtheory` (`css/style.css:282`, `:970`, `tests/game.test.js:372`). |
| `83-89` | `groupOf` walks `GROUPS`. |
| `90` | delete `var space`. |
| `292` | comment ("the studio stack"). |
| `688-692` | delete `spaceOf` and `tabStoreKey`; add `var TAB_KEY = 'app.tab'`. |
| `700`, `712` | `GROUPS[space]` → `GROUPS`. |
| `742` (top of `switchTo`) | new first line after the sheet close: `name = resolvePage(name);` (see below). |
| `767-768` | delete the cross-workspace hop. |
| `778` | `if (name === HOME) visited.length = 0;` |
| `792` | `store.set(TAB_KEY, name);` |
| `885-910` | `addPage(id, label, sp, mod)`: keep the signature, ignore `sp`, push into `PAGES`, `PANEL_ORDER` and `GROUPS`; comment "internal page hook (used by tests/remote.test.js)". |
| `912-921` | `toggleSettings`: `PAGES`, `HOME`, `TAB_KEY`. |
| `1105` | `SPACES[spaceOf(p)]` → `PAGES.indexOf(p) !== -1`. |
| `1107` | delete the "leave the studio" Back step. |
| `1108` | `HOME`. |
| `1194-1255` | delete `wiping`, `wipeId`, `applySpace`, `setSpace`. |
| `1460-1463`, `1471-1473` | comments: the button drives the metronome. |
| `1467-1470` | `anyRunning()` returns `metRuns`. |
| `1477` | always `icon('metronome', 16) + icon(runs ? 'stop' : 'play', 12)`. |
| `1482-1493` | the click handler is `emit('met:toggle', {})`. |
| `1495-1497`, `1505` | delete the `st:state`, `st:tr`, `space`, `st:step` listeners. |
| `1625-1631` | delete the `#space-btn` wiring. |
| `1641-1654` | delete `startSpace`, `data-space` and the button label; keep `populateNav()`; start tab = `resolvePage(store.get(TAB_KEY, HOME))`. |
| `1750`/`1757` | `switchTo` is exported twice: keep one. |
| `1755-1756` | delete `get space()` and `setSpace`. |

New, next to `switchTo`:

```js
// pages that left this app: where they went and what to say (docs/ROADMAP-2.0.md, Phase A)
var MOVED = {
  arrange: { say: 'The Studio is not part of soundLAB 2.0.' },
  tracks:  { say: 'The Studio is not part of soundLAB 2.0.' },
  song:    { say: 'The Studio is not part of soundLAB 2.0.' },
  ideas:   { say: 'The Studio is not part of soundLAB 2.0.' }
};
function resolvePage(name) {
  if (name === 'settings' || SHEETS[name] || PAGES.indexOf(name) !== -1) return name;
  var mv = MOVED[name];
  if (mv && mv.say) toast(mv.say);
  return (mv && mv.to) || HOME;
}
```

`toast` is the app-wide toast already in `js/app.js:1700`. A2 and A3b add rows to `MOVED`.

**`index.html`**

| Line | Edit |
|---|---|
| `40` | remove `#space-btn` |
| `54-55` | remove `#cx-rec` and `#cx-rec-msg` (the rule that hid `#cx-rec` in practice lives in `js/studio.js:1162`, so this must be the same commit) |
| `85-89` | remove `#wipe` |
| `108`, `109`, `110`, `116` | remove panels `song`, `arrange`, `tracks`, `ideas` |
| `145`, `151`, `165` | remove the `studio.js`, `arrange.js`, `plugins.js` script tags |
| `143-144` | keep (`js/daw/synth.js`, `js/daw/engine.js`) |

**`css/style.css`**

| Lines | Edit |
|---|---|
| `219-230` | delete `#wipe` |
| `304`, `983`, `988`, `1013-1014` | delete the four `#space-btn` rules; keep `.tb-tools { gap: 2px; }` at `982` and the icon-button rule at `987` |
| `432-443` | delete `#ctx-btn.rec::after` (the red capture dot) |
| `649` | delete `.chip.ar-mini` |
| `889`, `906`, `973` | take `#sd-toast` out of the three selector lists |
| `294-296`, `465-466`, `981`, `985`, `997` | comments ("workspace", "six corner controls" is five) |

All `.st-*`, `.sd-*`, `.ar-*` rules of the Studio pages are injected by the two deleted files and go with them.

**`js/daw/engine.js`** (836 → about 135 lines)

| Lines | Action |
|---|---|
| `1-20` | rewrite the header: "sound library: the drum kit (`DAW.createDrums`, `DAW.DRUM_LANES`) for Jam, Woodshed and Pads" |
| `24-148` | KEEP: `DRUM_LANES`, `defaultDrums`, `createDrums` |
| `150-238`, `240-323`, `325-364`, `366-595`, `597-769`, `771-792` | delete: sampler, FX (incl. `fxPlugins` `282`, `287-292`), WAV, loop engine, song mode, `liveChannel`, `render` |
| `794`, `795`, `797` | KEEP: the line that creates `window.DAW`, `DAW.DRUM_LANES`, `DAW.createDrums` |
| `796`, `798-835` | delete: the other exports, the `transport:claim` listener, `DAW.engine` |

After this the file no longer uses `App`. `js/daw/synth.js`: only the header comment (`1-17`) changes. Do not
reorder or remove `SYNTH_PRESETS` entries.

**`js/pads.js`** (play-only, D5)

| Lines | Edit |
|---|---|
| `1-20` | header: no Studio, no Record |
| `25-26` | drop `rec`, `lastStep` |
| `44-68` | drop `drumTracks`, `padTrack`, `ensureTrack`; add `drumKit()` (below) |
| `99-115` | `hit(lane, vel)`: `drumKit().noteOn(lane, vel, App.getAudio().currentTime)` in a try/catch, then `flashPad(lane)` and the unchanged LED block (`110-114`) |
| `117-132` | drop `recordHit`, `bpmNow` |
| `156-196` | `render()` always draws the eight pads; drop the no-track branch, `paintTrackSel`, `paintRecCount` |
| `198-210` | `paintControls()`: drop the rec / play / click lines (`205-209`) |
| `232-236` | drop the `#pd-play`, `#pd-rec` CSS |
| `250-262` | drop `#pd-play`, `#pd-rec`, `#pd-click`, `#pd-clear`, `#pd-recinfo`, `#pd-track`, `#pd-mk`; keep `#pd-remap`, `#pd-mapreset`, `#pd-maphint` |
| `265-266`, `282`, `285` | reword `265-266`: "Play the pads with touch, the Z X C V / A S D F keys, or your MIDI keys. Recording a beat comes back when Pads becomes rhythm practice." Reword `282`: "Key lights keep the eight pad keys lit on the ROLI and flash them with every hit." (drop "including the loop's own beat"). At `285` drop the Tracks-page and "anywhere in the Studio" sentences |
| `289-293`, `302-322`, `350-387` | drop the element refs and listeners of the removed controls |
| `399`, `444`, `471` | call `hit(lane, vel)` without the third argument |
| `436-441` | replace with `if (App.active !== 'pads') return;` |
| `448-456` | drop the `st:step` and `st:state` listeners |
| `464-465` | `onShow` without `ensureTrack()`; `onHide` without `rec = false` |

```js
var kit = null, kitCtx = null;
function drumKit() {
  var ctx = App.getAudio();
  if (!kit || kitCtx !== ctx) { kit = DAW.createDrums(ctx); kit.output.connect(ctx.destination); kitCtx = ctx; }
  return kit;
}
```

This is the same wiring the Woodshed uses (`js/woodshed.js:493`). After it, `st.tracks`, `st.armed`,
`pads.track` and `app.click` have no reader or writer in the app.

**Other files**

| File | Lines | Edit |
|---|---|---|
| `js/woodshed.js` | `709`, `713-728` | delete the `captureRun()` call and the function |
| `js/woodshed.js` | `1180`, `1427-1432` | delete the "+ From Studio track" button and its handler |
| `js/woodshed.js` | `1169` | drop "…and lands as a take in your Studio Ideas" |
| `js/woodshed.js` | `393-397`, `1609` | KEEP `importTrack` |
| `js/woodshed.js` | `18-19`, `28-29`, `697`, `1601` | comments |
| `js/piano.js` | `1764-1766`, `1769` | drop `studioArmed`; the condition is `!padsOwn && !d.silent && !d.mute` |
| `js/piano.js` | `268-270`, `287`, `1755`, `1862`, `1910` | comments that say "Studio" or "plugins" (the tooltip at `1340` is reworded in A2) |
| `js/quiz.js` | `2951` | `if (App.active !== 'quiz') App.switchTo('quiz');` |
| `js/settings.js` | `75` | "…the Jam band." (drop "the Studio") |
| `js/settings.js` | `76-79`, `279-284`, `1007-1010` | delete the `#set-click` row, its wiring and its refresh in `onShow` |
| `js/settings.js` | `112-134`, `286-318` | delete the Studio card (`#set-retro`, `#set-voice`) and its wiring (`sd.retroSecs`, `sd.playVoice`, `sd:prefs`). Keep the one true sentence from `123` under Sound: "The context-bar time signature drives the metronome; the Jam band plays 4/4." |
| `js/settings.js` | `139` | "…preferences, palettes, jam songs, practice progress…" (drop "studio tracks") |
| `js/settings.js` | `234-244`, `680-723` | delete the Plugins card and its logic together (`697` dereferences `#set-plugin-file` unguarded) |
| `js/settings.js` | `985-987` | Backup import skips removed-feature keys (D12) with the `DEAD` pattern shown under this table, counts them and reports "N settings restored, M from removed features skipped — reloading…"; it also writes only string values |
| `js/help.js` | `80-84`, `85-90`, `91-96`, `131-135` | delete the `song`, `arrange`, `tracks`, `ideas` tours |
| `js/help.js` | `21`, `27`, `59`, `61` | drop the Studio clauses |
| `js/help.js` | `126-130` | Pads tour: `127` "the drum kit"; delete the `#pd-rec` step at `128`; `129` "…flashing with every hit." (was "flashing with the beat": the beat was the loop's) |
| `js/help.js` | `143` | drop "studio capture options" and "and plugins" |
| `js/help.js` | `251-252` | welcome: one app. "Start with Exercises… Around it: guitar, keys, songs, the jam band and the tuner." and "…the jam re-harmonizes." (line `253` is fixed in A2) |
| `js/helix.js` | `3`, `8`, `1109` | header comment loses the plug-in history; drop `builtIn: true` (its only reader was `js/plugins.js:49`) |
| `js/jam.js` | `346-347` | comment only. The kit id `studio` (`351`, `1090`, store `jam2.kit`) is a kit name: leave it |
| `js/midihub.js` | `29-30`, `1815` | comments ("the Studio capture dot", "plugin hook") |
| `js/performance-player.js` | `329` | "MIDI/Studio notes" → "MIDI notes" |
| `sw.js` | `41`, `42`, `64` | remove from `ASSETS` |
| `sw.js` | `4` | `'soundlab2-v5'` |
| `sw.js` | `123` | own-cache lookup (D40): `caches.open(CACHE).then(function (c) { return c.match(e.request, { ignoreSearch: true }); }).then(function (hit) { … })` |

The Backup skip pattern for `js/settings.js:985-987`:

```js
var DEAD = /^guitarlab\.(st\.|sd\.|ideas\.|song\.|plugins\.|app\.space$|app\.tabStudio$|app\.click$|pads\.track$)/;
```

`js/keylessons.js`, `js/metronome.js`, `js/jam.js`, `js/chordchart.js` need no code change: their
`transport:claim` listeners compare only their own owner name (`js/metronome.js:501`, `js/jam.js:1420`,
`js/chordchart.js:273`, `js/keylessons.js:846`).

### 4.4 Stored state

| Key | After A1 | Rule |
|---|---|---|
| `st.tracks`, `st.bars`, `st.armed`, `st.zoomX`, `st.snap`, `st.follow`, `st.loop`, `ideas.list`, `song.name`, `sd.retroSecs`, `sd.playVoice`, `plugins.list` | no reader, no writer | never write, never delete; Backup import skips them |
| `app.space`, `app.tabStudio`, `app.gtab.gstudio`, `app.gtab.gsketch`, `app.gtab.gpl-*` | no reader, no writer | ignore |
| `app.click`, `pads.track` | no reader, no writer | ignore |
| `app.tab` | only ever held a practice id (`js/app.js:792`) | unknown value → `resolvePage` → home |
| `pn.voice` holding a plug-in preset id (for example `bell`) | no such preset | already safe: `js/piano.js:283-284` plays the piano, `:302-303` resets the picker |
| `jam2.kit = 'studio'` | a Jam kit id | keep |
| IndexedDB `guitarlab-daw` | never opened | leave alone |

No migration code. The Backup export is unchanged in A1 (it still lists the whole shared store).

### 4.5 Tests

| Suite | Change |
|---|---|
| `tests/sound-lock.test.js` | delete the sampler checks (`68-74`, `83`, `85-86`, `150-159`) and the loop/song render checks (`87-101`, their names in `104`, `107`). Keep `guardPitched` (`116-139`), synth (`142-149`), drums (`160-162`), Jam (`164-175`). The file paths at `42`, `60-61` stay valid. `165` patches `js/jam.js` by its literal line `  App.register('jam', {`: do not touch that line. |
| `tests/nav.test.js` | delete the "studio space" block `155-173` |
| `tests/lights.test.js` | delete the Studio block `120-140` and its two assertions; keep what follows on the Exercises page (the block ended with `App.scaleLock.set(false)` and `App.switchTo('quiz')`) |
| `tests/colors.test.js` | delete the piano-roll block `213-239`; keep a plain switch to `fretboard` and the colour mode at `note`, because `241` onward expects both |
| `tests/context-global.test.js` | delete the `studio` list (`8`), its half of the loop (`62`) and "Studio shares Practice…" (`89-91`); the panel-set check at `60-61` compares against the one list; the `space-wiping` wait at `11` can go |
| `tests/smoke.test.js` | drop `arrange`, `tracks`, `song`, `ideas` from `22`; stop reading `App.space` at `24`; **strengthen** `27`: each visited id must be `App.active` and `#panel-<id>` must have class `active` |
| `tests/helix.test.js` | delete the old-plug-in parts: `OLD_PLUGIN` `17-18`, the `plugins.list` seed `28`, the argument at `64`, `oldPlugin: true` at `78`, the `SoundLab.plugins.list` read at `83` and the "old stored Helix plugin" assertion at `87`; keep "nothing connects at boot" |
| `tests/remote.test.js` | none (`App.addPage` keeps its signature); reword the comment at `54` |
| `tests/run.sh:17` | add `trim assets` |

**New `tests/trim.test.js`** (browser; grows in A2 and A3b). A1 checks:

- `main > .panel` ids are exactly `PAGES` plus `settings`; no tab or pill reads Studio, Sketch, Timeline, Editor, Song or Ideas.
- Gone from the page: `#space-btn`, `#cx-rec`, `#wipe`, `#set-click`, `#set-retro`, `#set-voice`, `#set-plugin-file`, `#ws-track`, `#pd-play`, `#pd-rec`. Gone from the window: `SoundLab`, `DAW.engine`, `DAW.createSampler`, `DAW.samples`, `DAW.buildFx`, `DAW.fxPlugins`, `App.space`, `App.setSpace`.
- A stored old plug-in (`plugins.list` whose code sets a global) is never run.
- `indexedDB.open` (stubbed in an init script) is never called with `guitarlab-daw`.
- Seeded `st.tracks`, `ideas.list`, `plugins.list`, `app.space`, `app.tabStudio` are byte-identical after visiting every page and hitting a pad; a stub on `Storage.prototype.setItem` records no write to them.
- Stale state: `app.space='studio'` + `app.tabStudio='arrange'` boots to Exercises with a visible panel; `App.switchTo('arrange')` lands on Exercises with a visible panel, shows the toast, and does not store `arrange` in `app.tab`.
- The kept sounds work with no engine: choosing a synth in `#pn-voice` and playing a key, starting and stopping Jam, a Pads hit and `DAW.createDrums(ctx).noteOn(...)` raise no page error.
- Backup import of a file holding `guitarlab.fb.root` and `guitarlab.plugins.list`: the first is restored, the second is not written, the message names one skipped item.

**New `tests/assets.test.js`** (pure Node, under a second):

- every `<script src>` and stylesheet in `index.html` exists on disk and is in `sw.js` `ASSETS`;
- every `ASSETS` entry exists on disk;
- `index.html` has no script tag for `studio`, `arrange` or `plugins`.

### 4.6 Docs

| File | Edit |
|---|---|
| `docs/ROADMAP-2.0.md` | insert the "Phase A status" section (Appendix D) after line 66; mark A1 |
| `CLAUDE.md` | new section above `## Cross-module conventions`: Phase A pointer, "one page set", `MOVED`, "Pads is play-only until Phase C". Delete the entries for `js/studio.js` (`317-322`), `js/arrange.js` (`604-614`), `js/plugins.js` (`406-412`). Rewrite `js/pads.js` (`594-603`), `js/daw/engine.js` (`615-634`) as "sound library: drum kit", retitle `js/daw/synth.js` (`635-639`). Drop the plug-in stub sentences from the Helix entry (`415-417`). Conventions: delete WORKSPACES (`683-688`) and the capture-dot and Studio lines of BACK TO BASICS (`678-680`); tab bar (`693`, `700-701` become "`App.addPage` = internal test hook"); Back (`723-730` "the home page"); context bar (`737` capture clause, `746-748` drum-track clause, `752` `#cx-rec`); Settings (`753-759` studio prefs); bus events (`780-782` capture and `space`); transport owners (`783-787`: met, jam, keys, quiz, chart); drag interactions (`801-807` keep the Jam and pointer rules); artifact (`905` WAV export); `879` "bump the number in `CACHE`". The stale `NO_CTX` / `LOCK_FREE` text (`719`, `737`, `746`) is corrected while there. |
| `README.md` | `30` drop "Studio" from the score sources; `35` drop "arbitrary plugins" |
| `docs/GUIDED-PERFORMANCE.md` | `6` "Studio tracks", `50` "XP/Ideas export", `96-97` the Studio source |
| `docs/HELIX-STADIUM.md` | `5-6`, `140`: the plug-in history becomes one past-tense line |
| `docs/EXTERNAL-MIDI-COVERAGE.md` | `35-39`: "the plug-in API was removed in 2.0" |
| dated records (`docs/FEATURE-COVERAGE-2026-10-23.md`, `docs/RELEASE-NOTES-1.0.0.md`, `docs/BRANCH-AUDIT-2026-10-23.md`, `tasks/*.md`) | no edit |

### 4.7 Acceptance checks

```
ls js/studio.js js/arrange.js js/plugins.js plugins PLUGINS.md        # all missing
grep -rnE "DAW\.engine|createSampler|fxPlugins|buildFx|SoundLab\b|setSpace|App\.space\b|indexedDB|captureRun" js index.html   # no code hits
grep -rnE "'st\.(tracks|armed|bars)'|'ideas\.list'|'app\.click'|'sd\.|'plugins\.list'" js                                    # no hits
grep -n "soundlab2-v5" sw.js && node tests/assets.test.js
grep -nE "loop|Tracks page|Record" js/pads.js; grep -n "with the beat\|pd-rec" js/help.js      # no user-facing text left (rule 10)
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh trim assets nav smoke context-global lights colors sound-lock helix
```

By hand on the served page: no Studio button in the header; the clef dropdown has no round capture button; Pads
plays by touch, keys and MIDI and has no Play loop or Record; the Woodshed has no "+ From Studio track"; Settings
has no Studio card, no Plugins card and no Studio click box; Jam's drum kits and the Piano synth sounds play.

---

## 5. A2 — Fold the Trainer, the Synth pill and the LUMI pill

**Goal.** Three pills disappear: Train › Trainer, Keys › Synth, Keys › LUMI. What they did is still in the app:
the Trainer's timer, prompts and chord-change drill on the Plan page; synth sounds in the Sound picker on Piano;
LUMI note and triad practice in a section under the Keys lessons. Keys becomes Piano | Charts | Pads, Train
becomes Woodshed | Tuner.

**Commits, in this order:** Synth pill (smallest), Trainer, LUMI (largest; it changes the Keys remote chain).
If the LUMI fold cannot be made green, ship the fallback in D15 and note it in the status table.

### 5.1 Files deleted / added

None deleted (`js/trainer.js`, `js/lumi-practice.js`, `css/lumi-practice.css`, `js/practice-router.js` keep
their paths, so `index.html:17,127,141,159` and `sw.js:10,23,36,58` do not change). None added.

### 5.2 Shared shell edits (one commit per fold touches these)

| File:line | Edit |
|---|---|
| `js/app.js:43` (`PAGES`) | remove `'synth'`, `'lumipractice'`, `'trainer'` |
| `js/app.js:49`, `51`, `78-80` | remove their labels |
| `js/app.js:64` (`gkeys`) | `['piano', 'chart', 'pads']` |
| `js/app.js:67` (`gprac`) | `['shed', 'tuner']` |
| `MOVED` (added in A1) | `trainer: { to: 'practiceplan', say: 'The Trainer cards are on the Plan page now, under Free practice.' }`, `synth: { to: 'piano', say: 'Synth sounds are in the Sound picker on the Piano page.' }`, `lumipractice: { to: 'piano', say: 'LUMI practice is on the Piano page now, under the lessons.' }` |
| `index.html:100`, `104`, `115` | remove panels `synth`, `trainer`, `lumipractice` |
| `js/settings.js:199` | hands-free list: "…Exercises, Keys lessons and LUMI practice on the Piano page, the Woodshed, the Practice plan and its one-minute chord changes, Songs, the fretboard runner, Live sets and the Deck." |
| `js/help.js:253` | welcome: "The tabs — Learn, Guitar, Keys, Play, Train… (Neck / Tab / Notation, Piano / Charts / Pads…)" |

### 5.3 Synth pill → Sound picker on Piano

| File:line | Edit |
|---|---|
| `js/piano.js:1909-1947` | delete `App.register('synth', …)` and `modules_onKey_passthrough` |
| `js/piano.js:1236`, `1303` | delete `synthRoot` and the rule `#panel-synth #pn-lessons{display:none}` |
| `js/piano.js:1340` | label "Voice" → "Sound"; tooltip "What this keyboard sounds like: the sampled grand piano or a synth sound (full pitch-bend and pressure from a ROLI)" |
| `js/piano.js:1481-1490` | move the body of the change handler into `applyVoice(id)`; the handler calls it |
| `js/piano.js:1880-1900` (`App.keys`) | add `setVoice: function (id) { … }`: accepts `'piano'` or a `DAW.SYNTH_PRESETS` id, sets the `<select>`, calls `applyVoice`; returns false for an unknown id |
| `js/piano.js:1065-1066`, `1906`, `1943` | comments |
| `js/keylessons.js:84`, `269` | use `entryInstrument`, else `'piano'` (the `App.active === 'synth'` branch can never be true again) |
| `js/keylessons.js:38`, `122`, `853` | comments |
| `js/learn-instruments.js:22` | `{ label: 'Synth keyboard', page: 'piano', voice: 'synth', kind: 'Instrument' }` |
| `js/learn-instruments.js:59-66` (the click handler) | after `App.switchTo(entry.page)`: `if (entry.voice === 'synth' && App.keys && App.keys.setVoice) App.keys.setVoice(App.store.get('pn.synthPreset', 'saw'));` |
| `js/help.js:41-48` | Piano tour: one step on `#pn-voice` ("Sound: the grand piano or a synth") |

Stores: `pn.voice` unchanged. `pn.synthPreset` is still written at `js/piano.js:1486` and now read by the Learn
entry. A stored `app.tab` or `app.gtab.gkeys` of `synth` lands on Piano (`resolvePage`, `js/app.js:716-717`).
The Learn instrument category `synth` (`js/learn-instruments.js:5`) is a different thing and stays.

### 5.4 Trainer → Plan page (and Exercises for ear training)

**`js/trainer.js`** becomes a card library.

| Lines | Edit |
|---|---|
| `645-652` | delete `App.register('trainer', …)`; export `App.trainerCards = { mount: init, show: onShow, hide: onHide, key: onKey, remote: remote }` |
| `8-10`, `35-41`, `306-373`, `404-408`, `472-487`, `513-521`, `528-530`, `570-585`, `590` | delete the interval ear trainer: constants, state, functions, markup, element cache, restore, wiring, `renderEarStats()` |
| `472-487` (in its place) | a short card: "Interval ear training is in Exercises: Intervals › All intervals › Ear." with a button `#tr-ear-go`. Its handler: `var li = App.learnInstruments; if (li && !li.allowsMode('ear')) { App.toast('Ear training is not part of the ' + li.label() + ' category. Pick another instrument in the Learn bar at the top of this page.'); return; }` then `App.switchTo('quiz'); if (!(window.SLQuiz && SLQuiz.start('intervals/iall/ear/1'))) App.toast('Open Intervals › All intervals › Ear on this page.');`. The level id exists (`js/quiz.js:913-916`, `991-992`, `1061`); `SLQuiz.start` returns `false` for a mode the instrument does not allow (`js/quiz.js:1587-1589`), and Drums allows only theory (`js/learn-instruments.js:9`). The old ear trainer had no such gate, so the card must say it |
| `598-609` (`onHide`) | drop the ear lines (`604-608`) |
| `616-634` (`remote`) | NEXT: count a change during a run; "Time's up" for 1.5 s after a run ran out; otherwise `false`. BACK: `false`. STOP: cancel the run, else pause the session clock, else `false` |
| `1-7` | header: where the cards are mounted |

Ids keep the `tr-` prefix, stores stay `tr.sessions`, `tr.ccA`, `tr.ccB`, `tr.best.<A>-<B>`. `tr.earBest` and
`tr.earHarm` are no longer read and are not converted into Exercises records (the XP layer forbids seeding
history, `CLAUDE.md` xp.js entry).

**`js/practiceplan.js`**

| Lines | Edit |
|---|---|
| `292` (the page markup) | append at the very end of the markup string, **after the closing `</div>` of `.pp-wrap`** (that is, after `<p id="pp-status" …></p></div>`): `<details class="pp-tools" id="pp-tools"><summary>Free practice: timer, prompts, one-minute chord changes</summary><p class="pp-muted">The timer pauses when you leave this page; it is separate from the plan's measured minutes.</p><div id="pp-tools-body"></div></details>`. Not inside `.pp-wrap` and without the class `card`: the Plan's rules `.pp-wrap input, .pp-wrap select {width:100%; padding:10px; …}`, `.pp-wrap .card {margin:0}`, `.pp-wrap li`, `.pp-wrap h2` (`js/practiceplan.js:325`) would restyle `#tr-sess-label` (`js/trainer.js:387`, `:418`) and the two chord selects (`:453-454`), and the Trainer's own cards would sit inside a card |
| `325` (`CSS`) | add `.pp-tools{max-width:960px;margin:14px auto 0}.pp-tools>summary{cursor:pointer;font-weight:600;padding:6px 2px 12px}` (the page's width and the look of `.pp-notes summary`; no colour) |
| `290-329` (`init`) | at the end: `if (App.trainerCards) App.trainerCards.mount(el('pp-tools-body'));` |
| `331-334` (`App.register`) | `onShow` also calls `App.trainerCards.show()`; `onHide` also calls `.hide()`; `onKey` first offers the key to `.key(e)` (Space counts a change during a run) |
| `202-213` (`remote`) | first line: `var t = App.trainerCards && App.trainerCards.remote(action); if (t) return t;` then today's behaviour |
| `190-196` | comment: Stop now cancels a chord run or pauses the timer |

Only `#pp-today`, `#pp-week` and `#pp-gaps` are repainted (`js/practiceplan.js:265-280`), so the static section
survives repaints. It is still inside the page's root element, so `el('pp-tools-body')` finds it and the page's
click handler (`js/practiceplan.js:293-309`) sees its buttons but matches none of the `tr-` ids.
`js/trainer.js` already loads before `js/practiceplan.js` (`index.html:141` vs `162`).

Other: delete the `trainer` tour (`js/help.js:66-68`); add one step to `TOURS.practiceplan` (`js/help.js:15-19`)
for `#pp-tools`; `js/settings.js:91` "trainer notes" → "practice notes"; comments `js/fretboard.js:2065`,
`js/app.js:436`.

Not touched: the metronome's tempo trainer (`met.trainer`, `js/metronome.js:235-686`) and the Circle page's
degree ear quiz (`js/theorytab.js:277`).

### 5.5 LUMI pill → a section under the Keys lessons

**`js/lumi-practice.js`**

| Lines | Edit |
|---|---|
| `485-493` | replace `App.register('lumipractice', …)` with `App.lumiPractice = { init: init, show: …, hide: …, close: close, stop: stop, remote: remote, remoteKey: function () { return mode !== 'hardware'; }, get open() { return isOpen(); }, get running() { return running; } }`. `show` = today's `onShow`, `hide` = today's `onHide`. New `isOpen()`: the `<details>` that holds `root` is open (`root.closest('details')`; where there is none, as in the fixture, it is `visible`). New `close(msg)`: fold that `<details>` if it is open, then `stop(msg)` and `visible = false`; nothing happens when the section is already closed |
| `240` (`start`) | after the line `if (!visible) return;`: `if (App.keysLessons && App.keysLessons.halt) App.keysLessons.halt(); if (App.keys && App.keys.stopRunner) App.keys.stopRunner();` (guarded: the fixture test injects this file alone into a mock `App`, `tests/lumi-practice.test.js:93`) |
| `1-6` | header: mounted on the Keys page |
| `494-499` | keep `window.SLLumiPractice` unchanged |

`visible` (`js/lumi-practice.js:9`, checked at `146`, `177`, `193`, `214`, `242`, `291`) now means "Piano page
shown and the section open". `open` is the fold state alone, so it stays true while another page is shown;
`close()` therefore also folds a section that was left open on a page that is not showing (a lesson opened
from the Plan page). Nothing else in the file changes; the 42 `lp-` ids stay.

**`js/piano.js`**

| Lines | Edit |
|---|---|
| `1427` | after `<div id="pn-lessons"></div>` add `<details class="card" id="pn-lumi"><summary>Notes and triads on the LUMI</summary><p class="muted small">While this section is open, the pedal and the double-tap key work here. Close it to use them for the lessons above.</p><div id="pn-lumi-body"></div></details>` |
| `1810-1812` | next to the lessons mount: `App.lumiPractice.init(document.getElementById('pn-lumi-body'))` in a try/catch; a `toggle` listener on the `<details>`. When it opens: `App.keysLessons.halt()`, `ppStop()` (which also clears `ppHeld`), then `App.lumiPractice.show()`. When it closes: `App.lumiPractice.hide()` |
| `1860-1864` (`onShow`) | `if (App.lumiPractice.open) App.lumiPractice.show();` |
| `1866-1876` (`onHide`) | `App.lumiPractice.hide();` |
| `1006` (`ppStart`) | first line, before the Guide branch: `if (App.lumiPractice) App.lumiPractice.close('The runner started. LUMI session stopped.');` |
| `1092-1095` (`onRemote`) | first: `if (App.lumiPractice && App.lumiPractice.open) return App.lumiPractice.remote(action) \|\| false;` and **no fall-through**: while the section is open neither the lessons nor the runner are asked. Then today's chain (lessons, runner), reached only with the section closed |
| `1902-1907` (`App.register('piano', …)`) | add `remoteKey: function () { return !!(App.lumiPractice && App.lumiPractice.open && App.lumiPractice.remoteKey()); }`. Because a lesson or runner start closes the section, this is never true during a lesson: the lowest key is graded there as today |

**`js/keylessons.js`**

| Lines | Edit |
|---|---|
| `264` (`start`) | first: `if (App.lumiPractice) App.lumiPractice.close('A lesson started. LUMI session stopped.');` (covers Start, Listen, Retry, Next level, the card's double-tap and a start from the pedal) |
| `91` (`releaseRunner`, called by `open` at `866` and by `learn:lesson` at `82`) | also `if (App.lumiPractice) App.lumiPractice.close('A lesson was opened.');` so a lesson opened from a Plan block or the Learn bar gets the pedal, as the comment at `js/piano.js:1062-1064` promises |
| `852` (the API) | add `halt: function () { stopAll(false); }`. Unlike `stop` it keeps `entryInstrument`, so opening the LUMI section never changes which instrument the next lesson is credited to |
| `123` (`onKeysPage`, used by the lessons' own double-tap at `137`) | `return App.active === 'piano' && !(App.lumiPractice && App.lumiPractice.open);` so the lessons' double-tap stands down while the section is open (the pedal is settled in `js/piano.js` `onRemote`) |
| `771-772` | add `.kl-running #pn-lumi` to the focus-mode hide list |

**Other**

| File | Edit |
|---|---|
| `css/lumi-practice.css:2-45` | rename the scope `#panel-lumipractice` → `#pn-lumi` in all 44 selectors (the scope keeps its `fieldset`, `legend`, `[hidden]`, `:focus-visible` rules from leaking into the Keys page) |
| `js/midi.js:447` | "Choose a LUMI display output on the Piano page, under Notes and triads on the LUMI (MIDI must be connected)." |
| `js/help.js:41-48` | Piano tour: one step on `#pn-lumi` |

Rules the fold must keep:

- The section is closed by default (its long safety texts stay out of the way). A closed section changes
  nothing for lessons, runner, pedal and double-tap.
- **Open = owner.** There is no state in which the section is open and a lesson run or the runner is active:
  opening it stops them; starting them (or opening a lesson from elsewhere) closes it. So the pedal never has
  two candidates, and the reserved lowest key (`remote.dbl`, simulated mode) is never taken from a lesson.
- An armed LUMI session and a lesson or runner never run together (a lease pauses the shared painter on the
  same output, `js/midi.js:486-497`).
- Leaving the Piano page, closing the section, window blur and app hide still stop and disarm a session
  (`js/lumi-practice.js:470-482`).
- Known cost, stated in the section: with the opt-in double-tap key on and the section open in simulated mode,
  the keyboard's lowest key is reserved on the Piano page (silent, not graded) until the section is closed.

### 5.6 Stored state

No new keys, no migration. `app.tab` / `app.gtab.gkeys` / `app.gtab.gprac` holding `synth`, `lumipractice` or
`trainer` fall back (`js/app.js:716-717`) or redirect (`resolvePage`). `tr.*` and `pn.synthPreset` stay in use.
The LUMI section is session-only, as the page was.

### 5.7 Tests

| Suite | Change |
|---|---|
| `tests/nav.test.js` | Keys pills `39` → `Piano\|Charts\|Pads`; drop the Synth-pill click `42-43`; `46` "Keys remembers the last page" with Charts; Train pills `48` → `Woodshed\|Tuner` |
| `tests/smoke.test.js:22` | drop `synth`, `trainer` |
| `tests/context-global.test.js:7` | drop `synth`, `lumipractice`, `trainer` |
| `tests/remote-keys.test.js` | delete the Synth-page block `313-340`; re-run the rest unchanged (a closed LUMI section must not change one result). Add four checks: (1) open `#pn-lumi`, then start a lesson from its Start button: the section is closed, no LUMI session is running, NEXT during the count-in answers "Starting…" and the lesson run is still there; (2) the same with `remote.dbl` on: `App.remoteKeyPage()` is `false` during the lesson and a strike on the lowest key is judged; (3) finish a lesson, open the section while the results show: BACK is `false`, no lesson run starts and a running LUMI session keeps running; (4) `App.keysLessons.open(id)` with the section open closes it and NEXT starts the lesson |
| `tests/remote-runners.test.js` | Trainer block `196-235`, `358`, `385-388`, `397`: re-home on the Plan page (`App.switchTo('practiceplan')`, open `#pp-tools`); keep the chord-run, late-press and session-pause checks (`#tr-cc-*`, `#tr-sess-*`); drop the interval checks; with no run, NEXT is the Plan's "Block: …" |
| `tests/remote-plan.test.js` | LUMI sections `69-213`: `App.switchTo('piano')` and open `#pn-lumi` instead of `App.switchTo('lumipractice')` (`73`, `146`, `184`); the idle check at `74` and BACK at `105` stay `false` because nothing falls through to the lessons; Plan sections `215-345`: idle STOP is still `false` |
| `tests/lumi-practice.test.js` | fixture container `17`, `94`, `444` → `pn-lumi`; module calls `94`, `99`, `150`, `523`, `655` → `App.lumiPractice.init/show/hide`; real-app steps `99`, `230`, `321`, `442` → Piano page + open the section; `236` page is `piano` |
| `tests/display-master.test.js` | `128`: Piano page + open the section |
| `tests/keys.test.js` | add: choosing a synth in `#pn-voice` stores `pn.voice`; `App.keys.setVoice('piano')` and `setVoice('saw')` switch it; starting a lesson or the runner closes an open LUMI section and stops its simulated session; opening the section stops a lesson run and the runner; `App.keysLessons.halt()` keeps the entry instrument |
| `tests/learn-instruments.test.js` | add: Synth category › "Synth keyboard" lands on Piano with a synth sound selected |
| `tests/practiceplan.test.js` | add: `#pp-tools` exists, is closed by default, is not inside `.pp-wrap`, holds the three cards; at 1200 px `#tr-cc-a` and `#tr-cc-b` share one row and `#tr-sess-label` is at most 230 px wide (the Plan's form rules did not reach them); phone-width overflow checks (`333`, `347`) still pass with it open |
| `tests/trim.test.js` | add: no pill reads Trainer, Synth or LUMI; `App.switchTo('trainer' / 'synth' / 'lumipractice')` lands on Plan / Piano / Piano with the sentence shown; stored `app.gtab.gkeys='synth'` opens Piano, `app.gtab.gprac='trainer'` opens Woodshed; `#tr-ear-go` starts the Exercises ear level under Piano; under the Drums category it stays on the Plan page and shows the toast that names the category |
| re-run only | `lumidisplay`, `lumi-contexts`, `midi-ports`, `practice-router`, `quiz`, `game`, `audio-level` |

### 5.8 Docs

| File | Edit |
|---|---|
| `CLAUDE.md` | `196-199` drop `tr-` from the page prefixes; `206-213` piano: the Sound picker and `App.keys.setVoice`; `267-274` lumi-practice: "a section on the Piano page (`#pn-lumi`), `App.lumiPractice`"; `292` trainer: "card library mounted by the Plan page, `App.trainerCards`"; `389-403` practiceplan: the Free practice section; `680-682` delete the `synth` page sentence; `689-701` groups; `793` `fb:practice` "(Practice plan block, Free practice prompt)" |
| `README.md` | row `29` LUMI practice "on the Piano page"; row `31` Trainer "on the Plan page (Free practice)" |
| `docs/CONTROLLER-REMOTE.md` | `40`, `55` LUMI practice on the Piano page, "while its section is open"; `53` "Keys page runner"; `58` Trainer row becomes "Plan page: one-minute chord changes" |
| `docs/LUMI-PRACTICE.md` | `22` "Open Keys › Piano and the section Notes and triads on the LUMI"; lifecycle text: open = owner (what opening the section stops, what closes it, that it owns the pedal while open) |
| `docs/PRACTICE-ROUTER.md:3`, `docs/GUIDED-PERFORMANCE.md:74,142` | "Keys → LUMI" → the Piano page section |
| `docs/PRACTICE-PLAN.md` | new short section "Free practice" |
| `docs/ROADMAP-2.0.md` | status table: A2 |

`sw.js`: `CACHE = 'soundlab2-v6'`; `ASSETS` unchanged.

### 5.9 Acceptance checks

```
grep -n "'synth'\|'trainer'\|'lumipractice'" js/app.js            # only inside MOVED
grep -rn "panel-synth\|panel-trainer\|panel-lumipractice" js css index.html   # no hits
grep -rn "Keys → LUMI" js docs README.md                          # no hits
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh trim nav smoke context-global remote-runners remote-keys lumi-practice display-master remote-plan learn-instruments keys practiceplan
```

By hand: Keys shows Piano | Charts | Pads; the Sound select plays the grand and the four synth sounds; the Plan
page has a closed "Free practice" section whose cards look as they did on the Trainer page and whose
chord-change minute counts Space and the pedal; under Drums the ear-training button says why it does nothing;
the Piano page has a closed "Notes and triads on the LUMI" section whose simulated session starts with the pedal
while it is open; starting a lesson folds the section and stops that session, and the pedal then drives the
lesson.

---

## 6. A3a — The main app stops depending on the Hub (no behaviour change)

**Goal.** After this step nothing outside the seven gear files calls into `js/midihub.js`. Three pieces of the
Hub that the practice app needs become shared files. Everything still lives in `index.html`; the user sees no
difference. This is what makes A3b a move instead of a rewrite.

Today's reach from the main app into the gear modules is exactly one place, Songs' "Open a score"
(`js/songs.js:694`, `703`, `708`; grep for `SLMidiHub|SLSynth*|SLHelix|synthDeck` outside the gear files finds
nothing else once `js/plugins.js` is gone).

### 6.1 Files added

| File | Content |
|---|---|
| `js/scoreplayer.js` | `window.SLScorePlayer`: the Player, cut out of `js/midihub.js` |
| `js/midirules.js` | `App.midiRules`: the Hub's rule engine and the input-filter install |

### 6.2 `js/scoreplayer.js`

Moved from `js/midihub.js`, unchanged in logic:

| From `js/midihub.js` | What |
|---|---|
| `1236-1241` | `PL` state and the `midihub.pl*` setting readers |
| `1246-1437` | `finishSong`, `readMidi` (`1266`), `readMusicXml` (`1319`), the `.mxl` reader and `plLoadFile` |
| `1440-1531` | `songToMidi`, `plOpenAsTab`, `plSet`, `checkScore`, `scoreToSong`, `scoreToMidi` |
| `1532-1585` | the key shifter (`SHIFT_SCALES`, `detectSongKey`, `shiftMap`, `shiftNote`, `plReshift`) |
| `1587-1651` | transport (`plNow`, `plEmit`, `plRelease`, `plTick`, `plPlay`, `plPause`, `plStop`, `plSeek`) |
| `1653-1716` | `paintPlayerTime`, `paintPlayer`, `wirePlayer` |
| `775-802` | the Player card markup (ids stay `mh-pl*`) |
| `1763-1764` | the two `.mh-pl*` CSS lines, plus the few shared classes the card uses (`.mh-chk`, `.mh-warn`, `.mh-cv-head`) so the card is styled where the Hub's CSS is absent; injected with `App.injectCSS('scoreplayer', …)` |

What the Player took from the Hub's closure, and its replacement:

| Hub piece | Used at | In `scoreplayer.js` |
|---|---|---|
| `g` / `set` on `midihub.pl*` | `1237-1240`, `1533-1537` | `App.store` with the same keys (settings carry over) |
| `hubOutId`, `hubOutName`, `hasOut` | `1625-1626`, `1670` | `App.midi.synthOut.id()`, `.name()`, `.has()` (6.4) |
| `ch()`, `partLabel()` | `1590`, `1671-1672` | read `midihub.ch` and `midihub.profile` from the store |
| `toast` (the Hub's `#mh-toast`) | several | `App.toast` |
| `els`, `root`, `esc` | paint and wire | its own, filled by `mount` |

API: `mount(el, opts)` (renders the card into `el`, idempotent: the Hub re-renders on Import and Reset),
`paint()`, `loadFile(name, buf)`, `loadScore(score)`, `play`, `pause`, `stop`, `seek`, `shiftNote`, `openAsTab`,
`toMidiBytes`, `key`, `state`, `scoreToMidi(score)`, `show()` (calls `opts.show`).

**The repaint path.** Today the Player has no listener of its own (`wirePlayer`, `js/midihub.js:1684-1716`). Its
output and Part label is repainted by the Hub: `midi:state` → `paintPorts()` (`:1772`) → `paintCvOut()` (`:724`)
→ `if (els.plout) paintPlayer()` (`:405`); the same on the Hub's `onShow` (`:1803`), on a Part change
(`renderControl`, `:398`) and once in `render()` (`:967`). The card is mounted at boot, before MIDI is ready, so
without this path it would stay on "No synth output yet". Two things keep it current:

- `paint()` is public and the Hub keeps its hook: `paintCvOut()` calls `SLScorePlayer.paint()` (6.4).
- the module also calls `paint()` itself on `midi:state` and on `lights`, the two events the Hub repaints its
  ports on (`js/midihub.js:1772`, `:1777`). That is what a mount without a Hub (Songs, A3b) relies on.

`paint()` returns at once while nothing is mounted.

**Per-mount options** (`opts`):

| Option | Meaning | The Hub passes |
|---|---|---|
| `show` | called by `show()`: bring the card on screen | switch to the Hub and its Player view |
| `ports: true` | adds a "Synth out" and a "Channel" select to the card, for a host with no Hub header; both write `midihub.outId` / `midihub.ch` and call `paint()` (used in A3b) | not set |
| `noOut` | the line shown while there is no synth output | not set: the default is today's "No synth output yet — connect MIDI above" (`js/midihub.js:1670`), which is true in the Hub |
| `connect: { label, run }` | a `.btn.sm` after the `noOut` line | not set |

"Open as tab" needs the Songs page (`js/midihub.js:1456`, `:1669`). Where `App.songs` is absent the button is
not rendered and the card shows one line in its place: "Open as tab is on the Songs page in soundLAB." In A3a
`App.songs` is always there, so nothing changes on screen; in A3b this is what Gear shows.

There is one mount per document. In A3a that is the Hub.

### 6.3 `js/midirules.js`

`App.midiRules = { apply: function (bytes, port) → [bytes…], install: function (), active: function () → { on, rules } }`.

- `apply` is the body of `applyRules` and `matches` (`js/midihub.js:492-532`) with a 12-line message classifier
  of its own (kind, channel, number, value, on) instead of the Hub's `decode`, which also builds monitor text.
  It reads `midihub.rules` from the store on every call, as today.
- `install` is `installFilter` (`js/midihub.js:534-537`): `App.midi.setInputFilter(rulesIn ? fn : null)`, reading
  `midihub.rulesIn`. The filter stays `null` when the box is off (`tests/midihub.test.js:152-155` asserts both
  states, and other suites use the one filter slot themselves). It runs: once at load; when the tab becomes
  visible; and on a `storage` event whose key ends in `midihub.rulesIn` (or is `null`, a cleared store). A
  `storage` event fires in the other documents of the origin, so ticking the box in a Gear window reaches a
  visible soundLAB window at once; the document that ticked it calls `install()` directly, as today
  (`js/midihub.js:1041`). The key test is by suffix, so it holds before and after the prefix change in A4.
- `active()` returns `{ on: <midihub.rulesIn is true>, rules: <number of enabled rules> }` for the status line
  that A3b adds to Settings. `install()` emits `midirules:state` when the installed state changed.
- Loaded right after `js/remote.js` (it needs `App.midi.setInputFilter`, `js/midi.js:1278`).

### 6.4 Files modified

| File | Lines | Edit |
|---|---|---|
| `js/midi.js` | new, exported next to `sendTo` (`1257`) | `App.midi.synthOut = { id, name, has, set }`: the moved `SYNTH_RE`, `NOT_SYNTH_RE`, `autoOut`, `hubOutId`, `portName`, `hubOutName` (`js/midihub.js:285-307`), still reading and writing `midihub.outId` (`'shared'` = the key-light output, unset = auto, never a LUMI or the GS Wavetable, native bridges return null). No other change to `js/midi.js`. |
| `js/midihub.js` | `285-307` | `autoOut`, `hubOutId`, `hubOutName`, `hasOut` become one-line delegates to `App.midi.synthOut` (the `HUB_API` names at `1793` stay) |
| `js/midihub.js` | `490-537` | `applyRules(bytes)` → `App.midiRules.apply(bytes, rulePort)`; `installFilter()` → `App.midiRules.install()`; `decode` stays (monitor, Learn) |
| `js/midihub.js` | `775-802` | the Player view keeps its wrapper `<div class="mh-view" data-view="player" hidden>` with an empty host inside; in `render()`, where `wirePlayer()` is called today (`966`), call `SLScorePlayer.mount(host, { show: function () { App.switchTo('midihub'); view('player'); } })` |
| `js/midihub.js` | `405` (`paintCvOut`) | `if (els.plout) paintPlayer();` → `if (window.SLScorePlayer) SLScorePlayer.paint();`. This hook is the Player's repaint on ports changed (`724`, `1772`), Hub shown (`1803`) and Part or profile changed (`398`) |
| `js/midihub.js` | `966`, `967` (`render`) | drop the `wirePlayer()` call and the trailing `paintPlayer()`; `mount()` wires and paints |
| `js/midihub.js` | `957-958`, `1228-1716`, `1763-1764` | remove the moved code and the `els.pl*` ids from the element list |
| `js/midihub.js` | `477` (Panic), `1785` (pagehide), `1804` (`onHide`) | `plPause()` → `SLScorePlayer.pause()` |
| `js/midihub.js` | `1816-1828` | `SLMidiHub.player = SLScorePlayer`, `SLMidiHub.scoreToMidi = SLScorePlayer.scoreToMidi` (aliases, so `tests/midihub-player.test.js` runs unchanged) |
| `js/songs.js` | `694`, `703`, `708` | `SLMidiHub.player` → `SLScorePlayer`; the missing-module message becomes "The score player is not loaded"; comment at `692` |
| `js/songs.js` | `537` | title "Play it on your synth (tempo, key shifter, loop)" |
| `index.html` | after `126`; before `153` | `<script src="js/midirules.js">` after `js/remote.js`; `<script src="js/scoreplayer.js">` before `js/midihub.js` |
| `sw.js` | `ASSETS`, `4` | add `js/scoreplayer.js`, `js/midirules.js`; `'soundlab2-v7'` |

Not touched: the Thru line at `js/midihub.js:568` (`tests/practice-router.test.js:245-246` matches its text).

### 6.5 Stored state

None changes. Same keys: `midihub.outId`, `midihub.ch`, `midihub.profile`, `midihub.pl*`, `midihub.rules`,
`midihub.rulesIn`.

### 6.6 Tests

| Suite | Change |
|---|---|
| `tests/oneopen.test.js` | wait on `window.SLScorePlayer` (`26`); `SLScorePlayer.scoreToMidi` (`29`); the rest unchanged ("Play on synth" still opens the Hub's Player view in this step) |
| `tests/midihub-player.test.js` | none. It is the proof of the repaint path: `79` reads `#mh-plout` right after opening the view and `84` expects the MODX port name; `110-128` change the Part and expect "All on Part 3" in `#mh-plpartlab`. The API calls go through the aliases. If a check reads a Player message from `#mh-toast`, read `#app-toast` |
| `tests/midihub.test.js` | add: `App.midiRules.apply(b)` equals `SLMidiHub.applyRules(b)` for the suite's rule set; the input-filter checks pass unchanged (`152-155`); after writing `midihub.rulesIn` straight to storage and dispatching a `storage` event for that key, the filter is installed, and removed again the same way |
| `tests/assets.test.js` | passes with the two new files (it reads the lists) |
| re-run only | `midihub-lock`, `midihub-wheel`, `synthdeck`, `synthdeck-scope`, `synthtab`, `synthconn`, `synthconnect`, `multiin`, `portnames`, `midi-ports`, `midi-ingress` (both load `js/midi.js` in a VM), `practice-router`, `remote-runners` |

### 6.7 Docs

`CLAUDE.md`: the `js/midi.js` entry gains `App.midi.synthOut`; the `js/midihub.js` entry (`448-526`) says the
Player is `js/scoreplayer.js` (the Hub repaints it through `SLScorePlayer.paint()`) and the rule engine is
`js/midirules.js` (installed at load, on return to the tab and on a `storage` event); two new layout entries;
the Songs ONE OPEN entry (`259-266`) names `SLScorePlayer`. `docs/ROADMAP-2.0.md` status: A3a.
Note for whoever lands `feat/review-to-synth` later: it calls `SLMidiHub.player` and `SLMidiHub.scoreToMidi`
from Score review and must call `SLScorePlayer` instead.

### 6.8 Acceptance checks

```
grep -rnE "SLMidiHub|SLSynth(Tab|Live|Deck|Scope)|SLHelix|synthDeck" js index.html | grep -vE "^js/(midihub|synthtab|synthlive|synthdeck|synthdeck-maps|synthdeck-scope|helix)\.js"   # no hits
grep -n "function readMusicXml\|function plPlay\|paintPlayer\|wirePlayer" js/midihub.js      # no hits
grep -n "SLScorePlayer.paint" js/midihub.js                         # one hit, inside paintCvOut
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh oneopen midihub midihub-player midihub-lock synthdeck synthtab practice-router midi-ports midi-ingress assets
```

By hand: Songs › Open a score › a MusicXML file › Practice lands in the Woodshed, Open as tab shows the tab,
Play on synth opens the Player as before; a Hub rule with "Apply to what soundLAB hears" still changes what the
Piano page receives; in the Hub's Player view the header names the synth output as soon as MIDI connects and
follows a Part change (the repaint path of 6.2).

---

## 7. A3b — `gear.html`: Deck, Live sets, Hub and Helix leave the main app

**Goal.** `index.html` loads no gear module and shows five tabs. `gear.html` shows Synth (Deck | Live | Hub) and
Helix with today's look and behaviour. A link in the header goes across in both directions. The Player sits on
the Songs page in soundLAB and in the Hub in Gear. With both apps open at once, one pedal press acts in one
of them and Hear input sounds once.

**Commits, in this order (each leaves both pages bootable):**

1. `APPS`, the cross-app guard, `#page`, `gear.html`, the panels and script tags out of `index.html`, `sw.js`,
   and the Player card on the Songs page (same commit: "Play on synth" needs a mount in soundLAB the moment the
   Hub leaves `index.html`).
2. The per-app texts (App voice, Thru hint, tours, Settings chips, the notices).
3. The rules that exist only because there are two documents: the pedal lock (D44), the Hear-input lock and
   Gear's switch (D45), the Hub-rules line in Settings (D27).
4. Suites and docs.

### 7.1 Files added

| File | Content |
|---|---|
| `gear.html` | `<html lang="en" data-app="gear">`; head as `index.html:4-16` without `css/lumi-practice.css`, `<title>soundLAB Gear — synth and pedal control (alpha)</title>`; the shell block copied from `index.html:20-84` as it stands after A1 (header, context bar, the two sheets) with `<span class="tag">gear</span>`; `<main>` with `panel-deck`, `panel-liveset`, `panel-midihub`, `panel-helix`; footer "soundLAB Gear alpha — runs entirely in your browser"; scripts in this order: `theory`, `note-palette`, `app`, `midi`, `remote`, `midirules`, `audioin`, `metronome`, `scoreplayer`, `midihub`, `synthtab`, `synthlive`, `synthdeck-maps`, `synthdeck-scope`, `synthdeck`, `helix`, `help`, `lights`; then `App.boot()` and the same worker registration as `index.html:168-175`. It links the same `manifest.webmanifest`. |
| `tests/gear.test.js` | browser suite, 7.5 |
| `tests/remote-gear.test.js` | the Live sets and Deck halves of `tests/remote-runners.test.js` (`237-357`, `438-479`), plus the two-window cases of D44 (7.5) |

Load-order facts to keep: `js/note-palette.js` before `js/app.js` (`js/app.js:1044-1048`); `synthdeck-maps`
before `synthdeck` (`js/synthdeck.js:47`); `synthdeck` before `App.boot()` (`js/midihub.js:970`). `deck`,
`liveset` and `midihub` must share one document (`js/synthtab.js:28-29`, `js/synthdeck.js:526-527`).

### 7.2 `js/app.js`

```js
// TWO APPS FROM ONE CODEBASE (docs/ROADMAP-2.0.md): index.html = soundLAB, gear.html = soundLAB Gear
var APP_ID = (window.SL_APP || document.documentElement.getAttribute('data-app')) === 'gear' ? 'gear' : 'main';
var APPS = {
  main: { url: 'index.html', name: 'soundLAB', tabKey: 'app.tab',
          pages: ['quiz', 'practiceplan', 'fretboard', 'tab', 'notation', 'chords', 'piano', 'chart', 'pads', 'songs', 'jam', 'shed', 'tuner', 'theory'],
          groups: [ /* gtheory, ginst (no helix), gkeys, gplay, gprac */ ] },
  gear: { url: 'gear.html', name: 'soundLAB Gear', tabKey: 'gear.tab',
          pages: ['deck', 'liveset', 'midihub', 'helix'],
          groups: [ { id: 'gsynth', label: 'Synth', icon: 'sliders', pages: ['deck', 'liveset', 'midihub'] },
                    { id: 'ghelix', label: 'Helix', icon: 'guitar', pages: ['helix'] } ] }
};
var PAGES = APPS[APP_ID].pages, GROUPS = APPS[APP_ID].groups, TAB_KEY = APPS[APP_ID].tabKey, HOME = PAGES[0];
function appOf(name) { for (var k in APPS) if (APPS[k].pages.indexOf(name) !== -1) return k; return name === 'settings' ? 'main' : null; }
function goApp(owner, page) { if (window.SL_ARTIFACT) { toast(APPS[owner].name + ' is not part of this preview.'); return; } location.href = APPS[owner].url + '#' + page; }
```

| Where | Edit |
|---|---|
| `PAGES` / `GROUPS` / `TAB_KEY` / `HOME` (from A1) | come from `APPS[APP_ID]`; `SPACE_LABELS` and `SUB_LABELS` stay one shared table |
| `resolvePage` | the first test becomes "a sheet, a page of this app, or `settings` when `APP_ID === 'main'`". Then, before the `MOVED` lookup: `var owner = appOf(name); if (owner && owner !== APP_ID) { goApp(owner, name); return null; }`; `switchTo` returns when it gets `null`. `settings` in Gear therefore opens `index.html#settings` |
| boot, start tab (`1651-1654`) | read `location.hash.slice(1)`: a page of this app becomes the start tab; `#settings` (soundLAB only) opens Settings after the start tab; a page of the other app → `location.replace(APPS[..].url + '#' + page)`. Clear the hash once used by passing the clean URL to the `history.replaceState` at `1144`. A **stored** tab that belongs to the other app never navigates (boot tests `appOf` before it calls `resolvePage`): it falls back to `HOME`, and soundLAB shows one notice, once (store key `gear.told`): "Deck, Live sets, the MIDI Hub and Helix are in soundLAB Gear now: the Gear button at the top." |
| boot, soundLAB only | if `midihub.thru` is stored `true` and `gear.thruTold` is unset: one notice "MIDI Hub Thru runs in soundLAB Gear now. Keep Gear open in a second window to pass your keyboard to the synth while you practise." then set `gear.thruTold` |
| boot (`1625-1631` slot) | fill `#app-switch`: in soundLAB `href="gear.html"`, text "Gear", `aria-label="Open soundLAB Gear"`; in Gear `href="index.html"`, text "soundLAB"; hidden when `window.SL_ARTIFACT` |
| `1154` | back hint: "Press Back again to leave " + `APPS[APP_ID].name` + "." |
| `1544-1551`, `1672-1673` | skip in Gear: the "tap to turn on sound" hint on `midi:note` and the guitar sample prefetch (no app voice there) |
| exports | `get app() { return APP_ID; }`, `goApp: goApp` |

### 7.3 Other files modified

| File | Lines | Edit |
|---|---|---|
| `index.html` | `40` slot | `<a class="btn sm" id="app-switch"></a>` first in `.tb-tools` |
| `index.html` | `96`, `112-114` | remove panels `helix`, `deck`, `liveset`, `midihub` |
| `index.html` | `153-158`, `163` | remove the script tags `midihub`, `synthtab`, `synthlive`, `synthdeck-maps`, `synthdeck-scope`, `synthdeck`, `helix`; keep `scoreplayer` and `midirules` |
| `css/style.css` | near `600-614` | `a.btn { text-decoration: none; }` (no colour; the phone rules that sized `#space-btn` are re-added for `#app-switch` only if the header overflows at 360 px) |
| `js/songs.js` | `init`, `831-833` | mount the Player: a card `#sg-player` after `#sg-open`, hidden until a file is sent to it; `SLScorePlayer.mount(el, { ports: true, noOut: 'No synth output yet. Connect your keyboard in Settings › MIDI keyboard.', connect: { label: 'Open Settings', run: function () { App.switchTo('settings'); } }, show: function () { App.switchTo('songs'); el.hidden = false; el.scrollIntoView({ block: 'start' }); } })`; `onHide` also calls `SLScorePlayer.pause()`. The Songs page has no MIDI connect control of its own (grep `Connect` in `js/songs.js`: none), so the Hub's "connect MIDI above" would point at nothing |
| `js/midihub.js` | `727`, `744`, `915` | hide `#mh-hear` (App voice) and its texts when `App.keys` is absent; the mute calls stay (harmless) |
| `js/midihub.js` | `744` slot, end of `render()`, `init` | **Hear input in Gear (D45).** In the `#mh-ports` row, where App voice was: `<span id="mh-hearin"></span>`. At the end of `render()`: `if (App.app === 'gear' && App.audioIn && App.audioIn.supported) App.audioIn.mountSwitch(root.querySelector('#mh-hearin'));`. In `init`, in Gear only: one `App.toast` per start when `audioin:state` reports Hear input wanted but held for a reason other than the other window (`why` is `perm`, `mic` or `fell`): the state's message plus " The switch is on the Hub page." |
| `js/midihub.js` | `727`, `743` | Thru hint: "Thru runs while soundLAB Gear is open." |
| `js/midihub.js` | `1-31` | header comment: a soundLAB Gear page |
| `js/remote.js` | `156-157` (`fire`), new block before `App.remote` (`382`) | **One window acts on a pedal (D44)**, spelled out under this table |
| `js/audioin.js` | `176` (`route`), `193` (`applyMonitor`), `404` (`setMonitor`), `491` (`reopen`), `542-551`, `564-587`, `590` (API) | **One window plays Hear input (D45)**, spelled out under this table |
| `js/scoreplayer.js` | the "Open as tab" button | nothing to edit: the rule from 6.2 now applies, because Gear has no `App.songs`. Gear shows "Open as tab is on the Songs page in soundLAB." in the button's place |
| `js/synthdeck.js` | `1415-1418` (`applyApp`) | write `fb.root`, `fb.scale`, `fb.mode` to the store before `App.emit('fb:set', …)`, as the context bar does (`js/app.js:1426-1433`) |
| `js/synthlive.js` | `301` | `App.wake.acquire('synthlive')` / `App.wake.release('synthlive')` |
| `js/help.js` | `285-289` | no welcome tour in Gear (and do not set `help.seen` there) |
| `js/help.js` | `116`, `117` | drop the App voice step of the Hub tour; the Thru step says Thru runs while Gear is open |
| `js/help.js` | `49-51` | Songs tour: one step on the Player card |
| `js/settings.js` | `199` | "…Live sets and the Deck in soundLAB Gear." |
| `js/settings.js` | `899` | chip text "Helix (in soundLAB Gear)" |
| `js/settings.js` | `156-159` (the MIDI keyboard card, after the Connect row), `onShow` | new line `<div class="muted small" id="set-midi-rules" hidden></div>`: while `App.midiRules.active()` reports the box on and at least one enabled rule, it reads "MIDI Hub rules are changing what soundLAB hears (N rules). Edit them in soundLAB Gear." followed by a `.btn.sm` "Open the Hub" that calls `App.goApp('gear', 'midihub')`. Painted on show and on `midirules:state` |
| `js/practice-router.js` | `173` | "Turn MIDI Hub Thru off in soundLAB Gear and release all keys/pedal before starting this route." (keeps the words `MIDI Hub Thru off` that `tests/practice-router.test.js:48` matches) |
| `sw.js` | `7`, `4` | add `'gear.html'` after `'index.html'`; `'soundlab2-v8'`. The gear entries at `51-57`, `62` stay: one worker serves both pages |
| `android/build.sh:32`, `android/build.ps1:29-30`, `ios/sync-web.sh:8` | | copy `gear.html` too (and `data/` at `ios/sync-web.sh:9`, which was always missing). No build is run |

Not changed: `js/lights.js` (`142`, `159` call `App.switchTo('settings')`, which the guard now carries across),
`js/metronome.js`, `tools/artifact_build.py`, `tools/helix-bridge.js`, `tools/helix-defs.json`,
`data/modx-performances.json`, `manifest.webmanifest`, the workflows (both Pages workflows publish the whole
tree: `.github/workflows/pages-next.yml:70`, `pages.yml:60`).

**One window acts on a pedal (D44) — `js/remote.js`.** Both apps load the file and both keep `claim()`
(`:110-154`) exactly as it is, so a bound message never reaches Thru, the Deck or the Live page's foot-switch
listener as data. What changes is who acts:

- Lock name `soundlab-remote-main` (Web Locks API, `navigator.locks`; not used anywhere in `js/` today, grep).
- **soundLAB** (`App.app === 'main'`) holds the lock in **shared** mode while its document is visible: it
  requests it at load and when `visibilitychange` reports visible, and lets it go when hidden. `fire()` is not
  touched for soundLAB: it acts whenever its document is visible, focused or not, as today. Two soundLAB
  windows share the lock and behave as today.
- **Gear**: in `fire()`, after the hidden test and the debounce (`:157-160`), a press that came from MIDI (`via`
  is `cc`, `pc`, `note` or `dbltap`) runs the rest of the function only inside
  `navigator.locks.request('soundlab-remote-main', { ifAvailable: true }, function (lock) { if (lock) act(); })`.
  The lock is free only while no soundLAB window is visible. Gear holds it just for that call. For such a press
  `fire()` returns `null`; no caller reads the result (`:129-131`, `:149`). Key presses (`via: 'key'`) and
  direct calls (`via: 'test'`, the suites) stay synchronous: a key event only reaches the focused window.
- No `navigator.locks`, or a refused request (the claude.ai viewer frame): Gear acts on a MIDI press only while
  `document.hasFocus()`; soundLAB is unchanged.
- `App.remote.holdsMain` (getter, for the suites): this document holds the shared lock.

In words, for the docs: with soundLAB and Gear both visible the pedal belongs to soundLAB. Gear answers the
pedal when soundLAB is hidden, minimised or closed. To step Live sets while soundLAB is visible, use the Live
page's own foot switch (`synthtab.fsCC`, `js/synthlive.js:341-342`) with a CC that is not bound to the remote.

**One window plays Hear input (D45) — `js/audioin.js`.**

- Lock name `soundlab-hear-input` (exclusive). A flag `owner` is `true` from the start where `navigator.locks`
  is missing or its request is refused (then everything is as today), otherwise `false` until the lock is granted.
- Every document queues a plain request at load. The first window gets it within one task and keeps it for its
  lifetime, whether Hear input is on or off. So with one window open every path stays synchronous as today; the
  launch restore runs 500 ms after load (`:564`), after the grant. `tests/audioin.test.js` uses one page per
  browser context and runs unchanged.
- `applyMonitor()` (`:193`) gets a first branch: wanted but not owner → not routed, `st.held = true`,
  `st.why = 'other'`, `st.msg = 'Your other soundLAB window has Hear input. Press On to hear it here instead.'`.
  `settle()` (`:244`) then parks the stream as it does for every hold.
- The automatic opens do not open the device for Hear input alone while not owner: `reopen` (`:491`), the
  return-to-visible branch (`:548-550`) and the launch restore (`:564-587`) set the same held state and return.
  A meter hold (`hold(tag)`) still opens the device; it is never routed to the speakers.
- `setMonitor(on)` (`:404`) while not owner: write `audio.monitor` as today, then request the lock with
  `{ steal: true }` and run today's body once it is granted. Pressing On or Off in a window therefore makes
  that window the owner. While owner the function is unchanged.
- The window that lost the lock (its request rejects with `AbortError`) re-reads `audio.monitor`. Still on: it
  stops routing, shows the `'other'` hold and queues a plain request again, so it takes over when the other
  window closes. Off: it runs today's Off path without writing the store. This is how Off pressed in one
  window stops the stream in the other, with no storage listener.
- A grant from the queue (the owner closed): if `audio.monitor` is on, run the launch restore (permission check
  first, `:556-587`).
- The Settings card needs no edit: it already paints `held` and `msg` (`js/settings.js:566-598`).
- New `App.audioIn.mountSwitch(el)`: renders `<span class="seg" role="group" aria-label="Hear input">` with two
  buttons Off / On and a `muted small` status line; the buttons call `setMonitor`; it repaints on
  `audioin:state`; idempotent (the Hub re-renders). Status line: the state's `error` or `msg`, else "Hearing
  <label> through this computer." or "Off."; and always "Input, level and meter: soundLAB › Settings." with a
  link to `index.html#settings`. Existing classes only (rule 9).

Behaviour that must survive the move unchanged: nothing connects at boot for the Hub and Helix
(`CLAUDE.md:417-421`); the Deck's one send funnel and its LUMI guard (`CLAUDE.md:554-558`); Thru never forwards
to a LUMI-named output (`js/midihub.js:568`).

### 7.4 Stored state

| Key | Rule |
|---|---|
| `gear.tab` | new: Gear's last page. `app.tab` stays soundLAB's |
| `gear.told`, `gear.thruTold` | new: the two one-time notices |
| `app.gtab.gsynth` | read by Gear (the group id is kept) |
| `app.gtab.ginst = 'helix'` | falls back to Neck (`js/app.js:716-717`) |
| `app.tab` = `deck` / `liveset` / `midihub` / `helix` | soundLAB boots to Exercises and shows the notice once |
| `midi.*`, `lights.*`, `remote.*`, `midihub.*`, `synthtab.*`, `hx.*`, key, scale, tempo, theme | shared by both apps through the same store; a second window sees a change on its next read. One `storage` listener exists (`js/midirules.js`, for `midihub.rulesIn`, 6.3); the two cross-window rules (D44, D45) use Web Locks, which store nothing |
| `audio.monitor` | shared; only the window that owns the Hear-input lock routes the input (D45) |

### 7.5 Tests

`tests/env.js`: add `GEAR_URL: process.env.SL_GEAR_URL || <URL with index.html replaced by gear.html>`. Do not
call `new URL()` in suites that shadow the global with `const URL = env.URL` (`nav:3`, `quiz:3`, `game:5`).

| Suite | Change |
|---|---|
| `midihub`, `midihub-wheel`, `synthdeck`, `synthtab`, `synthconn` | `goto(env.GEAR_URL)`; the boot wait `App.active === 'quiz'` (`midihub:28,249`, `midihub-wheel:24`, `synthdeck:54`, `synthtab:43`, `synthconn:56`) becomes `App.active === 'deck'`; "another page" is a gear page instead of `piano` (`midihub:65,71,75,218`, `synthdeck:683`); nav assertions `midihub:50`, `synthtab:62` unchanged in text; phone tab count `synthtab:317` is 2; the App voice checks `midihub:60-75` become "the control is hidden" |
| `synthdeck-scope` | `GEAR_URL`; `34-35` read `gear.html`; the boot wait at `39` becomes `App.active === 'deck'` (Exercises never becomes active in Gear); "another page" at `190` becomes `App.switchTo('helix')` (with the cross-app guard, `App.switchTo('piano')` would navigate to `index.html#piano` and destroy the test page) |
| `synthconnect`, `helix` | `GEAR_URL`; `helix:93-98` tab `/Helix/` with no pill strip; "leave the page" uses `deck` (`helix:259`) |
| `midihub-lock` | `GEAR_URL`; `56-60` "Thru stays locked on another page" uses `helix` instead of `quiz` |
| `midihub-player` | `GEAR_URL`; boot wait; "leaving" uses `deck` (`122`, `131`); everything else unchanged (the Hub still mounts the Player) |
| `remote-runners` | keeps runner and Songs (`78-195`, `358-384`, `399-436`) and the Plan-page Trainer block from A2; the boot wait at `65` no longer needs `SLSynthLive`; the gear seeds at `34-35` move with the gear half |
| `remote-gear` (new) | the moved Live and Deck checks run as they are: every press is followed by `await __wait(60)` (`remote-runners:282-295`, `345`, `445-449`), which covers Gear's one-task lock check. New, two pages in one browser context (soundLAB and Gear), each with its own fake MIDI ports and the same bound CC. The test sets each page's visibility itself (the `document.hidden` stub of `tests/synthdeck-scope.test.js:186-188`), so it does not depend on how headless Chromium reports a background page, and it waits for `App.remote.holdsMain` in soundLAB before the first press: (1) both visible, the CC sent into both: soundLAB emits `remote`, Gear emits none, sends no Bank Select or Program Change, and its Live slot does not move; (2) soundLAB's `document.hidden` stubbed `true` and `visibilitychange` dispatched: the next press steps the Live slot in Gear; (3) in a context whose init script hides `navigator.locks` (a getter on `Navigator.prototype` that returns `undefined`): Gear acts while `document.hasFocus()` is true and not while it is stubbed `false` |
| `remote` | add: a bound CC still fires in soundLAB with `document.hasFocus` stubbed `false` (the rule that must not change); `App.remote.holdsMain` is `true` while visible and `false` after a stubbed hide |
| `audioin` | no edit; run it (one page per context: the lock is granted before any check) |
| `oneopen` | stays on `env.URL`; "Play on synth" (`43-44`, `56-57`): `App.active === 'songs'`, `#sg-player` visible, the title shown, `SLScorePlayer.state.title` set; `window.SLMidiHub` is undefined; with no MIDI output the card's line names Settings › MIDI keyboard and its button opens Settings; once the fake MODX port is there the line names it without a reload (the module's own `midi:state` repaint) |
| `nav` | tabs `35` → `Learn\|Guitar\|Keys\|Play\|Train`; delete the Synth-tab check `40-41`; Guitar pills `45` → `Neck\|Tab\|Notation`; phone tabs `136` → 5 |
| `context-global` | drop `helix`, `deck`, `liveset`, `midihub` from `7` |
| `multiin` | move "MIDI Hub input picker" (`95-102`) into `tests/gear.test.js` |
| `practice-router` | none (the regex at `48` and the line read at `245-246` still match) |
| `assets` | also covers `gear.html`: every script and stylesheet exists and is in `ASSETS`; `index.html` loads none of the seven gear modules; **the shell block of the two HTML files is identical** apart from the tag text, the title and the footer |
| `trim` | add: `SLMidiHub`, `SLSynthTab`, `SLSynthLive`, `SLSynthDeck`, `SLSynthScope`, `SLHelix` are undefined in soundLAB; a stored rule with `midihub.rulesIn` on still shapes what the Piano page receives, and Settings › MIDI keyboard shows `#set-midi-rules` with the rule count (hidden when the box is off or no rule is enabled); stored `app.tab='deck'` boots to Exercises with the notice; `App.switchTo('midihub')` leaves for `gear.html#midihub` |
| `smoke` | add a Gear pass: boot, visit the four pages, an active panel for each, no page error |
| `tests/run.sh:17` | add `gear remote-gear` |

**New `tests/gear.test.js`:** boots with no page error and no 404; `main > .panel` ids are exactly the four gear
pages; tabs `Synth|Helix`, pills `Deck|Live|Hub`; home is the Deck; none of `SLQuiz`, `Woodshed`,
`App.keysLessons`, `App.keys`, `SLXP` is loaded; no MIDI permission request and no byte sent at boot; `#page`
deep links in both directions and the hash is cleared; `#app-switch` points at the other app; the gear icon
leaves for `index.html#settings`; a stored soundLAB tab (`app.tab='piano'`) is untouched by visiting Gear and
Gear's `gear.tab` is untouched by visiting soundLAB; a Deck preset's key restore changes `fb.root` in the store;
Go live holds the wake tag `synthlive`; the Hub input picker (from `multiin`); phone width: no sideways scroll;
the context-bar matrix for the four gear pages (from `context-global`).

Also in `gear`, for the rules that only exist because there are two documents:

- The Hub header has the Hear input switch (`#mh-hearin`, Off / On) and no App voice box.
- The Hub's Player has no "Open as tab" button and shows the line that names the Songs page.
- **Hear input, two pages in one browser context** (soundLAB and Gear, the fake media device, `audio.monitor`
  on, permission granted): exactly one page has the input connected to the speakers
  (`App.audioIn._t().monOn`); the other reports `held` with `why: 'other'`; pressing On in the second moves it
  there and the first stops; closing the owner lets the other take over; pressing Off in either leaves neither
  routed.
- With `audio.monitor` on and the permission still at "prompt", Gear shows the one toast that names the Hub page.

### 7.6 Docs

| File | Edit |
|---|---|
| `CLAUDE.md` | layout: add `gear.html`; retitle the entries `js/helix.js` (`413-447`), `js/midihub.js` (`448-526`), `js/synthdeck.js` (`527-563`), `js/synthtab.js` / `js/synthlive.js` (`568-593`) "soundLAB Gear"; `js/remote.js` (`169-195`) "loaded by both apps; the Settings card is in soundLAB; with both visible only soundLAB acts (Web Lock `soundlab-remote-main`)"; `js/audioin.js` (`128-168`) "one window routes Hear input (Web Lock `soundlab-hear-input`); `mountSwitch` for Gear's Hub"; `js/app.js` entry: `APPS`, `App.app`, `App.goApp`, `#page`; tab bar groups (`689-701`); `data/` (`564-567`) "used by Gear"; tests section (`835-851`): `GEAR_URL`, the gear suites; artifact section: soundLAB only; rename the Settings "GEAR CARDS" heading words (`296`) to "device cards" |
| `README.md` | rows `26-28` (MIDI Hub, Synth Deck, Helix) move under a new heading "soundLAB Gear (`gear.html`)"; architecture block `65-80` gains `gear.html` |
| `docs/SYNTH-TAB.md`, `docs/SYNTH-DECK.md`, `docs/SYNTH-TAB-PLAN.md`, `docs/MODX-MIDI-REFERENCE.md`, `docs/HELIX-STADIUM.md`, `docs/EXTERNAL-MIDI-COVERAGE.md` | first line banner: `> 2.0: this page lives in soundLAB Gear (gear.html) since Phase A. Menu paths below are from 1.x.`; `docs/HELIX-STADIUM.md:3` "Guitar › Helix" fixed |
| `docs/CONTROLLER-REMOTE.md` | split the page table (`48-59`) into soundLAB and soundLAB Gear; `11` where Gear users set it up (soundLAB › Settings); new short section "Two windows": the pedal belongs to soundLAB while it is visible, Gear answers when it is not, Live sets have their own foot switch |
| `docs/PRACTICE-INPUTS.md` | `43`: one more sentence: Hear input sounds in one window; On pressed in the other window moves it there |
| `docs/PRACTICE-ROUTER.md` | `18`, `60-63`: Hub Thru is in Gear |
| `docs/ROADMAP-2.0.md` | status: A3b |

### 7.7 Acceptance checks

```
grep -nE "midihub|synthtab|synthlive|synthdeck|helix" index.html                 # no hits
grep -c "<script src" gear.html                                                  # 18
node tests/assets.test.js
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh gear remote-gear helix midihub midihub-lock midihub-player midihub-wheel synthdeck synthdeck-scope synthtab synthconn synthconnect
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh trim assets nav smoke context-global remote-runners oneopen multiin portnames practice-router remote audioin lights btmidi
```

By hand: soundLAB shows five tabs and a "Gear" link; the link opens Gear on the Deck; Gear's "soundLAB" link
goes back; Songs › Open a score › Play on synth shows the Player on the Songs page and plays to the synth;
in Gear the Hub's Player view still plays; the gear icon in Gear opens soundLAB's Settings.
To check on the owner's Windows PC with the LUMI and the MODX (cannot be tested here): Gear in a second window
keeps receiving and sending MIDI while soundLAB is open; with both windows visible one pedal press moves the
lesson on and the MODX Performance does not change; with soundLAB minimised the same pedal steps the Live set;
a MODX heard through Hear input sounds once, not twice, and keeps sounding when the window that played it is
closed.

---

## 8. A4 — Storage prefix `soundlab2.*` with the one-time copy

**Goal.** 2.0 keeps its data under its own prefix. The first start of this build in a browser copies the 1.x
data across once. From then on 2.0 never writes a `guitarlab.*` key, so the beta and the live 1.x app stop
sharing settings (`docs/ROADMAP-2.0.md:74-75`), and the live address will copy the then-current 1.x data when
2.0 is released there (`:55`).

Every module already goes through `App.store`; the literal `'guitarlab.'` appears in app code in exactly six
places: `js/app.js:528`, `536`, `1024`, `1031` and `js/settings.js:966`, `986`.

### 8.1 Files added

| File | Content |
|---|---|
| `tests/storage-import.test.js` | browser suite, 8.5 |

### 8.2 `js/app.js:525-539` (the store)

```js
// STORAGE (2.0). One prefix per address: 'soundlab2-next.' on the beta (…/next/), 'soundlab2.' everywhere else.
// 'guitarlab.' is the 1.x store: read once by importOnce(), never written, never deleted.
var STORE_BETA   = /\/next\/[^\/]*$/.test(location.pathname);
var STORE_LIVE   = 'soundlab2.';
var STORE_PREFIX = STORE_BETA ? 'soundlab2-next.' : STORE_LIVE;
var STORE_LEGACY = 'guitarlab.';
var STORE_MARK   = 'store.imported';
// keys of features removed in Phase A: never copied (docs/ROADMAP-2.0.md)
var STORE_DENY = /^(st\.|ideas\.|song\.|sd\.|plugins\.|app\.space$|app\.tabStudio$|app\.click$|pads\.track$|app\.gtab\.(gstudio|gsketch|gpl-.*)$|tr\.ear(Best|Harm)$)/;
// the copy order for values longer than STORE_SMALL characters, and the room that must stay free (D46)
var STORE_SMALL    = 4096;
var STORE_PROGRESS = /^(practice\.progress\.|qz\.|kl\.|xp\.|pp\.|tr\.|ws\.(xp|streak|ach|weak|cal|ladder\.|performance\.results))/;
var STORE_LIBS     = /^(ws\.lib$|sg\.lib$|cc\.charts$|jam2\.sections$|midihub\.|synthtab\.|hx\.)/;
var STORE_ROOM     = 200000;
```

| Piece | Behaviour |
|---|---|
| `store.get` / `store.set` | as today, with `STORE_PREFIX` |
| `store.prefix`, `store.legacy`, `store.deny`, `store.keys()`, `store.raw(key)`, `store.setRaw(key, raw)` | new; they replace every raw `localStorage` use and every prefix literal outside the store (the Backup code reads `store.legacy` and `store.deny` instead of naming a prefix) |
| `copyStore(fromPrefix, overwrite, only)` | lists the source keys first (all of them, or just the keys in `only`); skips `STORE_DENY` and `STORE_MARK`; without `overwrite` never replaces an existing key; each write is in its own try/catch and is read back. **Order (D46):** group 1 = every value of at most `STORE_SMALL` characters (settings, flags, the five migration markers, small records); group 2 = longer values whose key matches `STORE_PROGRESS`; group 3 = longer values whose key matches `STORE_LIBS`; group 4 = any other longer value; smallest first inside a group. **Headroom:** after the last write it writes and removes a probe key of `STORE_ROOM` characters under the current prefix. While the probe is refused it removes copies that **this run** created, group 4 first, then 3, then 2, largest first, and lists them as failed. It never removes a group-1 key or a key that existed before the run. Returns `{ from, at, copied, skipped, failed: [keys] }` |
| `importOnce()` | No marker: choose the source (on the beta `soundlab2.` when the live scope has its own marker, otherwise `guitarlab.`; everywhere else `guitarlab.`), run `copyStore`, write the marker `{ v: 1, from, at, copied, skipped, failed, kept: [] }`. Marker with an empty `failed`: return at once. Marker with `failed` entries: **retry** each one. If the 2.0 key exists by now (2.0 wrote its own data there), move it to `kept`: it is never overwritten and never retried. If the source key is gone, drop it. Otherwise copy it with the same headroom check. The marker is rewritten only when it changed. Wrapped so that blocked or full storage never stops the app from starting |
| call site | `importOnce();` directly after the store is defined, inside the `js/app.js` IIFE. Not in `boot()`: `js/midi.js:55-58` and `:121-124` write to the store while they load |
| `store.importInfo()`, `store.copyAgain()` | the marker, and `copyStore(source, true)` (same order, same headroom check) followed by a fresh marker |
| start notice (`boot()`, both apps, after the start tab is shown) | `var info = store.importInfo(); if (info && info.failed.length) toast('Some of your 1.x data did not fit in this browser\'s storage (' + info.failed.length + ' items). soundLAB tries again each time it starts. Details: soundLAB › Settings › Backup.', 8000);` Shown at each start while `failed` is not empty. This is the only place `boot()` touches the import |
| `js/app.js:1024`, `1031` | `store.raw(key)` instead of `localStorage.getItem('guitarlab.' + key)` |

The path rule is true for `/GuitarPak/next/`, `/GuitarPak/next/index.html` and `/GuitarPak/next/gear.html`, and
false for `/GuitarPak/`, the test server, `file://` and the artifact. `soundlab2-next.` does not start with
`soundlab2.`, so a listing of the live scope never picks up beta keys. Both apps load `js/app.js` first, so the
copy runs whichever page is opened first.

Why this order and not "smallest first" or "progress first": the small keys cost almost nothing and include
the five migration markers, which must arrive together with the settings they guard (below); after them, what
cannot be recreated (progress) goes before what the user can import again from a file (libraries). Nothing in
Phase A frees space in the origin: `guitarlab.*` is never deleted (rule 6) and the live 1.x app keeps writing
there. If the origin is already full, the copy stays incomplete until the user frees space; the 1.x data is
untouched the whole time, and the notice and the Settings line say so.

What the deny list deliberately lets through: the five one-time migration markers (`fb.migr24`
`js/fretboard.js:61-65`, `midi.allIn.v1` `js/midi.js:55-58`, `midi.voiceAuto` `js/midi.js:121-124`, `lights.v1`
`js/midi.js:1054-1057`, `jam2.migr` `js/jam.js:833-843`), read-only history (`xp.*`, `ws.xp`, `ws.streak`), the
Trainer cards' data, `pn.synthPreset`, the gear namespaces, and any key this plan does not name.

### 8.3 `js/settings.js` (Backup)

| Lines | Edit |
|---|---|
| `137-139` | text: "…Export moves everything — preferences, palettes, jam songs, practice progress — between installs." plus a status block `#set-backup-info` from `App.store.importInfo()`: "Copied your 1.x data on <date>: N items." If `failed` is not empty: "M items did not fit in this browser's storage and are tried again at each start: <keys>. Your 1.x data is untouched." If `kept` is not empty: "K items were not copied because 2.0 already has its own data there: <keys>. Copy again would replace it." |
| `140-143` | add `<button class="btn sm" id="set-copy-again">`: "Copy my 1.x data again" (on the beta: "Copy from the live app again"). Two taps within 3 s, the second labelled "Tap again: this overwrites 2.0 settings"; then `App.store.copyAgain()` and reload. No `confirm()` (refused in the artifact frame) |
| `962-974` (export) | `{ app: 'soundLAB', format: 2, from: App.version, scope: App.store.prefix, keys: { '<prefix><key>': raw } }` built from `App.store.keys()` / `raw()`; the marker is left out |
| `975-995` (import) | accept keys starting with `soundlab2.` or `soundlab2-next.` (strip the prefix, write under the current scope) and old `guitarlab.` keys (through `STORE_DENY`, written under the current scope); string values only; never write a `guitarlab.` key; report "N restored, M from removed features skipped". This replaces the `DEAD` regex added in A1 |

Other export files do not embed the prefix and are untouched (`js/midihub.js:1090-1094`, `js/synthdeck.js:1562`,
`js/synthlive.js:95`, `js/chordchart.js:297`, `js/practice-progress-ui.js:163`).

### 8.4 Other files

| File | Edit |
|---|---|
| `sw.js:4` | `'soundlab2-v9'` (no asset change) |
| `tests/*.test.js` (49 files) | prefix conversion, 8.5 |
| `tests/run.sh:17` | add `storage-import` |
| `tests/assets.test.js` | static check: the quoted literal `'guitarlab.` / `"guitarlab.` appears in `js/` only on the `STORE_LEGACY` line and in `tests/` only in `storage-import.test.js` |

### 8.5 Tests

**Converting the 49 suites** (194 occurrences in six forms; `tests/env.js` has no storage helper):

1. Replace the literal `'guitarlab.` with `'soundlab2.` in `tests/*.test.js` (191 hits: seed loops, literal
   seeds, literal and variable read-backs, one `removeItem`). The suites load `http://127.0.0.1:4573/index.html`,
   which is the live scope.
2. Replace the regular-expression form `guitarlab\.` (3 hits): `tests/game.test.js:56`, `72`,
   `tests/colors.test.js:357`. Left alone, the two in `game` compare two empty lists and pass for any behaviour.
3. Check by hand the three that could pass while testing nothing: `tests/game.test.js:56,72,86`,
   `tests/instrument-xp.test.js:15,27-30,90-92`, `tests/instrument-session.test.js:29`.
4. `grep -c guitarlab tests/*.test.js` is 0 everywhere except `storage-import.test.js`.
5. Do not lean on the import to carry old seeds: read-backs and the mid-test writes in
   `tests/keys.test.js:126,152,166,216` would hit keys the app no longer reads. Seeds written as `soundlab2.*`
   before the app starts survive, because the copy never overwrites.

**New `tests/storage-import.test.js`** (a fresh browser context per case):

| # | Case | Checks |
|---|---|---|
| 1 | empty browser | the app starts; the marker has `copied: 0`; no `guitarlab.*` key was created |
| 2 | only `guitarlab.*`: a kept set (key, scale, tempo, `kl.prog`, `qz.instrumentProg`, a valid `practice.progress.v1`, `xp.total`, `sg.lib`, `cc.charts`, `tr.sessions`, `tr.best.C-G`, `pn.synthPreset`, `midihub.rules`, `synthtab.live`, `hx.favs`, `remote.map`, the first-run flags) and a removed set (`st.tracks`, `ideas.list`, `song.name`, `sd.retroSecs`, `app.space`, `app.tabStudio`, `app.click`, `pads.track`, `tr.earBest`, `plugins.list` whose code sets a global) | every kept key equals the source string byte for byte; no removed key exists under the new prefix; the global is not set; `App.store.get('fb.root')`, the context bar and the legacy XP total show the seeded values |
| 3 | migration markers: `fb.frets` 22 + `fb.migr24`; `midi.inputId` "in-1" + `midi.allIn.v1`; `midi.appSound` false + `midi.voiceAuto` | all three values survive the start |
| 4 | 1.x untouched | a snapshot of every `guitarlab.*` entry is identical after the start, after changing key and tempo and visiting every page, and after a reload; a stub on `Storage.prototype.setItem` / `removeItem` records no call with a `guitarlab.` key; `indexedDB.open` is never called |
| 5 | runs once | after a reload the marker is unchanged; a value changed in 2.0 stays; changing the `guitarlab.*` source afterwards and reloading changes nothing |
| 6 | never overwrites | a `soundlab2.*` key present before the first start keeps its value; the rest is copied |
| 7 | beta scope | serve the app under `/next/` with a Playwright route: keys go to `soundlab2-next.*`; with only `guitarlab.*` it copies from there; with a live marker it copies from `soundlab2.*`; live keys are unchanged; a page at the live path does not see beta writes |
| 8 | refused writes and a full store | (a) `setItem` throws for one large library key: the start does not throw; every small key and every progress key arrived; the marker lists the failed key; the start notice is shown; Settings › Backup names the key. (b) a quota stub (the total number of stored characters is capped) that fits everything except the largest library: the library is in `failed`, no small key and no progress key is missing, and a write of 200,000 characters still succeeds afterwards. (c) the next start with the cap lifted: the failed key is copied, `failed` is empty, no notice. (d) instead of (c), 2.0 writes that key itself before the next start: it is not overwritten, it moves to `kept`, it is not retried, and Settings says so. (e) with storage fully blocked the app still starts |
| 9 | Backup | a 2.0 export has `format: 2` and only current-scope keys; an old 1.x file restores kept keys under the new prefix, skips removed ones, reports both counts and writes no `guitarlab.*` key; a beta file restores on live; "Copy again" needs two taps and overwrites |
| 10 | Gear first | opening `gear.html` first runs the same copy; the Hub sees the copied `midihub.*` values |

### 8.6 Docs

| File | Edit |
|---|---|
| `CLAUDE.md` | `5-8` "storage keys stay 'guitarlab.*'" → the 2.0 prefix, `guitarlab.*` = the 1.x store, copied once, never written; `41-43` the `App.store` entry (prefix, `keys/raw/setRaw`, `importOnce`, the marker with `failed` and `kept`, the copy order, the retry and the start notice, the deny list); the Phase A section: storage rules. Lines `27-28` (inside the frozen paragraph) are left for after PR #98 |
| `docs/ROADMAP-2.0.md` | `74-75`: the shared-`localStorage` caveat ended with Phase A (the cache caveat at `76-77` stays); status: A4, Phase A done |
| `docs/CI-DEPLOYMENT.md` | `155-159`: storage is no longer shared between beta and live |
| `docs/CONTROLLER-REMOTE.md` | `77`: the backup holds the remote's keys under the 2.0 prefix |

### 8.7 Acceptance checks

```
grep -rn "guitarlab\." js | grep -v "STORE_LEGACY"            # comments only (js/songs.js:14), no quoted literal
grep -c guitarlab tests/*.test.js | grep -v ":0$"             # only storage-import.test.js
grep -rn "localStorage" js | grep -v "^js/app.js"             # one comment (js/songs.js:217), no code
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh storage-import assets quiz chordchart colors game instrument-xp instrument-session keys multiin portnames
NODE_PATH=/opt/node22/lib/node_modules tests/run.sh           # the full run: every browser suite seeds storage
```

By hand, in a browser profile that holds 1.x data: open the served page; key, scale, tempo, lesson progress,
songs and MIDI choices are there; Settings › Backup shows the copy line and no "did not fit" line; DevTools
shows the `guitarlab.*` keys unchanged and no `soundlab2.st.*`, `soundlab2.ideas.list` or
`soundlab2.plugins.list`. On the owner's own profile also note the total size of `guitarlab.*` once (DevTools ›
Application): the plan's sizes were not measured on a real profile.

---

## 9. Deliberately deferred (do not build these in Phase A)

| Phase | Deferred item |
|---|---|
| B | The shell built once from JavaScript (ends the copy of the shell markup in `gear.html`); new home, nav, sheets; the Sound picker restyled and one merged sound list (piano tones + synths); a home for the LUMI display-output choice in Lights & help; renaming `SPACE_LABELS`; pruning `ICONS` |
| B0 | Whether "Synth" stays a Learn instrument category |
| C | **Pads rebuilt as rhythm practice** (recording, loops and grading come back there); the one-minute chord changes as a real Exercises drill (record per pair, counting from MIDI or audio input); the Trainer prompts as lesson content; LUMI note and triad targets as lesson types inside Keys lessons; renaming `js/daw/` to a sounds folder; reverb or other FX on a voice if wanted (recover from `main`) |
| D | Whether the self-timed session log joins streak and goal; prompts as plan blocks |
| E | **One lighting engine everywhere**: the LUMI section's own lease frames go; the future of `js/practice-router.js`; the display output chosen from the key bar |
| E / F | Hub Thru and key splits while practising without Gear open (a shared routing engine with a cross-window lock); one lighting owner when soundLAB and Gear are both open; whether the pedal can be handed to Gear while soundLAB stays visible |
| G | The Songs library; the final home of the Player; landing `feat/review-to-synth` on `SLScorePlayer` |
| H | **The Gear design**; Gear as its own installable app (manifest id, icon, Windows shortcut); Settings inside Gear (the Hear input switch on the Hub page moves there); whether Gear keeps the metronome and context bar |
| I | The flip. Service-worker cache names by scope and removal of `guitarlab-*` caches on the live scope (PR #98 carries this; if it never merges, Phase I does it); release notes that say what 2.0 removed; `gear.html` in the `pages.yml` release probe (`:180-189`) and `tests/release-workflow.test.js:15-18`; the claude.ai artifact (deleted files must be removed there with `null`); native bundles; the README rewrite; folding the two `CLAUDE.md` 2.0 paragraphs into one; whether the live copy may offer to remove the beta scope's data (`soundlab2-next.*`) when the origin is short of room (after the flip the origin holds 1.x, beta and live copies of the kept data) |
| after 2.0 | An explicit Settings action that deletes `guitarlab.*` and the `guitarlab-daw` database |
| never in 2.0 | PR #90 (SheetLab) |

---

## 10. Risks

| # | Risk | Guard |
|---|---|---|
| 1 | **Data loss on the shared origin.** An unchanged Pads writes a near-empty track list over the live app's `st.tracks` (`js/pads.js:67`); Woodshed's capture trims the live app's ideas. | Both are the first commit of A1; `trim` checks the seeded keys byte for byte |
| 2 | A deleted file left in `sw.js` `ASSETS` stops the worker installing; nothing fails visibly. | Rule 8; `tests/assets.test.js` from A1 on |
| 3 | A page id, its panel and its script tag removed separately give an error card or a blank page. | Rule 7; `smoke` now asserts an active panel per id; `resolvePage` |
| 4 | Removing `App.space` without `js/quiz.js:2951` silently stops the first-run landing on Exercises. | Same commit (4.3); `quiz` and `nav` suites |
| 5 | Slimming `js/daw/engine.js` while `js/plugins.js` stays makes `registerFx` throw. | One commit (A1 commit 3) |
| 6 | Reordering `DAW.SYNTH_PRESETS` changes the Woodshed and guided-performance voice (index 2). | Do not touch the list; `sound-lock`, `performance` |
| 7 | A blanket delete by `st-` breaks the Synth tab. | Rule 11 |
| 8 | Pads and Jam have no suite of their own. | `trim` plays a pad and starts Jam; `lights` `213-232`, `339-354` and `colors` `299-316` cover the Pads key claim |
| 9 | The LUMI section and lessons or the runner drive the same LUMI output, or both answer the pedal. | Open = owner (D15, 5.5): opening the section stops lessons and runner, starting them closes it, and an open section never falls through; `keys`, `remote-keys` and `remote-plan` checks; fallback in D15 |
| 10 | The Keys remote chain changes on the most used page. | A closed section changes nothing; `remote-keys` (560 lines) runs unchanged, plus four new checks for the open section (5.7) |
| 11 | The Trainer timer pauses when a plan block is launched (it always paused on leaving its page). | One sentence in the section (5.4) |
| 12 | Moving the Player breaks MusicXML → Woodshed and MusicXML → tab. | A3a moves it while everything is still one document; `oneopen` |
| 13 | Without a cross-app guard a link to the other app's page blanks the screen. | `resolvePage` + `appOf` (7.2); `gear` and `trim` suites |
| 14 | Hub Thru and key splits stop routing while only soundLAB is open (the owner's LUMI → MODX path). | D28: said in the Hub and once in soundLAB; owner question 1 |
| 15 | Two windows: both paint the LUMI and both receive the keyboard; Thru in Gear plus the practice route in soundLAB would double notes. | The existing check at `js/practice-router.js:172` stays; the pedal and Hear input are settled by D44 and D45; lights from two windows stay as they are until Phase E/F; side-by-side MIDI must be tried on the owner's PC (7.7) |
| 16 | The shell markup exists twice until Phase B and can drift. | The shell comparison in `tests/assets.test.js` |
| 17 | A copy that runs after `js/midi.js` loads, or that drops the migration markers, resets the MIDI input, the voice mode and the fret count. | Synchronous in `js/app.js`; deny list; case 3 |
| 18 | A shared storage scope lets the first beta visit use up the copy. | D32; case 7; owner question 2 |
| 19 | Any write to `guitarlab.*` or `guitarlab-daw` from 2.0 damages the live app. | Rule 6; case 4 |
| 20 | The copy doubles the kept data inside one per-origin quota (three copies after the flip: 1.x, beta, live); a full store drops writes silently in both apps; a partial copy could run unnoticed. | D46: small keys first, then progress, then libraries; 200,000 characters of headroom kept by undoing the run's own lowest-priority copies; failed keys retried at each start and never overwritten once 2.0 has data there; a notice at each start while anything is missing; case 8. Not solved in Phase A: an origin that is already full stays full until the user frees space, because `guitarlab.*` is never deleted (rule 6). The 1.x data is untouched throughout |
| 21 | A text replace of the prefix leaves three regular expressions that then test nothing. | 8.5 steps 2-4; the static check |
| 22 | PR #98 merges mid-way: conflicts in `sw.js`, `js/app.js:101`, `version.json`, `CLAUDE.md:19-30`, and an update banner on the beta. | Rules 3-5 and 13 |
| 23 | Each merge into `v2` re-runs the 14-minute gate and a second merge cancels the first beta deploy (`pages-next.yml:17-20`). | Expected; the last deploy wins |
| 24 | Local runs use Playwright 1.63.0 on Node 22, CI pins 1.62.1 on Node 24. | The pull request's CI run is the gate |
| 25 | The service-worker reasoning in D40 was read from the code, not run. | The change is one line and behaves the same when no other cache holds the file; try the beta in a profile that has the live app |
| 26 | `gear.html` inside the Android WebView and the iOS bundle is untested. | The WebView keeps any URL under the live address (`MainActivity.java:124-125`); a check for Phase I |
| 27 | Web Locks are missing or refused (an old WebView, the claude.ai viewer frame). | Feature test and a `.catch` on every request. Fallbacks: Gear acts on a MIDI pedal only while focused; Hear input behaves as today. `remote-gear` covers the first |
| 28 | In Gear a pedal press acts one task after the MIDI message (the lock check is asynchronous). | Only Gear, only MIDI presses; keys and direct calls stay synchronous; the moved suites already wait 60 ms after each press |
| 29 | With both windows visible a pedal cannot step Live sets through the remote: it belongs to soundLAB. | Said in `docs/CONTROLLER-REMOTE.md`; Live sets keep their own foot switch (`js/synthlive.js:341-342`); revisit in Phase E/F |
| 30 | The Hear-input lock changes a service with a 666-line suite. | The owner path is the code of today (the first window owns the lock before the 500 ms restore); `audioin` runs unchanged; the two-page case is in `gear` |
| 31 | While the LUMI section is open in simulated mode with the opt-in double-tap key on, the keyboard's lowest key is reserved on the Piano page. | Both are opt-in; the section says so; closing it returns the key; never during a lesson (`remote-keys` check 2) |
| 32 | The Plan page's form rules restyle anything mounted inside `.pp-wrap`. | The Free practice section is mounted after it; the `practiceplan` row check |

---

## 11. Order of test runs

Local command: `NODE_PATH=/opt/node22/lib/node_modules SL_LOG_DIR=<scratchpad>/logs tests/run.sh <suites>`.
`SL_PORT=4574` runs a second copy side by side. Times are CI seconds at `5be2eab` (full run 826 s; `taps` alone
is 277 s and Phase A never touches it).

| Step | 1. Fast loop while working | 2. Before the pull request | 3. Gate |
|---|---|---|---|
| A1 | `trim assets nav smoke context-global lights colors sound-lock helix pitch-lock performance chordchart` | `remote keys audio-level remote-shed practice-audio performance-safety performance-import lumidisplay release-workflow` | full run |
| A2 | `trim nav smoke context-global remote-runners remote-keys lumi-practice display-master remote-plan learn-instruments lumi-contexts midi-ports practice-router keys practiceplan` | `lumidisplay quiz game audio-level` | full run |
| A3a | `oneopen midihub midihub-player midihub-lock midihub-wheel synthdeck synthtab practice-router midi-ports midi-ingress assets` | `synthdeck-scope synthconn synthconnect multiin portnames remote-runners lights` | full run |
| A3b | `gear remote-gear remote audioin assets helix midihub midihub-lock midihub-player midihub-wheel synthdeck synthdeck-scope synthtab synthconn synthconnect` | `trim nav smoke context-global remote-runners oneopen multiin portnames practice-router lights btmidi` | full run |
| A4 | `storage-import assets quiz chordchart colors game instrument-xp learn-instruments instrument-session practice-progress practice-progress-ui multiin portnames keys` | — | full run (every browser suite seeds storage) |

The full run means all suites in `tests/run.sh:17`, new ones included, once on the finished branch before the
draft pull request is opened. CI then repeats it on the pull request (`.github/workflows/tests.yml:3-4`,
30-minute limit) and again on the push to `v2` before the beta deploys. After each merge, open the beta once in
a clean profile: unregister the worker, clear caches, reload twice (`CLAUDE.md:852-854`).

---

## 12. For the owner

Work proceeds on the defaults below; none of them blocks a step.

1. **Hub Thru and key splits only route while soundLAB Gear is open** (a second window on the PC). This follows
   from putting the Hub in Gear. Default: accept for Phase A and revisit in Phase E/F. Say so if you rely on
   Thru while practising in soundLAB and want it kept there now.
2. **The beta gets its own storage** (`soundlab2-next.*`), so practice done in the beta does not flow into the
   live app at the release; the live app copies its own 1.x data then. Default: separate, with "Copy again" in
   Settings. Say so if you practise mainly in the beta and want one shared store instead.
3. **PR #98** (v2 into main as 2.0.0): please merge or close it before merging A1, so the version and cache
   lines settle once. The plan works either way.
4. **Pads is play-only until Phase C**: no Record hits, no Play loop, no Click, no Clear. The loop is the
   sequencer the roadmap cuts, and the page says that recording comes back with rhythm practice. Default:
   accept. Say so if you want a one-track drum loop kept inside Pads now.

For information, no answer needed: with soundLAB and Gear both visible, a bound pedal acts in soundLAB only
(D44), and Hear input sounds in one window (D45).

---

## Appendix A — Target state

**`index.html` panels:** `quiz`, `practiceplan`, `fretboard`, `tab`, `notation`, `chords`, `piano`, `chart`,
`songs`, `jam`, `tuner`, `theory`, `shed`, `settings`, `pads` (14 pages + Settings).

**`index.html` scripts, in order:** `theory`, `note-palette`, `app`, `learn-instruments`, `midi`, `remote`,
`midirules`, `practice-router`, `pitch-detector`, `tonein`, `audioin`, `practice-input`, `metronome`,
`fretboard`, `chords`, `piano`, `keylessons`, `chordchart`, `songs`, `jam`, `tuner`, `trainer`, `theorytab`,
`daw/synth`, `daw/engine`, `practice-progress`, `practice-progress-ui`, `performance-engine`,
`performance-player`, `woodshed`, `pads`, `scoreplayer`, `lumi-practice`, `xp`, `quiz`, `practiceplan`, `help`,
`settings`, `lights`.

**`gear.html` panels:** `deck`, `liveset`, `midihub`, `helix`. **Scripts:** see 7.1 (18).

**`sw.js` `ASSETS` against `5be2eab`:** removed `js/studio.js`, `js/arrange.js`, `js/plugins.js`; added
`gear.html`, `js/scoreplayer.js`, `js/midirules.js`. Everything else stays, the gear files included.

**Repository files removed:** `js/studio.js`, `js/arrange.js`, `js/plugins.js`, `plugins/`, `PLUGINS.md`.
**Added:** `gear.html`, `js/scoreplayer.js`, `js/midirules.js`, `tests/trim.test.js`, `tests/assets.test.js`,
`tests/gear.test.js`, `tests/remote-gear.test.js`, `tests/storage-import.test.js`.

## Appendix B — Lines that several steps edit

| Lines | A1 | A2 | A3a | A3b | A4 |
|---|---|---|---|---|---|
| `js/app.js:42-81` (page list, labels, groups) | one list, studio out | three ids out | | `APPS` table | |
| `js/app.js:742` (`switchTo`), `MOVED` | guard added | three rows | | cross-app | |
| `js/app.js:525-539` (store) | | | | | prefix + copy |
| `js/app.js:1641-1654` (boot start tab) | one space | | | hash, notices | |
| `index.html:91-116` (panels) | 4 out | 3 out | | 4 out | |
| `index.html:121-167` (scripts) | 3 out | | 2 in | 7 out | |
| `sw.js:4` | v5 | v6 | v7 | v8 | v9 |
| `sw.js` `ASSETS` | 3 out | | 2 in | 1 in | |
| `js/settings.js:199` | | reworded | | reworded | |
| `js/settings.js:962-995` (Backup) | skip list | | | | format 2 |
| `js/help.js:251-253` (welcome) | one app | tab names | | not in Gear | |
| `js/midihub.js` | comments (`29-30`, `1815`) | | Player and rules out, `paintCvOut` hook | App voice hidden, Hear input switch, Thru hint | |
| `js/songs.js:694-708` and `init` | | | `SLScorePlayer` | Player card mounted | |
| `js/settings.js:153-159` (MIDI keyboard card) | | | | Hub rules line | |
| `js/keylessons.js:264` (`start`) | | LUMI section closed | | | |
| `js/piano.js:1092-1095` (`onRemote`) | | LUMI section first, no fall-through | | | |
| `tests/nav.test.js`, `smoke`, `context-global` | Studio out | pills | | Synth tab, Helix out | prefix |
| `tests/run.sh:17` | +2 | | | +2 | +1 |
| `docs/ROADMAP-2.0.md` status table | A1 | A2 | A3a | A3b | A4 |

## Appendix C — Words that look like a cut feature and are not

| Word | What it is here | Where |
|---|---|---|
| "trainer" | the metronome's tempo trainer, `met.trainer` | `js/metronome.js:235-686` |
| "trainer" | the Circle page's degree ear quiz | `js/theorytab.js:277` |
| "Studio" | a drum kit name in Jam | `js/jam.js:351`, `1090`; store `jam2.kit` |
| "Studio" | FL Studio, the host app | `docs/ROADMAP-2.0.md:4,34` |
| "plugin" | the future FL VST3/CLAP plugin | `docs/ROADMAP-2.0.md:35,66` |
| "sampled", "samples" | Jam's FluidR3 MP3s and the Keys page's sampled piano | `samples/`, `App.keys.play` |
| "capture" | audio-input capture for practice; DOM capture phase in the remote | `docs/PRACTICE-INPUTS.md:28-47`, `js/remote.js` |
| "gear" | the Settings icon and the "GEAR CARDS" in Settings | `CLAUDE.md:296,753`; write "soundLAB Gear" for the app |
| `addPage` | the Deck's own knob-page function | `js/synthdeck.js:308,745` |
| `synth` | a Learn instrument category id | `js/learn-instruments.js:5-6` |
| `st-` | Synth tab ids and classes | `js/synthtab.js`, `js/synthlive.js` |
| `pl…` functions | Songs has its own bar-loop player (`plPause`, `plRemote`) | `js/songs.js:831-856` |
| `soundlab2-` / `soundlab2.` | cache names / storage keys | `sw.js:4` / the store |

## Appendix D — "Phase A status" section for `docs/ROADMAP-2.0.md`

Insert after the Phases table (after line 66), before "Rules for the build". Each pull request updates its row.

```markdown
## Phase A status (Trim)

"Done" means merged into `v2` with the full suite green. Plan: five draft pull requests.

| Step | What | State | PR |
|---|---|---|---|
| A1 | Studio space, sequencer/arranger, sampler and plug-in API removed; synth and drum sounds kept as a library; Pads is play-only | not started | — |
| A2 | Trainer cards on the Plan page; Synth pill = the Sound picker on Piano; LUMI practice = a section under the Keys lessons | not started | — |
| A3a | Score player, synth-out and rule engine are shared files; the main app no longer calls the Hub | not started | — |
| A3b | soundLAB Gear (`gear.html`): Deck, Live sets, MIDI Hub, Helix leave the main app | not started | — |
| A4 | Storage prefix `soundlab2.*` (beta: `soundlab2-next.*`) with the one-time copy from `guitarlab.*` | not started | — |

Decided while trimming:

- Pads keeps the eight pads, both MIDI maps, Remap and key lights. Record and Play loop return when Phase C
  rebuilds Pads.
- The interval ear trainer is Exercises › Intervals › All intervals › Ear. The one-minute chord changes become
  a real Exercises drill in Phase C.
- MIDI Hub Thru and key splits run while soundLAB Gear is open.
- With soundLAB and Gear both visible, a bound pedal acts in soundLAB; Gear answers it when soundLAB is hidden
  or closed. Hear input sounds in one window.
- LUMI practice on the Piano page: while its section is open it owns the pedal; starting a lesson closes it.
- The copy from `guitarlab.*` runs once per browser and never changes or deletes the 1.x data. Items that do
  not fit are tried again at each start. Studio, sampler and plug-in data is not copied and not deleted.

Removed in 2.0: `js/studio.js`, `js/arrange.js`, `js/plugins.js`, `plugins/`, `PLUGINS.md`.
```


---

## Changes after critique

Two reviews were checked against the tree at `5be2eab`. Every issue was confirmed in the code; none was
rejected as wrong. Four proposed fixes were not adopted as written (listed at the end).

**What changed**

| # | Issue | Where the plan changed |
|---|---|---|
| 1 | A3a: the moved Player lost its repaint path (`js/midihub.js:405`, `:724`, `:967`, `:1772`) | D25; 6.2 (`paint()`, own `midi:state` / `lights` listeners, per-mount options); 6.4 (rows for `405`, `966-967`); 6.6 (`midihub-player` stays unchanged and why) |
| 2 | A2: an open LUMI section took the pedal and the lowest key from a lesson | D15 ("open = owner"); 5.5 (`close()`, `open`, `halt()`, no fall-through in `onRemote`, lesson / runner / `releaseRunner` close the section, the hint line); 5.7 (four `remote-keys` checks, `keys`, `remote-plan`); risks 9, 10, 31 |
| 3 | A3b: one pedal press acted in soundLAB and in Gear (raised by both reviews) | D21, D44; 7.3 (`js/remote.js`, Web Lock `soundlab-remote-main`); 7.5 (`remote-gear` two-page cases, `remote`); 7.6; 7.7; risks 27-29 |
| 4 | A3b: Hear input sounded in both windows and Gear had no control for it (raised by both reviews) | D19, D45; 7.3 (`js/audioin.js` lock and `mountSwitch`, the Hub header switch and toast); 7.4; 7.5 (`gear` two-page case, `audioin` re-run); risk 30 |
| 5 | A3b: `synthdeck-scope` edit list incomplete (`:39`, `:190`) | 7.5 row |
| 6 | A2: the Plan page's `.pp-wrap` rules restyled the Trainer cards | D13; 5.4 (the section is mounted after `.pp-wrap`, its two CSS rules); 5.7 (`practiceplan` row check); risk 32 |
| 7 | A2: the ear-training button did nothing under Drums (raised by both reviews) | D13; 5.4 (`#tr-ear-go` tests the mode first and checks `SLQuiz.start`); 5.7 (`trim` Drums case) |
| 8 | A1: two Pads texts still described the loop (`js/pads.js:282`, `js/help.js:129`) | 4.3 rows; 4.7 grep |
| 9 | A3b: the Player's "connect MIDI above" pointed at nothing on Songs | 6.2 (`noOut`, `connect`); 7.3 (`js/songs.js` row); 7.5 (`oneopen`) |
| 10 | A4: the copy could end partial and silent and could fill the origin | D36, D46; 8.2 (order, headroom, retry, `kept`, start notice); 8.3; 8.5 case 8; 9 (Phase I); risk 20 |
| 11 | A3b: Hub input rules shaped soundLAB with no sign there, and the switch did not reach a visible window | D27; 6.3 (`storage` event, `active()`); 7.3 (`#set-midi-rules`); 7.4; 6.6 and 7.5 checks |
| 12 | A3b: "Open as tab" was a dead button in Gear | 6.2; 7.3; 7.5 (`gear`) |
| 13 | Pads play-only was not put to the owner; Appendix D promised "kits" | D5; section 12 item 4; Appendix D |

**Fixes not adopted as proposed**

- **Pedal, first review: "fire only in the focused document" in both apps.** Not adopted. soundLAB answers a
  MIDI pedal today whenever it is visible, also without focus, and the roadmap wants it to run next to FL Studio
  (`docs/ROADMAP-2.0.md:3-5`); a focus test would stop the pedal whenever another program has focus. Adopted
  instead: the second review's Web Lock (soundLAB acts while visible; Gear only when no soundLAB is visible),
  with "Gear acts only when focused" kept as the fallback where Web Locks are missing.
- **Hear input, first review's simplest option: do not load `js/audioin.js` in Gear.** Not adopted. Opening Gear
  in the same window would silence a MODX that is heard through Hear input, which is the reason D19 loads the
  file. Adopted instead: the lock plus one switch on Gear's Hub page.
- **Storage, "copy by priority, not size".** Adopted with one change: values of at most 4,096 characters still
  go first. They are small in total and include the five migration markers, which must arrive
  with the settings they guard (section 8.2); progress and libraries follow in that order.
- **Hub rules, "install the filter always and read the switch per message".** Not adopted as the first choice:
  `tests/midihub.test.js:152-155` asserts that `App.midi.inputFilter` is `null` when the box is off, and other
  suites use the one filter slot themselves. Adopted: the review's alternative, a `storage` listener for
  `midihub.rulesIn`, plus the status line in Settings.

**Not verified by running anything** (read from the code only, as before): the two-window behaviour of Web
Locks with real MIDI and audio devices, the size of a real 1.x profile, and the service-worker reasoning in D40.
The checks for the owner's PC are listed in 7.7 and 8.7.