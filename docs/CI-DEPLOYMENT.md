# Test and Pages deployment gate

The Pages workflow keeps the existing branch-based deployment and credentials.
It no longer force-pushes. No remote workflow, push or deployment was run while
authoring this change in the cloud workspace.

## Required test job

`.github/workflows/tests.yml` runs on pull requests, pushes to the review branch,
manual dispatch, and reusable calls. Every push to `main` invokes this same
workflow through the Pages workflow, avoiding a duplicate standalone main job.
It uses Ubuntu, Node 24, and the locally verified **Playwright 1.62.1**. Dependencies
install under the runner's temporary directory; Playwright installs its matching
Chromium and required system packages. `NODE_PATH` and `CHROMIUM` point to that
installation. It then runs **`bash tests/run.sh` with no suite exclusions**.
The [official Playwright CI guide](https://playwright.dev/docs/ci-intro) documents
the browser/dependency installation used here; the
[setup-node v4 documentation](https://github.com/actions/setup-node/blob/v4/README.md)
documents the explicit Node version input.

The test job has `contents: read`, does not inherit secrets, and disables persisted
checkout credentials. Pull requests use `pull_request`, never the privileged
`pull_request_target` event. Only the Pages sync job retains the already existing
`contents: write` scope. No token, repository security setting, protected-branch
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

## Evidence and remaining release gates

`tests/pages-deploy.test.js` extracts and executes the actual workflow shell
against disposable local bare repositories. It checks exact trees, source/index
preservation, deletion handling, source provenance, fast-forward history,
concurrent deployment retries, exhausted retries, a simultaneous main/deployment
race, and a normal source-revert rollback. It also checks the test dependency,
tested-SHA wiring, pinned tools and reduced test permissions. No network remote
is used by this suite.

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
