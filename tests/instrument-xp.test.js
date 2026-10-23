// Actual app/core integration with injected wall clocks. No hardware/audio capture.
const { chromium } = require('playwright');
const env = require('./env');
let checks = 0;
function ok(v, m) { if (!v) throw new Error(m); checks++; console.log('  PASS', m); }
const near = (a, b) => Math.abs(a-b)<0.00001;
(async()=>{
 const browser=await chromium.launch({executablePath:env.CHROMIUM,args:['--autoplay-policy=no-user-gesture-required']});
 try {
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true});
  await context.addInitScript(()=>{
   ['help.seen','help.done','qz.landed'].forEach(k=>localStorage.setItem('guitarlab.'+k,'true'));
   const old={'xp.total':321,'xp.days':{'1999-01-01':{x:321,s:9,q:4,k:3,l:1,u:{old:[3,9000,4]}}},'xp.sprint':{old:8},'xp.jump':3,'xp.goal':100,'xp.frozen':['1999-01-02'],'xp.freeze':2,'xp.best':4,'qz.prog':{old:{s:3}},'kl.prog':{},'ws.xp':456};
   for(const [k,v] of Object.entries(old))localStorage.setItem('guitarlab.'+k,JSON.stringify(v));
   window.__legacy=Object.fromEntries(Object.keys(old).map(k=>[k,localStorage.getItem('guitarlab.'+k)]));
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(env.URL);await page.waitForFunction(()=>window.SLXP&&App.practiceInstrument&&App.practiceProgress&&App.keysLessons);
  await page.evaluate(()=>{
   window.__t=Date.parse('2026-10-23T12:00:00Z');SLXP._now(()=>new Date(__t));
   App.practiceProgress=new PracticeProgress({store:App.store,now:()=>__t,timezone:()=> 'UTC'});
   App.practiceProgress.updateSettings({xpPerMinute:12,xpPerCorrectNote:100,correctNoteXPCap:1000,decayEnabled:false});
   window.__step=ms=>{__t+=ms;};
   window.__answer=(id,answerId,ms=45000,instrument='piano')=>SLXP.answer({sessionId:id,instrument,answerId,ok:true,ms,unit:'note-name',kind:'choice'});
  });
  console.log('# one configured instrument balance, historical totals untouched');
  const initial=await page.evaluate(()=>({legacy:SLXP.legacy(),scoped:SLXP.forInstrument('piano').total(),stored:Object.fromEntries(Object.keys(__legacy).map(k=>[k,localStorage.getItem('guitarlab.'+k)])),original:__legacy}));
  ok(initial.legacy.total===321&&initial.legacy.label==='Legacy / unassigned','historical global XP is explicitly legacy/unassigned');
  ok(initial.scoped===0,'new piano balance does not inherit historical global XP');
  ok(JSON.stringify(initial.stored)===JSON.stringify(initial.original),'startup preserves every seeded historical key bytewise, including ancient days');
  const knowledge=await page.evaluate(()=>{
   SLXP.beginSession({id:'knowledge-one',instrument:'piano',source:'quiz'});__step(1000);__answer('knowledge-one','a');__step(60000);__answer('knowledge-one','b');
   __answer('knowledge-one','b');const done=SLXP.finishLevel({sessionId:'knowledge-one',instrument:'piano',passed:true,perfect:true});
   const repeated=SLXP.finishLevel({sessionId:'knowledge-one',instrument:'piano',passed:true});
   return {done,repeated,history:App.practiceProgress.history('piano'),summary:App.practiceProgress.summary('piano'),stats:SLXP.forInstrument('piano').totals()};
  });
  const k=knowledge.history[0];
  ok(knowledge.history.length===1&&near(k.engagedSeconds,6),'question engagement is capped by elapsed wall time and five seconds per answer');
  ok(k.expected===0&&k.matched===0&&k.extra===0&&k.timingSamples===0&&k.meanAbsTimingMs==null,'knowledge questions never become musical notes or timing observations');
  ok(near(k.earnedXP,1.2)&&near(knowledge.summary.currentXP,1.2),'knowledge engagement uses the canonical configured minute XP, without duplicate answer bonuses');
  ok(knowledge.stats.q===2&&knowledge.stats.k===2,'duplicate answer IDs do not inflate instrument question statistics');
  ok(knowledge.repeated.bonus===0&&knowledge.repeated.duplicate,'repeated level completion reports no new award');
  ok(k.segments.length===2&&k.segments[0].endedAt<k.segments[1].startedAt,'observed question segments preserve idle gaps');
  const frozen=await page.evaluate(()=>{
   SLXP.beginSession({id:'frozen-instrument',instrument:'synth',source:'quiz'});__step(2000);__answer('frozen-instrument','a',2000,'synth');App.practiceInstrument.set('bass');
   const wrong=SLXP.finishLevel({sessionId:'frozen-instrument',instrument:'bass'});const right=SLXP.finishLevel({sessionId:'frozen-instrument',instrument:'synth',status:'stopped'});
   return {wrong,right,synth:App.practiceProgress.history('synth'),bass:App.practiceProgress.history('bass'),facade:SLXP.forInstrument('synth').total()};
  });
  ok(frozen.wrong.ignored&&frozen.bass.length===0,'a stale run cannot be reassigned to a newly selected instrument');
  ok(frozen.synth.length===1&&frozen.synth[0].status==='stopped'&&near(frozen.facade,.4),'a stopped session records its original instrument through the same canonical ledger');
  const proto=await page.evaluate(()=>{
   const start=SLXP.beginSession({id:'__proto__',instrument:'guitar',source:'quiz'});__step(1000);__answer('__proto__','constructor',1000,'guitar');
   __answer('__proto__','constructor',1000,'guitar');SLXP.finishLevel({sessionId:'__proto__',instrument:'guitar'});
   return {start,stats:SLXP.forInstrument('guitar').totals(),history:App.practiceProgress.history('guitar')};
  });
  ok(proto.start==='__proto__'&&proto.history.length===1&&proto.stats.q===1,'session and answer IDs cannot collide with object prototype names');
  const response=await page.evaluate(()=>{SLXP.beginSession({id:'long-response',instrument:'piano',source:'quiz'});__step(60000);const answer=SLXP.answer({sessionId:'long-response',instrument:'piano',answerId:'a',ok:true,ms:60000,unit:'long-response',kind:'ear'});SLXP.finishLevel({sessionId:'long-response',instrument:'piano'});return {answer,speed:SLXP.forInstrument('piano').speed('long-response'),session:App.practiceProgress.history('piano').find(s=>s.id==='long-response')};});
  ok(response.speed.avg===60000&&!response.answer.fast&&response.session.engagedSeconds===5,'sixty-second response speed remains observed while XP engagement stays capped to five seconds');
  const replayed=await page.evaluate(()=>{const before=SLXP.forInstrument('piano').totals().q;SLXP._reload();SLXP.beginSession({id:'knowledge-one',instrument:'piano',source:'quiz'});__step(1000);const answer=__answer('knowledge-one','new');const finish=SLXP.finishLevel({sessionId:'knowledge-one',instrument:'piano'});return {before,after:SLXP.forInstrument('piano').totals().q,answer,finish};});
  ok(replayed.before===replayed.after&&replayed.answer.ignored&&replayed.finish.duplicate&&replayed.finish.bonus===0,'an already recorded session ID cannot create new question observations or XP after a facade reload');
  console.log('# storage failure retains the original observation and ID');
  const failed=await page.evaluate(()=>{
   SLXP.beginSession({id:'save-failed',instrument:'voice',source:'quiz'});__step(1000);__answer('save-failed','a',1000,'voice');
   window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Simulated all storage full','QuotaExceededError');};
   const result=SLXP.finishLevel({sessionId:'save-failed',instrument:'voice'});
   return {result,pending:SLXP.pending(),payload:JSON.parse(SLXP.exportPending()),visible:!!document.getElementById('lesson-progress-unsaved'),history:App.practiceProgress.history('voice')};
  });
  ok(failed.result.error&&failed.pending.length===1&&failed.visible,'a full-storage save failure remains visible and recoverable in memory');
  ok(failed.history.length===0&&failed.payload.unrecordedLessonSessions[0].id==='save-failed','failed saves retain the exact session payload for export without claiming XP');
  const recovered=await page.evaluate(()=>{Storage.prototype.setItem=__set;SLXP.retryPending();SLXP.retryPending();SLXP.finishLevel({sessionId:'save-failed',instrument:'voice'});return {history:App.practiceProgress.history('voice'),pending:SLXP.pending(),visible:!!document.getElementById('lesson-progress-unsaved')};});
  ok(recovered.history.length===1&&recovered.history[0].id==='save-failed'&&near(recovered.history[0].earnedXP,.2),'retry saves the retained stable ID and awards exactly once');
  ok(!recovered.pending.length&&!recovered.visible,'successful retry clears the unsaved warning and queue');
  const observationFailure=await page.evaluate(()=>{SLXP.beginSession({id:'observation-failed',instrument:'bass',source:'quiz'});__step(1000);window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='guitarlab.lesson.observations.v1')return;return __set.call(this,key,value);};SLXP.answer({sessionId:'observation-failed',instrument:'bass',answerId:'a',ok:true,ms:1000,unit:'retained-question'});const payload=JSON.parse(SLXP.exportPending());return {payload,stats:SLXP.forInstrument('bass').unitStats(),visible:!!document.getElementById('lesson-progress-unsaved')};});
  ok(observationFailure.visible&&observationFailure.stats['retained-question'].asked===1&&observationFailure.payload.unrecordedLessonObservations.bass,'silently dropped question-stat writes stay visible, readable in memory and exportable alongside XP observations');
  const observationRecovery=await page.evaluate(()=>{Storage.prototype.setItem=__set;SLXP.retryPending();SLXP.finishLevel({sessionId:'observation-failed',instrument:'bass'});return {saved:App.store.get('lesson.observations.v1').bass.days,visible:!!document.getElementById('lesson-progress-unsaved')};});
  ok(Object.values(observationRecovery.saved).some(d=>d.u['retained-question'])&&!observationRecovery.visible,'retry persists retained question observations and clears their warning');
  console.log('# observed segments allocate across midnight without spreading idle time');
  const midnight=await page.evaluate(()=>{
   __t=Date.parse('2026-10-24T23:59:58Z');SLXP.beginSession({id:'midnight-knowledge',instrument:'other',source:'quiz'});
   __step(1000);__answer('midnight-knowledge','before',1000,'other');__step(3602000);__answer('midnight-knowledge','after',100000,'other');SLXP.finishLevel({sessionId:'midnight-knowledge',instrument:'other'});
   return App.practiceProgress.history('other')[0];
  });
  ok(midnight.allocations.length===2&&near(midnight.allocations[0].engagedSeconds,1)&&near(midnight.allocations[1].engagedSeconds,5),'midnight allocation follows measured answer intervals, excluding the hour of idle time');
  ok(midnight.allocation==='measured-segments'&&near(midnight.earnedXP,1.2),'measured lesson allocations retain canonical earning provenance');
  const zone=await page.evaluate(()=>{App.practiceProgress.updateSettings({timezone:'America/Los_Angeles'});__t=Date.parse('2026-10-26T01:00:00Z');const day=SLXP.forInstrument('piano').dayKey();const today=SLXP.forInstrument('piano').today().key;App.practiceProgress.updateSettings({timezone:'UTC'});return {day,today};});
  ok(zone.day==='2026-10-25'&&zone.today===zone.day,'question dates and today marker follow the configured progress timezone');
  console.log('# no background, duplicate, or historical global awards');
  const preserved=await page.evaluate(()=>{
   for(let i=0;i<200;i++)SLXP._tick();SLXP.refresh();App.xp.practice(600,'Guitar');
   return {keys:Object.fromEntries(Object.keys(__legacy).map(k=>[k,localStorage.getItem('guitarlab.'+k)])),original:__legacy,legacy:SLXP.legacy().total};
  });
  ok(JSON.stringify(preserved.keys)===JSON.stringify(preserved.original)&&preserved.legacy===321,'wake ticks, refresh and retired anonymous practice cannot alter any historical key');
  console.log('# explicit shared-keyboard source context and cancellation');
  const lesson=await page.evaluate(()=>{
   App.emit('learn:lesson',{instrument:'synth',kind:'keys'});App.switchTo('piano');App.keysLessons.start(false);
   const r=App.keysLessons.run,first={instrument:r.instrument,id:r.sessionId,label:document.getElementById('pn-lessons').textContent};
   r.targets[0].j='perfect';App.keysLessons.stop();App.keysLessons.stop();
   const stopped=App.practiceProgress.history('synth').find(x=>x.id===first.id);App.switchTo('quiz');App.switchTo('piano');App.keysLessons.start(false);
   const manual=App.keysLessons.run.instrument;App.keysLessons.stop();return {first,stopped,manual};
  });
  ok(lesson.first.instrument==='synth'&&/Credit: synth/.test(lesson.first.label),'explicit Synth entry visibly freezes Synth credit for the shared keys lesson');
  ok(lesson.stopped&&lesson.stopped.instrument==='synth'&&lesson.stopped.matched===1&&lesson.stopped.expected>1,'stopped finite keys lesson retains its captured instrument, known targets and partial observation');
  ok(lesson.manual==='piano','leaving the shared keys page clears a stale Synth entry before manual Piano practice');
  const scopedLessons=await page.evaluate(()=>{const all=App.store.get('kl.prog',{});all['c-r']={step:2,passed:1,mastered:false,best:{0:100},inf:{0:90},runs:[{d:'2026-10-20',sc:100,t:1,inf:90},{instrument:'piano',sessionId:'old-piano',d:'2026-10-21',sc:70,t:30,inf:5},{instrument:'synth',sessionId:'old-synth',d:'2026-10-22',sc:80,t:20,inf:8}]};App.store.set('kl.prog',all);return {piano:App.keysLessons.summary('piano').find(r=>r.id==='c-r'),synth:App.keysLessons.summary('synth').find(r=>r.id==='c-r'),bass:App.keysLessons.summary('bass')};});
  ok(scopedLessons.piano.runs===1&&scopedLessons.piano.best===70&&scopedLessons.piano.timing===30&&scopedLessons.piano.streak===5,'Piano personal lesson observations exclude Synth and historical unassigned results');
  ok(scopedLessons.synth.runs===1&&scopedLessons.synth.best===80&&scopedLessons.synth.timing===20&&scopedLessons.synth.streak===8&&scopedLessons.bass.length===0,'Synth personal observations remain independent while empty categories stay empty');
  ok(scopedLessons.piano.curriculumShared&&scopedLessons.piano.level===3,'shared keyboard curriculum unlocks remain explicitly identified independently of personal observations');
  const entry=await page.evaluate(()=>{App.practiceInstrument.set('bass');App.emit('learn:practice',{instrument:'bass'});App.switchTo('shed');const text=document.getElementById('panel-shed').textContent;Woodshed.performanceStart(Woodshed.guidedScore('melody'),'wait',{countIn:0});return {label:text,instrument:document.getElementById('pf-instrument').value,legacy:App.store.get('ws.xp')};});
  ok(entry.instrument==='bass'&&/Woodshed · bass/.test(entry.label)&&/Practice credit: bass/.test(entry.label),'Learn Bass entry visibly carries Bass credit into Woodshed and performance');
  ok(entry.legacy===456&&/Legacy \/ unassigned/.test(entry.label),'historical Woodshed XP remains explicitly unassigned and unchanged');
  ok(!errors.length,'actual browser integration has no uncaught errors: '+errors.join('; '));
  console.log('ALL PASS '+checks);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
