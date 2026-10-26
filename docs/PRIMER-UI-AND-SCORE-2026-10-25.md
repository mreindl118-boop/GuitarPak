# soundLAB primer: UI streamlining and sheet music to MIDI (2026-10-25)

Written by Claude for whoever picks up `main` next (a Claude session or null).
Read `CLAUDE.md` first; this file adds the findings behind two requests from
Matt and the order he wants them worked in. Nothing in it is implemented yet.

## Where main stands

- `main` = web 1.2.0 (`3890488`), `sw.js` CACHE `guitarlab-v126`. Decided by
  Matt on 2026-10-25 (record `tasks/20261025T0300Z-version-order-1.3-claude.md`
  on the coord branch): the **1.3 update** = the Synth tab (`feat/synth-tab`,
  `docs/SYNTH-TAB-PLAN.md`; step 1 is `a31394f`: group Synth = Deck / Live /
  Hub, the MIDI Hub left Keys) + this primer's phases, shipped as web 1.3.0
  with a sw CACHE above whatever main has then, stamped by the Synth tab
  session when Matt says go-live. null's notation-recognizer release
  (`codex/soundlab-1.1-workflow-20261023`: `js/omr/*`, `js/score-review.js`,
  plus `feat/review-to-synth`) becomes web 1.4.0. Work from this primer must
  NOT touch `APP_VERSION`, `version.json` or the sw CACHE. Every UI branch
  starts from or rebases on `feat/synth-tab`.
- Never edit the install folder `C:\Users\mrein\Creative-Workspace\GuitarPak`
  directly (the Desktop app serves it live and its launcher fast-forwards
  `main`). One worktree per task under `%TEMP%`, one PR against `main`.
- Coordination is repo files only: one `tasks/<UTC stamp>-<topic>-<owner>.md`
  record per task on `coord/cowork-20261022-claude`, one writer per record,
  exact path claims, never edit the other owner's record or files. `git fetch`
  and read the newest `tasks/*-null.md` and `tasks/*-claude.md` before editing.
- Tests before every PR: `tests/run.sh` (PC: `NODE_PATH` to a scratch
  playwright install, `SL_URL` against the server on 4573). `tests/nav.test.js`
  hard-codes the tab and pill labels; any rename updates it in the same PR.

## What Matt wants

1. A streamlined UI: no control living in two places, fewer stacked
   navigation levels, instrument content above the fold on a phone.
2. "Upload a sheet-music PDF and get MIDI in the app" (clock, key shifter,
   tab), using his own vector-OMR tool as the recognition engine.

## UI findings (1.2.0, checked at 800 px desktop and 375 px phone)

1. Three overlays hold session state: the clef dropdown (key, scale, BPM,
   time, plus the LUMI Display / Scale Lock / Intervals-Note names chips),
   the Lights & help sheet (help level, key lights, "Color notes by"), and
   the Metronome sheet. "Color notes by Interval/Note" exists in two of
   them; the Help level seg exists on the Keys page AND in the Lights sheet.
2. The phone header carries seven controls on one row (logo, Studio, help,
   gear, clef, lights, metronome). The clef (`#ctx-btn`, 44 px, bordered,
   `css/style.css` near line 417) is a different button style from its
   ghost-icon neighbours.
3. The MIDI page stacks four navigation levels: Keys tab > MIDI pill > eight
   views (Control, Player, Play, Controls, Rules, SysEx, Monitor, Learn) >
   five Synth Deck sub-tabs (Knobs, Buttons, Sounds, Scope, Map). "Control"
   sits beside "Controls", "Play" beside "Player". The Synth tab plan on
   `feat/synth-tab` is the answer to this one; see C1.
4. "Practice" names five things: the Practice space, the Practice tab group
   (Woodshed, Trainer, Tuner), the Practice plan pill under Learn, LUMI
   practice under Keys, and the Practice progress card in the Woodshed. The
   Learn tab's home page is called Exercises.
5. Three instrument pickers: `js/learn-instruments.js` (Exercises home,
   store `learn.instrument`), `js/practice-progress-ui.js` (Progress tab,
   `data-pgu="instrument"`), and the Woodshed's progress card.
6. Four MIDI-file entry points with four outcomes: Songs (`#sg-file`, tab),
   MIDI Hub Player (`#mh-plfile`, synth playback), Woodshed (`#ws-midi`,
   graded practice), Studio (idea / track). A PDF path would be a fifth.
7. Toolbars before content: the Keys page shows five control rows
   (`#pn-assist`, Notes/Intervals/Degrees, Voice, `#pn-perf`, the practice
   strip) before the keyboard, which starts below the fold on a phone. The
   Exercises home spends its first screen on the instrument card and copy
   before the Start button and the path.
