# Natural Notes MIDI correction hotfix

Owner: Codex. Claimed 2026-10-20. Base: main 64be12efe20e87bc74c79cf7297902f6617bc213; published gh-pages e2012b8ed3a8ec2f132f7c159991c8d91dce46a8 mirrors that main.

Scope: js/quiz.js, focused quiz regression tests, web version/cache/release note metadata, this task record and own README current-work row. Correcting a wrong answer with the first fresh correct MIDI note must advance once while preserving the original miss and explanation. Note Off and held/repeated/multichannel duplicate notes must not advance questions.

Separate hotfix branch based on published source. PR84 (0.78.0) remains separate and unmerged. No native wrapper/signing changes, hardware configuration changes, private music inputs, tags or GitHub Releases. Contributor review and existing release gates remain in force; no force pushes.

Status: claim published before source edits; focused implementation and verification pending.
