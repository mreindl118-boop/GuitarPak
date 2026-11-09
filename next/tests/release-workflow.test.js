// Actual release-job shell, isolated local Git repositories and mocked gh/curl.
// No real HTTP, GitHub credentials, tags, releases or repository refs are used.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
let checks = 0;
function ok(value, label) { if (!value) throw new Error(label); checks++; console.log('  PASS', label); }
const repo = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(repo, '.github/workflows/pages.yml'), 'utf8');
const step = workflow.slice(workflow.indexOf('      - name: Publish immutable web 1.0.0 release'));
const match = /        run: \|\n((?:          [^\n]*(?:\n|$)|\n)*)/.exec(step);
ok(!!match, 'test extracts the actual immutable-release workflow shell');
const script = match[1].split('\n').map(line => line.startsWith('          ') ? line.slice(10) : '').join('\n');
const notes = fs.readFileSync(path.join(repo, 'docs/RELEASE-NOTES-1.0.0.md'), 'utf8');
const notesHash = crypto.createHash('sha256').update(notes).digest('hex');
const index = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const scriptAssets = [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1]);
const styleAssets = [...index.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]).filter(tag=>/\brel=["']stylesheet["']/i.test(tag)).map(tag=>(/\bhref=["']([^"']+)["']/i.exec(tag)||[])[1]).filter(Boolean);
const assets = [...new Set(['version.json','index.html','sw.js','manifest.webmanifest'].concat(scriptAssets,styleAssets))];
const realGit = spawnSync('bash', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
const fixtures = [];
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soundlab-release-'));
  fixtures.push(root);
  const checkout = path.join(root, 'source'), remote = path.join(root, 'remote.git'), bin = path.join(root, 'bin'), stateFile = path.join(root, 'state.json');
  fs.mkdirSync(checkout); fs.mkdirSync(bin);
  const base = Object.assign({}, process.env, { GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Release fixture', GIT_AUTHOR_EMAIL: 'release-test@example.invalid',
    GIT_COMMITTER_NAME: 'Release fixture', GIT_COMMITTER_EMAIL: 'release-test@example.invalid' });
  function exec(args, cwd = checkout) {
    const result = spawnSync(realGit, args, { cwd, encoding: 'utf8', env: base });
    if (result.status !== 0 || result.error) throw new Error(result.error || result.stderr);
    return result.stdout.trim();
  }
  const git = (...args) => exec(args), bare = (...args) => exec(['--git-dir=' + remote, ...args]);
  exec(['init', '--bare', '--initial-branch=main', remote], root); exec(['init', '--initial-branch=main', checkout], root);
  git('config', 'user.name', 'Release fixture'); git('config', 'user.email', 'release-test@example.invalid'); git('remote', 'add', 'origin', remote);
  function put(name, text) { const file = path.join(checkout, name); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, text); }
  assets.forEach(name => put(name, '// local public-source fixture: ' + name + '\n'));
  put('version.json', JSON.stringify({version:'0.75.0',web:'0.82.0'})); put('docs/RELEASE-NOTES-1.0.0.md', notes);
  git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Prior source'); const prior = git('rev-parse', 'HEAD');
  put('version.json', JSON.stringify({version:'0.75.0',web:options.web || '1.0.0'}));
  put('index.html', index);
  git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Tested release'); const sha = git('rev-parse', 'HEAD');
  git('push', 'origin', 'main');
  const initial = { sha, clock:1000, clockScale:options.clockScale || 1, calls:[], sleeps:[], release:options.release || '',
    curl:options.curl || 'match', staleAsset:options.staleAsset || 'version.json', transient:options.transient || 0,
    apiError:!!options.apiError, createAfterFailure:!!options.createAfterFailure, notesHash, notesFile:'docs/RELEASE-NOTES-1.0.0.md' };
  fs.writeFileSync(stateFile, JSON.stringify(initial));
  const mock = `#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const tool=path.basename(process.argv[1]),args=process.argv.slice(2),file=process.env.RELEASE_TEST_STATE;
const s=JSON.parse(fs.readFileSync(file,'utf8')); const save=()=>fs.writeFileSync(file,JSON.stringify(s));
const fail=m=>{console.error(m);save();process.exit(1);};
if(tool==='date'){process.stdout.write(String(s.clock)+'\\n');process.exit(0);}
if(tool==='sleep'){s.sleeps.push(Number(args[0]));s.clock+=Number(args[0])*s.clockScale;save();process.exit(0);}
s.calls.push({tool,args});
if(tool==='curl'){
 const url=new URL(args[args.length-1]),asset=url.pathname.replace(/^\\/GuitarPak\\//,''),out=args[args.indexOf('--output')+1];
 if(url.protocol!=='https:'||url.host!=='mreindl118-boop.github.io'||url.searchParams.get('source')!==s.sha||!url.searchParams.has('probe'))fail('bad public probe destination/source');
 if(args.some(x=>/Authorization:|workflow-token-fixture/.test(x)))fail('public probe must not transmit workflow credentials');
 if(!args.includes('Cache-Control: no-cache')||!args.includes('Pragma: no-cache'))fail('probe must revalidate public bytes');
 if(s.curl==='offline')fail('mock public HTTP unavailable');
 if(s.transient>0){s.transient--;fs.writeFileSync(out,'stale cached version');}
 else if(s.curl==='stale'&&asset===s.staleAsset)fs.writeFileSync(out,'stale critical asset');
 else fs.copyFileSync(path.join(process.env.RELEASE_TEST_CHECKOUT,asset),out);
 save();process.exit(0);
}
if(tool!=='gh')fail('unsupported mock tool');
if(process.env.GH_TOKEN!=='workflow-token-fixture')fail('fixture token missing');
if(args[0]==='api'){
 if(s.apiError)fail('mock API authorization failure');
 if(!args.includes('--paginate')||!args[1]||!args.some(a=>a.includes('releases?per_page=100')))fail('release lookup must paginate');
 if(s.release)process.stdout.write(s.release==='published'?'published\\n':'needs-review\\n');save();process.exit(0);
}
if(args[0]!=='release'||args[1]!=='create'||args[2]!=='v1.0.0')fail('only exact release creation is allowed');
if(s.release)fail('release already exists');
const get=k=>args[args.indexOf(k)+1];
if(!args.includes('--verify-tag')||get('--target')!==s.sha||get('--repo')!=='fixture/soundlab'||get('--notes-file')!==s.notesFile)fail('release must pin tag, tested source and committed notes');
const tag=cp.spawnSync(process.env.RELEASE_TEST_GIT,['--git-dir='+process.env.RELEASE_TEST_REMOTE,'rev-parse','refs/tags/v1.0.0^{}'],{encoding:'utf8'});
if(tag.status!==0||tag.stdout.trim()!==s.sha)fail('release tag target is unverified');
const text=fs.readFileSync(path.join(process.env.RELEASE_TEST_CHECKOUT,s.notesFile));
if(crypto.createHash('sha256').update(text).digest('hex')!==s.notesHash)fail('notes changed');
s.release='published';save();if(s.createAfterFailure)process.exit(1);process.stdout.write('https://example.invalid/releases/v1.0.0\\n');
`;
  ['gh','curl','date','sleep'].forEach(tool => fs.writeFileSync(path.join(bin, tool), mock, {mode:0o755}));
  const env = Object.assign({}, base, {PATH:bin+path.delimiter+process.env.PATH, GH_TOKEN:'workflow-token-fixture', GH_REPO:'fixture/soundlab', TESTED_SHA:sha,
    PAGES_URL:'https://mreindl118-boop.github.io/GuitarPak/', RELEASE_TEST_STATE:stateFile, RELEASE_TEST_REMOTE:remote,
    RELEASE_TEST_CHECKOUT:checkout, RELEASE_TEST_GIT:realGit });
  return {root,checkout,remote,sha,prior,git,bare,put,
    read:()=>JSON.parse(fs.readFileSync(stateFile,'utf8')),
    run:(extra={})=>spawnSync('bash',['-c',script],{cwd:checkout,encoding:'utf8',env:Object.assign({},env,extra),maxBuffer:4*1024*1024}),
    tag(target=sha){git('-c','tag.gpgsign=false','tag','--annotate','v1.0.0',target,'-m','Existing immutable tag');git('push','origin','refs/tags/v1.0.0:refs/tags/v1.0.0');},
    tags:()=>bare('for-each-ref','--format=%(refname):%(objectname)','refs/tags/')};
}
const creates = f => f.read().calls.filter(c => c.tool==='gh'&&c.args[0]==='release'&&c.args[1]==='create');
function success(r,label){ok(r.status===0&&!r.error,label+(r.status?'\n'+r.stdout+r.stderr:''));}
try {
  const releaseJob = workflow.slice(workflow.indexOf('  release:\n'));
  ok(/needs: \[test, sync\]/.test(releaseJob) && /needs.test.result == 'success' && needs.sync.result == 'success'/.test(releaseJob), 'failed/canceled test or Pages-sync jobs cannot enter the release job');
  ok(/ref: \$\{\{ needs.test.outputs.source_sha \}\}/.test(releaseJob) && /TESTED_SHA: \$\{\{ needs.test.outputs.source_sha \}\}/.test(releaseJob), 'release checkout and target both come from the successful exact test SHA');
  ok(/GH_TOKEN: \$\{\{ github.token \}\}/.test(releaseJob) && /contents: write/.test(releaseJob) && !/secrets\.|pages: write|id-token: write|actions: write/.test(releaseJob), 'release uses only the existing built-in token and contents-write scope');
  ok(!/git\s+(?:push[^\n]*(?:--force|\s-f(?:\s|$)|\s\+\S)|tag[^\n]*(?:--force|--delete|\s-[fd](?:\s|$)))|gh release (?:edit|delete)/.test(script), 'actual release script never force-pushes, retags, deletes or edits an existing release');
  ok(/\+ 600/.test(script) && /remaining < 5 \? remaining : 5/.test(script), 'public readiness has a ten-minute deadline and bounded five-second polls');
  ok(/GITHUB_TOKEN branch push does not trigger a Pages build/.test(script), 'workflow explicitly records the required independent publisher handoff');
  ok(spawnSync('bash',['-n','-c',script]).status===0,'actual release shell passes bash syntax validation');
  {
    const f=fixture(), before=f.git('ls-files','--stage'); success(f.run(),'matching public bytes permit the first release');
    ok(f.bare('cat-file','-t','refs/tags/v1.0.0')==='tag'&&f.bare('rev-parse','refs/tags/v1.0.0^{}')===f.sha,'first release creates an annotated tag at the exact tested commit');
    ok(creates(f).length===1&&f.read().release==='published','release creation occurs once with verified tag, exact target and committed notes');
    const probes=f.read().calls.filter(c=>c.tool==='curl').map(c=>new URL(c.args.at(-1)).pathname.replace('/GuitarPak/',''));
    ok(JSON.stringify(probes)===JSON.stringify(assets),'version/index/SW/manifest and every local script/stylesheet must match actual tested bytes');
    ok(f.git('rev-parse','HEAD')===f.sha&&f.bare('rev-parse','refs/heads/main')===f.sha&&before===f.git('ls-files','--stage')&&f.git('status','--porcelain')==='','publication leaves source main, checkout and index intact');
    const tag=f.tags(), calls=f.read().calls.length; success(f.run(),'existing matching published release is an idempotent no-op');
    ok(f.tags()===tag&&creates(f).length===1&&f.read().calls.slice(calls).every(c=>c.tool!=='curl'),'already published matching release is preserved without re-tagging, editing notes or repeating readiness probes');
  }
  {
    const f=fixture();f.tag();const tag=f.tags();success(f.run(),'a matching existing tag can publish its first release');
    ok(f.tags()===tag&&creates(f).length===1,'matching existing tag object is preserved verbatim');
  }
  for(const release of ['', 'published']){
    const f=fixture({release});f.tag(f.prior);const tag=f.tags(),r=f.run();
    ok(r.status!==0&&/different commit/.test(r.stderr)&&f.tags()===tag&&creates(f).length===0,'wrong existing tag fails closed without moving it'+(release?' even when a release already exists':''));
  }
  {
    const f=fixture({release:'published'}),r=f.run();ok(r.status!==0&&f.tags()===''&&creates(f).length===0,'orphan existing release without a verified tag needs review and creates nothing');
    const d=fixture({release:'draft'});d.tag();const tag=d.tags();ok(d.run().status!==0&&d.tags()===tag&&creates(d).length===0,'existing draft/prerelease is never silently published or edited');
  }
  {
    const f=fixture({apiError:true}),r=f.run();ok(r.status!==0&&f.tags()===''&&creates(f).length===0,'API/credential failure is not mistaken for release absence');
  }
  for(const options of [{curl:'stale',staleAsset:'js/performance-engine.js',clockScale:120},{curl:'offline',clockScale:120}]){
    const f=fixture(options),r=f.run();ok(r.status!==0&&/within ten minutes/.test(r.stderr)&&f.tags()===''&&creates(f).length===0,
      options.curl==='stale'?'current version with stale engine bytes cannot create a tag or release':'inaccessible public Pages cannot create a tag or release');
    ok(f.read().sleeps[0]===5&&f.read().clock===1600,'fake clock proves readiness exhaustion without real waiting or security-policy changes');
  }
  {
    const f=fixture({transient:2});success(f.run(),'readiness retries ordinary stale-cache responses until all files match');
    ok(f.read().sleeps.join()==='5,5'&&creates(f).length===1,'transient retries use five-second polling before a single release creation');
  }
  {
    const f=fixture(), next=f.bare('-c','commit.gpgsign=false','commit-tree',f.sha+'^{tree}','-p',f.sha,'-m','Main advances after tests');
    f.bare('update-ref','refs/heads/main',next,f.sha);const r=f.run();
    ok(r.status!==0&&/main moved/.test(r.stderr)&&f.tags()===''&&creates(f).length===0&&f.bare('rev-parse','refs/heads/main')===next,
      'a newer remote main stops stale release creation without moving main or tagging an untested replacement');
  }
  {
    const f=fixture({web:'1.0.1'});success(f.run(),'other web versions skip this one-time v1.0.0 publisher');
    ok(f.tags()===''&&f.read().calls.length===0,'non-1.0 source performs no HTTP, release API or tag operation');
    const m=fixture(),r=m.run({TESTED_SHA:m.prior});ok(r.status!==0&&m.tags()===''&&m.read().calls.length===0,'checkout/tested-SHA mismatch fails before publication probes');
    const n=fixture();n.put('docs/RELEASE-NOTES-1.0.0.md','');ok(n.run().status!==0&&n.tags()===''&&n.read().calls.length===0,'missing/empty committed notes fail before tag or release creation');
  }
  {
    const f=fixture({createAfterFailure:true}),r=f.run();ok(r.status!==0&&f.read().release==='published','uncertain create response reports failure rather than assuming success');
    const tag=f.tags();success(f.run(),'rerun checks an uncertain release outcome before any new mutation');
    ok(f.tags()===tag&&creates(f).length===1,'an already accepted release is not recreated or retagged after response failure');
  }
  console.log('ALL PASS ('+checks+' checks; local Git and mocked gh/curl only)');
}finally{fixtures.forEach(root=>fs.rmSync(root,{recursive:true,force:true}));}
