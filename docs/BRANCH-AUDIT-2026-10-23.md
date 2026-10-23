# GuitarPak branch/content audit — 2026-10-23

Scope: read-only cloud GitHub audit of all 18 pre-existing accessible branch heads, fetched and independently matched with `git ls-remote --heads --tags origin`; no tags were advertised. All source branches are preserved. GitHub release objects were also checked through the connected read-only GitHub tool: GuitarPak had no GitHub releases at audit time; its named release branches, deployment branch and tracked releases/ binaries are distinct baselines. The new `codex/soundlab-lumi-consolidation-20261023` review branch is the output of this audit, rather than another historical feature candidate.

Canonical source evidence: GitHub metadata identifies `mreindl118-boop/GuitarPak` default `main`; README names soundLAB, old GuitarLab branding and published GuitarPak URL; CLAUDE.md identifies this repository and its module architecture. Baseline `main` = `6a5891f401dcb0239d887fb515c26ec418a2c598`, tree `ec6624746641be47c8ac6f1f3de3b9aa06d413b2`. Same commit/tree is the claude verify branch. gh-pages differs only by `.nojekyll`. APP_VERSION and version.json.web are 0.82.0; version.json.version is the separate Android APK channel, 0.75.0.

Comparison method: every remote head was inspected using `git ls-tree`, whole-tree `git diff --name-status` against main, and focused source/tests/docs reading. Ancestry was consulted only as context; integrated status below comes from retained code/behavior and targeted content diffs, not commit reachability alone.

