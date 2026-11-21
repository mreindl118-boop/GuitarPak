/* soundLAB 2.0 Phase B, step B1b: the shared helper of every drawing in docs/design/phase-b/
 * (docs/plans/phase-b/PLAN.md, B1b.1). Read the header of mock.css first.
 *
 * A drawing is a static page: tokens.css, mock.css, this file, and its own short script.
 * No app script is loaded, so the sample data below is a COPY of what the app holds; each
 * table names the line it was copied from.
 *
 *     <link rel="stylesheet" href="../../../css/tokens.css">
 *     <link rel="stylesheet" href="mock.css">
 *     <script src="mock.js"></script>
 *     <script>
 *       if (!Mock.single) Mock.contact({ … every state of this drawing … });
 *       else Mock.page({ main: '…the page body…' });
 *     </script>
 *
 * PARAMETERS EVERY DRAWING UNDERSTANDS (every state of every drawing has its own URL)
 *   ?w=<px>          the state alone, laid out for the window it is given (the breakpoints are
 *                    the app's: 640 and 900 px). The number is the width the frame had; when
 *                    the window belongs to another tier a one-line note says so.
 *                    WITHOUT ?w= a drawing shows its contact view: every state at every width
 *                    it needs, dark and light, each in a labelled frame scaled to fit the
 *                    window. A tap on a frame's caption opens that state alone.
 *   ?theme=dark|light   sets data-theme on <html>. In the contact view it shows one theme only.
 *   ?touch=1|0       forces the touch heights (48 px) or the mouse heights (44 / 36 px),
 *                    whatever the device is. Without it the tokens decide ((any-pointer: coarse)).
 *                    The contact view asks touch=1 for frames up to 820 px.
 *   ?only=<state>    contact view: one state only.   ?zoom=<0.2 … 1>   contact view: the largest scale.
 *
 * THE SHELL'S PARAMETERS (Mock.shell reads them, so every drawing that embeds the shell has them)
 *   app=main|gear    page=<page id>    nav=a|b|c (the home's placement, D20; b is the default)
 *   key=<root>-<scale id>   e.g. A-dorian, A-minorPent, Db-aeolian     bpm=<30…280>
 *   lock=1|0         lights=scale|off|none|kbd      help=0…4        colors=interval|note
 *   inst=piano|synth|guitar|bass|drums|voice|other
 *   pop=key|tempo|lock|lights|help|more   the open panel         toast=lock   the message a flip shows
 *   scrolled=1       the header slid away         goal=1   today's goal is open
 *   beta=1           the tag at the beta address  met=1    the click is running
 *   sheet=metronome|lights|instrument             bar=open   Gear: the folded key bar is open
 *   hint=full|mid|short   forces a form of the lock's sentence     labels=1|0   forces the bar's labels
 * A drawing reads its own parameters with Mock.q('name', fallback).
 *
 * HOW TO ADD A STATE: add one entry to the list a drawing hands to Mock.contact:
 *   Mock.contact({ title, lead: ['a paragraph', …], groups: [{ title, lead, states: [
 *     { id: 'lock-off', title: 'one line in plain words', note: 'an optional second line',
 *       params: { lock: 0 }, widths: [390, 820, 1280] } ] }] })
 *   The state's URL is this file's name plus those parameters. A width's window height is in
 *   Mock.DATA.SIZES (360 x 740, 390 x 844, 640 and 641 x 900, 820 x 1180, 1024 x 640,
 *   1280 x 800); write [width, height] for another one. Mock.frames() lists every frame of
 *   the contact view ({id, w, h, theme, url}): the screenshot and measuring scripts read it.
 *
 * HOW TO EMBED THE SHELL
 *   Mock.page({ main: html })      writes the whole page into <body>: the shell, <main> with one
 *                                  open panel that carries .sl-skin, the footer, the message stack
 *   Mock.page({ shell: { page: 'quiz', fixed: ['page'] }, main: html, toasts: ['Saved'] })
 *     shell    the shell's state (below); main: the panel's content (left out: a quiet page);
 *     toasts   messages for the stack: a text, or { id, text, bad, icon, acts: [[words, 'primary']] };
 *     foot: false leaves the footer out; after: markup behind the stack (a tour layer); title
 *   Mock.shell(opts)               only the shell's markup, as a string: the header with the pill
 *                                  row, the key bar, the bottom tab bar, the sheets (Appendix A)
 *   opts, all optional. A URL parameter of the same name wins, unless opts.fixed lists the name:
 *     app, page, nav, root (0-11), scale (id), bpm, lock, lights, help, colors, inst, pop,
 *     scrolled, goal, beta, met, sheet, sheetBody (the open sheet's content), bar, hint, labels
 *   Mock.settle(opts)   run it after Mock.shell's markup is in the page (Mock.page does). It runs
 *                       again by itself on resize and when the fonts have arrived. The jobs that
 *                       the app has too (step B5a):
 *     0. in Gear the header's key button takes the longest form of the key's name that leaves the
 *        header in one row: plain, short, short without the caret (data-fit on #cx-toggle);
 *     1. the header's height is published on <html> as --mk-topbar-h (the bar sticks under it);
 *     2. the hidden attribute of the three panels that are panels on phones only (Tempo, Scale
 *        lock, More) follows the 640 px tier;
 *     3. the key bar takes the longest forms that fit its row, in this order: labels and the
 *        key's full name; labels; no labels; the lock's sentence shorter, then shortest; the
 *        key's short name; Help as dots only and the lights' one-word state (class is-tight);
 *        the switch without the words "Scale lock" (is-tighter). The bar's data-fit attribute
 *        names what was chosen, and says OVERFLOW if even the last step does not fit.
 *     It also puts an open panel under its chip above 900 px.
 *   Anything with data-go="name=value&…" opens the same drawing with those parameters changed:
 *   a tap on a chip opens its panel, Back closes it, a tap outside or Escape closes it too.
 *
 * WHAT ELSE IS HERE
 *   Mock.DATA        scales, short names, roots, note colours as a page shows them, the app's
 *                    pages, tabs and labels, Help levels with their sentences, instruments,
 *                    the keyboard's states, the window sizes
 *   Mock.icon(name, size)   the app's Lucide icons (js/app.js ICONS) plus the two that B6 adds
 *                    (more, caret) and one that B7b is asked to add (alert). A drawing takes every
 *                    icon from here and carries no copy of its own
 *   Mock.wordmark()  the real wordmark SVG (index.html)
 *   Mock.keyName(root, scale, 'full'|'plain'|'short')    Mock.scaleName(scale, form)
 *   Mock.lockSentence(on, root, scale, 'full'|'mid'|'short')    Mock.lockMessage(on, root, scale)
 *   Mock.scaleNotes(root, scale)   the notes of a key: { pc, step, name, color, label }
 *   Mock.inkOn(hex)  'dark' or 'light': which ink reads on a note colour (SLHero.inkOn of mock-hero.js)
 *   Mock.quietPage(opts)    a quiet page body, a headline and a keyboard, for drawings of the shell
 *                    (the keyboard is SLHero.keyboard: load mock-hero.js after this file)
 *   Mock.toast(t)    one message of the stack, as markup
 *   Mock.change(rows)   "Change this picture": a fold of chips under a picture opened alone, and the
 *                    way back to all pictures. rows = [[parameter, words, value, [[value, words], …]], …]
 *   Mock.figure(f)   one labelled frame of a contact view, as markup: f = { url, w, h, title, caption, cap }
 *   Mock.fit()       sizes every frame of the page (.mk-view) to the column of .mk-contact. The
 *                    owner's page, index.html, builds its small pictures from these two
 *   Mock.q(name, fallback), Mock.esc(text), Mock.href(params), Mock.tierOf(width), Mock.single
 */
