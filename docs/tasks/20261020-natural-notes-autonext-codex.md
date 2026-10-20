# Natural Notes MIDI correction hotfix

Owner: Codex; sole writer. Claimed 2026-10-20. Base: main 64be12efe20e87bc74c79cf7297902f6617bc213; published gh-pages e2012b8ed3a8ec2f132f7c159991c8d91dce46a8 mirrors that main.

Scope: js/quiz.js, tests/quiz-correction.test.js, tests/run.sh, .github/workflows/validate.yml, js/app.js APP_VERSION only, version.json web/notes only, sw.js cache only, this task record and own README current-work row. The validation workflow is the already reviewed PR84 web-test workflow, with the existing hotfix-branch suites. No other PR84 feature files are included.

Correcting a wrong answer with the first fresh correct MIDI note must advance once while preserving the original miss, XP and explanation. Note Off and held/repeated/multichannel duplicate notes must not advance questions. A genuine input route change clears stale held notes; unrelated output-state changes do not.

Separate hotfix branch codex/natural-notes-autonext-20261020 from published source. Local worktree: soundlab-midi-release/note-hotfix. PR84 (0.78.0) remains separate and unmerged. Root owns both the hotfix and PR84's isolated modal-pause quiz change; no conflicting contributor quiz claim found in current remote work. No native wrapper/signing changes, hardware configuration changes, private music inputs, tags or GitHub Releases. Contributor review and existing release gates remain in force; no force pushes.

Authorization: Matt requests first correct MIDI answer auto-next, including after a miss, and explicitly says push the update fast through existing gates.

Status: in progress; claim read back before source edits. Independent core review passed; reconnect edge addressed; focused browser tests running. Review/publication receipt will follow here.
