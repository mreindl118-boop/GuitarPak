# Chats, branches and history (and when each old chat can be deleted)

Written 2026-11-02 from a read-only inventory: a full mirror clone of `mreindl118-boop/GuitarPak`
(32 branches, 368 commits, 1 tag), the GitHub API (91 PRs, Actions runs, deployments), the
coordination records, and the session facts known to the cloud chat. Nothing was pushed, merged,
commented on or deleted. The laptop's chat transcripts and disks could not be read; where a fact about
the laptop chats is inferred, this page says so.

State at the time: `main` = `129720b` (web 1.3.1, live); open PRs #83, #84, #85, #90.
Setup and processes: [DEV-HANDBOOK.md](DEV-HANDBOOK.md). The MODX8+ knowledge:
[MODX-SOUNDLAB.md](MODX-SOUNDLAB.md).

## 1. The short answer

**Deleting a chat does not delete anything on GitHub**, and does not delete files on the laptop. It
removes the transcript, and the option to resume that chat on the laptop if the laptop ever comes
back. Everything those chats pushed is on GitHub; what they knew is written in git, in PR bodies, in
the coordination records, and now in these three docs.

What is really at risk is not the chats but:

1. **Uncommitted changes on the laptop.** All four laptop chats reported `is_dirty: true` with nothing
   unpushed. Their content cannot be seen from here. They are lost with the laptop whether or not the
   chats are deleted.
2. **Branches with unique work and no PR** (section 3). Deleting one of those *branches* would lose
   work. Keep them.
