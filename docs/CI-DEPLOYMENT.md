# Test and Pages deployment gate

The Pages workflow keeps the existing branch-based deployment and credentials.
It no longer force-pushes. Local deployment/release fixtures perform no remote
operations. A normal review-branch push of the implementation started hosted
CI before the publication hold below; this does not establish a main release.

**Current publication hold:** automatic approval review blocked creation of a
public non-draft PR, citing the earlier no-publication restriction. No PR was
created. Explicit approval is pending; main/tag/release and the publisher
handoff below remain on hold. Preparing these local workflows does not bypass
that denial or authorize another remote route.

## Required test job

`.github/workflows/tests.yml` runs on pull requests, pushes to the review branch,
manual dispatch, and reusable calls. Every push to `main` invokes this same
workflow through the Pages workflow, avoiding a duplicate standalone main job.
It uses Ubuntu, Node 24, and the locally verified **Playwright 1.62.1**. Dependencies
install under the runner's temporary directory; Playwright installs its matching
Chromium and required system packages. `NODE_PATH` and `CHROMIUM` point to that
installation. It then runs **`bash tests/run.sh` with no suite exclusions**.
The job allows thirty minutes: the first cold hosted run spent nine minutes
installing system/browser dependencies and another nine running all suites.
Increasing that deadline does not skip or relax any assertion.
The [official Playwright CI guide](https://playwright.dev/docs/ci-intro) documents
the browser/dependency installation used here; the
[setup-node v4 documentation](https://github.com/actions/setup-node/blob/v4/README.md)
documents the explicit Node version input.

The test job has `contents: read`, does not inherit secrets, and disables persisted
checkout credentials. Pull requests use `pull_request`, never the privileged
`pull_request_target` event. The Pages sync and conditional release jobs use the
already existing `contents: write` scope. No stored token, repository security setting, protected-branch
rule, billing option or credential scope was changed. The
[checkout v4 documentation](https://github.com/actions/checkout/blob/v4/README.md)
describes its credential persistence option.

The reusable workflow exports the exact tested commit SHA. Pages sync has
`needs: test` and a successful-result condition, then checks out that exported
SHA. A failed or canceled suite therefore prevents deployment; a moving `main`
ref cannot substitute an untested checkout. This follows GitHub's documented
[reusable workflow output mapping](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#using-outputs-from-a-reusable-workflow).

## Deployment and recovery

After tests pass, the existing main-push/manual Pages workflow:

1. Builds the tested source tree in a temporary Git index and adds an empty
   `.nojekyll`. Source additions, binary files, dotfiles and deletions are exact;
   staged/untracked working files are excluded.
2. Fetches the exact `gh-pages` branch and creates a deployment commit with its
   current tip as the sole parent. The source checkout, index and main branch
   remain unchanged. The commit records `Source-commit: <tested SHA>`.
3. Uses an ordinary push. A changed deployment tip causes rejection, followed
   by a fresh fetch/rebuilt-parent attempt, at most three attempts total.
   An identical tree is a successful no-op. An unreachable remote fails rather
   than being treated as an absent branch.
4. Rechecks the observed main tip before each attempt and immediately before
   pushing. A changed main tip stops the stale job; its replacement must pass
   tests. These client checks do not lock both remote refs atomically; the
   normal push protects deployment history independently.

For rollback, create reviewed revert commit(s) restoring the known good source
tree on main through the authorized normal review/release path. The same full
test gate then appends a new deployment commit containing that restored tree.
Do not reset either published branch or force-push. A failed deployment can be
retried with the existing manual Pages action; it still runs the entire gate.

## Actual Pages publication and immutable release

The sync job's successful push proves preservation of `gh-pages`, **not a
completed Pages build**. GitHub documents that pushes made with the built-in
[`GITHUB_TOKEN` do not trigger a Pages build](https://docs.github.com/en/actions/concepts/security/github_token).
The pre-existing deployment workflow had the same limitation. No new secret,
credential, `pages: write`, `id-token` or other permission scope is introduced
to bypass it.

After the publication hold is cleared and the agreed gates pass, the existing
authorized publisher must trigger the branch-based Pages build. The connected
GitHub App can append an
ordinary commit with the exact tested snapshot tree and the current gh-pages
parent. This handoff preserves history and uses the App's already granted
access. It is distinct from changing credentials or enabling another hosting
service. If that existing publisher cannot complete the handoff, publication
remains blocked rather than treating the workflow push as site deployment.

Only after tests and sync succeed can the release job run. Before creating
either a new tag or release, it waits up to ten minutes, polling every five
seconds, for public `version.json`, index, service worker, manifest and every
local script/stylesheet referenced by the tested index to match the checkout's
SHA-256 bytes. These requests carry no credentials and revalidate/cache-bust the
responses. Stale, missing or inaccessible files fail closed. This independently
observes the publisher handoff instead of assuming that a successful push
triggered a build.

For web version **1.0.0** only, the job verifies the exact tested checkout and
unchanged main tip. It creates an annotated `v1.0.0` with an ordinary push only
if the remote tag is absent, then uses the same built-in workflow token to
create the GitHub release with `--verify-tag`, the exact tested SHA and
`docs/RELEASE-NOTES-1.0.0.md`. Existing tags are fetched/peeled and never moved.
A mismatched tag, orphan release, draft/prerelease or failed release-API read
requires review and is never overwritten. An already published release at the
same verified tag is preserved unchanged; this no-op does not re-verify the
current site's later state. An uncertain create response fails the job, and a
rerun checks existing remote state before attempting another mutation.

## Evidence and remaining release gates

`tests/pages-deploy.test.js` extracts and executes the actual workflow shell
against disposable local bare repositories. It checks exact trees, source/index
preservation, deletion handling, source provenance, fast-forward history,
concurrent deployment retries, exhausted retries, a simultaneous main/deployment
race, and a normal source-revert rollback. It also checks the test dependency,
tested-SHA wiring, pinned tools and reduced test permissions. No network remote
is used by this suite.

`tests/release-workflow.test.js` executes the actual release shell against local
Git and mocked `gh`/public HTTP/clock tools. It checks dependency wiring, scope,
exact tag/notes, readiness byte matching and exhaustion, stale main, immutable
existing tags/releases, API errors, retries and uncertain response recovery.
It performs no real HTTP or GitHub publication.

Local checks do not establish a successful hosted Actions run. Publication still
requires the requested feature work, review and software checks to be complete.
The managed cloud browser previously blocked two existing update-suite
`file://` navigations with `net::ERR_BLOCKED_BY_ADMINISTRATOR`; this workflow
does not skip or rewrite them, change browser policy, or treat them as passed.
GitHub-hosted Chromium must run those cases through the ordinary full suite.

MIDI/device tests use simulated ports and audio fixtures. They do not verify a
physical LUMI program, RGB appearance, octave alignment, Local Control, external
synth sound or real microphone/instrument performance. See
[the palette/profile evidence](NOTE-PALETTE.md),
[guided practice](LUMI-PRACTICE.md), and the validation report for those limits.
