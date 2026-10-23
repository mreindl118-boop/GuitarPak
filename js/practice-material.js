/* One launch seam for saved material. Source identity is separate from the
 * chosen performance instrument and canonical XP. Library files stay local.
 * Resume restores a section/setup and starts a NEW attempt, never held keys or
 * an old scoring clock. A small history sidecar links real saved session IDs. */
(function () {
  'use strict';
  var HISTORY='practice.material.sessions.v1', PENDING='practice.material.pending.v1', SELECTION='practice.material.selection.v1';
  var IDS=['piano','synth','guitar','bass','drums','voice','other'];
  var pending=App.store.get(PENDING,[]), message='';
  if(!Array.isArray(pending))pending=[];
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function fingerprint(score){
    var text=JSON.stringify({title:score.title,bpm:score.bpm,len:score.len,notes:score.notes,timingOk:score.timingOk,rhythmKnown:score.rhythmKnown,capabilities:score.capabilities,instrument:score.instrument,source:score.source});
    var h=2166136261;for(var i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
    return 'local-'+(h>>>0).toString(16)+'-'+text.length;
  }
  function validScore(score){
    if(!score||!Array.isArray(score.notes)||!score.notes.length||score.notes.length>50000)throw Error('Choose a nonempty structured score (at most 50,000 notes).');
    if(!Number.isFinite(score.bpm)||score.bpm<=0||score.bpm>1000||!Number.isFinite(score.len)||score.len<=0||score.len>1000000)throw Error('The score needs reviewed finite tempo and length.');
    if(score.notes.some(function(n){return !n||!Number.isFinite(n.t)||n.t<0||!Number.isFinite(n.d)||n.d<0||n.t+n.d>score.len+.000001||!n.rest&&(!Number.isInteger(n.m)||n.m<0||n.m>127);}))throw Error('Correct invalid pitches, starts or durations before practice.');
    if(!score.notes.some(function(n){return !n.rest;}))throw Error('This selection contains no pitched notes.');
    return copy(score);
  }
  function same(a,b){return !!a&&!!b&&a.kind===b.kind&&String(a.adaptation||'')===String(b.adaptation||'')&&(a.kind==='library'?a.itemId===b.itemId&&a.revisionId===b.revisionId&&(!b.fingerprint||a.fingerprint===b.fingerprint):a.id===b.id&&(!b.fingerprint||a.fingerprint===b.fingerprint));}
  function loadHistory(){var h=App.store.get(HISTORY,null);if(h===null)return {version:1,sessions:[]};if(!h||h.version!==1||!Array.isArray(h.sessions))throw Error('Material history is unsupported or corrupt; recover/export it before changing it.');return h;}
  function save(key,value){
    var result=App.store.write?App.store.write(key,value):null;
    if(!App.store.write)App.store.set(key,value);
    if(result&&!result.ok||JSON.stringify(App.store.get(key,null))!==JSON.stringify(value))throw Error('Material history could not be saved. Retry or export before closing.');
  }
  function history(material,instrument){return copy(loadHistory().sessions.filter(function(r){return same(r.material,material)&&(!instrument||r.session.instrument===instrument);}));}
  function banner(){
    if(!document.body)return;
    var box=document.getElementById('material-history-unsaved');
    if(!pending.length&&!message){if(box)box.remove();return;}
    if(!box){box=document.createElement('aside');box.id='material-history-unsaved';box.className='card';box.setAttribute('role','status');document.body.appendChild(box);}
    box.textContent='';var p=document.createElement('p');p.textContent=message||'Material history is waiting to save. Canonical practice credit is already stored.';box.appendChild(p);
    [['Retry history',retry],['Export unsaved history',function(){var u=URL.createObjectURL(new Blob([JSON.stringify({format:'soundlab-pending-material-history',version:1,sessions:pending},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='soundlab-unsaved-material-history.json';a.click();setTimeout(function(){URL.revokeObjectURL(u);},1000);}]].forEach(function(row){var b=document.createElement('button');b.className='btn sm';b.type='button';b.textContent=row[0];b.onclick=row[1];box.appendChild(b);});
  }
  function record(event){
    if(!event||event.recorded!==true||!event.material||!event.session)return;
    var material=copy(event.material),session=copy(event.session),entry={id:session.id,sessionId:session.id,material:material,session:session};
    try{
      var canonical=App.practiceProgress&&App.practiceProgress.history(session.instrument).find(function(r){return r.id===session.id;});
      if(!canonical)throw Error('Canonical session is not available yet; material history remains pending.');
      session=copy(canonical);entry.session=session;
      var all=loadHistory(),old=all.sessions.find(function(r){return r.sessionId===session.id;});
      if(old){if(!same(old.material,material)||old.session.instrument!==session.instrument)throw Error('A session ID already belongs to different material.');return;}
      all.sessions.push(entry);save(HISTORY,all);message='';
      App.emit('material:history',{material:material,sessionId:session.id,instrument:session.instrument});
    }catch(error){if(!pending.some(function(r){return r.sessionId===entry.sessionId;}))pending.push(entry);try{save(PENDING,pending);}catch(e){/* Keep exact originals exportable even when storage is unavailable. */}message=error.message;banner();}
  }
  function retry(){var queued=pending.slice();pending=[];message='';queued.forEach(function(r){record({recorded:true,material:r.material,session:r.session});});try{save(PENDING,pending);}catch(error){message=error.message;}banner();return {ok:!pending.length&&!message,pending:pending.length};}
  function launchScore(input,options){
    options=options||{};
    try{
      if(App.interactionBlocked)throw Error('Wait for the current save, recovery or update to finish.');
      var score=validScore(input),instrument=options.instrument||(App.practiceInstrument&&App.practiceInstrument.get());
      if(IDS.indexOf(instrument)<0)throw Error('Select the instrument you will actually practice.');
      if(instrument==='drums'&&score.instrument!=='drums')throw Error('Choose a percussion exercise for Drums, or select a pitched instrument.');
      if(!window.Woodshed||!window.PerformancePlayer)throw Error('Guided practice is unavailable in this app build.');
      var opts=Object.assign({},options,{instrument:instrument});
      if(score.rhythmKnown===false||options.rhythmKnown===false){score.rhythmKnown=false;opts.mode='wait';opts.rhythmKnown=false;}
      else opts.mode=options.mode==='tempo'?'tempo':'wait';
      if(opts.section){var a=opts.section.startBeat,z=opts.section.endBeat;if(!Number.isFinite(a)||!Number.isFinite(z)||a<0||z<=a||z>score.len)throw Error('Choose a valid section inside this score.');if(!score.notes.some(function(n){return !n.rest&&n.t>=a&&n.t<z;}))throw Error('This section has no target attacks. Select a passage containing notes.');}
      if(App.closeSheet)App.closeSheet();
      App.emit('transport:claim',{owner:'performance'});
      App.switchTo('shed');Woodshed.performanceStart(score,opts.mode,opts);
      // Player configure emits the actual clamped setup, including source
      // section and count-in, before this call returns.
      return {ok:true,material:opts.material||null,mode:PerformancePlayer.snapshot().mode};
    }catch(error){return {ok:false,error:error.message};}
  }
  function launchLegacy(id,options){
    options=options||{};var rows=App.store.get('ws.lib',[]),score=Array.isArray(rows)&&rows.find(function(s){return s.id===id;});
    if(!score)return {ok:false,error:'This saved exercise is missing. Select a material again.'};
    var adaptation=options.material&&options.material.adaptation;if(adaptation==='arpeggio')score=arpeggioScore(score);
    var current=fingerprint(score);if(options.expectedFingerprint&&options.expectedFingerprint!==current)return {ok:false,error:'This exercise changed. Review the updated material before starting.'};
    return launchScore(score,Object.assign({},options,{material:{kind:'legacy',id:id,fingerprint:current,adaptation:adaptation||''}}));
  }
  async function launchLibrary(payload,options){
    try{
      if(!window.SLMusicLibrary)throw Error('The local song library is unavailable.');
      var item=await SLMusicLibrary.getItem(payload.itemId),revision=await SLMusicLibrary.getRevision(payload.itemId,payload.revisionId);
      if(!item||item.deletedAt||!revision||revision.reviewState!=='reviewed'||revision.verified!==true||!revision.score||revision.sourceSha256!==item.original.sha256)throw Error('Save and verify a revision of this original before practice.');
      var score=copy(revision.score),mapping=payload.mapping||revision.mapping||{},section=payload.section;
      var selectedParts=payload.selectedPartIds||mapping.selectedPartIds||revision.editor&&revision.editor.selectedPartIds;
      if(selectedParts){
        if(!Array.isArray(selectedParts)||!selectedParts.length||selectedParts.some(function(id){return typeof id!=='string';}))throw Error('Select at least one actual score part.');
        selectedParts=Array.from(new Set(selectedParts)).sort();
        if(selectedParts.some(function(id){return !score.notes.some(function(n){return n.partId===id;});}))throw Error('A selected part has no targets in this revision. Review the mapping.');
        score.notes=score.notes.filter(function(n){return selectedParts.indexOf(n.partId)>=0;});
      }
      var rhythmKnown=revision.rhythmKnown!==false&&(!revision.editor||revision.editor.rhythmKnown!==false)&&(!score.capabilities||score.capabilities.tempo!==false)&&score.rhythmKnown!==false&&payload.rhythmKnown!==false;
      if(!rhythmKnown)score.rhythmKnown=false;
      var adaptation=options&&options.material&&options.material.adaptation;if(adaptation==='arpeggio')score=arpeggioScore(score);
      var opts=Object.assign({mode:payload.mode==='tempo'?'tempo':'wait',instrument:payload.instrument||mapping.instrument||(App.practiceInstrument&&App.practiceInstrument.get()),section:section,transpose:mapping.transpose||0,rhythmKnown:rhythmKnown},options||{}, {material:{kind:'library',id:payload.itemId,itemId:payload.itemId,revisionId:revision.id,selectedPartIds:selectedParts||null,adaptation:adaptation||'',fingerprint:adaptation?fingerprint(score):revision.dataSha256+':'+fingerprint(score)}});
      return launchScore(score,opts);
    }catch(error){return {ok:false,error:error.message};}
  }
  async function resume(){
    var saved=App.store.get(SELECTION,null);if(!saved||saved.version!==1||!saved.material)return {ok:false,error:'No saved material to continue.'};
    if(saved.material.kind==='library')return launchLibrary({itemId:saved.material.itemId,revisionId:saved.material.revisionId,section:saved.section,selectedPartIds:saved.material.selectedPartIds},saved);
    return launchLegacy(saved.material.id,Object.assign({},saved,{expectedFingerprint:saved.material.fingerprint}));
  }
  function arpeggioScore(source){var groups=PerformanceEngine.normalizeScore(source).groups,shift=0,notes=[];groups.forEach(function(g){g.entries.forEach(function(n,i){notes.push({m:n.midi,t:g.beat+shift+i*.5,d:g.notes.length>1?.45:n.duration,v:n.velocity});});shift+=Math.max(0,g.notes.length-1)*.5;});return Object.assign({},copy(source),{title:source.title+' · arpeggio',notes:notes,len:source.len+shift,source:'generated-arpeggio',importWarnings:(source.importWarnings||[]).concat(['Adapted single-note attacks, not the original chord performance.'])});}
  function remember(event){if(!event||!event.material)return;var selection=Object.assign({version:1},copy(event));App.store.set(SELECTION,selection);if(event.material.kind==='library'&&window.SLMusicLibrary)SLMusicLibrary.saveResume(event.material.itemId,Object.assign({},selection,{revisionId:event.material.revisionId})).catch(function(e){App.emit('library:change',{type:'save-error',message:e.message});});}
  window.PracticeMaterial={fingerprint:fingerprint,arpeggioScore:arpeggioScore,launchScore:launchScore,launchLegacy:launchLegacy,launchLibrary:launchLibrary,history:history,resume:resume,retry:retry,selection:function(){return copy(App.store.get(SELECTION,null));},checkpoint:function(){var r=retry();return {ok:r.ok,errors:r.ok?[]:['Material history still needs saving or export.']};}};
  App.on('performance:session',record);
  App.on('performance:setup',remember);
  App.on('library:practice',function(event){
    if(!event)return;
    (async function(){
      try{
        var settings={};
        if(event.selectionId){var list=await SLMusicLibrary.listSelections(event.itemId);settings=list.find(function(s){return s.id===event.selectionId&&s.revisionId===event.revisionId;});if(!settings)throw Error('This saved section is missing or belongs to a different revision.');}
        else if(event.resume)settings=await SLMusicLibrary.getResume(event.itemId,event.revisionId)||{};
        var result=await launchLibrary({itemId:event.itemId,revisionId:event.revisionId,mode:event.mode||settings.mode,section:settings.section,mapping:settings.mapping,selectedPartIds:settings.material&&settings.material.selectedPartIds},Object.assign({},settings,{mode:event.mode||settings.mode}));
        if(!result.ok)throw Error(result.error);
      }catch(error){App.emit('library:change',{type:'launch-error',message:error.message});}
    })();
  });
  if(window.SLScoreReview)SLScoreReview.configure({onLaunch:function(payload){return launchLibrary(payload);}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',banner);else banner();
})();
