# Cloud validation — SoundLab web 1.0.0

Canonical baseline: GuitarPak main `6a5891f401dcb0239d887fb515c26ec418a2c598`
(web 0.82.0). Candidate branch: `codex/soundlab-lumi-consolidation-20261023`.
Web metadata is 1.0.0; the native APK feed remains 0.75.0 with unchanged bytes.
The final addendum uses service-worker cache `guitarlab-v124`.

Exact candidate/published SHAs and hosted results are recorded in the release
ledger and GitHub Actions. This document describes performed checks, not an
unperformed merge, deployment or release.

## Scope and provenance

[Branch audit](BRANCH-AUDIT-2026-10-23.md) covers all 18 pre-existing GuitarPak
heads plus Sampler-DAW/HealLicks branches, release/default baselines and feature
content. Selected adaptations preserve provenance; no stale core was blanket
merged, source branch removed, unseen local Helix code claimed, or unrelated
repository changed. [Coverage](FEATURE-COVERAGE-2026-10-23.md) maps built-in
pitched producers, forwarding routes, instructional contexts and explicit limits.

Implemented software includes comprehensive shared Scale Lock and paired
cleanup; independent global clef display/color controls; actual four-context
note targets; Wait/Tempo performance and structured import; monophonic audio
practice; per-instrument progress; and instrument-organized Learn. Lessons and
performance now use one canonical instrument XP balance. Historical global
XP/completion remains Legacy/unassigned, without destructive migration.

## Frozen final local regression

Node 24, Playwright 1.62.1 and system Chromium 154.0.8037.57 ran the app over
local HTTP. The default runner contains 45 suites. All 44 locally permitted
suites passed individually, totaling **1,981 actual assertions**, plus the six
unchanged HTTP/web/Android-shell update cases: **1,987 local assertions**.
Suite-summary lines are excluded from these counts.

| Final partition | Suites | Passed assertions |
| --- | ---: | ---: |
| Core routing, engine, import, XP/calendar, palette and release fixtures | 12 | 731 |
| Existing UI, course/game, navigation, taps and lighting | 11 | 420 |
| MIDI Hub, audio graph, devices and instructional display | 10 | 347 |
| Performance/audio/progress, Plan, Learn, instrument credit and global clef | 11 | 483 |

Evidence: `/workspace/soundlab-evidence/addendum-final-counts.json`, four
`addendum-final-*.log` partition logs and their per-suite directories. The legacy
partition initially failed obsolete passive/global-XP expectations in
`practice.test.js`. That test was updated for the authorized explicit-session
behavior, retaining its Back/drill/apply/lefty cases; its 33 assertions then
passed in `addendum-final-practice-rerun.log`. The original partition log retains
that initial failure. All final per-suite logs pass. This was a test-only
adaptation; the 45 critical runtime SHA-256 hashes stayed unchanged throughout.

The six HTTP update cases passed in `addendum-update-http.log`. The two denied
file-protocol cases were not retried locally or counted as local passes.

## Independent review and UI/offline evidence

- Instrument/XP review passed eight targeted suites, **277 assertions**, with
  final affected reruns after the last recovery/label fixes. It reviewed frozen
  attribution, duplicate IDs, timing denominators, real silent-quota recovery,
  raw response time versus bounded earning time, and actual lesson/source identity.
  See `addendum-independent-results.json` and `soundlab-instrument-review.md`.
- Independent global clef review passed **291 checks** over all 23 built-in
  page/workspace contexts at desktop and phone widths, including 360px, focus,
  keyboard, outside touch, modal exclusion and shared state. The main clef suite
  separately passes 137 assertions, including computed contrast and persistence.
- The instrument-aware existing Plan independently passed **45 checks**. No
  Google Docs fetch/OAuth or new teacher aide was implemented.
- Final actual service-worker offline verification passed **16 checks**: all
  41 index scripts/styles were cache-served offline; all 45 critical asset hashes
  stayed fixed; Drums/Bass filtering worked; a completed performance and its
  original instrument/XP survived two offline reloads. There were zero MIDI or
  microphone permission calls, page errors or failed offline app assets.
  See `addendum-session/offline-learn.json` and its settled screenshots.
