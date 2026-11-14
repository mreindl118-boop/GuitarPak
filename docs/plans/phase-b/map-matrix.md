# Map for Phase B0: the instrument matrix

Written 2026-11-14 against the worktree `scratchpad/wt/a4`, branch
`claude/verify-project-files-4bchk6-v2-a4`, commit `a914df2` ("2.0 Phase A4: review fixes").
Every `file:line` below is a line of that tree. Nothing in the worktree or in any checkout was changed
(`git status --short` is empty after the work).

The working files and screenshots this map names (`work-matrix/…`, `shots/matrix/…`) were scratch files of the
planning session. They are not in the repository: pictures are never committed, because both deploys publish
the whole tree.

This map answers one question: for each of the four instruments, what does soundLAB offer today for each
item of the practice kit, and what is missing. The owner's version of the same content is
`docs/INSTRUMENT-MATRIX.md`.

## 0. How this was made

- Read in full: `docs/ROADMAP-2.0.md`, `docs/DESIGN-SYSTEM.md`, `css/tokens.css`,
  `docs/design/home-mockup.html`, the Phase A section of `CLAUDE.md` (lines 1260-1900),
  `js/learn-instruments.js`, `js/pads.js`, `js/tonein.js`, `js/pitch-detector.js`, `js/practice-input.js`,
  `js/xp.js`, `js/practiceplan.js`.
- Read the parts that carry instruments: `js/quiz.js`, `js/keylessons.js`, `js/fretboard.js`, `js/theory.js`,
  `js/woodshed.js`, `js/tuner.js`, `js/midi.js`, `js/songs.js`, `js/jam.js`, `js/chords.js`,
  `js/chordchart.js`, `js/performance-player.js`, `js/practice-progress.js`, `js/app.js`, `js/settings.js`,
  and sections 0, 1, 9, 10, 12 of `docs/plans/phase-a/PLAN.md`.
- Ran the app from the worktree on port 5417 (`tests/serve.py`) in headless Chromium with Playwright
  (device scale 1) and drove it: five scripts in `work-matrix/` (`walk1.js` … `walk5.js`), their results in
  `work-matrix/walk1.json` … `walk4.json`. The server is stopped.
- Ran the app's own pitch detector in Node on made-up bass notes with the settings each page uses
  (`work-matrix/detect.js`, output `work-matrix/detect.txt`).
- Screenshots: `shots/matrix/` (34 files). I looked at 17 of them: the keyboard mockup at 1200 and 390 px,
  the neck mockup at 1200 and 390 px, Exercises for drums, the bass neck question at 1200 and 390 px, the
  Plan with Bass selected, the Woodshed library for drums, a rudiment running and its report, the Woodshed
  Tab view, the Neck page at 1200 and 390 px, Pads at 1200 and 390 px, the Tuner. The other 17 were taken
  for the record and not opened.

Words used below. "Checked in the browser" means I did it in the running app. "Read" means I read the code
and did not run it. "Not checked" means neither.

## 1. What the binding documents ask for

| Source | What it says |
|---|---|
| `docs/ROADMAP-2.0.md:23-27` | "Four instruments, one kit. Guitar, bass (incl. 5-string fretless), keys and drums each get lessons, exercises, Woodshed, Help levels, plan blocks and progress. Note input on every practice page: audio interface direct input (pitch detection), any MIDI source (incl. a MIDI guitar), and later the FL track's audio." |
| `docs/ROADMAP-2.0.md:18-22` | Keep and upgrade: Exercises, Keys lessons, Chords (now + next chord on the LUMI), Circle, Plan, Neck/Tab/Notation, Woodshed, Songs, Jam (slim backing band), Pads (rebuilt as rhythm practice: drum rudiments), Tuner, Metronome, Lights & help, Settings. |
| `docs/ROADMAP-2.0.md:44-49` | The chord chart maker is "Piano first; a guitar-neck chart reuses the same format later (Phase C)". |
| `docs/ROADMAP-2.0.md:58` | Phase B0: "gap list per instrument × kit item; each gap becomes a Phase C task". |
| `docs/ROADMAP-2.0.md:59` | Phase C: "bass lessons, drum rudiments (Pads + Woodshed drums), Keys + Exercises upgrades, next-chord lights, slim Jam, degree colors default". |
| `docs/ROADMAP-2.0.md:84-87` | Pads gets Record and Play loop back when Phase C rebuilds it. The one-minute chord changes become a real Exercises drill in Phase C. |
| `docs/DESIGN-SYSTEM.md:14-16` | "The instrument is the hero. Keyboard for a keys lesson, neck for guitar or bass, pads for drums, lit exactly as the LUMI (or the on-screen neck) will be." |
| `docs/DESIGN-SYSTEM.md:22-23` | "Four instruments, one kit. Guitar, bass, keys and drums get the same components: lessons, exercises, Woodshed, Help levels, plan blocks, progress." |
| `docs/DESIGN-SYSTEM.md:42-47` | Phase B builds "Instrument heroes (keyboard, neck, pads) sharing one lighting model". |
| `docs/design/home-mockup.html:193-195` | The neck variant of the mockup (`?theme=f`) shows "Next up · Neck lesson 4 · from James", "A Dorian, 5th position", "Play through the UR24C or a MIDI guitar · filled dot = play this now". No neck lesson exists in the app (section 4, row 1). |
| `docs/plans/phase-a/PLAN.md:1199` | Left for B0 to decide: "Whether 'Synth' stays a Learn instrument category". |
| `docs/plans/phase-a/PLAN.md:1200` | Left for C: Pads rebuilt as rhythm practice; the chord changes as a real drill "counting from MIDI or audio input"; LUMI note and triad targets as lesson types inside Keys lessons. |

About the mockup. `docs/design/home-mockup.html:26` fixes the page at 1280 × 800 px
(`html,body{width:1280px;height:800px;overflow:hidden}`). Checked in the browser: at a 390 px wide window the
page is still 1280 px wide (`shots/matrix/mockup-390.png`, `mockup-neck-390.png`; measured
`scrollWidth 1280`). The mockup therefore shows nothing about the phone layout. It has two heroes: a
keyboard (`?theme=e`) and a six-string neck (`?theme=f`, `home-mockup.html:198` `tuning = [64,59,55,50,45,40]`).
There is no pads hero and no bass neck in the mockup. `css/tokens.css:51-55` has colors for keys and strings
(`--sl-key-white`, `--sl-key-black`, `--sl-string`, `--sl-fret`) and none for pads.

## 2. Where "instrument" lives in the code today

**One setting: the Learn instrument.** `js/learn-instruments.js:5` lists seven ids: piano, synth, guitar,
bass, drums, voice, other. The choice is stored under `learn.instrument` (`:29`, default piano) and
announced as `learn:instrument` (`:36`). The picker is a bar at the top of the page, shown only on the four
Learn pages (`:10` `PAGES = ['quiz','chords','theory','practiceplan']`, `:77`).

