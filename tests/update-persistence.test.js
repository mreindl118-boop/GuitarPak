// Real old-worker -> current-worker activation with live practice and durable
// original files. Local authored fixtures; no public site/hardware access.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),env=require('./env');
let checks=0;function ok(v,m){if(!v)throw Error(m);checks++;console.log('  PASS',m);}
const root=env.ROOT;let current=false;
const currentCache=fs.readFileSync(path.join(root,'sw.js'),'utf8').match(/var CACHE = '([^']+)'/)[1];
const oldPage='<!doctype html><meta charset="utf-8"><title>Original update fixture</title><h1>Old installation fixture</h1>';
const oldWorker="const C='guitarlab-v124';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['/index.html'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method==='GET')e.respondWith(caches.open(C).then(c=>c.match(e.request)).then(r=>r||fetch(e.request)));});";
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');let file=url.pathname;
 res.setHeader('Cache-Control','no-store');
 if(file==='/sw.js'&&!current){res.setHeader('Content-Type','application/javascript');return res.end(oldWorker);}
 if((file==='/'||file==='/index.html')&&!current){res.setHeader('Content-Type','text/html');return res.end(oldPage);}
 if(file==='/'||file==='/upgrade.html')file='/index.html';
 const parts=file.split('/');if(parts.some(x=>x.startsWith('.'))){res.writeHead(404);return res.end();}
 const target=path.resolve(root,'.'+file);if(!target.startsWith(root+path.sep)){res.writeHead(404);return res.end();}
 try{const b=fs.readFileSync(target),ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.pdf':'application/pdf','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream');res.end(b);}catch(e){res.writeHead(404);res.end();}
});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:env.CHROMIUM,args:['--autoplay-policy=no-user-gesture-required']});try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/index.html');await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 let r=await page.evaluate(async()=>{
  const prefs={'help.seen':true,'help.done':true,'qz.landed':true,'midi.wanted':false,'app.theme':'light','learn.instrument':'guitar','fb.root':5,'fb.scale':'dorian','fb.frets':12,'jam2.sections':[{id:'a',on:true,repeats:2,barsPerChord:2,chords:[{d:1},{d:4}]}],'jam.track':[{rootPc:7,quality:'maj'}],'pn.scaleLock':true,'lights.displayEnabled':true,'fb.colorMode':'note','tun.a4':442,'tun.tuning':'dropD','plugin.future.value':{version:99,preserved:'exact unknown data'}};
  for(const k in prefs)localStorage.setItem('guitarlab.'+k,JSON.stringify(prefs[k]));
  const c=await caches.open('another-product-cache');await c.put('/unrelated-data',new Response('preserve this cache'));
  return {controlled:!!navigator.serviceWorker.controller,old:await (await caches.open('guitarlab-v124')).match('/index.html').then(x=>x.text())};
 });
 ok(r.controlled&&/Old installation fixture/.test(r.old),'fixture begins with a real controlled old app cache');
 await page.goto(base+'/upgrade.html');await page.waitForFunction(()=>window.App&&App.active&&App.checkpoint&&window.PracticeMaterial);
 const pdf=Array.from(fs.readFileSync(root+'/tests/fixtures/score/original-study.pdf'));
 r=await page.evaluate(async pdf=>{
  window.updateMarker='same running document';window.updateClock=0;window.updateWall=Date.now()-60000;
  window.updateSource=await SLMusicLibrary.addOriginal({filename:'update-study.pdf',bytes:new Uint8Array(pdf)});
  window.updateSourceHash=updateSource.original.sha256;
  let sc={id:'upgrade-study',title:'Original update study',instrument:'piano',bpm:60,len:4,notes:[{m:60,t:0,d:.5,v:90},{m:62,t:3,d:.5,v:90}]};
  App.store.set('ws.lib',[sc]);PracticeMaterial.launchLegacy(sc.id,{instrument:'guitar',mode:'wait',countIn:0,clock:()=>updateClock,now:()=>updateWall+updateClock*1000});document.querySelector('#pf-sound').checked=false;document.querySelector('#pf-start').click();PerformancePlayer.note({midi:60,on:true,source:'test'});PerformancePlayer.note({midi:60,on:false,source:'test'});updateClock=.5;PerformancePlayer.tick();
  return {sourceId:updateSource.id,sourceHash:updateSourceHash,notes:PerformancePlayer.snapshot().results.matched,status:PerformancePlayer.snapshot().status};
 },pdf);
 const sourceId=r.sourceId,sourceHash=r.sourceHash;
 ok(r.notes===1&&r.status==='running','a real uncompleted practice attempt is active before worker activation');
 r=await page.evaluate(()=>({frets:App.store.get('fb.frets'),ui:document.querySelector('#fb-frets').value,sections:App.store.get('jam2.sections'),legacy:App.store.get('jam.track')}));
 ok(r.frets===12&&r.ui==='12','missing old migration marker never resets an explicit fret-count preference');
 ok(r.sections[0].chords[0].d===1&&r.sections[0].repeats===2&&r.legacy[0].rootPc===7,'existing section edits win over a stale legacy progression without deleting either source');
 current=true;
 await page.evaluate(async()=>{const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(true),{once:true}));await (await navigator.serviceWorker.getRegistration()).update();await changed;});
 await page.waitForFunction(()=>!!document.getElementById('app-update'),null,{timeout:60000});
 r=await page.evaluate(async cacheName=>({marker:updateMarker,status:PerformancePlayer.snapshot().status,recorded:App.practiceProgress.history('guitar').length,keys:await caches.keys(),foreign:await caches.match('/unrelated-data').then(x=>x?x.text():null),old:await (await caches.open('guitarlab-v124')).match('/index.html').then(x=>x?x.text():null),fresh:await (await caches.open(cacheName)).match('/index.html').then(x=>x?x.text():null),text:document.querySelector('#app-update')?.textContent||'MISSING'}),currentCache);
  ok(r.marker==='same running document'&&r.status==='running'&&r.recorded===0,'worker activation neither reloads over practice nor fabricates completion');
 ok(r.keys.includes('guitarlab-v124')&&r.foreign==='preserve this cache','activation retains the previous app cache and unrelated cache');
 ok(/Old installation fixture/.test(r.old)&&/practice-material.js/.test(r.fresh),'previous and new asset generations stay separate and complete '+JSON.stringify({keys:r.keys,old:r.old,fresh:!!r.fresh}));
 ok(/Save & update/.test(r.text),'activation offers an explicit checkpoint before reload');
 await Promise.all([page.waitForEvent('load'),page.locator('#app-update button').first().click()]);
 await page.waitForFunction(()=>window.App&&App.active&&window.PracticeMaterial);
 r=await page.evaluate(async sourceId=>({prefs:['app.theme','learn.instrument','fb.root','fb.scale','pn.scaleLock','lights.displayEnabled','fb.colorMode','tun.a4','tun.tuning','plugin.future.value'].map(k=>[k,App.store.get(k,null)]),history:App.practiceProgress.history('guitar'),source:await SLMusicLibrary.getItem(sourceId),original:[...await SLMusicLibrary.getOriginal(sourceId)],active:App.active,marker:window.updateMarker}),sourceId);
 const prefs=Object.fromEntries(r.prefs);
 ok(!r.marker&&r.history.length===1&&r.history[0].status==='stopped'&&r.history[0].matched===1,'deliberate update saves actual partial observations once before a fresh document');
 ok(prefs['fb.root']===5&&prefs['fb.scale']==='dorian'&&prefs['pn.scaleLock']&&prefs['lights.displayEnabled'],'selected scale and independent lock/display survive the upgrade');
 ok(prefs['app.theme']==='light'&&prefs['learn.instrument']==='guitar'&&prefs['tun.a4']===442&&prefs['tun.tuning']==='dropD','appearance, instrument and tuner preferences survive unchanged');
 ok(prefs['plugin.future.value'].version===99&&prefs['plugin.future.value'].preserved==='exact unknown data','unknown future plugin preferences are preserved without default rewriting');
 ok(r.source.original.sha256===sourceHash&&r.original.join(',')===pdf.join(','),'original PDF identity and every byte survive the app upgrade');
 // A slow worker download must not allow edits AFTER the first checkpoint.
 await page.evaluate(async sourceId=>{App.switchTo('score');await SLScoreReview.open(sourceId);},sourceId);
 await page.waitForFunction(()=>!document.querySelector('#sr-title').disabled);
 await page.locator('#sr-title').fill('Saved before worker wait');await page.evaluate(()=>SLScoreReview.saveDraft());
 await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();reg.update=()=>new Promise(resolve=>window.finishWorkerWait=resolve);navigator.serviceWorker.getRegistration=async()=>reg;window.updateRequest=App.updates.request().then(result=>window.updateResult=result);});
 await page.waitForFunction(()=>typeof window.finishWorkerWait==='function'||window.updateResult);
 const ready=await page.evaluate(()=>({ready:typeof finishWorkerWait==='function',result:window.updateResult,status:App.persistence.status()}));if(!ready.ready)throw Error('Worker wait did not start: '+JSON.stringify(ready));
 let blocked=false;try{await page.locator('#sr-title').click({timeout:150});}catch(e){blocked=true;}
 ok(blocked&&await page.evaluate(()=>App.interactionBlocked&&document.querySelector('main').inert),'worker installation holds the interaction boundary after checkpoint');
 r=await page.evaluate(()=>{App.switchTo('piano');let route=App.active;const b=document.createElement('button');b.id='late-update-control';document.body.appendChild(b);return route;});
 await page.waitForFunction(()=>document.querySelector('#late-update-control').inert);
 ok(r==='score','navigation and newly inserted controls cannot reopen editing during update');
 await Promise.all([page.waitForEvent('load'),page.evaluate(()=>{const title=document.querySelector('#sr-title');title.value='Late programmatic edit retained';title.dispatchEvent(new Event('change',{bubbles:true}));finishWorkerWait();})]);
 await page.waitForFunction(()=>window.App&&App.active&&window.SLMusicLibrary);
 r=await page.evaluate(sourceId=>SLMusicLibrary.listRevisions(sourceId),sourceId);
 ok(r.some(x=>x.editor&&x.editor.title==='Late programmatic edit retained'),'final checkpoint retains even a late programmatic edit before reload');
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.App&&App.active&&window.PracticeMaterial);
 r=await page.evaluate(async ({sourceId,cacheName})=>({source:await SLMusicLibrary.getItem(sourceId),history:App.practiceProgress.history('guitar'),cached:(await (await caches.open(cacheName)).keys()).map(r=>new URL(r.url).pathname)}),{sourceId,cacheName:currentCache});
 ok(r.source.original.sha256===sourceHash&&r.history.length===1,'offline reopen retains original files and real practice history');
 ok(r.cached.some(x=>x.endsWith('/js/checkpoint.js'))&&r.cached.some(x=>x.endsWith('/vendor/pdfjs/pdf.worker.mjs')),'offline cache includes the new practice graph and local PDF worker');
 await page.evaluate(()=>App.switchTo('score'));await page.waitForTimeout(100);await page.evaluate(sourceId=>SLScoreReview.open(sourceId),sourceId);await page.waitForFunction(()=>document.querySelector('#sr-canvas').width>0&&!document.querySelector('#sr-canvas').hidden,null,{timeout:20000});
 ok(await page.locator('#sr-page-status').textContent().then(t=>/2/.test(t)),'the authored multi-page PDF renders from local original and cached worker while offline');
 ok(!errors.length,'upgrade/offline flow has no browser exceptions: '+errors.join('; '));await context.close();console.log('ALL PASS ('+checks+' checks; real local worker/storage, no hardware)');
}finally{await browser.close();server.closeAllConnections();server.close();}})().catch(e=>{console.error(e);server.closeAllConnections();server.close();process.exit(1);});
