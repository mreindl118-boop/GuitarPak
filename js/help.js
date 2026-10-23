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
    practiceplan: [
      { t: 'Practice plan', x: 'A short session built from your teacher’s notes. Open Teacher’s lesson notes, paste or import the text, review the mapping and accept it. Each student keeps a separate plan on this device.' },
      { sel: '#pp-today', t: 'One block at a time', x: 'Start opens the linked tool with its supported settings. New lesson runs and recorded playing or answering time measure completion. Old scores and idle page time do not finish today’s blocks.' },
      { sel: '#pp-gaps', t: 'What to build next', x: 'Unmatched assignments and missing setup hooks become module gaps with their original text. Export them to choose future improvements. Google Doc links are bookmarks; no account connection is required.' }
    ],
    metronome: [
      { t: 'Metronome', x: 'It opens over whatever page you’re on and keeps clicking after you close it — the icon in the top corner glows and pulses on the beat while it runs. Its tempo is the ONE shared tempo: the Jam band, the practice runners and the Studio all follow it.' },
      { sel: '#met-tap', t: 'Tap tempo', x: 'Tap along to a song and the BPM follows your taps. −5 / −1 / +1 / +5 and the slider fine-tune it.' },
      { sel: '#met-dots', t: 'Accents', x: 'Tap a beat dot to cycle it between accent, normal and muted.' },
      { sel: '#met-trbox', t: 'Tempo trainer', x: 'Speeds you up automatically: +N BPM every M bars until the target. Sounds lets you pick each click’s voice.' }
    ],
    fretboard: [
      { t: 'Fretboard', x: 'Every dot is a note in your key. Its color follows Color notes by (in the Fretboard’s settings, or in Lights & help): by Interval each scale degree has its color and amber is the root; by Note every C is one color in every key. The Piano and the Studio’s note editor use the same colors.' },
      { sel: '#ctx-btn', t: 'Pick your key and scale', x: 'Tap the clef for the shared key and scale. Scale Lock blocks out-of-scale pitched notes across tools, playback and MIDI; drums and recorded/live audio keep their own sound. LUMI Display independently shows the selected scale and practice targets on the configured LUMI. Its connection status appears here.' },
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
      { t: 'Piano', x: 'The keyboard twin of the fretboard — same key, same note colors. Play it by touch, with your computer keyboard (A W S E D… Z/X shifts octave), or a MIDI keyboard like a ROLI.' },
      { sel: '#pn-chseg', t: 'Perform', x: 'Triads or 7ths turn every in-scale key into its chord (+Bass and Strum appear then). Arp plays what you hold as an arpeggio — its speed, direction, range and Hold appear once it’s on.' },
      { sel: '#pn-play', t: 'Practice runner', x: 'Runs scale exercises on the keys with fingering numbers — pick right or left hand and it moves to where that hand plays.' },
      { sel: '#pn-guide', t: 'Guide mode', x: 'Instead of playing FOR you, Guide waits for you to play each lit note — on screen, or lit up on a LUMI’s own keys.' },
      { sel: '#pn-assist', t: 'Help level', x: 'How much the keyboard tells you. Full shows the scale colors, note names, fingers and the next note; Colors drops the names; Target only rings the note to play; Tonic marks home; None is a bare keyboard. Pressed keys always flash their color.' },
      { sel: '.kl-card', t: 'Scale lessons', x: 'Graded scale lessons played with the click. Every note is checked for the right key and how close it lands to the beat. Score 85 to level up to a faster tempo. Pick ∞ to loop the scale until you stop and go for your longest streak of clean notes. Runs, best scores and streaks are saved here and on the Exercises Progress tab.' }
    ],
    musiclibrary: [
      { sel: '#ml-files', t: 'Your local music library', x: 'Add an original PDF, image, MIDI or MusicXML file. Files stay in this browser across ordinary updates. Opening or importing music earns no XP.' },
      { t: 'Recognition beta', x: 'Open source review to recognize one selected monophonic treble or bass staff on one page. Clear engraving only: full piano, polyphonic, multistaff, scanned and whole-multipage recognition are outside this beta. Correct the draft against your source before practice.' },
      { sel: '#ml-export', t: 'Keep a library backup', x: 'Export full library backup keeps originals, target versions, sections and practice history. Settings has a separate archive. Browser storage can be lost if site data is cleared or evicted; this is not cross-device sync.' }
    ],
    score: [
      { sel: '#sr-recognition', t: 'Notation recognition beta', x: 'Recognize one selected monophonic treble or bass staff on one page at a time. Use clear engraving. Full piano, polyphonic, multistaff, scanned and whole-multipage recognition are outside this beta. Files and recognition stay local.' },
      { sel: '#sr-rows', t: 'Compare and correct', x: 'Recognition creates an unverified draft and can miss notes or repeats. Check every pitch, rest, beat and duration against the original. Edit mistakes, mark the checked targets and Save reviewed revision. Your original stays unchanged.' },
      { sel: '#sr-rhythm', t: 'Confirm rhythm separately', x: 'Leave rhythm unconfirmed for Wait for Me practice. Confirm beat positions and durations only after checking the source; then Play at Tempo is available. Parsed timing is not verified timing.' },
      { sel: '#sr-launch', t: 'Practice reviewed targets', x: 'Choose your actual practice-credit instrument, mode and optional named section. Start uses the shared practice player and optional LUMI guidance. Importing, editing and review earn no XP; playing records only the instrument selected for that attempt.' }
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
      { t: 'Tuner', x: 'Open the tuning-fork icon beside the clef and Settings from any page. Opening it does not start the microphone. Choose your audio input in Settings, press Start listening and play one note at a time. The meter and cents text show tuning; A4 and string presets are saved.' }
    ],
    trainer: [
      { t: 'Trainer', x: 'Practice prompts: it deals you a key, scale and tempo to work on. Hit Go and it sets up the Fretboard for that exact drill — a fresh challenge every time.' }
    ],
    quiz: [
      { t: 'Exercises', x: 'A course in short levels of 10 questions: Notes, Intervals, Chords, Scales and Key signatures. Every right answer earns XP; quick answers and runs of 5 earn more.' },
      { sel: '.qz-strip', t: 'Your day', x: 'Your streak grows each day you finish a level or play for 5 minutes on any page. The ring fills toward your daily XP goal, and XP raises your level. Seven days in a row earns a streak freeze that covers a missed day.' },
      { sel: '.qz-hometabs', t: 'Path, Topics, Progress', x: 'The Path walks you through the course step by step, and each step opens the next. Topics lets you practice anything. Progress shows your XP, practice time and how your answer speed improves.' },
      { t: 'Sprints, streaks and jumps', x: 'Tap a step on the path for its levels, a 60-second sprint (as many right answers as you can) and an Endless streak (questions until your first miss), each against your own record. The answer clock (Off, 8, 5 or 3 s) times every Endless and drill question: answer on instinct before it runs out. Already know it? Tap a locked step and Jump here: 9 out of 10 opens the path up to there.' }
    ],
    theory: [
      { t: 'Theory', x: 'The circle of fifths, a guide to what chords live in every key, and an ear quiz for scale degrees. Tap around the circle — the app’s key follows.' }
    ],
    song: [
      { t: 'Your song', x: 'The Studio’s home. There’s always a current song — its key and tempo are whatever the clef at the top says, and everything you capture or build lands in it.' },
      { sel: '#ctx-btn', t: 'The capture button', x: 'Tap the clef, then the red dot: it works on every Studio page. Tap it, play anything — ROLI, typing keys, touch piano — tap again, and it’s saved in Ideas with the key and tempo you played it in. While it records, the clef shows a red dot.' },
      { sel: '#sd-gotracks', t: 'Build it in Tracks', x: 'Tracks is the loop workstation: drums, synths and samplers all looping in sync. Ideas can be sent there with one tap.' }
    ],
    arrange: [
      { t: 'Arrange', x: 'The song timeline: every track is a lane, and clips of its pattern (or its audio) sit on a bars-and-beats ruler. Everything you see plays, in sync, through the mixer.' },
      { sel: '#ar-ruler', t: 'The ruler', x: 'Tap anywhere to jump the playhead there. DRAG along the ruler to draw a loop region — the Loop chip turns it on and off.' },
      { sel: '#ar-lanes', t: 'Clips', x: 'Tap an empty spot on a lane to place a clip; DOUBLE-TAP a clip to open its notes or drum steps in the editor. Drag clips to move them (up/down hops between lanes of the same kind), Shift-tap to multi-select, right-click or Delete to remove.' },
      { sel: '#ar-snap', t: 'Snap & zoom', x: 'Snap decides what dragging locks onto — whole bars down to free. Zoom with + and −, and Follow keeps the view chasing the playhead. Space plays and stops.' }
    ],
    tracks: [
      { t: 'Tracks', x: 'A loop workstation: every track loops in sync at the shared tempo. Drums get a step grid, synths and samplers get a piano roll in the app’s note colors (by scale degree or by note, as set on the Fretboard or in Lights & help).' },
      { sel: '#st-play', t: 'The loop', x: 'Play starts everything together — 1, 2 or 4 bars around. Export WAV renders your loop to a real audio file.' },
      { sel: '#st-list', t: 'Your tracks', x: 'Each row: arm Live (your MIDI/typing keys play its instrument), rename, Mute / Solo, volume, Edit to open its editor, × to delete.' },
      { sel: '#st-editor', t: 'The editor', x: 'Whatever’s selected opens here — drum steps (press and drag to paint), the piano roll (press empty space and DRAG to draw a note; drag notes to move, drag their right edge to stretch, tap to remove), synth voice knobs, or the sampler’s file + root note. Every track also has an FX slot.' }
    ],
    midihub: [
      { sel: '#mh-views', t: 'Control your synth', x: 'Control is the easy view: pick a Part, then turn the big knobs (filter, envelope, effects, volume) and step through programs. Your synth\u2019s own knobs move the ones here too.' },
      { t: 'MIDI Hub', x: 'Everything on the MIDI cable, for any device: a synth, a controller, a DAW port. Connect, pick In and Out, and the Monitor shows every message decoded as you play or turn knobs.' },
      { sel: '#mh-views', t: 'Six views', x: 'Play sends notes, bend, mod and program changes. Controls is a wall of CC sliders plus transport and clock. Rules reshape messages. SysEx talks to the deep settings. Monitor reads everything. Learn explains it all.' },
      { sel: '#mh-hear', t: 'Only the device sounds', x: 'While this page is open soundLAB keeps its own piano quiet, so a synth is never doubled. Tick App voice to hear both. For every other page the same switch lives in Settings › MIDI keyboard.' },
      { sel: '#mh-thru', t: 'Thru and Rules', x: 'Thru passes In to Out through your Rules — remap a knob, transpose, force a channel, block aftertouch. Rules can also change what soundLAB itself hears, on every page.' },
      { sel: '#mh-profile', t: 'Device profiles', x: 'Generic speaks plain MIDI to anything. A profile adds named knobs and ready-made SysEx builders for that maker (Yamaha MODX/MONTAGE, Roland…) — nothing else changes.' }
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
    lights: [
      { t: 'Lights & help', x: 'One place for how much the app helps you. The Help level is the difficulty: Full shows the scale in color with names, fingers and the next note; None is a bare keyboard. It applies to the Keys page, Scale lessons, Exercises and your keyboard’s own lights.' },
      { t: 'Your keyboard’s lights', x: 'A LUMI lights every key of the scale in the same color as the screen (Color notes by: Interval = by scale degree, Note = every C one color), and follows the app’s key on every page. Play a note after pressing its octave buttons and the app follows the new octave too.' },
      { t: 'LUMI Display', x: 'On by default: during a lesson or practice run the LUMI shows only what to play \u2014 the note to play now steady in its color, the next one blinking \u2014 and the full scale comes back when the run ends. Songs and the Woodshed light the notes to play the same way; Woodshed Wait mode holds the light until you play it. Double-tap your keyboard\u2019s lowest key, or the lesson card, to start and stop a lesson.' }
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
    if (ov) { ov.remove(); ov = null; App.emit('tour', { open: false }); }
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
    if (App.showBar) App.showBar(); // tours point at the top bar too
    close();
    steps = extraSteps || TOURS[page] || [
      { t: 'This page', x: 'Explore freely — nothing here can break anything. The clef at the top (key, scale, tempo) is shared by every page, and the gear holds app-wide settings.' }
    ];
    idx = 0;
    ov = document.createElement('div');
    ov.id = 'hp-ov';
    ov.innerHTML = '<div class="hp-ring"></div><div class="hp-card card"></div>' +
      '<button type="button" class="hp-close btn sm" aria-label="Close help">' + App.icon('close', 14) + '</button>';
    document.body.appendChild(ov);
    App.emit('tour', { open: true });
    ov.addEventListener('click', function (e) {
      if (e.target === ov) close();
    });
    ov.querySelector('.hp-close').addEventListener('click', close);
    document.addEventListener('keydown', onEsc, true);
    renderStep();
  }

  function welcome() {
    openTour(null, [
      { t: 'Welcome to soundLAB', x: 'Start with Exercises: a short theory and ear-training course you answer by playing. Around it are two workspaces: Practice (guitar, keys, jam band, tuner…) and the Studio (record ideas, build loops, finger-drum). The Studio button in the top corner switches between them.' },
      { t: 'One musical brain', x: 'The clef button at the top opens key, scale and tempo, shared by EVERYTHING. Change it once and the fretboard re-colors, the jam re-harmonizes, and the Studio follows. Its metronome ▶ starts the click from any page.' },
      { t: 'Sections', x: 'Learn, Free Play, Library and Progress organize practice around your selected instrument. Free Play keeps All tools for the other instrument pages. Library retains original scores and reviewed targets. The Studio keeps its recording and editing tools.' },
      { sel: '#met-btn', t: 'The metronome', x: 'Always one tap away in the top corner: it opens over any page and keeps playing when you close it.' },
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

  window.Help = { open: openTour, welcome: welcome, TOURS: TOURS, close: close, isOpen: function () { return !!ov; } };
})();