(function () {
  'use strict';

  // ---- parameters -----------------------------------------------------------------
  var search = new URLSearchParams(location.search), P = {};
  search.forEach(function (v, k) { P[k] = v; });
  var single = Object.prototype.hasOwnProperty.call(P, 'w');
  var root = document.documentElement;
  if (P.theme === 'light' || P.theme === 'dark') root.setAttribute('data-theme', P.theme);
  // the touch heights, forced: the same two values css/tokens.css sets under (any-pointer: coarse)
  if (P.touch === '1') { root.style.setProperty('--sl-control-h', '48px'); root.style.setProperty('--sl-control-h-dense', '48px'); }
  if (P.touch === '0') { root.style.setProperty('--sl-control-h', '44px'); root.style.setProperty('--sl-control-h-dense', '36px'); }

  function q(name, fallback) { return Object.prototype.hasOwnProperty.call(P, name) ? P[name] : fallback; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function href(params) {
    var parts = [];
    Object.keys(params).forEach(function (k) { if (params[k] !== '' && params[k] != null) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); });
    return (location.pathname.split('/').pop() || 'index.html') + (parts.length ? '?' + parts.join('&') : '');
  }
  function merged(changes) {
    var out = {}, k;
    for (k in P) if (Object.prototype.hasOwnProperty.call(P, k)) out[k] = P[k];
    for (k in changes) if (Object.prototype.hasOwnProperty.call(changes, k)) out[k] = changes[k];
    return out;
  }
  function tierOf(w) { return w <= 640 ? 'phone' : w <= 900 ? 'tablet' : 'desktop'; }

  // ---- sample data: copies of what the app holds ------------------------------------
  // js/theory.js:40-54 (Theory.SCALES), :55-56 (SCALE_ORDER), :58-63 (SCALE_GROUPS)
  var SCALES = {
    major:         { name: 'Major (Ionian)',          steps: [0, 2, 4, 5, 7, 9, 11] },
    dorian:        { name: 'Dorian',                  steps: [0, 2, 3, 5, 7, 9, 10] },
    phrygian:      { name: 'Phrygian',                steps: [0, 1, 3, 5, 7, 8, 10] },
    lydian:        { name: 'Lydian',                  steps: [0, 2, 4, 6, 7, 9, 11] },
    mixolydian:    { name: 'Mixolydian',              steps: [0, 2, 4, 5, 7, 9, 10] },
    aeolian:       { name: 'Natural Minor (Aeolian)', steps: [0, 2, 3, 5, 7, 8, 10] },
    locrian:       { name: 'Locrian',                 steps: [0, 1, 3, 5, 6, 8, 10] },
    majorPent:     { name: 'Major Pentatonic',        steps: [0, 2, 4, 7, 9] },
    minorPent:     { name: 'Minor Pentatonic',        steps: [0, 3, 5, 7, 10] },
    blues:         { name: 'Blues (minor)',           steps: [0, 3, 5, 6, 7, 10] },
    harmonicMinor: { name: 'Harmonic Minor',          steps: [0, 2, 3, 5, 7, 8, 11] },
    melodicMinor:  { name: 'Melodic Minor',           steps: [0, 2, 3, 5, 7, 9, 11] },
    phrygDom:      { name: 'Phrygian Dominant',       steps: [0, 1, 4, 5, 7, 8, 10] }
  };
  var SCALE_ORDER = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian',
    'majorPent', 'minorPent', 'blues', 'harmonicMinor', 'melodicMinor', 'phrygDom'];
  var SCALE_GROUPS = [
    { label: 'Common', ids: ['major', 'aeolian', 'majorPent', 'minorPent', 'blues'] },
    { label: 'Minor family', ids: ['harmonicMinor', 'melodicMinor'] },
    { label: 'Modes', ids: ['dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'] },
    { label: 'Exotic', ids: ['phrygDom'] }
  ];
  // the short-name table of decision D17 (B5a builds it as SCALE_SHORT). A scale that is not
  // listed is short once the words in brackets are left out ("Major", "Blues").
  var SCALE_SHORT = { aeolian: 'Minor', minorPent: 'Min Pent', majorPent: 'Maj Pent', harmonicMinor: 'Harm Minor', melodicMinor: 'Mel Minor', phrygDom: 'Phryg Dom' };
  // js/theory.js:35-37: a key's root is named flat for the five black keys (Theory.FLAT_KEYS)
  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var FLAT_KEYS = [1, 3, 5, 6, 8, 10];
  function flatKey(pc) { return FLAT_KEYS.indexOf(pc) !== -1; }
  function pcName(pc, preferFlat) { pc = ((pc % 12) + 12) % 12; return preferFlat ? FLAT[pc] : SHARP[pc]; }
  var ROOTS = SHARP.map(function (n, pc) { return pcName(pc, flatKey(pc)); });       // the twelve names of the Key select
  // PALETTE DATA BEGIN
  // THE TWO PALETTES' DATA: the only raw colours in the drawings' files besides the saved Gear
  // page (gear.html). A note's colour is data, not a token (decision D12): in the app it comes
  // from App.colors, here from this table, and it reaches an element as the inline property --c.
  // Note colours AS A PAGE SHOWS THEM: App.colors snaps the stored colours to the LUMI's table
  // (js/note-palette.js; tests/colors.test.js:16-17). Not the --sl-deg tokens, which hold the
  // stored colours. DEGREES = the seven scale degrees; INTERVALS = the twelve semitones above
  // the root (what "Degree" mode paints, with their labels); NOTES = C … B ("Note name" mode).
  var COLORS = {
    DEGREES: ['#ffaa2e', '#ffd429', '#7dfc74', '#41eab4', '#439af5', '#7e58f5', '#ff6460'],
    INTERVALS: ['#ffaa2e', '#ffbd2b', '#ffd429', '#baf94f', '#7dfc74', '#41eab4', '#2fbced', '#439af5', '#5877fd', '#7e58f5', '#9d42ea', '#ff6460'],
    INTERVAL_LABELS: ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'],
    NOTES: ['#ff6460', '#ff8944', '#ffb12d', '#ffd429', '#caf945', '#85fc6f', '#4df2a2', '#29dbd9', '#35b2ef', '#4f86f9', '#7160f9', '#9746ec'],
    PAD_NEUTRAL: '#c8c2b8',     // js/pads.js:36-38: seven pads take the seven degree colours, the eighth (Crash) this neutral
    // The other palette of gate G4 ("the mockup's colours", instruments.html): the red-first set
    // css/tokens.css held before step B1a (git show a914df2:css/tokens.css, lines 43-49: ff4d4d,
    // ff9a3c, ffd23f, 4cd964, 34d0e0, 4d7dff, b36bff), run through the LUMI's colour table the way
    // a page's colours are: DEGREES = SLNotePalette.mapped(), INTERVALS = SLNotePalette.intervals()
    // of js/note-palette.js (map-pages-instr.md 3 b; the seven are the plan's B16.6).
    MOCKUP: {
      DEGREES: ['#ff5869', '#ff9a37', '#ffd029', '#5ffe86', '#26cbe9', '#557cfc', '#8d4def'],
      INTERVALS: ['#ff5869', '#ff7950', '#ff9a37', '#ffb52c', '#ffd029', '#5ffe86', '#3ee9b9', '#26cbe9', '#3ea3f2', '#557cfc', '#6e62fa', '#8d4def']
    }
  };
  // PALETTE DATA END (a script that counts raw colours skips the lines between the two marks)
  // js/app.js:76-93 (APPS), :102-108 (SPACE_LABELS), :114-120 (SUB_LABELS), as of soundLAB 2.1.0:
  // 15 pages, and Train is Woodshed | Voice | Tuner (the voice trainer, page id 'vocal')
  var APPS = {
    main: { url: 'index.html', name: 'soundLAB', other: 'gear',
      pages: ['quiz', 'practiceplan', 'fretboard', 'tab', 'notation', 'chords', 'piano', 'chart', 'pads', 'songs', 'jam', 'shed', 'vocal', 'tuner', 'theory'],
      groups: [
        { id: 'gtheory', label: 'Learn', icon: 'learn', pages: ['quiz', 'chords', 'theory', 'practiceplan'] },
        { id: 'ginst', label: 'Guitar', icon: 'guitar', pages: ['fretboard', 'tab', 'notation'] },
        { id: 'gkeys', label: 'Keys', icon: 'keys', pages: ['piano', 'chart', 'pads'] },
        { id: 'gplay', label: 'Play', icon: 'note', pages: ['songs', 'jam'] },
        { id: 'gprac', label: 'Train', icon: 'target', pages: ['shed', 'vocal', 'tuner'] }
      ] },
    gear: { url: 'gear.html', name: 'soundLAB Gear', other: 'main',
      pages: ['deck', 'liveset', 'midihub', 'helix'],
      groups: [
        { id: 'gsynth', label: 'Synth', icon: 'sliders', pages: ['deck', 'liveset', 'midihub'] },
        { id: 'ghelix', label: 'Helix', icon: 'guitar', pages: ['helix'] }
      ] }
  };
  var PAGE_LABELS = { metronome: 'Metronome', fretboard: 'Fretboard', tab: 'Tab', notation: 'Notation', chords: 'Chords', piano: 'Piano',
    songs: 'Songs', jam: 'Jam', tuner: 'Tuner', theory: 'Theory', settings: 'Settings', shed: 'Shed', pads: 'Pads', quiz: 'Exercises',
    midihub: 'MIDI Hub', deck: 'Synth deck', liveset: 'Live sets', practiceplan: 'Practice plan', helix: 'Helix Stadium', chart: 'Chord charts', vocal: 'Voice trainer',
    home: 'Home' };                           // 'home' is the page B9 adds
  var PILL_LABELS = { fretboard: 'Neck', tab: 'Tab', notation: 'Notation', piano: 'Piano', chords: 'Chords', theory: 'Circle', songs: 'Songs',
    jam: 'Jam', shed: 'Woodshed', metronome: 'Metronome', tuner: 'Tuner', pads: 'Pads', quiz: 'Exercises', midihub: 'Hub', deck: 'Deck',
    liveset: 'Live', practiceplan: 'Plan', helix: 'Helix', chart: 'Charts', vocal: 'Voice',
    home: 'Today' };                          // the fifth Learn pill of placements A and C (D20)
  // js/app.js:1264 (HELP_NAMES), js/lights.js:20-26 (a sentence per level)
  var HELP_NAMES = ['None', 'Tonic', 'Target', 'Colors', 'Full'];
  var HELP_TEXT = [
    'A bare keyboard: play from memory. Nothing lights up.',
    'Plain keys with the home key marked. Nothing else.',
    'Plain keys. Only the note to play now lights up, plus the answer after an Exercises question.',
    'The scale in color and the next note. No note names or finger numbers.',
    'The scale in color, note names, finger numbers and the next note.'
  ];
  // js/learn-instruments.js:5-6; the icons are the ones B8 names
  var INSTRUMENTS = [
    { id: 'piano', label: 'Piano', icon: 'keys' }, { id: 'guitar', label: 'Guitar', icon: 'guitar' },
    { id: 'bass', label: 'Bass', icon: 'guitar' }, { id: 'drums', label: 'Drums', icon: 'drum' },
    { id: 'synth', label: 'Synth', icon: 'keys' }, { id: 'voice', label: 'Voice', icon: 'mic' }, { id: 'other', label: 'Other', icon: 'note' }
  ];
  // the keyboard's state in the header chip and in the key bar. header: B6 paintStatus;
  // bar: B5a paintToggles; note: the sentences of js/midi.js:445-448, word for word.
  var LIGHTS = {
    scale: { connected: true, on: true, name: 'LUMI', text: 'On', bar: 'Scale', barShort: 'Scale', label: 'Keyboard lights: LUMI, on. Open Keyboard lights',
      note: 'LUMI Display is on: LUMI Keys BLOCK.' },
    off: { connected: true, on: false, name: 'LUMI', text: 'Off', bar: 'Off', barShort: 'Off', label: 'Keyboard lights: LUMI, off. Open Keyboard lights',
      note: 'LUMI Display is off.' },
    kbd: { connected: true, on: true, name: 'Keyboard', text: 'On', bar: 'No LUMI', barShort: 'None', label: 'Keyboard lights: keyboard, on. Open Keyboard lights',
      note: 'Choose a LUMI display output on the Piano page, under Notes and triads on the LUMI (MIDI must be connected).' },
    none: { connected: false, on: true, name: 'No keyboard', text: '', bar: 'No keyboard', barShort: 'None', label: 'Keyboard lights: no keyboard. Open Keyboard lights',
      note: 'The configured LUMI display is disconnected or unavailable; no fallback is used.' }
  };

  // js/app.js:233-278 (ICONS, Lucide, ISC): the ones a drawing uses, path for path. Plus the two
  // that B6 adds from lucide-static (D35): more = ellipsis, caret = chevron-down. Plus one that
  // overlays.html asks B7b to add, for "it failed": alert = circle-alert. Its path was written
  // from memory, not copied from lucide-static: compare it before B7b adds it.
  var ICONS = {
    play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" fill="currentColor"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>',
    restart: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    rotate: '<path d="M12 5H6a2 2 0 0 0-2 2v3"/><path d="m9 8 3-3-3-3"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>',
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    updown: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    left: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    sliders: '<path d="M10 8h4"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M17 16h4"/><path d="M19 12V3"/><path d="M19 21v-5"/><path d="M3 14h4"/><path d="M5 10V3"/><path d="M5 21v-7"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    learn: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    guitar: '<path d="m11.9 12.1 4.514-4.514"/><path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z"/><path d="m6 16 2 2"/><path d="M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z"/>',
    keys: '<path d="M10 13v4"/><path d="M14 13v4"/><path d="M18 13v4"/><path d="M2 13h20"/><path d="M22 11.5A3.5 3.5 0 0018.5 8a3.52 3.52 0 01-3.173-2A7 7 0 002 9v10a2 2 0 002 2h16a2 2 0 002-2z"/><path d="M6 13v4"/>',
    note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    lights: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    metronome: '<path d="M12 11.4V9.1"/><path d="m12 17 6.59-6.59"/><path d="m15.05 5.7-.218-.691a3 3 0 0 0-5.663 0L4.418 19.695A1 1 0 0 0 5.37 21h13.253a1 1 0 0 0 .951-1.31L18.45 16.2"/><circle cx="20" cy="9" r="2"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    gear: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
    flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    ear: '<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>',
    mic: '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
    drum: '<path d="m2 2 8 8"/><path d="m22 2-8 8"/><ellipse cx="12" cy="9" rx="10" ry="5"/><path d="M7 13.4v7.9"/><path d="M12 14v8"/><path d="M17 13.4v7.9"/><path d="M2 9v8a10 5 0 0 0 20 0V9"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    caret: '<path d="m6 9 6 6 6-6"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>'
  };
  function icon(name, size, cls) {
    var d = ICONS[name];
    if (!d) return '';
    var s = size || 18;
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  }
  // index.html:22-35, path for path. One change: "LAB" takes currentColor, and mock.css
  // colours its group with --sl-accent (the app's file names the old variable --accent there).
  function wordmark() {
    return '<svg class="wordmark" viewBox="0 0 399 106" role="img" aria-label="soundLAB">' +
      '<path d="M40.5 46 C 40.5 39.5 30 36.5 26 36.5 C 14.5 36.5 11.5 40 11.5 47 C 11.5 54 21 57.5 26 61.5 C 31 65.5 40.5 69 40.5 75.5 C 40.5 82.5 40.5 86 40.5 89.5 C 40.5 96.5 30 99.5 26 99.5 C 22 99.5 11.5 96 11.5 90" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M71 36 H81 A15 15 0 0 1 96 51 V85 A15 15 0 0 1 81 100 H71 A15 15 0 0 1 56 85 V51 A15 15 0 0 1 71 36 Z M75 47 H77 A8 8 0 0 1 85 55 V81 A8 8 0 0 1 77 89 H75 A8 8 0 0 1 67 81 V55 A8 8 0 0 1 75 47 Z" fill="currentColor" fill-rule="evenodd"/>' +
      '<path d="M111.5 36 V80 A14.5 14.5 0 0 0 140.5 80 V36" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="butt" stroke-linejoin="round"/>' +
      '<path d="M161.5 94.5 V56 A14.5 14.5 0 0 1 190.5 56 V94.5" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M221 36 H231 A15 15 0 0 1 246 51 V85 A15 15 0 0 1 231 100 H221 A15 15 0 0 1 206 85 V51 A15 15 0 0 1 221 36 Z M225 47 H227 A8 8 0 0 1 235 55 V81 A8 8 0 0 1 227 89 H225 A8 8 0 0 1 217 81 V55 A8 8 0 0 1 225 47 Z" fill="currentColor" fill-rule="evenodd"/>' +
      '<path d="M235 12 H246 V94.5 A5.5 5.5 0 0 1 235 94.5 Z" fill="currentColor"/>' +
      '<g class="wm-lab">' +
      '<path d="M264 12 H275 V89 H288.5 A5.5 5.5 0 0 1 288.5 100 H269.5 A5.5 5.5 0 0 1 264 94.5 Z" fill="currentColor"/>' +
      '<path d="M309.5 94.5 V33 A15.5 15.5 0 0 1 340.5 33 V94.5" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M309.5 60 H340.5 V71 H309.5 Z" fill="currentColor"/>' +
      '<path d="M356 12 H372 A21 21 0 0 1 372 54 A21 23 0 0 1 372 100 H361.5 A5.5 5.5 0 0 1 356 94.5 Z M367 23 H372 A10 10 0 0 1 372 43 H367 Z M367 65 H372 A10 12 0 0 1 372 89 H367 Z" fill="currentColor" fill-rule="evenodd"/>' +
      '</g></svg>';
  }

  // ---- the key's name, in three lengths; the lock's sentence, in three forms (D17) ----
  //   full   "A Natural Minor (Aeolian)"   the scale's own name (the Scale select, the Piano page's title)
  //   plain  "A Natural Minor"             without the words in brackets: how the app names the key today
  //                                        (js/app.js:1604-1605) and what the lock's sentence holds
  //   short  "A Minor"                     the short-name table, where the plain one does not fit
  function scaleName(scaleId, form) {
    var sc = SCALES[scaleId] || SCALES.minorPent, plain = sc.name.replace(/\s*\(.*\)$/, '');
    return form === 'full' ? sc.name : form === 'short' ? (SCALE_SHORT[scaleId] || plain) : plain;
  }
  function keyName(rootPc, scaleId, form) { return ROOTS[((rootPc % 12) + 12) % 12] + ' ' + scaleName(scaleId, form || 'plain'); }
  function lockSentence(on, rootPc, scaleId, form) {
    if (!on) return form === 'full' ? 'OFF · every note sounds' : 'OFF';
    if (form === 'full') return 'ON · only ' + keyName(rootPc, scaleId, 'plain') + ' notes sound';
    return 'ON · ' + keyName(rootPc, scaleId, form === 'short' ? 'short' : 'plain') + ' only';
  }
  function lockMessage(on, rootPc, scaleId) {       // the message a flip of the lock shows (D16)
    return on ? 'Scale lock on: only ' + keyName(rootPc, scaleId, 'plain') + ' notes sound' : 'Scale lock off: every note sounds';
  }
  // the notes of a key, as Theory.scaleInfo gives them (js/theory.js:206-221)
  function scaleNotes(rootPc, scaleId) {
    var sc = SCALES[scaleId] || SCALES.minorPent, flat = flatKey(rootPc);
    return sc.steps.map(function (s) { var pc = (rootPc + s) % 12; return { pc: pc, step: s, name: pcName(pc, flat), color: COLORS.INTERVALS[s], label: COLORS.INTERVAL_LABELS[s] }; });
  }
  // which ink reads on a note colour: mock-hero.js owns the rule (SLHero.inkOn, with the two
  // inks of css/tokens.css); this is its name for a drawing that loads both files
  function inkOn(hex) { return window.SLHero ? window.SLHero.inkOn(hex) : 'dark'; }

  // ---- the shell's state: defaults, then what the caller gives, then the URL --------
  function parseKey(text, o) {
    var m = /^([A-Ga-g][b#]?|\d{1,2})-([A-Za-z]+)$/.exec(text || '');
    if (!m) return;
    var r = /^\d/.test(m[1]) ? parseInt(m[1], 10) : -1, name = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    if (r < 0) r = FLAT.indexOf(name); if (r < 0) r = SHARP.indexOf(name);
    if (r >= 0 && r < 12) o.root = r;
    if (SCALES[m[2]]) o.scale = m[2];
  }
  function shellOpts(given) {
    var o = { app: 'main', page: null, nav: 'b', root: 9, scale: 'dorian', bpm: 120, lock: true, lights: 'scale', help: 3, colors: 'interval',
      inst: 'piano', pop: '', scrolled: false, goal: false, beta: false, met: false, sheet: '', sheetBody: '', bar: '', hint: '', labels: '' };
    var fixed = (given && given.fixed) || [], k;
    for (k in given || {}) if (Object.prototype.hasOwnProperty.call(given, k) && k !== 'fixed') o[k] = given[k];
    var url = function (name) { return fixed.indexOf(name) === -1 && Object.prototype.hasOwnProperty.call(P, name); };
    if (url('app')) o.app = P.app === 'gear' ? 'gear' : 'main';
    if (url('page')) o.page = P.page;
    if (url('nav') && /^[abc]$/.test(P.nav)) o.nav = P.nav;
    if (url('key')) parseKey(P.key, o);
    if (url('bpm')) o.bpm = Math.max(30, Math.min(280, parseInt(P.bpm, 10) || 120));
    if (url('lock')) o.lock = P.lock !== '0';
    if (url('lights') && LIGHTS[P.lights]) o.lights = P.lights;
    if (url('help') && /^[0-4]$/.test(P.help)) o.help = parseInt(P.help, 10);
    if (url('colors')) o.colors = P.colors === 'note' ? 'note' : 'interval';
    if (url('inst')) o.inst = P.inst;
    if (url('pop')) o.pop = P.pop;
    if (url('sheet')) o.sheet = P.sheet;
    if (url('bar')) o.bar = P.bar;
    if (url('hint')) o.hint = P.hint;
    if (url('labels')) o.labels = P.labels;
    ['scrolled', 'goal', 'beta', 'met'].forEach(function (name) { if (url(name)) o[name] = P[name] === '1'; });
    if (!APPS[o.app]) o.app = 'main';
    if (!o.page) o.page = o.app === 'gear' ? 'deck' : 'piano';
    if (!INSTRUMENTS.some(function (i) { return i.id === o.inst; })) o.inst = 'piano';
    return o;
  }
  // the tabs of an app; placements A and C put the home into Learn as the pill "Today" (D20)
  function groupsOf(o) {
    return APPS[o.app].groups.map(function (g) {
      var pages = g.pages.slice();
      if (o.app === 'main' && g.id === 'gtheory' && (o.nav === 'a' || o.nav === 'c')) pages.unshift('home');
      return { id: g.id, label: g.label, icon: g.icon, pages: pages };
    });
  }
  function groupOf(o) {
    var gs = groupsOf(o), i;
    for (i = 0; i < gs.length; i++) if (gs[i].pages.indexOf(o.page) !== -1) return gs[i];
    return null;
  }
  function go(changes) { return ' data-go="' + esc(changes) + '"'; }

  // ---- THE SHELL (Appendix A): the one function every drawing gets its shell from -----
  function shell(given) {
    var o = shellOpts(given), gear = o.app === 'gear', app = APPS[o.app], other = APPS[app.other];
    var cur = groupOf(o), key = keyName(o.root, o.scale, 'plain'), L = LIGHTS[o.lights];
    var inst = INSTRUMENTS.filter(function (i) { return i.id === o.inst; })[0];
    var tag = gear ? 'gear' : o.beta ? 'beta' : '';
    var open = function (name) { return o.pop === name ? 'true' : 'false'; };
    var toggle = function (name) { return go('pop=' + (o.pop === name ? '' : name) + '&toast='); };

    // tabs, written twice as today (js/app.js populateNav): the top bar's and the bottom bar's
    var tabs = groupsOf(o).map(function (g) {
      var on = cur && cur.id === g.id;
      return '<button type="button" class="tabbar-btn' + (on ? ' active' : '') + '" data-group="' + g.id + '"' + (on ? ' aria-current="page"' : '') +
        go('page=' + g.pages[g.id === 'gtheory' && g.pages[0] === 'home' ? 1 : 0] + '&pop=&toast=') + '>' + icon(g.icon, 20) + '<span>' + g.label + '</span>' +
        (g.id === 'gtheory' ? '<span class="sl-goal-sr">, today’s goal is open</span>' : '') + '</button>';
    }).join('');
    // pills: the pages of the open tab; none on a page outside the groups (the home in placement B, Settings)
    var pills = !cur || cur.pages.length < 2 ? '' : cur.pages.map(function (p) {
      var on = p === o.page;
      return '<button type="button" class="subtab' + (on ? ' active' : '') + '" data-page="' + p + '"' + (on ? ' aria-current="page"' : '') +
        go('page=' + p + '&pop=&toast=') + '>' + (PILL_LABELS[p] || PAGE_LABELS[p] || p) + '</button>';
    }).join('');

    var h = '';
    h += '<header class="topbar sl-skin' + (o.scrolled ? ' bar-hidden' : '') + (o.nav === 'c' ? ' mk-pills-inline' : '') + '">';
    h += '<a class="brand" id="home-link" href="' + app.url + '" aria-label="' + app.name + ', home"' + go('page=' + (gear ? 'deck' : 'home') + '&pop=&toast=') + '>' +
      wordmark() + (tag ? '<span class="tag">' + tag + '</span>' : '') + '</a>';
    h += '<nav class="tabbar tabbar-top" id="tabbar" aria-label="Sections">' + tabs + '</nav>';
    h += '<div class="tb-tools" id="tabs">';
    if (!gear) {
      h += '<button type="button" id="inst-btn" class="sl-kchip" aria-haspopup="dialog" aria-expanded="' + (o.sheet === 'instrument') + '" aria-controls="sheet-instrument" ' +
        'aria-label="Practising: ' + inst.label + '. Change instrument">' + icon(inst.icon, 18) +
        '<span class="sl-kchip-stack"><span class="sl-kchip-label">Practising</span><span class="sl-kchip-value">' + inst.label + '</span></span></button>';
    } else {
      h += '<button type="button" id="cx-toggle" class="sl-kchip" aria-expanded="' + (o.bar === 'open') + '" aria-controls="ctxbar" ' +
        'aria-label="Key: ' + key + '. Show key, tempo, Scale lock, lights and Help"' + go('bar=' + (o.bar === 'open' ? '' : 'open') + '&pop=') + '>' +
        '<span class="sl-kchip-value">' + key + '</span>' + icon('caret', 16, 'sl-kchip-caret') + '</button>';
    }
    h += '<button type="button" class="btn sm icon-btn" id="tb-more-btn" aria-label="More" aria-expanded="' + open('more') + '" aria-controls="tb-more"' + toggle('more') + '>' + icon('more', 20) + '</button>';
    h += '<div id="tb-more" class="sl-pop">';
    h += '<button type="button" class="sl-status' + (L.connected ? ' is-connected' : '') + '" id="lights-btn" aria-haspopup="dialog" aria-expanded="' + (o.sheet === 'lights') + '" ' +
      'aria-controls="sheet-lights" aria-label="' + L.label + '"><span class="sl-status-dot"></span><span class="tb-word">Keyboard lights</span>' +
      '<span class="sl-status-name">' + L.name + '</span><span class="sl-status-text">' + L.text + '</span></button>';
    h += '<button type="button" class="btn sm icon-btn" id="help-btn" aria-label="Help for this page" title="What is this page?">' + icon('help', 20) + '<span class="tb-word">Help for this page</span></button>';
    h += '<button type="button" class="btn sm icon-btn" id="settings-btn" aria-label="' + (gear ? 'Settings, in soundLAB' : 'Settings') + '"' + (gear ? '' : go('page=settings&pop=&toast=')) + '>' +
      icon('gear', 20) + '<span class="tb-word">' + (gear ? 'Settings (in soundLAB)' : 'Settings') + '</span></button>';
    h += '<a class="btn sm" id="app-switch" href="' + other.url + '" title="Open ' + other.name + '" aria-label="Open ' + other.name + '"' + go('app=' + app.other + '&page=&pop=&toast=&bar=') + '>' +
      icon(gear ? 'learn' : 'sliders', 20, 'tb-ic') + (gear ? 'soundLAB' : 'Gear') + '</a>';
    h += '</div>';
    h += '<button type="button" class="btn sm icon-btn' + (o.met ? ' on' : '') + '" id="met-btn" aria-label="Metronome" title="Metronome" aria-haspopup="dialog" ' +
      'aria-expanded="' + (o.sheet === 'metronome') + '" aria-controls="sheet-metronome">' + icon('metronome', 20) + '</button>';
    h += '</div>';
    h += '<div class="subnav sl-skin" id="subnav"' + (pills ? '' : ' hidden') + '>' + pills + '</div>';
    h += '</header>';

    // ---- the key bar: five chips and five panels, each id once -----------------------
    var dots = '';
    for (var d = 1; d <= 4; d++) dots += '<i' + (d <= o.help ? ' class="on"' : '') + '></i>';
    h += '<div id="ctxbar" class="sl-keybar sl-skin" role="region" aria-label="Global key, scale, tempo and sound settings"' + (gear && o.bar !== 'open' ? ' hidden' : '') + '>';
    h += '<button type="button" id="cx-key" class="sl-kchip" aria-expanded="' + open('key') + '" aria-controls="cx-pop-key" aria-label="Key: ' + key + '. Change key, scale and mode"' + toggle('key') + '>' +
      '<span class="sl-kchip-label">Key</span><span class="sl-kchip-value">' + key + '</span>' + icon('caret', 16, 'sl-kchip-caret') + '</button>';
    h += '<button type="button" id="cx-tempo" class="sl-kchip" aria-expanded="' + open('tempo') + '" aria-controls="cx-pop-tempo" aria-label="Tempo: ' + o.bpm + ' BPM. Change tempo"' + toggle('tempo') + '>' +
      '<span class="sl-kchip-stack is-centred"><span class="sl-kchip-value">' + o.bpm + '</span><span class="sl-kchip-label">BPM</span></span></button>';
    h += '<div id="cx-pop-tempo" class="sl-pop sl-stepper" role="group" aria-label="Tempo">' +
      '<span class="sl-pop-title">Tempo</span>' +
      '<button type="button" id="cx-met" aria-pressed="' + o.met + '" title="Start / stop the metronome (works on every tab)" aria-label="' + (o.met ? 'Stop the click' : 'Start the click') + '"' + go('met=' + (o.met ? '0' : '1')) + '>' +
        icon(o.met ? 'stop' : 'play', 16) + '<span class="cx-met-word">' + (o.met ? 'Stop the click' : 'Start the click') + '</span></button>' +
      '<button type="button" id="cx-bpm-dec" aria-label="Slower by 1 BPM"' + go('bpm=' + Math.max(30, o.bpm - 1)) + '>' + icon('minus', 18) + '</button>' +
      '<input id="cx-bpm" type="number" min="30" max="280" step="1" value="' + o.bpm + '" inputmode="numeric" aria-label="Tempo, beats per minute">' +
      '<span class="sl-stepper-unit" aria-hidden="true">BPM</span>' +
      '<button type="button" id="cx-bpm-inc" aria-label="Faster by 1 BPM"' + go('bpm=' + Math.min(280, o.bpm + 1)) + '>' + icon('plus', 18) + '</button>' +
      '</div>';
    h += '<button type="button" id="cx-lockchip" class="sl-kchip' + (o.lock ? ' is-on' : '') + '" aria-expanded="' + open('lock') + '" aria-controls="cx-pop-lock" ' +
      'aria-label="Scale lock: ' + (o.lock ? 'on, only ' + key + ' notes sound' : 'off, every note sounds') + '. Change"' + toggle('lock') + '>' +
      icon('lock', 16) + '<span class="sl-kchip-value">' + (o.lock ? 'On' : 'Off') + '</span></button>';
    h += '<div id="cx-pop-lock" class="sl-pop' + (o.lock ? ' is-on' : '') + '">' +
      '<button type="button" id="cx-lock" class="sl-switch" aria-label="Scale lock" aria-pressed="' + o.lock + '" aria-describedby="cx-lockhint"' + go('lock=' + (o.lock ? '0' : '1') + '&toast=lock') + '>' +
        '<span class="sl-switch-track"></span><span class="sl-switch-label">Scale lock</span></button>' +
      '<span id="cx-lockhint">' + lockSentence(o.lock, o.root, o.scale, 'full') + '</span>' +
      '</div>';
    h += '<button type="button" id="cx-lights" class="sl-kchip" aria-expanded="' + open('lights') + '" aria-controls="cx-pop-lights" aria-label="LUMI lights: ' + L.bar + '. Change"' + toggle('lights') + '>' +
      '<span class="sl-kchip-label">LUMI lights</span>' + icon('lights', 16) + '<span class="sl-kchip-value" data-long="' + L.bar + '" data-short="' + L.barShort + '">' + L.bar + '</span>' + icon('caret', 16, 'sl-kchip-caret') + '</button>';
    h += '<button type="button" id="cx-help" class="sl-kchip" aria-expanded="' + open('help') + '" aria-controls="cx-pop-help" ' +
      'aria-label="Help level: ' + HELP_NAMES[o.help] + ', ' + o.help + ' of 4. Change"' + toggle('help') + '>' +
      '<span class="sl-kchip-label">Help</span><span class="sl-dots" aria-hidden="true">' + dots + '</span><span class="sl-kchip-value">' + HELP_NAMES[o.help] + '</span>' + icon('caret', 16, 'sl-kchip-caret') + '</button>';

    // the Key panel: the three native selects of today's bar
    var rootOpts = ROOTS.map(function (n, pc) { return '<option value="' + pc + '"' + (pc === o.root ? ' selected' : '') + '>' + n + '</option>'; }).join('');
    var scaleOpts = SCALE_GROUPS.map(function (g) {
      return '<optgroup label="' + g.label + '">' + g.ids.map(function (id) { return '<option value="' + id + '"' + (id === o.scale ? ' selected' : '') + '>' + SCALES[id].name + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    var notes = scaleNotes(o.root, o.scale), seven = notes.length === 7;
    var modeOpts = notes.map(function (n, i) { return '<option value="' + (i + 1) + '"' + (i === 0 ? ' selected' : '') + '>' + (i + 1) + ' · ' + n.name + '</option>'; }).join('');
    h += '<div id="cx-pop-key" class="sl-pop"' + (o.pop === 'key' ? '' : ' hidden') + '>' +
      '<label class="field">Key<select id="cx-root">' + rootOpts + '</select></label>' +
      '<label class="field cx-scale">Scale<select id="cx-scale">' + scaleOpts + '</select></label>' +
      '<label class="field" id="cx-mode-wrap"' + (seven ? '' : ' hidden') + '>Mode<select id="cx-mode">' + (seven ? modeOpts : '') + '</select></label>' +
      '</div>';
    h += '<div id="cx-pop-lights" class="sl-pop"' + (o.pop === 'lights' ? '' : ' hidden') + '>' +
      '<button type="button" id="cx-led" class="sl-switch" aria-pressed="' + L.on + '" title="Show the selected scale and practice targets on the configured LUMI; independent of Scale Lock"' +
        go('lights=' + (L.on ? 'off' : 'scale')) + '>' +
        '<span class="sl-switch-track"></span><span class="sl-switch-label">LUMI lights</span><span class="sl-switch-state">' + (L.on ? 'On' : 'Off') + '</span></button>' +
      '<p id="cx-tnote" role="status">' + L.note + '</p>' +
      '<button type="button" class="btn" id="cx-open-lights">Keyboard lights</button>' +
      '</div>';
    var levels = '';
    for (var lv = 4; lv >= 0; lv--) {
      var ld = '';
      for (var j = 1; j <= 4; j++) ld += '<i' + (j <= lv ? ' class="on"' : '') + '></i>';
      levels += '<button type="button" data-cxhelp="' + lv + '"' + (lv === o.help ? ' class="active"' : '') + ' aria-pressed="' + (lv === o.help) + '"' + go('help=' + lv) + '>' +
        '<span class="cx-level-name">' + HELP_NAMES[lv] + '<span class="sl-dots" aria-hidden="true">' + ld + '</span></span>' +
        '<span class="cx-level-text">' + HELP_TEXT[lv] + '</span></button>';
    }
    h += '<div id="cx-pop-help" class="sl-pop"' + (o.pop === 'help' ? '' : ' hidden') + '>' +
      '<span class="sl-pop-title" id="cx-help-t">Help level</span>' +
      '<div class="seg cx-levels" role="group" aria-labelledby="cx-help-t">' + levels + '</div>' +
      '<span class="sl-pop-title" id="cx-colors-t">Color notes by</span>' +
      '<div class="seg cx-colors" role="group" aria-labelledby="cx-colors-t">' +
        '<button type="button" data-cxcolormode="interval"' + (o.colors === 'interval' ? ' class="active"' : '') + ' aria-pressed="' + (o.colors === 'interval') + '"' + go('colors=interval') + '>Degree</button>' +
        '<button type="button" data-cxcolormode="note"' + (o.colors === 'note' ? ' class="active"' : '') + ' aria-pressed="' + (o.colors === 'note') + '"' + go('colors=note') + '>Note name</button>' +
      '</div></div>';
    h += '</div>';

    h += '<nav class="tabbar tabbar-bottom sl-skin" id="tabbar-m" aria-label="Sections">' + tabs + '</nav>';

    // the sheets (B7a, B8): closed unless opts.sheet names one; opts.sheetBody is its content
    var sheets = [['metronome', 'Metronome', 'Close the metronome'], ['lights', 'Keyboard lights', 'Close']];
    if (!gear) sheets.push(['instrument', 'Instrument', 'Close']);
    sheets.forEach(function (s) {
      var on = o.sheet === s[0];
      h += '<div class="sheet" id="sheet-' + s[0] + '"' + (on ? '' : ' hidden') + '><div class="sheet-card sl-skin" role="dialog" aria-modal="true" aria-labelledby="sheet-' + s[0] + '-t">' +
        '<div class="sheet-head"><h2 id="sheet-' + s[0] + '-t">' + s[1] + '</h2>' +
        (s[0] === 'instrument' ? '' : '<button type="button" class="btn sm icon-btn" data-sheet-help="' + s[0] + '" aria-label="Help for ' + (s[0] === 'metronome' ? 'the metronome' : 'keyboard lights') + '" title="How it works">' + icon('help', 20) + '</button>') +
        '<button type="button" class="btn sm icon-btn" data-sheet-close aria-label="' + s[2] + '" title="Close (Esc)"' + go('sheet=') + '>' + icon('close', 20) + '</button></div>' +
        '<section class="sheet-body" id="panel-' + s[0] + '">' + (on ? o.sheetBody || '' : '') + '</section></div></div>';
    });
    return h;
  }

  // ---- a quiet page body: a headline and a keyboard, so that the shell is seen in place ----
  // The keyboard is mock-hero.js's (SLHero.keyboard), the same drawing every other picture
  // uses: it shows the scale of the key bar's key at the bar's Help level and colour mode.
  // A drawing that shows a quiet page loads mock-hero.js after this file.
  // Its range is the Piano page's (pages.html): C2 to C6 above 900 px, as the page draws today
  // (js/piano.js), C3 to C6 from 641 px, and the LUMI's two octaves, C3 to C5, on a phone.
  function quietKeys(o) {
    var H = window.SLHero, w = window.innerWidth, wide = w > 900, mid = w > 640;
    if (!H) return '';
    var m = H.sample({ root: o.root, steps: (SCALES[o.scale] || SCALES.minorPent).steps, help: o.help, mode: o.colors,
      intervals: COLORS.INTERVALS, notes: COLORS.NOTES });
    return '<div class="sl-hero">' + H.keyboard(m, { from: wide ? 36 : 48, octaves: wide ? 4 : mid ? 3 : 2,
      label: 'A keyboard that shows ' + keyName(o.root, o.scale, 'plain') }) + '</div>';
  }
  function quietPage(given) {
    var o = shellOpts(given), g = groupOf(o);
    var title = o.page === 'piano' ? keyName(o.root, o.scale, 'full') : (PAGE_LABELS[o.page] || o.page);      // js/piano.js:637
    // the folds a page will have: Piano's (B12), the five groups of Settings (D27)
    var names = o.page === 'settings' ? ['Look', 'Sound', 'Keyboard and lights', 'Hands-free', 'Data and about']
      : o.page === 'piano' ? ['Chords and arpeggio', 'Practice a scale', 'Computer keys', 'Notes and triads on the LUMI'] : [];
    var folds = names.map(function (name) { return '<details class="sl-fold"><summary>' + name + '</summary></details>'; }).join('');
    return '<div class="mk-quiet' + (o.scrolled ? ' mk-quiet-tall' : '') + '">' +
      '<div class="mk-quiet-head"><h1>' + title + '</h1></div>' +      // one headline and no line over it, as pages.html draws a page (D28)
      // the Voice page (soundLAB 2.1.0) has a pitch graph, not a keyboard, and is not drawn yet
      (o.page === 'vocal' ? '<p class="sl-hint">This page is not drawn yet. It gets the new look in a step of its own.</p>' : g ? quietKeys(o) : '') +
      '<div class="mk-quiet-folds">' + folds + '</div></div>';
  }

  // ---- one message of the stack (D25): an icon when it is bad news, its words, then ONE group
  // of buttons. t = a text, or { id, text, bad, icon, acts: [[words, 'primary' | ''], …] }
  function toast(t) {
    if (typeof t === 'string') t = { text: t };
    var acts = t.acts || (t.action ? [[t.action, '']] : null);
    return '<div class="sl-toast' + (t.bad ? ' sl-toast-bad' : '') + (acts ? ' sl-toast-action' : '') + '"' + (t.id ? ' id="' + esc(t.id) + '"' : '') + ' role="status">' +
      (t.icon ? icon(t.icon, 20) : t.bad ? icon('alert', 20) : '') + '<span>' + esc(t.text) + '</span>' +
      (acts ? '<span class="sl-toast-acts">' + acts.map(function (a) { return '<button type="button" class="btn sm' + (a[1] ? ' ' + a[1] : '') + '">' + esc(a[0]) + '</button>'; }).join('') + '</span>' : '') +
      '</div>';
  }

  // ---- the whole page: shell, <main>, footer, message stack ----------------------------
  function page(def) {
    def = def || {};
    var o = shellOpts(def.shell), toasts = (def.toasts || []).slice(), w = parseInt(P.w, 10) || 0;
    if (q('toast', '') === 'lock') toasts.push({ id: 'app-toast', text: lockMessage(o.lock, o.root, o.scale) });
    if (o.app === 'gear') root.setAttribute('data-app', 'gear');
    root.classList.toggle('goal-due', !!o.goal);
    root.classList.toggle('bar-hidden', !!o.scrolled);
    root.classList.toggle('ctx-open', !!o.pop && o.pop !== 'more');
    var note = '';
    if (single && w && tierOf(w) !== tierOf(window.innerWidth)) {
      note = '<p class="mk-note">This window is ' + window.innerWidth + ' px wide, so this is the ' + tierOf(window.innerWidth) + ' layout, not the ' + w +
        ' px picture. <a href="' + esc(href({ only: q('only', '') })) + '">All sizes</a></p>';
    }
    var stack = toasts.map(toast).join('');
    document.body.innerHTML = note + shell(def.shell) +
      '<main><section class="panel active sl-skin" id="panel-' + esc(o.page) + '">' + (def.main == null ? quietPage(def.shell) : def.main) + '</section></main>' +
      (def.foot === false ? '' : '<footer class="foot">' + (o.app === 'gear' ? 'soundLAB Gear alpha' : 'soundLAB alpha') + ' — runs entirely in your browser · v2.1.0</footer>') +
      '<div id="sl-float" class="sl-skin"><div id="sl-toasts" class="sl-toasts">' + stack + '</div></div>' + (def.after || '');
    document.title = (def.title || document.title || 'soundLAB 2.0 drawing');
    settle(def.shell);
    if (o.scrolled) {      // the header has slid away: the page is scrolled until its headline has passed under the bar
      var hd = document.querySelector('.topbar'), h1 = document.querySelector('main h1');
      window.scrollTo(0, (hd ? hd.offsetHeight : 0) + (h1 ? h1.offsetHeight + 56 : 96));
    }
    if (!page.wired) {
      page.wired = true;
      var again = function () { settle(); };
      window.addEventListener('resize', again);
      window.addEventListener('load', again);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(again);      // the widths change when the fonts arrive
    }
  }

  // ---- after the markup is in the page: three jobs the app has too (B5a) -----------------
  function settle(given) {
    if (given) settle.given = given;
    var bar = document.getElementById('ctxbar'), head = document.querySelector('.topbar');
    var o = shellOpts(settle.given), tier = tierOf(window.innerWidth), phone = tier === 'phone';
    // (drawing-only) placement C of D20: the pills share the header's row only while the tools
    // still fit beside them; where they do not, the pills take their own row, as in placement A
    if (head && o.nav === 'c') {
      var brand = head.querySelector('.brand'), tools = head.querySelector('.tb-tools');
      head.classList.add('mk-pills-inline');
      var wraps = tools.offsetTop > brand.offsetTop + brand.offsetHeight / 2;
      head.classList.toggle('mk-pills-inline', !wraps);
      head.setAttribute('data-pills', wraps || tier !== 'desktop' ? 'own-row' : 'in-the-header-row');
    }
    // 0. Gear's key button (#cx-toggle, D14) takes the longest form of the key's name that leaves
    //    the header in one row, as the key bar's Key chip does (D17): the plain name, the short
    //    name, the short name without the caret (class is-tight). Above 900 px the plain name
    //    always fits. The button's aria-label keeps the whole name. data-fit names what was
    //    chosen, and says CUT if even the last form is cut. (B5a: paintKeyChip.)
    var tg = document.getElementById('cx-toggle'), tgVal = tg && tg.querySelector('.sl-kchip-value');
    if (tgVal) {
      var forms = [['plain', false], ['short', false], ['short', true]], f;
      for (f = 0; f < forms.length; f++) {
        tgVal.textContent = keyName(o.root, o.scale, forms[f][0]);
        tg.classList.toggle('is-tight', forms[f][1]);
        if (tier === 'desktop' || tgVal.scrollWidth <= tgVal.clientWidth + 1) break;
      }
      f = Math.min(f, forms.length - 1);
      tg.setAttribute('data-fit', 'key-' + forms[f][0] + (forms[f][1] ? ' tight' : '') + (tgVal.scrollWidth > tgVal.clientWidth + 1 ? ' CUT' : ''));
    }
    // 1. the header's height, for the key bar that sticks under it (--mk-topbar-h)
    if (head) root.style.setProperty('--mk-topbar-h', (head.classList.contains('bar-hidden') ? 0 : head.offsetHeight) + 'px');
    if (!bar) return;
    // 2. the tier's panels: Tempo, Scale lock and More are panels at 640 px and below only,
    //    and the hidden attribute says whether each is shown (D16: "hidden is the hidden attribute")
    [['cx-pop-tempo', 'tempo'], ['cx-pop-lock', 'lock'], ['tb-more', 'more']].forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (el) el.hidden = phone && o.pop !== p[1];
    });
    // 3. what fits: labels first, then the lock's sentence in its longest form, then the key's name
    var keyVal = bar.querySelector('#cx-key .sl-kchip-value'), hint = document.getElementById('cx-lockhint');
    var lightsVal = bar.querySelector('#cx-lights .sl-kchip-value');
    var steps;
    if (phone) steps = [{ key: 'plain', hint: 'full' }, { key: 'short', hint: 'full' }];
    else if (tier === 'tablet') steps = [{ labels: 1, key: 'full', hint: 'full' }, { labels: 1, key: 'plain', hint: 'full' }, { key: 'plain', hint: 'full' },
      { key: 'plain', hint: 'full', tight: 1 }, { key: 'short', hint: 'full', tight: 1 }];      // the sentence has its own row: always in full
    else steps = [{ labels: 1, key: 'full', hint: 'full' }, { labels: 1, key: 'plain', hint: 'full' }, { key: 'plain', hint: 'full' },
      { key: 'plain', hint: 'mid' }, { key: 'plain', hint: 'short' }, { key: 'short', hint: 'short' }, { key: 'short', hint: 'short', tight: 1 },
      { key: 'short', hint: 'short', tight: 2 }];
    if (o.labels === '0') steps = steps.filter(function (s) { return !s.labels; });
    if (o.labels === '1') steps = steps.filter(function (s) { return s.labels; }).concat(steps.filter(function (s) { return !s.labels; }));
    if (o.hint && !phone) {
      var forced = steps.filter(function (s) { return s.hint === o.hint; });
      if (forced.length) steps = forced;
    }
    // "fits" = nothing reaches past the bar's own gutter (a row that only fills the gutter does
    // not scroll, so scrollWidth cannot tell), and on a phone the key's name is not cut
    var fits = function () {
      var limit = bar.clientWidth - (parseFloat(getComputedStyle(bar).paddingRight) || 0) + 0.5, i, el;
      for (i = 0; i < bar.children.length; i++) {
        el = bar.children[i];
        if (el.offsetParent !== bar || el.classList.contains('sl-pop') && /fixed|absolute/.test(getComputedStyle(el).position)) continue;
        if (el.offsetLeft + el.offsetWidth > limit) return false;
      }
      return !phone || !keyVal || keyVal.scrollWidth <= keyVal.clientWidth + 1;
    };
    var chosen = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      bar.classList.toggle('has-labels', !!s.labels);
      bar.classList.toggle('is-tight', !!s.tight);
      bar.classList.toggle('is-tighter', s.tight === 2);
      if (lightsVal) lightsVal.textContent = lightsVal.getAttribute(phone || s.tight ? 'data-short' : 'data-long');
      if (keyVal) keyVal.textContent = keyName(o.root, o.scale, s.key);
      if (hint) hint.textContent = lockSentence(o.lock, o.root, o.scale, phone ? 'full' : s.hint);
      if (bar.hidden || fits()) { chosen = s; break; }
    }
    bar.setAttribute('data-fit', (chosen.labels ? 'labels ' : '') + 'key-' + chosen.key + ' hint-' + chosen.hint + (chosen.tight ? (chosen.tight === 2 ? ' tighter' : ' tight') : '') + (bar.hidden || fits() ? '' : ' OVERFLOW'));
    // 4. an open panel sits under its chip above 900 px (below that it rises from the bottom, by CSS)
    var pop = bar.querySelector('#cx-pop-key:not([hidden]), #cx-pop-lights:not([hidden]), #cx-pop-help:not([hidden])');
    if (pop) {
      var chip = bar.querySelector('[aria-controls="' + pop.id + '"]');
      if (tier === 'desktop' && chip) {
        var pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
        pop.style.left = Math.max(pad, Math.min(chip.offsetLeft, bar.clientWidth - pop.offsetWidth - pad)) + 'px';
      } else pop.style.left = '';
    }
  }

  // ---- a tap that changes the state opens the same drawing with other parameters --------
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go]');
    if (!el) {
      // a tap outside closes an open panel, as in the app
      if (single && P.pop && !(e.target.closest && e.target.closest('.sl-pop, .sl-kchip, #tb-more-btn'))) location.assign(href(merged({ pop: '', toast: '' })));
      return;
    }
    e.preventDefault();
    var changes = {};
    new URLSearchParams(el.getAttribute('data-go')).forEach(function (v, k) { changes[k] = v; });
    if (!Object.prototype.hasOwnProperty.call(changes, 'toast')) changes.toast = '';
    location.assign(href(merged(changes)));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && single && (P.pop || P.sheet)) location.assign(href(merged({ pop: '', sheet: '', toast: '' })));
  });

  // ---- "Change this picture": a fold under a picture that is opened alone ----------------
  // rows = [[parameter, its words, the value it has, [[value, words], …]], …]: each row is a
  // line of chips, and a tap opens the same drawing with that one parameter changed. Under
  // the fold stands the way back to all pictures of the drawing.
  function change(rows) {
    var file = location.pathname.split('/').pop() || 'index.html';
    return '<div class="mk-change sl-skin"><details class="sl-fold"><summary>Change this picture</summary><div class="mk-change-body">' +
      rows.map(function (r) {
        return '<div class="mk-tools"><span class="mk-tools-label">' + esc(r[1]) + '</span>' + r[3].map(function (op) {
          var on = String(r[2]) === String(op[0]), to = merged({});
          to[r[0]] = op[0];
          return '<a class="chip' + (on ? ' active' : '') + '"' + (on ? ' aria-current="true"' : '') + ' href="' + esc(href(to)) + '" data-go="' + esc(r[0] + '=' + op[0]) + '">' + op[1] + '</a>';
        }).join('') + '</div>';
      }).join('') + '</div></details>' +
      '<p class="mk-back"><a href="' + esc(file) + '">All pictures of this drawing</a> · <a href="index.html">All drawings and questions</a></p></div>';
  }

  // ---- the contact view: every state at every width it needs, dark and light -------------
  // The window sizes of the drawings: the width is what matters, the height is a real device's.
  var SIZES = { 360: 740, 390: 844, 640: 900, 641: 900, 820: 1180, 1024: 640, 1280: 800 };
  var frames = [];
  function contact(def) {
    var themes = P.theme === 'light' || P.theme === 'dark' ? [P.theme] : ['dark', 'light'], only = q('only', '');
    var h = '<main class="mk-contact sl-skin">';
    h += '<header class="mk-contact-head"><p class="sl-eyebrow">' + esc(def.eyebrow || 'soundLAB 2.0 · the new look, drawn') + '</p><h1>' + esc(def.title) + '</h1>' +
      // one picture only (?only=, the way the owner's page links to a picture): no introduction, so
      // that the picture is on the first screen of a phone
      (only ? '' : (def.lead || []).map(function (p) { return '<p>' + p + '</p>'; }).join('')) +
      '<p class="sl-hint">' + (only ? 'Tap the line above a picture to open it alone at this device’s own size.'
        : 'Every picture is the real page at its real width, made smaller to fit this window. Tap the line above a picture to open it alone at this device’s own size.') + '</p>' +
      '<p class="mk-back"><a href="index.html">All drawings and questions</a></p>' +
      '<div class="mk-tools"><span class="mk-tools-label">Show</span>' +
      [['', 'Dark and light'], ['dark', 'Dark'], ['light', 'Light']].map(function (t) {
        var on = (P.theme || '') === t[0];
        return '<a class="chip' + (on ? ' active' : '') + '"' + (on ? ' aria-current="true"' : '') + ' href="' + esc(href({ theme: t[0], only: only, zoom: q('zoom', '') })) + '">' + t[1] + '</a>';
      }).join('') +
      (only ? '<a class="chip" href="' + esc(href({ theme: q('theme', ''), zoom: q('zoom', '') })) + '">All pictures</a>' : '') +
      (window.innerWidth >= 1100 ? '<span class="mk-tools-gap"></span><span class="mk-tools-label">Size</span>' +
        [['', 'Half'], ['1', 'Actual']].map(function (z) {
          var on = q('zoom', '') === z[0];
          return '<a class="chip' + (on ? ' active' : '') + '"' + (on ? ' aria-current="true"' : '') + ' href="' + esc(href({ theme: q('theme', ''), only: only, zoom: z[0] })) + '">' + z[1] + '</a>';
        }).join('') : '') +
      '</div>';
    if (!only) {      // the list of all pictures, folded: a tap jumps to one
      h += '<details class="sl-fold mk-toc"><summary>All ' + (def.groups || []).reduce(function (n, g) { return n + g.states.length; }, 0) + ' pictures of this drawing</summary><ol>' +
        (def.groups || []).map(function (g) {
          return '<li class="mk-toc-group">' + esc(g.title) + '</li>' + g.states.map(function (s) { return '<li><a href="#' + esc(s.id) + '">' + esc(s.title) + '</a></li>'; }).join('');
        }).join('') + '</ol></details>';
    }
    h += '</header>';
    (def.groups || []).forEach(function (g) {
      var states = g.states.filter(function (s) { return !only || s.id === only; });
      if (!states.length) return;
      h += '<section class="mk-group"><h2>' + esc(g.title) + '</h2>' + (g.lead && !only ? '<p>' + g.lead + '</p>' : '');
      states.forEach(function (s) {
        h += '<section class="mk-state" id="' + esc(s.id) + '"><h3><a href="' + esc(href({ theme: q('theme', ''), only: s.id })) + '">' + esc(s.title) + '</a></h3>' + (s.note ? '<p>' + s.note + '</p>' : '');
        themes.forEach(function (theme) {
          h += '<div class="mk-frames">';
          (s.widths || def.widths || [390, 1280]).forEach(function (size) {
            var w = size.length ? size[0] : size, ht = size.length ? size[1] : (s.height || SIZES[w] || 800);
            var params = { w: w, theme: theme }, k;
            if (w <= 820) params.touch = 1;
            for (k in s.params || {}) if (Object.prototype.hasOwnProperty.call(s.params, k)) params[k] = s.params[k];
            var url = href(params);
            frames.push({ id: s.id, w: w, h: ht, theme: theme, url: url });
            h += figure({ url: url, w: w, h: ht, title: s.title + ', ' + w + ' px, ' + theme, caption: '<b>' + w + ' px</b> ' + tierOf(w) + ' · ' + theme });
          });
          h += '</div>';
        });
        h += '</section>';
      });
      h += '</section>';
    });
    h += '</main>';
    document.body.innerHTML = h;
    document.title = def.title + ' · soundLAB 2.0 drawings';
    fit();
    window.addEventListener('resize', fit);
  }
  // one frame: a caption that opens the picture alone, and under it the picture, a real page in
  // an <iframe> at its real size (w x h), made smaller by fit(). f = { url, w, h, title,
  // caption (markup), cap (the largest scale of this one frame, optional) }
  function figure(f) {
    return '<figure class="mk-frame"><figcaption><a href="' + esc(f.url) + '">' + (f.caption || esc(f.title)) + '</a></figcaption>' +
      '<div class="mk-view" data-w="' + f.w + '" data-h="' + f.h + '"' + (f.cap ? ' data-cap="' + f.cap + '"' : '') + '><iframe loading="lazy" title="' + esc(f.title) +
      '" src="' + esc(f.url) + '" width="' + f.w + '" height="' + f.h + '"></iframe></div></figure>';
  }
  // every frame of the page gets the largest scale that fits the page's column: at most 1, at
  // most a half in a wide window (?zoom= sets another), at most its own data-cap
  function fit() {
    var wrap = document.querySelector('.mk-contact');
    if (!wrap) return;
    var cs = getComputedStyle(wrap), avail = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var cap = parseFloat(q('zoom', '')) || (window.innerWidth >= 1100 ? 0.5 : 1);
    Array.prototype.forEach.call(document.querySelectorAll('.mk-view'), function (v) {
      var w = +v.getAttribute('data-w'), ht = +v.getAttribute('data-h'), own = parseFloat(v.getAttribute('data-cap')) || 1, s = Math.min(cap, own, 1, avail / w);
      v.style.width = Math.floor(w * s) + 'px';
      v.style.height = Math.floor(ht * s) + 'px';
      v.firstChild.style.transform = 'scale(' + s + ')';
    });
  }

  window.Mock = {
    params: P, single: single, q: q, esc: esc, href: href, tierOf: tierOf,
    DATA: { SCALES: SCALES, SCALE_ORDER: SCALE_ORDER, SCALE_GROUPS: SCALE_GROUPS, SCALE_SHORT: SCALE_SHORT, ROOTS: ROOTS, COLORS: COLORS, APPS: APPS,
      PAGE_LABELS: PAGE_LABELS, PILL_LABELS: PILL_LABELS, HELP_NAMES: HELP_NAMES, HELP_TEXT: HELP_TEXT, INSTRUMENTS: INSTRUMENTS, LIGHTS: LIGHTS, SIZES: SIZES },
    icon: icon, wordmark: wordmark, keyName: keyName, scaleName: scaleName, lockSentence: lockSentence, lockMessage: lockMessage,
    scaleNotes: scaleNotes, pcName: pcName, inkOn: inkOn,
    shellOpts: shellOpts, shell: shell, quietPage: quietPage, page: page, settle: settle, toast: toast,
    contact: contact, frames: function () { return frames.slice(); }, change: change, figure: figure, fit: fit
  };
})();
