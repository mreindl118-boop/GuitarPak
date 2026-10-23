// Real browser/library/player/progress integration. Original fixtures only;
// synthetic clock and virtual input, no MIDI device or microphone access.
const {chromium}=require('playwright'),fs=require('fs'),env=require('./env');
let checks=0;function ok(v,m){if(!v)throw Error(m);checks++;console.log('  PASS',m);}
(async()=>{const browser=await chromium.launch({executablePath:env.CHROMIUM,args:['--autoplay-policy=no-user-gesture-required']});try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
 await context.addInitScript(()=>{['help.seen','help.done','qz.landed'].forEach(k=>localStorage.setItem('guitarlab.'+k,'true'));localStorage.setItem('guitarlab.midi.wanted','false');});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(env.URL);await page.waitForFunction(()=>window.App&&App.active&&window.PracticeMaterial);
 let r=await page.evaluate(()=>{
  window.materialClock=0;window.materialWall=Date.now()-60000;
  window.study={id:'original-study',title:'Original two-note study',instrument:'piano',bpm:60,len:2,timingOk:true,notes:[{m:48,t:0,d:.4,v:90},{m:50,t:1,d:.4,v:90}]};
  App.store.set('ws.lib',[study]);window.identity=PracticeMaterial.fingerprint(study);window.originalEvents=[];App.on('performance:session',e=>originalEvents.push(e));
  let launch=PracticeMaterial.launchLegacy(study.id,{instrument:'guitar',mode:'wait',countIn:0,clock:()=>materialClock,now:()=>materialWall+materialClock*1000});
  return {launch,active:App.active,xp:App.practiceProgress.summary('guitar').lifetimeEarnedXP};
 });
 ok(r.launch.ok&&r.active==='shed'&&r.xp===0,'opening saved material launches real practice and awards nothing');
 r=await page.evaluate(()=>{
  document.querySelector('#pf-sound').checked=false;document.querySelector('#pf-start').click();
  let snap=PerformancePlayer.snapshot();snap.practice.material.id='forged-id';snap.practice.material.fingerprint='changed';
  PerformancePlayer.note({midi:48,on:true,source:'test',velocity:100});PerformancePlayer.note({midi:48,on:false,source:'test'});
  materialClock=.5;PerformancePlayer.tick();materialClock=1;PerformancePlayer.tick();PerformancePlayer.note({midi:50,on:true,source:'test',velocity:100});PerformancePlayer.note({midi:50,on:false,source:'test'});materialClock=1.5;PerformancePlayer.tick();materialClock=2;PerformancePlayer.tick();
  let state=PerformancePlayer.snapshot(),event=originalEvents[0];
  return {state,event,guitar:App.practiceProgress.history('guitar'),piano:App.practiceProgress.history('piano'),sidecar:PracticeMaterial.history({kind:'legacy',id:study.id,fingerprint:identity})};
 });
 ok(r.state.status==='complete'&&r.state.results.matched===2,'the launched source completes through actual Wait engine input');
 ok(r.guitar.length===1&&r.piano.length===0,'the declared piano source credits only the selected guitar performance');
 ok(r.event.material.id==='original-study'&&r.event.material.fingerprint!=='changed','mutating a snapshot cannot reattribute a saved source');
 ok(r.sidecar.length===1&&r.sidecar[0].sessionId===r.guitar[0].id,'material history references the exact canonical saved session');
 ok(r.sidecar[0].session.earnedXP===r.guitar[0].earnedXP,'sidecar copies real immutable awards rather than calculating another balance');
 r=await page.evaluate(()=>{App.emit('performance:session',originalEvents[0]);let before=PracticeMaterial.history({kind:'legacy',id:study.id,fingerprint:identity}).length;let altered=Object.assign({},study,{rhythmKnown:false});let other=Object.assign({},study,{instrument:'guitar'});return {before,rhythm:PracticeMaterial.fingerprint(altered)!==identity,instrument:PracticeMaterial.fingerprint(other)!==identity};});
 ok(r.before===1,'duplicate completion callbacks do not duplicate material history');ok(r.rhythm&&r.instrument,'stale fingerprints include rhythm permission and source instrument');
 r=await page.evaluate(()=>{let rows=App.store.get('ws.lib',[]);rows[0].notes[0].m=49;App.store.set('ws.lib',rows);return PracticeMaterial.launchLegacy(study.id,{instrument:'guitar',expectedFingerprint:identity});});
 ok(!r.ok&&/changed/.test(r.error),'changed legacy material requires review before a saved plan can launch');
 const bytes=Array.from(fs.readFileSync(env.ROOT+'/tests/fixtures/score/original-study.pdf'));
 r=await page.evaluate(async bytes=>{
  let item=await SLMusicLibrary.addOriginal({filename:'authored-study.pdf',bytes:new Uint8Array(bytes)});
  let score={title:'Original reviewed two-part targets',instrument:'piano',bpm:120,len:2,timingOk:false,rhythmKnown:false,notes:[{m:60,t:0,d:1,v:90,partId:'lead'},{m:64,t:0,d:1,v:90,partId:'other'}],capabilities:{tempo:false}};
  let draft=await SLMusicLibrary.saveRevision(item.id,{score,editor:{rhythmKnown:false,parts:[{id:'lead',name:'Lead',instrument:'piano'},{id:'other',name:'Other',instrument:'piano'}],selectedPartIds:['lead','other']},reviewState:'draft',rhythmKnown:false});
  let denied=await PracticeMaterial.launchLibrary({itemId:item.id,revisionId:draft.id,mode:'tempo'});
  let reviewed=await SLMusicLibrary.reviewRevision(item.id,draft.id,{verified:true});window.savedLibrary={itemId:item.id,revisionId:reviewed.id};
  let launch=await PracticeMaterial.launchLibrary({itemId:item.id,revisionId:reviewed.id,mode:'tempo',selectedPartIds:['lead'],instrument:'guitar',score:{notes:[{m:127}]}});
  let s=PerformancePlayer.snapshot();return {denied,launch,s,disabled:document.querySelector('#pf-mode').disabled,mode:document.querySelector('#pf-mode').value,ids:s.current.notes};
 },bytes);
 ok(!r.denied.ok&&/verify/.test(r.denied.error),'unreviewed source revisions cannot enter scored practice');
 ok(r.launch.ok&&r.s.mode==='wait'&&r.disabled&&r.mode==='wait','library shortcut independently enforces Wait-only from saved unknown rhythm');
 ok(r.ids.join(',')==='60','selected part uses the reviewed backend targets and ignores forged caller notes');
 r=await page.evaluate(async()=>{
  let bad=await PracticeMaterial.launchLibrary(Object.assign({},savedLibrary,{selectedPartIds:['missing']}));
  let rest=PracticeMaterial.launchScore(study,{instrument:'guitar',section:{startBeat:1.5,endBeat:2}});
  let lookup=await SLMusicLibrary.getRevision(savedLibrary.itemId,savedLibrary.revisionId);
  return {bad,rest,notes:lookup.score.notes.length,selection:PracticeMaterial.selection()};
 });
 ok(!r.bad.ok&&!r.rest.ok,'missing parts and target-free sections cannot silently launch empty scored runs');
 ok(r.notes===2,'part filtering never edits the saved reviewed source');
 ok(r.selection.material.selectedPartIds.join(',')==='lead','resume pointer preserves exact selected part identity');
 await page.reload();await page.waitForFunction(()=>window.PracticeMaterial&&App.active);
 r=await page.evaluate(async()=>{let result=await PracticeMaterial.resume();return {result,s:PerformancePlayer.snapshot(),history:PracticeMaterial.history({kind:'legacy',id:'original-study'})};});
 ok(r.result.ok&&r.s.status==='idle'&&r.s.current.notes.join(',')==='60','reload resumes saved setup from a fresh attempt with the selected part');
 ok(r.history.length===1,'real material history survives app reload');
 r=await page.evaluate(()=>{
  materialClock=0;materialWall=Date.now()-60000;let source={id:'unsaved-bass',title:'Original pending bass study',instrument:'piano',bpm:60,len:1,notes:[{m:48,t:0,d:.5,v:90}]};
  App.store.set('ws.lib',[source]);PracticeMaterial.launchLegacy(source.id,{instrument:'bass',countIn:0,clock:()=>materialClock,now:()=>materialWall+materialClock*1000});
  let raw=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k!=='guitarlab.practice.progress.v1')return raw.call(this,k,v);};
  document.querySelector('#pf-sound').checked=false;document.querySelector('#pf-start').click();PerformancePlayer.note({midi:48,on:true,source:'test'});PerformancePlayer.note({midi:48,on:false,source:'test'});materialClock=.5;PerformancePlayer.tick();materialClock=1;PerformancePlayer.tick();
  return {pending:App.store.get('ws.performance.pending',[]),bass:App.practiceProgress.history('bass').length};
 });
 ok(r.pending.length===1&&r.pending[0].material.id==='unsaved-bass'&&r.bass===0,'failed canonical save retains original instrument, material and raw observations durably');
 await page.reload();await page.waitForFunction(()=>window.PracticeMaterial&&App.active);
 r=await page.evaluate(()=>{
  let alternate={id:'alternate',title:'Another current source',instrument:'piano',bpm:80,len:1,notes:[{m:72,t:0,d:.5,v:90}]};
  App.store.set('ws.lib',[alternate]);PracticeMaterial.launchLegacy(alternate.id,{instrument:'piano'});document.querySelector('#pf-progress-retry').click();
  return {bass:App.practiceProgress.history('bass'),piano:App.practiceProgress.history('piano'),saved:PracticeMaterial.history({kind:'legacy',id:'unsaved-bass'}),wrong:PracticeMaterial.history({kind:'legacy',id:'alternate'}),pending:App.store.get('ws.performance.pending',[])};
 });
 ok(r.bass.length===1&&r.piano.length===0,'retry after reload credits only the original performance instrument');
 ok(r.saved.length===1&&!r.wrong.length&&!r.pending.length,'retry under a different open score preserves original material identity and clears pending once');
 ok(!errors.length,'material flows produce no browser exceptions: '+errors.join('; '));await context.close();console.log('ALL PASS ('+checks+' checks; browser simulations only)');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