| Remote branch (origin/) | Exact head SHA | Feature content | Status against main |
|---|---|---|---|
| `claude/verify-project-files-4bchk6` | `6a5891f401dcb0239d887fb515c26ec418a2c598` | Exact current main tree; 0.82.0 visual pass, clef key/tempo dropdown, LED-scale and Scale-lock switches. | Current default content; use main rather than guessing from feature names. |
| `codex/midi-hub-release-0.78.0-20261019` | `b8ccb55de28e4dd297e8d4b7ac4f8a4b3dfcfe4f` | Old 0.78.0 integration candidate: separate LUMI practice scaffold, Score MusicXML composer/reader/export, private browser Music Library, recall-only Helix page, release-history UI, MIDI independent-port and Thru cleanup work, validation workflow. | Stranded modules; extracting selected features requires adaptation. Whole-tree merge would regress newer shared MIDI, audio input, practice plan, 0.82 visual/navigation and lighting. |
| `codex/natural-notes-autonext-20261020` | `7e8884f510e869bbd42d0513b4b797537036bf94` | Quiz correction on first fresh correct press, repeated/multichannel hold filtering, focused correction suite, validation workflow. | Stranded: main inputNote still rejects answered questions and midi:note lacks held-note gating. Adapt identity to current multi-input support. |
| `codex/piano-volume-0771-20261014` | `88013081c2aa65516426898ba6c7ef9b047dbf24` | Grand-piano normalization trim and AudioContext-aware Keys tests. | Already carried in main; no unique added paths. |
| `codex/soundlab-led-0772-20261014` | `8928b76d4b89129499795ea9cf15768cee7f13b1` | Reconnect/re-send LED restoration, missing-output handling, Windows CRLF launcher preservation. | Already carried and evolved in main; no unique added paths. |
| `coord/cowork-20261022-claude` | `0b084e803ce1ff09dbd93b386c82a2d93316c2af` | 14 advisory task/handoff records including LUMI aid, synth control, practice-plan releases and Helix collaboration. | Stranded coordination evidence only. Helix handoff references local-only native transport; do not infer its code is in GitHub. |
| `docs/coworking-20261018` | `2eaa0f802be5d5e1cab8127228dbce6b913ebb5a` | README link to private GeneralStorage coworking workflow. | 4-line README guidance absent from main; documentation-only, no new runtime feature. |
| `feat/helix-stadium` | `0b39653d6998d0747fbaa1e76fdc119b0b447a98` | plugins/helix-stadium.js, tools/helix-bridge.js, model defs, tests/helix.test.js and docs; deep network editor plus MIDI controls; later favorites/arming/port isolation merge. | Stranded real GitHub implementation. Broader and distinct from old codex recall-only page. Runtime integration not on main; needs isolated review, protocol/firmware attestation and user hardware session later. |
| `feat/lumi-display` | `1dbbb326f60e05d76d891090f0c07f1ec533020f` | lights.display guides show degree/pitch colored now/next notes; lesson Display chip; double-tap lesson control; tests/lumidisplay.test.js. | Already in main; no unique added paths. |
| `feat/lumi-display-aid` | `0e0600c3408e07e0e5b555c74f03219f9e84111f` | Songs and Woodshed now/next targets through shared App.midi.guide, cleanup and wait-mode coverage. | Already in main. Current main preserves aid and adds LED scale/Scale lock; no unique added paths. |
| `feat/midi-hub` | `bf55d2819ef2cd1bb2c8d6d6f0b2c8db50b74a80` | MIDI monitor/rules/profiles/SysEx/clock Hub. | Already in main, subsequently extended by synth output, knobs and Scale-lock Thru filter. |
| `feat/synth-control` | `3c09036a047b4a21ef4fcaf0dbc0f2773528f16d` | Independent Hub synth output, big-knob Control view and Yamaha MODX assignments. | Already in main; keep it when extracting older explicit-port/Thru work. |
| `fix/hub-app-sound` | `91213cc9dc821b0c574fa2867e654b3f121a1116` | App sound switch and Hub mute ownership avoid doubling the synth. | Already in main; preserve midi:note mute and App.midi.mute when integrating older files. |
| `gh-pages` | `dc1e1d4f3060da41162b8c1e9d157d62c08ce142` | Mirror of main 6a5891f with .nojekyll added. | Deployment baseline content equals main for all app files; no stranded feature. |
| `local/desktop5-wheel-fix-0.80.1` | `93983e2e59858a3f13bb44d6e6555e06179cb559` | Knobs change on wheel only when focused; regression test. | Already in main. js/midihub.js knob code and tests/midihub-wheel.test.js are identical to release/0.81.1 wheel implementation. |
| `main` | `6a5891f401dcb0239d887fb515c26ec418a2c598` | Canonical soundLAB PWA, APP_VERSION and version.json.web 0.82.0; APK channel remains 0.75.0. | Verified working baseline, newer than both named release branches. |
| `release/0.81.0` | `4122d3102fe64e2a9b7cb3a4d535094079fe5a6c` | Guided practice plan from notes: js/practiceplan.js, docs/PRACTICE-PLAN.md, tests/practiceplan.test.js. | Historical release; these three files are byte-identical in current main. Main adds wheel fix and 0.82 UI/Scale-lock work. |
| `release/0.81.1` | `b2e4fcb7887b561934ff4714f546b1f1a7260149` | Practice plan plus focused-wheel MIDI knob fix; web 0.81.1. | Historical release; js/practiceplan.js, tests/practiceplan.test.js and tests/midihub-wheel.test.js identical in main. Main retains fix and adds Scale-lock filter to Hub send. |

## Stranded inventory and safe priorities

1. Recover quiz correction behavior from `7e8884f510e869bbd42d0513b4b797537036bf94` as a narrow adapted patch, with its focused browser regression suite. Main `js/quiz.js` still exits `inputNote` on `cur.answered` and accepts every incoming note-on; the source patch advances after a miss without regrading it and requires fresh presses. Current multi-device MIDI means held identity must include physical source identity, not just channel.
2. LUMI practice scaffold (`js/lumi-practice.js`, `css/lumi-practice.css`, `docs/LUMI-PRACTICE.md`, `tests/lumi-practice.test.js`) in `b8ccb55` is a distinct exact-pitch, single-note/triad exercise and an explicitly simulated independent-input/output experiment. It is not the current shared lights.display implementation. Its hardware route needs source APIs `explicitPortsSupported`, `subscribeInput` and `sendToOutput`, absent under these names in main; adapt or expose compatible additive APIs while preserving main all-keyboards mode and separate Hub synth output.
3. Score and Music Library in `b8ccb55` are substantive stranded features. Score is a bounded one-part MusicXML reader/composer with local preview and MIDI export; Music Library adds IndexedDB immutable originals, explicit metadata, versioned MIDI and integrity-checked ZIP STORE backup. These are larger additive integrations with own tests/docs; no reason to replace current shared files wholesale.
4. Helix plugin branch `0b39653` is a substantial separate candidate and supersedes the scope of the earlier recall-only `js/helix-stadium.js` candidate. Presence is established on GitHub; historical hardware statements in its docs are collaborator claims, not hardware validation by this cloud audit. Native localhost transport referenced by coordination docs is not present in this branch; do not claim recovered.
5. MIDI independent subscriptions and routing cleanup, held channel-note tracking, temporary Thru arming/echo safeguards in `b8ccb55` can improve current service but conflict with current multi-input and independent synth routing. Review as targeted changes with regression coverage, never copy old midi.js/midihub.js over main.
6. Validation workflow and What's New UI exist only in stranded candidate. Any release-history recovery must update stale version/features to match what is actually integrated. Documentation coworking branch is advisory workflow only, not user functionality.