What the setting changes:

1. Which Exercises modes are offered (`js/learn-instruments.js:7-9`; `js/quiz.js:1169-1172`).
2. Which entry buttons the bar shows (`js/learn-instruments.js:20-28`).
3. Whose progress a run is credited to: Exercises (`js/quiz.js:1599`, `:1602`), the Woodshed
   (`js/woodshed.js:445-447`, `:527`), the guided performance player (`js/performance-player.js:34`, `:416`),
   the Plan (`js/practiceplan.js:23`, `:130`). Keys lessons are credited to piano or synth only
   (`js/keylessons.js:89-92`).
4. The neck drawn inside Exercises questions: four strings for bass, six otherwise (`js/quiz.js:326-330`).

What the setting does not change: the Neck, Tab, Notation, Chords, Piano, Charts, Pads, Songs, Jam and Tuner
pages. None of their files reads it. A search of `js/` for `practiceInstrument`, `learnInstruments` and the
three `learn:*` events finds nine files: `learn-instruments.js`, `quiz.js`, `woodshed.js`,
`performance-player.js`, `practiceplan.js`, `xp.js`, `keylessons.js` (the credit of a lesson), `trainer.js`
(`:468`, the "Open ear training" button asks whether the category has an ear mode) and `app.js` (`:1089`,
it refreshes the bar on a page switch).

The id list is written out six times: `js/learn-instruments.js:5`, `js/performance-player.js:9`,
`js/practice-progress-ui.js:6`, `js/practice-progress.js:20`, `js/practiceplan.js:22`, `js/xp.js:24`.
A change to the categories touches all six.

**The seven categories, checked in the browser** (`work-matrix/walk1.json`):

| Category | Exercises levels offered | Modes | Entry buttons |
|---|---|---|---|
| Piano | 137 | treble, bass clef, staff, ear, theory, piano | Keys scale lessons · Wait / Tempo practice |
| Synth | 137 | the same as Piano | Keys scale lessons · Synth keyboard · Wait / Tempo practice |
| Guitar | 111 | treble, bass clef, staff, ear, theory, neck | Guitar fretboard · Guitar tab & notation · Performance practice |
| Bass | 111 | the same as Guitar (neck = 4 strings) | Bass fretboard exercises · Bass performance practice · Guitar tab reference |
| Drums | 10 | theory only | Drum pads · Drum & rhythm library |
| Voice | 107 | treble, bass clef, staff, ear, theory | Ear-training exercises · Monophonic pitch practice · Pitch tuner |
| Other | 107 | the same as Voice | Performance practice · Circle of fifths |

- **Synth** has the same content as Piano (`js/learn-instruments.js:8`) and its own progress ledger. Its one
  extra is the "Synth keyboard" button, which opens the Piano page with a synth sound
  (`js/learn-instruments.js:22`, `:67-70`).
- **Voice** is a credit category for singers: the shared notation, ear and theory levels, a pointer to the
  Woodshed and to the Tuner (`js/learn-instruments.js:17`, `:26`). Its own note says "this is not a vocal
  technique curriculum". No page listens to a voice in a special way; the Woodshed and the guided performance
  player treat it as a single-note audio source like a guitar.
- **Other** is a credit category for any instrument not listed: shared notation, ear and theory, plus the
  Woodshed and the Circle (`js/learn-instruments.js:18`, `:27`).

**The pages.** soundLAB has 14 pages in five tabs (`js/app.js:78-85`): Learn (Exercises, Chords, Circle,
Plan) · Guitar (Neck, Tab, Notation) · Keys (Piano, Charts, Pads) · Play (Songs, Jam) · Train (Woodshed,
Tuner). There is no tab for bass and none for drums. The drum page (Pads) is a pill under Keys
(`js/app.js:82`; seen in `shots/matrix/pads-1200.png`).

## 3. Four facts that decide many cells

### 3.1 Pitch detection does not reach a bass

All listening goes through one detector, `js/pitch-detector.js`. Its reach is set by two things the caller
passes: the lowest frequency (`:28`) and the length of the sound buffer (`:15`, `:31`: the longest period it
can find is half the buffer).

There are four separate listeners, each with its own settings:

| Listener | Used by | Lowest frequency | Buffer | Lowest note it accepts |
|---|---|---|---|---|
| tone-in, `js/tonein.js:28-31`, `:99` | every page except the Woodshed (`:43`), when Settings › "Use the input to" is on Show notes (`js/settings.js:198-202`) | 60 Hz | 2048 samples | MIDI 24 by its range check (`:56`), but 60 Hz stops it first |
| Woodshed Mic, `js/woodshed.js:722-783` | a Woodshed run, only when the score is not a piano score (`:1218-1220`) | 60 Hz (`:781`) | 2048 (`:733`) | MIDI 28 by its range check (`:756`), but 60 Hz stops it first |
| Tuner, `js/tuner.js:199-203`, `:360` | the Tuner page and its note finder game | 55 Hz | 2048 | no range check |
| Guided performance, `js/practice-input.js:47-59`, `:124`, `:168-169` | Woodshed › Guided performance › Input source "Audio · single notes" | one octave under the "Lowest MIDI pitch" field | 4096 | the field, default 36 = C2 (`js/performance-player.js:333`) |

A four-string bass has open strings E1 = 41.2 Hz, A1 = 55.0 Hz, D2 = 73.4 Hz, G2 = 98.0 Hz. A five-string
adds B0 = 30.87 Hz.

Ran in Node (`work-matrix/detect.js`): clean made-up tones at 44.1 and 48 kHz, two tone colors (a strong
fundamental, and a second harmonic louder than the fundamental), each listener's own settings and its own
accept rule. Result, the same at both sample rates and both tone colors (`work-matrix/detect.txt`):

| Note | tone-in | Woodshed Mic | Tuner | Guided performance, default | Guided performance, "Lowest MIDI pitch" typed as 23 | The same detector with an 8192 buffer and 28 Hz floor |
|---|---|---|---|---|---|---|
| B0 (5-string low B) | no | no | no | no | found | found |
| E1 (bass low E) | no | no | no | found by the detector, thrown away by the range | found | found |
| A1 (bass A) | no | no | no (A1 sits exactly on the 55 Hz floor) | found, thrown away by the range | found | found |
| D2 (bass D) | found | found | found | found | found | found |
| G2 (bass G) | found | found | found | found | found | found |
| E2 (guitar low E) | found | found | found | found | found | found |

Read this as: today two of the four bass strings, and the low B, are not heard by tone-in, by the Woodshed
Mic or by the Tuner. The only place that can hear them is the guided performance player, after the user
opens "Audio calibration and range" and types a lower number. The detector itself can find a low B when it
is given a longer buffer; the last column shows that. Not checked: a real bass through an interface. Real
strings are less clean than my tones, and a longer buffer means the note is recognized later (8192 samples
are 171 ms at 48 kHz; 4096 are 85 ms).

