/* One instrument XP balance: App.practiceProgress owns all new awards.
 * xp.* and historical course records remain read-only Legacy / unassigned.
 * lesson.observations.v1 stores instrument-specific knowledge statistics;
 * lesson.pending.v1 retains exact unsaved canonical sessions for retry/export.
 * Background wake timers and anonymous practice never award XP.
 */
(function () {
  'use strict';
  var GOALS=[20,50,100,150], GOAL_NAMES={20:'Casual',50:'Regular',100:'Serious',150:'Intense'};
  var PAR={choice:4000,ear:6500,play:9000},PLAY_DAY=300;
  var now=function(){return new Date();},days=null;
  function pad(n){return n<10?'0'+n:''+n;}
  function dayKey(d){d=d||now();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function fromKey(k){var p=k.split('-');return new Date(+p[0],+p[1]-1,+p[2],12);}
  function addDays(k,n){var d=fromKey(k);d.setDate(d.getDate()+n);return dayKey(d);}
  function get(k,fallback){var v=App.store.get(k,fallback);return v==null?fallback:v;}
  function set(k,v){App.store.set(k,v);}
  function D(){if(!days){days=get('xp.days',{});if(!days||typeof days!=='object')days={};}return days;}
  function total(){return Math.max(0,Math.round(+get('xp.total',0)||0));}
  function goal(){return +get('xp.goal',50)||50;}
  function levelOf(xp){var lv=1,need=40,rest=xp;while(rest>=need){rest-=need;lv++;need=40+20*(lv-1);}return {lv:lv,into:rest,need:need,title:'Legacy player'};}
  // Historical xp.* is intentionally read-only. New lesson observations and
  // all new awards use the same instrument ledger as guided performance.
  var IDS = ['piano','synth','guitar','bass','drums','voice','other'];
  var OBS = 'lesson.observations.v1', PENDING = 'lesson.pending.v1';
  var sessions = Object.create(null), facades = {}, pendingMemory=null, observationMemory=null, observationsDirty=false;
  function selected() { return App.practiceInstrument ? App.practiceInstrument.get() : 'piano'; }
  function valid(id) { return IDS.indexOf(id) >= 0; }
  function timestamp() { return now().getTime(); }
  function refreshDot(){if(!App.practiceProgress||!document.documentElement)return;var p=summary(selected());document.documentElement.classList.toggle('goal-due',p.currentXP>0&&!p.today.qualifies);}
  function scopedDay(){return App.practiceProgress?App.practiceProgress.dayKey(timestamp()):dayKey();}
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function observationData(){if(observationMemory===null)observationMemory=get(OBS,{});return observationMemory;}
  function observations(id) { var all=observationData(); return all[id] || {days:{},sprints:{},jump:-1}; }
  function persistObservations(){var snapshot=JSON.stringify(observationData());set(OBS,observationData());if(JSON.stringify(get(OBS,null))!==snapshot)throw new Error('Lesson observations could not be persisted.');}
  function saveObservation(id, fn) { var all=observationData(),o=all[id]||(all[id]={days:{},sprints:{},jump:-1});fn(o);try{persistObservations();observationsDirty=false;}catch(e){observationsDirty=true;showPending();App.emit('xp:observation-error',{instrument:id,message:e.message});} }
  function summary(id) { return App.practiceProgress ? App.practiceProgress.summary(id) : {currentXP:0,lifetimeEarnedXP:0,level:1,currentStreak:0,bestStreak:0,today:{earnedXP:0,engagedSeconds:0},daily:[]}; }
  function beginSession(o) {
    o=o||{}; var id=o.id||o.sessionId, instrument=o.instrument;
    if(typeof id!=='string'||!id.trim()||id.length>128||!Number.isFinite(timestamp()))return null;
    if(!id||!valid(instrument))return null;
    if(sessions[id])return sessions[id].instrument===instrument?id:null;
    var previous=null;if(App.practiceProgress)IDS.some(function(i){previous=App.practiceProgress.history(i).filter(function(s){return s.id===id;})[0];return !!previous;});
    var unsaved=pending().filter(function(s){return s.id===id;})[0];if(previous||unsaved){var old=previous||unsaved;if(old.instrument!==instrument)return null;sessions[id]={id:id,instrument:instrument,finished:true,result:{bonus:0,duplicate:!!previous,error:!!unsaved,pending:!!unsaved}};return id;}
    sessions[id]={id:id,instrument:instrument,source:o.source||'lesson',startedAt:timestamp(),lastAt:timestamp(),seconds:0,segments:[],answers:Object.create(null),finished:false};
    return id;
  }
  function answerScoped(o) {
    o=o||{};var id=o.sessionId,r=sessions[id];
    if(!r||r.finished||r.instrument!==o.instrument)return {xp:0,fast:false,ignored:true};
    var key=String(o.answerId==null?'answer-'+Object.keys(r.answers).length:o.answerId);
    if(r.answers[key])return {xp:0,fast:false,duplicate:true};
    var at=timestamp();if(!Number.isFinite(at)||at<r.lastAt)return {xp:0,ignored:true};r.answers[key]=true;var rawMs=Math.max(0,Math.min(Number(o.ms)||0,Math.max(0,at-r.lastAt))),ms=Math.min(rawMs,5000);
    r.lastAt=at;r.seconds+=ms/1000;if(ms)r.segments.push({startedAt:at-ms,endedAt:at,engagedSeconds:ms/1000});
    saveObservation(r.instrument,function(all){var d=all.days[scopedDay()]||(all.days[scopedDay()]={x:0,s:0,p:0,q:0,k:0,l:0,u:{}});d.q++;d.s+=ms/1000;if(o.ok)d.k++;if(o.unit){var u=d.u[o.unit]||(d.u[o.unit]=[0,0,0]);u[2]++;if(o.ok){u[0]++;u[1]+=rawMs;}}});
    return {xp:0,fast:!!(o.ok&&rawMs>0&&rawMs<(PAR[o.kind]||PAR.choice))};
  }
  function pending() {if(pendingMemory===null){var p=get(PENDING,[]);pendingMemory=Array.isArray(p)?p:[];}return clone(pendingMemory); }
  function retainPending(list){pendingMemory=clone(list);try{set(PENDING,list);}catch(e){/* The in-memory export remains available even when all storage is full. */}}
  function saveSession(input) {
    var result=App.practiceProgress&&App.practiceProgress.recordSession(input),list=pending().filter(function(s){return s.id!==input.id;});
    if(!result||!result.ok){list.push(input);retainPending(list);showPending();App.emit('xp:save-error',{sessionId:input.id,instrument:input.instrument,errors:result&&result.errors||['Practice progress is unavailable.']});return {bonus:0,error:true,pending:true,sessionId:input.id};}
    retainPending(list);showPending();App.emit('practiceprogress:changed',{instrument:input.instrument});App.emit('xp',{instrument:input.instrument,total:result.summary.currentXP,gained:result.accepted?result.session.earnedXP:0});
    var saved={bonus:result.accepted?result.session.earnedXP:0,duplicate:!!result.duplicate,goalHit:false,streak:result.summary.currentStreak,extended:false,freezeEarned:false};if(sessions[input.id])sessions[input.id].result=saved;return saved;
  }
  function finishScoped(o) {
    o=o||{};var r=sessions[o.sessionId];
    if(!r||r.instrument!==o.instrument)return {bonus:0,ignored:true};
    if(r.finished)return {bonus:0,duplicate:true,error:!!(r.result&&r.result.error),pending:!!(r.result&&r.result.pending)};
    var end=timestamp();if(!Number.isFinite(end)||end<r.lastAt)end=r.lastAt;r.finished=true;var m=o.metrics||{},musical=!!o.metrics;
    var engaged=Math.min(Math.max(0,(end-r.startedAt)/1000),musical?Math.max(0,Number(m.engagedSeconds)||0):r.seconds);
    var input={id:r.id,instrument:r.instrument,startedAt:r.startedAt,endedAt:Math.max(r.startedAt,end),engagedSeconds:engaged,mode:musical?(o.mode||'lesson-play'):'knowledge',status:o.status==='stopped'?'stopped':'complete',expected:musical?(m.expected||0):0,matched:musical?(m.matched||0):0,missed:musical?(m.missed||0):0,extra:musical?(m.extra||0):0,wrong:musical?(m.wrong||0):0,timingSamples:0,sumAbsTimingMs:0,sumTimingMs:0,tempo:null};
    saveObservation(r.instrument,function(all){var d=all.days[scopedDay()]||(all.days[scopedDay()]={x:0,s:0,p:0,q:0,k:0,l:0,u:{}});if(o.status!=='stopped')d.l++;});
    if(!musical)input.segments=r.segments.slice();
    r.result=saveSession(input);return r.result;
  }
  function retryPending() {if(observationsDirty){try{persistObservations();observationsDirty=false;}catch(e){/* Keep the observations in the export until storage recovers. */}}var results=pending().map(saveSession);showPending();return results;}
  function showPending(){var box=document.getElementById('lesson-progress-unsaved');if(!pending().length&&!observationsDirty){if(box)box.remove();return;}if(!box){box=document.createElement('aside');box.id='lesson-progress-unsaved';box.className='card';box.setAttribute('role','status');box.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:9999;max-width:640px;margin:auto';document.body.appendChild(box);}box.innerHTML='<p>Lesson progress was not saved. Retry or export the original observations before closing this page.</p><button type="button" class="btn" data-lesson-retry>Retry save</button> <button type="button" class="btn" data-lesson-export>Export unsaved</button>';box.querySelector('[data-lesson-retry]').onclick=retryPending;box.querySelector('[data-lesson-export]').onclick=function(){var url=URL.createObjectURL(new Blob([api.exportPending()],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='soundlab-unsaved-lessons.json';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);};}

  function facade(id) {
    if(!valid(id))throw new RangeError('Choose an explicit supported instrument.');
    if(facades[id])return facades[id];
    function h(n){n=Math.max(1,Math.min(3660,Math.floor(n||30)));var o=observations(id),p=App.practiceProgress?App.practiceProgress.summary(id,{rangeDays:n}):summary(id),by={};(p.daily||[]).forEach(function(d){by[d.date]=d;});var out=[],k=addDays(scopedDay(),1-n);for(var i=0;i<n;i++,k=addDays(k,1)){var d=Object.assign({x:0,s:0,p:0,q:0,k:0,l:0,u:{}},o.days[k]||{}),a=by[k]||{};out.push(Object.assign(d,{key:k,x:a.earnedXP||0,p:a.engagedSeconds||0,a:{},active:!!a.qualifies,frozen:false}));}return out;}
    function sp(unit,from,to){var o=observations(id),n=0,ms=0,only=unit?(Array.isArray(unit)?unit:[unit]):null;Object.keys(o.days).forEach(function(k){if(from&&k<from||to&&k>=to)return;var u=o.days[k].u||{};Object.keys(u).forEach(function(key){if(!only||only.indexOf(key)>=0){n+=u[key][0];ms+=u[key][1];}});});return {n:n,avg:n?ms/n:0};}
    function st(){var p=summary(id);return {n:p.currentStreak||0,best:p.bestStreak||0,today:!!p.today.qualifies,freezes:0};}
    var api={GOALS:GOALS,GOAL_NAMES:GOAL_NAMES,instrument:id,total:function(){return summary(id).currentXP;},goal:function(){return App.practiceProgress?App.practiceProgress.getSettings().dailyMinutes:10;},setGoal:function(g){if(App.practiceProgress)App.practiceProgress.updateSettings({dailyMinutes:+g});},level:function(){var p=summary(id),settings=App.practiceProgress&&App.practiceProgress.getSettings(),need=settings?settings.xpPerLevel:100;return {lv:p.level||1,into:p.currentXP%need,need:need,title:'Consistency'};},levelOf:levelOf,today:function(){return h(1)[0];},streak:st,history:h,speed:sp,speedWeeks:function(w,unit){var out=[],end=addDays(scopedDay(),1);for(var i=w-1;i>=0;i--){var to=addDays(end,-7*i),from=addDays(to,-7),v=sp(unit,from,to);out.push({from:from,to:addDays(to,-1),n:v.n,avg:v.avg});}return out;},totals:function(){var t={q:0,k:0,s:0,p:summary(id).totalEngagedSeconds||0,l:0,days:0};Object.keys(observations(id).days).forEach(function(k){var d=observations(id).days[k];['q','k','s','l'].forEach(function(a){t[a]+=d[a]||0;});if(d.l)t.days++;});return t;},unitStats:function(){var out={};Object.keys(observations(id).days).forEach(function(k){var u=observations(id).days[k].u||{};Object.keys(u).forEach(function(a){var v=out[a]||(out[a]={ok:0,asked:0,ms:0});v.ok+=u[a][0];v.ms+=u[a][1];v.asked+=u[a][2];});});return out;},areas:function(){return [{area:'Explicit '+id+' practice',s:summary(id).totalEngagedSeconds||0}];},answer:function(o){return answerScoped(Object.assign({},o,{instrument:id}));},finishLevel:function(o){return finishScoped(Object.assign({},o,{instrument:id}));},practice:function(){return {xp:0,ignored:true};},sprintBest:function(k){return observations(id).sprints[k]||0;},sprintRecord:function(k,score){var old=observations(id).sprints[k]||0;saveObservation(id,function(o){o.sprints[k]=Math.max(old,score);});return {best:Math.max(old,score),old:old,isBest:score>old};},sprints:function(){return clone(observations(id).sprints);},jump:function(){return observations(id).jump;},setJump:function(i){saveObservation(id,function(o){o.jump=Math.max(o.jump,i);});},dayKey:function(d){return App.practiceProgress?App.practiceProgress.dayKey(d?d.getTime():timestamp()):dayKey(d);},addDays:addDays,refresh:function(){refreshDot();App.emit('xp',{instrument:id,total:summary(id).currentXP,gained:0});}};
    facades[id]=api;return api;
  }
  var api={GOALS:GOALS,GOAL_NAMES:GOAL_NAMES,PLAY_DAY:PLAY_DAY,dayKey:dayKey,addDays:addDays,levelOf:levelOf,beginSession:beginSession,answer:answerScoped,finishLevel:finishScoped,forInstrument:facade,pending:pending,retryPending:retryPending,exportPending:function(){return JSON.stringify({unrecordedLessonSessions:pending(),unrecordedLessonObservations:observationsDirty?clone(observationData()):null},null,2);},legacy:function(){return {label:'Legacy / unassigned',total:total(),days:clone(D()),sprints:clone(get('xp.sprint',{})),goal:goal()};},_now:function(fn){now=fn||function(){return new Date();};},_reload:function(){days=null;sessions=Object.create(null);facades={};if(!observationsDirty)observationMemory=null;},_tick:function(){}};
  ['total','goal','setGoal','level','today','streak','history','speed','speedWeeks','totals','unitStats','practice','areas','sprintBest','sprintRecord','sprints','jump','setJump','refresh'].forEach(function(k){api[k]=function(){var f=facade(selected());return f[k].apply(f,arguments);};});
  window.SLXP=App.xp=api;
  ['learn:instrument','practice:progress','practiceprogress:changed'].forEach(function(event){App.on(event,refreshDot);});
  setTimeout(refreshDot,0);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showPending);else showPending();
})();