- Desktop/phone dark/light global-clef screenshots and the earlier Intervals /
  Note Names performance screenshots verify visible targets, accessible feedback
  and mode choices. The palette/score rendering source is unchanged by the Learn
  addendum. Generated exercises and simulated ports/signals are test data.

Earlier implementation evidence remains available separately. Those checks
are not added again to the final totals above.

## Hosted CI and exact-source release gate

The normal review-branch push of implementation commit `c783524` started
[run 39983234925](https://github.com/mreindl118-boop/GuitarPak/actions/runs/39983234925).
It completed successfully with all 40 then-default suites, including all eight
unchanged update cases. Its matching bundled Chromium was 151.0.7922.34, distinct
from the locally tested system build. Full logs are in `hosted-c783524.log`.
That run certifies its exact source, not a later addendum commit. The updated
candidate must pass the same unchanged full gate, now 45 suites, before main
publication. Record its exact run/head/conclusion in the external ledger.

The current workflow allows 30 minutes: the first cold hosted run took nine
minutes to install dependencies and nine more for regression. This adds time,
not exclusions. Test permissions stay read-only and checkout credentials are
not persisted. Deployment/release fixtures pass history, stale-source, readiness
and immutable-tag cases without performing remote publication.

## Exact blocked or unavailable actions

Managed cloud Chromium denied navigation to baseline and feature `file://`
indexes with `ERR_BLOCKED_BY_ADMINISTRATOR`. No security bypass or unsupported
retry was attempted. Hosted ordinary CI resolved those cases for `c783524`;
HTTP-only checks cannot prove that protocol branch for a new source. AAPT/native
wrapper inspection was unavailable; no new APK/IPA or signed wrapper was built.

Existing `gh auth status` reports its GH_TOKEN invalid; no credential changed.
The connected GitHub app's harmless repository lookup and the ordinary review
branch push succeeded using existing access. Public non-draft PR creation was
subsequently **rejected by automatic approval review**, citing the earlier
publication restriction despite the recorded later conditional approval.
No PR was created. Explicit clarification is pending. The later Learn addendum
explicitly permits updating existing CI; main/tag/release and the publishing
handoff remain held, without using another route to create a PR or publish.

A workflow `GITHUB_TOKEN` push does not trigger a Pages build. After authorization
and passing gates, the existing publisher handoff must append the exact tested
snapshot with ordinary history-preserving access, followed by public asset hash
verification. No new token, scope, security setting, hosting purchase or force
push is part of this process. See [CI/deployment](CI-DEPLOYMENT.md) and
[release gates/rollback](RELEASE-1.0.0-CHECKLIST.md).

Sampler-DAW independently passed 22 tests; one integration file could not load
because `esbuild` is absent in that untouched checkout. Shell GitHub API reads
were proxy-blocked; connected read-only tools completed the repository inventory.

## Hardware and capability boundaries

All MIDI/audio/LED ports, PCM signals and graphs are cloud simulations. Physical
LED response, installed LUMI program/firmware, instrument Local Control, real
input latency/noise and drivers remain unverified. The shared palette models a
documented archived default program; it does not guarantee perceptual screen /
LED calibration or every firmware's behavior. No custom board program is uploaded.

External synth direct sound needs user Local Control OFF for software lockout;
no hardware setting changes. Acoustic/direct or opaque recorded audio cannot
be scale-muted. Typed percussion is outside pitched admission; arbitrary custom
JavaScript may bypass shared APIs. Native shared send/ingress has simulations,
while independent three-port practice routing is Web MIDI only.

Audio practice is deliberate, local and monophonic. It may reject noise,
distortion, unstable bends or ambiguous octaves; chords require MIDI or a
clearly labeled arpeggio adaptation. Real latency calibration is manual and
unverified. PDFs/images/prose do not acquire invented notes. A persistent file
library and reviewed PDF recognition are queued in the
[post-1.0 roadmap](ROADMAP-AFTER-1.0.md), not implemented in this release.