A guitar is inside the range: E2 = 82.4 Hz and drop D = 73.4 Hz were found by all four.

All four listeners hear one note at a time. `js/practice-input.js:95-97` refuses a score with chords
("Audio practice supports single-note scores only"). tone-in has no chord logic at all.

### 3.2 A MIDI guitar is heard as a keyboard

`js/midi.js:134-143` turns every Note On, on any of the 16 channels, into a `midi:note` event that carries
the channel (`chan`). No page uses the channel to tell which string was played.

Checked in the browser (`work-matrix/walk3.json`, `fretboardMidi`): six notes, one on each of channels 1 to
6 (how a MIDI guitar sends its six strings), lit 25 rings on the Neck page for 6 pitches. The neck lights
every place where each pitch can be played (`js/fretboard.js:446-459` matches by pitch only), not the string
that was played. In Exercises, "Find the note on the named string" checks the string only when the answer
comes from a tap on the drawn neck; a MIDI or audio note has no position, so any string counts
(`js/quiz.js:1776-1778`, `:2937`).

Pitch bend is off unless switched on in Settings (`js/midi.js:65-67`, `:144-146`), which suits a MIDI guitar:
string bends and vibrato do not detune the app's sound. A played note outside the lit keyboard range moves
that range (`js/midi.js:1116-1128`, `:1229-1233`), so a MIDI guitar shifts the keyboard window unless a
LUMI is also connected (`:1231`). The list of ports that make their own sound (`js/midi.js:119`) has
keyboards only; a guitar synth is not on it. Not checked: any real MIDI guitar.

### 3.3 The Help level is for keys and key lights only

The Help level (`js/app.js:1258-1277`: Full, Colors, Target, Tonic, None) is read by the Piano page
(`js/piano.js:97-98`, `:661-719`, `:1866-1868`), the Keys lessons (`js/keylessons.js:864`), the key lights
(`js/midi.js:1093`, `:1150-1183`), the Lights & help sheet (`js/lights.js:70-80`) and the Plan, which can
set it from a teacher's line (`js/practiceplan.js:66`, `:194`).

`js/fretboard.js`, `js/woodshed.js`, `js/pads.js`, `js/quiz.js`, `js/chords.js` and `js/songs.js` do not
read it. Checked in the browser: the Neck drawing is identical at Full, Target and None
(`walk3.json`, `fretboardHelp`: the same markup length, 227 circles, 95 texts at all three). The Neck has
its own label switch instead (Notes / Intervals / Degrees, seen in the button list in `walk3.json`), and a
Woodshed run has its own Guide chip (`js/woodshed.js:1221`).

### 3.4 Only four places record progress

Each of the seven categories has its own XP, streak, daily goal and history
(`js/practice-progress.js:20`, `js/xp.js:24`, `js/practice-progress-ui.js:6`). A session is written only by:
Exercises (`js/quiz.js:1602`, `:1663`, `:1711`), Keys lessons (`js/keylessons.js:94`, `:286`), a Woodshed
run (`js/woodshed.js:447`, `:527`) and the guided performance player (`js/performance-player.js:34`, `:58`).
A search for `finishLevel`, `recordSession` and `beginSession` finds no other caller.

So these earn nothing for anybody: the Neck / Tab / Notation runner, Chords, the Circle's ear quiz, Jam,
Songs, Pads, Charts, the Tuner and its note finder game, and the Free practice cards on the Plan page.
Checked in the browser for Pads: a hit left the drums history at 0 sessions (`walk3.json`, `padsProgress`).
The Plan says the same in its own words: a block that opens such a page shows "No automated timer or
completion is available for this casual tool; opening it earns no progress" (`js/practiceplan.js:284`).

## 4. The matrix, cell by cell

Status words. **Works**: made for this instrument and usable as intended. **Partial**: usable, with the
limits named. **Missing**: nothing made for this instrument's own playing (a shared page may still open).
**n/a**: the item does not apply to this instrument.

Summary (56 cells: 15 work, 26 partial, 11 missing, 4 n/a):

| Kit item | Guitar | Bass (4-string; 5-string; fretless) | Keys | Drums |
|---|---|---|---|---|
| 1 Lessons | Missing | Missing | Works | Partial |
| 2 Exercises | Partial | Partial | Works | Missing |
| 3 Woodshed | Partial | Partial | Works | Partial |
| 4 Help levels | Missing | Missing | Works | Missing |
| 5 Plan blocks | Partial | Partial | Works | Partial |
| 6 Progress / XP | Partial | Partial | Works | Partial |
| 7 Note input by audio | Partial | Partial | Partial | Partial |
| 8 Note input by MIDI | Partial | Partial | Works | Partial |
| 9 On-screen instrument | Works | Missing | Works | Partial |
| 10 LUMI lights | Partial | n/a | Works | Partial |
| 11 Tuner | Works | Partial | n/a | n/a |
| 12 Songs | Works | Missing | Partial | Missing |
| 13 Jam | Works | Partial | Works | Partial |
| 14 Charts | Missing | Missing | Works | n/a |

Five-string bass and fretless bass: nothing exists for either in any row. The words "fretless" and
"5-string" do not occur in `js/`, `css/` or `index.html` (searched). The only bass tuning in the app is the
four-string one inside Exercises (`js/quiz.js:328`, `[28, 33, 38, 43]`).

### Row 1. Lessons (levelled lessons on the instrument, graded note by note)

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | The Neck page has a runner: it plays a scale pattern at a tempo with picking marks and a moving dot, and sends the note to play and the next one to the key lights (`js/fretboard.js:818-823`, `:1270-1283`). It does not listen and does not score. The Plan calls it a "casual tool" with "no automated progress timer" (`js/practiceplan.js:94`). | Missing | There are no neck lessons with levels and a pass mark. The mockup's "Neck lesson 4" (`home-mockup.html:193`) has nothing behind it. |
| Bass | Nothing. The Learn bar's three bass buttons lead to Exercises, to the Woodshed and to "Guitar tab reference" (`js/learn-instruments.js:24`). | Missing | No bass lessons. Phase C names them (`ROADMAP-2.0.md:59`). They need a bass neck first (row 9). |
| Keys | 25 scale lessons in three tiers (`js/keylessons.js:65-85`), each with 10 speed levels from quarter notes at 60 to 16ths at 72 (`:59`), judged for the right key and the timing (`:61`), an endless mode with a streak (`:14-18`), and the section "Notes and triads on the LUMI" under them (`CLAUDE.md:1387-1407`). Checked in the browser: 25 lessons, tiers Start here / Building / Stretch (`walk3.json`, `piano`). | Works | Upgrades the Plan already asks for: one hand at a time only (`js/practiceplan.js:97`), no arpeggio lesson (`:91`), one or two octaves only (`:90`), scales only. |
| Drums | The 40 standard rudiments are in the Woodshed, each with sticking, accents, flams and drags (`js/woodshed.js:119-165`), started in Ladder mode, which raises the tempo after a good run (`:677-682`, `:1413`). | Partial | It is a flat list of 40 chips (`:1176-1182`), not a course: no order to follow, no pass mark that opens the next one, and nothing on the Pads page. No lessons for beats or fills. |