## Lumi exactness

- Main supports ROLI LUMI 24-key LED keyboard lighting through `js/midi.js`, UI `js/lights.js` and key lessons. `lights.display` is a display *mode for the key LEDs*: current step steady and next step blinking. `feat/lumi-display` and `feat/lumi-display-aid` are already incorporated.
- Main source describes velocity color lookup, ROLI/LUMI SysEx and range learning; dedicated tests are `tests/lights.test.js`, `tests/lumidisplay.test.js`, `tests/colors.test.js` plus MIDI backend tests. User hardware identity and observed response are not established by this read-only audit.
- The separate LUMI practice scaffold sends ordinary notes only after explicit mock/test/arm flow and calls its hardware response unverified. No pixel-matrix/text LED-display protocol implementation was located among the branch additions/content.
- Hardware sends, local device discovery and a user-computer connection were never attempted. Browser mocks are software-only evidence.

## Relevant instructions read

No AGENTS.md or SKILL.md exists inside the three related checked out repositories from the parent discovery. GuitarPak CLAUDE.md supplies architectural guidance and test commands: `tests/run.sh` or focused suites; Node+Playwright+Chromium; service worker cache bump for code changes, clear preview cache when verifying; storage keeps `guitarlab.*`. Release/deployment/signing instructions in that file do not authorize a release here: user explicitly forbids pushing/publishing and excludes credentials/hardware.

---

# Related repository audit — 2026-10-23

Read-only source audit of fetched GitHub refs. No source branches changed, no repository files edited, no hardware contacted.

## Baselines and exhaustive related-ref matrix

| Repository/ref | Commit | Content relative to that repository's default |
| --- | --- | --- |
| Sampler-DAW `claude/music-daw-app-design-oqkq9t` (configured default) | `a9d262713ff307b8125e7c53c370f6fcbf1d103d` | soundLAB Studio 0.2.0; React/TS synth, sampler, DAW, native MIDI shells, Electron packaging |
| Sampler-DAW tag `soundlab-v0.2.0` | `a9d262713ff307b8125e7c53c370f6fcbf1d103d` | Exact default commit; GitHub developer prerelease published 2026-10-14T21:01:37Z |
| Sampler-DAW `codex/soundlab-package-metadata` | `4c8ac5c0e5ebc110ee3b14d4e5a0ebb4e54b27a7` | Exact default tree `dfdd8d7d27bb684777dc25b0c679b6fa562bff2a`; no stranded content |
| Sampler-DAW `codex/soundlab-midi-plug-play` | `3b4a7f11e2f4ecf3940fede10992fb1b2a94ecfc` | Diff to default is only `package.json` + `package-lock.json`; runtime/native MIDI fixes fully present in default |
| Sampler-DAW `gh-pages` | `2b7c91045a321484d096bb242fc122edaa9ebfce` | Built static assets, commit says source `6c937d13629e746258f97b82840470c991b27554`; that source differs from default only in package metadata |
| HealLicks `claude/stadium-deck-ipad-pwa-fcvbhm` (only remote branch; configured default) | `3e6512ad3b09cce8651608d6317fca33eced051b` | Stadium Deck Phase 0: typed protocol, bridge, mock, capture wizard, CLI, PWA status shell |

HealLicks has no fetched tags; connected GitHub releases collection returns `[]`. Sampler-DAW has one fetched tag and one GitHub prerelease. Release assets exist for Windows, macOS, Linux, Android debug APK and unsigned iOS IPA/archive. These are evidence of packaged artifacts, not physical-device acceptance.

## What exists and what is stranded

