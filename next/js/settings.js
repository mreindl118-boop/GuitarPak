/* Settings tab — app-wide preferences. Feature-specific options stay with
 * their feature (e.g. the fretboard's degree colors live in its gear panel);
 * this tab holds everything app-level, starting with appearance. */
(function () {
  'use strict';

  var audioUI = null; // the Sound input card's meter (set by init)

  function init(rootEl) {
    App.injectCSS('settings',
      '.set-theme-note{margin-top:10px}' +
      '.set-sub{margin:16px 0 8px;font-size:12px;font-weight:600;letter-spacing:1.4px;' +
        'text-transform:uppercase;color:var(--label,var(--muted))}' +
      '.set-sub:first-of-type{margin-top:12px}' +
      '.set-acc{width:32px;height:32px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}' +
      '.set-acc.active{border-color:var(--text);box-shadow:0 0 0 2px var(--card)}' +
      '#set-accent{gap:12px}' +
      '#set-vol{width:200px;max-width:56vw;vertical-align:middle}' +
      // checkbox settings: the name reads as a control, the note sits under it
      '.set-check{display:flex;align-items:flex-start;gap:12px;margin-top:14px;font-size:14px;font-weight:500;' +
        'line-height:1.4;color:var(--text);cursor:pointer}' +
      '.set-check input{flex:0 0 auto;width:20px;height:20px;margin:0}' +
      '.set-check small{display:block;margin-top:2px;font-size:12.5px;font-weight:400;color:var(--muted)}' +
      '#panel-settings{max-width:760px;margin:0 auto}' +
      '#set-ain-gain{width:180px;max-width:32vw;vertical-align:middle}' +
      '.set-meter{position:relative;height:10px;max-width:420px;margin-top:12px;border-radius:5px;' +
        'background:var(--inset);border:1px solid var(--ctl-border);overflow:hidden}' +
      '.set-meter i{position:absolute;left:0;top:0;bottom:0;width:0;' +
        'background:linear-gradient(90deg,var(--accent-dim),var(--accent));transition:width 50ms linear}' +
      '.set-meter b{position:absolute;top:0;bottom:0;left:0;width:2px;background:var(--text);opacity:0}' +
      '.set-meter.live b{opacity:.75}' +
      '.set-meter.clip i{background:var(--red)}' +
      '.set-ain-hint{margin-top:10px;color:var(--accent)}' +
      '.set-ain-warn{margin-top:10px;color:var(--red)}' +
      // Hear input is On but held (a microphone / a missing input): not lit
      '#set-ain-mon button.held{background:transparent;color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);opacity:.8}' +
      '.set-gear{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}' +
      '.set-chip{display:inline-flex;gap:6px;align-items:baseline;padding:5px 10px;border-radius:999px;font-size:12.5px;' +
        'background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent-line);color:var(--muted)}' +
      '.set-chip b{color:var(--text);font-weight:600}' +
      '.set-steps{margin:8px 0 6px;padding-left:20px}' +
      '.set-steps li{margin:3px 0}'
    );

    var accBtns = '';
    Object.keys(App.ACCENTS).forEach(function (id) {
      accBtns += '<button type="button" class="set-acc" data-accent="' + id + '" ' +
        'style="background:' + App.ACCENTS[id].dark[0] + '" title="' + App.ACCENTS[id].name + '" ' +
        'aria-label="Accent ' + App.ACCENTS[id].name + '"></button>';
    });

    rootEl.innerHTML =
      '<div class="card">' +
        '<h2>Appearance</h2>' +
        '<div class="set-sub">Theme</div>' +
        '<div class="fb-field">' +
          '<div class="seg" id="set-theme">' +
            '<button type="button" data-theme-pref="dark">Dark</button>' +
            '<button type="button" data-theme-pref="light">Light</button>' +
            '<button type="button" data-theme-pref="auto">Auto</button>' +
          '</div>' +
        '</div>' +
        '<div class="muted small set-theme-note">Auto follows your device&rsquo;s light/dark setting and switches live when it changes.</div>' +
        '<div class="set-sub">Accent color</div>' +
        '<div class="row tight" id="set-accent">' + accBtns + '</div>' +
        '<div class="muted small set-theme-note">Colors every highlight in the app &mdash; buttons, glows, the LAB in the logo.</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Sound</h2>' +
        '<div class="set-sub">Master volume</div>' +
        '<div class="row tight">' +
          '<input type="range" id="set-vol" min="0" max="100" step="5">' +
          '<span class="muted small" id="set-vol-val"></span>' +
        '</div>' +
        '<div class="muted small set-theme-note">One knob for everything &mdash; metronome, practice notes, the Jam band, the Studio.</div>' +
        '<label class="set-check">' +
          '<input type="checkbox" id="set-click"><span>Metronome click during Studio playback' +
          '<small>The loop, the Timeline song and pad recording. Also on the Pads page.</small></span>' +
        '</label>' +
        '<div class="set-sub">Latency</div>' +
        '<div class="muted small" id="set-latency">&mdash;</div>' +
        '<div class="set-sub">Guitar</div>' +
        '<div class="fb-field">' +
          '<div class="seg" id="set-tone">' +
            '<button type="button" data-tone="steel">Steel</button>' +
            '<button type="button" data-tone="electric">Electric</button>' +
            '<button type="button" data-tone="nylon">Nylon</button>' +
            '<button type="button" data-tone="synth">Synth</button>' +
          '</div>' +
        '</div>' +
        '<div class="muted small set-theme-note">The voice for fretboard taps, scale practice, chord strums and trainer notes.</div>' +
        '<div class="set-sub">Piano</div>' +
        '<div class="fb-field">' +
          '<div class="seg" id="set-ptone">' +
            '<button type="button" data-ptone="grand">Grand</button>' +
            '<button type="button" data-ptone="bright">Bright</button>' +
            '<button type="button" data-ptone="electric">Electric</button>' +
            '<button type="button" data-ptone="organ">Organ</button>' +
          '</div>' +
        '</div>' +
        '<div class="muted small set-theme-note">The Piano tab, MIDI keyboard and chord piano voicings. All open source: ' +
          'Grand is a real recorded Salamander grand; Bright, Electric and Organ are FluidR3 / MusyngKite voices.</div>' +
        '<div class="set-sub">Bass</div>' +
        '<div class="fb-field">' +
          '<div class="seg" id="set-bass">' +
            '<button type="button" data-bass-style="finger">Fingered</button>' +
            '<button type="button" data-bass-style="pick">Picked</button>' +
          '</div>' +
        '</div>' +
        '<div class="muted small set-theme-note">How the Jam backing-track bass plays &mdash; warm finger-plucked or bright picked. Takes effect on the next bass note.</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Studio</h2>' +
        '<div class="set-sub">Retro-capture memory</div>' +
        '<div class="fb-field">' +
          '<div class="seg" id="set-retro">' +
            '<button type="button" data-retro="15">15s</button>' +
            '<button type="button" data-retro="30">30s</button>' +
            '<button type="button" data-retro="60">60s</button>' +
          '</div>' +
        '</div>' +
        '<div class="muted small set-theme-note">How far back &ldquo;Keep the last 30s&rdquo; on the Ideas page reaches. Everything you play is remembered for this long.</div>' +
        '<div class="muted small set-theme-note">Time signature: the context-bar signature drives the metronome; the Studio loop and the Jam band currently play 4/4 (odd meters there are on the roadmap).</div>' +
        '<div class="set-sub">Idea playback voice</div>' +
        '<div class="fb-field">' +
          '<div class="seg" id="set-voice">' +
            '<button type="button" data-voice="saw">Saw</button>' +
            '<button type="button" data-voice="pad">Pad</button>' +
            '<button type="button" data-voice="keys">Keys</button>' +
            '<button type="button" data-voice="bass">Bass</button>' +
          '</div>' +
        '</div>' +
        '<div class="muted small set-theme-note">The studio synth preset ideas play back on (full ROLI slide/pressure expression).</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Backup</h2>' +
        '<div class="muted small">Updates NEVER clear your settings &mdash; they live on this device and survive every version. ' +
          'If things ever look reset, you are probably in a different install (a Chrome tab vs the desktop app, or another browser profile). ' +
          'Export moves everything &mdash; preferences, palettes, jam songs, studio tracks &mdash; between installs.</div>' +
        '<div class="row tight" style="margin-top:12px">' +
          '<button type="button" class="btn sm" id="set-backup-out">Export settings</button>' +
          '<label class="btn sm" style="cursor:pointer">Import settings<input type="file" id="set-backup-in" accept=".json" style="display:none"></label>' +
          '<span class="muted small" id="set-backup-msg"></span>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Screen &amp; battery</h2>' +
        '<label class="set-check" style="margin-top:0">' +
          '<input type="checkbox" id="set-wake"><span>Keep the screen awake' +
          '<small>While sound plays or a practice runner is going.</small></span>' +
        '</label>' +
      '</div>' +
      '<div class="card" id="set-midi-card">' +
        '<h2>MIDI keyboard</h2>' +
        '<div class="muted small">Plug in a keyboard by USB or Bluetooth. soundLAB hears your notes, and a LUMI lights up the keys to play.</div>' +
        '<div class="row tight" style="margin-top:12px" id="set-midi-row">' +
          '<button type="button" class="btn sm primary" id="set-midi-enable">Connect MIDI</button>' +
          '<span class="muted small" id="set-midi-msg" role="status"></span>' +
        '</div>' +
        '<div id="set-midi-ports" style="display:none">' +
          '<div class="set-gear" id="set-midi-gear"></div>' +
          '<div class="row" style="margin-top:12px">' +
            '<label class="field">Keyboard<select id="set-midi-in"></select></label>' +
            '<label class="field">Key lights<select id="set-midi-out"></select></label>' +
            '<button type="button" class="btn sm" id="set-midi-test" title="Lights a short C major run on the keys">Light test</button>' +
            '<button type="button" class="btn sm" id="set-midi-bt" style="display:none" title="Find a Bluetooth MIDI keyboard">Pair Bluetooth&hellip;</button>' +
          '</div>' +
          '<div class="set-sub">soundLAB plays my keys</div>' +
          '<div class="seg" id="set-midi-voice" role="group" aria-label="soundLAB plays my keys">' +
            '<button type="button" data-voice="auto">Auto</button>' +
            '<button type="button" data-voice="on">Always</button>' +
            '<button type="button" data-voice="off">Never</button>' +
          '</div>' +
          '<div class="muted small set-theme-note" id="set-midi-voicenote"></div>' +
          '<details class="tips" id="set-midi-btnote" style="display:none"><summary>Bluetooth keyboard not showing up?</summary>' +
            '<ol class="set-steps">' +
              '<li>Pair the keyboard in Windows Bluetooth settings first.</li>' +
              '<li>Open soundLAB with the soundLAB Windows shortcut. It turns on <b>Windows Runtime MIDI</b> for you.</li>' +
              '<li>No shortcut? In Chrome or Edge, open chrome://flags (edge://flags), turn on <b>use-winrt-midi-api</b> and restart the browser.</li>' +
            '</ol>A USB cable always works.</details>' +
          '<details class="tips" id="set-midi-more"><summary>More MIDI options</summary>' +
            '<div class="set-sub">Pitch bend</div>' +
            '<div class="seg" id="set-midi-bend" role="group" aria-label="Pitch bend">' +
              '<button type="button" data-bend="0">Off</button>' +
              '<button type="button" data-bend="2">&plusmn;2</button>' +
              '<button type="button" data-bend="12">&plusmn;12</button>' +
              '<button type="button" data-bend="48">&plusmn;48 (ROLI)</button>' +
            '</div>' +
            '<div class="row tight" style="margin-top:14px">' +
              '<button type="button" class="btn sm" id="set-open-lights">Lights &amp; help</button>' +
              '<span class="muted small">Key light colors, brightness and the Help level.</span>' +
            '</div>' +
          '</details>' +
        '</div>' +
      '</div>' +
      '<div class="card" id="set-audio-card">' +
        '<h2>Sound input &amp; output</h2>' +
        '<div class="muted small">Your guitar, mic or synth coming in, and where soundLAB&rsquo;s sound goes out. ' +
          'soundLAB picks your audio interface, Helix or MODX by itself when it sees one.</div>' +
        '<div class="row tight" style="margin-top:12px" id="set-audio-row">' +
          '<button type="button" class="btn sm primary" id="set-audio-enable" title="Asks to use audio input so soundLAB can see your gear by name">Find my gear</button>' +
          '<span class="muted small" id="set-audio-msg" role="status"></span>' +
        '</div>' +
        '<div class="row" id="set-audio-sel" style="margin-top:12px">' +
          '<label class="field" style="display:none">Input<select id="set-audio-in"></select></label>' +
          '<label class="field" style="display:none">Output<select id="set-audio-out"></select></label>' +
        '</div>' +
        '<div class="small set-ain-hint" id="set-audio-hint" hidden></div>' +
        '<div class="set-sub" id="set-ain-sub">Use the input to</div>' +
        '<div class="seg" id="set-ain-mon" role="group" aria-label="Use the input to">' +
          '<button type="button" data-mon="off" aria-pressed="true">Off</button>' +
          '<button type="button" data-mon="on" aria-pressed="false">Hear it</button>' +
          '<button type="button" data-mon="notes" aria-pressed="false">Show notes</button>' +
          '<button type="button" data-mon="both" aria-pressed="false">Both</button>' +
        '</div>' +
        '<div class="muted small set-theme-note" id="set-ain-usenote"></div>' +
        '<div class="row tight" id="set-ain-row" style="margin-top:12px">' +
          '<span class="muted small">Level</span>' +
          '<input type="range" id="set-ain-gain" min="0" max="200" step="5" aria-label="Input level">' +
          '<span class="muted small" id="set-ain-gain-val"></span>' +
        '</div>' +
        '<div class="row tight" id="set-ain-meterrow" style="margin-top:12px">' +
          '<div class="set-meter" id="set-ain-meter" role="meter" aria-label="Input level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" style="margin-top:0;flex:1"><i></i><b></b></div>' +
        '</div>' +
        '<div class="small set-ain-warn" id="set-ain-warn" role="alert" hidden></div>' +
        '<div class="muted small set-theme-note" id="set-ain-msg"></div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Plugins</h2>' +
        '<div class="muted small">Extend soundLAB with your own JavaScript: plugins can add pages, Studio effects and synth voices ' +
          '(see <b>PLUGINS.md</b> in the GitHub repo for the API and a sample). Plugins run with full access to the app — ' +
          '<b>only load code you trust</b>. Stored on this device only.</div>' +
        '<div class="row tight" style="margin-top:12px">' +
          '<label class="btn sm">Add plugin (.js)<input type="file" id="set-plugin-file" accept=".js,text/javascript" style="display:none"></label>' +
          '<span class="muted small" id="set-plugin-msg"></span>' +
        '</div>' +
        '<div id="set-plugin-list" style="margin-top:6px"></div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>About</h2>' +
        '<div class="row tight">' +
          '<span class="muted small">soundLAB v' + App.version + ' &mdash; updates are checked automatically at startup.</span>' +
          '<button type="button" class="btn sm" id="set-update">Check now</button>' +
        '</div>' +
        '<div class="muted small set-theme-note" id="set-update-msg"></div>' +
      '</div>';

    // ---- accent ----
    var accRow = document.getElementById('set-accent');
    function paintAccent() {
      accRow.querySelectorAll('.set-acc').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-accent') === App.accent);
      });
    }
    accRow.addEventListener('click', function (e) {
      var b = e.target.closest('[data-accent]');
      if (!b) return;
      App.setAccent(b.getAttribute('data-accent'));
      paintAccent();
    });
    paintAccent();

    // ---- master volume ----
    var vol = document.getElementById('set-vol');
    var volVal = document.getElementById('set-vol-val');
    vol.value = String(App.volume);
    volVal.textContent = App.volume + '%';
    vol.addEventListener('input', function () {
      App.setVolume(parseInt(this.value, 10));
      volVal.textContent = App.volume + '%';
    });

    // ---- global studio click ----
    var clickChk = document.getElementById('set-click');
    clickChk.checked = App.store.get('app.click', false) === true;
    clickChk.addEventListener('change', function () {
      App.store.set('app.click', !!this.checked);
    });

    // ---- studio prefs ----
    var retroSeg = document.getElementById('set-retro');
    function paintRetro() {
      var v = parseInt(App.store.get('sd.retroSecs', 30), 10);
      if ([15, 30, 60].indexOf(v) === -1) v = 30;
      retroSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', parseInt(b.getAttribute('data-retro'), 10) === v);
      });
    }
    retroSeg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-retro]');
      if (!b) return;
      App.store.set('sd.retroSecs', parseInt(b.getAttribute('data-retro'), 10));
      App.emit('sd:prefs', {});
      paintRetro();
    });
    paintRetro();

    var voiceSeg = document.getElementById('set-voice');
    function paintVoice() {
      var v = App.store.get('sd.playVoice', 'keys');
      voiceSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-voice') === v);
      });
    }
    voiceSeg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-voice]');
      if (!b) return;
      App.store.set('sd.playVoice', b.getAttribute('data-voice'));
      App.emit('sd:prefs', {});
      paintVoice();
    });
    paintVoice();

    // ---- screen wake ----
    var wakeChk = document.getElementById('set-wake');
    wakeChk.checked = App.store.get('app.keepAwake', true) !== false;
    wakeChk.addEventListener('change', function () {
      App.store.set('app.keepAwake', !!this.checked);
      App.wake.reapply();
    });

    // ---- sound input & output (rebuilt 1.4.0) ----
    // App.audioIn (js/audioin.js) owns the live input; App.tonein reads notes
    // from it. This card paints both as ONE choice ("Use the input to": Off /
    // Hear it / Show notes / Both) and picks known gear by itself: an audio
    // interface (Steinberg UR...), then a Helix, then a MODX, whenever the
    // Input is still System default. Picking System default by hand pins it
    // (audio.inDefault). Device names need input permission: until they're
    // readable, "Find my gear" asks once.
    var audMsg = document.getElementById('set-audio-msg');
    var audIn = document.getElementById('set-audio-in');
    var audOut = document.getElementById('set-audio-out');
    var audBtn = document.getElementById('set-audio-enable');
    var audHint = document.getElementById('set-audio-hint');
    var monSeg = document.getElementById('set-ain-mon');
    var useNote = document.getElementById('set-ain-usenote');
    var ainGain = document.getElementById('set-ain-gain');
    var ainGainVal = document.getElementById('set-ain-gain-val');
    var gainRow = document.getElementById('set-ain-row');
    var meterEl = document.getElementById('set-ain-meter');
    var meterBar = meterEl.querySelector('i');
    var meterPk = meterEl.querySelector('b');
    var ainWarn = document.getElementById('set-ain-warn');
    var ainMsg = document.getElementById('set-ain-msg');
    var ainRows = ['set-ain-sub', 'set-ain-mon', 'set-ain-usenote', 'set-ain-meterrow'].map(function (id) { return document.getElementById(id); });
    var ainNote = '';    // a one-off line under the choice (cleared on the next action)
    var outGone = false;   // the chosen output was missing at the last listing
    var fillGone = '';     // the "not connected" note fillDevices wrote last
    var AIN = App.audioIn || null;
    var named = false;   // device labels readable (input permission granted)
    var lastDevs = [];
    // known gear, best first: what soundLAB picks as Input by itself
    var GEAR = [
      { re: /steinberg|\bUR\s?\d{2}C?\b|yamaha steinberg/i, name: 'Steinberg', kind: 'interface' },
      { re: /focusrite|scarlett|audient|\bMOTU\b|presonus|\bUMC\s?\d|babyface|apollo|\bSSL\s?\d|\bEVO\s?\d|\biD\d{1,2}\b|zoom uac/i, name: '', kind: 'interface' },
      { re: /helix|stadium|line 6/i, name: 'Helix', kind: 'helix' },
      { re: /MODX|MONTAGE/i, name: 'MODX', kind: 'synth' }
    ];
    function realDev(d) { return d.deviceId !== 'default' && d.deviceId !== 'communications'; }
    function gearOf(label) {
      for (var i = 0; i < GEAR.length; i++) {
        if (GEAR[i].re.test(label || '')) {
          var nm = GEAR[i].name || String(label).replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 24);
          if (/MONTAGE/i.test(label)) nm = 'MONTAGE';
          return { rank: i, name: nm, kind: GEAR[i].kind };
        }
      }
      return null;
    }
    function bestGear() {
      var best = null;
      lastDevs.forEach(function (d) {
        if (d.kind !== 'audioinput' || !realDev(d)) return;
        var g = gearOf(d.label);
        if (g && (!best || g.rank < best.g.rank)) best = { d: d, g: g };
      });
      return best;
    }

    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    function labelOf(id) {
      for (var i = 0; i < lastDevs.length; i++) {
        if (lastDevs[i].kind === 'audioinput' && lastDevs[i].deviceId === id) return lastDevs[i].label || '';
      }
      return '';
    }

    // the use choice <-> the two stores (audio.monitor = Hear it, audio.tonein = Show notes)
    function useMode() {
      var h = App.store.get('audio.monitor', false) === true, n = App.store.get('audio.tonein', false) === true;
      return h && n ? 'both' : h ? 'on' : n ? 'notes' : 'off';
    }
    var USE_NOTES = {
      off: 'The input is not used.',
      on: 'Hear it: plays the input through soundLAB at the master volume. Use it for a MODX or a Helix on USB.',
      notes: 'Show notes: soundLAB listens to your guitar and lights the notes on every page, like a MIDI keyboard. Nothing is played back.',
      both: 'Both: you hear the input and soundLAB shows the notes you play.'
    };

    // one line under the lists: what soundLAB found / did, never a chore list
    function paintHint() {
      var txt = '';
      var best = named ? bestGear() : null;
      var cur = App.store.get('audio.inId', '');
      var curG = cur ? gearOf(labelOf(cur)) : null;
      var mode = useMode();
      if (curG) {
        if (mode === 'off') {
          txt = curG.kind === 'synth' ? 'Your ' + curG.name + ' is the input. Pick Hear it to play it through soundLAB.'
            : 'Your ' + curG.name + ' is the input. Pick Show notes for practice, or Hear it to play it through soundLAB.';
        } else if (curG.kind === 'synth' && mode === 'notes') {
          txt = 'Your ' + curG.name + ' is the input. Pick Hear it or Both to hear it.';
        }
      } else if (best) {
        txt = best.g.name + ' found. Pick it as Input to use it.';
      }
      audHint.textContent = txt;
      audHint.hidden = !txt;
    }

    function pickInput(id) {
      if (AIN) AIN.setDevice(id); else App.store.set('audio.inId', id);
      audIn.value = id;
    }

    function fillDevices(devs) {
      lastDevs = devs || [];
      named = lastDevs.some(function (d) { return !!d.label; });
      var ins = lastDevs.filter(function (d) { return d.kind === 'audioinput'; });
      var outs = lastDevs.filter(function (d) { return d.kind === 'audiooutput'; });
      audBtn.style.display = named ? 'none' : '';
      if (!named) {
        // no permission yet: the lists would be nameless — keep the button
        audIn.parentElement.style.display = 'none';
        audOut.parentElement.style.display = 'none';
        paintHint();
        return;
      }
      var gone = [];
      function fill(sel, list, storeKey) {
        var cur = App.store.get(storeKey, '');
        var html = '<option value="">System default</option>' + list.filter(realDev).map(function (d) {
          return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === cur ? ' selected' : '') + '>' +
            esc((d.label || d.kind).slice(0, 48)) + '</option>';
        }).join('');
        // keep a chosen device that is unplugged right now: it is used again
        // the moment it comes back (a synth switched off and on)
        if (cur && !list.some(function (d) { return d.deviceId === cur; })) {
          html += '<option value="' + esc(cur) + '" selected>' + esc(storeKey === 'audio.inId' && App.store.get('audio.inLabel', '') ? App.store.get('audio.inLabel', '').slice(0, 36) + ' (not connected)' : 'Chosen device (not connected)') + '</option>';
          gone.push(storeKey === 'audio.inId' ? 'input' : 'output');
        }
        sel.innerHTML = html;
        sel.parentElement.style.display = '';
      }
      fill(audIn, ins, 'audio.inId');
      fill(audOut, outs, 'audio.outId');
      var goneMsg = gone.map(function (g) {
        return g === 'input'
          ? 'Your input is not connected. soundLAB uses it again as soon as it is back.'
          : 'Your output is not connected. Sound plays on the system default until it is back.';
      }).join(' ');
      var msg = goneMsg;
      var outBack = gone.indexOf('output') === -1;
      if (outBack) applySink(outGone);
      outGone = !outBack;
      // auto-pick: while the Input is System default (and not pinned there
      // by hand), take the best known gear
      var best = bestGear();
      if (best && !App.store.get('audio.inId', '') && App.store.get('audio.inDefault', false) !== true) {
        msg = 'Found “' + best.d.label.slice(0, 40) + '”. It is now your Input.';
        pickInput(best.d.deviceId);
      }
      // a re-listing with nothing new keeps the last note; only a "not
      // connected" note it wrote clears
      if (msg) audMsg.textContent = msg;
      else if (fillGone && audMsg.textContent === fillGone) audMsg.textContent = '';
      fillGone = msg && msg === goneMsg ? goneMsg : '';
      paintHint();
    }

    // the chosen output (audio.outId), applied to the shared context — at the
    // first gesture after launch (no AudioContext before one) and again when
    // the device comes back after an unplug (force: the context fell back)
    function applySink(force) {
      var id = App.store.get('audio.outId', '');
      if (!id) return;
      function go() {
        try {
          var ctx = App.getAudio();
          if (typeof ctx.setSinkId !== 'function' || (!force && ctx.sinkId === id)) return;
          ctx.setSinkId(id).catch(function () { audMsg.textContent = 'The browser refused that output. Using the system default.'; });
        } catch (e) { /* no audio here */ }
      }
      var ua = navigator.userActivation;
      if (!ua || ua.hasBeenActive) { go(); return; }
      if (applySink.wait) return;
      applySink.wait = true;
      function once() {
        document.removeEventListener('pointerdown', once, true);
        document.removeEventListener('keydown', once, true);
        applySink.wait = false;
        go();
      }
      document.addEventListener('pointerdown', once, true);
      document.addEventListener('keydown', once, true);
    }

    function listDevices(withPoke) {
      var m = navigator.mediaDevices;
      if (!m || typeof m.enumerateDevices !== 'function') {
        audBtn.disabled = true;
        audMsg.textContent = 'Device listing is not available here.';
        return Promise.resolve();
      }
      var p = Promise.resolve();
      if (withPoke) {
        p = AIN ? AIN.devices(true) : (m.getUserMedia ? m.getUserMedia({ audio: true }).then(function (s) {
          s.getTracks().forEach(function (t) { t.stop(); });
        }).catch(function () { /* labels stay generic without permission */ }) : p);
      }
      return p.then(function () { return m.enumerateDevices(); })
        .then(function (d) {
          fillDevices(d);
          // why the names stay hidden: declined, or no input at all (a MODX
          // switched off / its USB audio driver missing) — not the same fix
          if (withPoke && !named) audMsg.textContent = (AIN && AIN.listError) || 'Input permission was not granted, so device names stay hidden.';
          paintAin();
          if (named && App.active === 'settings') meterStart();
        })
        .catch(function () { audMsg.textContent = 'Device listing is not available here.'; });
    }

    audBtn.addEventListener('click', function () { listDevices(true); });
    audIn.addEventListener('change', function () {
      App.store.set('audio.inPicked', true);
      App.store.set('audio.inDefault', !this.value);
      if (AIN) AIN.setDevice(this.value); else App.store.set('audio.inId', this.value);
      audMsg.textContent = '';
      ainNote = '';
      paintHint();
      if (App.active === 'settings') meterStart();
    });
    audOut.addEventListener('change', function () {
      App.store.set('audio.outId', this.value);
      try {
        var ctx = App.getAudio();
        if (typeof ctx.setSinkId === 'function') {
          ctx.setSinkId(this.value || '').then(function () { audMsg.textContent = 'Output switched.'; })
            .catch(function () { audMsg.textContent = 'The browser refused that output. Using the system default.'; });
        } else {
          audMsg.textContent = 'This browser cannot pick an output. Using the system default.';
        }
      } catch (e) { /* no audio yet */ }
    });
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', function () { listDevices(false); });
    }

    // ---- the use choice + level ----
    function paintAin() {
      var mode = useMode();
      var hear = mode === 'on' || mode === 'both';
      var avail = !!(AIN && AIN.supported);
      var s = avail ? AIN.state : null;
      monSeg.querySelectorAll('button').forEach(function (b) {
        var act = b.getAttribute('data-mon') === mode;
        var held = act && hear && !!(s && s.held);
        b.classList.toggle('active', act && !held);
        b.classList.toggle('held', held);
        b.setAttribute('aria-pressed', String(act));
        b.title = held ? 'On, but paused. The note below says why.' : '';
      });
      useNote.textContent = USE_NOTES[mode];
      // QUIET CHROME: no input controls where capture can't work; the level
      // slider only while the input is heard
      ainRows.forEach(function (el) { if (el) el.style.display = avail ? '' : 'none'; });
      gainRow.style.display = avail && hear ? '' : 'none';
      if (!avail) {
        ainMsg.textContent = 'Audio input is not available here (this browser or viewer does not allow it).';
        ainWarn.hidden = true;
        meterEl.classList.remove('live');
        return;
      }
      ainWarn.textContent = s.warn || '';
      ainWarn.hidden = !s.warn;
      ainMsg.textContent = s.error || s.msg ||
        (s.monitor ? (s.paused
          ? 'Tap anywhere to turn on sound. The browser keeps audio off until you touch the page.'
          : 'Hearing “' + (s.label || 'the input') + '” through soundLAB.') : ainNote);
      meterEl.classList.toggle('live', !!s.on);
      document.getElementById('set-ain-meterrow').style.display = meterWanted() ? '' : 'none';
      paintHint();
    }
    function setUse(mode) {
      var hear = mode === 'on' || mode === 'both', notes = mode === 'notes' || mode === 'both';
      App.store.set('audio.tonein', notes);
      if (App.tonein) { if (notes) App.tonein.start(); else App.tonein.stop(); }
      return AIN.setMonitor(hear);
    }
    monSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mon]');
      if (!b || !AIN) return;
      var mode = b.getAttribute('data-mon');
      ainNote = '';
      if (mode !== 'off' && !named) {
        // device names not readable yet: this first press only asks for the
        // input permission and lists the inputs — nothing is heard before an
        // input can be seen and picked (a laptop mic would howl straight away)
        listDevices(true).then(function () {
          if (named) ainNote = App.store.get('audio.inId', '') ? 'Now press ' + b.textContent + ' again.' : 'Pick your instrument as Input above, then press ' + b.textContent + ' again.';
          paintAin();
        });
        return;
      }
      setUse(mode).then(function () { if (App.active === 'settings') meterStart(); paintAin(); });
      paintAin();
    });
    ainGain.value = String(AIN ? AIN.gain : 100);
    ainGainVal.textContent = ainGain.value + '%';
    ainGain.addEventListener('input', function () {
      var v = AIN ? AIN.setGain(parseInt(this.value, 10)) : parseInt(this.value, 10);
      ainGainVal.textContent = v + '%';
    });
    App.on('audioin:state', paintAin);

    // live level meter (dBFS, -60..0): polled only while Settings is on screen
    var meterTimer = null, pkHold = 0, pkAt = 0;
    function meterTick() {
      var l = AIN.level();
      var pct = l.peak > 0.001 ? Math.max(0, Math.min(100, (20 * Math.log(l.peak) / Math.LN10 + 60) / 60 * 100)) : 0;
      var now = Date.now();
      if (pct >= pkHold || now - pkAt > 1200) { pkHold = pct; pkAt = now; }
      meterBar.style.width = pct.toFixed(1) + '%';
      meterPk.style.left = pkHold.toFixed(1) + '%';
      meterEl.classList.toggle('clip', l.clip);
      meterEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
    // the meter opens the input only when it is in use — heard, read for
    // notes, or an input picked here: opening Settings alone never grabs a
    // device (a Bluetooth headset's mic would drop the headphones to call
    // quality, and the OS recording light would come on)
    function meterWanted() {
      var id = App.store.get('audio.inId', '');
      return useMode() !== 'off' || (named && !!id && id !== 'default' && id !== 'communications');
    }
    function meterStart() {
      if (!AIN || !AIN.supported) return;
      if (meterWanted()) {
        AIN.hold('settings-meter');
        if (!meterTimer && !document.hidden) meterTimer = setInterval(meterTick, 50);
      } else {
        meterStop();
      }
      paintAin();
    }
    function meterStop() {
      if (meterTimer) { clearInterval(meterTimer); meterTimer = null; }
      if (AIN) AIN.release('settings-meter');
      meterBar.style.width = '0%';
      pkHold = 0;
      meterPk.style.left = '0%';
    }
    document.addEventListener('visibilitychange', function () {
      if (App.active !== 'settings') return;
      if (document.hidden) { if (meterTimer) { clearInterval(meterTimer); meterTimer = null; } } else meterStart();
    });
    // on show: re-read the list (names may have become readable elsewhere —
    // no permission prompt, enumerateDevices only), then the meter
    audioUI = { show: function () { paintAin(); meterStart(); listDevices(false); }, hide: function () { meterStop(); paintAin(); } };

    listDevices(false);
    paintAin();

    // ---- plugins ----
    var plugMsg = document.getElementById('set-plugin-msg');
    var plugList = document.getElementById('set-plugin-list');

    function paintPlugins() {
      var l = (window.SoundLab && SoundLab.plugins.list) || [];
      if (!l.length) { plugList.innerHTML = ''; return; }
      plugList.innerHTML = l.map(function (p) {
        return '<div class="row tight" style="margin-top:8px" data-plug="' + p.id + '">' +
          '<label class="row tight small" style="gap:6px"><input type="checkbox" data-plugon="' + p.id + '"' +
            (p.on !== false ? ' checked' : '') + '>' + p.name.replace(/</g, '&lt;') + '</label>' +
          (p.error ? '<span class="small" style="color:var(--red,#d9484a)">error: ' + String(p.error).replace(/</g, '&lt;') + '</span>' : '') +
          '<button type="button" class="btn sm" data-plugrm="' + p.id + '">Remove</button>' +
          '</div>';
      }).join('');
    }

    document.getElementById('set-plugin-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f || !window.SoundLab) return;
      var rd = new FileReader();
      rd.onload = function () {
        var res = SoundLab.plugins.add(f.name.replace(/\.js$/i, ''), String(rd.result));
        plugMsg.textContent = res.ok ? 'loaded and running' : ('failed: ' + res.error);
        paintPlugins();
      };
      rd.readAsText(f);
    });
    plugList.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-plugrm]');
      if (rm) {
        SoundLab.plugins.remove(rm.getAttribute('data-plugrm'));
        plugMsg.textContent = 'removed — fully unloads on the next app start';
        paintPlugins();
      }
    });
    plugList.addEventListener('change', function (e) {
      var chk = e.target.closest('[data-plugon]');
      if (!chk) return;
      SoundLab.plugins.toggle(chk.getAttribute('data-plugon'), chk.checked);
      plugMsg.textContent = chk.checked ? 'enabled' : 'disabled — unloads on the next app start';
    });
    paintPlugins();

    // ---- update check ----
    document.getElementById('set-update').addEventListener('click', function () {
      document.getElementById('set-update-msg').textContent =
        'Checking… if a newer version exists, a banner will appear.';
      App.checkForUpdate(true);
    });

    var seg = document.getElementById('set-theme');

    function paint() {
      var pref = App.themePref;
      seg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-theme-pref') === pref);
      });
    }

    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-theme-pref]');
      if (!b) return;
      App.setTheme(b.getAttribute('data-theme-pref'));
      paint();
    });

    paint();

    var toneSeg = document.getElementById('set-tone');

    function paintTone() {
      var tone = App.pluckTone;
      toneSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tone') === tone);
      });
    }

    toneSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tone]');
      if (!b) return;
      App.setPluckTone(b.getAttribute('data-tone'));
      paintTone();
    });

    paintTone();

    var ptoneSeg = document.getElementById('set-ptone');

    function paintPtone() {
      var tone = App.pianoTone;
      ptoneSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-ptone') === tone);
      });
    }

    ptoneSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-ptone]');
      if (!b) return;
      App.setPianoTone(b.getAttribute('data-ptone'));
      paintPtone();
      // a quick preview so tones can be compared without leaving Settings
      try { App.pianoPlay(60, 0, 1.2, 0.5); } catch (err) { /* audio not ready */ }
    });

    paintPtone();

    var bassSeg = document.getElementById('set-bass');

    function paintBass() {
      var style = App.store.get('app.bassStyle', 'finger');
      if (style !== 'pick') style = 'finger';
      bassSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-bass-style') === style);
      });
    }

    bassSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-bass-style]');
      if (!b) return;
      App.store.set('app.bassStyle', b.getAttribute('data-bass-style'));
      paintBass();
    });

    paintBass();

    // ---- MIDI keyboard ----
    var midiMsg = document.getElementById('set-midi-msg');
    var midiPorts = document.getElementById('set-midi-ports');
    var midiIn = document.getElementById('set-midi-in');
    var midiOut = document.getElementById('set-midi-out');
    var midiEnable = document.getElementById('set-midi-enable');

    function paintMidi() {
      if (!App.midi || !App.midi.supported) {
        midiEnable.disabled = true;
        midiMsg.textContent = 'MIDI does not work in this browser. Use Chrome or Edge (on a computer or Android).';
        return;
      }
      if (!App.midi.ready) {
        midiEnable.style.display = '';
        midiPorts.style.display = 'none';
        midiMsg.textContent = 'The browser asks once if soundLAB may use MIDI. Click Allow.';
        return;
      }
      midiEnable.style.display = 'none';
      midiPorts.style.display = '';
      function fill(sel, ports, curId) {
        sel.innerHTML = '';
        if (!ports.length) {
          sel.innerHTML = '<option value="">(none found)</option>';
          return;
        }
        ports.forEach(function (pt) {
          var o = document.createElement('option');
          o.value = pt.id;
          o.textContent = pt.name;
          if (pt.id === curId) o.selected = true;
          sel.appendChild(o);
        });
      }
      fill(midiIn, App.midi.inputs, App.midi.inputId);
      // All keyboards (the default): every connected keyboard plays at once
      if (App.midi.inputs.length) {
        var allOpt = document.createElement('option');
        allOpt.value = 'all';
        allOpt.textContent = 'All keyboards';
        midiIn.insertBefore(allOpt, midiIn.firstChild);
        if (App.midi.inputId === 'all') midiIn.value = 'all';
      }
      fill(midiOut, App.midi.outputs, App.midi.outputId);
      midiOut.parentElement.style.display = App.midi.outputs.length ? '' : 'none';
      document.getElementById('set-midi-test').style.display = App.midi.outputs.length ? '' : 'none';
      paintGear();
      paintVoice();
      document.getElementById('set-midi-bt').style.display = App.midi.native ? '' : 'none';
      // Web MIDI on Windows lists Bluetooth LE MIDI ports only with the
      // Windows Runtime MIDI backend on (MidiManagerWinrt) — the hint shows
      // until a Bluetooth port is actually listed
      var btSeen = App.midi.inputs.concat(App.midi.outputs).some(function (p) { return /bluetooth/i.test(p.name || ''); });
      btNoteEl.style.display = !App.midi.native && /Windows/i.test(navigator.userAgent) && !btSeen ? '' : 'none';
      midiMsg.textContent = btNote || (App.midi.inputs.length ? '' :
        (App.midi.native ? 'Connected. Press Pair Bluetooth to find your keyboard.' :
          'Connected. Plug in a keyboard and it shows up here.'));
    }
    // Bluetooth progress from the native bridge ("Looking…", "Connecting to
    // X…", "Connected: X", "Couldn't connect…") — shown here as well as in
    // Lights & help, so Pair Bluetooth never looks like it did nothing
    var btNote = '';
    var btNoteEl = document.getElementById('set-midi-btnote');
    App.on('midi:status', function (d) {
      btNote = (d && d.text) || '';
      if (App.midi && App.midi.native && App.midi.ready) midiMsg.textContent = btNote;
    });

    midiEnable.addEventListener('click', function () {
      App.midi.enable().then(paintMidi).catch(function () {
        midiMsg.textContent = 'MIDI access was declined or failed.';
      });
    });
    App.on('midi:state', paintMidi);
    App.on('midi:voice', paintVoice);

    // what is plugged in, in one line: a chip per keyboard with what
    // soundLAB does with it (a MODX sounds by itself, a LUMI shows lights)
    var gearEl = document.getElementById('set-midi-gear');
    function paintGear() {
      if (!gearEl) return;
      var seen = {};
      var chips = App.midi.inputs.concat(App.midi.outputs).filter(function (p) {
        var k = (p.name || '').replace(/\s*(MIDI\s*)?\d*$/i, '').trim().toLowerCase();
        if (!k || seen[k]) return false;
        seen[k] = true;
        return true;
      }).map(function (p) {
        var nm = p.name || 'MIDI device', role;
        if (App.midi.selfSounding(nm)) role = App.midi.voice === 'on' ? 'makes its own sound' : 'makes its own sound, so soundLAB stays quiet';
        else if (/lumi/i.test(nm)) role = 'key lights';
        else if (/helix|stadium|line 6/i.test(nm)) role = 'Helix (use the Helix page)';
        else role = App.midi.voice === 'off' ? 'notes only' : 'plays soundLAB';
        return '<span class="set-chip"><b>' + esc(nm.replace(/\s*MIDI\s*\d*$/i, '').slice(0, 28)) + '</b> ' + esc(role) + '</span>';
      });
      gearEl.innerHTML = chips.length ? '<span class="muted small">Found:</span> ' + chips.join('') : '';
      gearEl.hidden = !chips.length;
    }

    // soundLAB plays my keys: Auto (quiet for a synth that sounds itself) /
    // Always / Never — App.midi.voice / setVoice
    var voiceSeg = document.getElementById('set-midi-voice');
    var voiceNote = document.getElementById('set-midi-voicenote');
    var VOICE_NOTES = {
      auto: 'Auto: soundLAB plays notes from a LUMI or other silent keyboard, and stays quiet for a MODX or other synth that makes its own sound.',
      on: 'Always: soundLAB plays every keyboard, even a synth that makes its own sound (you hear both).',
      off: 'Never: soundLAB only shows your notes and lights. It plays no sound for them.'
    };
    function paintVoice() {
      if (!voiceSeg || !VOICE_NOTES || !App.midi || !App.midi.supported) return;
      var v = App.midi.voice;
      voiceSeg.querySelectorAll('button').forEach(function (b) {
        var act = b.getAttribute('data-voice') === v;
        b.classList.toggle('active', act);
        b.setAttribute('aria-pressed', String(act));
      });
      voiceNote.textContent = VOICE_NOTES[v];
    }
    voiceSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-voice]');
      if (!b || !App.midi) return;
      App.midi.setVoice(b.getAttribute('data-voice'));
      paintGear();
    });
    midiIn.addEventListener('change', function () { App.midi.setInput(this.value); });
    midiOut.addEventListener('change', function () { App.midi.setOutput(this.value); });
    document.getElementById('set-midi-bt').addEventListener('click', function () {
      btNote = 'Looking for Bluetooth MIDI keyboards…';
      midiMsg.textContent = btNote;
      App.midi.bluetooth();
    });
    document.getElementById('set-midi-test').addEventListener('click', function () {
      if (!App.midi.test()) midiMsg.textContent = 'Pick a keyboard under Key lights first.';
    });

    var bendSeg = document.getElementById('set-midi-bend');
    function paintBend() {
      bendSeg.querySelectorAll('button').forEach(function (b) {
        var v = parseInt(b.getAttribute('data-bend'), 10);
        b.classList.toggle('active', v === 0 ? !App.midi.bendOn : App.midi.bendOn && v === App.midi.bendRange);
      });
    }
    bendSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-bend]');
      if (!b) return;
      var v = parseInt(b.getAttribute('data-bend'), 10);
      if (v === 0) App.midi.setBendOn(false);
      else { App.midi.setBendRange(v); App.midi.setBendOn(true); }
      paintBend();
    });
    if (App.midi) paintBend();

    document.getElementById('set-open-lights').addEventListener('click', function () { App.switchTo('lights'); });

    document.getElementById('set-backup-out').addEventListener('click', function () {
      var out = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('guitarlab.') === 0) out[k] = localStorage.getItem(k);
      }
      var blob = new Blob([JSON.stringify({ app: 'soundLAB', keys: out }, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'soundlab-settings.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
    document.getElementById('set-backup-in').addEventListener('change', function () {
      var f = this.files && this.files[0];
      var msg = document.getElementById('set-backup-msg');
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var d = JSON.parse(rd.result);
          if (!d || d.app !== 'soundLAB' || !d.keys) throw new Error('not a soundLAB backup');
          var n = 0;
          Object.keys(d.keys).forEach(function (k) {
            if (k.indexOf('guitarlab.') === 0) { localStorage.setItem(k, d.keys[k]); n++; }
          });
          msg.textContent = n + ' settings restored — reloading…';
          setTimeout(function () { location.reload(); }, 900);
        } catch (e) {
          msg.textContent = 'Import failed: ' + e.message;
        }
      };
      rd.readAsText(f);
    });

    paintMidi();
  }

  App.register('settings', {
    init: init,
    onHide: function () { if (audioUI) audioUI.hide(); },
    onShow: function () {
      if (audioUI) audioUI.show();
      // dynamic prefs may have changed elsewhere (pads click chip, wake from
      // code, volume) — re-read them when the page opens
      var c = document.getElementById('set-click');
      if (c) c.checked = App.store.get('app.click', false) === true;
      var w = document.getElementById('set-wake');
      if (w) w.checked = App.store.get('app.keepAwake', true) !== false;
      var v = document.getElementById('set-vol');
      if (v) { v.value = String(App.volume); var vv = document.getElementById('set-vol-val'); if (vv) vv.textContent = App.volume + '%'; }
      // live audio-latency readout: shows WHERE delay comes from. The app
      // schedules interactive notes at currentTime with a 4ms attack — big
      // numbers here are the output chain (Bluetooth audio ~150-300ms).
      var lat = document.getElementById('set-latency');
      if (lat) {
        try {
          var ctx = App.getAudio();
          var base = Math.round((ctx.baseLatency || 0) * 1000);
          var out = Math.round((ctx.outputLatency || 0) * 1000);
          var total = base + out;
          var msg = 'Audio engine ' + base + ' ms + output device ' + out + ' ms = ~' + total + ' ms to your ears.';
          if (total > 100) {
            msg += ' That is HIGH — almost always Bluetooth headphones/speakers (they add 150-500 ms). ' +
              'For live playing use a wired output or the device speaker; Bluetooth MIDI IN is fine (~15 ms), it is Bluetooth audio OUT that lags.';
          } else {
            msg += ' Good for live playing.';
          }
          lat.textContent = msg;
        } catch (e) { lat.textContent = 'Audio not started yet — tap anywhere first, then reopen Settings.'; }
      }
    }
  });
})();