### Row 2. Exercises (the question course)

The course is one list for everybody (`js/quiz.js:953-1050`): Notes, Intervals, Chords, Scales, Key
signatures. Each unit has modes; a category sees only its allowed modes (section 2).

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | 111 levels. Four of them are on the neck: name the note at the dot (two levels), name any note to fret 12, find the note on a named string (`js/quiz.js:967-969`, `:977-979`). The rest are shared reading, ear and theory. | Partial | The "play it" tasks for intervals, chords and scales exist only in the piano mode (`js/quiz.js:910-912`, `:927-929`, `:942-944`), which guitar does not get (`js/learn-instruments.js:8`). The staff levels "Play the note you see" draw a keyboard for every instrument (`js/quiz.js:285` `q.board = 'keys'`). |
| Bass | The same 111 levels. The neck in a question has four strings, E A D G (`js/quiz.js:326-330`). Checked in the browser: `shots/matrix/exercises-bass-neck-1200.png`, `-390.png`; a note at bass pitch sent the way tone-in sends it was accepted as the right answer (`walk1.json`, `bassFind`). `tests/learn-instruments.test.js:72` covers the four rows. | Partial | The same limits as guitar. No five-string choice. No bass topics (root and fifth, octave shapes, reading a bass line). |
| Keys | 137 levels in six modes; answers by tap, number keys, MIDI or audio (`js/quiz.js:1752-1790`, `:2924-2937`); key lights show the answer (`js/quiz.js:1133-1146`). | Works | None found for this map. Phase C lists "Keys + Exercises upgrades" without naming them (`ROADMAP-2.0.md:59`). |
| Drums | 10 levels, all theory (`js/learn-instruments.js:9`). Checked in the browser, the ten are: three "Chords in a key", one "Which major scale does this mode come from", five about key signatures and the circle (`walk1.json`, `drumsQuiz.levels`). The drummer's path starts with "Chords in a key" (`shots/matrix/exercises-drums-1200.png`). The app says so itself: "Dedicated drum quiz levels are not available yet" (`js/learn-instruments.js:16`). | Missing | Nothing about rhythm: note values, counting, time signatures, tapping a rhythm back, sticking. The course has no rhythm topic for anyone. |

### Row 3. Woodshed (scored runs: Run, Phrases, Wait, Ladder)