Sampler-DAW is a related but distinct **soundLAB Studio**, not the canonical vanilla-JS GuitarPak practice app. Its feature implementation includes Web Audio synth/sampler/drums, arranger, piano roll/step sequencer, mixing/FX, PCM audio and MIDI recording, import/export, automation, MPE, MIDI-learn, clock/marker PC+CC and interface routing. This code is available on its default/release baseline, rather than stranded in an unmerged feature branch.

Its shared `src/midi/connectionManager.ts` provides remembered port selection by ID then name/manufacturer, paired output selection that excludes software synths, hotplug cleanup/restoration, async connection cancellation, independent notes and optional SysEx permission, and visible input-open failures. These are useful patterns for narrow compatibility fixes in GuitarPak; copying the React/TS subsystem wholesale would conflict with GuitarPak's `App.midi` API, event bus, storage keys and native bridge protocol.

Sampler native bridge protocol is **not the same** as GuitarPak: Sampler uses `soundlab-midi` DOM events plus `soundlabMidi`/`SoundLabMidi.postMessage({action: ...})`; GuitarPak uses `window.__glMIDI` callbacks and `SoundLabMidi.post({cmd: ...})`. Preserve these contracts if adapting concepts.

HealLicks is the repository for **Stadium Deck**, a Helix Stadium XL editor-protocol spike. The implemented PWA (`app/src/App.tsx`) displays connection, read-only toggle, product/firmware and recent event addresses. It explicitly says “Phase 0 shell — the live board arrives in Phase 1.” Live board, active-preset editing and drag/drop librarian are future phases, despite the README describing the broader vision. There is no branch carrying completed later phases.

## Exact Lumi / Helix evidence

- Sampler has ROLI/LUMI controller preference and connection UX, MIDI/MPE input and native iOS/Android bridge support. `enableLights()` requests optional SysEx access, but there is **no LUMI key-light encoder, palette, display renderer or proprietary LUMI display protocol implementation** in this repository. All source/docs branches have the same relevant runtime content as default.
- No Lumi references were found in HealLicks. It implements a different device's OSC 1.0 messages inside ZMTP 3.0 TCP framing, with port 2001 update stream, port 2002 commands, `_stadiumserver._tcp` discovery, command correlation, firmware warnings, snapshots and read-only/rate-limit rails.
- `HealLicks/packages/protocol/src/firmware.ts` has `VALIDATED_FIRMWARE_VERSIONS: readonly string[] = []`. `CLAUDE.md` says no real firmware tested and mock reports `0.0.0-mock`. Product-info schema keys remain best guesses pending capture. Mock tests cannot establish hardware compatibility.
- Earlier local Helix/SoundLab work is not inferred: only code actually present in these fetched repositories is described here.

## Recommendation

For this initial integration, prioritize GuitarPak's existing Lumi branches/baseline and a narrow tested lighting/connection correction. Retain Sampler-DAW as a separate source of DAW and connection-manager ideas; retain HealLicks as a protocol/mock foundation awaiting validated hardware evidence. Do not merge either unrelated application tree into GuitarPak. A future read-only Stadium status adapter would need an explicit bridge contract and configured endpoint; it should preserve HealLicks's read-only and firmware-unknown semantics.

## Checks and limitations

- Inspected local README, package scripts, test files and HealLicks `CLAUDE.md`, `PROTOCOL.md`, firmware source and PWA source. No AGENTS.md or SKILL.md exists under these two repositories.
- Compared tree IDs and complete path diffs, beyond commit ancestry. Sampler metadata branch exactly matches default tree; MIDI branch runtime content is already incorporated.
- Ran `npm run test:midi` in Sampler-DAW using Node 24.19.0: **22 tests passed; one test-file failure** because `tests/midi/engineIntegration.test.mjs` imports unavailable dependency `esbuild` (no installed node_modules). No dependency installation or repo source changes performed in this read-only audit lane.
- Shell HTTP reads to GitHub API were blocked by the environment proxy (`Tunnel connection failed: 403 Forbidden`). The already-authorized connected GitHub read tool successfully returned both release collections; release inventory is complete. No remaining access blocker for this audit.
- No hardware, OS drivers, native build/signing or network device sessions were attempted.

## Focused review of stranded GuitarPak Lumi scaffold

