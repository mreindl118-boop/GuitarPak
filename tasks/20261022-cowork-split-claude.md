# 20261022-cowork-split-claude

Claude's acknowledgement of the coworking workflow, and Matt's three soundLAB
tasks for 2026-10-22 split between Claude and null. Sole writer: Claude.
null writes its own `tasks/*-null.md` records; nobody edits the other's.

## Acknowledgement

Claude has read the coworking README (mreindl118-boop/GeneralStorage,
branch `docs/coworking-20261018`,
`projects/repository-handoff-20261016/coworking/README.md`) and this
repository's `CLAUDE.md`, and accepts that workflow for GuitarPak: one task
record per owner, exact path claims, separate branches and worktrees,
recheck remote heads before every push, no force-push, and disagreements
escalated to Matt. Claims are advisory, not locks.

## Today's tasks (Matt, 2026-10-22)

| # | Task | Owner | Record |
|---|------|-------|--------|
| A | Synth Control: a simple MIDI controller view that makes synth control easy | Claude | `tasks/20261022-synth-control-claude.md` |
| B | Practice plan: regimented, guided practice built from existing app modules, informed by the lesson Google Doc, with a "module gap" app-improvement metric | null | null to publish `tasks/20261022-practice-plan-null.md` |
| C | LUMI Keys "Display" practice aid, extended beyond scale lessons | Claude | `tasks/20261022-lumi-display-aid-claude.md` |

A and C both edit the MIDI service and keybed (`js/midi.js`), so one writer
(Claude) holds both. B is a new, self-contained module, so it splits cleanly.

## Path ownership (proposed; null confirms or proposes changes in its record)

**Claude (A + C):** `js/midi.js`, `js/midihub.js`, `js/keylessons.js`,
`js/lights.js`, `js/piano.js`, `js/songs.js`, `js/woodshed.js`,
`tests/midihub.test.js`, `tests/lumidisplay.test.js`, `tests/lights.test.js`,
`tests/colors.test.js`, and Claude's own `tasks/*-claude.md`.

**null (B):** new `js/practiceplan.js`, new `tests/practiceplan.test.js`, new
`docs/PRACTICE-PLAN.md`, and null's own `tasks/*-null.md`. Plus these
one-line integration touches, which Claude will not edit:
- `index.html`: one `<section class="panel" id="panel-practiceplan">` and
  one `<script src="js/practiceplan.js">` line.
- `js/app.js`: the page id in `SPACES` / `GROUPS` and its labels only.
- `sw.js`: one `ASSETS` line for the new file.
- `js/help.js`: null's own `TOURS.practiceplan` entry.

**Release bookkeeping, Claude only:** `APP_VERSION`, `version.json`,
`sw.js` `CACHE`, `android/AndroidManifest.xml`, `CLAUDE.md`,
`tests/run.sh`, the claude.ai artifact. null lists what it needs in its
handoff record; Claude applies it when integrating.

**Shared read-only APIs null may call (no edits needed):** `App.store`,
`App.on` / `App.emit`, `App.switchTo(page)`, `App.keysLessons.open(id)` and
`.summary()`, `App.emit('fb:practice', {root, scale, bpm})`, `App.xp`,
`SLQuiz`, `App.colors`, `App.help`. If null needs a new hook in a
Claude-owned file, it asks in its record and Claude adds it.

## Branches, integration and going live

- Base: `main` at `1dbbb326f60e05d76d891090f0c07f1ec533020f` (0.79.0 live).
- Claude: `feat/synth-control` (A), `feat/lumi-display-aid` (C).
- null: its own branch, e.g. `null/practice-plan-20261022`, in its own
  worktree. Never Claude's branches, never the install checkout at
  `C:\Users\mrein\Creative-Workspace\GuitarPak` (Matt's Desktop soundLAB
  serves that folder live; keep it on `main`).
- Each owner runs the full suite set before handing off (recipe in
  `CLAUDE.md` › Dev loop). Hand off with a timestamped record: branch, exact
  commit, changed paths, checks run and results, open items.
- Claude integrates finished branches into one release (0.80.0) and does
  the release bookkeeping. Going live (pushing `main`) needs Matt's say-so
  each time.

## Communication

Repository files only: timestamped records under `tasks/` on each owner's
branch (`<UTC-date>-<topic>-<owner>.md`, or `<UTC-timestamp>-<topic>-<owner>.md`
for handoffs). Before each session or push, fetch all remote branches and
read the other's newest records. Questions go in your own record under
"Open questions for <other>"; answers go in the other's next record.

- Created: 2026-10-22T16:24:00Z
- Remote confirmation: 2026-10-22T16:23:56Z, `main` = `1dbbb32`; open
  Codex branches seen and left untouched: `codex/midi-hub-release-0.78.0-20261019`
  (PR84, superseded on `main` by 0.78.0 to 0.79.0, needs reconciling by its
  owner before anything in it lands) and `codex/natural-notes-autonext-20261020`
  (PR85, quiz hotfix, not in today's scope).
