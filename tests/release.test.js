// Release/update behavior and actual offline loading. No real MIDI or audio device access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require('playwright'),env=require('./env');let passed=0;
function ok(c,m){assert.ok(c,m);passed++;console.log('  PASS '+m);}
(async()=>{
 const source=fs.readFileSync(path.join(env.ROOT,'sw.js'),'utf8'),events={},deleted=[];let waiting;
 const cached=[],lookups=[];
 vm.runInNewContext(source,{self:{addEventListener:(n,f)=>events[n]=f,skipWaiting:()=>Promise.resolve(),clients:{claim:()=>Promise.resolve()},location:{origin:'http://127.0.0.1'}},
  caches:{keys:()=>Promise.resolve(['guitarlab-v110','guitarlab-v111','guitarlab-v112','other-app-kept']),delete:k=>{deleted.push(k);return Promise.resolve(true)},match:()=>{throw new Error('Global lookup could select an unrelated cache')},open:name=>Promise.resolve({addAll:items=>{cached.push(...items);return Promise.resolve()},match:()=>{lookups.push(name);return Promise.resolve('current-soundlab-response')}})},
  Request:function(url){this.url=url},Promise});
 events.activate({waitUntil:p=>waiting=p});await waiting;
 ok(deleted.join('|')==='guitarlab-v110|guitarlab-v111','activation removes only older soundLAB caches');
 events.install({waitUntil:p=>waiting=p});await waiting;
 events.fetch({request:{method:'GET',url:'http://127.0.0.1/index.html'},respondWith:p=>waiting=p});
 ok(await waiting==='current-soundlab-response'&&lookups.join('|')==='guitarlab-v112','fetch uses current soundLAB cache even when another app preserves the same URL');
 const assets=cached.map(x=>x.url);
 for(const file of ['js/midihub.js','js/lumi-practice.js','js/helix-stadium.js','js/score.js','js/music-library.js','js/release-notes.js','css/lumi-practice.css','css/helix-stadium.css','css/score.css','css/music-library.css']){
  ok(assets.includes(file)&&fs.existsSync(path.join(env.ROOT,file)),'offline install contains '+file);
 }
 const feed=JSON.parse(fs.readFileSync(path.join(env.ROOT,'version.json'),'utf8'));
 ok(feed.web==='0.78.0'&&feed.version==='0.75.0','web0.78.0 leaves actual APK channel0.75.0 unchanged');
 const b=await chromium.launch({executablePath:env.CHROMIUM});
 try{
  const ctx=await b.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true});
  await ctx.addInitScript(()=>{['help.seen','help.done','qz.landed'].forEach(k=>localStorage.setItem('guitarlab.'+k,'true'));navigator.requestMIDIAccess=()=>Promise.reject(new Error('No physical MIDI in release tests'));});
  await ctx.route('https://raw.githubusercontent.com/mreindl118-boop/GuitarPak/main/version.json',r=>r.fulfill({json:feed}));
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(env.URL);await page.waitForFunction(()=>window.App&&App.active&&window.SLReleaseNotes);
  ok(await page.locator('#sl-release-notice').count()===1,'new minor release shows a nonblocking notice');
  await page.locator('#sl-release-notice button').last().click();await page.reload();await page.waitForFunction(()=>window.App&&App.active);
  ok(await page.locator('#sl-release-notice').count()===0,'dismissed minor notice stays dismissed after reload');
  await page.evaluate(()=>App.switchTo('settings'));await page.locator('#sl-release-open').click();
  ok(await page.locator('#sl-release-history').evaluate(x=>x.open),'release history remains reachable from Settings');
  const history=await page.locator('#sl-release-history').innerText();
  ok(history.includes('0.78.0')&&history.includes('0.77.2')&&history.includes('experimental'),'history preserves earlier notes and honest hardware limits');
  await page.locator('#sl-release-close').click();
  await page.evaluate(()=>{App.switchTo('quiz');SLQuiz.clock(3);SLQuiz.endless(0);});
  await page.waitForFunction(()=>SLQuiz.cur&&SLQuiz.cur.clock&&SLQuiz.cur.clock.timer);
  await page.evaluate(()=>SLReleaseNotes.open());
  await page.waitForTimeout(9000);
  ok(await page.evaluate(()=>SLQuiz.view==='run'&&!SLQuiz.cur.answered&&!SLQuiz.cur.clock.timer),'release history pauses an obscured timed question beyond its deadline');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!!SLQuiz.cur.clock.timer);
  ok(await page.evaluate(()=>!document.querySelector('#sl-release-history').open&&SLQuiz.cur.clock.end>Date.now()),'Escape closes history and gives the visible question a fresh clock');
  for(const id of ['midihub','lumipractice','helix-stadium','score','musiclibrary']){
   await page.evaluate(id=>App.switchTo(id),id);
   ok(await page.evaluate(id=>App.active===id&&!document.querySelector('#panel-'+id+' .error'),id),'integrated page loads '+id);
   ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'360px page has no horizontal overflow: '+id);
  }
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.waitForTimeout(250);await ctx.setOffline(true);await page.reload();await page.waitForFunction(()=>window.App&&App.active&&window.SLScore&&window.SLHelixStadium);
  ok(await page.locator('#panel-midihub').count()===1,'offline reload restores the integrated application');
  ok(errors.length===0,'no page errors through navigation, history and offline reload: '+errors.join(';'));
  await ctx.close();
 }finally{await b.close()}
 console.log('ALL PASS ('+passed+' checks)');
})().catch(e=>{console.error(e);process.exitCode=1});