The Woodshed page is one page for all categories. Its title and its XP credit follow the Learn instrument
(`js/woodshed.js:1148`, `:445-447`); its content does not. Checked in the browser: with piano, guitar, bass
or drums selected the page shows the same buttons and the same 40 rudiments (`walk2.json`, `shed`).

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | "+ Pentatonic fours" makes a guitar score (`js/woodshed.js:80-95`). "+ Paste tab" reads six-line tab (`:346-391`). A guitar score gets two extra views, Tab and Tab+Sheet (`:1215`), and the Mic chip (`:1218-1220`). | Partial | "+ Scale (your key)" always makes a piano score starting at C3: it reads a setting `ws.instr` that nothing ever writes (`js/woodshed.js:1379`, the only place the key occurs). The Guided performance card is a piano roll with a keyboard (`:1152-1153`). |
| Bass | The title reads "Woodshed · bass" and runs are credited to bass. Checked in the browser: "+ Scale" gave a piano score from C3 to C5, "+ Pentatonic fours" a guitar score from A2 to A4 with a six-line Tab view (`walk2.json`, `bassScores`, `pentSession`; `shots/matrix/shed-bass-pent-tabview-1200.png`). A MIDI file of a bass line can be imported. | Partial | Nothing is made for bass: no bass exercise, no four-line tab (pasting one gives "no tab found — need six string lines", checked: `walk4.json`, `bassTab`; `js/woodshed.js:359`), no bass Tab view, and the Mic does not hear the E and A strings (3.1). |
| Keys | Scale, Hanon (`js/woodshed.js:66-78`), the two guided pieces (`:99-117`), MIDI files, and MusicXML through Songs › Open a score. Wait for Me and Play at Tempo (`:1190`). Key lights show the note to play and the next one (`:797-818`). | Works | The Mic chip is hidden for a piano score (`:1218`). That matters only for an acoustic piano. |
| Drums | All 40 rudiments. Checked in the browser: a single stroke roll played on the beat with the Z and X keys (key presses sent by script at each stroke's time) scored 32 of 32 perfect, the report showed 5 stars, and one session was written to the drums history (`walk3.json`, `rudimentTimed`; `shots/matrix/shed-rudiment-report-1200.png`). Input: Z / X (`:1601-1606`), any MIDI note (`:1563-1567`), or the Mic, which counts a sudden loud sound as a hit (`:743-749`). No test suite covers the rudiments (searched `tests/` for "rudiment": no hit). | Partial | Any hit counts for any stroke (`js/woodshed.js:604`, `:627`: for drums the pitch test is always true). So timing is graded, but not which hand and not which drum. A drum MIDI file is imported with its notes shown in two alternating lanes, not by drum (`:317`, `:331`; checked: `walk4.json`, `drumMidi`; `tests/performance-import.test.js:82` expects this). No built-in beats or fills. The session text says you can play "or the Pads" (`js/woodshed.js:1228-1229`), but the Pads page sends nothing to the Woodshed (it emits no `note:input`; `js/pads.js:85-93`). |

### Row 4. Help levels

See 3.3.

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | Nothing on the Neck, Tab or Notation pages. The Neck has its own Notes / Intervals / Degrees switch. With a LUMI connected, the key lights for the runner's notes do follow the Help level (`js/midi.js:1165-1181`). | Missing | The neck looks the same at every Help level (checked). The key bar's Help control would do nothing on the Guitar tab. |
| Bass | Nothing (no bass page). | Missing | Follows from row 9. |
| Keys | Five levels change colors, labels, finger numbers and the now / next rings on the Piano page (`js/piano.js:661-719`, `:929-940`, `:1866-1868`), the lessons (`js/keylessons.js:864`) and the key lights (`js/midi.js:1150-1183`). | Works | None. |
| Drums | Nothing on Pads. A Woodshed run has its own Guide chip (`js/woodshed.js:1221`). | Missing | No shared meaning of "more help / less help" for drums (for example: sticking letters shown or hidden). |

### Row 5. Plan blocks (a teacher's line becomes a timed block that opens the right page)

The rules are one table (`js/practiceplan.js:9-18`). Checked in the browser: the same 15 lines typed for
piano, guitar, bass and drums (`walk2.json`, `plan`).

| Line typed | Piano | Guitar | Bass | Drums |
|---|---|---|---|---|
| "G major scale, 5 min" | the Keys lesson G major, right hand | the Neck runner in G major | gap: "No matching guided scale lesson for the selected Bass category" | the same gap, for Drums |
| "A minor pentatonic at 80 bpm" | the Keys lesson | the Neck runner | gap | gap |
| "Warm up 3 min" | gap ("opens the six-string guitar fretboard") | the Neck runner | gap | gap |
| "Paradiddles 5 min", "Rudiments: flam tap" | Woodshed | Woodshed | Woodshed | Woodshed |
| "Practice your piece, bars 1-8" | Woodshed | Woodshed | Woodshed | Woodshed |
| "Chords: C G Am F" | Chords page | Chords page | Chords page | Chords page |
| "Jam over a blues backing track" | Jam | Jam | Jam | Jam |
| "Intervals ear training" | Exercises | Exercises | Exercises | Exercises |
| "Tune up" | Tuner | Tuner | Tuner | Tuner |
| "Walking bass line in F", "Rock beat at 90 bpm, 8th-note hi-hat", "Slap technique", "Fretless intonation: long tones", "Strumming pattern D DU UDU" | gap: "No matching guided module" | gap | gap | gap |

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | Scale, pentatonic and warm-up lines open the Neck runner with the key and tempo set (`js/practiceplan.js:93-95`, `:17`, `:195`). The starter plan has "Warm up on the neck" (`:125`). | Partial | The Neck block can never be measured complete: only a Keys lesson, Exercises or the Woodshed are watched (`js/practiceplan.js:190`, `:172-175`). Strumming and technique lines find nothing. |
| Bass | Shared blocks work: tuner, piece, chords, jam, ear. The starter plan for bass is three general blocks (`walk2.json`, `starter`). | Partial | Every scale line and the warm-up become gaps (`js/practiceplan.js:96`, `:110`). No rule for a bass line or a bass technique. |
| Keys | A scale line finds the exact lesson by key, scale, hand and octaves (`js/practiceplan.js:98-105`), opens it, and the block completes when a lesson run is recorded (`:172`). | Works | Arpeggios, hands together and an exact speed are reported as gaps (`:91`, `:97`, `:106`). |
| Drums | A rudiment line opens the Woodshed and completes when a run is recorded (`js/practiceplan.js:12`, `:174`). | Partial | The block opens the Woodshed library, not the rudiment that was named: the Plan records the gap "Direct selection/import of this score needs a Woodshed setup hook" itself (`:112`). A beat or groove line finds nothing. A drummer's plan also gets "Tune up" and scale lines from the same table. |

A line with "sing", "vocal", "sight-read", "transcribe", "pedal", "embouchure" or "bowing" is always a gap
(`js/practiceplan.js:86`).

A plan's blocks belong to the instrument that was selected when the plan was made. With another instrument
selected, the instrument's own blocks are folded away as "blocks preserved for other instrument contexts"
and only the shared ones (tuner, chords, ear) stay (`js/practiceplan.js:26-33`, `:243`, `:286`). Seen in
`shots/matrix/plan-bass-1200.png`: a starter plan made for drums, viewed with Bass selected, shows two of
its three blocks.

### Row 6. Progress / XP

See 3.4.

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | Own ledger. Earns from Exercises, Woodshed runs and guided performance. | Partial | The Neck runner, Chords, Jam, Songs and the Tuner's note finder earn nothing. Those are the guitar's main pages. |
| Bass | Own ledger. Earns from Exercises, Woodshed runs and guided performance. | Partial | The same, and there is no bass page to earn on. |
| Keys | Two ledgers, piano and synth. Earns from Exercises, Keys lessons, the Woodshed and guided performance. | Works | Charts, Chords and Jam earn nothing. The two ledgers split one player's keys practice in two. |
| Drums | Own ledger. Checked in the browser: a rudiment run wrote one session with 32 expected and 32 matched notes (`walk3.json`, `rudimentTimed.history`). | Partial | Pads earn nothing (checked). |

### Row 7. Note input by audio (an interface or a microphone, pitch detection)

See 3.1. FL Studio's track audio is "later" in the roadmap (`ROADMAP-2.0.md:26-27`); nothing in the code
handles it, and I did not look for a design.

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | tone-in feeds single notes to every page as if they came from a keyboard, without sounding them (`js/tonein.js:1-15`, `:62`): Exercises (`js/quiz.js:2926`), Keys lessons (`js/keylessons.js:844`), the Neck's glow (`js/fretboard.js:2021-2025`). The Woodshed and the guided performance player listen on their own. The whole guitar range is detected (3.1). | Partial | One note at a time: no chords, no strumming. Three separate listeners with three sets of limits. On the Neck, a heard note makes the neck glow but nothing is graded (row 1). Not checked with a real guitar. |
| Bass | The same paths. | Partial | The E and A strings and a low B are not heard by tone-in, the Woodshed Mic or the Tuner (3.1). The guided performance player hears them only after a number is changed by hand. |
| Keys | tone-in works for single notes above its 60 Hz floor (D2 was the lowest note I tested and it was found). Keys lessons take such a note as input (`js/keylessons.js:844`). | Partial | A keyboard's audio is many notes at once, which the detector cannot follow. In practice keys use MIDI. |
| Drums | Inside a Woodshed drum run only: a sudden loud sound counts as one hit (`js/woodshed.js:743-749`). | Partial | It cannot tell a kick from a snare. Pads ignore audio (tone-in notes "never drum", `js/pads.js:269`). |

### Row 8. Note input by MIDI

See 3.2.

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar (a MIDI guitar) | Notes on every channel reach every page and are graded by pitch (checked on the Neck). Pitch bend is ignored by default. | Partial | The string is not known. Nothing marks the input as a guitar: it moves the keyboard range, and short accidental notes from a pickup are graded like any note. Not checked with hardware. |
| Bass (a MIDI bass) | The same path. In Exercises a bass-pitch note is accepted (checked, row 2). | Partial | The same, and notes below the guitar's low E light nothing on the six-string Neck (checked: A1 lit 0 rings, `walk3.json`, `fretboardMidi.bassA1Rings`). |
| Keys | The main route everywhere: Piano, lessons, Exercises, Woodshed, Chords (`js/chords.js:658-672`, `:1250-1255`), Jam (`js/jam.js:1360-1372`), Charts "Play it in" (`js/chordchart.js:484-487`). | Works | None. |
| Drums (pads or an e-kit) | Pads: the General MIDI drum map or eight white keys (`js/pads.js:32`, `:61-74`), with a Remap. Woodshed: any note is a hit. | Partial | In the Woodshed the note number is not used, so a kick on a snare stroke counts (row 3). |

### Row 9. On-screen instrument

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | Neck: six strings, five tunings (`js/theory.js:65-72`), 12 to 24 frets, left-handed, drawn vertical or horizontal (`js/fretboard.js:13-16`, `:1873-1882`; the vertical neck is seen in `shots/matrix/fretboard-390.png`). Tab and Notation pages on the same runner (`js/fretboard.js:2275-2288`); notation is in treble clef, written an octave up (`:1111-1116`). The Chords page has its own neck with voicings (`js/chords.js:1-12`). Checked: `shots/matrix/fretboard-1200.png`. | Works | None for six-string guitar. |
| Bass | A small four-string diagram inside Exercises questions (`js/quiz.js:326-330`). | Missing | No bass page. The Neck is six strings in the code: loops to 6 and "5 − row" in about fifteen places (`js/fretboard.js:208`, `:281`, `:359-360`, `:377-378`, `:409-410`, `:421-422`, `:731`, `:1026-1065`, `:1399-1407`, `:2123`), and `js/theory.js:10` describes a tuning as six notes. No five-string. No fretless. No bass clef on the Notation page. |
| Keys | The Piano page: sounds (Grand piano and four synths, checked), Dots or Whole keys, fingering, chords and arpeggio. | Works | None. |
| Drums | Pads: eight pads, played by touch, by Z X C V / A S D F, or by MIDI (`js/pads.js:1-25`). Checked: `shots/matrix/pads-1200.png`, `pads-390.png`. | Partial | Play-only since Phase A (`js/pads.js:21-24`, `CLAUDE.md:1301-1305`): nothing to follow, nothing graded, no recording. It lives under the Keys tab (`js/app.js:82`). |

### Row 10. LUMI lights (where it applies)

The LUMI is a keyboard. For keys it is the instrument. For the others it can only mirror what the page shows.

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | The Neck runner sends "this note now, that note next" to the key lights (`js/fretboard.js:818-823`), Songs does the same for the sounding step (`js/songs.js:329-340`), Chords lights the chord (`js/chords.js:640`). | Partial | Chords lights the current chord only; the roadmap wants "now + next chord" (`ROADMAP-2.0.md:18-19`). |
| Bass | No bass page, so nothing to mirror. | n/a | Becomes "the same as guitar" once a bass neck exists. |
| Keys | One engine for all pages: the scale layout, the note to play, the next note blinking, answers (`js/midi.js:1150-1218`). Used by Piano, lessons, Exercises, Woodshed, Charts, Chords, Songs. | Works | Phase E owns what is left (`ROADMAP-2.0.md:61`). |
| Drums | Pads keeps its eight keys dimly lit and flashes one on a hit (`js/pads.js:85-113`), after claiming the keyboard (`:294`). It writes the lights itself (`App.midi.light`) and does not use the shared engine. A Woodshed drum run lights nothing (`js/woodshed.js:798`). | Partial | No "this pad next" light for a pattern. |

### Row 11. Tuner

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | Needle, cents, note name, A4 setting, a string guide for five tunings, reference tones, and a note finder game (`js/tuner.js:139-192`, `:415-438`, `:442-466`). Checked: `shots/matrix/tuner-1200.png`, chips E2 A2 D3 G3 B3 E4. | Works | The note finder game is six strings in standard tuning only (`js/tuner.js:449`, `:464`). |
| Bass | The needle reads any pitch it can detect, so the D and G strings show. | Partial | The E and A strings and a low B are not detected (3.1). No bass tuning in the string guide (the list is `Theory.TUNINGS`, guitar only). No fretless aid (holding a note against a reference). |
| Keys | — | n/a | |
| Drums | — | n/a | Drum tuning is not in the roadmap. |

### Row 12. Songs

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | Paste six-line tab or load a MIDI file; the song plays as tab with a moving highlight, loops bars, follows the shared tempo, finds the key (`js/songs.js:1-15`). "Open a score" sends a file to the synth, to the Woodshed, or opens it as tab (`js/songs.js:546`). | Works | Nothing is graded or recorded on the Songs page; grading is in the Woodshed. The library is Phase G (`ROADMAP-2.0.md:63`). |
| Bass | — | Missing | A four-line bass tab is refused. Checked in the browser: "No six-line tab found — check the paste." (`js/songs.js:682`; the reader loops over six lines, `:76`). A MIDI bass line is shown as six-string guitar tab with its low notes moved up into the guitar's range (`js/songs.js:168-171`). |
| Keys | "Open a score" takes MIDI and MusicXML and can play it on the synth or send it to the Woodshed (`js/songs.js:546`). | Partial | The Songs page itself shows guitar tab only. |
| Drums | — | Missing | The Songs MIDI reader drops the drum channel (`js/songs.js:144`); checked: a drum-only file gives no song (`walk4.json`, `drumMidi.songs`). The Woodshed's own reader takes a drum file (row 3). Not checked: the button path Songs › Open a score › Practice with a drum file. |

### Row 13. Jam

Jam is a band of three: drums, bass and a chord instrument, each with a volume and a Mute
(`js/jam.js:1090-1105`; checked: `walk3.json`, `jam`). It plays in 4/4 only (`CLAUDE.md:2039`). It keeps
playing when you switch to another page (`CLAUDE.md:2062`; read, not tried). It records no progress (3.4).

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | The Neck follows the sounding chord and offers a scale for it (`js/fretboard.js:466-503`, `:2016-2020`). Mute the chord instrument to take its place. | Works | No record of the time played. |
| Bass | Mute the band's bass and play. | Partial | Nothing shows a bass part (no bass neck, no root and fifth for the chord). |
| Keys | The Piano page follows the chord; holding a chord on a MIDI keyboard makes the band follow it (`js/jam.js:1360-1372`). | Works | No record of the time played. |
| Drums | Mute the band's drums, switch to Pads and play. | Partial | Nothing shows the beat. Pads and Jam are two pages. |

### Row 14. Charts

| | What exists | Status | Gap |
|---|---|---|---|
| Guitar | — | Missing | The chart maker draws keyboards only (`js/chordchart.js:1-6`). A neck chart is planned for Phase C (`ROADMAP-2.0.md:48-49`). The Chords page shows guitar shapes but makes no chart. |
| Bass | A card can be a "Line" (a bass line, notes in the order placed), drawn on a keyboard (`js/chordchart.js:18-21`, `:367`). | Missing | No chart on a bass neck. |
| Keys | Dots, finger numbers, chord names, Play it in, Light the LUMI, save, MIDI, print, Practice with LUMI (checked: the button list in `walk3.json`, `chart`). | Works | None. |
| Drums | — | n/a | |

## 5. What this means for Phase B (the shell and the heroes)

These are not Phase C tasks. They are things the Phase B plan must decide, because Phase B builds the parts
that Phase C will fill.

1. **The neck hero must take its strings from data.** Phase B builds "Instrument heroes (keyboard, neck,
   pads)" (`DESIGN-SYSTEM.md:46-47`). Today's neck is six strings in about fifteen places (row 9). If the
   new hero is drawn for six strings, bass needs a second rebuild in Phase C. Built for a list of strings
   (4, 5 or 6) and a "frets drawn: yes / no" flag from the start, bass and fretless cost little later.
