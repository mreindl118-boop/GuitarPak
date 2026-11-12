/* soundLAB help — the (?) button and guided page tours. Prefix hp-.
 *
 * Beginner-first: every page has a short tour (2-5 steps) written in plain
 * language. Steps can spotlight a real control (dim everything else, ring the
 * target, put the tip next to it) or stand alone as a centered card. The (?)
 * in the header always opens the tour FOR THE PAGE YOU'RE ON, and pulses
 * gently until you've taken your first tour. First launch shows a welcome
 * card automatically. Nothing here blocks the app — tap anywhere outside the
 * card to leave.
 *
 * ONE FILE FOR BOTH APPS (2.0 Phase A3b): index.html (soundLAB) and gear.html
 * (soundLAB Gear) load it. TOURS is keyed by page id, so each app shows the
 * tours of its own pages (deck, liveset, midihub and helix are Gear pages)
 * and the two sheets' tours in both. The welcome card is about soundLAB's
 * pages: Gear never shows it and leaves help.seen alone, so soundLAB still
 * says hello on its own first start.
 */
(function () {
  'use strict';

  var TOURS = {
    practiceplan: [
      { t: 'Practice plan', x: 'A short session built from your teacher’s notes. Open Teacher’s lesson notes, paste or import the text, review the mapping and accept it. Each student keeps a separate plan on this device.' },
      { sel: '#pp-today', t: 'One block at a time', x: 'Start opens the linked tool with its supported settings. New lesson runs and recorded playing or answering time measure completion. Old scores and idle page time do not finish today’s blocks. A Next pedal or synth button (Settings › Hands-free control) opens the next unfinished block from here, and Back opens the last one again.' },
      { sel: '#pp-gaps', t: 'What to build next', x: 'Unmatched assignments and missing setup hooks become module gaps with their original text. Export them to choose future improvements. Google Doc links are bookmarks; no account connection is required.' },
      { sel: '#pp-tools', t: 'Free practice', x: 'Under the plan, closed until you open it: a session timer with its log, random practice prompts (Go sets up the Fretboard for the prompt) and one-minute chord changes. In a chord-change minute, Space or a Next pedal counts a change. This timer is separate from the plan’s measured minutes.' }
    ],
    metronome: [
      { t: 'Metronome', x: 'It opens over whatever page you’re on and keeps clicking after you close it — the icon in the top corner glows and pulses on the beat while it runs. Its tempo is the ONE shared tempo: the Jam band and the practice runners follow it.' },
      { sel: '#met-tap', t: 'Tap tempo', x: 'Tap along to a song and the BPM follows your taps. −5 / −1 / +1 / +5 and the slider fine-tune it.' },
      { sel: '#met-dots', t: 'Accents', x: 'Tap a beat dot to cycle it between accent, normal and muted.' },
      { sel: '#met-trbox', t: 'Tempo trainer', x: 'Speeds you up automatically: +N BPM every M bars until the target. Sounds lets you pick each click’s voice.' }
    ],
    fretboard: [
      { t: 'Fretboard', x: 'Every dot is a note in your key. Its color follows Color notes by (in the Fretboard’s settings, or in Lights & help): by Interval each scale degree has its color and amber is the root; by Note every C is one color in every key. The Piano uses the same colors.' },
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
      { sel: '#pn-voice', t: 'Sound', x: 'The grand piano or a synth: pick what this keyboard plays. The synth sounds follow pitch bend and pressure from a keyboard like a ROLI.' },
      { sel: '#pn-chseg', t: 'Perform', x: 'Triads or 7ths turn every in-scale key into its chord (+Bass and Strum appear then). Arp plays what you hold as an arpeggio — its speed, direction, range and Hold appear once it’s on.' },
      { sel: '#pn-play', t: 'Practice runner', x: 'Runs scale exercises on the keys with fingering numbers — pick right or left hand and it moves to where that hand plays.' },
      { sel: '#pn-guide', t: 'Guide mode', x: 'Instead of playing FOR you, Guide waits for you to play each lit note — on screen, or lit up on a LUMI’s own keys.' },
      { sel: '#pn-assist', t: 'Help level', x: 'How much the keyboard tells you. Full shows the scale colors, note names, fingers and the next note; Colors drops the names; Target only rings the note to play; Tonic marks home; None is a bare keyboard. Pressed keys always flash their color.' },
      { sel: '.kl-card', t: 'Scale lessons', x: 'Graded scale lessons played with the click. Every note is checked for the right key and how close it lands to the beat. Score 85 to level up to a faster tempo. Pick ∞ to loop the scale until you stop and go for your longest streak of clean notes. Runs, best scores and streaks are saved here and on the Exercises Progress tab. A Next pedal or synth button (Settings › Hands-free control) starts the lesson and moves on to the next level without touching the screen.' },
      { sel: '#pn-lumi', t: 'Notes and triads on the LUMI', x: 'Under the lessons, closed until you open it. It shows a note or a triad to play and moves on when you play exactly those notes. It starts with on-screen answers; a connected LUMI or MODX can be the answer keyboard. While the section is open, the pedal works here and the lessons’ double-tap on the lowest key is paused; the double-tap key from Settings › Hands-free control works here too when it is on, in Simulated mode. Starting a lesson or the runner closes it.' }
    ],
    songs: [
      { t: 'Songs', x: 'Bring your own music: paste an ASCII guitar tab (the six-line kind from any tab site) or import a MIDI file. soundLAB detects the key, and you can loop any bars at your own tempo to practice them.' },
      // #sg-player is hidden until a file is sent to it: the step is then a centered card
      { sel: '#sg-player', t: 'Player', x: 'Choose a file under Open a score, then Play on synth: the Player opens under that card and plays the file on your synth. Change the tempo, cap the loudest note, transpose, or use Change key to move the piece into another key or scale. Only notes and the sustain pedal are sent, so your synth’s sounds stay as they are. No synth listed? Open Settings on the card takes you to where you connect your keyboard.' }
    ],
    jam: [
      { t: 'Jam', x: 'Your backing band. Pick a genre and it writes a whole song — intro, verse, chorus, ending — in YOUR key. Change the key up top and the band re-harmonizes live, even mid-song.' },
      { sel: '#jam-genre', t: 'Start with a genre', x: 'Each genre brings drum, bass and comping patterns plus a song form. Energy and swing reshape the feel; New song re-rolls the arrangement.' },
      { sel: '#jam-form', t: 'The song form', x: 'Tap a section chip to edit it — how many repeats, bars per chord, and which chords (add them from the palette below). Finish cues the ending.' },
      { sel: '#jam-palette', t: 'The chord palette', x: 'Stopped: tap chords to add them to the selected section. Playing: tap one (or hold a chord on a MIDI keyboard) and the band vamps on it until you hit Resume.' }
    ],
    shed: [
      { t: 'The Woodshed', x: 'Gamified practice: pick an exercise or song and play it for score — Perfect/Great/Good/Miss timing, combos, stars, XP, streaks.' },
      { t: 'Four ways to practice', x: 'Run = straight through, no mercy. Phrases = short chunks loop until you nail them twice. Wait = it freezes until you play the right note (great for learning). Ladder = tempo climbs as you pass. A Next pedal or synth button (Settings › Hands-free control) starts the count-in and goes again from the score, Back restarts (in Phrases: the phrase before) and Stop ends the run — Guided performance too.' },
      { t: 'Feed it music', x: 'Generate scales, Hanon and rudiments; import MIDI files; or paste ASCII tab (Wait mode ready instantly). Generated exercises follow the treble-clef root and scale; MIDI and generated scores work in either guided mode. PDFs and images are not parsed scores. Calibrate timing once per input so scoring is honest.' }
    ],
    tuner: [
      { t: 'Tuner', x: 'A chromatic tuner using your microphone. Press Start, allow mic access, and play one string at a time — the needle shows how far off you are; green means in tune.' }
    ],
    quiz: [
      { t: 'Exercises', x: 'A course in short levels of 10 questions: Notes, Intervals, Chords, Scales and Key signatures. Every right answer earns XP; quick answers and runs of 5 earn more.' },
      { sel: '#learn-instrument', t: 'Your instrument', x: 'Exercises count for the instrument picked here. Notation, ear training and theory are shared by every instrument; a run keeps the instrument it started with, and history from before instruments were tracked stays as Legacy / unassigned.' },
      { sel: '.qz-strip', t: 'Your day', x: 'Your streak grows each day you finish a level or play for 5 minutes on any page. The ring fills toward your daily XP goal, and XP raises your consistency level: a habit meter that fades after a break, not a skill level. Seven days in a row earns a streak freeze that covers a missed day.' },
      { sel: '.qz-hometabs', t: 'Path, Topics, Progress', x: 'The Path walks you through the course step by step, and each step opens the next. Topics lets you practice anything. Progress shows your XP, practice time and how your answer speed improves.' },
      { t: 'Sprints, streaks and jumps', x: 'Tap a step on the path for its levels, a 60-second sprint (as many right answers as you can) and an Endless streak (questions until your first miss), each against your own record. The answer clock (Off, 8, 5 or 3 s) times every Endless and drill question: answer on instinct before it runs out. Already know it? Tap a locked step and Jump here: 9 out of 10 opens the path up to there.' },
      { t: 'Hands off the screen', x: 'Practising at the keyboard? A pedal, a button on your synth or a Bluetooth page turner can be your Next button: set it up in Settings › Hands-free control. Next starts a level and moves on (press it twice to show an answer, not in an Endless streak), Back plays the sound again or retries, Stop ends the run. Multiple-choice answers have a white key each (C, D, E… on the button): play it to answer.' }
    ],
    theory: [
      { t: 'Theory', x: 'The circle of fifths, a guide to what chords live in every key, and an ear quiz for scale degrees. Tap around the circle — the app’s key follows.' }
    ],
    deck: [
      { sel: '#st-now', t: 'Your synth, on this screen', x: 'The sound the synth is on, its Part and program. Prev and Next step programs; Save preset keeps the sound, the strips, the buttons, the Scene, the key split and the app’s key as one preset. The grid under it is your Live set page (or your pinned sounds).' },
      { sel: '.st-strips', t: 'Strips, not knobs', x: 'Tap or drag anywhere along a strip; drag up or down away from it for fine steps. The Super Knob is the wide one. The row picker is the synth’s knob-function button: Favourites is yours, the others follow the MODX rows; Assign knobs are named by what the Performance wired them to.' },
      { sel: '#st-chips', t: 'Buttons and Scenes', x: 'Arp and Motion seq are the panel buttons; Split sends the keys below a point to another Part; Assign 1 and 2 are the two switches by the Super Knob; Scenes 1–8 recall what the Performance stored in them.' },
      { sel: '#st-explain', t: 'Explain', x: 'Switch on the ? and every control gets a line about what it does on the synth and what it sends. Edit shows everything the deck has: knob pages, every button, your Sounds with the bank browser, the Scope and the Map.' }
    ],
    liveset: [
      { sel: '#st-lvgrid', t: 'Pages of 16', x: 'A Live set is pages of 16 slots, like the synth’s own Live Sets. Edit slots, then tap a slot to put a preset on it (or a MODX Live Set slot). Tap a filled slot to load it; Next and Prev step through them across pages.' },
      { sel: '.st-lvopts', t: 'Hands-free', x: 'Learn a foot switch once and every press steps to the next slot. With a LUMI, its octave buttons can step too.' },
      { sel: '#st-lvgo', t: 'Go live', x: 'Only the grid, the sound you are on and the next one. Lock makes every slot a press-and-hold so nothing changes by accident; Panic silences every channel; the screen stays on.' },
      { sel: '.st-lvprof', t: 'Profiles', x: 'A profile is a whole setup: your sounds, sets and Deck settings. Make one per player or per gig, export it as a file, import it on another device.' }
    ],
    midihub: [
      { sel: '#mh-views', t: 'Player', x: 'Open a MIDI or MusicXML file and play it on your synth: tempo, a loudest-note cap, transpose, and Change key to move a piece into any key or scale. To see a file as guitar tab, open it on the Songs page in soundLAB.' },
      { sel: '#mh-views', t: 'Control your synth', x: 'Control is the Synth Deck: your current sound at the top, the big knobs (filter, envelope, effects, volume), buttons for scenes, arpeggiator and Motion Sequencer, sounds you save and load with one tap, and a Scope that draws what the synth is playing. Your synth’s own knobs move the ones here too.' },
      { sel: '#sdk-now', t: 'Your current sound', x: 'The name, Part and program the synth is on, and the port it goes to. Prev and Next step through programs, the star pins a sound up here, Save sound keeps the program plus the knobs and buttons as they are now. Nothing is sent until you tap a sound.' },
      { sel: '#sdk-tabs', t: 'Knobs · Buttons · Sounds · Scope · Map', x: 'Knobs adds pages of extra knobs. Buttons has scenes, arp and Motion Sequencer switches, Part mute and the pedals. Sounds is your library and the synth’s banks by name. Scope shows the arpeggiator and sequencer notes against the beat and the controller curves the synth sends. Map is where every number lives: a ? means it came from documentation, so tap Learn and move the control on the synth to make it yours.' },
      { t: 'MIDI Hub', x: 'Everything on the MIDI cable, for any device: a synth, a controller, a DAW port. Connect, pick In and Out, and the Monitor shows every message decoded as you play or turn knobs.' },
      { sel: '#mh-views', t: 'Eight views', x: 'Player plays a MIDI or MusicXML file on the synth. Play sends notes, bend, mod and program changes. Controls is a wall of CC sliders plus transport and clock. Rules reshape messages. SysEx talks to the deep settings. Monitor reads everything. Learn explains it all.' },
      { sel: '#mh-thru', t: 'Thru and Rules', x: 'Thru passes In to Out through your Rules — remap a knob, transpose, force a channel, block aftertouch. Thru runs while soundLAB Gear is open: keep this window open to pass your keyboard to the synth. Rules can also change what soundLAB hears, on every page.' },
      { sel: '#mh-profile', t: 'Device profiles', x: 'Generic speaks plain MIDI to anything. A profile adds named knobs and ready-made SysEx builders for that maker (Yamaha MODX/MONTAGE, Roland…) — nothing else changes.' }
    ],
    helix: [
      { t: 'Helix Stadium', x: 'Control a Line 6 Helix Stadium from soundLAB Gear. Over USB MIDI: presets, snapshots, knobs, pedals, looper and the Matrix mixer. With the bridge on this computer (node tools/helix-bridge.js) it also reads and edits the loaded preset block by block.' },
      { sel: '#hx-armrow', t: 'Nothing sends until you arm', x: 'Output starts disarmed. Arm opens a 90-second window that every command renews; leaving the page, hiding the app or switching windows disarms it again. Reads never need arming.' },
      { sel: '#hx-views', t: 'Six views', x: 'Rig is the pedalboard: presets, favorites, snapshots, knobs. Blocks edits the loaded preset live (bridge). Presets browses and loads (bridge). Looper & Song, Mixer, and a Monitor of every message.' },
      { sel: '#hx-favs', t: 'Favorites', x: 'Name a preset address once, recall it with one tap. With the bridge running, the star next to a preset fills in its address for you. Saving a favorite never sends anything.' }
    ],
    pads: [
      { t: 'Drum pads', x: 'Finger drums. Eight pads play the drum kit — tap them, use Z X C V / A S D F, or hit them from MIDI keys with real velocity.' },
      { sel: '#pd-mode', t: 'MIDI mapping', x: 'ROLI octave maps eight keys from a base note — with key lights showing the kit on a LUMI, flashing with every hit. GM drums speaks the standard drum-pad map.' }
    ],
    lights: [
      { t: 'Lights & help', x: 'One place for how much the app helps you. The Help level is the difficulty: Full shows the scale in color with names, fingers and the next note; None is a bare keyboard. It applies to the Keys page, Scale lessons, Exercises and your keyboard’s own lights.' },
      { t: 'Your keyboard’s lights', x: 'A LUMI lights every key of the scale in the same color as the screen (Color notes by: Interval = by scale degree, Note = every C one color), and follows the app’s key on every page. Play a note after pressing its octave buttons and the app follows the new octave too.' },
      { t: 'LUMI Display', x: 'On by default: during a lesson or practice run the LUMI shows only what to play \u2014 the note to play now steady in its color, the next one blinking \u2014 and the full scale comes back when the run ends. Songs and the Woodshed light the notes to play the same way; Woodshed Wait mode holds the light until you play it. Double-tap your keyboard\u2019s lowest key, or the lesson card, to start and stop a lesson.' },
      { sel: '#lc-remote', t: 'Hands-free', x: 'A pedal, a button on your synth or a page-turner pedal can press Next, Back and Stop on the practice pages, so you never reach for the screen. Set up opens Settings › Hands-free control.' }
    ],
    settings: [
      { t: 'Settings', x: 'App-wide preferences, grouped by section: theme and accent color, one master volume for everything, screen wake, MIDI setup and hands-free control.' },
      { sel: '#set-remote-card', t: 'Hands-free control', x: 'Press Learn beside Next, Back or Stop, then the pedal, synth button or page-turner key. From then on it only moves practice on — it never plays a note, sustains or answers a question. Try it here: the screen says it works.' }
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
      { t: 'This page', x: 'Explore freely — nothing here can break anything. The clef at the top (key, scale, tempo) is shared by every page, and the gear ' +
        (App.app === 'gear' ? 'opens Settings in soundLAB.' : 'holds app-wide settings.') }
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
      { t: 'Welcome to soundLAB', x: 'Start with Exercises: a short theory and ear-training course you answer by playing. Around it: guitar, keys, songs, the jam band and the tuner.' },
      { t: 'One musical brain', x: 'The clef button at the top opens key, scale and tempo, shared by EVERYTHING. Change it once and the fretboard re-colors and the jam re-harmonizes. Its metronome ▶ starts the click from any page.' },
      { t: 'Sections', x: 'The tabs — Learn, Guitar, Keys, Play, Train (along the bottom on phones) — are the app’s sections. The pills at the top of the page switch pages inside a section (Neck / Tab / Notation, Piano / Charts / Pads…).' },
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

    // fresh install: say hello once. Not in soundLAB Gear: the welcome is
    // about soundLAB's pages, and help.seen stays unset there
    if (App.app !== 'gear' && !store().get('help.seen', false)) {
      store().set('help.seen', true);
      setTimeout(welcome, 700);
    }
  }

  // the shell boots synchronously after all scripts — run right after
  setTimeout(init, 0);

  window.Help = { open: openTour, welcome: welcome, TOURS: TOURS, close: close, isOpen: function () { return !!ov; } };
})();
