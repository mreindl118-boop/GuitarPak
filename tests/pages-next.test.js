// Execute the actual 2.0 beta deployment shell (pages-next.yml) against
// disposable local bare repos. No GitHub, network, credentials or working-
// repository refs are used. The beta must replace ONLY next/ on gh-pages.
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
let checks = 0;
function ok(value, label) { if (!value) throw new Error(label); checks++; console.log('  PASS', label); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soundlab-pages-next-'));
const checkout = path.join(root, 'source'), remote = path.join(root, 'remote.git');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/pages-next.yml'), 'utf8');
const liveWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/pages.yml'), 'utf8');
const step = workflow.slice(workflow.indexOf('      - name: Replace next/ on gh-pages with the tested v2 snapshot'));
const match = /        run: \|\n((?:          [^\n]*(?:\n|$)|\n)*)/.exec(step);
ok(!!match, 'the beta deployment test finds the actual named workflow script');
const script = match[1].split('\n').map(line => {
  if (!line.trim()) return '';
  if (!line.startsWith('          ')) throw new Error('Unexpected deployment-step indentation');
  return line.slice(10);
}).join('\n');
const realGit = spawnSync('bash', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
const baseEnv = Object.assign({}, process.env, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Local beta deployment test', GIT_AUTHOR_EMAIL: 'pages-next-test@example.invalid',
  GIT_COMMITTER_NAME: 'Local beta deployment test', GIT_COMMITTER_EMAIL: 'pages-next-test@example.invalid'
});
function command(bin, args, cwd = checkout, extra = {}, input) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', env: Object.assign({}, baseEnv, extra), maxBuffer: 4 * 1024 * 1024, input });
  if (result.error || result.status !== 0) throw new Error([bin, ...args].join(' ') + '\n' + (result.error || result.stderr || result.stdout));
  return result.stdout.trim();
}
function git(...args) { return command(realGit, args); }
function bare(...args) { return command(realGit, ['--git-dir=' + remote, ...args]); }
function bareIn(input, ...args) { return command(realGit, ['--git-dir=' + remote, ...args], checkout, {}, input); }
function deploy(extra = {}) { return spawnSync('bash', ['-c', script], { cwd: checkout, encoding: 'utf8', env: Object.assign({}, baseEnv, extra), maxBuffer: 4 * 1024 * 1024 }); }
function successful(result, label) { ok(result.status === 0 && !result.error, label + (result.status ? '\n' + result.stdout + result.stderr : '')); }
function put(name, content) { const full = path.join(checkout, name); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content); }
function save(branch, message) { git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-m', message); git('push', 'origin', branch); return git('rev-parse', 'HEAD'); }
function entries(ref) { return bare('ls-tree', '-r', '-z', ref).split('\0').filter(Boolean).sort(); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const outsideNext = list => list.filter(entry => !/\tnext\//.test(entry));
const insideNext = list => list.filter(entry => /\tnext\//.test(entry));
function tip() { return bare('rev-parse', 'refs/heads/gh-pages'); }
function parent(commit) { return bare('rev-list', '--parents', '-n', '1', commit).split(' ').slice(1); }

try {
  ok(/on:\n\s+push:\n\s+branches: \[v2\]/.test(workflow) && /uses: \.\/\.github\/workflows\/tests.yml/.test(workflow) && /source_ref: v2/.test(workflow), 'the beta deploys only from v2 and tests v2 through the same reusable workflow as the live site');
  ok(/sync:\n\s+needs: test\n\s+if: \$\{\{ needs.test.result == 'success' \}\}/.test(workflow) && /ref: \$\{\{ needs.test.outputs.source_sha \}\}/.test(workflow), 'the beta deployment requires a successful full-suite run and checks out that exact commit');
  ok(/permissions:\n  contents: read/.test(workflow) && /sync:[\s\S]*permissions:\n\s+contents: write/.test(workflow), 'only the beta sync job can write');
  ok(/group: pages-next/.test(workflow) && !/group: pages-sync/.test(workflow) && /group: pages-sync/.test(liveWorkflow), 'the beta has its own concurrency group, so neither deployment cancels the other');
  ok(!/git\s+push[^\n]*(?:--force|\s-f(?:\s|$)|\s\+\S)/.test(script), 'the beta deployment script has no forced push or forced refspec');
  ok(!/refs\/heads\/main/.test(script), 'the beta script never reads or writes main');
  command('bash', ['-n', '-c', script], root);

  fs.mkdirSync(checkout);
  command(realGit, ['init', '--bare', '--initial-branch=main', remote], root);
  command(realGit, ['init', '--initial-branch=main', checkout], root);
  git('config', 'user.name', 'Local source test'); git('config', 'user.email', 'source-test@example.invalid');
  git('remote', 'add', 'origin', remote);
  put('index.html', '<main>live 1.x</main>\n'); put('js/app.js', 'window.live = true;\n'); put('nested/two words.txt', 'spaces\n');
  const live = save('main', 'live source');

  // gh-pages as the live deployment leaves it: the live tree, .nojekyll and a stale beta under next/.
  const nojekyll = bareIn('', 'hash-object', '-w', '--stdin');
  const staleBlob = bareIn('<main>stale beta</main>\n', 'hash-object', '-w', '--stdin');
  const staleDir = bareIn('100644 blob ' + staleBlob + '\tindex.html\0100644 blob ' + staleBlob + '\told.txt\0', 'mktree', '-z');
  const liveTop = bare('ls-tree', '-z', live).split('\0').filter(Boolean);
  const pagesTree = bareIn(liveTop.concat('100644 blob ' + nojekyll + '\t.nojekyll', '040000 tree ' + staleDir + '\tnext').join('\0') + '\0', 'mktree', '-z');
  const pages1 = bare('-c', 'commit.gpgsign=false', 'commit-tree', pagesTree, '-m', 'pages: snapshot main @ ' + live);
  bare('update-ref', 'refs/heads/gh-pages', pages1);

  // v2 = the 2.0 source: a changed page, a new file, a deleted file.
  git('checkout', '-b', 'v2');
  put('index.html', '<main>2.0 beta</main>\n'); put('css/tokens.css', ':root { --sl-accent: #ffab47; }\n');
  fs.unlinkSync(path.join(checkout, 'js/app.js'));
  const source1 = save('v2', '2.0 source one'), index1 = git('ls-files', '--stage');

  successful(deploy(), 'the beta deploys with an ordinary push onto the existing gh-pages');
  const deployed1 = tip();
  ok(same(parent(deployed1), [pages1]), 'the beta deployment is appended to the live deployment history');
  ok(same(outsideNext(entries(deployed1)), outsideNext(entries(pages1))), 'nothing outside next/ changes: the live app and .nojekyll are untouched');
  const marker = bareIn('{"channel":"beta","branch":"v2","source":"' + source1 + '"}\n', 'hash-object', '-w', '--stdin');
  const expectedNext = entries(source1).map(entry => entry.replace('\t', '\tnext/')).concat('100644 blob ' + marker + '\tnext/beta.json').sort();
  ok(same(insideNext(entries(deployed1)), expectedNext), 'next/ is exactly the tested v2 tree (edits, additions, deletions) plus beta.json naming the source commit');
  ok(!entries(deployed1).some(entry => /\tnext\/old\.txt$/.test(entry)), 'the stale beta is replaced, not merged');
  ok(bare('show', '-s', '--format=%B', deployed1).includes('Source-commit: ' + source1), 'the beta deployment commit records exact source provenance');
  ok(bare('rev-parse', 'refs/heads/main') === live && bare('rev-parse', 'refs/heads/v2') === source1 && git('rev-parse', 'HEAD') === source1 && git('symbolic-ref', '--short', 'HEAD') === 'v2', 'main, v2 and the checkout stay where they were');
  ok(index1 === git('ls-files', '--stage') && git('status', '--porcelain') === '', 'the temporary deployment index leaves the source checkout untouched');

  const repeat = deploy();
  successful(repeat, 'an already published snapshot is a successful no-op');
  ok(tip() === deployed1 && /already carries/.test(repeat.stdout), 'an identical v2 source adds no deployment commit');

  const movedV2 = bare('-c', 'commit.gpgsign=false', 'commit-tree', source1 + '^{tree}', '-p', source1, '-m', 'v2 advances during deployment');
  bare('update-ref', 'refs/heads/v2', movedV2, source1);
  const stale = deploy();
  ok(stale.status !== 0 && /refusing a stale beta deployment/.test(stale.stderr) && tip() === deployed1, 'a v2 that moved past the tested commit is refused, and gh-pages is unchanged');
  bare('update-ref', 'refs/heads/v2', source1, movedV2);

  bare('update-ref', '-d', 'refs/heads/gh-pages', deployed1);
  const noLive = deploy();
  ok(noLive.status !== 0 && !bare('for-each-ref', 'refs/heads/gh-pages'), 'without a live gh-pages the beta fails closed and never creates the branch itself');
  bare('update-ref', 'refs/heads/gh-pages', deployed1);

  git('remote', 'set-url', 'origin', path.join(root, 'missing-remote.git'));
  const unavailable = deploy();
  ok(unavailable.status !== 0 && !/already carries/.test(unavailable.stdout), 'an unreachable remote is an error, never mistaken for a no-op');
  console.log('ALL PASS (' + checks + ' checks; local bare repositories only)');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
