/* soundLAB help — the (?) button and guided page tours. Prefix hp-.
 *
 * Beginner-first: every page has a short tour (2-5 steps) written in plain
 * language. Steps can spotlight a real control (dim everything else, ring the
 * target, put the tip next to it) or stand alone as a centered card. The (?)
 * in the header always opens the tour FOR THE PAGE YOU'RE ON, and pulses
 * gently until you've taken your first tour. First launch shows a welcome
 * card automatically. Nothing here blocks the app — tap anywhere outside the
 * card to leave.
 */
(function () {
  'use strict';

  var TOURS = {
    metronome: [
      { t: 'Metronome', x: 'This sets the beat for the whole app. The BPM up top is ONE shared tempo — the Jam band, the practice runners and the Studio all follow it.' },
      { sel: '#cx-bpm', t: 'One tempo everywhere', x: 'Change the tempo here from any page and everything follows. The time signature lives right next to it.' },
      { sel: '#cx-met', t: 'Start it from anywhere', x: 'This little play button starts and stops the metronome no matter which page you’re on.' }
    ],
    fretboard: [
      { t: 'Fretboard', x: 'Every dot is a note in your key. Colors mean scale degrees — amber is the root, and the same colors mean the same thing on the Piano and in the Studio’s note editor.' },
      { sel: '#cx-root', t: 'Pick your key and scale', x: 'Key, scale and mode live in this bar and follow you everywhere. Change them and the whole neck re-colors.' },
      { t: 'Practice runner', x: 'Below the neck: pick a pattern and press play — it walks the scale in time, shows what to play next, and can pause at turnarounds while you catch up.' }
    ],
    tab: [
      { t: 'Tab', x: 'The same practice exercise as the Fretboard, written as guitar tab. They stay linked — change the key or pattern on either page and both update, and the runner keeps playing when you switch between them.' }
    ],
    notation: [
      { t: 'Notation', x: 'Standard sheet music for the same exercise as the Fretboard and Tab pages. Great for connecting positions to written notes. The runner keeps playing as you hop between the three views.' }
    ],
    chords: [
      { t: 'Chords', x: 'A chord book that knows your key. Pick any chord to see voicings, its theory, and which scale to solo with over it. The View picker shows each chord as guitar shapes, piano keys, tab, or notation.' },
      { t: 'Progressions', x: 'Load a classic progression and play it — the neck follows the sounding chord live so you can watch the changes happen.' }
    ],
    piano: [
      { t: 'Piano', x: 'The keyboard twin of the fretboard — same key, same degree colors. Play it by touch, with your computer keyboard (A W S E D… Z/X shifts octave), or a MIDI keyboard like a ROLI.' },
      { sel: '#pn-play', t: 'Practice runner', x: 'Runs scale exercises on the keys with fingering numbers — pick right or left hand and it moves to where that hand plays.' },
      { sel: '#pn-guide', t: 'Guide mode', x: 'Instead of playing FOR you, Guide waits for you to play each lit note — on screen, or lit up on a LUMI’s own keys.' }
    ],
    songs: [
      { t: 'Songs', x: 'Bring your own music: paste an ASCII guitar tab (the six-line kind from any tab site) or import a MIDI file. soundLAB detects the key, and you can loop any bars at your own tempo to practice them.' }
    ],
    jam: [
      { t: 'Jam', x: 'Your backing band. Pick a genre and it writes a whole song — intro, verse, chorus, ending — in YOUR key. Change the key up top and the band re-harmonizes live, even mid-song.' },
      { sel: '#jam-genre', t: 'Start with a genre', x: 'Each genre brings drum, bass and comping patterns plus a song form. Energy and swing reshape the feel; New song re-rolls the arrangement.' },
      { sel: '#jam-form', t: 'The song form', x: 'Tap a section chip to edit it — how many repeats, bars per chord, and which chords (add them from the palette below). Finish cues the ending.' },
      { sel: '#jam-palette', t: 'The chord palette', x: 'Stopped: tap chords to add them to the selected section. Playing: tap one (or hold a chord on a MIDI keyboard) and the band vamps on it until you hit Resume.' }
    ],
    shed: [
      { t: 'The Woodshed', x: 'Gamified practice: pick an exercise or song and play it for score — Perfect/Great/Good/Miss timing, combos, stars, XP, streaks. Every run is captured as a take in your Studio Ideas.' },
      { t: 'Four ways to practice', x: 'Run = straight through, no mercy. Phrases = short chunks loop until you nail them twice. Wait = it freezes until you play the right note (great for learning). Ladder = tempo climbs as you pass.' },
      { t: 'Feed it music', x: 'Generate scales, Hanon and rudiments; import MIDI files; paste ASCII tab (Wait mode ready instantly); or pull in any Studio track. Calibrate timing once per input so scoring is honest.' }
    ],
    tuner: [
      { t: 'Tuner', x: 'A chromatic tuner using your microphone. Press Start, allow mic access, and play one string at a time — the needle shows how far off you are; green means in tune.' }
    ],
    trainer: [
      { t: 'Trainer', x: 'Practice prompts: it deals you a key, scale and tempo to work on. Hit Go and it sets up the Fretboard for that exact drill — a fresh challenge every time.' }
    ],
    theory: [
      { t: 'Theory', x: 'The circle of fifths, a guide to what chords live in every key, and an ear quiz for scale degrees. Tap around the circle — the app’s key follows.' }
    ],
    song: [
      { t: 'Your song', x: 'The Studio’s home. There’s always a current song — its key and tempo are whatever the top bar says, and everything you capture or build lands in it.' },
      { sel: '#cx-rec', t: 'The capture button', x: 'This red dot works on EVERY page, both sides of the app. Tap it, play anything — ROLI, typing keys, touch piano — tap again, and it’s saved in Ideas with the key and tempo you played it in.' },
      { sel: '#sd-gotracks', t: 'Build it in Tracks', x: 'Tracks is the loop workstation: drums, synths and samplers all looping in sync. Ideas can be sent there with one tap.' }
    ],
    arrange: [
      { t: 'Arrange', x: 'The song timeline: every track is a lane, and clips of its pattern (or its audio) sit on a bars-and-beats ruler. Everything you see plays, in sync, through the mixer.' },
      { sel: '#ar-ruler', t: 'The ruler', x: 'Tap anywhere to jump the playhead there. DRAG along the ruler to draw a loop region — the Loop chip turns it on and off.' },
      { sel: '#ar-lanes', t: 'Clips', x: 'Tap an empty spot on a lane to place a clip; DOUBLE-TAP a clip to open its notes or drum steps in the editor. Drag clips to move them (up/down hops between lanes of the same kind), Shift-tap to multi-select, right-click or Delete to remove.' },
      { sel: '#ar-snap', t: 'Snap & zoom', x: 'Snap decides what dragging locks onto — whole bars down to free. Zoom with + and −, and Follow keeps the view chasing the playhead. Space plays and stops.' }
    ],
    tracks: [
      { t: 'Tracks', x: 'A loop workstation: every track loops in sync at the shared tempo. Drums get a step grid, synths and samplers get a piano roll colored by your key’s scale degrees.' },
      { sel: '#st-play', t: 'The loop', x: 'Play starts everything together — 1, 2 or 4 bars around. Export WAV renders your loop to a real audio file.' },
      { sel: '#st-list', t: 'Your tracks', x: 'Each row: arm Live (your MIDI/typing keys play its instrument), rename, Mute / Solo, volume, Edit to open its editor, × to delete.' },
      { sel: '#st-editor', t: 'The editor', x: 'Whatever’s selected opens here — drum steps (press and drag to paint), the piano roll (press empty space and DRAG to draw a note; drag notes to move, drag their right edge to stretch, tap to remove), synth voice knobs, or the sampler’s file + root note. Every track also has an FX slot.' }
    ],
    pads: [
      { t: 'Drum pads', x: 'Finger drums. Eight pads play your drum track’s kit — tap them, use Z X C V / A S D F, or hit them from MIDI keys with real velocity.' },
      { sel: '#pd-rec', t: 'Record a beat', x: 'Turn this on while the loop plays and every hit snaps onto the nearest 1/16 of your pattern. Fine-tune the steps afterwards on the Tracks page.' },
      { sel: '#pd-mode', t: 'MIDI mapping', x: 'ROLI octave maps eight keys from a base note — with key lights showing the kit on a LUMI, flashing with the beat. GM drums speaks the standard drum-pad map.' }
    ],
    ideas: [
      { t: 'Ideas', x: 'Your riff inbox. Everything captured with the red dot lands here, tagged with the key and tempo it was played in.' },
      { sel: '#sd-retro', t: 'The best takes happen early', x: 'soundLAB always remembers the last little while of your playing. Played something great before hitting record? Grab it here after the fact.' },
      { t: 'Do things with ideas', x: 'Play them back, rename them, send one To track to edit it in the loop, or Use key to tune the whole app to the idea’s key.' }
    ],
    settings: [
      { t: 'Settings', x: 'App-wide preferences, grouped by section: theme and accent color, one master volume for everything, studio capture options, screen wake, MIDI setup, and plugins for advanced workflows.' }
    ]
  };

  var ov = null;
  var steps = [];
  var idx = 0;

  function store() { return App.store; }

  function close() {
    if (ov) { ov.remove(); ov = null; }
    document.removeEventListener('keydown', onEsc, true);
  }

  function onEsc(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  }

  function finishTour() {
    store().set('help.done', true);
    var b = document.getElementById('help-btn');
    if (b) b.classList.remove('hp-pulse');
    close();
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }

  function renderStep() {
    if (!ov) return;
    var st = steps[idx];
    var target = st.sel ? document.querySelector(st.sel) : null;
    var rect = null;
    if (target) {
      var r = target.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight) rect = r;
    }
    var ring = ov.querySelector('.hp-ring');
    var card = ov.querySelector('.hp-card');
    if (rect) {
      ring.style.display = '';
      ring.style.left = (rect.left - 6) + 'px';
      ring.style.top = (rect.top - 6) + 'px';
      ring.style.width = (rect.width + 12) + 'px';
      ring.style.height = (rect.height + 12) + 'px';
    } else {
      ring.style.display = 'none';
    }
    var last = idx === steps.length - 1;
    card.innerHTML =
      '<div class="hp-t">' + esc(st.t) + '</div>' +
      '<div class="hp-x">' + esc(st.x) + '</div>' +
      '<div class="row spread" style="margin-top:12px">' +
        '<span class="muted small">' + (idx + 1) + ' of ' + steps.length + '</span>' +
        '<span class="row tight">' +
          (idx > 0 ? '<button type="button" class="btn sm" id="hp-back">Back</button>' : '') +
          '<button type="button" class="btn sm primary" id="hp-next">' + (last ? 'Done' : 'Next') + '</button>' +
        '</span>' +
      '</div>';
    // position: under the target if it fits, else above, else centered
    card.style.visibility = 'hidden';
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%,-50%)';
    if (rect) {
      var ch = card.offsetHeight, cw = card.offsetWidth;
      var left = Math.max(10, Math.min(innerWidth - cw - 10, rect.left + rect.width / 2 - cw / 2));
      var top = rect.bottom + 14;
      if (top + ch > innerHeight - 10) top = rect.top - ch - 14;
      if (top < 10) top = Math.max(10, (innerHeight - ch) / 2);
      card.style.transform = 'none';
      card.style.left = left + 'px';
      card.style.top = top + 'px';
    }
    card.style.visibility = '';
    card.querySelector('#hp-next').addEventListener('click', function () {
      if (last) finishTour(); else { idx++; renderStep(); }
    });
    var back = card.querySelector('#hp-back');
    if (back) back.addEventListener('click', function () { idx--; renderStep(); });
  }

  function openTour(page, extraSteps) {
    close();
    steps = extraSteps || TOURS[page] || [
      { t: 'This page', x: 'Explore freely — nothing here can break anything. The bar at the top (key, scale, tempo) is shared by every page, and the gear holds app-wide settings.' }
    ];
    idx = 0;
    ov = document.createElement('div');
    ov.id = 'hp-ov';
    ov.innerHTML = '<div class="hp-ring"></div><div class="hp-card card"></div>' +
      '<button type="button" class="hp-close btn sm" aria-label="Close help">' + App.icon('close', 14) + '</button>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) close();
    });
    ov.querySelector('.hp-close').addEventListener('click', close);
    document.addEventListener('keydown', onEsc, true);
    renderStep();
  }

  function welcome() {
    openTour(null, [
      { t: 'Welcome to soundLAB', x: 'Two workspaces in one app: Practice (fretboard, piano, jam band, tuner…) and the Studio (record ideas, build loops, finger-drum). The button next to the page menu slides between them.' },
      { t: 'One musical brain', x: 'The bar at the top — key, scale, tempo — is shared by EVERYTHING. Change it once and the fretboard re-colors, the jam re-harmonizes, and the Studio follows.' },
      { t: 'Grouped pages', x: 'Each entry in the page menu is a small group of related views — the pill strip under the top bar flips between them (Neck / Tab / Notation / Keys, Songs / Jam, Loop / Arrange…).' },
      { t: 'Whenever you’re lost', x: 'Tap the ? in the top bar — it explains whichever page you’re on, step by step. Try it on every page once.' }
    ]);
  }

  function init() {
    App.injectCSS('help',
      '#hp-ov{position:fixed;inset:0;z-index:500;background:rgba(8,7,9,0.5)}' +
      '.hp-ring{position:absolute;border:2.5px solid var(--accent);border-radius:12px;' +
        'box-shadow:0 0 22px var(--accent-glow);background:rgba(255,255,255,0.06);pointer-events:none}' +
      '.hp-card{position:absolute;width:min(320px,86vw);padding:16px 18px;z-index:2;' +
        'background:var(--card);border:1px solid var(--accent);box-shadow:0 12px 40px rgba(0,0,0,0.5)}' +
      '.hp-t{font-weight:700;font-size:16px;margin-bottom:6px}' +
      '.hp-x{font-size:13.5px;line-height:1.5;color:var(--muted)}' +
      '.hp-close{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));right:12px;z-index:2}' +
      '#help-btn.hp-pulse .ic{animation:hp-pp 2s ease-in-out infinite}' +
      '@keyframes hp-pp{0%,100%{opacity:1}50%{opacity:0.35}}'
    );

    var btn = document.getElementById('help-btn');
    if (btn) {
      btn.innerHTML = '<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/>' +
        '<path d="M9.4 9.2a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 3.8"/><circle cx="12" cy="17.4" r="0.4" fill="currentColor"/></svg>';
      if (!store().get('help.done', false)) btn.classList.add('hp-pulse');
      btn.addEventListener('click', function () {
        openTour(App.active);
        this.blur();
      });
    }

    // fresh install: say hello once
    if (!store().get('help.seen', false)) {
      store().set('help.seen', true);
      setTimeout(welcome, 700);
    }
  }

  // the shell boots synchronously after all scripts — run right after
  setTimeout(init, 0);

  window.Help = { open: openTour, welcome: welcome, TOURS: TOURS };
})();