2. **The Help control in the key bar.** The key bar is on every page with a Help level in it
   (`DESIGN-SYSTEM.md:17-19`). On the Guitar tab and on Pads it changes nothing today (3.3). The app's own
   rule is "Show a control only when it does something" (`CLAUDE.md:1946`). Either the neck hero
   obeys the Help level from Phase B on (it belongs to "one lighting model"), or the Help control is hidden
   on those pages until Phase C.
3. **Where the instrument is chosen.** The choice decides the Exercises content and whose progress every
   run counts for, yet the picker is shown on the four Learn pages only (`js/learn-instruments.js:10`). The
   key bar in the design system has Key, Tempo, Scale lock, LUMI lights and Help, and no instrument. The new
   home shows one next step for one instrument. Phase B needs a place for it.
4. **Five tabs, four instruments.** The header has Learn, Guitar, Keys, Play, Train
   (`DESIGN-SYSTEM.md:44`, `home-mockup.html:116`). Bass has no place and Pads sits under Keys.
5. **Tests that pin the categories.** `tests/learn-instruments.test.js:25` expects seven choices, `:31` the
   mode list per category, `:54` the drum note text, `:72` four bass strings E A D G.
   `tests/performance-import.test.js:82` expects a drum file's notes in alternating lanes. Thirteen suites
   name an instrument category (`game`, `instrument-session`, `instrument-xp`, `learn-instruments`,
   `performance-import`, `performance-progress`, `practice-progress`, `practice`, `practiceplan`, `quiz`,
   `remote-plan`, `remote-quiz`, `trim`).

