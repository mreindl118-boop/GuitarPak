/* Settings tab — app-wide preferences. Feature-specific options stay with
 * their feature (e.g. the fretboard's degree colors live in its gear panel);
 * this tab holds everything app-level, starting with appearance. */
(function () {
  'use strict';

  function init(rootEl) {
    App.injectCSS('settings',
      '.set-theme-note{margin-top:10px}' +
      '.set-sub{margin:16px 0 8px;font-size:12px;font-weight:600;letter-spacing:1.4px;' +
        'text-transform:uppercase;color:var(--label,var(--muted))}' +
      '.set-sub:first-of-type{margin-top:12px}' +
      '.set-acc{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}' +
      '.set-acc.active{border-color:var(--text);box-shadow:0 0 0 2px var(--card)}' +
      '#set-vol{width:200px;max-width:56vw;vertical-align:middle}'
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
        '<div class="muted small set-theme-note">How far back &ldquo;Keep the last take&rdquo; reaches. Everything you play is remembered for this long.</div>' +
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
        '<h2>Screen &amp; battery</h2>' +
        '<label class="row tight small muted" style="gap:6px">' +
          '<input type="checkbox" id="set-wake">Keep the screen awake while sound is playing or a practice runner is going' +
        '</label>' +
      '</div>' +
      '<div class="card">' +
        '<h2>MIDI keyboard</h2>' +
        '<div class="muted small">Connect a USB or Bluetooth MIDI keyboard (ROLI LUMI, Launchkey&hellip;) to play the app&rsquo;s piano ' +
          'with velocity, key-wiggle pitch bend and pressure &mdash; and to get LED guidance: the practice runner and the chord ' +
          'explorer light the keys to play on the device itself. Guide mode on the Piano tab waits for you to play each lit note.</div>' +
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
        '<div class="fb-field" style="margin-top:14px">Pitch-bend range' +
          '<div class="seg" id="set-midi-bend">' +
            '<button type="button" data-bend="2">&plusmn;2</button>' +
            '<button type="button" data-bend="12">&plusmn;12</button>' +
            '<button type="button" data-bend="48">&plusmn;48 (ROLI)</button>' +
          '</div>' +
        '</div>' +
        '<label class="row tight small muted" style="gap:6px;margin-top:12px">' +
          '<input type="checkbox" id="set-midi-lumi">ROLI LUMI key/scale sync (experimental) &mdash; pushes the app&rsquo;s key and scale to the LUMI&rsquo;s own key lights' +
        '</label>' +
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
      fill(midiOut, App.midi.outputs, App.midi.outputId);
      document.getElementById('set-midi-bt').style.display = App.midi.native ? '' : 'none';
      midiMsg.textContent = App.midi.inputs.length ? '' :
        (App.midi.native ? 'Connected — pair your keyboard with the Bluetooth button.' :
          'Connected — plug in a keyboard and it will appear here.');
    }

    midiEnable.addEventListener('click', function () {
      App.midi.enable().then(paintMidi).catch(function () {
        midiMsg.textContent = 'MIDI access was declined or failed.';
      });
    });
    App.on('midi:state', paintMidi);
    midiIn.addEventListener('change', function () { App.midi.setInput(this.value); });
    midiOut.addEventListener('change', function () { App.midi.setOutput(this.value); });
    document.getElementById('set-midi-bt').addEventListener('click', function () {
      App.midi.bluetooth();
    });
    document.getElementById('set-midi-test').addEventListener('click', function () {
      if (!App.midi.hasOutput) { midiMsg.textContent = 'No LED output selected.'; return; }
      [60, 64, 67, 72].forEach(function (m, i) {
        setTimeout(function () { App.midi.light(m, 120); }, i * 180);
        setTimeout(function () { App.midi.dark(m); }, i * 180 + 600);
      });
    });

    var bendSeg = document.getElementById('set-midi-bend');
    function paintBend() {
      bendSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', parseInt(b.getAttribute('data-bend'), 10) === App.midi.bendRange);
      });
    }
    bendSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-bend]');
      if (!b) return;
      App.midi.setBendRange(parseInt(b.getAttribute('data-bend'), 10));
      paintBend();
    });
    if (App.midi) paintBend();

    var lumiChk = document.getElementById('set-midi-lumi');
    lumiChk.checked = !!App.store.get('midi.lumi', false);
    lumiChk.addEventListener('change', function () {
      App.store.set('midi.lumi', !!this.checked);
      if (this.checked && App.midi) App.midi.lumiSync();
    });

    paintMidi();
  }

  App.register('settings', { init: init });
})();
