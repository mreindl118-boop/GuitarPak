/* Guided performance UI. Woodshed supplies structured scores; PerformanceEngine
 * supplies the single target/clock state for screen, grading and shared LEDs.
 * No hardware is required. Raw attacks are graded before sound admission. */
(function () {
  'use strict';
  var root, engine, timer, options, score, voice, lastGuide = '', lastMessage = '', lastCurrent = '';
  var virtual = {}, base = 48, rawStatus = {}, listenersReady = false, inputIds = [], inputToken = null, metrics = null, audioInput=null,audioStopping=false,pendingProgress=[];
  var appInput = null, routedInput = null; // App.midi's own input / the one the player pointed it at (null = untouched)
  var INSTRUMENTS=['piano','synth','guitar','bass','drums','voice','other'];
  var KEY_CODES = ['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK'];
  var typing = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function el(id) { return root && root.querySelector('#pf-' + id); }
  function name(m) { return Theory.midiName(m, false); }
  function color(m) { return App.colors.forPitch ? App.colors.forPitch(m) : App.colors.forNote(Theory.mod12(m)); }
  function live() { return !!(engine && root && document.body.contains(root) && App.active === 'shed'); }
  function active(s) { return s && (s.status === 'running' || s.status === 'countin'); }
  function audio() {
    if (!voice) { var ctx = App.getAudio(); voice = DAW.createSynth(ctx, DAW.SYNTH_PRESETS[2].params); voice.output.connect(ctx.destination); }
    return voice;
  }
  function cleanup(keepAudio) {
    if(audioInput){audioStopping=true;if(keepAudio===true)audioInput.reset();else audioInput.stop();audioStopping=false;}
    if (voice) voice.allNotesOff();
    if (engine) { engine.releaseInput('virtual'); engine.releaseInput('qwerty'); engine.releaseInput('test'); }
    virtual = {}; typing = {};
    App.emit('performance:cleanup', {});
    if (App.midi && App.midi.flushMusicalOutputs) App.midi.flushMusicalOutputs('Performance paused or stopped.');
    if (App.midi && App.midi.guide) App.midi.guide(null, null);
    lastGuide = '';
  }
  function clearTimer() { if (timer) clearInterval(timer); timer = null; App.wake.release('performance'); }
  function wallNow(){return options&&typeof options.now==='function'?Number(options.now()):Date.now();}
  function beginMetrics(){metrics={id:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'practice-'+Date.now()+'-'+Math.random().toString(36).slice(2),instrument:options.instrument,startedAt:wallNow(),lastTick:options.clock(),lastWall:wallNow(),lastActivity:null,engagedSeconds:0,segments:{},recorded:false,failed:false,tempo:null};}
  function activity(event){if(!metrics||metrics.recorded||!event||event.on===false||(event.velocity==null?event.vel==null?100:event.vel:event.velocity)<=0)return;var s=engine.snapshot();if(s.status==='running'&&(!s.lastFeedback||s.lastFeedback.kind!=='repeat'))metrics.lastActivity=options.clock();}
  function engagement(){
    if(!metrics||metrics.recorded||!engine)return;
    var now=options.clock(),wall=wallNow(),delta=Math.min(now-metrics.lastTick,(wall-metrics.lastWall)/1000);
    metrics.lastTick=now;metrics.lastWall=wall;
    var s=engine.snapshot();
    if(s.status!=='running'||metrics.lastActivity===null||now-metrics.lastActivity>5||delta<=0||delta>1)return;
    metrics.tempo=Math.max(metrics.tempo||0,s.tempo);
    var progress=App.practiceProgress,start=wall-delta*1000;
    function day(ms){return progress?progress.dayKey(ms):new Date(ms).toISOString().slice(0,10);}
    function add(from,to,seconds){if(seconds<=0)return;var key=day(from),part=metrics.segments[key];if(!part)part=metrics.segments[key]={date:key,startedAt:from,endedAt:to,engagedSeconds:0};part.endedAt=to;part.engagedSeconds+=seconds;metrics.engagedSeconds+=seconds;}
    if(day(start)!==day(Math.max(start,wall-1))){
      var low=Math.floor(start),high=Math.ceil(wall),first=day(start);
      while(high-low>1){var mid=Math.floor((low+high)/2);if(day(mid)===first)low=mid;else high=mid;}
      var before=Math.max(0,Math.min(delta,(high-start)/1000));add(start,high,before);add(high,wall,delta-before);
    }else add(start,wall,delta);
  }

  function finishMetrics(status){
    if(!metrics||metrics.recorded||metrics.failed||!engine||!App.practiceProgress)return;
    engagement();var s=engine.snapshot(),r=s.results;
    if(!metrics.engagedSeconds&&!r.matched&&!r.extra&&!r.missed){metrics.recorded=true;return;}
    var timed=s.mode==='tempo'?r.matched:0;
    var session={id:metrics.id,instrument:metrics.instrument,startedAt:metrics.startedAt,endedAt:wallNow(),engagedSeconds:metrics.engagedSeconds,segments:Object.keys(metrics.segments).map(function(k){return metrics.segments[k];}),mode:s.mode,status:status,expected:r.expected,matched:r.matched,missed:r.missed,extra:r.extra,wrong:r.wrong,tempo:s.mode==='tempo'?metrics.tempo:null,timingSamples:timed,sumAbsTimingMs:timed*(r.meanAbsTimingMs||0),sumTimingMs:timed*(r.meanTimingMs||0)};
    var result=App.practiceProgress.recordSession(session);
    if(result&&result.ok){metrics.recorded=true;App.emit('practiceprogress:changed',{instrument:metrics.instrument});}
    else{metrics.failed=true;pendingProgress.push(session);}
    paintProgress();
  }
  function retryProgress(){if(!App.practiceProgress)return;pendingProgress=pendingProgress.filter(function(session){var r=App.practiceProgress.recordSession(session);return !r||!r.ok;});paintProgress();}
  function exportPending(){var blob=new Blob([JSON.stringify({unrecordedPracticeSessions:pendingProgress},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='soundlab-unsaved-practice.json';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}

  function paintProgress(){if(!el('xp')||!App.practiceProgress)return;el('progress-unsaved').hidden=!pendingProgress.length;if(pendingProgress.length){el('xp').textContent='Progress was not saved ('+pendingProgress.length+' session). Retry or export the unsaved observations before closing the page.';return;}var p=App.practiceProgress.summary(options.instrument);el('xp').textContent=options.instrument+' progress is tracked independently. Open Progress in the Woodshed library for lifetime XP, consistency level, daily goals and history.';if(p&&p.lifetimeEarnedXP!=null)el('xp').textContent=options.instrument+' · lifetime '+Math.round(p.lifetimeEarnedXP)+' XP · consistency '+Math.round(p.currentXP||0)+' XP · level '+(p.level||1);}
  function notify(s, event) {
    if (!root) return;
    if (event && ['pause','stop','complete','restart','section','transpose'].indexOf(event.type) !== -1) cleanup();
    paint(s);
    if (s.status === 'complete' && !options.reported) { options.reported=true;options.doneAt=Date.now();finishMetrics('complete');clearTimer(); saveResult(s); report(s); }
  }
  function saveResult(s) {
    if (options.saved) return;
    options.saved = true;
    var history = App.store.get('ws.performance.results', []);
    if (!Array.isArray(history)) history = [];
    var summary=Object.assign({},s.results);delete summary.attempts;delete summary.durationDetails;
    history.push({ title: score.title, at: Date.now(), mode: s.mode, tempo: s.tempo,
      transpose: s.transpose, section: s.section, results: summary });
    App.store.set('ws.performance.results', history.slice(-30));
  }
  function beginTimer() {
    if (timer) return;
    timer = setInterval(function () { if (live()) {engagement();engine.tick();} }, 25);
    App.wake.acquire('performance');
  }
  function start(restart) {
    if(options.inputKind==='audio'&&hasChords()){el('audio-status').textContent='Chord audio is unsupported. Choose the arpeggio version or MIDI.';return;}
    finishMetrics('stopped');cleanup(true); options.saved = false; options.reported=false;el('report').hidden = true;
    function go(){if (restart) engine.restart(); else engine.start();beginMetrics();beginTimer();paint(engine.snapshot());}
    if(options.inputKind==='audio'&&(!audioInput||!audioInput.state.running))return listenAudio().then(function(ok){if(ok)go();});
    go();
  }
  function pause(reason) {
    if (!engine) return;
    engagement();
    engine.pause(); cleanup(); clearTimer();
    if (reason && el('feedback')) { el('feedback').textContent = reason; lastMessage = reason; }
  }
  function resume(){
    if(!engine||engine.snapshot().status!=='paused')return;
    function go(){if(metrics){metrics.lastTick=options.clock();metrics.lastWall=wallNow();metrics.lastActivity=null;}engine.resume();beginTimer();paint(engine.snapshot());}
    if(options.inputKind==='audio'&&(!audioInput||!audioInput.state.running))return listenAudio().then(function(ok){if(ok)go();});
    go();
  }
  function stop(silent) {
    if (!engine) return;
    engine.tick();finishMetrics(engine.snapshot().status==='complete'?'complete':'stopped');
    engine.stop(); engine.releaseInput(); cleanup(); clearTimer(); paint(engine.snapshot());
    if(silent!==true)report(engine.snapshot());
  }
  function leave(){var back=options.onBack;close();if(back)back();}
  // CONTROLLER REMOTE (js/remote.js, via Woodshed's onRemote): the same
  // functions as the buttons. NEXT = Start / Resume / Again (counting in or
  // playing ignores it); BACK = Restart (Again on a report); STOP = Stop
  // (partial report), with nothing running ← Library. In the instant a run
  // completes all three only let its report show. false = nothing here.
  function remote(action){
    if(!engine||!root)return false;
    var st=engine.snapshot().status;
    if(st==='countin'||st==='running'){
      if(action==='back'){start(true);return 'Restart';}
      if(action==='stop'){stop();return 'Stopped';}
      return action==='next'?st==='countin'?'Starting…':'Playing…':false;
    }
    if(action!=='next'&&action!=='back'&&action!=='stop')return false;
    if(st==='complete'&&Date.now()-(options.doneAt||0)<600)return 'Results'; // just finished: let the report show (STOP too)
    if(action==='stop'){if(st==='paused'){stop();return 'Stopped';}leave();return 'Library';}
    if(action==='back'&&st==='idle')return false;
    if(options.inputKind==='audio'&&hasChords()){if(App.toast)App.toast('Audio input cannot grade chords: choose the arpeggio version or MIDI.');return 'Can’t start';}
    var p,label;
    if(action==='back'){p=start(true);label=st==='paused'?'Restart':'Again';}
    else if(st==='paused'){p=resume();label='Resume';}
    else if(st==='complete'){p=start(true);label='Again';}
    else{p=start(false);label='Start';}
    // audio input opens the device first: say so when it did not start
    if(p&&p.then)p.then(function(){if(root&&engine&&!active(engine.snapshot())&&App.toast)App.toast(el('audio-status').textContent||'Audio input did not start.');});
    return label;
  }
  // may the remote's reserved double-tap key be claimed? Only when no note
  // can be judged: not counting in, playing or paused
  function remoteKey(){var s=engine&&root?engine.snapshot():null;return !!s&&['idle','stopped','complete'].indexOf(s.status)!==-1;}
  // INPUT ROUTE: raw() grades only the player's own input, so App.midi just
  // has to DELIVER that port. All inputs (the app default) already does, and
  // keeps a remote pedal / synth button on any other port working (js/
  // remote.js claims it in midi.js): never narrow it. Only an app listening to
  // one OTHER port is pointed at the player's, while the Woodshed shows the
  // player; hide / close / unload give the app its own choice back (unless
  // another input was picked meanwhile).
  function routeInput(){
    if(!root||!options||!App.midi||!App.midi.setInput)return;
    var cur=App.midi.inputId,id=options.inputId;
    if(cur==='all'||String(cur)===String(id))return;
    if(id!=='all'&&!App.midi.inputs.some(function(p){return String(p.id)===String(id);}))return;
    if(routedInput===null)appInput=cur;
    App.midi.setInput(id);routedInput=App.midi.inputId;
  }
  function unrouteInput(){
    var was=appInput,routed=routedInput;appInput=routedInput=null;
    if(routed===null||was==null||!App.midi||!App.midi.setInput||String(App.midi.inputId)!==String(routed))return;
    App.midi.setInput(was);
  }
  function close() {
    stop(true);unrouteInput();
    if (voice && voice.dispose) voice.dispose(); voice = null;
    if(audioInput)audioInput.dispose();audioInput=null;
    root = null; engine = null; score = null; rawStatus = {}; inputToken=null;inputIds=[];metrics=null;
  }
  function guide(s) {
    if (!App.midi || !App.midi.guide) return;
    var target = active(s) && s.phase !== 'rest' ? s.status==='countin'&&s.current?s.current.notes:s.mode === 'tempo' ? s.activeNotes || [] : s.current ? s.current.notes : [] : [];
    var nextGroup = s.mode === 'tempo' && s.current && s.current.beat > s.beat + .001 ? s.current : s.upcoming && s.upcoming[0];
    var next = active(s) && nextGroup ? nextGroup.notes : [];
    // A rest has no target LEDs. The same current/upcoming state draws below.
    if (s.phase === 'rest') next = [];
    var k = JSON.stringify([target, next]);
    if (k !== lastGuide) { lastGuide = k; App.midi.guide(target, next); }
  }
  function notesText(g) { return g && g.notes.length ? g.notes.map(name).join(' + ') : 'Rest'; }
  function paint(s) {
    if (!root || !el('status')) return;
    var running = active(s), isPause = s.status === 'paused';
    options.tempo=s.tempo;if(document.activeElement!==el('tempo'))el('tempo').value=s.tempo;
    el('status').textContent = s.status === 'countin' ? 'Count in · ' + Math.ceil(s.countInRemaining || 0) :
      s.status === 'complete' ? 'Complete' : isPause ? 'Paused' : s.status === 'idle' ? 'Ready' : s.status === 'stopped' ? 'Stopped' :
      s.phase === 'rest' ? 'Rest · ' + (s.restRemainingBeats || 0).toFixed(1) + ' beats' : s.mode === 'wait' ? 'Your turn' : 'Playing at tempo';
    var incompatible=options.inputKind==='audio'&&hasChords();
    el('start').disabled = running || isPause || incompatible;
    el('arpeggio').hidden=!incompatible;
    el('audio-panel').hidden=options.inputKind!=='audio';
    el('pause').disabled = !(running || isPause); el('pause').textContent = isPause ? 'Resume' : 'Pause';
    el('mode').disabled = running || isPause;
    ['countin','transpose','section-start','section-end','loop','instrument'].forEach(function (id) { el(id).disabled = running || isPause; });
    var current = s.current, targetNotes = s.status==='countin'&&current?current.notes:s.mode === 'tempo' ? s.activeNotes || [] : current ? current.notes : [];
    var text = s.phase === 'rest' ? 'Rest — release and listen to the pulse' : targetNotes.length ? targetNotes.map(name).join(' + ') : current ? notesText(current) : 'Ready for your next performance';
    if (lastCurrent !== text) { el('current').textContent = text; lastCurrent = text; }
    el('instruction').textContent = s.mode === 'wait' ? 'Match every note in the chord, then release before a repeated note. Rests run on the beat clock.' : 'Play as the notes reach the playhead. The clock continues through mistakes and rests.';
    var matchedNotes=s.mode==='tempo'?s.activeMatchedNotes||[]:current?current.matched:[];
    el('matched').textContent = matchedNotes.length ? '✓ Matched ' + matchedNotes.map(name).join(', ') : '○ Waiting for a fresh attack';
    var feedback = s.lastFeedback && s.lastFeedback.message || '';
    if (feedback !== lastMessage) { el('feedback').textContent = feedback || 'Choose Start when you are ready.'; lastMessage = feedback; }
    el('feedback').setAttribute('data-kind', s.lastFeedback && s.lastFeedback.kind || 'ready');
    var upcoming = s.upcoming || [];
    if(current&&(s.phase==='rest'||s.mode==='tempo'&&current.beat>s.beat+.001))upcoming=[current].concat(upcoming).slice(0,4);
    var upcomingHTML = upcoming.map(function (g) { return '<li><b>' + esc(notesText(g)) + '</b><span>beat ' + (g.beat + 1).toFixed(1).replace(/\.0$/, '') + '</span></li>'; }).join('');
    if (el('upcoming').innerHTML !== upcomingHTML) el('upcoming').innerHTML = upcomingHTML;
    var r = s.results || {};
    el('progress').value = Math.max(0, Math.min(1, s.progress || 0));
    el('stats').textContent = (r.matched || 0) + '/' + (r.expected || 0) + ' notes · ' + (r.missed || 0) + ' missed · ' + (r.wrong || 0) + ' wrong · ' + (r.extra || 0) + ' extra' + (r.loops ? ' · pass ' + (r.loops + 1) : '');
    el('beat').textContent = 'Beat ' + Math.max(0, s.beat + 1).toFixed(1) + ' · ' + s.tempo + ' BPM';
    var ds = App.midi && App.midi.displayState;
    el('display-state').textContent = 'LUMI Display: ' + (!ds || !ds.enabled ? 'off — on-screen guidance is active' : ds.connected ? ds.name + ' · hardware response unverified' : ds.reason);
    var blocked = score.notes.filter(function (n) { return App.scaleLock && App.scaleLock.on && !App.scaleLock.contains(n.m + (s.transpose || 0)); }).length;
    el('lock-state').textContent = blocked ? 'Scale Lock will mute ' + blocked + ' score notes outside the selected root/scale. Raw mistakes still count. Choose the intended scale in the treble-clef menu.' : 'Raw input is scored before Scale Lock. Sound follows the shared selected root/scale.';
    el('keyboard').querySelectorAll('[data-pf-note]').forEach(function (b) {
      b.disabled=options.inputKind==='audio';
      var m = Number(b.dataset.pfNote), target = targetNotes.indexOf(m) !== -1 && s.phase !== 'rest';
      var matched = matchedNotes.indexOf(m) !== -1;
      var held = s.held.indexOf(m) !== -1;
      var wrong = s.lastFeedback && ['wrong','extra'].indexOf(s.lastFeedback.kind) !== -1 && s.lastFeedback.midi === m;
      b.style.setProperty('--pf-pitch', color(m));
      b.classList.toggle('pf-target', !!target); b.classList.toggle('pf-hit', !!matched); b.classList.toggle('pf-held', held); b.classList.toggle('pf-wrong', !!wrong);
      b.setAttribute('aria-pressed', String(held));
      b.querySelector('i').textContent = wrong ? '×' : matched ? '✓' : target ? '●' : '';
    });
    var warningHTML=(s.warnings||[]).map(function(w){return '<li>'+esc(w)+'</li>';}).join('');if(el('source-warnings').innerHTML!==warningHTML)el('source-warnings').innerHTML=warningHTML;
    drawRoll(s); guide(s);
  }
  function drawRoll(s) {
    var cv = el('roll'), g = cv.getContext('2d'), w = Math.max(300, cv.clientWidth), h = 210;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== w*dpr || cv.height !== h*dpr) { cv.width = w*dpr; cv.height = h*dpr; }
    g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
    var cs = getComputedStyle(document.documentElement), ink = cs.getPropertyValue('--text').trim() || '#eee', muted = cs.getPropertyValue('--muted').trim() || '#888';
    var curBeat = s.status === 'idle' || s.status === 'stopped' ? s.section.startBeat : s.beat;
    var from = curBeat - 1.5, span = 8, unit = w/span, playX = 1.5*unit;
    var nearby = score.notes.filter(function (n) { return n.t+n.d >= from && n.t < from+span; });
    var pitches = nearby.map(function (n) { return n.m + (s.transpose || 0); });
    var lo = Math.min(60, Math.min.apply(null, pitches)), hi = Math.max(72, Math.max.apply(null, pitches));
    if (!isFinite(lo)) { lo=48; hi=72; } lo-=2; hi+=2;
    function y(m) { return 178 - (m-lo)/(hi-lo)*148; }
    for (var p=lo; p<=hi; p++) {
      if ([0,2,4,5,7,9,11].indexOf(Theory.mod12(p)) === -1) continue;
      g.strokeStyle=muted; g.globalAlpha=.14; g.beginPath(); g.moveTo(0,y(p)); g.lineTo(w,y(p)); g.stroke(); g.globalAlpha=1;
      if (Theory.mod12(p)===0) { g.fillStyle=muted; g.font='11px sans-serif'; g.fillText(name(p),4,y(p)-2); }
    }
    for (var b=Math.ceil(from); b<from+span; b++) {
      g.strokeStyle=muted; g.globalAlpha=b%4===0?.4:.17; g.beginPath(); g.moveTo((b-from)*unit,20); g.lineTo((b-from)*unit,187); g.stroke(); g.globalAlpha=1;
      g.fillStyle=muted; g.font='11px sans-serif'; g.fillText(String(b+1),(b-from)*unit+3,203);
    }
    var judged={};(s.results.attempts||[]).forEach(function(a){if(a.result==='matched'||a.result==='missed')judged[a.beat+':'+a.midi]=a.result;});
    nearby.forEach(function (n) {
      var m=n.m+(s.transpose||0), isCurrent=s.mode==='tempo'?n.t<=s.beat&&n.t+n.d>s.beat:s.current && Math.abs(s.current.beat-n.t)<.001;
      var result=judged[n.t+':'+m],matched=result==='matched'||isCurrent&&s.current&&s.current.matched.indexOf(m)!==-1,missed=result==='missed';
      g.fillStyle=color(m);
      g.globalAlpha=isCurrent?1:.6; var x=(n.t-from)*unit, width=Math.max(8,n.d*unit-3);
      g.fillRect(x,y(m)-6,width,12); g.globalAlpha=1;
      g.strokeStyle=ink;if(missed)g.setLineDash([3,2]);if(isCurrent||missed) g.strokeRect(x,y(m)-6,width,12);g.setLineDash([]);
      g.fillStyle=ink; g.font='11px sans-serif'; g.fillText((matched?'✓ ':missed?'× ':'')+name(m),x+2,y(m)-9);
    });
    g.strokeStyle='#e55766'; g.lineWidth=3; g.beginPath(); g.moveTo(playX,8); g.lineTo(playX,187); g.stroke(); g.lineWidth=1;
    g.fillStyle=ink; g.font='bold 12px sans-serif'; g.fillText(s.mode==='wait'?'PLAY THIS':'PLAYHEAD',playX+5,14);
    var nowNotes=s.status==='countin'&&s.current?s.current.notes:s.mode==='tempo'?s.activeNotes||[]:s.phase==='rest'?[]:s.current?s.current.notes:[];
    var future=s.current&&(s.phase==='rest'||s.mode==='tempo'&&s.current.beat>s.beat+.001)?[s.current].concat(s.upcoming||[]):s.upcoming||[];
    cv.setAttribute('aria-label', 'Piano roll. '+(nowNotes.length?nowNotes.map(name).join(' + '):'Rest')+'. Beat '+(s.beat+1).toFixed(1)+'. Upcoming '+future.map(notesText).join('; '));
  }
  function keyboard() {
    el('keyboard').innerHTML = Array.from({length:25},function (_,i) {
      var m=base+i, black=[1,3,6,8,10].indexOf(Theory.mod12(m))!==-1;
      return '<button type="button" class="pf-key '+(black?'pf-black':'')+'" data-pf-note="'+m+'" aria-label="Play '+esc(name(m))+'" aria-pressed="false"><i aria-hidden="true"></i><span>'+esc(name(m))+'</span></button>';
    }).join('');
  }
  function note(d) {
    if (!live() || !d) return;
    if(options.inputKind==='audio'&&d.source!=='audio'&&d.on!==false&&(d.velocity==null?d.vel==null?100:d.vel:d.velocity)>0)return;
    engagement();
    // Deliberately first: a blocked wrong note must still reach the scorer.
    engine.input(d);
    activity(d);
    var m=d.midi == null?d.note:d.midi, down=d.on!==false && (d.velocity==null?d.vel==null?100:d.vel:d.velocity)>0;
    if (d.source==='virtual' || d.source==='qwerty' || d.source==='test') {
      if(down) {
        virtual[m]=true;
        if(el('sound').checked && active(engine.snapshot()) && (!App.scaleLock || App.scaleLock.allows(m))) audio().noteOn(m,.65,App.getAudio().currentTime,0);
      } else { delete virtual[m]; if(voice) voice.noteOff(m,App.getAudio().currentTime,0); }
    }
    paint(engine.snapshot());
  }
  function hasChords(){return PerformanceEngine.normalizeScore(score).groups.some(function(g){return g.notes.length>1;});}
  function audioSettings(){return {deviceId:el('audio-device').value,referenceA4:Number(el('audio-reference').value),minMidi:Number(el('audio-low').value),maxMidi:Number(el('audio-high').value),transpose:Number(el('audio-transpose').value),confidence:Number(el('audio-confidence').value),noiseFloor:Number(el('audio-noise').value),latencyMs:Number(el('audio-latency').value)};}
  function listenAudio(simulation){
    if(!window.PracticeInput)return Promise.resolve(false);
    if(hasChords()){el('audio-status').textContent='Monophonic audio cannot grade chords. Choose an arpeggio or MIDI pickup.';return Promise.resolve(false);}
    var fields=['reference','low','high','transpose','confidence','noise','latency'];
    if(fields.some(function(id){var c=el('audio-'+id);return c.value.trim()===''||!Number.isFinite(Number(c.value))||!c.checkValidity();})||Number(el('audio-low').value)>Number(el('audio-high').value)){el('audio-status').textContent='Enter valid calibration values and an ordered MIDI pitch range before listening.';return Promise.resolve(false);}
    if(!audioInput)audioInput=new PracticeInput({clock:options.clock,expectedNotes:function(){var s=engine&&engine.snapshot();return s&&s.current?s.current.notes:[];},onNote:note,onState:function(state){if(!root)return;el('audio-status').textContent=state.message;el('audio-listen').textContent=state.running?'Stop listening':'Start listening';if(!state.running&&!audioStopping&&engine&&active(engine.snapshot()))pause(state.message);}});
    var config=audioSettings();if(simulation===true)config.simulation=true;
    App.store.set('ws.performance.audio',config);
    if(engine&&engine.setInputDelay)engine.setInputDelay(Math.min(500,config.latencyMs+100));
    return audioInput.start(config);
  }
  function listAudio(){if(!App.audioIn)return Promise.resolve([]);return App.audioIn.devices(false).then(function(devices){if(!root)return devices;var chosen=el('audio-device').value;el('audio-device').innerHTML='<option value="">System default audio input</option>'+devices.map(function(p){return '<option value="'+esc(p.deviceId||p.id)+'">'+esc(p.label||p.name||'Audio input')+'</option>';}).join('');if(chosen&&!devices.some(function(p){return (p.deviceId||p.id)===chosen;}))el('audio-device').insertAdjacentHTML('beforeend','<option value="'+esc(chosen)+'">Disconnected chosen input</option>');el('audio-device').value=chosen;return devices;});}
  function arpeggiate(){
    var old=score,groups=PerformanceEngine.normalizeScore(old).groups,shift=0,notes=[];
    groups.forEach(function(g){g.entries.forEach(function(n,i){notes.push({m:n.midi,t:g.beat+shift+i*.5,d:g.notes.length>1?.45:n.duration,v:n.velocity});});shift+=Math.max(0,g.notes.length-1)*.5;});
    var adapted=Object.assign({},old,{title:old.title+' · arpeggio',notes:notes,len:old.len+shift,source:'generated-arpeggio',importWarnings:(old.importWarnings||[]).concat(['Chords converted to sequential half-beat attacks for monophonic practice; this is an adapted exercise, not the original chord timing.'])});
    var previous=Object.assign({},options);previous.inputKind='audio';open(root,adapted,previous);
  }
  function releaseVirtual() {
    if(engine){engine.releaseInput('virtual');engine.releaseInput('qwerty');engine.releaseInput('test');}
    virtual={};typing={};if(voice)voice.allNotesOff();
  }
  function report(s) {
    var r=s.results, fmt=function(v){return Number.isFinite(v)?Math.round(v):0;};
    el('report').hidden=false;
    el('report').innerHTML='<h2>'+(s.status==='complete'?'Performance complete':'Stopped · partial results')+' · '+fmt(r.accuracy)+'% accuracy</h2><p>'+esc(score.title)+' · '+(s.mode==='wait'?'Wait for Me':'Play at Tempo')+' · '+s.tempo+' BPM</p>'+
      '<dl class="pf-results">'+[['Notes matched',r.matched+'/'+r.expected],['Missed notes',r.missed],['Pending notes',r.pending||0],['Wrong notes',r.wrong],['Extra attacks',r.extra],['Complete targets',fmt(r.chordAccuracy)+'%'],['Tempo grades',s.mode==='tempo'?[r.perfect,r.great,r.good].join(' / '):'Not timed'],['Early / late',s.mode==='tempo'?[r.early,r.late].join(' / '):'Not timed'],['Mean timing error',s.mode==='tempo'&&r.matched?fmt(r.meanAbsTimingMs)+' ms':'—'],['Hold samples',r.durationSamples||0],['Mean absolute hold error',r.durationSamples?(Number(r.meanAbsDurationErrorBeats)||0).toFixed(2)+' beats':'—'],['Hold accuracy',r.durationSamples?fmt(r.durationAccuracy)+'%':'—']].map(function(a){return '<div><dt>'+a[0]+'</dt><dd>'+esc(a[1])+'</dd></div>';}).join('')+'</dl>'+
      '<p class="muted small">Accuracy is matched notes ÷ (expected notes + extra attacks); wrong notes are included in extra attacks. Pending notes in a stopped run are unfinished, not newly marked misses. Loop totals include completed passes and the current pass. Timing is onset-based; hold measurements are separate. Wait for Me does not grade timing. Physical key release is required for repeated notes; pedal does not replace rearticulation.</p><button type="button" class="btn primary" id="pf-again">Play again</button>';
    document.getElementById('pf-again').onclick=function(){start(true);};
    el('report').focus({preventScroll:true});
  }
  function build() {
    App.injectCSS('performance', '.pf-top,.pf-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.pf-controls label{display:flex;gap:5px;align-items:center;font-size:13px}.pf-controls input[type=number]{width:76px}.pf-now{font-size:clamp(24px,4vw,38px);font-weight:750;margin:12px 0 6px}.pf-upcoming{display:flex;gap:8px;list-style:none;padding:0;overflow-x:auto;margin:8px 0}.pf-upcoming li{flex:0 0 auto;border:1px solid var(--line);border-radius:8px;padding:8px 12px}.pf-upcoming span{display:block;font-size:12px;color:var(--muted)}.pf-roll{width:100%;height:210px;display:block;background:var(--card2);border:1px solid var(--line);border-radius:8px}.pf-keys{display:flex;overflow-x:auto;touch-action:none;padding:3px 0 8px}.pf-key{flex:1 0 30px;min-height:105px;padding:6px 2px;border:1px solid #666;border-radius:0 0 5px 5px;background:#f4f1eb;color:#15151b;display:flex;flex-direction:column;justify-content:space-between;align-items:center;touch-action:none}.pf-key span{font-size:10px}.pf-key i{font-style:normal;font-size:22px;height:28px}.pf-black{background:#25212a;color:#fff;min-height:80px}.pf-key{border-top:8px solid var(--pf-pitch)}.pf-target{box-shadow:inset 0 0 0 4px var(--pf-pitch)}.pf-held{transform:translateY(2px)}.pf-hit{outline:3px solid var(--pf-pitch);outline-offset:-7px}.pf-wrong{box-shadow:inset 0 0 0 4px #e64961}.pf-feedback{min-height:27px;font-weight:600;padding:6px 0}.pf-feedback[data-kind=wrong],.pf-feedback[data-kind=extra]{text-decoration:underline;text-decoration-style:wavy}.pf-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.pf-results div{border:1px solid var(--line);padding:12px;border-radius:8px}.pf-results dt{font-size:12px;color:var(--muted)}.pf-results dd{font-size:24px;font-weight:650;margin:4px 0 0}.pf-player progress{width:100%;height:14px}.pf-player select{max-width:100%}.pf-player .small{overflow-wrap:anywhere}.pf-unsupported{margin:8px 0}.pf-section{display:flex;gap:8px;flex-wrap:wrap}@media(max-width:520px){.pf-controls{gap:12px}.pf-now{font-size:26px}.pf-key{flex-basis:29px}.pf-player .card{padding:12px}.pf-top .btn{flex:1 1 auto}}');
    var warnings=['PDFs, images and prose are not parsed scores. MIDI/Studio notes carry pitches and durations; ASCII rhythm is approximate. Ties are represented only by a single sustained note, never inferred from an image.', 'Exact pitches and octaves are required. Wait for Me grades chord attacks together and skips held-note duration after a correct answer. Play at Tempo matches each chord onset within ±120 ms; a rolled chord may qualify. Hold measurements are separate.'];
    root.innerHTML='<div class="pf-player"><div class="card"><div class="pf-top"><button type="button" class="btn sm" id="pf-back">← Library</button><h2 style="margin:0">'+esc(score.title)+'</h2><b id="pf-status" role="status">Ready</b></div>'+
      '<div class="pf-controls" style="margin-top:14px"><label>Instrument <select id="pf-instrument">'+INSTRUMENTS.map(function(id){return '<option value="'+id+'">'+id.charAt(0).toUpperCase()+id.slice(1)+'</option>';}).join('')+'</select></label><label>Mode <select id="pf-mode"><option value="wait">Wait for Me</option><option value="tempo">Play at Tempo</option></select></label><label>Tempo <input id="pf-tempo" type="number" min="20" max="300" step="1" aria-label="Tempo in beats per minute"></label><label>Count-in <select id="pf-countin"><option value="0">None</option><option value="4">4 beats</option><option value="8">8 beats</option></select></label><label>Transpose <input id="pf-transpose" type="number" min="-24" max="24" value="0" step="1" aria-label="Transpose semitones"></label></div>'+
      '<div class="pf-controls" style="margin-top:12px"><button type="button" class="btn primary" id="pf-start">Start</button><button type="button" class="btn" id="pf-pause">Pause</button><button type="button" class="btn" id="pf-restart">Restart</button><button type="button" class="btn" id="pf-stop">Stop</button><span id="pf-beat" class="muted small"></span></div>'+
      '<details style="margin-top:14px"><summary>Section and input</summary><div class="pf-controls" style="margin-top:12px"><label>Input source <select id="pf-input-kind"><option value="midi">MIDI / virtual keys</option><option value="audio">Audio · single notes</option></select></label></div><div class="pf-controls pf-section" style="margin-top:12px"><label>From beat <input id="pf-section-start" type="number" min="1" step="0.25" value="1"></label><label>To beat <input id="pf-section-end" type="number" min="1.25" step="0.25"></label><label><input type="checkbox" id="pf-loop"> Loop section</label><span class="muted small">Section changes apply before a new run.</span></div><div class="pf-controls" style="margin-top:12px"><button type="button" class="btn sm" id="pf-midi-enable">Enable MIDI</button><label>Performance input <select id="pf-input"></select></label><label><input id="pf-sound" type="checkbox" checked> Virtual key sound</label></div><p class="small muted">MIDI sound uses the existing app/Hub routes. LUMI output is selected separately in MIDI/LUMI settings. For lockout of an external synth’s own engine, Local Control must be OFF; software cannot mute its direct keyboard path.</p><div id="pf-audio-panel" hidden><h3>Instrument audio practice</h3><p class="small muted">USB-MIDI sends notes; USB audio/direct interfaces send sound. Play one clean note at a time. Audio is analysed locally, never uploaded or monitored by this detector. Scale Lock cannot mute acoustic or direct instrument sound.</p><div class="pf-controls"><label>Audio input <select id="pf-audio-device"><option value="">System default audio input</option></select></label><button type="button" class="btn sm" id="pf-audio-devices">Refresh devices</button><button type="button" class="btn sm" id="pf-audio-listen">Start listening</button><button type="button" class="btn sm" id="pf-arpeggio" hidden>Use arpeggio version</button></div><p id="pf-audio-status" class="small" role="status">Listening is off. Start deliberately to allow your chosen input.</p><details><summary>Audio calibration and range</summary><div class="pf-controls" style="margin-top:12px"><label>A4 reference <input type="number" id="pf-audio-reference" min="400" max="480" value="440"></label><label>Lowest MIDI pitch <input type="number" id="pf-audio-low" min="0" max="127" value="36"></label><label>Highest MIDI pitch <input type="number" id="pf-audio-high" min="0" max="127" value="96"></label><label>Input transpose <input type="number" id="pf-audio-transpose" min="-48" max="48" value="0"></label><label>Confidence <input type="number" id="pf-audio-confidence" min="0.7" max="1" step=".01" value=".92"></label><label>Noise gate RMS <input type="number" id="pf-audio-noise" min=".0001" max=".5" step="any" value=".008"></label><label>Detection delay (ms) <input type="number" id="pf-audio-latency" min="0" max="400" value="100"></label></div><p class="small muted">Set reference tuning and the instrument’s sounding range; written-pitch transposition is separate from score transpose. Delay compensation is manual: compare consistent early/late results to a reference click, then adjust the measured input delay. The default is an estimate, not hardware calibration. Manual delay supports 0–400 ms plus a 100 ms confirmation allowance. No octave is guessed toward the target. Repeated notes need silence or a distinct new pluck. Chords, distorted signals and unstable bends may be rejected. In audio mode the key strip is a target preview; virtual/MIDI answers are ignored. Switch input source to use virtual keys.</p></details></div></details>'+
      '<p id="pf-instruction" class="small muted"></p><div id="pf-current" class="pf-now" aria-live="polite"></div><div id="pf-matched" class="small"></div><div id="pf-feedback" class="pf-feedback" aria-live="polite" role="status"></div>'+
      '<canvas id="pf-roll" class="pf-roll" role="img" aria-label="Piano roll"></canvas><p class="small muted" style="margin-bottom:0">Coming up</p><ol id="pf-upcoming" class="pf-upcoming"></ol><progress id="pf-progress" max="1" value="0" aria-label="Performance progress"></progress><p id="pf-stats" class="small"></p>'+
      '<div class="pf-controls"><label>Target key preview <select id="pf-octave">'+[24,36,48,60,72,84,96].map(function(n){return '<option value="'+n+'">'+esc(name(n))+' – '+esc(name(n+24))+'</option>';}).join('')+'</select></label><span class="small muted">● Target · ✓ Correct · × Wrong. Hold multiple keys for chords. A/W/S/E… play the first octave.</span></div><div id="pf-keyboard" class="pf-keys" role="group" aria-label="Playable keyboard and target preview"></div>'+
      '<p id="pf-xp" class="small muted"></p><div id="pf-progress-unsaved" hidden><button type="button" class="btn sm" id="pf-progress-retry">Retry saving progress</button><button type="button" class="btn sm" id="pf-progress-export">Export unsaved sessions</button></div><p id="pf-display-state" class="small muted"></p><p id="pf-lock-state" class="small muted"></p><details class="pf-unsupported"><summary>Source details and scoring limits</summary><ul id="pf-source-warnings"></ul><ul>'+warnings.map(function(w){return '<li>'+esc(w)+'</li>';}).join('')+'</ul></details></div><div id="pf-report" class="card" tabindex="-1" hidden></div></div>';
    el('progress-retry').onclick=retryProgress;el('progress-export').onclick=exportPending;el('instrument').value=options.instrument;el('instrument').onchange=function(){changeInstrument(this.value,true);};el('mode').value=options.mode; el('tempo').value=options.tempo; el('countin').value=options.countIn;
    el('section-end').value=score.len+1; el('octave').value=base;
    el('back').onclick=leave;
    el('start').onclick=function(){start(false);}; el('restart').onclick=function(){start(true);}; el('stop').onclick=stop;
    el('pause').onclick=function(){if(engine.snapshot().status==='paused')resume();else pause();};
    el('tempo').onchange=function(){var n=Math.max(20,Math.min(300,Number(this.value)||score.bpm));this.value=n;options.tempo=n;engine.setTempo(n);App.store.set('ws.performance.tempo',n);cleanup(true);paint(engine.snapshot());};
    ['mode','countin','transpose','section-start','section-end','loop'].forEach(function(id){el(id).onchange=function(){configure();};});
    el('octave').onchange=function(){releaseVirtual();base=Number(this.value);keyboard();paint(engine.snapshot());};
    el('sound').onchange=function(){if(!this.checked&&voice)voice.allNotesOff();};
    el('midi-enable').onclick=function(){App.midi.enable().then(refreshInputs).catch(function(e){el('feedback').textContent='MIDI unavailable: '+e.message;});};
    el('input').onchange=function(){pause('Input changed. Release held keys and resume.');engine.releaseInput();rawStatus={};options.inputId=this.value;App.store.set('ws.performance.input',this.value);routeInput();};
    el('keyboard').addEventListener('pointerdown',function(e){var b=e.target.closest('[data-pf-note]');if(!b)return;e.preventDefault();try{b.setPointerCapture(e.pointerId);}catch(ignore){}note({midi:Number(b.dataset.pfNote),on:true,velocity:100,source:'virtual'});});
    ['pointerup','pointercancel','lostpointercapture'].forEach(function(event){el('keyboard').addEventListener(event,function(e){var b=e.target.closest('[data-pf-note]');if(!b)return;note({midi:Number(b.dataset.pfNote),on:false,source:'virtual'});});});
    el('input-kind').value=options.inputKind;el('input-kind').onchange=function(){pause('Input source changed. Start a new run when ready.');engine.releaseInput();options.inputKind=this.value;App.store.set('ws.performance.inputKind',this.value);configure();};
    var savedAudio=App.store.get('ws.performance.audio',{});[['device','deviceId'],['reference','referenceA4'],['low','minMidi'],['high','maxMidi'],['transpose','transpose'],['confidence','confidence'],['noise','noiseFloor'],['latency','latencyMs']].forEach(function(pair){var control=el('audio-'+pair[0]),v=savedAudio[pair[1]];if(v!=null){if(pair[0]==='device'&&v)control.insertAdjacentHTML('beforeend','<option value="'+esc(v)+'">Chosen audio input</option>');control.value=v;}control.onchange=function(){pause('Audio settings changed. Start a new run after calibration.');engine.releaseInput();configure();};});
    el('audio-devices').onclick=function(){listAudio().catch(function(error){el('audio-status').textContent=error.message;});};el('audio-listen').onclick=function(){if(audioInput&&audioInput.state.running)audioInput.stop('Listening stopped.');else listenAudio();};el('arpeggio').onclick=arpeggiate;
    keyboard();refreshInputs();
  }
  function configure() {
    if(!root||!score)return; finishMetrics('stopped');cleanup();clearTimer();rawStatus={};options.saved=false;options.reported=false;
    options.mode=el('mode').value;options.countIn=Number(el('countin').value);
    var a=Math.max(0,Number(el('section-start').value)-1),z=Math.min(score.len,Number(el('section-end').value)-1);
    if(!(z>a)){z=score.len;a=0;el('section-start').value=1;el('section-end').value=z+1;}
    engine=new PerformanceEngine({score:score,mode:options.mode,clock:options.clock,tempo:options.tempo,countIn:options.countIn,transpose:Number(el('transpose').value)||0,inputDelayMs:options.inputKind==='audio'?Math.min(500,(Number(el('audio-latency').value)||0)+100):0,section:{startBeat:a,endBeat:z,loop:el('loop').checked},onChange:notify});
    App.store.set('ws.performance.mode',options.mode);App.store.set('ws.performance.countIn',options.countIn);
    el('report').hidden=true;paint(engine.snapshot());
  }
  function refreshInputs() {
    if(!root)return;var ports=App.midi?App.midi.inputs:[];
    var token=App.midi&&App.midi.inputFingerprint?App.midi.inputFingerprint(options.inputId):null;
    if(engine&&inputToken!==null&&token!==inputToken){engine.releaseInput();rawStatus={};pause('Performance input changed or reconnected. Release keys, then resume.');}
    inputToken=token;
    var nextIds=ports.map(function(p){return p.id;});
    if(engine)inputIds.forEach(function(id){if(nextIds.indexOf(id)===-1)engine.releaseInput(id);});
    inputIds=nextIds;
    el('input').innerHTML='<option value="all">All MIDI inputs</option>'+ports.map(function(p){return '<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>';}).join('');
    var configured=ports.some(function(p){return String(p.id)===String(options.inputId);});
    if(options.inputId!=='all'&&!configured)el('input').insertAdjacentHTML('beforeend','<option value="'+esc(options.inputId)+'">Disconnected input</option>');
    el('input').value=options.inputId;
    if(options.inputId!=='all'&&!configured)el('feedback').textContent='Selected performance input is disconnected. Virtual keys still work.';
  }
  function raw(d) {
    if(!engine||!root||options.inputKind==='audio'||!d||options.inputId!=='all'&&String(d.portId)!==String(options.inputId))return;
    var data=d.bytes||[],state=rawStatus[d.portId]||(rawStatus[d.portId]={status:0,data:[],sysex:false,system:0});
    data.forEach(function(b){
      // Realtime bytes may occur between ANY data bytes, including a velocity.
      if(b>=0xf8)return;
      if(b>=0x80){
        state.data=[];
        if(b===0xf0){state.sysex=true;state.status=0;return;}
        if(b===0xf7){state.sysex=false;state.status=0;return;}
        if(b>=0xf0){state.status=0;state.system=b===0xf2?2:b===0xf1||b===0xf3?1:0;return;}
        state.sysex=false;state.system=0;state.status=b;return;
      }
      if(state.sysex)return;
      if(state.system){state.system--;return;}
      if(!state.status)return;
      state.data.push(b);var type=state.status&0xf0,needed=type===0xc0||type===0xd0?1:2;
      if(state.data.length<needed)return;
      var x=state.data[0],v=state.data[1]||0;state.data=[];
      if(type===0x90||type===0x80){var on=type===0x90&&v>0;var event={midi:x,on:on,velocity:v,channel:state.status&15,source:d.portId==null?'midi':String(d.portId)};if(live())note(event);else if(!on)engine.input(event);}
      else if(type===0xb0&&x===64&&(live()||v<64))engine.control({controller:64,value:v,channel:state.status&15,source:d.portId==null?'midi':String(d.portId)});
    });paint(engine.snapshot());
  }
  function installListeners(){if(listenersReady)return;listenersReady=true;
    App.on('learn:instrument',function(e){if(e)changeInstrument(e.instrument,false);});
    App.on('midi:raw',raw);
    App.on('midi:state',function(){if(!engine||!root)return;refreshInputs();if(options.inputId!=='all'&&!App.midi.inputs.some(function(p){return String(p.id)===String(options.inputId);}))pause('Performance input disconnected. Reconnect, release keys, then resume.');paint(engine.snapshot());});
    App.on('scale:boundary',function(){if(live())pause('Scale or lock changed. Sound cleared; release keys and resume when ready.');});
    App.on('lights:display-enabled',function(){if(live()){lastGuide='';paint(engine.snapshot());}});
    App.on('colors',function(){if(live()){lastGuide='';paint(engine.snapshot());}});
    window.addEventListener('blur',function(){if(live()&&active(engine.snapshot()))pause('Window lost focus. Resume when ready.');});
    document.addEventListener('visibilitychange',function(){if(document.hidden&&live())pause('Page hidden. Resume when ready.');});
    window.addEventListener('pagehide',function(e){if(root&&engine)stop(true);if(!(e&&e.persisted))unrouteInput();});
    document.addEventListener('keydown',function(e){if(!live()||options.inputKind==='audio'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;var i=KEY_CODES.indexOf(e.code);if(i<0)return;e.preventDefault();typing[e.code]=base+i;note({midi:base+i,on:true,source:'qwerty',velocity:100});});
    document.addEventListener('keyup',function(e){if(typing[e.code]==null)return;var m=typing[e.code];delete typing[e.code];note({midi:m,on:false,source:'qwerty'});});
  }
  function changeInstrument(id, publish){if(INSTRUMENTS.indexOf(id)<0)return;if(engine&&options&&options.instrument!==id){stop(true);options.instrument=id;App.store.set('ws.performance.instrument',id);if(el('instrument'))el('instrument').value=id;paint(engine.snapshot());paintProgress();}if(publish&&App.practiceInstrument)App.practiceInstrument.set(id);}
  function open(container,sc,opts){close();root=container;score=sc;options=Object.assign({mode:'wait',tempo:sc.bpm,countIn:App.store.get('ws.performance.countIn',4),inputId:App.store.get('ws.performance.input','all'),instrument:App.practiceInstrument?App.practiceInstrument.get():App.store.get('ws.performance.instrument','piano'),inputKind:App.store.get('ws.performance.inputKind','midi'),clock:function(){return App.getAudio().currentTime;}},opts||{});
    base=Math.max(24,Math.min(96,Math.floor(Math.min.apply(null,score.notes.map(function(n){return n.m;}))/12)*12));lastMessage='';lastCurrent='';installListeners();build();
    routeInput();
    if(INSTRUMENTS.indexOf(options.instrument)===-1)options.instrument='piano';el('instrument').value=options.instrument;
    configure();paintProgress();
  }
  window.PerformancePlayer={open:open,close:close,stop:stop,pause:pause,remote:remote,remoteKey:remoteKey,hide:function(){pause('Practice paused when leaving this page.');if(engine)engine.releaseInput();unrouteInput();},show:routeInput,note:note,tick:function(){if(engine){engagement();engine.tick();}},snapshot:function(){if(!engine)return null;return Object.assign({},engine.snapshot(),{practice:metrics?{id:metrics.id,instrument:metrics.instrument,recorded:metrics.recorded}:null});},listenAudio:listenAudio,get audioInput(){return audioInput;},get engine(){return engine;}};
})();
