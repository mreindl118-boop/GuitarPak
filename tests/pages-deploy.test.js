// Execute the actual Pages workflow shell against disposable local bare repos.
// No GitHub, network, credentials, hardware or working-repository refs are used.
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
let checks = 0;
function ok(value, label) { if (!value) throw new Error(label); checks++; console.log('  PASS', label); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soundlab-pages-'));
const checkout = path.join(root, 'source'), remote = path.join(root, 'remote.git');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/pages.yml'), 'utf8');
const testWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/tests.yml'), 'utf8');
const step = workflow.slice(workflow.indexOf('      - name: Append main snapshot to gh-pages'));
const match = /        run: \|\n((?:          [^\n]*(?:\n|$)|\n)*)/.exec(step);
ok(!!match, 'the deployment test finds the actual named workflow script');
const script = match[1].split('\n').map(line => {
  if (!line.trim()) return '';
  if (!line.startsWith('          ')) throw new Error('Unexpected deployment-step indentation');
  return line.slice(10);
}).join('\n');
const realGit = spawnSync('bash', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
const baseEnv = Object.assign({}, process.env, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Local deployment test', GIT_AUTHOR_EMAIL: 'pages-test@example.invalid',
  GIT_COMMITTER_NAME: 'Local deployment test', GIT_COMMITTER_EMAIL: 'pages-test@example.invalid'
});
function command(bin, args, cwd = checkout, extra = {}) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', env: Object.assign({}, baseEnv, extra), maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error([bin, ...args].join(' ') + '\n' + (result.error || result.stderr || result.stdout));
  return result.stdout.trim();
}
function git(...args) { return command(realGit, args); }
function bare(...args) { return command(realGit, ['--git-dir=' + remote, ...args]); }
function deploy(extra = {}) { return spawnSync('bash', ['-c', script], { cwd: checkout, encoding: 'utf8', env: Object.assign({}, baseEnv, extra), maxBuffer: 4 * 1024 * 1024 }); }
function successful(result, label) { ok(result.status === 0 && !result.error, label + (result.status ? '\n' + result.stdout + result.stderr : '')); }
function put(name, content) { const full = path.join(checkout, name); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content); }
function saveSource(message) { git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-m', message); git('push', 'origin', 'main'); return git('rev-parse', 'HEAD'); }
function entries(ref) { return bare('ls-tree', '-r', '-z', ref).split('\0').filter(Boolean).sort(); }
function expectedTree(source) {
  return entries(source).filter(entry => entry.split('\t')[1] !== '.nojekyll')
    .concat('100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391\t.nojekyll').sort();
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function tip() { return bare('rev-parse', 'refs/heads/gh-pages'); }
function parent(commit) { return bare('rev-list', '--parents', '-n', '1', commit).split(' ').slice(1); }

try {
  ok(/uses: \.\/\.github\/workflows\/tests.yml/.test(workflow) && /source_ref: main/.test(workflow), 'manual and main-triggered deployments test main through the same reusable workflow');
  ok(/sync:\n\s+needs: test\n\s+if: \$\{\{ needs.test.result == 'success' \}\}/.test(workflow), 'deployment explicitly requires a successful full-suite test job');
  ok(/ref: \$\{\{ needs.test.outputs.source_sha \}\}/.test(workflow) && /source_sha:\n\s+description:[^\n]*\n\s+value: \$\{\{ jobs.test.outputs.source_sha \}\}/.test(testWorkflow), 'Pages checks out the exact successful test output, never a moving main ref');
  ok(/permissions:\n  contents: read/.test(workflow) && /sync:[\s\S]*permissions:\n\s+contents: write/.test(workflow) && /permissions:\n  contents: read/.test(testWorkflow), 'tests remain read-only while publication retains its existing contents-write scope');
  ok(/pull_request:/.test(testWorkflow) && !/pull_request_target|secrets: inherit/.test(testWorkflow) && /persist-credentials: false/.test(testWorkflow), 'PR tests use no privileged target event, inherited secrets or persisted checkout credential');
  ok(/playwright@1\.62\.1/.test(testWorkflow) && /node-version: '24'/.test(testWorkflow) && /playwright install --with-deps chromium/.test(testWorkflow), 'CI pins the locally verified Playwright version, Node 24 and its matching Chromium');
  ok(/run: bash tests\/run.sh[ \t]*\n/.test(testWorkflow) && !/tests\/run.sh[ \t]+\S|SL_SKIP|SKIP_UPDATE/.test(testWorkflow), 'CI invokes every default suite, including the existing file-protocol cases without a skip or bypass');
  ok(!/git\s+push[^\n]*(?:--force|\s-f(?:\s|$)|\s\+\S)/.test(script), 'the actual deployment script has no forced push or forced refspec');
  command('bash', ['-n', '-c', script], root);
  fs.mkdirSync(checkout);
  command(realGit, ['init', '--bare', '--initial-branch=main', remote], root);
  command(realGit, ['init', '--initial-branch=main', checkout], root);
  git('config', 'user.name', 'Local source test'); git('config', 'user.email', 'source-test@example.invalid');
  git('remote', 'add', 'origin', remote);
  put('index.html', '<main>first source</main>\n'); put('removed.txt', 'removed next deployment\n');
  put('nested/two words.txt', 'path with spaces\n'); put('nested/sample.bin', Buffer.from([0, 255, 1, 10]));
  put('.source-dotfile', 'tracked dotfile\n');
  const source1 = saveSource('source one'), index1 = git('ls-files', '--stage');
  bare('update-ref', 'refs/heads/archive/gh-pages', source1);
  successful(deploy(), 'first deployment creates gh-pages with an ordinary push');
  const deployed1 = tip();
  ok(parent(deployed1).length === 0, 'first deployment starts its own history without repointing main');
  ok(bare('rev-parse', 'refs/heads/archive/gh-pages') === source1, 'an unrelated branch ending in gh-pages is neither mistaken for nor changed with the exact deployment branch');
  ok(same(entries(deployed1), expectedTree(source1)), 'first snapshot exactly matches source files, binary bytes/modes, spaced paths and dotfiles, plus empty .nojekyll');
  ok(bare('rev-parse', 'refs/heads/main') === source1 && git('rev-parse', 'HEAD') === source1 && git('symbolic-ref', '--short', 'HEAD') === 'main', 'remote and local main stay at the original source commit');
  ok(index1 === git('ls-files', '--stage') && git('status', '--porcelain') === '', 'deployment leaves the source checkout and index untouched');

  fs.unlinkSync(path.join(checkout, 'removed.txt'));
  put('index.html', '<main>second source</main>\n'); put('js/new.js', 'window.newFeature = true;\n');
  put('nested/sample.bin', Buffer.from([0, 254, 2, 10, 13]));
  const source2 = saveSource('source two');
  put('staged-only.txt', 'not committed to source\n'); git('add', 'staged-only.txt');
  put('untracked-only.txt', 'not part of a deployment\n');
  const index2 = git('ls-files', '--stage'), status2 = git('status', '--porcelain');
  successful(deploy(), 'second deployment appends a snapshot');
  const deployed2 = tip();
  ok(same(parent(deployed2), [deployed1]), 'second deployment has the first deployment as its sole parent');
  ok(same(entries(deployed2), expectedTree(source2)) && !entries(deployed2).some(entry => /\t(?:removed|staged-only|untracked-only)\.txt$/.test(entry)), 'new source files and deletions mirror exactly without staged or untracked local files');
  ok(index2 === git('ls-files', '--stage') && status2 === git('status', '--porcelain'), 'temporary deployment index cannot disturb staged/untracked source work');
  ok(bare('rev-parse', 'refs/heads/main') === source2 && git('rev-parse', 'HEAD') === source2, 'deploying the second snapshot still leaves both main tips untouched');
  ok(bare('show', '-s', '--format=%B', deployed2).includes('Source-commit: ' + source2), 'deployment commit records exact source provenance for review or rollback');
  successful(deploy(), 'an already exact snapshot is a successful no-op');
  ok(tip() === deployed2, 'identical source does not add an unnecessary deployment commit');
  git('reset', '--', 'staged-only.txt'); fs.unlinkSync(path.join(checkout, 'staged-only.txt')); fs.unlinkSync(path.join(checkout, 'untracked-only.txt'));

  put('index.html', '<main>third source</main>\n'); const source3 = saveSource('source three');
  const race = bare('-c', 'commit.gpgsign=false', 'commit-tree', deployed2 + '^{tree}', '-p', deployed2, '-m', 'Concurrent deployment');
  const wrapperDir = path.join(root, 'git-wrapper'); fs.mkdirSync(wrapperDir);
  const once = path.join(root, 'race-once'), count = path.join(root, 'race-count'); fs.writeFileSync(once, 'pending');
  const wrapper = `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = push ]; then
  if [ -n "\${PAGES_RACE_ONCE:-}" ] && [ -f "$PAGES_RACE_ONCE" ]; then
    rm "$PAGES_RACE_ONCE"
    "$PAGES_REAL_GIT" --git-dir="$PAGES_TEST_REMOTE" update-ref refs/heads/gh-pages "$PAGES_RACE_COMMIT" "$PAGES_OLD_TIP"
    if [ -n "\${PAGES_RACE_MAIN:-}" ]; then
      "$PAGES_REAL_GIT" --git-dir="$PAGES_TEST_REMOTE" update-ref refs/heads/main "$PAGES_RACE_MAIN" "$PAGES_OLD_MAIN"
    fi
  elif [ -n "\${PAGES_RACE_COUNT:-}" ]; then
    n=0; if [ -f "$PAGES_RACE_COUNT" ]; then n=$(cat "$PAGES_RACE_COUNT"); fi
    n=$((n+1)); echo "$n" > "$PAGES_RACE_COUNT"
    previous=$("$PAGES_REAL_GIT" --git-dir="$PAGES_TEST_REMOTE" rev-parse refs/heads/gh-pages)
    tree=$("$PAGES_REAL_GIT" --git-dir="$PAGES_TEST_REMOTE" rev-parse "\${previous}^{tree}")
    next=$("$PAGES_REAL_GIT" --git-dir="$PAGES_TEST_REMOTE" -c commit.gpgsign=false commit-tree "$tree" -p "$previous" -m "Concurrent deployment $n")
    "$PAGES_REAL_GIT" --git-dir="$PAGES_TEST_REMOTE" update-ref refs/heads/gh-pages "$next" "$previous"
  fi
fi
exec "$PAGES_REAL_GIT" "$@"
`;
  fs.writeFileSync(path.join(wrapperDir, 'git'), wrapper, { mode: 0o755 });
  const racingEnv = { PATH: wrapperDir + path.delimiter + process.env.PATH, PAGES_REAL_GIT: realGit, PAGES_TEST_REMOTE: remote };
  const recovered = deploy(Object.assign({}, racingEnv, { PAGES_RACE_ONCE: once, PAGES_RACE_COMMIT: race, PAGES_OLD_TIP: deployed2 }));
  successful(recovered, 'a concurrently advanced target recovers with a fetched-parent retry');
  const deployed3 = tip();
  ok(!fs.existsSync(once) && /attempt 1 of 3/.test(recovered.stderr) && same(parent(deployed3), [race]), 'the raced first normal push is rejected; the successful retry preserves the concurrent deployment as parent');
  ok(same(entries(deployed3), expectedTree(source3)) && bare('merge-base', '--is-ancestor', deployed1, deployed3) === '', 'race recovery preserves prior history and the exact requested source tree');

  put('index.html', '<main>fourth source</main>\n'); const source4 = saveSource('source four');
  const exhausted = deploy(Object.assign({}, racingEnv, { PAGES_RACE_COUNT: count }));
  ok(exhausted.status !== 0 && fs.readFileSync(count, 'utf8').trim() === '3' && /after three attempts/.test(exhausted.stderr), 'three consecutive races fail closed after exactly three normal pushes');
  ok(same(entries(tip()), entries(deployed3)) && bare('merge-base', '--is-ancestor', deployed3, tip()) === '', 'exhausted retries preserve every concurrent commit and never replace its tree with a partial deployment');
  ok(bare('rev-parse', 'refs/heads/main') === source4 && git('rev-parse', 'HEAD') === source4 && git('status', '--porcelain') === '', 'successful and failed deployment paths leave source main and its checkout intact');
  const beforeSourceRace = tip(), newMain = bare('-c', 'commit.gpgsign=false', 'commit-tree', source4 + '^{tree}', '-p', source4, '-m', 'Main advances during deployment');
  const newerDeployment = bare('-c', 'commit.gpgsign=false', 'commit-tree', beforeSourceRace + '^{tree}', '-p', beforeSourceRace, '-m', 'Concurrent newer deployment');
  fs.writeFileSync(once, 'pending');
  const staleRace = deploy(Object.assign({}, racingEnv, { PAGES_RACE_ONCE: once, PAGES_RACE_COMMIT: newerDeployment,
    PAGES_OLD_TIP: beforeSourceRace, PAGES_RACE_MAIN: newMain, PAGES_OLD_MAIN: source4 }));
  ok(staleRace.status !== 0 && /refusing a stale deployment/.test(staleRace.stderr) && tip() === newerDeployment,
    'a retry after simultaneous main/gh-pages advancement refuses to append its older tested source');
  ok(bare('rev-parse', 'refs/heads/main') === newMain && git('rev-parse', 'HEAD') === source4,
    'stale-job rejection preserves both newer remote main and the original tested checkout');
  git('fetch', 'origin', 'main'); git('merge', '--ff-only', 'FETCH_HEAD');
  const beforeRollback = tip();
  git('revert', '--no-commit', source4); git('revert', '--no-commit', source3);
  const rollbackSource = saveSource('Restore reviewed source-two tree');
  successful(deploy(), 'a reviewed source revert deploys through the same ordinary workflow');
  ok(same(parent(tip()), [beforeRollback]) && same(entries(tip()), expectedTree(source2)) && bare('rev-parse', 'refs/heads/main') === rollbackSource,
    'rollback restores an earlier source tree with new main/deployment commits while retaining all deployment history');
  git('remote', 'set-url', 'origin', path.join(root, 'missing-remote.git'));
  const unavailable = deploy();
  ok(unavailable.status !== 0 && !/already contains/.test(unavailable.stdout), 'an unreachable remote is an error, never mistaken for an empty deployment branch');
  console.log('ALL PASS (' + checks + ' checks; local bare repositories only)');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
