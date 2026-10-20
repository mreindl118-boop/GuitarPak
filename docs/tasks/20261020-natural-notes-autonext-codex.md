# Natural Notes MIDI correction hotfix

- Owner / sole writer: Codex. Contributor review: Claude, pending.
- Authorization: Matt requests first correct MIDI answer auto-next, including after a miss, and says to push the update fast through existing gates.
- Repository / branch: mreindl118-boop/GuitarPak, codex/natural-notes-autonext-20261020.
- Created: 2026-10-20. Status: ready for focused review; full existing suites in progress.
- Base: published main 64be12efe20e87bc74c79cf7297902f6617bc213. gh-pages e2012b8ed3a8ec2f132f7c159991c8d91dce46a8 explicitly mirrors that commit; live web feed is 0.77.2. The reported local installation was 0.77.1; both versions use this same answer guard.
- Claimed paths: js/quiz.js; tests/quiz-correction.test.js; tests/run.sh; .github/workflows/validate.yml; APP_VERSION in js/app.js; web/notes in version.json; CACHE in sw.js; own README Current work row; this task record.
- Remote coordination: all current branch heads and open PRs checked. Root owns PR84's separate modal-pause change; PR84 remains unmerged. Claude's visual branch 0e4dcf12b3d9c9753ca90bd79d566dd77c0fc4c6 changes quiz icons and other UI; this hotfix is isolated on the published line and does not overwrite or merge that branch. Contributor review of the hotfix is requested before integration.

The first fresh correct note after a wrong single-note or playable-choice answer advances once. The existing explanation remains visible until the correction. The original miss, XP and drill history remain unchanged. Normal correct-answer feedback timing, chord/set answers and sprint behavior retain their existing flow.

Held notes are tracked by input source, pitch and channel across question transitions. Offs only release that gate. Layered channel duplicates cannot answer the next question. A genuine MIDI input identity change clears stale MIDI-held entries; output-only state changes cannot re-arm them.

Validation: focused Playwright suite 25/25 PASS on the actual full app with mocked MIDI bus. Existing web/mock suites are running; final result and remote commit will be recorded here. Independent code review passed core logic and identified the reconnect edge, now fixed with a focused regression. No physical device is used by tests.

Web patch version 0.77.3, cache guitarlab-v111. Actual APK channel remains 0.75.0; no wrapper, signing or native build changes. The validation workflow is the existing PR84 workflow copied without its feature changes.

Publication: owned branch only pending checks and exact-commit contributor review. No main merge, deployment, tag or GitHub Release. Next owner: Claude/source contributor for review; Codex retains task ownership until acknowledgement. No private music inputs or hardware captures are included.
