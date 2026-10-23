# Cloud validation — SoundLab web 1.0.0

Baseline: GuitarPak main `6a5891f401dcb0239d887fb515c26ec418a2c598` (web
0.82.0). Working branch `codex/soundlab-lumi-consolidation-20261023`.
Node24, Playwright1.62.1, system Chromium `/usr/bin/chromium`, local HTTP.
The native APK feed remains0.75.0 and its bytes are unchanged. Cache revision
is `guitarlab-v123`. Exact tested/published SHAs belong in the external release
ledger and hosted CI results; this document does not claim an unperformed
remote operation.

## Scope and provenance

[The branch audit](BRANCH-AUDIT-2026-10-23.md) covers all18 accessible GuitarPak
heads and related Sampler-DAW/HealLicks baselines/releases by feature content.
Selective source adaptations retain provenance; no stale core was blanket
merged, source branch deleted, unseen local Helix work claimed, or unrelated
repository changed. [Coverage](FEATURE-COVERAGE-2026-10-23.md) maps every built-in
pitched producer/forwarder and the instructional contexts, including explicit
unsupported paths.

Implemented software includes shared Scale Lock/output cleanup, the independent
clef display master and color mode, four-context target wiring, guided exact
note/chord performance, structured import corrections, per-instrument progress,
and shared monophonic audio practice. The player uses one target/clock state
for screen/LED guidance and grades raw input before output filtering.

## Frozen software checks

The default runner contains every test file once. Local checks use separate
HTTP ports and evidence directories; suite summaries are not counted as
assertions. The final local groups and hosted gate results are recorded below.

| Frozen core suite | Actual passed assertions |
| --- | ---: |
| MIDI service / source identity / ownership |130|
| Web/native streaming ingress |56|
| Independent synth sound route |79|
| Guitar/Piano pitched sound lock |14|
| DAW synth/sampler/Jam/offline sound lock |64|
| Deterministic performance clock/scoring |100|
| MIDI/ASCII import |55|
| XP/calendar/decay persistence |129|
| Shared palette |19|
| History-preserving Pages deployment |34|

These10 suites passed **680 assertions** on web1.0.0/cachev123.
`/workspace/soundlab-evidence/final-core.log` and its per-suite directory retain
the output. The legacy group passed13 suites/467 assertions; the integrated group
passed16 suites/542 assertions. Together, all39 permitted suites passed
1,689 individual assertions with zero failures. Logs are `final-legacy-a.log`
and `final-integrated.log` with separate per-suite directories. The original
update test’s six unchanged HTTP cases also passed against web1.0.0 using a
temporary HTTP-only selection; its two denied file cases were not attempted.
That is1,695 passed local assertions, with the two file cases still blocked.

Independent targeted reviews also executed:

- Full-app five-case input-switch/replacement, streaming raw input and sustained
  current/upcoming review, with zero page errors.
- Four requested instructional contexts plus Songs, reconstructing actual
  simulated output frames and testing master off/on, lifecycle/root changes,
  disconnect/reconnect, exact octave feedback and unsupported data.
- Audio pending navigation, superseded double Start, Resume→Stop cancellation,
  held source changes and strict audio-only answer selection:29 browser checks.
- XP adversarial state/calendar/vacation probes, failed-save retry/export,
  exact midnight allocation, no idle/pause/count-in farming and honest tempo.
- Deployment script against disposable local bare repos, including exact trees,
  deletions, history, concurrent updates, stale source rejection and rollback.

## UI, offline and release evidence

Desktop1440px and phone390px previews cover both Intervals and Note Names,
light/dark themes, current chord/partial answer, upcoming piano-roll notes and
key target marks. They require no MIDI permission or connected device. The
final visual/offline worker verified all four layouts, all9 cached JS assets,
full offline player completion, persisted observed progress and the legacy
guided flow. There were zero MIDI/audio permission requests, errors or document
overflow. Current evidence is in
`/workspace/soundlab-evidence/performance-ui.json`, mode screenshots and
`offline-final.json`; initial earlier-slice artifacts remain separate.

Completed features have independent review. Final release must still use the
exact passing CI source SHA, normal review/main publication, verified Pages
output and immutable release/tag checks in
[the release gates](RELEASE-1.0.0-CHECKLIST.md). Local test success is not a
claim of hosted CI execution or publication.

## Exact blocked or unavailable checks

The managed Chromium denied `page.goto(file:///workspace/soundlab-baseline/index.html)`
and the feature checkout's equivalent with **ERR_BLOCKED_BY_ADMINISTRATOR**.
The existing update suite has six HTTP/web/Android-shell scenarios followed by
two hardcoded file-protocol scenarios. The supported HTTP test mode already
covers the first six; HTTP cannot exercise `location.protocol === 'file:'`.
The two file cases remain **denied in this environment**, not passed or replaced.
No browser-security bypass or unsupported retry was attempted. Hosted CI runs
the unchanged full suite normally and must resolve this gate before release.
AAPT/native wrapper inspection was not available; no APK/IPA build was made.

The existing cloud `gh auth status` reports its GH_TOKEN invalid. No credential
was changed. The connected GitHub app's harmless repository lookup succeeds
and confirms existing push access; normal authorized publication uses that
existing connection/git route and existing Actions token where available.
Any failed/denied remote write must be reported exactly, without assuming it
executed or changing access. Existing workflow GITHUB_TOKEN pushes cannot
trigger a Pages build; the connected GitHub app publishing handoff and public
asset verification are required, without adding scopes or credentials.

Sampler-DAW's independent audit passed22 tests but could not load one integration
file because `esbuild` is absent in that checkout. It was not modified. Shell
GitHub API reads were proxy-blocked; the connected read-only GitHub tools
completed release inventory, so no repository-audit access gap remains.

## Hardware and capability limits

All ports, PCM signals, device names and audio graphs in these tests are cloud
simulations. No user computer, physical MIDI/audio device, OS driver, firmware,
installed LUMI program, native build/signing or actual illumination was tested.
The palette is a documented archived default-program profile; physical
perception/calibration and every firmware's behavior are not guaranteed.

A synth's direct local keyboard-to-engine sound requires user Local Control
OFF for software lockout; no hardware setting is changed. Direct/acoustic or
opaque recorded audio cannot be scale-muted by this feature. Typed percussion
is intentionally outside pitched admission; arbitrary custom JavaScript can
bypass shared APIs. Native shared ingress/send has simulations, while exact
independent three-port practice routing is Web MIDI only.

Audio practice is monophonic, locally analysed and explicitly started. It may
reject noisy/distorted/ambiguous/bent input. Chords require MIDI or a clearly
labeled arpeggio adaptation. Real delay calibration is manual and unverified;
software tests prove timestamp compensation, not hardware latency. PDFs/images,
prose and unsupported score formats do not acquire invented target notes.