## 6. Candidate Phase C tasks

Size: **S** = one small pull request (about a day). **M** = one pull request of several days. **L** = more
than one pull request. "Roadmap" gives the line of `docs/ROADMAP-2.0.md` that asks for it.

### Shared groundwork

| # | Task | What the user gets | Files | Size | Needs | Roadmap |
|---|---|---|---|---|---|---|
| 1 | One instrument table | Choose "Bass, 5 strings, fretless" once; every page knows the strings, the tuning, the lowest note and the clef. | `js/theory.js` (tunings, `:65-72`), `js/learn-instruments.js`, one new store key; the six copies of the id list (section 2) | M | owner answers Q1, Q2 | `:23-24` |
| 2 | One audio listener with a range per instrument | A bass is heard down to low E, a five-string down to low B, on every page, with one switch. | `js/tonein.js`, `js/practice-input.js`, `js/woodshed.js:712-792`, `js/tuner.js:199-203`, `js/performance-player.js:333` | M | 1; a real bass to test with | `:25-27` |
| 3 | MIDI guitar as its own kind of input | The neck shows the string you played; "find it on the named string" can be checked; the keyboard range stays put. | `js/midi.js` (`:134-151`, `:1229-1233`), `js/fretboard.js:446-459`, `js/quiz.js:1752-1790`, `js/settings.js` | M | 10 for a MIDI bass; hardware to test with | `:26` |
| 4 | Progress from every practice page | Time on the Neck, Pads and Jam counts toward the streak and the daily goal. | `js/fretboard.js`, `js/pads.js`, `js/jam.js`, `js/xp.js` (no change expected) | S each | 5, 13 for a graded score; play time alone needs nothing | `:23-25` |

### Guitar

| # | Task | What the user gets | Files | Size | Needs | Roadmap |
|---|---|---|---|---|---|---|
| 5 | Neck lessons that listen | Scale lessons on the neck with speed levels and a pass mark, graded from a MIDI guitar or the interface, like the Keys lessons. | new `js/necklessons.js` modelled on `js/keylessons.js`; `js/fretboard.js` (runner, `:1270-1296`); `js/practiceplan.js` (`:93-95`, `:145-155`, `:190`) | L | Phase B neck hero; 2 for audio | `:23-27`; mockup `home-mockup.html:193` |
| 6 | Help level on the neck | Full, Colors, Target, Tonic, None mean the same on the neck as on the keys. | `js/fretboard.js`, `js/chords.js` (its neck) | S–M | Phase B neck hero (may be done there, section 5 item 2) | `:23-25` |
| 7 | Neck exercises beyond note names | Play the interval, the chord tones, the scale on the neck; staff questions answered on a neck. | `js/quiz.js` (`:285`, `:904-951`, new neck generators), `js/learn-instruments.js:8-9` | M | none | `:59` "Exercises upgrades" |
| 8 | Chord charts on the neck | The chart maker with a guitar neck instead of a keyboard, same file format. | `js/chordchart.js` (`:18-21`), a neck diagram | M–L | Phase B neck hero | `:48-49` |
| 9 | One-minute chord changes as a drill | Changes counted from the MIDI guitar (or strums heard by the interface), a record per chord pair, XP. | `js/trainer.js` (`:16`, `:183-184`), `js/quiz.js` | M | 3; honest limit: audio cannot tell chords apart | `:86-87` |

### Bass

| # | Task | What the user gets | Files | Size | Needs | Roadmap |
|---|---|---|---|---|---|---|
| 10 | A bass neck: 4 or 5 strings | Neck, Tab and Notation for bass: E A D G or B E A D G, bass clef, bass tunings. | `js/fretboard.js` (the six-string places in row 9), `js/theory.js` (`fretMidi`, exercise paths), css | L | 1; Phase B neck hero | `:23-24` |
| 11 | Fretless neck and intonation practice | A neck without fret wires, and long-tone practice that shows how many cents off you are. | `js/fretboard.js`, `js/practice-input.js` (it already reports cents, `:80`), `js/tuner.js` | M | 2, 10; owner answers Q3 | `:23` |
| 12 | Bass lessons | Root and fifth, octave shapes, scales in one position, walking patterns over I–IV–V, with levels. | the lesson engine of task 5 plus a bass lesson list | M | 5, 10 | `:59` "bass lessons" |
| 13 | Bass in the Tuner | Bass tunings in the string guide; the needle reads low E and low B. | `js/tuner.js` (`:199-203`, `:360`, `:415-438`), `js/theory.js` | S | 1, 2 | `:22`, `:23` |
| 14 | Bass in Exercises | The five-string neck in questions; bass topics (root and fifth, octaves, reading a bass line in bass clef). | `js/quiz.js:326-330`, new units in `COURSE` | M | 1 | `:23-25` |
| 15 | Bass in the Woodshed and Songs | Scale exercises in the bass register, four- and five-line bass tab, a bass Tab view, bass lines not moved up an octave. | `js/woodshed.js` (`:50-64`, `:346-391`, `:1215`, `:1379`), `js/songs.js` (`:76`, `:168-171`) | M | 1, 2. The Songs half may wait for Phase G | `:23-25`, `:63` |