Reviewed `origin/codex/midi-hub-release-0.78.0-20261019` files `js/lumi-practice.js`, `css/lumi-practice.css`, `docs/LUMI-PRACTICE.md`, `tests/lumi-practice.test.js` and `tests/midi-ports.test.js` against current `origin/main` MIDI/Hub code.

1. **Shared output ownership is the principal integration concern.** The scaffold sends ordinary Note On/Off directly through exact-port `sendToOutput`; the shared lighting engine separately caches active notes in `lit` and diffs desired layout. If both target the same LUMI, shared scale/guide notes can coexist with page output OFF, and a transient scaffold Note Off can extinguish a shared note while the engine still considers it lit. Resolve same-port ownership before test/arm, or reject the conflicting route with a concrete message. Test `App.midi` + page together; the isolated fixture forbids all shared ownership APIs and cannot detect this failure.
2. **Do not import the source branch's MIDI core.** Its default input is one port; current main defaults to ALL inputs, stamps source port names, contains later native parser/range/output reset behavior and independent Hub `sendTo` routing. Recover only additive subscription/exact-send API concepts. The old `midi-ports.test.js` assumes the single-input behavior and needs adaptation rather than wholesale adoption.
3. **Isolation has a precise limit.** The page grader does not consume global note/raw/output events, but current main ALL-input dispatch still processes the MODX elsewhere. Hub `onRaw()` forwards through configured Thru even while hidden, and global input rules/voices can remain active. Do not present independent grading as suppression of global MIDI effects. If stopping global output is required, a tested port reservation contract is needed rather than silently changing saved Thru/input selections.
4. **Phone verification is absent.** The existing fixture runs at 1100×1000. Under 700px the CSS still requires 12×32px keys + 11×3px gaps = 417px (before surrounding card padding), horizontally scrolling at common 320/375px widths; key widths are only 32px. Check 320/375/390px, actual shell navigation and light/dark themes; use an intentional responsive grid or scrolling piano with adequate targets, and ensure document-level overflow does not occur.
5. **Existing tests prove mocks, not service integration.** They replace the complete `App.midi`, load only page JS/CSS, and never boot actual shell, permission flow, main MIDI listener implementation, service worker asset cache or global light/Hub behavior. Retain those strong cleanup/role checks, then add a main-service fixture and full app navigation/offline/UI smoke.

The scaffold's strengths are worth retaining: exact-pitch grading, session-only selections, restricted device roles, no global fallback, bounded pulses, original port/channel/pitch cleanup, stale-callback guards, disarm on hiding/blur and explicit software-vs-hardware validation labels.

## Initial integration in this cloud workspace

Working branch: `codex/soundlab-lumi-consolidation-20261023`, created from verified default `6a5891f401dcb0239d887fb515c26ec418a2c598`. The original local `work` branch is preserved. No remote branches or tags were changed.

- Recover the separate LUMI note/triad practice page from `b8ccb55de28e4dd297e8d4b7ac4f8a4b3dfcfe4f`, with isolated simulated answers and exact-pitch grading, extended into guided wait-until-correct note/triad practice with target, correct and wrong feedback. Adapt the exact-port service additions to the current MIDI implementation, with semantic LED frames owned by the shared service, cleanup and real-service browser regression coverage. Existing `lights.display` behavior remains available in Keys lessons, Songs and Woodshed.
- Recover the quiz correction behavior from `7e8884f510e869bbd42d0513b4b797537036bf94`, adapting held-note identity for current multiple keyboard inputs. A correction advances a missed question without changing its original grade.
- Add assets to the shell and offline cache, and expose LUMI practice under Keys. This initial slice preserved release versions and deployment configuration. Later conditional release preparation updates the web candidate metadata and CI/Pages workflow as described below; APK/signing keys/native binaries remain unchanged. The user clarified the three-device-role workflow: separate synth performance input, synth sound output, and instructional LUMI output. The integration adds a guarded synth route using the shared Scale Lock predicate and switch, paired note/pedal cleanup and shared output ownership; when locked, it blocks notes rather than remapping them.

These are selective source adaptations, not blanket merges. Source comments and focused docs preserve provenance. Baseline main already had `scale.lock` in the clef dropdown (`App.scaleLock`, app note filtering and Hub Thru note filtering); it did not maintain an independent, paired, cleanup-safe external-synth sound route. The new practice router fills that gap rather than creating another scale definition. Generated LUMI targets follow the shared selected root/scale in simulation and hardware-routing modes, independently of both master switches. MusicXML/Score, the private Music Library, release-history UI and both Helix candidates remain inventoried follow-ups. CI is implemented in the release preparation below. No unseen earlier local Helix implementation is claimed recovered.