3. ~~These three docs, until they are committed and pushed.~~ Done: pushed on 2026-11-02 to
   `claude/verify-project-files-4bchk6` (PR #90).

| Chat | Verdict |
|---|---|
| "Guitar App" (this cloud chat, `session_01U4zwjurMuVa98eDXtapWqV`) | **Keep.** It holds PR #90 (1.4.0) and the daily watch fires into it. |
| "Yamaha MOD8X MIDI USB controller" (`session_01NgEttGJjrqGft9i3ttsfZq`) | **Safe once the conditions in 7.2 are ticked**: these docs pushed, the unique branches kept, its uncommitted laptop changes given up. Better still: merge the two `check/*` branches first. |
| "Helix controls and sound lab" (`session_01D8Pdrrg6bTp2gNVfKgdF6B`) | Safe once 7.3 is ticked (keep `feat/helix-deck`). |
| "Helix Stadium Plugin for Sound Lab" (`session_01XdzkfeGpbm97HeT7pSgYhm`) | Safe once 7.4 is ticked (its work shipped in 1.2.0). |
| "Soundlab UI redesign and sheet music conversion" (`session_01M9kFiYDb88zSj7GjbEcaUA`) | Safe once 7.5 is ticked, **if** Matt accepts redoing UI phase B (never pushed). |
| "Stadium Deck iPad PWA" (cloud, repo HealLicks) | Safe once 7.6 is ticked: its two commits are still on HealLicks `claude/stadium-deck-ipad-pwa-fcvbhm` (checked 2026-11-02). Keep that branch. |
| Unnamed or side chats (if they still exist) | Safe: their commits are all in `main` (7.7). |

## 2. Every chat that worked on soundLAB

Only the cloud chat wrote `Claude-Session:` trailers. The laptop chats (Remote Control on the ASUS
StudioBook) left none, so their commits were attributed from the coordination records that name them,
co-author lines, timing and branch topology.

| Id | Chat | Session | Where | Dates | Commits | What it built | Branches | PRs | Releases | Artifacts | Still open |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A | **"Guitar App"** (this chat) | `session_01U4zwjurMuVa98eDXtapWqV` | cloud | 2026-07-13 .. 10-29 | 131 (trailers on all) | 0.7.0 .. 0.77.0 and 0.82.0: almost the whole app, the MIDI service, iOS wrapper, Android MidiBridge, LUMI lights, Exercises; 1.4.0 = controller remote + SheetLab + My library | `claude/verify-project-files-4bchk6` (reused for every PR) | #1-#80, #86 merged; **#90 open** | up to 0.77.0, 0.82.0; 1.4.0 candidate | app artifact (created 2026-10-05, PR #66; v21 likely 0.82.0; update 2026-10-29) | PR #90 to merge; the 1.4.0 version clash (section 8) |
| B | **"Yamaha MOD8X MIDI USB controller"** ("Synth tab session" in its records) | `session_01NgEttGJjrqGft9i3ttsfZq` | laptop | 2026-10-22 .. 10-27 | 50 | Synth control 0.80.0, LUMI Display aid, release 0.81.0 (null's practice plan), Hub Player 1.1.0, Score review → synth (unmerged), the MODX8+ and LUMI hardware checks (unmerged), the Synth tab 1.3.0, the 1.3.1 clock fix, most coordination records | `feat/synth-control`, `feat/lumi-display-aid`, `release/0.81.0`, `release/0.81.1`, `feat/hub-player`, `feat/review-to-synth`, `check/modx-maps-claude`, `check/lumi-claude`, `feat/synth-tab`, `release/1.3.0`, `fix/synth-connect`, `release/1.3.1`, `coord/cowork-20261022-claude` | #88, #91; opened #89 for chat E | 0.80.0, 0.81.0, 1.1.0, 1.3.0, 1.3.1 | app artifact v19, v22, v24, v25; "Synth Deck design options" | MODX finger-tap test; both `check/*` branches unmerged with no PR |
| C | **"Helix Stadium Plugin for Sound Lab"** | `session_01XdzkfeGpbm97HeT7pSgYhm` | laptop | 2026-10-22 .. 10-24 | 15 | The Helix Stadium plugin, merged with null's safety model, then a built-in page (`js/helix.js`) | `feat/helix-stadium`; coord records `7341de2` .. `857b05a` | none | shipped inside 1.2.0 (`3951e6c`) | | "main merge still awaits your yes" = the stale record commit `b74f5bc`: no longer needed |
| D | **"Helix controls and sound lab"** | `session_01D8Pdrrg6bTp2gNVfKgdF6B` | laptop | 2026-10-24 .. 10-26 | 19 | Merged Helix into 1.0.0 line; the Synth Deck (control surface, library, Scope) = web 1.2.0; then the Helix deck (phases 0, 1, 4: USB over the NCM link) | `release/1.1.0` → `release/1.2.0`; `feat/helix-deck` | none (1.2.0 pushed straight to `main`) | 1.2.0 (`358d204`) | | **Blocked**: "Turn on the Stadium and plug it in over USB (firmware 1.4), or say whether it's on Wi-Fi without the update" ([MODX-SOUNDLAB.md](MODX-SOUNDLAB.md) 5.5) |
| E | **"Soundlab UI redesign and sheet music conversion"** | `session_01M9kFiYDb88zSj7GjbEcaUA` | laptop | 2026-10-25 .. 10-26 | 8 | The UI / score primer (`docs/PRIMER-UI-AND-SCORE-2026-10-25.md`), UI phase A (one header button style, copy diet) | `feat/ui-phase-a`; local `docs/primer-20261025` (cherry-picked) | #89 | inside 1.3.0 | | UI phase B (checklist 3.1-3.4) **never pushed**; last state "welcome tour and dead met-btn styles fixed; awaiting context suite"; score helper 5.1 not started in git |
| F1 | unnamed laptop chat | unknown | laptop | 2026-10-19 | 2 | MIDI Hub 0.78.0, app-sound fix 0.78.1 | `feat/midi-hub`, `fix/hub-app-sound` | none | 0.78.0, 0.78.1 | | none |
| F2 | unnamed laptop chat (maybe "Lumi keys device"; not proven) | unknown | laptop | 2026-10-20 | 3 | Rescued the 2026-10-19 uncommitted work (`14d5598`, merged `7dca7e7`); LUMI Display 0.79.0 | `feat/lumi-display` | none | 0.79.0 | | none |
| F3 | **"Lumi keys device"** | unknown | laptop | 2026-10-22 | 2 | Knob-wheel fix 0.80.1; merge = 0.81.1 | `local/desktop5-wheel-fix-0.80.1` (pushed by B) | none | 0.81.1 (`e9426ce`) | app artifact v20 | none |
| S1 | "Check the Synth Deck on the MODX8+ (hardware)" | `local_8aeeb5d5` | laptop | 2026-10-24 | 0 | The readback / dump-diff evidence folded into `e6ce52c` | `worktree-modx-gate` (local, zero commits) | none | | | its side note is not in git (section 6) |
| S2 | "Desktop 5 build session" | unknown | laptop | 2026-10-22 | 0 | Found the knob-wheel bug, built a desktop app outside the repo | none | none | | | the desktop build is laptop-only |
| G | Codex / "null" (OpenAI) | n/a | Codex cloud and the laptop | 2026-10-14 .. 10-23 | 27 | 0.77.1, 0.77.2, the Practice Plan, 1.0.0 (guided practice, instrument Learn), the 1.1 library + recognition beta (unmerged) | `codex/*` (6), `docs/coworking-20261018` | #81, #82, #87 merged; #83, #84, #85 open | 0.77.1, 0.77.2, 1.0.0 (tag `v1.0.0`) | | 1.1 line unmerged; task D (setup hooks) and task E briefs not done |
| H | the first local chat(s) | unknown | local | 2026-07-05 .. 07-13 | 13 | GuitarLab alpha up to 0.6.1, then the hand-over to the cloud | `main` | none | up to 0.6.1 | | none |
| X | **"Stadium Deck iPad PWA"** | not recorded | cloud | 2026-08-23 (commit dates) | 2, in repo HealLicks | Stadium Deck Phase 0 in repo `mreindl118-boop/HealLicks` (typed protocol, bridge, mock, capture wizard, CLI, PWA status shell): `6da78f4` (Phase 0) and `3e6512ad3b09cce8651608d6317fca33eced051b` (13 review fixes) | HealLicks `claude/stadium-deck-ipad-pwa-fcvbhm` @ `3e6512a`, the repo's only branch and its `HEAD` (still there on 2026-11-02) | | | | see 7.6 |

Sources: commit identities and trailers; `tasks/20261022T1810Z-release-0811-ledger-claude.md` and
`tasks/20261025T0010Z-modx-check-claude.md` (name chat B); `tasks/20261024T1800Z-...` and
`20261026T0200Z-...` (chat D); `tasks/20261026T0030Z-ui-phase-a-claude.md` and
`docs/RELEASE-1.3-CHECKLIST.md` (chat E); `docs/BRANCH-AUDIT-2026-10-23.md` and `git ls-remote` on
2026-11-02 (HealLicks). Also 7 bot commits (`gh-pages` snapshots; the bot also made the tag object
`v1.0.0`) and 91 GitHub merge commits: 87 on branches plus the 4 test merges GitHub keeps as
`refs/pull/<n>/merge` for the open PRs #83, #84, #85 and #90 (those 4 are also inside the 368).

## 3. Every branch (32)

"Ahead / behind" counts commits against `main` `129720b`. "Unique" = holds commits or content found
nowhere else.

### 3.1 Branches with unique work: keep them

| Branch | Tip | Chat | Ahead / behind | What only it holds | PR | Action |
|---|---|---|---|---|---|---|
| `claude/verify-project-files-4bchk6` | `bc47da5` | A | 17 / 0 | All of 1.4.0: `js/remote.js`, SheetLab (`js/omr/`, `models/omr/`, `js/sheetlab.js`, `tools/omr/`), My library (`js/library.js`), AGPL relicence, 16 new suites | #90 open, mergeable, CI green | Merge on Matt's go |
| `check/modx-maps-claude` | `e6ce52c` | B | 1 / 27 | The MODX8+ hardware-verified map and docs | **none** | Merge or port ([MODX-SOUNDLAB.md](MODX-SOUNDLAB.md) 7). Clean merge into `main` and PR #90 |
| `check/lumi-claude` | `5cdc826` (+ `a9a243d`) | B (inferred) | 2 / 27 | LUMI firmware findings; `js/midi.js` relight, config-frame dedupe, stale-output stand-in; `tests/lumi-firmware.test.js` | **none** | Merge or port; conflict only in `tests/run.sh` |
| `feat/helix-deck` | `c04e8ef` | D | 5 / 3 | Helix deck (`js/helix-deck.js`, `helix-map.js`, `helix-routes.js`), bridge 0.2.0 with USB discovery, `docs/HELIX-DECK*.md`, `docs/HELIX-USB.md`, `tools/helix-usb-inventory.ps1`, suites `helix-deck`, `helix-bridge-usb` (~3,800 lines) | **none** | Keep. Before landing: re-stamp sw `CACHE` (it says `guitarlab-v128`, same as live `main`); conflicts in `tests/run.sh` (vs `main`) and `sw.js` + `tests/run.sh` (vs PR #90) |
| `coord/cowork-20261022-claude` | `c106902` | B, C, D, E | 32 / 70 | 29 coordination records: release ledgers 0.80.0-1.3.1, the Helix hardware-write log, briefs D / E for null, the piano-recognition plan. Its history (`c08af25`, `cdc5242`) is the only copy of null's two Helix records | none (records, never meant to merge) | Keep, or fold its `tasks/` into `main` (merges cleanly) |
| `feat/review-to-synth` | `473814f` | B on top of G | 10 / 47 | 3 Claude commits (Score review → Play on synth / Export MIDI / Open as tab, `tests/review-to-synth.test.js`) **plus all of Codex's 1.1 line** | none | Keep (it is the one to keep if only one of the two 1.1 branches stays). 9 files conflict with `main` |
| `codex/soundlab-1.1-workflow-20261023` | `a76b259` | G | 7 / 47 | Codex 1.1: durable song library, persistence, settings recovery, local notation recognition beta (`vendor/omr` 21 MB), `vendor/pdfjs`; 419 files. Fully inside `feat/review-to-synth` | none | Can go only if `feat/review-to-synth` stays |
| `codex/midi-hub-release-0.78.0-20261019` | `b8ccb55` | G | 5 / 75 | Stranded Codex modules: `js/score.js`, `js/music-library.js`, a recall-only `js/helix-stadium.js`, `js/release-notes.js`, `.github/workflows/validate.yml`, their docs and tests. Its Hub and LUMI-practice parts are superseded | #84 open, conflicting | Matt decides; closing the PR keeps `refs/pull/84/head` |

### 3.2 Superseded or trivial

| Branch | Tip | Unique part | PR | Action |
|---|---|---|---|---|
| `codex/natural-notes-autonext-20261020` | `7e8884f` | only `validate.yml`, a task note and 0.77.3 stamps; the fix was adapted into 1.0.0 | #85 draft | close as superseded, then delete |
| `docs/coworking-20261018` | `2eaa0f8` | a 4-line README link to the private GeneralStorage coworking README | #83 draft | Matt decides |
| `feat/helix-stadium` | `b74f5bc` | a stale "UPDATE 2026-10-24" section in a handoff record; the page shipped in 1.2.0 | none | delete when convenient |
| `release/0.81.1` | `b2e4fcb` | a redundant twin of `e9426ce` (0.81.1 went live as `e9426ce`) | none | delete when convenient |
| `gh-pages` | `157e8b8` | the live site (snapshots of `main`) | none | **never delete** |

### 3.3 Already fully in `main` (18): deleting loses no content

`codex/piano-volume-0771-20261014` (#81), `codex/soundlab-led-0772-20261014` (#82),
`codex/soundlab-lumi-consolidation-20261023` (#87), `feat/hub-player`, `feat/lumi-display`,
`feat/lumi-display-aid`, `feat/midi-hub`, `feat/synth-control`, `feat/synth-tab` (#88),
`feat/ui-phase-a` (#89), `fix/hub-app-sound`, `fix/synth-connect` (#91),
`local/desktop5-wheel-fix-0.80.1`, `release/0.81.0`, `release/1.1.0`, `release/1.2.0`,
`release/1.3.0`, `release/1.3.1`.

Records and docs mention these names, so deleting them only turns those mentions into dead names.
GitHub keeps every PR's head under `refs/pull/<n>/head`.

### 3.4 Branch names in records that never reached GitHub

| Name | Content |
|---|---|
| `wip/local-snapshot-2026-10-19` | in `main` via `14d5598`, `7dca7e7` |
| `docs/primer-20261025` | in `main` via `17d9cba`, `fa39a87` |
| `null/practice-plan-20261022` | in `main` via `30d2013`, `77c5b06`, `546325e` |
| `worktree-modx-gate` | zero commits |
| `feat/ui-phase-b` | **unknown, never pushed** (chat E) |
| `null/plan-setup-hooks-20261022` | null's task D; unknown whether started; not in `main` |
| `codex/sl-helix-0780-20261019` @ `69bb917` | null's Helix recall profile; **laptop only** |

## 4. Open PRs

| PR | Head | State | Contents | Still relevant? |
|---|---|---|---|---|
| **#90** | `claude/verify-project-files-4bchk6` @ `bc47da5` | open, mergeable, CI green (2026-10-29) | soundLAB 1.4.0: hands-free practice, SheetLab, My library; web 1.4.0, `CACHE` v132, APK channel untouched | **Yes**: the newest unreleased work |
| #84 | `codex/midi-hub-release-0.78.0-20261019` @ `b8ccb55` | open, 18 conflicting files | Codex's 0.78.0 candidate; asks for "Claude/source-contributor approval" that never came | Mostly no (main shipped its own 0.78.0); Score / Music Library / release-notes UI remain stranded ideas |
| #85 | `codex/natural-notes-autonext-20261020` @ `7e8884f` | draft, conflicting | quiz fix, web 0.77.3 | No: adapted into 1.0.0 |
| #83 | `docs/coworking-20261018` @ `2eaa0f8` | draft, clean | README link to the coworking rules | Marginal |

## 5. Releases, versions and artifacts

| Web version | `main` commit | By | PR | sw `CACHE` | claude.ai app artifact |
|---|---|---|---|---|---|
| 0.2.0 .. 0.6.1 | `0e350cb` .. `978bef4` | H | none | | |
| 0.7.0 .. 0.77.0 | many | A | #1-#80 | | created 2026-10-05 (PR #66) |
| 0.77.1, 0.77.2 | `45822ce`, `e9d0541` | G | #81, #82 | | |
| 0.78.0, 0.78.1 | `bf55d28`, `91213cc` | F1 | none (direct) | | |
| 0.79.0 | `1dbbb32` | F2 | none | | |
| 0.80.0 | `3c09036` / `0e0600c` | B | none | | updated |
| 0.80.1 | `93983e2` | F3 | none | | |
| 0.81.0 | `4122d31` | B (null's practice plan) | none | | v19 |
| 0.81.1 | `e9426ce` | F3 | none | | v20 |
| 0.82.0 | `6a5891f` | A | #86 | | v21 (likely) |
| 1.0.0 | `2077f3b` (tag `v1.0.0`, GitHub release) | G | #87 | | |
| 1.1.0 | `3caa04a` | B | none | v125 | v22 |
| 1.2.0 | `358d204` | D | none | v126 | not republished |
| 1.3.0 | `6475638` | B (+ E's #89) | #88, #89 | v127 | v24 |
| **1.3.1 (live)** | `129720b` | B | #91 | v128 | v25 |
| 1.4.0 candidate | PR #90 `bc47da5` | A | #90 | v132 | gallery update 2026-10-29 (likely this) |

Version v23 of the app artifact is not recorded anywhere in git. The APK channel (`version.json`
`version`) has been 0.75.0 since `639a571` (the last APK, PR #77).

| Artifact | URL | What | Depends on the laptop? |
|---|---|---|---|
| soundLAB (the app) | `https://claude.ai/artifact/R2c52cb7YA8xur86NNqpHs` | the app inside claude.ai; process in [DEV-HANDBOOK.md](DEV-HANDBOOK.md) 4.6 | no |
| Synth Deck design options | `https://claude.ai/artifact/Xu1nFDWkBM7SnjweQV5fSD` | six design boards: A (Stage, phone, chosen), A on iPad, B (Go live), C (Preset builder), D (today's layout: what does not work), E (hardware strip, rejected on phones). Made by chat B; named in `docs/SYNTH-TAB.md` but its URL was in no git ref until this page | no |
| soundLAB Signing Key | `https://claude.ai/artifact/VWL2AAhC1JQe6XXBPnNLKr` | the APK key (name only; private; never share) | no |

## 6. What existed only on the laptop

Lost unless the laptop comes back, whatever happens to the chats. Deleting a chat does not make any of
this worse; it removes the easy way to pick the work up again if the laptop returns.

| Item | Where it was | In git? |
|---|---|---|
| **Uncommitted changes** of chats B, C, D, E (`is_dirty: true`) | install checkout `C:\Users\mrein\Creative-Workspace\GuitarPak`; worktrees `%TEMP%\sl-*`, `GuitarPak-helix` | **No.** Content unknown |
| Chat E's UI phase B (`feat/ui-phase-b`) and its "welcome tour / dead met-btn styles" fix | `%TEMP%\sl-ui-a` or a phase-B worktree | **No.** Redo from `docs/RELEASE-1.3-CHECKLIST.md` 3.1-3.4 |
| Chat D's work after `c04e8ef` | `%TEMP%\sl-helix` | only the pushed state |
| Chat C's untracked copies of null's two Helix records | `GuitarPak-helix` | yes, in coord history (`c08af25`, `cdc5242`) |
| Side note `20261024T2130Z-modx-gate-handover-claude.md` (chat S1) | laptop | no; its findings are in `e6ce52c` |
| `20261022-null-helix-builtin-brief-claude.md` (paste-ready brief) | Matt's Desktop | no; the full handoff is `tasks/20261022T2141Z-...` on `main` |
| null's Helix recall profile `codex/sl-helix-0780-20261019` @ `69bb917` | `C:\Users\mrein\Documents\Codex\2026-10-19\...` | no |
| null's "Stadium Local Control" (Python WinMM server on 127.0.0.1:4790, 297-definition catalog, tests) | `C:\Users\mrein\Documents\Codex\2026-10-22\task-2` | no |
| null's task D work, if started | Codex folders | no |
| Matt's vector-OMR tool `pdf-to-midi-synth` (`omr_engine.py`, `app.py`, `midi_out.py`) | `C:\Users\mrein\OneDrive\Desktop\pdf-to-midi-synth` | no. **OneDrive may hold a copy: worth checking** |
| Desktop builds "0.77.1-desktop.4" (`README.txt`, `GOOGLE-CONNECTION-SETUP.md`) and "Desktop 5" | `%LOCALAPPDATA%\Programs\soundLAB\...` | no (only the `.bat` / `.zip` launcher is in git) |
| "Desktop soundLAB" launcher on port 4590 | laptop | no; replaced by the Pages site + Windows launcher |
| Chat scratchpads: the 1.2.0 adversarial review output (lower-severity findings never read), the review-to-synth full-run logs | chats D and B | no |
| Android toolchain `C:\Users\mrein\AndroidBuildTools`; Playwright scratch `%TEMP%\hxprobe` | laptop | replaceable ([DEV-HANDBOOK.md](DEV-HANDBOOK.md) 3) |
| Possibly a copy of the APK key and the retired `guitarlab.keystore` | laptop | the real key is safe in its private artifact |
| Possibly: AltServer pairing, laptop git / GitHub tokens, a library sync key in the laptop browser, the Codex login | laptop | revoke or replace ([DEV-HANDBOOK.md](DEV-HANDBOOK.md) 5) |

## 7. Safe-to-delete checklist, per chat

Common to every chat below (do these once):

- [x] `docs/DEV-HANDBOOK.md`, `docs/MODX-SOUNDLAB.md` and this page are committed and pushed to
      GitHub (2026-11-02, branch `claude/verify-project-files-4bchk6`, PR #90; on `main` once it merges).
- [ ] No branch in section 3.1 has been deleted.
- [ ] Optional, a few minutes each: open the chat in the Claude app and skim its last messages for a
      decision or finding that is not in these docs. Add anything new to the matching doc.

### 7.1 "Guitar App" (`session_01U4zwjurMuVa98eDXtapWqV`, cloud): keep

Preserved: its 131 commits, PRs #1-#80 and #86 (merged), PR #90 (open). Would be lost if deleted: the
daily watch (the scheduled task "Daily GuitarPak activity check" fires into this session), the
session's scratchpad (SheetLab Python reference data, watch baselines, the inventory's raw data), and
the easy continuation of PR #90. **Do not delete.**

The owner's `sheetlab_engine.py` and the SheetLab port notes, once only in that scratchpad, are now
in the repo: `tools/omr/sheetlab_engine.py` and `tools/omr/notes/` ([DEV-HANDBOOK.md](DEV-HANDBOOK.md)
4.3). Everything else in the scratchpad can be regenerated.

### 7.2 "Yamaha MOD8X MIDI USB controller" (`session_01NgEttGJjrqGft9i3ttsfZq`)

| | |
|---|---|
| Preserved in `main` | 0.80.0, 0.81.0, 1.1.0, 1.3.0, 1.3.1 (PRs #88, #91), the Synth tab docs |
| Preserved on branches | `check/modx-maps-claude`, `check/lumi-claude`, `feat/review-to-synth`, `coord/cowork-20261022-claude` (all its records, incl. the 1.3.1 diagnosis) |
| Preserved in these docs | everything it learned about the MODX8+, the LUMI and the open tests: [MODX-SOUNDLAB.md](MODX-SOUNDLAB.md) |
| Preserved elsewhere | the "Synth Deck design options" artifact; the app artifact v25 |
| Lost if deleted | the transcript; its uncommitted laptop changes (unknown, already unreachable); the review-to-synth full-run logs (laptop scratchpad) |
| Open item it leaves | the MODX finger-tap test: steps in [MODX-SOUNDLAB.md](MODX-SOUNDLAB.md) 5.1 |

Conditions:

- [ ] The common items above.
- [ ] `check/modx-maps-claude` and `check/lumi-claude` are kept until merged.
- [ ] Matt accepts that the chat's uncommitted laptop changes are gone unless the laptop returns.
- [ ] Recommended first: both `check/*` branches merged into `main` or ported onto the next release
      (or at least each given a PR). This chat is the one that made them; once they are on `main`,
      nothing depends on it.

### 7.3 "Helix controls and sound lab" (`session_01D8Pdrrg6bTp2gNVfKgdF6B`)

| | |
|---|---|
| Preserved in `main` | the Helix merge and the Synth Deck: web 1.2.0 (`358d204`) |
| Preserved on branches | `feat/helix-deck` (phases 0, 1 and 4), its records on the coord branch |
| Preserved in these docs | the USB-on-firmware-1.4 test steps ([MODX-SOUNDLAB.md](MODX-SOUNDLAB.md) 5.5), Helix pitfalls |
| Lost if deleted | the transcript; its uncommitted changes in `%TEMP%\sl-helix`; the 1.2.0 adversarial review output (its scratchpad; the lower-severity findings were never read) |
| Open item it leaves | the Stadium over USB on fw 1.4, or "is it on Wi-Fi without the update?" |

Conditions:

- [ ] The common items above.
- [ ] `feat/helix-deck` is kept (or given a PR).
- [ ] Matt accepts the loss of the uncommitted changes and of the 1.2.0 review output (a fresh review
      of 1.2.0 code can be run from the cloud if wanted).

### 7.4 "Helix Stadium Plugin for Sound Lab" (`session_01XdzkfeGpbm97HeT7pSgYhm`)

| | |
|---|---|
| Preserved in `main` | the Helix page, merged through `3951e6c` (1.2.0); `docs/HELIX-STADIUM.md`; `tasks/20261022T2141Z-helix-builtin-handoff-claude.md` |
| Preserved on branches | its coord records `7341de2` .. `857b05a` (the Helix hardware-write log, the unsaved-edit analysis, the reply to null) |
| Lost if deleted | the transcript; uncommitted changes in `GuitarPak-helix` (null's two untracked records there are also in coord history) |
| Its pending question | "main merge still awaits your yes": that is `feat/helix-stadium` `b74f5bc`, a stale record update. The answer can be **no**; nothing needs merging |

Conditions:

- [ ] The common items above.
- [ ] Matt accepts the loss of the uncommitted changes.

### 7.5 "Soundlab UI redesign and sheet music conversion" (`session_01M9kFiYDb88zSj7GjbEcaUA`)

| | |
|---|---|
| Preserved in `main` | the primer `docs/PRIMER-UI-AND-SCORE-2026-10-25.md`; UI phase A (PR #89); `docs/RELEASE-1.3-CHECKLIST.md` with phase B (3.1-3.4) and the score helper (5.1) still open |
| Preserved on branches | its records on the coord branch (`33bb909`, `41a0ca0`, `512076d`) |
| Lost if deleted | the transcript; **UI phase B**, never pushed; the "welcome tour and dead met-btn styles" fix (uncommitted) |
| Laptop-only and worth checking | Matt's `pdf-to-midi-synth` tool on the OneDrive Desktop (OneDrive may have it) |

Conditions:

- [ ] The common items above.
- [ ] Matt accepts redoing phase B from the checklist (the code is gone with the laptop).
- [ ] Optional: copy the chat's own description of phase B and of the met-btn fix out of the
      transcript into `docs/RELEASE-1.3-CHECKLIST.md` before deleting.
- [ ] Optional: look for `pdf-to-midi-synth` in OneDrive (note: SheetLab in PR #90 replaced the need
      for it in the app).

### 7.6 "Stadium Deck iPad PWA" (cloud, repo `mreindl118-boop/HealLicks`)

This chat worked in another repository. Its work is **still on GitHub**: on 2026-11-02
`git ls-remote https://github.com/mreindl118-boop/HealLicks` listed one branch,
`claude/stadium-deck-ipad-pwa-fcvbhm` at `3e6512ad3b09cce8651608d6317fca33eced051b` (also `HEAD`), and
a fetch of it returned two commits: `6da78f4` "Phase 0: protocol package, bridge, mock Stadium,
capture wizard, PWA shell" and `3e6512a` "Fix 13 review findings" (both 2026-08-23). Nothing of it is
in GuitarPak, apart from the summary in `docs/BRANCH-AUDIT-2026-10-23.md`.

`gh api repos/mreindl118-boop/HealLicks/...` is refused (403) from a session that has only GuitarPak
attached; plain `git ls-remote` / `git fetch` over HTTPS works without attaching it.

Conditions:

- [x] The commits are on a HealLicks branch (checked 2026-11-02, see above). Recheck just before
      deleting: `git ls-remote https://github.com/mreindl118-boop/HealLicks` must still list
      `3e6512a`.
- [ ] Do not delete that HealLicks branch: it is the only copy of this work on GitHub.
- [ ] Matt accepts that deleting the chat removes its transcript and anything it never pushed to that
      branch.

### 7.7 Unnamed and side chats (F1, F2, F3 "Lumi keys device", S1, S2)

All their commits are in `main`. S1's side note and S2's desktop build were laptop-only (section 6);
their content is either in `e6ce52c` or not needed. **Safe to delete** once the common items are done.

## 8. Contradictions and collisions found

1. **Hardware checks reported done but not shipped.** `docs/RELEASE-1.3-CHECKLIST.md` section 6 says
   "PRs open" for both `check/*` branches; none exists, and neither change is in `main` or PR #90. The
   LUMI fixes are missing from live 1.3.1.
2. **Web 1.4.0 is claimed twice.** Matt's decision of 2026-10-25
   (`tasks/20261025T0300Z-version-order-1.3-claude.md`, coord branch) reserved 1.4.0 for null's
   recognizer (the Codex 1.1 line + `feat/review-to-synth`). PR #90 stamps 1.4.0 for the remote,
   SheetLab (a homr port) and My library. Whichever lands second re-stamps; the two recognition
   efforts also overlap in purpose. Decide with Matt.
3. **sw `CACHE` collision**: `feat/helix-deck` says `guitarlab-v128`, the same as live `main`.
4. **"Not pushed" in commit messages** of `e6ce52c` and `a9a243d`, yet both are on GitHub; no record
   says who pushed them.
5. **`docs/BRANCH-AUDIT-2026-10-23.md` is stale**: it calls `feat/helix-stadium` and the coord branch
   stranded at older tips; the Helix page shipped in 1.2.0.
6. **PR #84 and #85 merge refs are stale** (base `64be12e`); both PRs conflict.
7. **Chat B's model line changes** (Opus 5.5 on 10-22 and 10-26/27, Fable 5.1 on 10-24/25), so the
   assignment of its 10-24 commits (hub player, review-to-synth, LUMI check) and of F1 / F2 is
   inferred, not proven.
8. **Commits under Matt's identity without trailers**: 12 Codex commits and 9 laptop coordination
   records. Branch name and content tell them apart.

## 9. How this was compiled, and how to redo it

- Mirror: `git clone --mirror https://github.com/mreindl118-boop/GuitarPak.git` (all branches, the
  tag and `refs/pull/*`).
- Unique content per branch, three ways: ancestry (`git rev-list main..<b>`), patch identity
  (`git cherry main <b>`), content (`git merge-tree --write-tree main <b>` compared with `main`'s tree).
- PRs, releases, runs: `gh api "repos/mreindl118-boop/GuitarPak/pulls?state=all&per_page=100"`,
  `.../releases`, `.../actions/runs`.
- Records: `git show origin/coord/cowork-20261022-claude:tasks/<file>`.
- The raw data of the 2026-11-02 run (PR JSON, commit list with chat assignment, concatenated
  records) is in the cloud chat's scratchpad (`consolidate/`), which is not durable; the commands
  above rebuild it.
- New activity since then: the daily watch reports it ([DEV-HANDBOOK.md](DEV-HANDBOOK.md) 7).
