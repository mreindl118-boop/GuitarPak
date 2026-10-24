/* Local source viewing and reviewed practice targets. Optional local recognition
 * produces unverified derivatives; this module is never an audio/MIDI writer.
 * Structured notation uses the selectively recovered SLScore format; source bytes and
 * immutable revisions belong to SLMusicLibrary. PDF.js is pinned in vendor/pdfjs. */
(function () {
  'use strict';
  var root, config = {}, item = null, original = null, revision = null, editor = null, notation = null, sourceScore = null;
  var dirty = false, busy = false, busyCount = 0, token = 0, pdf = null, renderTask = null, imageURL = null, pdfModule;
  var pageNumber = 1, pageCount = 1, zoom = 1, opened = false, serial = 0, editGeneration = 0;
  var recognitionTool = null, recognitionRenders = new Set();
  var INSTRUMENTS = ['piano','synth','guitar','bass','drums','voice','other'];
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function id(prefix) { return prefix + '-' + (++serial) + '-' + Date.now().toString(36); }
  function el(s) { return root && root.querySelector('#sr-' + s); }
  function lib() { var x = config.library || window.SLMusicLibrary; if (!x) throw new Error('The local music library is not available.'); return x; }
  function status(s, error) { if (el('status')) { el('status').textContent = s; el('status').classList.toggle('error',!!error); } }
  function beginBusy(){busyCount++;busy=true;buttons();}
  function endBusy(){busyCount=Math.max(0,busyCount-1);busy=busyCount>0;buttons();if(!busy)recognitionChanged();}
  function instrument() { return window.App && App.practiceInstrument ? App.practiceInstrument.get() : 'piano'; }
  function pitch(text) {
    var raw=/^MIDI:(\d{1,3})$/i.exec(text);if(raw){var midi=number(raw[1],'MIDI pitch',0,127);return {midi:midi,notation:'midi',label:'MIDI:'+midi};}
    var m = /^([A-G])(#{1,2}|b{1,2})?([0-8])$/.exec(text);
    if (!m) throw new Error('Use C4, F#4 or Bb3, explicit MIDI:0 through MIDI:127, or R for a rest.');
    return SLScore.pitch(m[1],m[2] ? (m[2][0] === '#' ? m[2].length : -m[2].length) : 0,+m[3]);
  }
  function number(v, name, min, max) { var n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new Error(name + ' must be between ' + min + ' and ' + max + '.'); return n; }
  function blank() { return {version:1,title:item && item.metadata && item.metadata.title || 'Reviewed exercise',tempo:100,length:4,rhythmKnown:false,parts:[{id:'part-1',name:'Selected part',instrument:instrument()}],selectedPartIds:['part-1'],rows:[]}; }
  function fromNotation(m) {
    var e = blank(); e.title=m.title; e.tempo=m.tempos[0].bpm; e.length=m.totalBeats; e.rhythmKnown=true;if(m.sourcePart){e.parts[0].name=m.sourcePart.name;e.parts[0].sourcePartId=m.sourcePart.id;}
    // Written segments, original spelling, ties and tempo map remain in notation.
    // The derivative uses the parser's explicitly merged sounding tied notes.
    m.notes.forEach(function(n){e.rows.push({id:id('target'),pitches:SLScore.pitchName(n.pitch),beat:n.beat,duration:n.duration,partId:'part-1',verified:false,page:1});});
    return e;
  }
  function fromPracticeScore(s) {
    var e=blank();e.title=s.title;e.tempo=s.bpm;e.length=s.len;e.rhythmKnown=s.rhythmKnown!==false&&s.timingOk!==false;e.sourceInstrument=s.instrument||null;e.importWarnings=clone(s.importWarnings||[]);
    e.rows=(s.notes||[]).map(function(n){return {id:id('target'),pitches:n.rest?'R':n.pitch&&n.pitch.step?SLScore.pitchName(n.pitch):targetName(n.m),beat:n.t,duration:n.d,velocity:n.v==null?88:n.v,channel:n.ch==null?null:n.ch,partId:e.parts[0].id,verified:false,page:1};});return e;
  }
  function scoreFromEditor(e, requireReview) {
    if (!e || !Array.isArray(e.rows) || !e.rows.length) throw new Error('Add at least one note, chord or rest target.');
    if (e.rows.length>2048) throw new Error('Use at most 2,048 target rows.');
    if (!Array.isArray(e.parts) || !e.parts.length || e.parts.length>16) throw new Error('Use between one and sixteen explicitly named parts.');
    var parts={}, notes=[], end=0, rests=[];
    e.parts.forEach(function(p){if(!p.id || parts[p.id] || !String(p.name||'').trim() || INSTRUMENTS.indexOf(p.instrument)<0)throw new Error('Each part needs a unique identity, name and instrument mapping.');parts[p.id]=p;});
    e.rows.forEach(function(r,i){
      if (!parts[r.partId]) throw new Error('Target '+(i+1)+' needs a part.');
      if (requireReview && !r.verified) throw new Error('Review every target before marking this revision reviewed.');
      var at=number(r.beat,'Target '+(i+1)+' beat',0,4096),dur=number(r.duration,'Target '+(i+1)+' duration',0,4096);
      if(at+dur>4096)throw new Error('Targets must end within 4,096 beats.');end=Math.max(end,at+dur);
      var value=String(r.pitches||'').trim();
      if(value==='R'){rests.push({t:at,d:dur,rest:true,id:r.id,partId:r.partId});return;}
      var names=value.split(/[\s,]+/).filter(Boolean);if(!names.length||names.length>8)throw new Error('A chord needs one to eight pitches.');
      var seen={};names.forEach(function(name){var p=pitch(name);if(seen[p.midi])throw new Error('A chord cannot duplicate a pitch.');seen[p.midi]=true;var n={id:r.id+'-'+p.midi,m:p.midi,t:at,d:dur,v:number(r.velocity==null?88:r.velocity,'Target velocity',1,127),pitch:p,partId:r.partId,sourceAnchor:Object.assign({},r.sourceAnchor||{},{page:Math.round(number(r.page||1,'Source page',1,500)),targetId:r.id})};if(Number.isInteger(r.channel)&&r.channel>=0&&r.channel<16)n.ch=r.channel;notes.push(n);});
    });
    if(requireReview&&!notes.length)throw new Error('Add at least one pitched target before practice. Rest-only drafts can remain saved source notes.');
    var length=number(e.length,'Exercise length',0.015625,4096);if(length+1e-6<end)throw new Error('Exercise length must include every target and rest.');
    var bpm=number(e.tempo,'Practice tempo',20,300), warnings=clone(e.importWarnings||[]);
    if(notes.some(function(n){return n.d===0;}))warnings.push('Zero-duration targets are onset-only; no held duration is invented.');
    if(!e.rhythmKnown)warnings.push('Manually ordered targets: original rhythm and holds are unconfirmed. Wait-only practice.');
    if(notation && notation.tempos && notation.tempos.length>1)warnings.push('The original tempo map is retained; practice uses the selected constant tempo.');
    return {title:String(e.title||'Reviewed exercise').slice(0,120),instrument:e.sourceInstrument||'piano',bpm:bpm,len:length,notes:notes.concat(rests),timingOk:!!e.rhythmKnown,rhythmKnown:!!e.rhythmKnown,source:'reviewed-library-targets',importWarnings:warnings,capabilities:{wait:true,tempo:!!e.rhythmKnown,holdScoring:!!e.rhythmKnown}};
  }
  function changed() { editGeneration++;dirty=true; if(el('review-state'))el('review-state').textContent='Unsaved draft · target edits need review'; buttons(); }
  function buttons() {
    if(!root)return;
    root.querySelectorAll('input,select').forEach(function(c){if(!c.closest('#sr-recognition'))c.disabled=busy||!item&&c.id!=='sr-file'&&c.id!=='sr-items';});
    ['save','review','add','all-verified','add-part'].forEach(function(k){if(el(k))el(k).disabled=busy||!item;});
    var ready=!!(revision && revision.reviewState==='reviewed'&&!dirty);
    if(el('launch'))el('launch').disabled=busy||!ready;
    ['synth','export-midi'].forEach(function(k){if(el(k))el(k).disabled=busy||!ready||!window.SLMidiHub||!SLMidiHub.player||!SLMidiHub.player.loadScore;});
    if(el('tab'))el('tab').disabled=busy||!ready||!window.SLMidiHub||!SLMidiHub.scoreToMidi||!window.App||!App.songs;
    if(el('save-section'))el('save-section').disabled=busy||!ready;
    if(el('mode')){var opt=el('mode').querySelector('[value="tempo"]');opt.disabled=!editor||!editor.rhythmKnown;if(opt.disabled)el('mode').value='wait';}
    if(el('prev'))el('prev').disabled=busy||pageNumber<=1;if(el('next'))el('next').disabled=busy||pageNumber>=pageCount;
  }
  function fillParts() {
    el('parts').innerHTML=editor.parts.map(function(p){return '<div class="sr-part" data-part="'+esc(p.id)+'"><label>Part name<input type="text" data-part-field="name" value="'+esc(p.name)+'" maxlength="80"></label><label>Instrument label<select data-part-field="instrument">'+INSTRUMENTS.map(function(x){return '<option'+(x===p.instrument?' selected':'')+'>'+x+'</option>';}).join('')+'</select></label><label class="sr-check"><input data-part-field="selected" type="checkbox"'+((editor.selectedPartIds||editor.parts.map(function(p){return p.id;})).indexOf(p.id)>=0?' checked':'')+'>Practice this part</label><span class="small muted">Source part identity: '+esc(p.sourcePartId||p.id)+'</span></div>';}).join('');
  }
  function fillRows() {
    el('rows').innerHTML=editor.rows.map(function(r,i){return '<tr data-row="'+esc(r.id)+'"><th scope="row">'+(i+1)+'</th><td><input type="text" aria-label="Target '+(i+1)+' pitches" data-field="pitches" value="'+esc(r.pitches)+'" placeholder="C4 E4 G4 or R"></td><td><input aria-label="Target '+(i+1)+' beat" data-field="beat" type="number" min="0" step="0.0625" value="'+r.beat+'"></td><td><input aria-label="Target '+(i+1)+' duration" data-field="duration" type="number" min="0" step="0.0625" value="'+r.duration+'"></td><td><select aria-label="Target '+(i+1)+' part" data-field="partId">'+editor.parts.map(function(p){return '<option value="'+esc(p.id)+'"'+(p.id===r.partId?' selected':'')+'>'+esc(p.name)+'</option>';}).join('')+'</select></td><td><input aria-label="Target '+(i+1)+' source page" data-field="page" type="number" min="1" max="500" value="'+(r.page||1)+'"></td><td><label class="sr-check"><input data-field="verified" type="checkbox"'+(r.verified?' checked':'')+'>Checked</label></td><td><button type="button" class="btn sm" data-delete="'+esc(r.id)+'" aria-label="Delete target '+(i+1)+'">Delete</button></td></tr>';}).join('');
    el('empty').hidden=!!editor.rows.length;
  }
  function fillEditor() {
    if(!editor)return;
    el('title').value=editor.title;el('tempo').value=editor.tempo;el('length').value=editor.length;el('rhythm').checked=!!editor.rhythmKnown;
    el('section-start').value=0;el('section-end').value=editor.length;
    fillParts();fillRows();
    el('review-state').textContent=revision?'Saved '+revision.reviewState+' revision · '+revision.id:'Draft · no reviewed targets';
    el('notation').hidden=!notation;
    el('notation').textContent=notation?'Original notation retained: '+notation.measures.length+' measures, '+notation.tempos.length+' tempo marking(s), written pitch spellings and ties. Target edits create a separate derivative.':'';
    buttons();
  }
  async function refreshItems(selected) {
    var items=await lib().listItems();el('items').innerHTML='<option value="">Choose a local source…</option>'+items.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.metadata&&x.metadata.title||x.original.filename)+'</option>';}).join('');
    if(selected)el('items').value=selected;
  }
  async function refreshRevisions() {
    var list=await lib().listRevisions(item.id);el('revisions').innerHTML='<option value="">Original / new draft</option>'+list.map(function(r){return '<option value="'+esc(r.id)+'">'+esc(r.label||r.id)+' · '+esc(r.reviewState)+'</option>';}).join('');if(revision)el('revisions').value=revision.id;
  }
  function recognitionChanged(){if(recognitionTool)recognitionTool.onSource();}
  async function recognitionSource(){if(!opened)throw new Error('Open Score review before recognizing notation.');if(busy)throw new Error('Wait for the current source operation to finish.');return item?{item:clone(item),bytes:new Uint8Array(original),currentPage:pageNumber,pageCount:pageCount,dirty:dirty,busy:busy}:null;}
  async function pagePixels(page, scale) {
    if(!item||!original||!opened||busy)throw new Error('Open a source and wait for it to finish loading.');
    var generation=token, sourceId=item.id, kind=item.original.kind, sourcePDF=pdf, requested=Number(page), bitmap=null, task=null;
    function current(){if(!opened||generation!==token||!item||item.id!==sourceId||requested!==pageNumber)throw new Error('The source or page changed during recognition rendering.');}
    if(!Number.isInteger(requested)||requested<1||requested>pageCount)throw new Error('Choose a valid current page.');
    scale=Math.min(3,Math.max(.5,Number(scale)||1.5));
    var canvas=document.createElement('canvas'), context=canvas.getContext('2d',{willReadFrequently:true});
    try {
      if(kind==='pdf'){
        if(!sourcePDF)throw new Error('The local PDF preview is not ready.');
        var pageObject=await sourcePDF.getPage(requested);current();var v=pageObject.getViewport({scale:scale});
        scale*=Math.min(1,Math.sqrt(12000000/(v.width*v.height)),8192/v.width,8192/v.height);v=pageObject.getViewport({scale:scale});
        canvas.width=Math.max(1,Math.floor(v.width));canvas.height=Math.max(1,Math.floor(v.height));
        task=pageObject.render({canvasContext:context,viewport:v,background:'#ffffff'});recognitionRenders.add(task);await task.promise;
      }else if(kind==='image'){
        bitmap=await createImageBitmap(new Blob([new Uint8Array(original)],{type:item.original.mime}));current();
        var ratio=Math.min(1,Math.sqrt(12000000/(bitmap.width*bitmap.height)),8192/bitmap.width,8192/bitmap.height);
        canvas.width=Math.max(1,Math.floor(bitmap.width*ratio));canvas.height=Math.max(1,Math.floor(bitmap.height*ratio));
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      }else throw new Error('Recognition accepts local PDF pages or score images.');
      current();return context.getImageData(0,0,canvas.width,canvas.height);
    } finally {if(task)recognitionRenders.delete(task);if(bitmap)bitmap.close();canvas.width=canvas.height=0;}
  }
  async function releasePDF() {
    recognitionRenders.forEach(function(task){try{task.cancel();}catch(ignore){}});recognitionRenders.clear();
    if(renderTask){try{renderTask.cancel();}catch(ignore){}renderTask=null;}
    if(pdf){var old=pdf;pdf=null;try{await old.destroy();}catch(ignore){}}
    if(imageURL){URL.revokeObjectURL(imageURL);imageURL=null;}
  }
  async function renderPage(t) {
    if(!pdf||t!==token||!opened)return;
    var pg=await pdf.getPage(pageNumber);if(t!==token||!opened)return;
    if(renderTask){try{renderTask.cancel();await renderTask.promise;}catch(ignore){}}
    if(t!==token||!opened||!pdf)return;
    var v=pg.getViewport({scale:1}),width=Math.max(240,el('source').clientWidth-24),scale=width/v.width*zoom;
    var viewport=pg.getViewport({scale:scale}),pixels=viewport.width*viewport.height;
    if(pixels>12000000){scale*=Math.sqrt(12000000/pixels);viewport=pg.getViewport({scale:scale});}
    var canvas=el('canvas');canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);canvas.hidden=false;
    renderTask=pg.render({canvasContext:canvas.getContext('2d'),viewport:viewport});await renderTask.promise;
    if(t!==token)return;
    el('page-status').textContent='Page '+pageNumber+' of '+pageCount;el('prev').disabled=pageNumber<=1;el('next').disabled=pageNumber>=pageCount;
    el('source-note').textContent='PDF page displayed locally. Recognize selected notation below or import/edit targets, then compare every target with this original.';
  }
  async function renderSource(t) {
    await releasePDF();if(!item||t!==token||!opened)return;
    el('canvas').hidden=true;el('image').hidden=true;el('source-text').hidden=true;el('pdf-controls').hidden=true;
    var kind=item.original.kind;
    try {
      if(kind==='pdf'){
        if(original.byteLength>25*1024*1024)throw new Error('PDF display is limited to 25 MiB. Original remains available for export.');
        if(!pdfModule)pdfModule=import(new URL('vendor/pdfjs/pdf.mjs',document.baseURI).href);
        var mod=await pdfModule;if(t!==token||!opened)return;
        mod.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.mjs',document.baseURI).href;
        var task=mod.getDocument({data:new Uint8Array(original),isEvalSupported:false,cMapUrl:new URL('vendor/pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',document.baseURI).href,wasmUrl:new URL('vendor/pdfjs/wasm/',document.baseURI).href});
        var loaded=await task.promise;if(t!==token||!opened){await loaded.destroy();return;}pdf=loaded;pageCount=pdf.numPages;
        if(pageCount>500)throw new Error('PDF display is limited to 500 pages. Original remains stored.');
        pageNumber=Math.min(pageNumber,pageCount);el('pdf-controls').hidden=false;await renderPage(t);
      }else if(kind==='image'){
        imageURL=URL.createObjectURL(new Blob([original],{type:item.original.mime}));el('image').onerror=function(){if(t===token)el('source-note').textContent='This browser cannot preview this image. The original remains stored and exportable; enter targets manually or use supported MusicXML.';};el('image').src=imageURL;el('image').hidden=false;el('source-note').textContent='Local source image. Recognize selected notation below, then check and correct the unverified targets.';
      }else{
        el('source-text').textContent=kind==='musicxml'?new TextDecoder('utf-8',{fatal:true}).decode(original):'Original '+kind+' file retained byte for byte. Use structured targets or create a reviewed derivative.';
        el('source-text').hidden=false;el('source-note').textContent='Original source retained separately from editable targets.';
      }
    } catch(e){if(t===token){el('source-note').textContent='Source preview unavailable: '+e.message+' Original bytes are retained; export remains available.';if(pdf)await releasePDF();}}
  }
  async function open(itemId, revisionId) {
    if(!root){if(window.App&&App.switchTo)App.switchTo('score');if(!root)throw new Error('Open the Score page before loading a source.');}
    if(root.contains(document.activeElement)&&document.activeElement.blur)document.activeElement.blur();
    if(dirty&&item&&editor)await saveDraft();
    var t=++token;if(recognitionTool)recognitionTool.onSource();beginBusy();status('Opening local source…');
    try{
      await lib().ready();var next=await lib().getItem(itemId);if(!next)throw new Error('This local source is unavailable.');
      var bytes=await lib().getOriginal(itemId),revs=await lib().listRevisions(itemId);
      var loaded=revisionId===null?null:revisionId?await lib().getRevision(itemId,revisionId):revs.length?revs[revs.length-1]:null;
      if(t!==token)return;item=next;original=new Uint8Array(bytes);revision=loaded;notation=loaded&&loaded.notation||null;sourceScore=loaded&&loaded.sourceScore||null;pageNumber=1;
      if(loaded&&loaded.editor)editor=clone(loaded.editor);
      else if(loaded&&loaded.score){editor=fromPracticeScore(loaded.score);editor.rhythmKnown=loaded.rhythmKnown!==false&&loaded.score.timingOk!==false;editor.parts=clone(loaded.parts||editor.parts);editor.rows.forEach(function(r,i){var n=loaded.score.notes[i];r.id=n.id||r.id;r.partId=n.partId||editor.parts[0].id;r.verified=loaded.reviewState==='reviewed';r.page=n.sourceAnchor&&n.sourceAnchor.page||1;});}
      else if(item.original.kind==='musicxml'){
        try{notation=SLScore.parseMusicXML(new TextDecoder('utf-8',{fatal:true}).decode(original));editor=fromNotation(notation);}catch(e){editor=blank();status('Structured import needs correction: '+e.message+' The original remains intact; you may enter targets manually.',true);}
      }else if(item.original.kind==='midi'&&window.Woodshed&&Woodshed.importMidi){
        try{sourceScore=Woodshed.importMidi(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength),item.original.filename);editor=fromPracticeScore(sourceScore);}catch(e){editor=blank();status('Structured import needs correction: '+e.message+' Original MIDI bytes remain intact; enter targets manually if needed.',true);}
      }else editor=blank();
      dirty=false;el('filename').textContent=item.original.filename;fillEditor();await refreshItems(item.id);await refreshRevisions();
      if(!/needs correction/.test(el('status').textContent))status(revision?'Opened immutable '+revision.reviewState+' revision.':'Source loaded. No reviewed targets yet.');
      await renderSource(t);
    }catch(e){if(t===token)status(e.message,true);throw e;}finally{endBusy();recognitionChanged();}
  }
  function midiName(m){var names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return names[m%12]+(Math.floor(m/12)-1);}
  function targetName(m){return m<12||m>=120?'MIDI:'+m:midiName(m);}
  function payload(requireReview) {var score=!requireReview&&!editor.rows.length?null:scoreFromEditor(editor,requireReview);return {label:editor.title,notation:notation?clone(notation):null,sourceScore:sourceScore?clone(sourceScore):null,score:score,editor:clone(editor),parts:clone(editor.parts),rhythmKnown:!!editor.rhythmKnown,sourceAnchors:editor.rows.map(function(r){return Object.assign({},r.sourceAnchor||{},{targetId:r.id,page:r.page||1});}),recognition:editor.recognition?clone(editor.recognition):null,reviewState:'draft'};}
  async function saveDraft() {
    if(!item||!editor)throw new Error('Load a local source first.');
    if(root.contains(document.activeElement)&&document.activeElement.blur)document.activeElement.blur();
    var generation=editGeneration,itemId=item.id,p=payload(false);beginBusy();
    try{var saved=await lib().saveRevision(itemId,p);if(item&&item.id===itemId){revision=saved;dirty=editGeneration!==generation;await refreshRevisions();el('review-state').textContent=dirty?'New edits remain unsaved after the saved draft.':'Saved draft revision · '+saved.id;status(dirty?'The captured draft was saved; newer edits still need saving.':'Draft saved. Verify each target before practice.');}return saved;}finally{endBusy();}
  }
  async function review() {
    payload(true);beginBusy();try{var saved=await saveDraft();if(dirty)throw new Error('Targets changed while saving. Review the latest edits before continuing.');var generation=editGeneration,itemId=item.id,reviewed=await lib().reviewRevision(itemId,saved.id,{verified:true,note:'Targets explicitly checked in local Score review.'});if(item&&item.id===itemId){revision=reviewed;dirty=editGeneration!==generation;await refreshRevisions();el('review-state').textContent=dirty?'New edits need review.':'Reviewed revision · '+revision.id;status(dirty?'The captured revision was reviewed; newer edits still need saving and review.':'Reviewed targets saved. '+(editor.rhythmKnown?'Wait or Tempo can use this confirmed beat grid.':'Original rhythm is unknown: Wait-only practice.'));}return reviewed;}finally{endBusy();}
  }
  function section(){var start=number(el('section-start').value,'Section start',0,editor.length),end=number(el('section-end').value,'Section end',0,editor.length);if(end<=start)throw new Error('Section end must follow its start.');return {startBeat:start,endBeat:end};}
  // Reviewed targets to a synth or a MIDI file, through the MIDI Hub Player
  // (js/midihub.js: SLMidiHub.player.loadScore / SLMidiHub.scoreToMidi). Same
  // rule as practice: a saved reviewed revision only; nothing is changed.
  function reviewedScore(){
    if(!revision||revision.reviewState!=='reviewed'||dirty)throw new Error('Save a reviewed revision first.');
    var score=scoreFromEditor(editor,true),selected=editor.selectedPartIds||editor.parts.map(function(p){return p.id;});
    if(!selected.length)throw new Error('Select at least one target part.');
    score.notes=score.notes.filter(function(n){return selected.indexOf(n.partId)>=0;});
    return score;
  }
  async function playOnSynth(){
    if(!window.SLMidiHub||!SLMidiHub.player||!SLMidiHub.player.loadScore)throw new Error('Play on synth needs the MIDI tab Player.');
    var score=reviewedScore();SLMidiHub.player.loadScore(score);SLMidiHub.player.show();
    status('Opened in Keys › MIDI › Player: pick your synth output, set tempo or key, and press Play.');
  }
  async function exportMidi(){
    if(!window.SLMidiHub||!SLMidiHub.scoreToMidi)throw new Error('MIDI export needs the MIDI tab Player.');
    var score=reviewedScore(),name=(String(score.title||'').replace(/[^\w\- ]+/g,'').trim().slice(0,60)||'reviewed-score')+'.mid';
    download(SLMidiHub.scoreToMidi(score),name,'audio/midi');status('Exported '+name+' from the reviewed targets.');
  }
  async function openAsTab(){
    if(!window.SLMidiHub||!SLMidiHub.scoreToMidi||!window.App||!App.songs)throw new Error('Open as tab needs the MIDI tab Player and the Songs page.');
    var score=reviewedScore(),song=App.songs.fromMidi(SLMidiHub.scoreToMidi(score),score.title);
    if(!song)throw new Error('Nothing in this score fits a guitar in standard tuning.');
    song.from='from Score review';App.songs.load(song);App.switchTo('songs');
  }
  async function launch() {
    if(!revision||revision.reviewState!=='reviewed'||dirty)throw new Error('Save a reviewed revision before practice.');
    var score=scoreFromEditor(editor,true),selection=section(),selected=editor.selectedPartIds||editor.parts.map(function(p){return p.id;});if(!selected.length)throw new Error('Select at least one target part for practice.');var mapping={instrument:el('practice-instrument').value,parts:{},selectedPartIds:clone(selected)};editor.parts.forEach(function(p){mapping.parts[p.id]=p.instrument;});
    var p={itemId:item.id,revisionId:revision.id,revision:clone(revision),score:score,rhythmKnown:!!editor.rhythmKnown,selectedPartIds:clone(selected),section:selection,mapping:mapping,instrument:el('practice-instrument').value,mode:el('mode').value};
    if(config.onLaunch){var result=await config.onLaunch(p);if(!result||result.ok!==true)throw new Error(result&&result.error||'Practice could not open. Your reviewed revision is still saved.');}
    else if(window.App)App.emit('score-review:launch',p);else throw new Error('Practice launcher is not connected.');return p;
  }
  function download(bytes,name,mime){var url=URL.createObjectURL(new Blob([bytes],{type:mime||'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  async function perform(fn){beginBusy();try{await fn();}catch(e){status(e.message,true);}finally{endBusy();}}
  function mount(container,options) {
    if(options)configure(options);root=container;opened=true;
    root.innerHTML='<div class="sr-page"><header><h2>Score review</h2><p>Keep your original locally. Check editable targets against the source before practice.</p></header><div class="card sr-load"><label>Load PDF, image or MusicXML<input id="sr-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xml,.musicxml,.mid,.midi,.mxl"></label><label>Reopen local source<select id="sr-items"><option>Loading…</option></select></label><label>Saved target revision<select id="sr-revisions"><option value="">Original / new draft</option></select></label></div><p id="sr-status" role="status" aria-live="polite"></p><div class="sr-columns"><section class="card sr-source-card" aria-label="Original score source"><div class="sr-head"><h3 id="sr-filename">No source loaded</h3><button id="sr-export-original" class="btn sm" type="button">Export original</button></div><div id="sr-pdf-controls" class="sr-tools" hidden><button id="sr-prev" class="btn sm" type="button">Previous page</button><span id="sr-page-status"></span><button id="sr-next" class="btn sm" type="button">Next page</button><label>Zoom<select id="sr-zoom"><option value="0.75">75%</option><option value="1" selected>Fit width</option><option value="1.5">150%</option><option value="2">200%</option></select></label></div><p id="sr-source-note" class="small muted">PDF viewing retains the original. Local recognition creates an unverified draft for correction.</p><div id="sr-source" class="sr-source"><canvas id="sr-canvas" aria-label="Local PDF score page" hidden></canvas><img id="sr-image" alt="Original local score image" hidden><pre id="sr-source-text" hidden></pre></div><div id="sr-recognition"></div></section><section class="card sr-editor" aria-label="Editable practice targets"><div class="sr-head"><h3>Targets to check</h3><span id="sr-review-state" role="status">No targets yet</span></div><p class="small muted">Automatic targets require correction and review. You can also enter pitches with octaves or MIDI:0 through MIDI:127, chords separated by spaces, or R for a rest. Beat positions begin at 0. Imported written notation remains preserved separately.</p><div class="sr-fields"><label>Exercise title<input type="text" id="sr-title" maxlength="120"></label><label>Practice tempo<input id="sr-tempo" type="number" min="20" max="300" value="100"></label><label>Length including trailing rests (beats)<input id="sr-length" type="number" min="0.015625" max="4096" step="0.0625" value="4"></label></div><label class="sr-check"><input id="sr-rhythm" type="checkbox">I have confirmed the beat positions and durations. Otherwise use Wait-only practice.</label><p id="sr-notation" class="small muted" hidden></p><details><summary>Parts and instrument mappings</summary><p class="small muted">Map selected target parts explicitly. Original part data stays in the source; this does not change your practice-credit category.</p><div id="sr-parts"></div><button id="sr-add-part" type="button" class="btn sm">Add target part</button></details><div class="sr-table-wrap"><table class="sr-table"><thead><tr><th>#</th><th>Pitch / chord / rest</th><th>Beat</th><th>Duration</th><th>Part</th><th>Page</th><th>Review</th><th>Action</th></tr></thead><tbody id="sr-rows"></tbody></table></div><p id="sr-empty" class="muted">No targets. Add a note or import supported structured MusicXML.</p><div class="sr-tools"><button id="sr-add" class="btn" type="button">Add target</button><button id="sr-all-verified" class="btn" type="button">I checked all targets</button><button id="sr-save" class="btn" type="button">Save draft</button><button id="sr-review" class="btn" type="button">Save reviewed revision</button></div><details><summary>Named practice section</summary><div class="sr-fields"><label>Name<input type="text" id="sr-section-name" maxlength="80" value="Selected passage"></label><label>Start beat<input id="sr-section-start" type="number" min="0" step="0.0625" value="0"></label><label>End beat<input id="sr-section-end" type="number" min="0" step="0.0625" value="4"></label></div><button id="sr-save-section" class="btn" type="button">Save section</button></details><div class="sr-fields"><label>Practice mode<select id="sr-mode"><option value="wait">Wait for me</option><option value="tempo">Play at Tempo</option></select></label><label>Practice credit category<select id="sr-practice-instrument">'+INSTRUMENTS.map(function(x){return '<option'+(x===instrument()?' selected':'')+'>'+x+'</option>';}).join('')+'</select></label></div><button id="sr-launch" class="btn primary" type="button" disabled>Practice reviewed targets</button><div class="sr-tools"><button id="sr-synth" class="btn" type="button" disabled title="Play the reviewed targets on your synth (Keys › MIDI › Player)">Play on synth</button><button id="sr-export-midi" class="btn" type="button" disabled title="Download the reviewed targets as a MIDI file">Export MIDI</button><button id="sr-tab" class="btn" type="button" disabled title="Show the reviewed targets as guitar tab on the Songs page">Open as tab</button></div></section></div></div>';
    el('file').onchange=function(){var f=this.files[0];if(!f)return;perform(async function(){var added=await lib().addOriginal(f,{metadata:{title:f.name.replace(/\.[^.]+$/,'')}});await open(added.id);});this.value='';};
    el('items').onchange=function(){if(this.value)perform(function(){return open(el('items').value);});};
    el('revisions').onchange=function(){if(item)perform(function(){return open(item.id,el('revisions').value||null);});};
    el('export-original').onclick=function(){if(original&&item)download(original,item.original.filename,item.original.mime);};
    el('prev').onclick=function(){if(pageNumber>1){pageNumber--;perform(function(){return renderPage(token);}).then(recognitionChanged);}};
    el('next').onclick=function(){if(pageNumber<pageCount){pageNumber++;perform(function(){return renderPage(token);}).then(recognitionChanged);}};
    el('zoom').onchange=function(){zoom=Number(this.value);perform(function(){return renderPage(token);});};
    ['title','tempo','length','rhythm'].forEach(function(k){el(k).onchange=function(){if(!editor)return;editor[{title:'title',tempo:'tempo',length:'length',rhythm:'rhythmKnown'}[k]]=k==='rhythm'?this.checked:k==='title'?this.value:Number(this.value);if(k!=='title')editor.rows.forEach(function(r){r.verified=false;});changed();fillRows();};});
    el('rows').onchange=function(e){var tr=e.target.closest('[data-row]');if(!tr||!editor)return;var r=editor.rows.find(function(x){return x.id===tr.dataset.row;}),field=e.target.dataset.field;if(!r||!field)return;r[field]=field==='verified'?e.target.checked:['beat','duration','page'].indexOf(field)>=0?Number(e.target.value):e.target.value;if(field!=='verified'){r.verified=false;tr.querySelector('[data-field="verified"]').checked=false;}changed();};
    el('rows').onclick=function(e){var b=e.target.closest('[data-delete]');if(!b||!editor)return;editor.rows=editor.rows.filter(function(r){return r.id!==b.dataset.delete;});changed();fillRows();};
    el('parts').onchange=function(e){var box=e.target.closest('[data-part]'),field=e.target.dataset.partField;if(!box||!field)return;var p=editor.parts.find(function(x){return x.id===box.dataset.part;});if(field==='selected'){var selected=editor.selectedPartIds||editor.parts.map(function(p){return p.id;});editor.selectedPartIds=selected.filter(function(x){return x!==p.id;});if(e.target.checked)editor.selectedPartIds.push(p.id);}else{p[field]=e.target.value;editor.rows.forEach(function(r){if(r.partId===p.id)r.verified=false;});}changed();fillRows();};
    el('add-part').onclick=function(){if(!editor)return;var p={id:id('part'),name:'Selected part '+(editor.parts.length+1),instrument:instrument()};editor.parts.push(p);editor.selectedPartIds=(editor.selectedPartIds||editor.parts.slice(0,-1).map(function(p){return p.id;})).concat([p.id]);changed();fillParts();fillRows();};
    el('add').onclick=function(){if(!editor)return;var end=editor.rows.reduce(function(n,r){return Math.max(n,Number(r.beat)+Number(r.duration));},0);editor.rows.push({id:id('target'),pitches:'C4',beat:end,duration:1,partId:editor.parts[0].id,verified:false,page:pageNumber});editor.length=Math.max(editor.length,end+1);el('length').value=editor.length;el('section-end').value=editor.length;changed();fillRows();};
    el('all-verified').onclick=function(){if(!editor)return;editor.rows.forEach(function(r){r.verified=true;});changed();fillRows();status('Targets marked checked by you. Save a reviewed revision to make them available for practice.');};
    el('save').onclick=function(){perform(saveDraft);};el('review').onclick=function(){perform(review);};el('launch').onclick=function(){perform(launch);};el('synth').onclick=function(){perform(playOnSynth);};el('export-midi').onclick=function(){perform(exportMidi);};el('tab').onclick=function(){perform(openAsTab);};
    el('save-section').onclick=function(){perform(async function(){var mapping={parts:{},selectedPartIds:clone(editor.selectedPartIds||editor.parts.map(function(p){return p.id;})),instrument:el('practice-instrument').value};editor.parts.forEach(function(p){mapping.parts[p.id]=p.instrument;});await lib().saveSelection(item.id,{name:el('section-name').value,revisionId:revision.id,section:section(),mapping:mapping});status('Named section saved for this reviewed revision.');});};
    var adapter=config.recognitionAdapter||window.SLOMRReview;if(adapter&&adapter.mount){if(recognitionTool)recognitionTool.dispose();recognitionTool=adapter.mount(el('recognition'),{getSource:recognitionSource,getPagePixels:pagePixels,openRevision:function(revisionId){if(!item)throw new Error('The original is no longer open.');return open(item.id,revisionId);},library:lib()});}
    buttons();perform(async function(){await lib().ready();await refreshItems(item&&item.id);if(editor)fillEditor();}).then(recognitionChanged);
  }
  function configure(options){Object.assign(config,options||{});return api;}
  var api={configure:configure,mount:mount,open:open,saveDraft:saveDraft,review:review,launch:launch,scoreFromEditor:scoreFromEditor,
    snapshot:function(){return clone({item:item,revision:revision,editor:editor,notation:notation,sourceScore:sourceScore,dirty:dirty,page:pageNumber,pageCount:pageCount,busy:busy});},
    checkpoint:async function(){var recognition=recognitionTool&&recognitionTool.checkpoint();if(recognition&&!recognition.ok)return recognition;if(busy)return {ok:false,errors:['Score review is still loading or saving. Wait for it to finish, then retry.']};if(!dirty||!item||!editor)return {ok:true};beginBusy();try{await saveDraft();return {ok:true};}catch(e){return {ok:false,errors:[e.message]};}finally{endBusy();}},
    dispose:function(){opened=false;token++;if(recognitionTool){recognitionTool.dispose();recognitionTool=null;}releasePDF();root=null;},
    module:{init:function(e){mount(e);},onShow:function(){opened=true;var t=++token;if(root)perform(async function(){await refreshItems(item&&item.id);if(item)await renderSource(t);}).then(function(){if(opened&&t===token&&recognitionTool)recognitionTool.setVisible(true);});},onHide:function(){opened=false;token++;if(recognitionTool)recognitionTool.setVisible(false);releasePDF();}}
  };
  window.SLScoreReview=api;
  if(window.App){
    App.register('score',api.module);
    App.on('library:review',function(e){if(!e||!e.itemId)return;App.switchTo('score');perform(function(){return open(e.itemId,e.revisionId);});});
  }
})();