### Expanded integration requested during the audit

- Comprehensive built-in pitched-note Scale Lock now covers guitar/Keys, DAW synth and pitched sampler, Jam, scheduled/offline playback and all public musical MIDI/Hub routes. It uses one root/scale and one switch, preserves required releases and clears held/future voices at policy boundaries. Raw grading remains observable before blocked sound. Typed percussion, opaque recordings/live audio and arbitrary custom plugin code have explicit scope limits.
- The same clef dropdown now owns the independent LUMI Display master and Intervals / Note Names color mode. Display output selection is exact and independent of synth sound. A shared archived LUMI-program palette quantizes screen and LED pitch identities; program/firmware and perceptual limitations are documented, without claiming arbitrary RGB transport or hardware equivalence.
- Keys lessons, Fretboard/Tab/Sheet, pitch-bearing Exercises, Piano scale practice and Songs publish actual current/upcoming targets through the shared display. Cleanup and priority are regression-tested; unsupported content publishes no invented notes.
- Woodshed gains a first-class guided performance player backed by its existing generated/Studio/MIDI/ASCII score model. Wait for Me matches exact chord attacks and rearticulation; Play at Tempo maintains a deterministic beat clock and reports onset accuracy, misses, extra/wrong attacks and separate hold measurements. Piano roll, playable target keyboard, count-in, pause/resume, tempo, transpose and sections/loops work without LUMI. Original generated melody/chord exercises are included. MIDI and ASCII import defects were corrected with explicit constant-tempo/approximate-rhythm contracts.

See [the routing/context/source coverage matrix](FEATURE-COVERAGE-2026-10-23.md), [guided performance](GUIDED-PERFORMANCE.md), [palette/protocol evidence](NOTE-PALETTE.md) and [final validation](VALIDATION-2026-10-23.md). These additions extend current main compatibly; they do not revive the old scaffold's shared core or import unrelated branches wholesale.

### Conditional release preparation

The user subsequently authorized web 1.0.0 publication only after the agreed features, independent review and software gates pass. The candidate's app/feed web version is 1.0.0 and its cache revision advances; the APK feed channel stays 0.75.0 and native/binary artifacts are unchanged. This metadata does not establish a published release.

The new reusable test workflow runs every default suite. Pages requires its successful result and exact tested SHA, then appends the source snapshot plus `.nojekyll` on the current gh-pages parent with an ordinary push, bounded race retries and stale-source checks. Tests use read-only access; only deployment retains the existing contents-write scope. No credentials, protected-branch settings or permission scopes were expanded. Local bare-repository tests cover the actual deployment script, including rollback through normal source reverts. Hosted CI, main/tag/release publication and production verification remain separate gates; see [the release checklist](RELEASE-1.0.0-CHECKLIST.md) and [CI/deployment process](CI-DEPLOYMENT.md). No final integrated-suite result is claimed here while the feature freeze is being verified.

### Scope of display evidence

The shared implementation in `js/midi.js` targets a ROLI LUMI Keys BLOCK keybed: 24 notes, pitch-window learning, per-note velocity palette, and source-described community SysEx commands. Its `lights.display` mode is steady current-note plus blinking next-note LEDs, not text or pixels on a separate panel. The recovered practice page is a separate exact-note/triad learning flow. Armed target/feedback frames use ordinary Note On/Off messages through temporary ownership in the shared MIDI service. It does not install a LittleFoot program or verify a device's current program. Neither mock send success nor visual browser previews establish physical LED response.

No standalone Lumi text/pixel-display driver, firmware or layout was found among the inspected application branches. The user clarified that the illuminated board itself is the instructional display, showing what to play for learning and practice. The guided integration follows that intent; exact physical model/firmware and LED response remain unverified in this cloud environment.

### Validation evidence

Final check results and UI evidence are recorded after implementation in `docs/VALIDATION-2026-10-23.md`. Tests use Chromium and simulated MIDI ports in this cloud environment. Hardware MIDI, firmware, native iOS/Android builds, OS drivers and physical LUMI/MODX/Helix response are outside this validation.