### Drums

| # | Task | What the user gets | Files | Size | Needs | Roadmap |
|---|---|---|---|---|---|---|
| 16 | Grade which drum and which hand | A kick on a snare stroke is a miss; right and left pads are told apart; a drum MIDI file shows its drums in their own lanes. | `js/woodshed.js` (`:307-335`, `:604`, `:627`, the lane drawing), `js/pads.js:61-74` (the note-to-pad map, shared) | M | none. Changes `tests/performance-import.test.js:82` | `:59` "Woodshed drums" |
| 17 | Pads rebuilt as rhythm practice | The pattern lights up on the pads, you play it, it is graded; Record and Play loop come back. | `js/pads.js`, the judge of `js/woodshed.js:593-648` made shareable, `tests/trim.test.js` | L | 16; Phase B pads hero | `:21-22`, `:59`, `:84-85` |
| 18 | A rudiment course | The 40 rudiments in an order, with a pass mark that opens the next one. | `js/woodshed.js:124-190`, `:1176-1182`; a lesson list | M | 16 | `:59` "drum rudiments" |
| 19 | Beats and fills | Rock, 16th-note, shuffle and fill patterns to practice at rising tempo. | pattern data; `js/woodshed.js` or the Pads engine | M | 16, 17 | `:23-25` |
| 20 | Rhythm exercises | A Rhythm topic: note values, counting, time signatures, tap the rhythm back. For drummers and everyone else. | `js/quiz.js` (a new timed question kind, `COURSE`), `js/learn-instruments.js:7-9` | L | none. Changes `tests/learn-instruments.test.js:31`, `:54` | `:23-25` |

### Keys and shared pages

| # | Task | What the user gets | Files | Size | Needs | Roadmap |
|---|---|---|---|---|---|---|
| 21 | More kinds of Keys lesson | Arpeggios, hands together, chords; LUMI note and triad targets as lesson types. | `js/keylessons.js`, `js/lumi-practice.js`, `js/practiceplan.js` (`:90-97`) | L | none | `:59`; `PLAN.md:1200` |
| 22 | Plan blocks for every instrument | "G major scale" opens the bass lesson for a bassist; "paradiddles" opens that rudiment; "rock beat" opens the beat; the starter plan fits the instrument. | `js/practiceplan.js` (`:9-18`, `:88-127`), an "open this" hook in `js/woodshed.js` | M | 5, 12, 17, 18. Overlaps Phase D "Plan upgrade" | `:23-25`, `:60` |
| 23 | The Woodshed follows the instrument | The library shows what fits your instrument first; "+ Scale" is in your range; the Mic is offered for every score. | `js/woodshed.js` (`:1143-1201`, `:1218`, `:1379`) | S–M | 1 | `:23-25` |
| 24 | Jam for the player ("slim Jam") | "I play: bass" mutes that band member and shows your part: roots and fifths on the bass neck, the beat on the pads. | `js/jam.js` (`:1090-1105`), `js/fretboard.js`, `js/pads.js` | M | 10, 17 | `:21`, `:59` |
| 25 | Next chord on the lights | The Chords page lights this chord and blinks the next. | `js/chords.js:640` | S | none. May belong to Phase E | `:18-19`, `:59` |

Dependencies in one line: 1 → 2, 10, 13, 14, 15, 23 · Phase B heroes → 5, 6, 8, 10, 17 · 5 → 12, 22 ·
10 → 11, 12, 24 · 16 → 17, 18, 19 · 17 → 24.

## 7. Not checked

- No real instrument, interface, MIDI guitar, e-kit or LUMI was used. Everything about audio is from the
  code and from made-up tones (3.1). Everything about a MIDI guitar is from the code and from events sent
  inside the page (3.2).
- I did not run `tests/run.sh`.
- `gear.html` was not opened; it has none of the practice pages (`CLAUDE.md:1521-1523`).
- The Android and iOS wrappers were not looked at.
- The Circle page's ear quiz, the Metronome's tempo trainer and the Lights & help sheet were read at header
  level only. They are shared tools and do not differ by instrument.
- The path Songs › Open a score › Practice with a drum-only MIDI file was not clicked through (row 12).
- How Notation and Tab look for a tuning other than standard was not checked.
- Light theme was not looked at.

## 8. Open questions, each with a recommended answer

- **Q1. Does "Synth" stay a Learn category?** (`PLAN.md:1199`.) Recommended: no. Show four instruments
  (Guitar, Bass, Keys, Drums) and put Voice and Other behind "More". Piano and Synth have the same content
  and split one player's keys progress in two. Keep the stored `synth` ledger readable and show its history
  under Keys; never delete or rewrite it.
- **Q2. Where does bass live with five tabs?** Recommended: on the Guitar tab. Neck, Tab and Notation draw
  the instrument chosen in the Learn instrument (guitar, bass 4, bass 5). The tab's label follows the
  instrument or becomes a neutral word. Decide in the Phase B plan, because the nav is built there.
- **Q3. What should "fretless" do?** Recommended: two steps. First a neck without fret wires that otherwise
  works like the fretted one (part of task 10). Later, intonation practice with a cents display (task 11).
- **Q4. Where do drums live?** Recommended: Pads stays under Keys through Phase B (today's place). When task
  17 rebuilds it, it moves to the tab the Phase B plan chose for bass, so that tab holds "your instrument".
- **Q5. Does the Help level on the neck belong to Phase B or C?** Recommended: Phase B, as part of the neck
  hero's lighting model, so the key bar's Help control is never a dead control (section 5 item 2).
- **Q6. Should a bassist's low notes cost extra delay?** A low B needs a longer listening window than a
  guitar note. Recommended: only when the instrument is bass; guitar keeps today's short window.
- **Q7. Is "which hand" needed for rudiments?** Telling right from left needs two pads or two keys.
  Recommended: yes on Pads and on an e-kit (two different notes), and "timing only" stays available for a
  practice pad heard through a microphone, which cannot tell hands apart.
- **Q8. Phase C order.** Recommended: groundwork 1 and 2, then drums 16, 17, 18 (most of the engine exists),
  then guitar 5 and 6, then bass 10, 12, 13, then the rest.

## 9. Evidence files

- `work-matrix/walk1.json` — the seven categories; the bass neck question; drums in Exercises.
- `work-matrix/walk2.json` — Plan mapping of 15 lines for four instruments; starter plans; Woodshed per
  instrument; a bass run; guided performance defaults.
- `work-matrix/walk3.json` — Neck, Tuner, Pads, Piano, Chords, Jam, Songs, Charts; Help level on the neck;
  six-channel MIDI on the neck; a timed rudiment run.
- `work-matrix/walk4.json` — bass tab and drum MIDI imports; page width at 390 px.
- `work-matrix/detect.txt` — the pitch detector on bass notes.
- `shots/matrix/*.png` — 34 screenshots at 1200 px, some at 390 px.
