// Known recovery queues must retain unsupported bytes rather than silently
// clearing them. Real browser persistence/owners below; no devices or model.
const assert=require('assert'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright'),env=require('./env');
const manifest=require('../js/storage-manifest'),PracticeProgress=require('../js/practice-progress');
let checks=0;function ok(value,message){assert(value,message);checks++;console.log('  PASS '+message);}
const now=Date.now()-10000;
function session(id,instrument='guitar',mode='wait'){return {id,instrument,startedAt:now-2000,endedAt:now-1000,engagedSeconds:1,mode,status:'stopped',expected:1,matched:0,missed:0,extra:1,wrong:1,timingSamples:0,sumAbsTimingMs:0,sumTimingMs:0,tempo:null};}
const legacy={kind:'legacy',id:'authored-original'},raw=session('valid-original'),entry={id:raw.id,sessionId:raw.id,material:legacy,session:raw};
console.log('# typed recovery schemas');
for(const key of ['ws.performance.pending','lesson.pending.v1']){
 ok(manifest.validate(key,[raw]).ok&&manifest.validate(key,[]).ok,key+' accepts original supported observations and an empty queue');
 ok(!manifest.validate(key,{version:99}).ok&&!manifest.validate(key,null).ok&&!manifest.validate(key,[{id:'incomplete'}]).ok,key+' rejects future containers, null and incomplete entries');
}
ok(manifest.validate('practice.material.pending.v1',[entry]).ok&&manifest.validate('practice.material.sessions.v1',{version:1,sessions:[entry]}).ok,'material queues/history accept canonical IDs and explicit source linkage');
ok(!manifest.validate('practice.material.pending.v1',[{...entry,sessionId:'different'}]).ok&&!manifest.validate('practice.material.sessions.v1',{version:99,sessions:[]}).ok&&!manifest.validate('practice.material.sessions.v1',{version:1,sessions:[{session:null}]}).ok,'mismatched material IDs, future history and malformed nested history are unsupported');
const libraryEntry={material:{kind:'library',itemId:'original-id',revisionId:'revision-id'},session:raw};
ok(manifest.validate('library.pending.v1',[libraryEntry]).ok&&!manifest.validate('library.pending.v1',[{...libraryEntry,material:{kind:'library',itemId:'original-id'}}]).ok,'library recovery validates both original and pinned revision identities');
ok(!manifest.validate('ws.performance.pending',[raw,{...raw}]).ok,'duplicate recovery IDs are refused rather than creating ambiguous retry observations');
ok(manifest.validate('plugin.future.extension',{version:99,arbitrary:['opaque']}).ok,'unowned plugin/extension records remain opaque and supported');
const lumi={version:1,mode:'simulated',inputId:'',outputId:'',synthOutputId:'',low:48,channel:0,kind:'note',flow:'guided'},selection={version:1,material:legacy,instrument:'guitar',mode:'wait',tempo:100,countIn:4,section:{startBeat:0,endBeat:4,loop:false},transpose:0,inputKind:'midi'};
ok(manifest.validate('lumi.practice.preferences.v1',lumi).ok&&!manifest.validate('lumi.practice.preferences.v1',{...lumi,version:99}).ok,'LUMI setup accepts its actual version and refuses future preference envelopes');
ok(manifest.validate('practice.material.selection.v1',selection).ok&&!manifest.validate('practice.material.selection.v1',{...selection,version:99}).ok,'material resume setup accepts its actual version and refuses future selection envelopes');

(async()=>{const browser=await chromium.launch({executablePath:env.CHROMIUM});try{
 const invalid={
  'practice.material.pending.v1':{version:99,unreadableEvidence:'Future recovery evidence'},
  'ws.performance.pending':[{id:'incomplete',observation:'Do not discard'}],
  'lesson.pending.v1':null,
  'library.pending.v1':{version:99,unreadableEvidence:'Future library evidence'},
  'practice.material.sessions.v1':{version:1,sessions:[{id:'broken',session:null}]},
  'lumi.practice.preferences.v1':{...lumi,version:99,mode:'hardware',inputId:'future-input'},
  'practice.material.selection.v1':{...selection,version:99}
 };
 async function pageFor(seed){const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(seed=>{for(const k of ['help.seen','help.done','qz.landed'])localStorage.setItem('guitarlab.'+k,'true');localStorage.setItem('guitarlab.midi.wanted','false');for(const [k,v] of Object.entries(seed))if(localStorage.getItem('guitarlab.'+k)===null)localStorage.setItem('guitarlab.'+k,JSON.stringify(v));window.permissionCalls=0;navigator.requestMIDIAccess=()=>{permissionCalls++;return Promise.reject(Error('No hardware'));};if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{permissionCalls++;return Promise.reject(Error('No microphone'));};},seed);const page=await context.newPage();await page.goto(env.URL);await page.waitForFunction(()=>window.App&&App.active&&App.checkpoint&&window.PracticeMaterial);return {context,page};}
 const bad=await pageFor(invalid);
 const retained=await bad.page.evaluate(async invalid=>{const keys=Object.keys(invalid),before=Object.fromEntries(keys.map(k=>[k,localStorage.getItem('guitarlab.'+k)])),typed=keys.map(k=>App.persistence.read(k));let materialSafe=false;try{materialSafe=PracticeMaterial.history({kind:'legacy',id:'test'}).length===0;}catch(e){}const checkpoint=await App.checkpoint({reason:'pending-recovery-regression'}),after=Object.fromEntries(keys.map(k=>[k,localStorage.getItem('guitarlab.'+k)])),recovery=App.persistence.exportRecovery(),previews=[];for(const k of keys)previews.push(await App.persistence.prepareImport({format:SLPersistence.format,version:1,records:[{key:'guitarlab.'+k,raw:before[k]}],blobs:[]}));const unknown=await App.persistence.prepareImport({format:SLPersistence.format,version:1,records:[{key:'guitarlab.plugin.future.extension',raw:JSON.stringify({version:99,opaque:true})}],blobs:[]});return {before,after,typed,checkpoint,recovery,previews,unknown,materialSafe,permissionCalls};},invalid);
 ok(retained.typed.every(r=>r.status==='unsupported'),'all known malformed recovery/history records return typed unsupported status');
 ok(!retained.checkpoint.ok,'actual global checkpoint refuses unsupported recovery data');
 ok(JSON.stringify(retained.before)===JSON.stringify(retained.after),'owner retry/checkpoint preserves every original unsupported byte string');
 ok(Object.entries(retained.before).every(([key,raw])=>retained.recovery.records.some(r=>r.key==='guitarlab.'+key&&r.raw===raw)),'raw recovery export contains every exact unsupported original');
 ok(retained.previews.every(p=>!p.ok),'settings import preview refuses every malformed owned recovery/history payload before activation');
 ok(retained.unknown.ok&&retained.materialSafe,'opaque extension archives remain allowed and malformed material history renders a safe fallback');
 ok(retained.permissionCalls===0,'recovery inspection and checkpoint request no device permissions');
 const setups=await bad.page.evaluate(async({lumi,selection})=>({writes:[App.persistence.write('lumi.practice.preferences.v1',lumi),App.persistence.write('practice.material.selection.v1',selection)],raw:[localStorage.getItem('guitarlab.lumi.practice.preferences.v1'),localStorage.getItem('guitarlab.practice.material.selection.v1')],resume:await PracticeMaterial.resume(),preferences:SLLumiPractice.snapshot()}),{lumi,selection});
 ok(setups.writes.every(r=>!r.ok)&&setups.raw[0]===JSON.stringify(invalid['lumi.practice.preferences.v1'])&&setups.raw[1]===JSON.stringify(invalid['practice.material.selection.v1']),'routine preference/resume writes cannot overwrite either future setup record');
 ok(!setups.resume.ok&&setups.preferences.mode==='simulated'&&!setups.preferences.armed&&!setups.preferences.running,'future setup data cannot silently resume practice or arm hardware through legacy coercion');
 await bad.context.close();

 console.log('# supported owner retries stay idempotent');
 let saved=null;const core=new PracticeProgress({store:{get:()=>saved,set:(k,v)=>{saved=JSON.parse(JSON.stringify(v));}},now:()=>now,timezone:()=> 'UTC'});
 const existing=session('material-original','piano');assert(core.recordSession(existing).ok);const canonical=core.history('piano')[0],performance={...session('performance-original','guitar'),material:{kind:'legacy',id:'performance-source'}},lesson={...session('lesson-original','synth','knowledge'),expected:0,extra:0,wrong:0};
 const good=await pageFor({'practice.progress.v1':saved,'ws.performance.pending':[performance],'lesson.pending.v1':[lesson],'practice.material.pending.v1':[{id:canonical.id,sessionId:canonical.id,material:legacy,session:canonical}],'practice.material.sessions.v1':{version:1,sessions:[]},'library.pending.v1':[]});
 const recovered=await good.page.evaluate(async()=>{const first=await App.checkpoint({reason:'supported-recovery'}),once=['piano','guitar','synth'].map(id=>({id,sessions:App.practiceProgress.history(id),xp:App.practiceProgress.summary(id).lifetimeEarnedXP})),second=await App.checkpoint({reason:'supported-recovery-repeat'}),twice=['piano','guitar','synth'].map(id=>({id,sessions:App.practiceProgress.history(id),xp:App.practiceProgress.summary(id).lifetimeEarnedXP}));return {first,second,once,twice,queues:['ws.performance.pending','lesson.pending.v1','practice.material.pending.v1'].map(k=>App.store.get(k,null)),material:App.store.get('practice.material.sessions.v1',null)};});
 ok(recovered.first.ok&&recovered.second.ok&&recovered.queues.every(q=>Array.isArray(q)&&q.length===0),'supported performance/lesson/material queues retry and become durably empty');
 ok(recovered.once.every(r=>r.sessions.length===1)&&JSON.stringify(recovered.once)===JSON.stringify(recovered.twice),'supported retry preserves instrument identity and awards each original session exactly once');
 ok(recovered.material.sessions.length===2&&recovered.material.sessions.some(r=>r.material.id==='authored-original'&&r.session.instrument==='piano')&&recovered.material.sessions.some(r=>r.material.id==='performance-source'&&r.session.instrument==='guitar'),'material sidecars preserve both original source and canonical category');
 const pdf=[...fs.readFileSync(path.join(__dirname,'fixtures/score/original-study.pdf'))];
 await good.page.evaluate(async({bytes,fixture})=>{const item=await SLMusicLibrary.addOriginal({filename:'recovery-original.pdf',bytes:new Uint8Array(bytes)}),draft=await SLMusicLibrary.saveRevision(item.id,{score:{title:'Authored recovery',bpm:100,len:2,notes:[{m:60,t:0,d:1}]}}),revision=await SLMusicLibrary.reviewRevision(item.id,draft.id,{verified:true}),material={kind:'library',itemId:item.id,revisionId:revision.id};fixture.material=material;const accepted=App.practiceProgress.recordSession(fixture);if(!accepted.ok)throw Error(accepted.errors.join(' '));const result=App.store.write('library.pending.v1',[{material,session:fixture}]);if(!result.ok)throw Error(result.errors.join(' '));}, {bytes:pdf,fixture:session('library-original','bass')});
 await good.page.reload();await good.page.waitForFunction(()=>window.App&&App.active&&window.SLMusicLibrary);
 const library=await good.page.evaluate(async()=>{const pending=SLMusicLibrary.pendingHistory(),xp=App.practiceProgress.summary('bass').lifetimeEarnedXP,first=await SLMusicLibrary.retryPendingHistory(),again=await SLMusicLibrary.retryPendingHistory(),history=await SLMusicLibrary.getPracticeHistory(pending[0].material.itemId);return {first,again,history,xp,xpAfter:App.practiceProgress.summary('bass').lifetimeEarnedXP,checkpoint:await App.checkpoint({reason:'library-recovery'}),permissionCalls};});
 ok(!library.first.remaining&&!library.again.remaining&&library.history.length===1&&library.history[0].session.id==='library-original','supported library queue reloads and retries exactly once into its pinned original');
 ok(library.xp===library.xpAfter&&library.history[0].session.instrument==='bass'&&library.checkpoint.ok,'library-sidecar recovery cannot award again or change the original instrument');
 ok(library.permissionCalls===0,'supported recovery also requests no hardware access');
 if(process.env.SL_EVIDENCE_DIR){fs.mkdirSync(process.env.SL_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.SL_EVIDENCE_DIR,'pending-recovery.json'),JSON.stringify({checks,retained,recovered,library},null,2));}
 await good.context.close();console.log('ALL PASS ('+checks+' checks; synthetic records, real owners and storage)');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
