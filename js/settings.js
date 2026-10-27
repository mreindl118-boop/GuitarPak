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
      '#set-ain-test{margin-left:8px}'
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
      '<div class="card">' +
        '<h2>MIDI keyboard</h2>' +
        '<div class="muted small">Connect a USB or Bluetooth MIDI keyboard (ROLI LUMI, Launchkey&hellip;) to play the app&rsquo;s piano ' +
          'with velocity and pressure (pitch bend is off unless you turn it on below) &mdash; its own lights show the scale and the keys to play, on every page.</div>' +
        '<div class="row tight" style="margin-top:12px" id="set-midi-row">' +
          '<button type="button" class="btn sm primary" id="set-midi-enable">Connect MIDI</button>' +
          '<span class="muted small" id="set-midi-msg"></span>' +
        '</div>' +
        '<div class="row" id="set-midi-ports" style="display:none;margin-top:12px">' +
          '<label class="field">Input<select id="set-midi-in"></select></label>' +
          '<label class="field">LED output<select id="set-midi-out"></select></label>' +
          '<button type="button" class="btn sm" id="set-midi-test" title="Briefly lights a C major arpeggio on the device">Light test</button>' +
          '<button type="button" class="btn sm" id="set-midi-bt" style="display:none" title="Open the system Bluetooth MIDI pairing sheet">Pair Bluetooth&hellip;</button>' +
        '</div>' +
        '<div class="muted small" id="set-midi-btnote" style="display:none;margin-top:10px">Bluetooth keyboard not listed? On Windows, Chrome and Edge only see Bluetooth MIDI with ' +
          '<b>Windows Runtime MIDI</b> switched on: the soundLAB Windows shortcuts do that for you, or turn on <b>use-winrt-midi-api</b> in chrome://flags (edge://flags) and restart the browser. ' +
          'Pair the keyboard in Windows Bluetooth settings first. A USB cable always works.</div>' +
        '<div class="set-sub">Pitch bend</div>' +
        '<div>' +
          '<div class="seg" id="set-midi-bend" role="group" aria-label="Pitch bend">' +
            '<button type="button" data-bend="0">Off</button>' +
            '<button type="button" data-bend="2">&plusmn;2</button>' +
            '<button type="button" data-bend="12">&plusmn;12</button>' +
            '<button type="button" data-bend="48">&plusmn;48 (ROLI)</button>' +
          '</div>' +
        '</div>' +
        '<label class="row tight small muted" style="gap:6px;margin-top:14px">' +
          '<input type="checkbox" id="set-midi-appsound">Play soundLAB&rsquo;s voice for the notes my keyboard sends. Turn it OFF for a synth or stage piano that makes its own sound (a MODX, a Nord&hellip;) so nothing is doubled; a silent controller like a LUMI needs it ON. The MIDI Hub page mutes the voice by itself while open.' +
        '</label>' +
        '<div class="row tight" style="margin-top:14px">' +
          '<button type="button" class="btn sm" id="set-open-lights">Lights &amp; help</button>' +
          '<span class="muted small">Key lights (a LUMI shows the scale in your colors), brightness and the Help level live in one place: the keyboard icon at the top of every page.</span>' +
        '</div>' +
      '</div>' +
      // the controller remote (js/remote.js renders the rows)
      '<div class="card" id="set-remote-card">' +
        '<h2>Hands-free control</h2>' +
        '<div class="muted small">Move practice on from the instrument: a pedal, a button on your synth or a page-turner pedal does Next, Back and Stop on Exercises, Keys lessons, the Woodshed, LUMI practice, the Practice plan, Songs, the fretboard runner and Live sets.</div>' +
        '<div id="set-remote"></div>' +
      '</div>' +
      '<div class="card" id="set-audio-card">' +
        '<h2>Sound input &amp; output</h2>' +
        '<div class="muted small">Pick the interface soundLAB listens to (tone-in, Woodshed scoring) and plays out of. ' +
          '<b>Hear input</b> plays it live through soundLAB at the master volume &mdash; a synth on USB audio (Yamaha MODX / MONTAGE), ' +
          'a Helix or any line input. A Line&nbsp;6 Helix / Stadium is auto-detected by name. Devices are re-checked on plug/unplug.</div>' +
        '<div class="row" style="margin-top:12px" id="set-audio-row">' +
          '<button type="button" class="btn sm primary" id="set-audio-enable" title="Asks for audio-input permission so the device names can be shown">List devices</button>' +
          '<label class="field" style="display:none">Input<select id="set-audio-in"></select></label>' +
          '<label class="field" style="display:none">Output<select id="set-audio-out"></select></label>' +
          '<span class="muted small" id="set-audio-msg"></span>' +
        '</div>' +
        '<div class="small set-ain-hint" id="set-audio-hint" hidden></div>' +
        '<div class="set-sub" id="set-ain-sub">Hear input</div>' +
        '<div class="row tight" id="set-ain-row">' +
          '<div class="seg" id="set-ain-mon" role="group" aria-label="Hear input">' +
            '<button type="button" data-mon="off" aria-pressed="true">Off</button>' +
            '<button type="button" data-mon="on" aria-pressed="false">On</button>' +
          '</div>' +
          '<span class="muted small">Gain</span>' +
          '<input type="range" id="set-ain-gain" min="0" max="200" step="5" aria-label="Input gain">' +
          '<span class="muted small" id="set-ain-gain-val"></span>' +
        '</div>' +
        '<div class="row tight" id="set-ain-meterrow" style="margin-top:12px">' +
          '<div class="set-meter" id="set-ain-meter" role="meter" aria-label="Input level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" style="margin-top:0;flex:1"><i></i><b></b></div>' +
          '<button type="button" class="btn sm" id="set-ain-test" hidden title="Opens the input for the level meter while Settings is open">Test input</button>' +
        '</div>' +
        '<div class="small set-ain-warn" id="set-ain-warn" role="alert" hidden></div>' +
        '<div class="muted small set-theme-note" id="set-ain-msg"></div>' +
        '<div class="set-sub">Tone-in</div>' +
        '<label class="set-check" style="margin-top:0">' +
          '<input type="checkbox" id="set-tonein"><span>&frac14;&Prime; guitar TONE-IN' +
          '<small>Detects the notes you play on the audio input and lights them on every instrument page ' +
            '(fretboard positions, keys, guide mode), exactly like a MIDI keyboard. Detection only &mdash; nothing is re-sounded.</small></span>' +
        '</label>' +
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

    // ---- sound input & output ----
    // App.audioIn (js/audioin.js) owns the live input: Hear input, its gain
    // and the level tap. This card only paints it. Device names need input
    // permission — until they're readable, "List devices" asks for it.
    var audMsg = document.getElementById('set-audio-msg');
    var audIn = document.getElementById('set-audio-in');
    var audOut = document.getElementById('set-audio-out');
    var audBtn = document.getElementById('set-audio-enable');
    var audHint = document.getElementById('set-audio-hint');
    var monSeg = document.getElementById('set-ain-mon');
    var ainGain = document.getElementById('set-ain-gain');
    var ainGainVal = document.getElementById('set-ain-gain-val');
    var meterEl = document.getElementById('set-ain-meter');
    var meterBar = meterEl.querySelector('i');
    var meterPk = meterEl.querySelector('b');
    var ainWarn = document.getElementById('set-ain-warn');
    var ainMsg = document.getElementById('set-ain-msg');
    var ainTest = document.getElementById('set-ain-test');
    var ainRows = ['set-ain-sub', 'set-ain-row', 'set-ain-meterrow'].map(function (id) { return document.getElementById(id); });
    var ainNote = '';    // a one-off line for the Hear input card (cleared on the next action)
    var meterTest = false; // "Test input" pressed: the meter holds the input until Settings closes
    var outGone = false;   // the chosen output was missing at the last listing
    var fillGone = '';     // the "not connected" note fillDevices wrote last
    var AIN = App.audioIn || null;
    var SYNTH_RE = /MODX|MONTAGE|Yamaha|Steinberg/i;
    var named = false;   // device labels readable (input permission granted)
    var lastDevs = [];

    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    function labelOf(id) {
      for (var i = 0; i < lastDevs.length; i++) {
        if (lastDevs[i].kind === 'audioinput' && lastDevs[i].deviceId === id) return lastDevs[i].label || '';
      }
      return '';
    }

    // a synth's USB audio (Yamaha MODX / MONTAGE: "Line (MODX)") — say how
    // to hear it; never turns Hear input on by itself
    function paintHint() {
      var ins = lastDevs.filter(function (d) { return d.kind === 'audioinput' && SYNTH_RE.test(d.label || ''); });
      var real = ins.filter(function (d) { return d.deviceId !== 'default' && d.deviceId !== 'communications'; });
      var synth = real[0] || ins[0];
      var txt = '';
      if (synth && named) {
        var nm = /MONTAGE/i.test(synth.label) ? 'MONTAGE' : /MODX/i.test(synth.label) ? 'MODX' :
          /Steinberg/i.test(synth.label) ? 'Steinberg' : 'Yamaha';
        if (!SYNTH_RE.test(labelOf(App.store.get('audio.inId', '')))) {
          txt = nm + ' audio found — pick it as Input and turn on Hear input to play it through soundLAB.';
        } else if (App.store.get('audio.monitor', false) !== true) {
          txt = nm + ' audio is your Input — turn on Hear input to play it through soundLAB.';
        }
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
        var html = '<option value="">System default</option>' + list.map(function (d) {
          return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === cur ? ' selected' : '') + '>' +
            esc((d.label || d.kind).slice(0, 48)) + '</option>';
        }).join('');
        // keep a chosen device that is unplugged right now: it is used again
        // the moment it comes back (a synth switched off and on)
        if (cur && !list.some(function (d) { return d.deviceId === cur; })) {
          html += '<option value="' + esc(cur) + '" selected>Chosen device (not connected)</option>';
          gone.push(storeKey === 'audio.inId' ? 'input' : 'output');
        }
        sel.innerHTML = html;
        sel.parentElement.style.display = '';
      }
      fill(audIn, ins, 'audio.inId');
      fill(audOut, outs, 'audio.outId');
      var goneMsg = gone.map(function (g) {
        return g === 'input'
          ? 'The chosen input is not connected — Hear input and tone-in wait for it and use it again the moment it comes back.'
          : 'The chosen output is not connected — sound plays on the system default until it comes back.';
      }).join(' ');
      var msg = goneMsg;
      var outBack = gone.indexOf('output') === -1;
      if (outBack) applySink(outGone);
      outGone = !outBack;
      // auto-pick a known interface only while the user never chose an input
      var picked = App.store.get('audio.inPicked', false) === true;
      var helix = lastDevs.filter(function (d) { return /helix|stadium|line 6/i.test(d.label || ''); })[0];
      if (helix && !App.store.get('audio.inId', '') && !picked) {
        msg = 'Helix detected: “' + helix.label.slice(0, 40) + '” — selected as input.';
        if (helix.kind === 'audioinput') pickInput(helix.deviceId);
      }
      var synth = ins.filter(function (d) {
        return SYNTH_RE.test(d.label || '') && d.deviceId !== 'default' && d.deviceId !== 'communications';
      })[0];
      if (synth && !App.store.get('audio.inId', '') && !picked) {
        msg = 'Found “' + synth.label.slice(0, 40) + '” — selected as Input. Turn on Hear input to play it through soundLAB.';
        pickInput(synth.deviceId);
      }
      // a re-listing with nothing new keeps the last note (e.g. "Found
      // Line (MODX) — selected"); only a "not connected" note it wrote clears
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
          ctx.setSinkId(id).catch(function () { audMsg.textContent = 'output switch refused — using default'; });
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
          if (withPoke && !named) audMsg.textContent = (AIN && AIN.listError) || 'Input permission was not granted — device names stay hidden.';
          paintAin();
          if (named && App.active === 'settings') meterStart();
        })
        .catch(function () { audMsg.textContent = 'Device listing is not available here.'; });
    }

    audBtn.addEventListener('click', function () { listDevices(true); });
    audIn.addEventListener('change', function () {
      App.store.set('audio.inPicked', true);
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
          ctx.setSinkId(this.value || '').then(function () { audMsg.textContent = 'output switched'; })
            .catch(function () { audMsg.textContent = 'output switch refused — using default'; });
        } else {
          audMsg.textContent = 'this browser cannot route output per-app — using default';
        }
      } catch (e) { /* no audio yet */ }
    });
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', function () { listDevices(false); });
    }

    // ---- Hear input + gain ----
    function paintAin() {
      var want = App.store.get('audio.monitor', false) === true;
      var avail = !!(AIN && AIN.supported);
      var s = avail ? AIN.state : null;
      monSeg.querySelectorAll('button').forEach(function (b) {
        var isOn = b.getAttribute('data-mon') === 'on', act = isOn === want;
        var held = isOn && act && !!(s && s.held);
        b.classList.toggle('active', act && !held);
        b.classList.toggle('held', held);
        b.setAttribute('aria-pressed', String(act));
        b.title = held ? 'On, but paused — the note below says why' : '';
      });
      // QUIET CHROME: no Hear input controls where capture can't work
      ainRows.forEach(function (el) { if (el) el.style.display = avail ? '' : 'none'; });
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
          ? 'Hear input is on — click or tap anywhere to turn on sound (the browser keeps audio off until you interact with the page).'
          : 'Hearing “' + (s.label || 'the input') + '” through soundLAB, at the master volume.') : ainNote);
      meterEl.classList.toggle('live', !!s.on);
      ainTest.hidden = !(App.active === 'settings' && !meterWanted());
      paintHint();
    }
    monSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mon]');
      if (!b || !AIN) return;
      var on = b.getAttribute('data-mon') === 'on';
      ainNote = '';
      if (on && !named) {
        // device names not readable yet: this first press only asks for the
        // input permission and lists the inputs — nothing is heard before an
        // input can be seen and picked (a laptop mic would howl straight away)
        listDevices(true).then(function () {
          if (named) ainNote = App.store.get('audio.inId', '') ? 'Now press On to hear it.' : 'Pick your instrument as Input above, then press On.';
          paintAin();
        });
        return;
      }
      AIN.setMonitor(on).then(function () { if (App.active === 'settings') meterStart(); paintAin(); });
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
    // the meter opens the input only when it is in use — Hear input, tone-in,
    // an input picked here — or on "Test input": opening Settings alone never
    // grabs a device (a Bluetooth headset's mic would drop the headphones to
    // call quality, and the OS recording light would come on)
    function meterWanted() {
      var id = App.store.get('audio.inId', '');
      return App.store.get('audio.monitor', false) === true || App.store.get('audio.tonein', false) === true ||
        meterTest || (named && !!id && id !== 'default' && id !== 'communications');
    }
    function meterStart() {
      if (!AIN || !AIN.supported) return;
      if (meterWanted()) {
        AIN.hold('settings-meter');
        if (!meterTimer && !document.hidden) meterTimer = setInterval(meterTick, 50);
      } else {
        meterStop(false);
      }
      paintAin();
    }
    ainTest.addEventListener('click', function () {
      meterTest = true;
      if (!named) listDevices(true); else meterStart();
    });
    function meterStop(keepHold) {
      if (meterTimer) { clearInterval(meterTimer); meterTimer = null; }
      if (!keepHold) meterTest = false;
      if (!keepHold && AIN) AIN.release('settings-meter');
      meterBar.style.width = '0%';
      pkHold = 0;
      meterPk.style.left = '0%';
    }
    document.addEventListener('visibilitychange', function () {
      if (App.active !== 'settings') return;
      if (document.hidden) meterStop(true); else meterStart();
    });
    // on show: re-read the list (names may have become readable elsewhere —
    // no permission prompt, enumerateDevices only), then the meter
    audioUI = { show: function () { paintAin(); meterStart(); listDevices(false); }, hide: function () { meterStop(false); paintAin(); } };

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
        midiMsg.textContent = 'Web MIDI is not available here — use Chrome or Edge (desktop or Android).';
        return;
      }
      if (!App.midi.ready) {
        midiEnable.style.display = '';
        midiPorts.style.display = 'none';
        midiMsg.textContent = 'Your browser will ask for permission.';
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
      document.getElementById('set-midi-bt').style.display = App.midi.native ? '' : 'none';
      // Web MIDI on Windows lists Bluetooth LE MIDI ports only with the
      // Windows Runtime MIDI backend on (MidiManagerWinrt) — the hint shows
      // until a Bluetooth port is actually listed
      var btSeen = App.midi.inputs.concat(App.midi.outputs).some(function (p) { return /bluetooth/i.test(p.name || ''); });
      btNoteEl.style.display = !App.midi.native && /Windows/i.test(navigator.userAgent) && !btSeen ? '' : 'none';
      midiMsg.textContent = btNote || (App.midi.inputs.length ? '' :
        (App.midi.native ? 'Connected — pair your keyboard with the Bluetooth button.' :
          'Connected — plug in a keyboard and it will appear here.'));
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
    midiIn.addEventListener('change', function () { App.midi.setInput(this.value); });
    midiOut.addEventListener('change', function () { App.midi.setOutput(this.value); });
    document.getElementById('set-midi-bt').addEventListener('click', function () {
      btNote = 'Looking for Bluetooth MIDI keyboards…';
      midiMsg.textContent = btNote;
      App.midi.bluetooth();
    });
    document.getElementById('set-midi-test').addEventListener('click', function () {
      if (!App.midi.test()) midiMsg.textContent = 'No LED output selected.';
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

    var asChk = document.getElementById('set-midi-appsound');
    asChk.checked = !App.midi || App.midi.appSound;
    asChk.addEventListener('change', function () { if (App.midi) App.midi.setAppSound(!!this.checked); });

    var toneChk = document.getElementById('set-tonein');
    toneChk.checked = App.store.get('audio.tonein', false) === true;
    toneChk.addEventListener('change', function () {
      App.store.set('audio.tonein', !!this.checked);
      if (App.tonein) { if (this.checked) App.tonein.start(); else App.tonein.stop(); }
      if (App.active === 'settings') meterStart();
    });

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
    if (App.remote) App.remote.mount(document.getElementById('set-remote'));
  }

  App.register('settings', {
    init: init,
    onHide: function () { if (audioUI) audioUI.hide(); if (App.remote) App.remote.cancelLearn(); },
    onShow: function () {
      if (audioUI) audioUI.show();
      if (App.remote) App.remote.paint();
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
