// Local recognition UI integration. Controlled engine replies below exercise
// lifecycle/storage failures, not musical accuracy. The real model's corpus
// tests and eligible PNG/PDF end-to-end fixtures are separate explicit checks.
const assert=require('assert'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright'),env=require('./env'),OMR=require('../js/omr/review-recognition');
let checks=0;const evidenceDir=path.join(process.env.EVIDENCE_DIR||process.env.SL_LOG_DIR||require('os').tmpdir(),'omr-review-screenshots');
fs.mkdirSync(evidenceDir,{recursive:true});
function ok(value,message){assert(value,message);checks++;console.log('  PASS '+message);}
const source={item:{id:'original',original:{filename:'authored.pdf',sha256:'a'.repeat(64),kind:'pdf'},metadata:{title:'Authored source'}},currentPage:2};
const region={id:'staff-a',bbox:{x:10,y:20,width:700,height:100},lineYs:[40,50,60,70,80],spacing:10,transform:{type:'vertical-shear',slope:.005,centerX:400}};
const engine={id:'controlled-test-reply',version:'test-1',sourceCommit:'b'.repeat(40),modelSha256:'c'.repeat(64),runtime:'UI regression fixture'};
function reply(events){return {engine,events,rawTokens:[{token:'note-C4_quarter',rawConfidence:.72,frameStart:1,frameEnd:4,staff:0}],warnings:[],unsupported:[],diagnostics:{fixture:true}};}
const simple=reply([{midi:60,rest:false,beat:0,duration:1,confidence:null,verified:false},{midi:62,rest:false,beat:1,duration:1,confidence:null,verified:false}]);
console.log('# exact unverified draft and provenance conversion');
const draft=OMR.buildDraft(source,[region],[simple],{instrument:'guitar'});
ok(draft.reviewState==='draft'&&draft.verified===false&&draft.editor.rows.every(r=>r.verified===false),'automatic targets are always an unverified draft');
ok(draft.score.notes.map(n=>n.m).join() === '60,62'&&draft.editor.rows.map(r=>r.pitches).join()==='C4,D4','recognized pitches enter editable target rows without replacing them with manual placeholders');
ok(!draft.rhythmKnown&&!draft.score.capabilities.tempo&&!draft.score.capabilities.holdScoring,'recognized timing stays Wait-only until explicit source review');
ok(draft.recognition.sourceSha256===source.item.original.sha256&&draft.recognition.regions[0].engine.modelSha256===engine.modelSha256&&draft.recognition.regions[0].rawTokens[0].rawConfidence===.72,'original digest, engine/model provenance and raw scores are retained exactly');
ok(draft.recognition.confidence===null&&draft.editor.rows.every(r=>r.recognition.confidence===null),'no raw model score is promoted into calibrated target certainty');
ok(draft.editor.recognition.regions[0].transform.slope===.005&&draft.score.notes[0].sourceAnchor.page===2&&draft.score.notes[0].sourceAnchor.bbox.x===10,'page, original geometry and rectification provenance remain with the draft');
const parsedUnverified=OMR.buildDraft(source,[region],[Object.assign(reply([{midi:61,pitch:{step:'D',alter:-1,octave:4},beat:.5,duration:1.5,tie:'merged',sourceAnchor:{page:2,bbox:[90,30,12,80]},sourceAnchors:[{page:2,bbox:[90,30,12,80]},{page:2,bbox:[150,30,10,80]}]}]),{rhythmKnown:false,diagnostics:{grammarComplete:true}})],{});
ok(parsedUnverified.editor.rows[0].beat===.5&&parsedUnverified.editor.rows[0].duration===1.5&&!parsedUnverified.editor.rhythmKnown,'grammar-valid predicted timing survives while automatic rhythm verification stays false');
ok(parsedUnverified.editor.rows[0].pitches==='Db4'&&parsedUnverified.score.notes[0].sourceAnchor.bbox[0]===90&&parsedUnverified.score.notes[0].sourceAnchor.staffBBox.x===10&&parsedUnverified.score.notes[0].sourceAnchors.length===2,'validated source spelling and precise tied-note anchors survive alongside staff geometry');
const unknown=OMR.buildDraft(source,[region],[reply([{midi:60,beat:null,duration:null},{midi:62,beat:0,duration:1}])],{});
ok(unknown.score.notes.map(n=>n.t).join()==='0,1'&&unknown.score.notes.every(n=>n.d===0),'partly unparsed rhythm uses explicitly disclosed onset ordering without accidental simultaneous chords');
const evidence=OMR.buildDraft(source,[region],[reply([{midi:null,beat:null,duration:null}])],{});
ok(evidence.score===null&&evidence.editor.rows.length===0&&evidence.recognition.regions[0].events.length===1,'unrecognized pitches retain an evidence-only draft without fabricated playable notes');
for(const options of [{},{sequential:true}]){
 assert.throws(()=>OMR.buildDraft(source,[region,Object.assign({},region,{id:'staff-b'})],[simple,simple],options),/exactly one selected monophonic staff on one original page/);checks++;console.log('  PASS beta rejects multiple staves even with legacy sequential option: '+JSON.stringify(options));
}
ok(OMR.maxSelectedStaves===1&&draft.recognition.readingOrder==='selected-single-staff'&&draft.recognition.regions.length===1,'beta API and retained provenance describe exactly one selected staff');
assert.throws(()=>OMR.buildDraft(source,[],[],{}),/exactly one/);checks++;console.log('  PASS beta requires an explicit single-staff selection');
assert.throws(()=>OMR.buildDraft(source,[region],[Object.assign({},simple,{engine:{}})],{}),/provenance/);checks++;console.log('  PASS missing engine/model identity prevents an unverifiable draft');

(async()=>{const browser=await chromium.launch({executablePath:env.CHROMIUM});try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:1000},acceptDownloads:true});
 await context.addInitScript(()=>{for(const k of ['help.seen','help.done','qz.landed'])localStorage.setItem('guitarlab.'+k,'true');window.__permissionCalls=0;navigator.requestMIDIAccess=()=>{__permissionCalls++;return Promise.reject(Error('No hardware'));};if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{__permissionCalls++;return Promise.reject(Error('No microphone'));};});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(env.URL);await page.waitForFunction(()=>window.App&&App.active&&window.SLOMRReview&&window.SLScoreReview);
 await page.evaluate(()=>App.switchTo('score'));
 await page.setInputFiles('#sr-file',path.join(__dirname,'fixtures/score/original-study.pdf'));
 await page.waitForFunction(()=>SLScoreReview.snapshot().item&&!SLScoreReview.snapshot().busy);
 await page.waitForSelector('#sr-recognition [data-omr="detect"]');
 const original=await page.evaluate(async()=>({item:SLScoreReview.snapshot().item.id,bytes:[...await SLMusicLibrary.getOriginal(SLScoreReview.snapshot().item.id)],sessions:App.practiceProgress.exportData().sessions.length}));
 await page.evaluate(({engine})=>{
   window.__realRecognition=window.SLRecognition;window.__realDetection=window.SLStaffDetection;window.__omrCalls=0;window.__aborted=0;
   window.SLStaffDetection={detectStaffRegions:image=>{window.__raster={width:image.width,height:image.height};return {regions:[{id:'fixture-staff',bbox:{x:10,y:20,width:Math.min(700,image.width-20),height:100},lineYs:[40,50,60,70,80],spacing:10,usable:true},{id:'fixture-accompaniment',bbox:{x:10,y:140,width:Math.min(700,image.width-20),height:100},lineYs:[160,170,180,190,200],spacing:10,usable:true}],warnings:[]};}};
   window.SLRecognition={recognize:async options=>{__omrCalls++;options.onProgress({stage:'recognizing',message:'Controlled lifecycle test'});return {engine,events:[{midi:60,beat:0,duration:1,confidence:null,verified:false},{midi:62,beat:1,duration:1,confidence:null,verified:false}],rawTokens:[{token:'note-C4_quarter',rawConfidence:.72,frameStart:1,frameEnd:4}],warnings:[{code:'TEST_UNCERTAIN',message:'Controlled uncertain symbol; compare with original.'}],unsupported:[],diagnostics:{testFixture:true}};}};
 },{engine});
 const ui=page.locator('#sr-recognition');
 ok(await page.evaluate(()=>__omrCalls===0&&__permissionCalls===0),'opening source recognition initializes neither the model nor device permissions');
 await ui.locator('[data-omr=detect]').click();await ui.locator('[data-omr=selection]').waitFor({state:'visible'});
 ok(await ui.locator('[data-omr=run]').isDisabled()&&await page.evaluate(()=>__omrCalls===0),'finding regions uses actual source pixels and waits for explicit support confirmation before inference');
 ok(await page.evaluate(()=>__raster.width>600&&__raster.height>600),'PDF recognition receives an offscreen page raster rather than the narrow visible preview');
 ok(await ui.locator('h3').textContent().then(s=>s==='Notation recognition (Beta)')&&await ui.locator('.badge').textContent().then(s=>s.includes('Correction required')),'the visible feature is explicitly beta with correction required');
 ok(await ui.textContent().then(s=>s.includes('one page at a time')&&s.includes('General piano')&&s.includes('scanned or handwritten')&&s.includes('whole-multipage')),'beta scope is disclosed before recognition, including unsupported general scores');
 ok(await ui.locator('[role=radiogroup]').count()===1&&await ui.locator('.omr-region input[type=radio]').count()===2&&await ui.locator('.omr-region input[type=number],[data-omr=sequential],[data-omr=sequence-wrap]').count()===0,'candidate staves have a single-choice radio group with no order or sequential merge controls');
 await ui.locator('[data-region="fixture-staff"] input[type=radio]').check();
 await ui.locator('[data-region="fixture-staff"] input[type=radio]').focus();await page.keyboard.press('ArrowDown');
 ok(await ui.locator('[data-region="fixture-accompaniment"] input[type=radio]').isChecked()&&!await ui.locator('[data-region="fixture-staff"] input[type=radio]').isChecked(),'keyboard arrows choose another staff and deselect the previous staff');
 await page.keyboard.press('ArrowUp');await ui.locator('[data-omr=monophonic]').check();
 await page.evaluate(()=>{const radios=[...document.querySelectorAll('#sr-recognition .omr-region input[type=radio]')];radios[1].name+='-forced';radios[1].checked=true;radios[1].dispatchEvent(new Event('change',{bubbles:true}));});
 ok(await ui.locator('[data-omr=run]').isDisabled(),'a forced multiple selection disables the beta recognition action');
 await page.evaluate(async()=>{await document.querySelector('#sr-recognition [data-omr=run]').onclick();});
 ok(await page.evaluate(()=>__omrCalls===0&&SLOMRReview.pending().length===0),'calling recognition directly with forced multiple selections creates no inference or draft');
 await page.evaluate(()=>{const radios=[...document.querySelectorAll('#sr-recognition .omr-region input[type=radio]')];radios[1].checked=false;radios[1].name=radios[0].name;radios[0].checked=true;radios[0].dispatchEvent(new Event('change',{bubbles:true}));});
 for(const theme of ['light','dark']){await page.evaluate(t=>App.setTheme(t),theme);await page.setViewportSize({width:390,height:1000});await ui.locator('[data-omr=run]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidenceDir,'omr-beta-selection-'+theme+'.png'),fullPage:true});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await ui.locator('.omr-region label').evaluateAll(labels=>labels.every(label=>label.getBoundingClientRect().height>=44)),'single-staff beta controls fit a phone with accessible touch labels in '+theme+' theme');}
 await page.setViewportSize({width:1280,height:1000});
 await ui.locator('[data-region="fixture-staff"] input[type=radio]').check();await ui.locator('[data-omr=monophonic]').check();await ui.locator('[data-omr=run]').click();await ui.locator('[data-omr=save]').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#sr-recognition [data-omr=save]').disabled);
 ok(await page.evaluate(()=>[...document.querySelectorAll('#sr-recognition [data-omr=regions] input,#sr-recognition [data-omr=monophonic]')].every(input=>input.disabled)),'completed results freeze the staff selection and support confirmation');
 let selectionBlocked=false;try{await ui.locator('[data-region="fixture-accompaniment"] input[type=radio]').check({timeout:600});}catch(error){selectionBlocked=true;}
 ok(selectionBlocked&&await page.evaluate(()=>document.querySelector('[data-region="fixture-staff"] input[type=radio]').checked&&!document.querySelector('[data-region="fixture-accompaniment"] input[type=radio]').checked&&SLOMRReview.pending()[0].draft.recognition.regions[0].id==='fixture-staff'),'a second staff cannot replace the visible selection while Save retains the first recognized snapshot');
 ok(await ui.locator('[data-omr=warnings]').textContent().then(s=>s.includes('TEST_UNCERTAIN'))&&await ui.locator('[data-omr=summary]').textContent().then(s=>s.includes('No confidence percentage')),'uncertain output is visible without an accuracy percentage');
 ok(!(await page.evaluate(()=>SLOMRReview.checkpoint())).ok,'unsaved automatic recognition results block a false safe reload');
 ok(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),'unsaved recognition also guards an ordinary browser reload');
 await page.evaluate(()=>App.switchTo('piano'));await page.evaluate(()=>App.switchTo('score'));await page.waitForFunction(()=>!SLScoreReview.snapshot().busy&&document.querySelector('#sr-recognition [data-omr=output]')&&!document.querySelector('#sr-recognition [data-omr=output]').hidden);
 ok(await page.evaluate(()=>SLOMRReview.pending().length===1&&__omrCalls===1),'completed unsaved output survives leaving and reopening Score review without new inference');
 await page.click('#sr-next');await page.waitForFunction(()=>SLScoreReview.snapshot().page===2&&!SLScoreReview.snapshot().busy);
 ok(await ui.locator('.omr-pending').textContent().then(s=>s.includes('page 1'))&&!(await page.evaluate(()=>SLOMRReview.checkpoint())).ok,'another PDF page retains prior-page evidence with export/discard and keeps checkpoint blocked');
 await page.click('#sr-prev');await page.waitForFunction(()=>SLScoreReview.snapshot().page===1&&!SLScoreReview.snapshot().busy&&!document.querySelector('#sr-recognition [data-omr=save]').disabled);
 ok(await ui.locator('[data-omr=raw]').textContent().then(s=>s.includes('TEST_UNCERTAIN')),'returning to the original page restores its exact unverified result for saving');
 await ui.locator('[data-omr=save]').click();await page.waitForFunction(()=>SLScoreReview.snapshot().revision&&SLScoreReview.snapshot().revision.recognition&&!SLScoreReview.snapshot().busy);
 const saved=await page.evaluate(async()=>{const s=SLScoreReview.snapshot();return {s,bytes:[...await SLMusicLibrary.getOriginal(s.item.id)],sessions:App.practiceProgress.exportData().sessions.length,permissionCalls:__permissionCalls};});
 ok(saved.s.revision.reviewState==='draft'&&saved.s.editor.rows.every(r=>!r.verified)&&saved.s.revision.score.notes.map(n=>n.m).join()==='60,62','actual library save and Score review opening retain automatic notes as unverified targets');
 ok(saved.bytes.join()===original.bytes.join()&&saved.s.item.id===original.item,'the original PDF identity and every byte remain unchanged');
 ok(saved.sessions===original.sessions&&saved.permissionCalls===0,'recognition and draft save create no XP/session or MIDI/microphone access');
 ok(saved.s.revision.recognition.regions[0].engine.modelSha256===engine.modelSha256&&saved.s.editor.recognition.regions[0].rawTokens[0].token==='note-C4_quarter','engine digest and raw token evidence survive real IndexedDB readback and editor opening');
 ok(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return !event.defaultPrevented;}),'a durably saved draft no longer blocks an ordinary reload');
 await ui.locator('[data-omr=detect]').click();await ui.locator('[data-omr=selection]').waitFor({state:'visible'});await ui.locator('[data-region="fixture-staff"] input[type=radio]').check();await ui.locator('[data-omr=monophonic]').check();
 await ui.locator('[data-omr=run]').click();await page.waitForFunction(()=>!document.querySelector('#sr-recognition [data-omr=save]').disabled);page.once('dialog',dialog=>dialog.accept());await ui.locator('[data-omr=discard]').click();
 ok(await page.evaluate(()=>SLOMRReview.checkpoint().ok&&[...document.querySelectorAll('#sr-recognition [data-omr=regions] input,#sr-recognition [data-omr=monophonic]')].every(input=>!input.disabled)),'explicit Discard unlocks staff selection and confirmation controls and clears only the unsaved result');
 await page.evaluate(()=>{SLRecognition.recognize=options=>new Promise((resolve,reject)=>{window.__lateRecognition=resolve;options.signal.addEventListener('abort',()=>{__aborted++;const e=Error('Cancelled');e.name='AbortError';reject(e);},{once:true});});});
 await ui.locator('[data-omr=run]').click();await page.waitForFunction(()=>!!window.__lateRecognition);
 ok(!(await page.evaluate(()=>SLOMRReview.checkpoint())).ok,'a running worker prevents update/import from claiming checkpoint success');
 await ui.locator('[data-omr=cancel]').click();
 ok(await page.evaluate(()=>__aborted===1&&SLOMRReview.checkpoint().ok),'Cancel aborts the owned job and clears its pending checkpoint without creating a draft');
 await page.evaluate(()=>{SLStaffDetection.detectStaffRegions=()=>({regions:[],warnings:['Unreadable staff geometry']});});
 await ui.locator('[data-omr=detect]').click();await ui.locator('[data-omr=status]').filter({hasText:'No usable five-line staff'}).waitFor();
 ok(await ui.locator('[data-omr=status]').textContent().then(s=>s.includes('Unreadable staff geometry')),'failed geometry detection reports the real limitation without inventing targets');
 // A genuine automatic UI path on an original, public test composition. The
 // known final-duration model error is deliberately not asserted as correct.
 await page.evaluate(()=>{SLRecognition=__realRecognition;SLStaffDetection=__realDetection;});
 await page.setInputFiles('#sr-file',path.join(__dirname,'fixtures/omr/01-treble-quarters-clean.png'));
 await page.waitForFunction(()=>SLScoreReview.snapshot().item.original.kind==='image'&&!SLScoreReview.snapshot().busy);
 await ui.locator('[data-omr=detect]').click();await ui.locator('[data-omr=selection]').waitFor({state:'visible'});
 ok(await ui.locator('.omr-region input[type=radio]').count()===1&&await ui.locator('.omr-region input[type=radio]:checked').count()===1,'actual clean PNG exposes exactly one selected candidate staff');
 await ui.locator('.omr-region input[type=radio]').first().check();await ui.locator('[data-omr=monophonic]').check();
 await ui.locator('[data-omr=run]').click();await page.waitForFunction(()=>!document.querySelector('#sr-recognition [data-omr=save]').disabled,null,{timeout:120000});
 const automatic=await ui.locator('[data-omr=raw]').textContent().then(JSON.parse),manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../vendor/omr/manifest.json')));
 ok(automatic.results[0].events.filter(e=>!e.rest).map(e=>e.midi).join()==='60,62,64,65','actual source pixels through staff detection and local WASM model automatically produce C4 D4 E4 F4');
 ok(automatic.results[0].engine.modelSha256===manifest.model.sha256&&automatic.results[0].events.every(e=>!e.verified&&e.confidence===null),'actual automatic result records the pinned model and remains unverified with null musical confidence');
 ok(await ui.locator('[data-omr=warnings]').textContent().then(s=>s.includes('monophonic-scope')&&s.includes('Chords')&&s.includes('repeats')),'actual model scope exclusions for chords, multiple voices and repeats are visibly retained with its output');
 await ui.locator('[data-omr=save]').click();await page.waitForFunction(()=>SLScoreReview.snapshot().revision&&SLScoreReview.snapshot().revision.recognition&&!SLScoreReview.snapshot().busy);
 ok(await page.evaluate(()=>SLScoreReview.snapshot().editor.rows.map(r=>r.pitches).join()==='C4,D4,E4,F4'&&SLScoreReview.snapshot().editor.rows.every(r=>!r.verified)&&!SLScoreReview.snapshot().editor.rhythmKnown&&App.practiceProgress.exportData().sessions.length===0),'actual automatic draft opens in the correction editor, keeps every target unchecked and awards no XP');
 const predicted=await page.evaluate(()=>SLScoreReview.snapshot().editor.rows.map(r=>({beat:r.beat,duration:r.duration})));
 ok(predicted.every((r,i)=>r.beat===automatic.results[0].events[i].beat&&r.duration===automatic.results[0].events[i].duration),'actual parsed model rhythm survives exactly as editable predictions without pretending it verified');
 console.log('  OBSERVED automatic duration predictions:',predicted.map(r=>r.duration).join(','),'(authored source has four quarter notes; correction follows inference)');
 // Compare with the original authored composition AFTER inference; no expected
 // notes or rhythm enter the recognizer. Correct even a plausible model error.
 for(let i=0;i<4;i++){const row=page.locator('#sr-rows [data-row]').nth(i);await row.locator('[data-field=beat]').fill(String(i));await row.locator('[data-field=beat]').dispatchEvent('change');await row.locator('[data-field=duration]').fill('1');await row.locator('[data-field=duration]').dispatchEvent('change');}
 await page.fill('#sr-length','4');await page.locator('#sr-length').dispatchEvent('change');await page.click('#sr-all-verified');await page.click('#sr-review');await page.waitForFunction(()=>SLScoreReview.snapshot().revision.reviewState==='reviewed'&&!SLScoreReview.snapshot().busy);
 await page.selectOption('#sr-practice-instrument','guitar');
 const flowSource=await page.evaluate(()=>{const s=SLScoreReview.snapshot();window.__flowClock=0;window.__flowWall=Date.now()-60000;SLScoreReview.configure({onLaunch:payload=>{window.__flowLaunch=payload;return PracticeMaterial.launchLibrary(payload,{clock:()=>__flowClock,now:()=>__flowWall+__flowClock*1000,countIn:0,inputId:'all',tempo:100});}});return {itemId:s.item.id,revisionId:s.revision.id,hash:s.item.original.sha256};});
 const waitReadiness=await page.evaluate(()=>({disabled:document.querySelector('#sr-mode option[value=tempo]').disabled,rhythm:SLScoreReview.snapshot().editor.rhythmKnown,mode:document.querySelector('#sr-mode').value}));
 ok(waitReadiness.disabled&&!waitReadiness.rhythm,'explicit pitch review alone keeps Tempo disabled until rhythm confirmation: '+JSON.stringify(waitReadiness));
 await page.click('#sr-launch');await page.waitForFunction(()=>App.active==='shed'&&PerformancePlayer.snapshot());await page.click('#pf-start');
 const wait=await page.evaluate(()=>{[60,62,64,65].forEach((m,i)=>{__flowClock=i*.6;PerformancePlayer.tick();App.emit('midi:raw',{portId:'cloud-omr-simulation',port:'Cloud MIDI simulation',bytes:[0x90,m,100]});__flowClock+=.1;App.emit('midi:raw',{portId:'cloud-omr-simulation',port:'Cloud MIDI simulation',bytes:[0x80,m,0]});PerformancePlayer.tick();});return {status:PerformancePlayer.snapshot().status,history:App.practiceProgress.history('guitar'),piano:App.practiceProgress.history('piano'),selection:PracticeMaterial.selection(),materialHistory:PracticeMaterial.history(PracticeMaterial.selection().material,'guitar')};});
 ok(wait.status==='complete'&&wait.history.length===1&&wait.history[0].matched===4&&wait.history[0].instrument==='guitar'&&wait.history[0].mode==='wait'&&!wait.piano.length,'real reviewed Wait launch grades simulated raw MIDI and saves one canonical session for the chosen instrument only');
 ok(wait.selection.material.itemId===flowSource.itemId&&wait.materialHistory[0].material.revisionId===flowSource.revisionId&&wait.materialHistory[0].sessionId===wait.history[0].id,'canonical practice and resume identify the exact reviewed automatic derivative through its material sidecar');
 await page.evaluate(async p=>{App.switchTo('score');await SLScoreReview.open(p.itemId,p.revisionId);},flowSource);await page.waitForFunction(()=>!SLScoreReview.snapshot().busy);
 await page.locator('#sr-rhythm').check();await page.click('#sr-all-verified');await page.click('#sr-review');await page.waitForFunction(()=>SLScoreReview.snapshot().revision.reviewState==='reviewed'&&SLScoreReview.snapshot().editor.rhythmKnown&&!SLScoreReview.snapshot().busy);await page.selectOption('#sr-mode','tempo');
 await page.evaluate(()=>{__flowClock=0;__flowWall=Date.now()-60000;});await page.click('#sr-launch');await page.waitForFunction(()=>App.active==='shed'&&PerformancePlayer.snapshot().mode==='tempo');await page.click('#pf-start');
 const tempo=await page.evaluate(()=>{[60,62,64,65].forEach((m,i)=>{__flowClock=i*.6;PerformancePlayer.tick();App.emit('midi:raw',{portId:'cloud-omr-simulation',port:'Cloud MIDI simulation',bytes:[0x90,m,100]});__flowClock+=.1;App.emit('midi:raw',{portId:'cloud-omr-simulation',port:'Cloud MIDI simulation',bytes:[0x80,m,0]});PerformancePlayer.tick();});__flowClock=3;PerformancePlayer.tick();return {status:PerformancePlayer.snapshot().status,history:App.practiceProgress.history('guitar'),piano:App.practiceProgress.history('piano')};});
 ok(tempo.status==='complete'&&tempo.history.length===2&&tempo.history.some(s=>s.mode==='tempo'&&s.matched===4)&&!tempo.piano.length,'explicit rhythm correction/review enables actual Tempo grading with a second distinct canonical instrument session');
 await page.reload();await page.waitForFunction(()=>window.App&&App.active&&window.SLMusicLibrary);await page.evaluate(async p=>{App.switchTo('score');await SLScoreReview.open(p.itemId);},flowSource);await page.waitForFunction(()=>!SLScoreReview.snapshot().busy);
 const reopened=await page.evaluate(async()=>({s:SLScoreReview.snapshot(),sessions:App.practiceProgress.history('guitar'),bytes:[...await SLMusicLibrary.getOriginal(SLScoreReview.snapshot().item.id)]}));
 ok(reopened.s.item.original.sha256===flowSource.hash&&reopened.s.revision.recognition.regions[0].engine.modelSha256===manifest.model.sha256&&reopened.s.revision.editor.rows.every(r=>r.verified)&&reopened.sessions.length===2,'reload reopens the same original, corrected reviewed targets, model provenance and both canonical sessions');
 // Raster-only PDF: the inference input is PDF.js-rendered pixels, never its
 // authored truth or a text/SVG representation. Read truth only AFTER output.
 const pdfFixture=path.join(__dirname,'fixtures/omr/corpus/17-page-treble-quarters-clean.pdf');
 await page.setInputFiles('#sr-file',pdfFixture);await page.waitForFunction(()=>SLScoreReview.snapshot().item.original.kind==='pdf'&&!SLScoreReview.snapshot().busy);
 const pdfOriginal=await page.evaluate(()=>({id:SLScoreReview.snapshot().item.id,hash:SLScoreReview.snapshot().item.original.sha256}));
 await ui.locator('[data-omr=detect]').click();await ui.locator('[data-omr=selection]').waitFor({state:'visible'});
 ok(await ui.locator('.omr-region input[type=radio]').count()===2&&await ui.locator('.omr-region input[type=radio]:checked').count()===0&&await ui.locator('[data-omr=run]').isDisabled(),'actual two-staff PDF requires choosing exactly one staff instead of recognizing or combining the full page');
 await ui.locator('.omr-region input[type=radio]').first().check();await ui.locator('[data-omr=monophonic]').check();await ui.locator('[data-omr=run]').click();await page.waitForFunction(()=>!document.querySelector('#sr-recognition [data-omr=save]').disabled,null,{timeout:120000});
 const pdfAutomatic=await ui.locator('[data-omr=raw]').textContent().then(JSON.parse);
 const truth=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/omr/corpus/17-page-treble-quarters.truth.json'))),pdfPitches=pdfAutomatic.results[0].events.filter(e=>!e.rest).map(e=>e.midi),truthPitches=truth.parts[0].events.filter(e=>e.type==='note').map(e=>e.midi);
 ok(pdfAutomatic.results.length===1&&pdfPitches.length>0&&pdfAutomatic.results[0].rawTokens.length>0&&pdfAutomatic.results[0].events.every(e=>!e.verified&&e.confidence===null),'a real raster-only PDF produces events and raw tokens from only the selected staff, all still unverified');
 console.log('  OBSERVED PDF selected-staff pitches:',pdfPitches.join(','),'authored prefix equal:',pdfPitches.every((m,i)=>m===truthPitches[i]),'(measurement after inference, not an input or blanket accuracy claim)');
 await ui.locator('[data-omr=save]').click();await page.waitForFunction(()=>SLScoreReview.snapshot().revision&&SLScoreReview.snapshot().revision.recognition&&!SLScoreReview.snapshot().busy);
 const pdfSaved=await page.evaluate(async()=>({s:SLScoreReview.snapshot(),original:[...await SLMusicLibrary.getOriginal(SLScoreReview.snapshot().item.id)],sessions:App.practiceProgress.history('guitar').length}));
 ok(pdfSaved.s.item.id===pdfOriginal.id&&pdfOriginal.hash==='4ee35529c94362f92b100048818a2ad43670a719141977b90da8ab8909b680bb'&&Buffer.from(pdfSaved.original).equals(fs.readFileSync(pdfFixture)),'PDF recognition saves a separate draft while keeping the pinned original PDF identity and every byte');
 ok(pdfSaved.s.revision.editor.rows.every(r=>!r.verified)&&!pdfSaved.s.revision.editor.rhythmKnown&&pdfSaved.s.revision.recognition.regions[0].rawTokens.length===pdfAutomatic.results[0].rawTokens.length&&pdfSaved.sessions===2,'actual PDF draft retains all raw model evidence and requires review without adding practice credit');
 for(const theme of ['light','dark']){await page.evaluate(t=>App.setTheme(t),theme);await page.setViewportSize({width:390,height:1000});await page.screenshot({path:path.join(evidenceDir,'omr-ui-'+theme+'.png'),fullPage:true});}
 for(const width of [360,390,1440]){await page.setViewportSize({width,height:900});await page.evaluate(()=>App.setTheme('light'));ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'recognition source card fits '+width+'px without page overflow');}
 ok(!errors.length,'recognition lifecycle has no browser exceptions: '+errors.join('; '));
 await context.close();
}finally{await browser.close();}console.log('ALL PASS ('+checks+' checks; controlled UI replies are not accuracy evidence)');})().catch(error=>{console.error(error);process.exitCode=1;});