8. Audit language on primary screens: `js/learn-instruments.js` lines 46-48
   ("Earlier unassigned history remains Legacy / unassigned"),
   `js/quiz.js` line 1864 ("Consistency can decay after inactivity; it is
   not a measured skill level"), `js/woodshed.js` line 1163 ("PDFs and
   images do not contain parsed targets").

## UI work, in Matt's order

Phase A (about a day; navigation and copy only, page ids unchanged):

- A1 One vocabulary. `js/app.js` GROUPS / SPACE_LABELS / SUB_LABELS: the
  Practice tab group becomes **Train**; "LUMI practice" becomes **LUMI**
  everywhere; the Learn tab's home reads **Learn** (page id `quiz` stays).
  "Practice" is reserved for the space. Update `js/help.js` tour copy, the
  README and the label strings in `tests/nav.test.js`. Leave the Synth
  group lines in GROUPS to the Synth tab plan.
- A2 One header button style. Drop the bordered 44 px look on `#ctx-btn`
  (or give every header icon the same treatment); keep the red capture dot
  and the live key + BPM in its title.
- A3 Copy diet. Move the sentences in finding 8 into `js/help.js` TOURS or a
  `details.tips` block; the Exercises home becomes stats strip + Start +
  path, with the instrument card reduced to one line.

Phase B (two to three days; one shared sheet):

- B1 One Session panel. Merge the clef dropdown (`#ctxbar`, app.js
  setCtx / closeCtx), `#sheet-lights` (`js/lights.js`) and
  `#sheet-metronome` (`js/metronome.js`) into ONE right-side sheet with the
  sections Key & tempo / Metronome / Lights & help, opened by ONE header
  button that shows the live key and BPM and pulses on `met:beat`. The
  duplicated "Color notes by" and Help level controls exist once, in that
  sheet; the Keys page reads `App.help` and stops drawing `#pn-assist`.
  Keep `App.openSheet`, `App.ctx(on)`, `App.help.set`, the `sheet` /
  `help:level` / `lights:display` bus events and the NO_CTX page rule, so
  quiz.js's `covered()` keeps working. Suites: nav, context-global,
  display-master, lights, keys. Decided: the Studio capture dot and the
  transport button stay in the header; the panel holds key/tempo, the
  metronome and lights & help.
- B2 One instrument. One app-level instrument (keep store `learn.instrument`,
  emit an `instrument` bus event) shown as a chip in the Session panel;
  Exercises, the Woodshed card and `practice-progress-ui.js` read it and
  drop their own selects. The credit-scoping rules in
  `docs/LEARN-INSTRUMENTS.md` stay as they are.
- B3 Page toolbar pattern, Keys first. One row of primary actions; the rest
  behind a "More" disclosure. On Keys: Notes/Intervals/Degrees, Voice and
  Perform stay visible; the Play strip (scale, direction, hand, rate, pause)
  folds until Play is wanted. Acceptance: the keyboard's top edge is inside
  the first 812 px at 375 px wide with the header shown. Then apply the
  same pattern to the Woodshed's seven generator buttons.

Phase C (own branches):

- C1 The MIDI page. Finding 3 is the problem; the fix is already planned
  as the Synth tab (`feat/synth-tab`, `docs/SYNTH-TAB-PLAN.md`: the Synth
  Deck as its own top-level tab with Deck / Live / Hub pills, touch-first
  for iPad). Do not start a competing MIDI / Deck split; whoever renames
  the near-duplicate view labels ("Play" to Keys, "Controls" to CCs) does
  it inside that plan. `midihub.*` stores and the `SLMidiHub` hooks stay;
  suites midihub, midihub-player, synthdeck, synthdeck-scope.
- C2 One Open. A single "Open a score" action under Play that accepts
  .mid/.midi, .musicxml/.xml/.mxl, pasted or .txt tab, and later .pdf, then
  offers three destinations: Play on synth (`SLMidiHub.player.loadFile` /
  `loadScore`), Practice (the Woodshed's `importMidi`), Tab
  (`App.songs.fromMidi` + `load`). The four inputs in finding 6 route
  through it; the Studio keeps its own. This is where the PDF path lands.

## Sheet music to MIDI

Playback already exists on `main`: the MIDI Hub Player (1.1.0) plays
.mid / MusicXML / .mxl on the synth with tempo %, transpose and the
scale-degree key shifter; "Open as tab" goes to Songs; the Woodshed grades
MIDI. `feat/review-to-synth` adds Play on synth / Export MIDI / Open as tab
to Score review. The gap is RECOGNITION of two-staff piano scores with
chords. The in-app 1.1 recognizer (null's branch) reads ONE monophonic staff
from an image model and stays the owner of `js/omr/*`.
`tasks/20261024-piano-recognition-plan-claude.md` (coord branch) lists a
local helper as option C; Matt's own tool makes that the fastest path. This
is NEW work, separate from null's recognizer and from review-to-synth.

The engine: `C:\Users\mrein\OneDrive\Desktop\pdf-to-midi-synth` (standalone,
NOT in this repo). `omr_engine.py` (about 900 lines) reads MuseScore-style
PDFs by exact vector path geometry via PyMuPDF (`SheetMusicOMR.parse_pdf`
returns `{metadata, pages[{image_data_url}], measures, notes[{onset, dur,
midi, staff, velocity, bbox, measure}], pedals}`) with a crude OpenCV
fallback for scans; `build_midi_bytes` writes a .mid with mido; `app.py` is
a FastAPI server plus CLI; `midi_out.py` is winmm output (not needed,
soundLAB owns MIDI out). Every dependency is installed on the PC's Python
3.13. On the sample (a MuseScore 2.0.3 export): 3 pages, 77 measures, 697
notes, 56 ties merged, 17 pedal marks.

Strength: two staves WITH CHORDS from vector PDFs, which is exactly what
Matt's scores are and what the image model cannot do.

Limits, from the code: time signature hardcoded 3/4 (constructor default,
never read); key signature falls back to three flats; flags, rests and
accidentals matched by exact (w, h, vertex-count) tuples at one scale, while
only noteheads / stems / beams / dots are staff-space normalized; one voice
per staff (two voices double-advance the beat cursor); ties only within a
page; pedal only whole-measure; no repeats or key changes; the scan fallback
yields evenly spaced eighths with no accidentals. Bar 1 of the sample output
has Gb3 B3 Eb4 Gb4 under Bb5 in a three-flat key, which looks wrong. Every
result is an UNVERIFIED DRAFT; Score review (null's branch) is where it gets
checked against the page.

Path, in order:

1. Today, no code: `python app.py convert score.pdf --mid score.mid` on the
   PC, then open the .mid in the Player, Songs or the Woodshed.
2. Local helper (the `tools/helix-bridge.js` + `js/helix.js` pattern): copy
   the vector OMR and the mido builder into `tools/score-helper.py`, HTTP on
   127.0.0.1:4576 (`POST /parse` returns JSON, `POST /midi` returns bytes),
   no web UI, no winmm. Harden while copying: read the time signature; no
   three-flat default; glyph tables in staff-space units; detect two voices
   on a staff and warn; every limit listed in `warnings`; scan fallback left
   OUT. App side: C2's Open accepts .pdf, maps notes to
   `SLMidiHub.player.loadScore({title, bpm, len, rhythmKnown: false,
   notes: [{t: onset, d: dur, m: midi, partId: staff, v: velocity}]})` and
   the helper's MIDI bytes to `App.songs.fromMidi`; keep page images and
   per-note bbox in the draft for Score review; a "Connect helper" button
   with a stored URL; NOTHING connects or prompts at boot; status text;
   retries only while visible. Claimed files: `tools/score-helper.py`, the
   Add-a-song input in `js/songs.js`, `tests/score-helper.test.js` (fake
   helper, like `tests/helix.test.js`), `tests/fixtures/score/` (an ORIGINAL
   two-staff fixture only), `docs/SCORE-HELPER.md`; one-line accept hooks in
   `js/midihub.js` (`#mh-plfile`) and `js/woodshed.js` (`#ws-midi`) are
   agreed with their owners first. Record on the coord branch. Estimate: two
   days plus the hardening.
3. Later: port the vector OMR to JS over pdf.js's operator list so it runs in
   the PWA worker on iPad and phone (about a week; the glyph tables need
   re-deriving anyway).

Rules: the sample `Love_Like_You.pdf` and its outputs are copyrighted and
never enter the repo; PyMuPDF is AGPL, fine as a helper Matt runs, never
vendored into the shipped app; drafts never award practice credit; do not
merge null's branch to get Score review, wait for its release.

## Do not

- Do not add a per-page copy of key, tempo, help level or instrument; the
  Session panel is the one home (CLAUDE.md "Context bar" and "HELP LEVEL").
- Do not change page ids; cross-links (`fb:practice`, `App.switchTo`,
  plugin pages) depend on them.
- Do not bump versions, the sw CACHE or the APK channel; do not publish the
  claude.ai artifact without Matt's yes.
- Do not auto-connect Web MIDI, the Helix bridge or the score helper at boot.

## Decisions (Matt, 2026-10-25)

1. The Practice tab group is renamed **Train**; the space keeps "Practice".
2. The Studio capture dot and the transport button stay in the header; the
   Session panel holds key/tempo, the metronome and lights & help.
3. The "1.3 update" = Synth tab + this primer's phases, web 1.3.0, stamped by
   the Synth tab session on go-live; null's recognizer becomes 1.4.0.
4. Six groups stay on the phone bar, slightly narrower; the nav suite at
   375 px passes in one row, shrink labels if needed.

Matt's words on scope: "I want all of it worked on and done confirmations
along the way. The app should feel pretty different by the time we're done
and a lot more usable."
