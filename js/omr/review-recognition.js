/* Local OMR review adapter. The ScoreReview host supplies immutable originals
 * and page pixels through an explicit seam; recognition never plays or grades.
 * Recognition provenance stays in both the revision and editable draft so a
 * later manual correction can retain its automatic source evidence. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SLOMRReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var MAX_STAVES = 4, MAX_ROWS = 2048, controllers = new Set(), retained = new Map();
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function text(value) { return typeof value === 'string' ? value : value && value.message || String(value || ''); }
  function issue(value) { return (value && value.code ? value.code + ': ' : '') + text(value); }
  function key(source) { return source && source.item && source.item.id + ':' + source.item.original.sha256; }
  function pageKey(source) { return key(source) + ':' + (source.currentPage || 1); }
  function abortError() { var e = new Error('Recognition cancelled.'); e.name = 'AbortError'; return e; }
  function pitch(midi) {
    if (midi < 12 || midi >= 120) return 'MIDI:' + midi;
    return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12] + (Math.floor(midi / 12) - 1);
  }
  function eventPitch(event) {
    var p = event.pitch, natural = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
    if (p && Object.prototype.hasOwnProperty.call(natural,p.step) && Number.isInteger(p.alter) && p.alter >= -2 && p.alter <= 2 && Number.isInteger(p.octave) && p.octave >= 0 && p.octave <= 8 && (p.octave + 1) * 12 + natural[p.step] + p.alter === event.midi) return p.step + (p.alter < 0 ? 'b'.repeat(-p.alter) : '#'.repeat(p.alter)) + p.octave;
    return pitch(event.midi);
  }
  function buildDraft(source, selections, results, options) {
    options = options || {};
    if (!source || !source.item || !source.item.original || !Array.isArray(selections) || !selections.length || selections.length > MAX_STAVES || selections.length !== results.length) throw new Error('Choose between one and four staff regions from one original page.');
    var instrument = options.instrument || 'piano';
    if (['piano','synth','guitar','bass','drums','voice','other'].indexOf(instrument) < 0) throw new Error('Choose an actual performance instrument.');
    var rows = [], notes = [], regions = [], warnings = [], offset = 0, sourcePage = source.currentPage || 1;
    var sequential = selections.length > 1;
    if (sequential && options.sequential !== true) throw new Error('Confirm that selected staves are consecutive single-voice passages in the chosen order.');
    var baseWarnings = [
      'Automatic recognition is an unverified draft. Compare every pitch, rest and duration with the original.',
      'Model scores are not calibrated accuracy or certainty. Missing or incorrect symbols may be undetected.',
      'Only the selected monophonic staff regions are represented; no whole-page part alignment or repeat expansion is inferred.',
      'Recognized rhythm and held durations remain unconfirmed: Wait-only until you explicitly verify the rhythm in Score review.'
    ];
    if (sequential) baseWarnings.push('You chose a sequential staff order. Cross-staff timing and simultaneous parts were not inferred.');
    results.forEach(function (result, index) {
      if (!result || !Array.isArray(result.events)) throw new Error('The recognition engine returned no readable event sequence.');
      if (!result.engine || typeof result.engine.id !== 'string' || typeof result.engine.version !== 'string' || typeof result.engine.sourceCommit !== 'string' || !/^[a-f0-9]{64}$/i.test(result.engine.modelSha256 || '')) throw new Error('The recognition result lacks verifiable engine/model provenance. Raw output remains exportable; no draft was saved.');
      var region = selections[index], accepted = [], regionEnd = 0;
      (result.warnings || []).concat(result.unsupported || []).forEach(function (w) { warnings.push(issue(w)); });
      // Parsed predictions remain editable evidence even though automatic
      // musical verification is ALWAYS false. They are different states.
      var grammarParsed = typeof result.rhythmParsed === 'boolean' ? result.rhythmParsed : !(result.diagnostics && result.diagnostics.grammarComplete === false);
      var lastEnd = 0, regionRhythmKnown = grammarParsed && result.events.every(function (event) {
        if (!event || !Number.isFinite(event.beat) || event.beat < lastEnd - .000001 || !Number.isFinite(event.duration) || event.duration < 0 || event.beat + event.duration > 4096) return false;
        lastEnd = event.beat + event.duration; return true;
      });
      result.events.forEach(function (event, eventIndex) {
        if (!event || event.rest !== true && (!Number.isInteger(event.midi) || event.midi < 0 || event.midi > 127)) {
          warnings.push('Staff ' + (index + 1) + ', event ' + (eventIndex + 1) + ': no supported pitch/rest was recognized; retained as raw evidence only.');
          accepted.push(clone(event)); return;
        }
        var known = regionRhythmKnown;
        if (!known) warnings.push('Staff ' + (index + 1) + ', event ' + (eventIndex + 1) + ': rhythm is unparsed; its target is onset-only in recognition order, not an inferred beat grid.');
        var id = 'omr-' + (index + 1) + '-' + (eventIndex + 1), anchor = Object.assign({}, clone(event.sourceAnchor || {}), {page:sourcePage,regionId:region.id,coordinateSpace:'rendered-page-pixels',staffBBox:clone(region.bbox)});
        if (!anchor.bbox) anchor.bbox = clone(region.bbox);
        var anchors = (event.sourceAnchors || [anchor]).map(function (a) { return Object.assign({},clone(a),{page:sourcePage,regionId:region.id,staffBBox:clone(region.bbox)}); });
        var at = known ? event.beat : eventIndex, duration = known ? event.duration : 0;
        var row = { id:id, pitches:event.rest ? 'R' : eventPitch(event), beat:offset + at, duration:duration, partId:'omr-part', verified:false, page:sourcePage, sourceAnchor:anchor, sourceAnchors:anchors, recognition:{regionId:region.id,eventIndex:eventIndex,confidence:null,rhythmParsed:known,tie:event.tie || null} };
        if (rows.length >= MAX_ROWS || row.beat + row.duration > 4096) throw new Error('This selection exceeds 2,048 targets or 4,096 beats. Recognize a smaller selection.');
        rows.push(row); accepted.push(clone(event));
        notes.push(Object.assign({id:id,t:row.beat,d:row.duration,v:88,partId:'omr-part',sourceAnchor:anchor,sourceAnchors:anchors,tie:event.tie || null,pitch:event.pitch ? clone(event.pitch) : null}, event.rest ? {rest:true} : {m:event.midi}));
        regionEnd = Math.max(regionEnd, at + Math.max(duration,.25));
      });
      if (!(result.rawTokens || []).every(function (t) { return t && typeof t.token === 'string'; }) || (result.rawTokens || []).length > 32768) throw new Error('Recognition returned invalid or oversized token evidence. No draft was saved.');
      regions.push({id:region.id,order:index + 1,page:sourcePage,bbox:clone(region.bbox),lineYs:clone(region.lineYs || []),spacing:region.spacing,transform:region.transform ? clone(region.transform) : null,engine:clone(result.engine),rawTokens:clone(result.rawTokens || []),events:accepted,warnings:clone(result.warnings || []),unsupported:clone(result.unsupported || []),diagnostics:clone(result.diagnostics || {})});
      // Sequential ordering is an explicit user choice, never polyphonic merge.
      offset += Math.max(regionEnd, .25);
    });
    var hasPitches = notes.some(function (n) { return !n.rest; });
    if (!hasPitches) warnings.push('No supported pitched targets were recognized. This draft retains evidence only and cannot start practice.');
    var title = String(source.item.metadata && source.item.metadata.title || source.item.original.filename || 'Recognized passage').slice(0,100) + ' · recognized draft';
    var provenance = {version:1,sourceItemId:source.item.id,sourceSha256:source.item.original.sha256,page:sourcePage,raster:clone(options.raster || {}),coordinateSpace:'rendered-page-pixels',readingOrder:sequential ? 'user-confirmed-sequential-staves' : 'selected-single-staff',rhythmVerified:false,confidence:null,regions:regions,warnings:baseWarnings.concat(warnings)};
    var editor = {version:1,title:title,tempo:100,length:Math.max(.25,offset),rhythmKnown:false,parts:[{id:'omr-part',name:sequential ? 'Selected consecutive voice' : 'Selected staff voice',instrument:instrument}],selectedPartIds:['omr-part'],rows:rows,importWarnings:baseWarnings.concat(warnings),recognition:clone(provenance)};
    return {label:title,reviewState:'draft',verified:false,rhythmKnown:false,editor:editor,parts:clone(editor.parts),sourceAnchors:rows.map(function (r) { return Object.assign({targetId:r.id},r.sourceAnchor); }),recognition:provenance,score:hasPitches ? {title:title,instrument:instrument,bpm:100,len:editor.length,notes:notes,timingOk:false,rhythmKnown:false,source:'local-optical-recognition',importWarnings:clone(editor.importWarnings),capabilities:{wait:true,tempo:false,holdScoring:false}} : null};
  }
  function mount(host, context) {
    if (!host || !context || typeof context.getSource !== 'function' || typeof context.getPagePixels !== 'function' || typeof context.openRevision !== 'function') throw new Error('Recognition needs the Score review source adapter.');
    var source = null, image = null, regions = [], results = [], generation = 0, abort = null, busy = false, saving = false, visible = true, disposed = false, staged = null;
    host.classList.add('omr-review');
    host.innerHTML = '<div class="omr-heading"><h3>Recognize notation locally</h3><span class="badge">Experimental · review required</span></div><p class="small">PDFs and images stay in this browser. Bundled recognition assets (about 21 MB) are cached with the app for offline use. Recognition supports selected, clearly engraved monophonic treble or bass staff regions. Scans and handwriting are experimental. Chords, overlapping voices, repeats and unusual notation may be unsupported or missed.</p><p class="small muted">Current page only. Select staff regions and confirm their order; no simultaneous parts or whole-song rhythm will be guessed. All generated targets remain unverified and silent.</p><div class="omr-actions"><button type="button" class="btn primary" data-omr="detect">Recognize notation locally</button><button type="button" class="btn" data-omr="cancel" hidden>Cancel recognition</button></div><p data-omr="status" role="status" aria-live="polite">Choose a local PDF or image in Score review.</p><div data-omr="selection" hidden><canvas data-omr="preview" aria-label="Source page with numbered candidate staff regions"></canvas><p class="small">Candidate boxes are geometry estimates, not recognized notes or an accuracy score. Select at most four staves. Leave simultaneous accompaniment staves unselected.</p><div data-omr="regions" class="omr-regions"></div><label class="omr-check"><input type="checkbox" data-omr="monophonic">I selected a single voice without chords or repeats; I will compare every generated target with the source.</label><label class="omr-check" data-omr="sequence-wrap" hidden><input type="checkbox" data-omr="sequential">These staves continue the same voice in my chosen order, rather than sounding simultaneously.</label><button type="button" class="btn primary" data-omr="run">Recognize selected staves</button></div><section data-omr="output" hidden><h4>Unverified recognition results</h4><p data-omr="summary"></p><ul data-omr="warnings"></ul><details><summary>Raw tokens and engine evidence</summary><p class="small">Raw model scores are diagnostic values, not calibrated confidence. Tokens are retained exactly, including unsupported output.</p><pre data-omr="raw"></pre></details><div class="omr-actions"><button type="button" class="btn primary" data-omr="save">Save unverified draft for correction</button><button type="button" class="btn" data-omr="export">Export recognition evidence</button><button type="button" class="btn" data-omr="discard">Discard result</button></div><p class="small muted">Saving does not mark targets reviewed, start sound, light MIDI keys or earn XP. Use the existing Score review editor to correct and explicitly review them.</p></section>';
    function el(name) { return host.querySelector('[data-omr="' + name + '"]'); }
    var pendingBox = document.createElement('aside'); pendingBox.className = 'omr-pending'; pendingBox.hidden = true; pendingBox.setAttribute('aria-label','Unsaved recognition evidence'); host.appendChild(pendingBox);
    function status(message, bad) { el('status').textContent = message; el('status').classList.toggle('omr-error',!!bad); }
    function validSource(s) { return s && s.item && s.item.original && ['pdf','image'].indexOf(s.item.original.kind) >= 0; }
    function selected() {
      return Array.from(el('regions').querySelectorAll('[data-region]')).filter(function (row) { return row.querySelector('input[type="checkbox"]').checked; }).map(function (row) {
        var r = regions.find(function (x) { return x.id === row.dataset.region; });
        return {region:r,order:Number(row.querySelector('input[type="number"]').value)};
      }).sort(function (a,b) { return a.order - b.order; });
    }
    function controls() {
      var picks = selected(), count = picks.length;
      el('detect').disabled = busy || saving || !!results.length || !visible || !validSource(source);
      el('cancel').hidden = !busy || saving;
      el('run').disabled = busy || saving || !!results.length || !count || count > MAX_STAVES || !el('monophonic').checked || count > 1 && !el('sequential').checked;
      el('save').disabled = busy || saving || !staged;
      el('discard').disabled = busy || saving;
      el('sequence-wrap').hidden = count <= 1;
      var selectionLocked = busy || saving || !!results.length;
      el('regions').querySelectorAll('input').forEach(function (input) { input.disabled = selectionLocked; });
      el('monophonic').disabled = selectionLocked; el('sequential').disabled = selectionLocked;
      host.setAttribute('aria-busy',String(busy || saving));
    }
    function stash() {
      if (!source || !source.item || !results.length) return;
      retained.set(pageKey(source),{source:{item:clone(source.item),currentPage:source.currentPage || 1},results:clone(results),draft:staged && clone(staged)});
    }
    function downloadEvidence(data) {
      var url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})), a = document.createElement('a'); a.href = url; a.download = 'soundlab-recognition-evidence.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); },1000);
    }
    function paintPending() {
      pendingBox.textContent = ''; var entries = Array.from(retained.entries()).filter(function (entry) { return !source || entry[0] !== pageKey(source); });
      pendingBox.hidden = !entries.length;
      if (!entries.length) return;
      var heading = document.createElement('h4'); heading.textContent = 'Unsaved recognition from other sources/pages'; pendingBox.appendChild(heading);
      var note = document.createElement('p'); note.className = 'small'; note.textContent = 'Return to that original and page to save its draft. Evidence remains here across navigation; export or explicitly discard it before updating.'; pendingBox.appendChild(note);
      entries.forEach(function (entry) {
        var row = document.createElement('div'); row.className = 'omr-actions'; var label = document.createElement('span'); label.textContent = entry[1].source.item.original.filename + ' · page ' + entry[1].source.currentPage; row.appendChild(label);
        var out = document.createElement('button'); out.type = 'button'; out.className = 'btn'; out.textContent = 'Export evidence'; out.onclick = function () { downloadEvidence({format:'soundlab-local-recognition-evidence',version:1,pending:clone(entry[1])}); }; row.appendChild(out);
        var discard = document.createElement('button'); discard.type = 'button'; discard.className = 'btn'; discard.textContent = 'Discard this result'; discard.onclick = function () { if (!confirm('Discard this unsaved recognition result? Its original remains retained.')) return; retained.delete(entry[0]); paintPending(); }; row.appendChild(discard); pendingBox.appendChild(row);
      });
    }
    function cancel(message) {
      generation++; if (abort) abort.abort(); abort = null; busy = false;
      if (message) status(saving ? 'A draft save is already in progress. Check this original’s Library revisions before trying again.' : message); controls();
    }
    function alive(g) { if (disposed || !visible || generation !== g || abort && abort.signal.aborted) throw abortError(); }
    async function sameSource(g) {
      var next = await context.getSource(); alive(g);
      if (!validSource(next) || key(next) !== key(source) || next.currentPage !== source.currentPage) throw new Error('The source or page changed. Find staff regions again before saving.');
      return next;
    }
    async function refresh() {
      stash(); cancel(); source = null; image = null; regions = []; results = []; staged = null;
      el('selection').hidden = true; el('output').hidden = true; el('regions').textContent = ''; el('monophonic').checked = false; el('sequential').checked = false;
      var g = generation;
      try { var s = await context.getSource(); if (disposed || generation !== g) return; source = s;
        var old = validSource(s) && retained.get(pageKey(s));
        if (old) { results = clone(old.results); staged = old.draft && clone(old.draft); renderOutput(); status('Unsaved recognition restored for this original/page. Save or export it, or explicitly discard it before recognizing again.'); }
        else status(validSource(s) ? 'Ready to find staff regions on page ' + (s.currentPage || 1) + '. Inference initializes only after you choose staves and start recognition; bundled assets may already be cached.' : 'Choose a local PDF or image in Score review.');
      } catch (error) { if (generation === g) status(text(error),true); }
      controls(); paintPending();
    }
    function preview() {
      var canvas = el('preview'), scale = Math.min(1,900 / image.width);
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      var original = document.createElement('canvas'); original.width = image.width; original.height = image.height;
      var imageData = image instanceof root.ImageData ? image : new ImageData(new Uint8ClampedArray(image.data),image.width,image.height);
      original.getContext('2d').putImageData(imageData,0,0);
      var c = canvas.getContext('2d'); c.drawImage(original,0,0,canvas.width,canvas.height); c.lineWidth = 2; c.font = 'bold 15px sans-serif';
      regions.forEach(function (r,i) { var b = r.bbox; c.strokeStyle = '#b73700'; c.strokeRect(b.x * scale,b.y * scale,b.width * scale,b.height * scale); c.fillStyle = '#fff'; c.fillRect(b.x * scale,b.y * scale,25,21); c.fillStyle = '#842900'; c.fillText(String(i + 1),b.x * scale + 6,b.y * scale + 16); });
    }
    async function detect() {
      if (results.length || saving) return;
      cancel(); var g = generation; busy = true; abort = new AbortController(); staged = null; results = []; controls();
      try {
        var detectedSource = await context.getSource(); alive(g); source = detectedSource; if (!validSource(source)) throw new Error('Choose a PDF or image first.');
        if (!root.SLStaffDetection || !root.SLStaffDetection.detectStaffRegions) throw new Error('Local staff detection is unavailable. Original and manual review remain available.');
        status('Rendering page ' + (source.currentPage || 1) + ' locally…');
        var raster = await context.getPagePixels(source.currentPage || 1,1.5); alive(g); await sameSource(g); alive(g); image = raster;
        if (!image || !image.data || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width * image.height > 12000000 || image.width > 8192 || image.height > 8192) throw new Error('Use a page raster no larger than 12 million pixels or 8,192 pixels per side.');
        var detected = await root.SLStaffDetection.detectStaffRegions({data:image.data,width:image.width,height:image.height,channels:4}); alive(g);
        regions = (detected.regions || []).filter(function (r) { return r.usable !== false; }).slice(0,40);
        if (!regions.length) throw new Error('No usable five-line staff was detected. Try a clearer page; the original remains available for correction. ' + (detected.warnings || []).map(issue).join(' '));
        el('regions').textContent = '';
        regions.forEach(function (r,i) {
          var row = document.createElement('div'); row.className = 'omr-region'; row.dataset.region = r.id;
          var label = document.createElement('label'); label.className = 'omr-check'; var check = document.createElement('input'); check.type = 'checkbox'; check.checked = regions.length === 1; label.appendChild(check); label.appendChild(document.createTextNode('Staff ' + (i + 1) + ' · y ' + Math.round(r.bbox.y) + '–' + Math.round(r.bbox.y + r.bbox.height))); row.appendChild(label);
          var orderLabel = document.createElement('label'); orderLabel.textContent = 'Passage order'; var order = document.createElement('input'); order.type = 'number'; order.min = '1'; order.max = '40'; order.value = String(i + 1); orderLabel.appendChild(order); row.appendChild(orderLabel);
          if (r.warnings && r.warnings.length) { var p = document.createElement('p'); p.className = 'small'; p.textContent = r.warnings.map(issue).join(' '); row.appendChild(p); }
          el('regions').appendChild(row);
        });
        el('selection').hidden = false; el('output').hidden = true; preview();
        status('Found ' + regions.length + ' candidate staff region' + (regions.length === 1 ? '' : 's') + '. Choose a single voice, confirm support and start recognition. ' + (detected.warnings || []).map(issue).join(' '));
      } catch (error) { if (generation === g) status(error.name === 'AbortError' ? 'Recognition cancelled.' : text(error),error.name !== 'AbortError'); }
      finally { if (generation === g) { busy = false; abort = null; controls(); } }
    }
    function renderOutput() {
      el('output').hidden = false; el('warnings').textContent = '';
      var allWarnings = [], count = 0;
      results.forEach(function (r) { count += (r.events || []).length; (r.warnings || []).concat(r.unsupported || []).forEach(function (w) { allWarnings.push(issue(w)); }); });
      el('summary').textContent = count + ' automatic note/rest events from ' + results.length + ' selected staff region' + (results.length === 1 ? '' : 's') + '. Every target is unverified. No confidence percentage is claimed.';
      if (!allWarnings.length) allWarnings.push('No warning was emitted by the model. This does not establish correctness or complete notation support.');
      allWarnings.forEach(function (message) { var li = document.createElement('li'); li.textContent = message; el('warnings').appendChild(li); });
      el('raw').textContent = JSON.stringify({source:key(source),page:source.currentPage || 1,results:results},null,2);
    }
    async function recognize() {
      if (results.length || saving) return;
      var picks = selected();
      if (!picks.length || picks.length > MAX_STAVES || !el('monophonic').checked || picks.length > 1 && !el('sequential').checked) return;
      if (picks.some(function (p) { return !Number.isInteger(p.order) || p.order < 1 || p.order > 40; }) || new Set(picks.map(function (p) { return p.order; })).size !== picks.length) { status('Give each selected staff a unique passage order from 1 to 40.',true); return; }
      cancel(); var g = generation; busy = true; abort = new AbortController(); staged = null; results = []; controls();
      try {
        await sameSource(g);
        if (!root.SLRecognition || !root.SLRecognition.recognize) throw new Error('The local recognition engine is unavailable. No draft was created.');
        for (var i = 0; i < picks.length; i++) {
          alive(g); status('Loading local model / recognizing staff ' + (i + 1) + ' of ' + picks.length + '…');
          var region = Object.assign({},picks[i].region,{page:source.currentPage || 1});
          var result = await root.SLRecognition.recognize({imageData:image,region:region,page:source.currentPage || 1,signal:abort.signal,onProgress:function (event) { if (generation === g) status('Local recognition: ' + (event && (event.message || event.stage) || 'working') + '. No file upload.'); }});
          alive(g); results.push(result); renderOutput();
          // Keep each completed region even if a later region is cancelled.
          try { staged = buildDraft(source,picks.slice(0,results.length).map(function (p) { return p.region; }),results,{sequential:el('sequential').checked,raster:{width:image.width,height:image.height},instrument:root.App && App.practiceInstrument ? App.practiceInstrument.get() : 'piano'}); } catch (e) { staged = null; }
          stash();
        }
        await sameSource(g);
        staged = buildDraft(source,picks.map(function (p) { return p.region; }),results,{sequential:el('sequential').checked,raster:{width:image.width,height:image.height},instrument:root.App && App.practiceInstrument ? App.practiceInstrument.get() : 'piano'});
        stash();
        status('Recognition finished. Compare the raw result and save an unverified draft for correction. Nothing has been reviewed or practiced.');
      } catch (error) { if (generation === g) { if (results.length) renderOutput(); status(error.name === 'AbortError' ? 'Recognition cancelled. No automatic save was made.' : text(error),error.name !== 'AbortError'); } }
      finally { if (generation === g) { busy = false; abort = null; controls(); } }
    }
    async function save() {
      if (!staged || busy) return;
      var g = generation, payload = clone(staged), target = {id:source.item.id,key:pageKey(source)}; busy = true; saving = true; controls();
      try {
        await sameSource(g); alive(g); var library = context.library || root.SLMusicLibrary;
        if (!library || !library.saveRevision) throw new Error('The local library is unavailable. Recognition evidence remains exportable.');
        var savingKey = target.key, saved = await library.saveRevision(target.id,payload);
        retained.delete(savingKey); alive(g); await sameSource(g);
        staged = null; results = []; status('Unverified draft saved locally. Opening correction and review…');
        busy = false; controls(); await context.openRevision(saved.id);
      } catch (error) { if (generation === g) status(text(error),true); }
      finally { saving = false; if (generation === g) busy = false; if (!disposed) controls(); }
    }
    function exportEvidence() {
      var data = {format:'soundlab-local-recognition-evidence',version:1,sourceItemId:source && source.item.id,sourceSha256:source && source.item.original.sha256,page:source && source.currentPage,results:results,draft:staged};
      downloadEvidence(data);
    }
    el('detect').onclick = detect; el('cancel').onclick = function () { cancel('Recognition cancelled. No automatic save was made.'); };
    el('run').onclick = recognize; el('save').onclick = save; el('export').onclick = exportEvidence;
    el('discard').onclick = function () { if (busy || saving || results.length && !confirm('Discard this unsaved recognition result? The original and any already saved revisions stay retained.')) return; if(source)retained.delete(pageKey(source));results = []; staged = null; el('output').hidden = true; status('Recognition result discarded. The original remains retained.'); controls(); paintPending(); };
    el('regions').onchange = controls; el('monophonic').onchange = controls; el('sequential').onchange = controls;
    var api = {onSource:refresh,setVisible:function (value) { visible = !!value; if (!visible) { stash(); cancel('Recognition stopped when leaving Score review. Completed results remain retained for this original/page.'); } else refresh(); },dispose:function () { stash(); disposed = true; cancel(); controllers.delete(api); host.textContent = ''; },checkpoint:function () { return busy || saving ? {ok:false,errors:['Local notation recognition is still running. Cancel or finish it before reloading.']} : retained.size ? {ok:false,errors:['Save or explicitly discard unverified recognition results before reloading. Export evidence first if needed.']} : {ok:true}; },snapshot:function () { return {busy:busy,visible:visible,sourceItemId:source && source.item.id,page:source && source.currentPage,regions:clone(regions),results:clone(results),draft:staged && clone(staged)}; }};
    controllers.add(api); controls(); refresh(); return api;
  }
  if (root.addEventListener) root.addEventListener('beforeunload',function (event) {
    if (retained.size || Array.from(controllers).some(function (c) { return !c.checkpoint().ok; })) { event.preventDefault(); event.returnValue = ''; }
  });
  return {mount:mount,buildDraft:buildDraft,checkpoint:function () { var errors = []; controllers.forEach(function (c) { var r = c.checkpoint(); if (!r.ok) errors = errors.concat(r.errors); });if(retained.size&&!errors.length)errors.push('Unsaved recognition evidence remains. Save or explicitly discard it before reloading.');return {ok:!errors.length,errors:errors}; },pending:function(){return clone(Array.from(retained.values()));},maxSelectedStaves:MAX_STAVES};
});
