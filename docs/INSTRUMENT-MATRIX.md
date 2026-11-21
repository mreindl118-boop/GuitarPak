# soundLAB 2.0 — instrument matrix (Phase B0)

Written 2026-11-14 and finished the same day after the review of the Phase B plan. Checked against branch `v2`
with all five Phase A steps (commit `a914df2`). Brought up to date on 2026-11-21 for soundLAB 2.1.0 (MIDI
guitar, the voice trainer, the weak-spot map): the section "Changed by soundLAB 2.1.0" near the end lists what
moved.

The roadmap says: "Four instruments, one kit. Guitar, bass (incl. 5-string fretless), keys and drums each
get lessons, exercises, Woodshed, Help levels, plan blocks and progress. Note input on every practice page:
audio interface direct input (pitch detection), any MIDI source (incl. a MIDI guitar), and later the FL
track's audio." (`docs/ROADMAP-2.0.md`, Decisions.)

This page shows how far each instrument is from that today, and turns every gap into a task for Phase C.

**The short version.** Keys has the whole kit. Guitar has its pages (Neck, Tab, Notation, Songs, Jam, Tuner),
but the Neck does not check what you play and none of those pages counts toward your progress. Drums has
all 40 rudiments, graded for timing, and little else. Bass has almost nothing of its own: no neck, no
lessons, and the app cannot hear its two lowest strings. There is nothing at all for a five-string or a
fretless bass.

## How to read the table

- **Works**: made for this instrument and usable as intended.
- **Partly**: you can use it, with the limit named in the cell.
- **Missing**: nothing is made for this instrument's own playing. A shared page may still open.
- **—**: does not apply to this instrument.
- **→ and a number** at the end of a cell: the task below that closes this gap. Every "Partly" and every
  "Missing" cell has one, or says "no task" with the reason under the table.

Of the 56 cells, 15 work, 26 work partly, 11 are missing and 4 do not apply.

## The matrix

| | Guitar | Bass | Keys | Drums |
|---|---|---|---|---|
| **Lessons** | **Missing.** The Neck page plays a scale for you; it does not listen or score. → 5 | **Missing.** → 12 | **Works.** 25 scale lessons, 10 speed levels each, plus notes and triads on the LUMI. | **Partly.** All 40 rudiments are in the Woodshed, as a list, not as a course. → 18, 19 |
| **Exercises** | **Partly.** 111 levels; 4 of them are on the neck. → 7 | **Partly.** The same, on a four-string neck picture. No five-string. → 14 | **Works.** 137 levels. | **Missing.** 10 levels about chords and key signatures. Nothing about rhythm. → 20 |
| **Woodshed** | **Partly.** A pentatonic exercise, tab paste, a tab view, the Mic. → 23 | **Partly.** Your runs count for bass, but every exercise is a piano or guitar one. → 15, 23 | **Works.** | **Partly.** Rudiments are graded for timing. Which hand and which drum are not checked. → 16 |
| **Help levels** | **Missing.** The neck looks the same at every level. → 6 | **Missing.** → 6, 10 (the bass neck is the same drawing) | **Works.** | **Missing.** → 17 |
| **Plan blocks** | **Partly.** A scale line opens the Neck, but that block can never be ticked off. → 4, 22 | **Partly.** A scale line finds nothing. → 22 | **Works.** A scale line opens the exact lesson. | **Partly.** "Rudiments" opens the Woodshed list, not the rudiment named. A beat finds nothing. → 22 |
| **Progress / XP** | **Partly.** Exercises and Woodshed count. Neck, Chords, Jam and Songs do not. → 4 | **Partly.** The same. → 4 | **Works.** Lessons, Exercises and Woodshed count. | **Partly.** Rudiments count. Pads do not. → 4, 17 |
| **Note input by audio** | **Partly.** Single notes over the whole guitar range. No chords. → 9 (strums are counted; chords: no task, see below) | **Partly.** The D and G strings only. The E string, the A string and a low B are not heard. → 2 | **Partly.** Single notes only. Keys use MIDI. No task, see below | **Partly.** A loud hit counts, in the Woodshed only. It cannot tell drums apart. → 16, 17 |
| **Note input by MIDI** | **Partly.** Since 2.1 a MIDI guitar with one channel per string is found by one strum, and the Neck lights the string and fret you played. Exercises and the Woodshed still grade the pitch only. → 3 | **Partly.** A MIDI bass is heard as if it were a keyboard. The string is not known. → 3 | **Works.** | **Partly.** A pad controller plays Pads. In the Woodshed any note is a hit. → 16 |
| **On-screen instrument** | **Works.** Neck, Tab, Notation; five tunings. | **Missing.** No bass neck: not 4-string, not 5-string, not fretless. → 10, 11 | **Works.** Piano. | **Partly.** Eight pads to play. Nothing to follow. → 17 |
| **LUMI lights** | **Partly.** The lights follow the Neck runner and Songs. Chords lights this chord, not the next. → 25 | — (no bass page yet) | **Works.** | **Partly.** Pads light their eight keys. No "this pad next". → 17 |
| **Tuner** | **Works.** | **Partly.** It reads the D and G strings. No bass string guide. → 13 | — | — |
| **Songs** | **Works.** Tab and MIDI, looping bars. | **Missing.** Bass tab is refused. A MIDI bass line is moved up onto a guitar. → 15 | **Partly.** A score can go to the synth or the Woodshed. The page shows guitar tab. No task in Phase C, see below | **Missing.** Drum tracks are dropped. → 26 |
| **Jam** | **Works.** The neck follows the chord. | **Partly.** Mute the band's bass and play. Nothing shows your part. → 24 | **Works.** | **Partly.** Mute the band's drums and play on Pads. Nothing shows the beat. → 24 |
| **Charts** | **Missing.** Keyboards only. → 8 | **Missing.** A bass line can be written, on a keyboard picture. → 8 | **Works.** | — |

**Gaps without a task, and why.** Of the 37 gap cells, 35 lead to at least one task. Two do not:

- *Keys · note input by audio.* A piano played into a microphone is mostly chords, and telling the notes of a
  chord apart is research, not a setting (the roadmap has such research only as "sheet-music recognition", last).
  Single notes are heard today, and keys are played over MIDI. The same limit is why guitar chords by audio have
  no task: task 9 counts strums and says so.
- *Keys · Songs.* The Songs page is rebuilt as a library in Phase G of the roadmap ("MusicXML/MIDI → Woodshed,
  per-song progress"). Until then a keys player sends a score to the Woodshed from the Songs page.

Two tasks answer the roadmap's words rather than a cell of the table: 1 (one instrument table) and 21 (more
kinds of Keys lesson).

**Five-string and fretless bass:** nothing exists in any row. The only bass tuning in the app is E A D G,
inside the Exercises questions.

## Four findings behind most of the gaps

1. **The app cannot hear a bass below its D string.** Three of the four listeners (the app-wide "Show
   notes" input, the Woodshed's Mic, the Tuner) stop at 55 or 60 Hz. A bass E string is 41 Hz, the A string
   55 Hz, a five-string's low B 31 Hz. Tested with the app's own detector on clean test tones: those three
   notes were not found by any of the three. The fourth listener (Woodshed › Guided performance › Audio)
   finds them, but only after you open its range settings and type a lower number. The detector can do it
   when it is given a longer listening window, so this is a setting to fix, not a new invention. It has not
   been tried with a real bass.
2. **A MIDI guitar's string is known on the Neck, but not yet when you are graded.** Since 2.1 a guitar that
   sends each string on its own channel is found by one strum, and the Neck lights the one string and fret you
   played. Exercises and the Woodshed still hear only the pitch, so "find it on the A string" accepts any
   string. A bass is not covered. Pitch bend is ignored by default, which suits a guitar. Not tried with a real
   MIDI guitar (the 2.1 notes say the same of the channel order).
3. **The Help level is for keys only.** Full, Colors, Target, Tonic and None change the Piano page, the Keys
   lessons and the key lights. The neck and the pads do not react to it.
4. **Only four places keep score.** Exercises, Keys lessons, Woodshed runs and Guided performance write
   progress. Time on the Neck, Chords, Jam, Songs, Pads, Charts and the Tuner counts for nothing, for any
   instrument.

Two things are better than the roadmap assumes. The drum rudiments are already there: all 40, with sticking,
accents, flams and drags, and a tempo that climbs when you play well. And each instrument already has its own
XP, streak and daily goal.

## The other three Learn categories

The instrument picker on the Learn pages has seven entries. Besides the four instruments:

- **Synth** has exactly the same exercises and lessons as Piano and keeps its own, separate progress. Its
  one extra is a button that opens the Piano page with a synth sound.
- **Voice** is for singers: the shared reading, ear and theory exercises, with pointers to the Woodshed and
  the Tuner. Since 2.1 it also has a page of its own, Train > Voice: you sing a five-note scale or hold a note,
  see your pitch as a line over the targets, and get a score for each take. Takes count toward your streak and
  daily goal, and a "sing" line in a plan opens the page. Range, warm-ups and harmony are planned there, not
  built.
- **Other** is for any instrument not on the list: the shared exercises, and a place for its progress.

## The gap list: task candidates for Phase C

Size: **S** = about a day. **M** = several days, one pull request. **L** = more than one pull request.
"Asked for by" names the roadmap line.

### Groundwork (several tasks below need these)

| # | Task | What you get | Size | Needs first | Asked for by |
|---|---|---|---|---|---|
| 1 | One instrument table | You choose "Bass, 5 strings, fretless" once. Every page then knows the strings, the tuning, the lowest note and the clef. | M | your answers to questions 1 and 2 | "Four instruments, one kit … bass (incl. 5-string fretless)" |
| 2 | One listener, with a range per instrument | A bass is heard down to its low E, a five-string down to low B, on every page, with one switch. | M | 1; a real bass to test with | "audio interface direct input (pitch detection)" |
| 3 | MIDI guitar: use the string when grading | 2.1 did the first half (found by one strum, string and fret shown on the Neck). Left: "find it on the A string" is really checked in Exercises, the Woodshed can ask for a position, and a MIDI bass with four or five channels is understood. | S–M | a MIDI guitar to test with | "any MIDI source (incl. a MIDI guitar)" |
| 4 | Progress from every practice page | Time on the Neck, on Pads and in Jam counts toward your streak and daily goal. | S per page | — | "each get … progress" |

### Guitar

| # | Task | What you get | Size | Needs first | Asked for by |
|---|---|---|---|---|---|
| 5 | Neck lessons that listen | Scale lessons on the neck with speed levels and a pass mark, graded from a MIDI guitar or the interface, like the Keys lessons. The home mockup already shows "Neck lesson 4". | L | the new neck from Phase B; 2 | "each get lessons" |
| 6 | Help level on the neck | Full, Colors, Target, Tonic and None mean the same on the neck as on the keys. | S–M | the new neck from Phase B | "each get … Help levels" |
| 7 | Neck exercises beyond note names | Play the interval, the chord tones and the scale on the neck. Staff questions answered on a neck instead of a keyboard. | M | — | Phase C: "Exercises upgrades" |
| 8 | Chord charts on the neck | The chart maker with a guitar or a bass neck, in the same file format. | M–L | the new neck from Phase B; 10 for the bass neck | "a guitar-neck chart reuses the same format later (Phase C)" |
| 9 | One-minute chord changes as a real drill | Changes counted from your playing instead of the space bar, a record per chord pair, XP. | M | 3. Limit: through the interface the app can count strums but cannot tell chords apart. | "The one-minute chord changes become a real Exercises drill in Phase C" |

### Bass

| # | Task | What you get | Size | Needs first | Asked for by |
|---|---|---|---|---|---|
| 10 | A bass neck with 4 or 5 strings | Neck, Tab and Notation for bass: E A D G or B E A D G, bass clef, bass tunings. | L | 1; the new neck from Phase B | "bass (incl. 5-string fretless)" |
| 11 | Fretless neck and intonation practice | A neck without fret wires. Long-tone practice that shows how many cents sharp or flat you are. | M | 2, 10; your answer to question 3 | "5-string fretless" |
| 12 | Bass lessons | Root and fifth, octave shapes, scales in one position, walking patterns over a blues, with levels. | M | 5, 10 | Phase C: "bass lessons" |
| 13 | Bass in the Tuner | Bass tunings in the string guide. The needle reads low E and low B. | S | 1, 2 | Tuner is on the keep list |
| 14 | Bass in Exercises | The five-string neck in questions. Bass topics: root and fifth, octaves, reading a bass line. | M | 1 | "each get … exercises" |
| 15 | Bass in the Woodshed and Songs | Scale exercises in the bass register, four- and five-line bass tab, a bass tab view, bass lines left in their own octave. | M | 1, 2. The Songs half can wait for Phase G. | "each get … Woodshed" |

### Drums

| # | Task | What you get | Size | Needs first | Asked for by |
|---|---|---|---|---|---|
| 16 | Grade which drum and which hand | A kick on a snare stroke is a miss. Right and left are told apart. A drum MIDI file shows each drum in its own lane. | M | — | Phase C: "drum rudiments (Pads + Woodshed drums)" |
| 17 | Pads rebuilt as rhythm practice | The pattern lights up on the pads, you play it, it is graded. Record and Play loop come back. The Help level decides how much the pads show: names and the next pad, only the next pad, or nothing. A hit heard through the microphone counts here as it does in the Woodshed. Time on Pads counts toward your goal. | L | 16; the new pads from Phase B | "Pads (rebuilt as rhythm practice: drum rudiments)"; "each get … Help levels" |
| 18 | A rudiment course | The 40 rudiments in an order, with a pass mark that opens the next one. | M | 16 | Phase C: "drum rudiments" |
| 19 | Beats and fills | Rock, sixteenth-note, shuffle and fill patterns to practice at a rising tempo. | M | 16, 17 | "each get lessons" |
| 20 | Rhythm exercises | A Rhythm topic in Exercises: note values, counting, time signatures, tap the rhythm back. For drummers and for everyone else. | L | — | "each get … exercises" |

### Keys and the shared pages

| # | Task | What you get | Size | Needs first | Asked for by |
|---|---|---|---|---|---|
| 21 | More kinds of Keys lesson | Arpeggios, hands together, chords. LUMI note and triad targets as lesson types. | L | — | Phase C: "Keys + Exercises upgrades" |
| 22 | Plan blocks for every instrument | "G major scale" opens the bass lesson for a bassist. "Paradiddles" opens that rudiment. "Rock beat" opens the beat. The starter plan fits your instrument. | M | 5, 12, 17, 18. Overlaps Phase D ("Plan upgrade"). | "each get … plan blocks" |
| 23 | The Woodshed follows your instrument | What fits your instrument comes first. "+ Scale" is in your range. The Mic is offered for every piece. | S–M | 1 | "each get … Woodshed" |
| 24 | Jam for the player | "I play: bass" mutes that band member and shows your part: roots and fifths on the bass neck, the beat on the pads. | M | 10, 17 | Phase C: "slim Jam" |
| 25 | Next chord on the lights | The Chords page lights this chord and blinks the next one. | S | —. May belong to Phase E. | "Chords (now + next chord on the LUMI)" |
| 26 | Drum tracks in Songs | The drum track of a MIDI file is kept, shown in lanes, loops with the song and can go to the Woodshed. | M | 16. Can wait for Phase G. | Songs is on the keep list; "each get … Woodshed" |

### A sensible order

1. Groundwork 1 and 2. Most bass tasks wait for them.
2. Drums 16, 17, 18. Most of the engine exists already, so this is the quickest full kit.
3. Guitar 5 and 6. This is what the home mockup promises.
4. Bass 10, 12, 13, then 11.
5. The rest, as the plan and the songs phases reach them.

### For the developer: files and roadmap lines per task

Roadmap lines are those of `docs/ROADMAP-2.0.md` at commit `a914df2`.

| # | Files the task would touch | Roadmap line |
|---|---|---|
| 1 | `js/theory.js` (tunings), `js/learn-instruments.js`, one new stored setting; the seven category names are written out in six files (see "Categories" below) | 23-24 |
| 2 | `js/tonein.js`, `js/practice-input.js`, `js/woodshed.js` (its Mic), `js/tuner.js`, `js/performance-player.js` (range defaults) | 25-27 |
| 3 | `js/midi.js`, `js/fretboard.js`, `js/quiz.js`, `js/settings.js` | 26 |
| 4 | `js/fretboard.js`, `js/pads.js`, `js/jam.js` | 23-25 |
| 5 | a new lesson file modelled on `js/keylessons.js`; `js/fretboard.js` (the runner); `js/practiceplan.js` | 23-27 |
| 6 | `js/fretboard.js`, `js/chords.js` | 23-25 |
| 7 | `js/quiz.js`, `js/learn-instruments.js` | 59 |
| 8 | `js/chordchart.js`, a neck diagram | 48-49 |
| 9 | `js/trainer.js`, `js/quiz.js` | 86-87 |
| 10 | `js/fretboard.js` (six strings are written into about fifteen places), `js/theory.js`, `css/` | 23-24 |
| 11 | `js/fretboard.js`, `js/practice-input.js`, `js/tuner.js` | 23 |
| 12 | the lesson file of task 5, a bass lesson list | 59 |
| 13 | `js/tuner.js`, `js/theory.js` | 22-23 |
| 14 | `js/quiz.js` | 23-25 |
| 15 | `js/woodshed.js`, `js/songs.js` | 23-25, 63 |
| 16 | `js/woodshed.js`, `js/pads.js`; changes `tests/performance-import.test.js` | 59 |
| 17 | `js/pads.js`, the grading part of `js/woodshed.js`; changes `tests/trim.test.js` | 21-22, 59, 84-85 |
| 18 | `js/woodshed.js`, a lesson list | 59 |
| 19 | pattern data; `js/woodshed.js` or the Pads engine | 23-25 |
| 20 | `js/quiz.js`, `js/learn-instruments.js`; changes `tests/learn-instruments.test.js` | 23-25 |
| 21 | `js/keylessons.js`, `js/lumi-practice.js`, `js/practiceplan.js` | 59 |
| 22 | `js/practiceplan.js`, an "open this piece" hook in `js/woodshed.js` | 23-25, 60 |
| 23 | `js/woodshed.js` | 23-25 |
| 24 | `js/jam.js`, `js/fretboard.js`, `js/pads.js` | 21, 59 |
| 25 | `js/chords.js` | 18-19, 59 |
| 26 | `js/songs.js` (the drum channel is dropped at `:144`), `js/woodshed.js` | 20-21, 63 |

## Decisions for you

Work can start on the recommended answers. Say so where you want something else. The Phase B plan repeats these
questions in its own list for you (`docs/plans/phase-b/PLAN.md`, section 9: items 11 and 14 to 18); an answer
given there is copied here.

1. **Does "Synth" stay in the instrument picker?** Recommended: no. Show Guitar, Bass, Keys and Drums, with
   Voice and Other behind "More". Piano and Synth have the same content, and two entries split your keys
   progress in two. Progress already saved under Synth is kept and shown with Keys. (Phase B only moves Synth,
   Voice and Other under "More"; taking Synth out is task 1.)
2. **Where does bass live?** The header has five tabs: Learn, Guitar, Keys, Play, Train. Recommended: bass
   shares the Guitar tab. Neck, Tab and Notation draw whichever instrument you chose. The Phase B plan builds
   the header with these five tabs either way, so your answer can wait until Phase C starts.
3. **What should "fretless" do?** Recommended: first a neck drawn without fret wires that otherwise works
   like the fretted one. Intonation practice with a cents display comes after it (task 11).
4. **Where do drums live?** Recommended: Pads stays under Keys for now. When it is rebuilt (task 17) it
   moves next to the neck, so one tab holds "your instrument".
5. **Help level on the neck: Phase B or Phase C?** Recommended: Phase B. The key bar with its Help control
   is on every page; on the Guitar tab that control would do nothing until the neck obeys it. (The Phase B
   plan does it in its step B13 unless you say no; task 6 is then done.)
6. **May a bass note be recognized a little later than a guitar note?** A low B needs a longer listening
   window. Recommended: yes, for bass only. Guitar keeps today's speed.
7. **Do rudiments need "which hand"?** That takes two pads or two keys. Recommended: yes on Pads and on an
   e-kit; "timing only" stays for a practice pad heard through a microphone, which cannot tell hands apart.

## What was not tested

- No real instrument, audio interface, MIDI guitar, e-kit or LUMI was used. Everything about hearing a bass
  comes from the code and from clean test tones. Everything about a MIDI guitar comes from the code and from
  notes sent inside the app.
- The full test suite was not run for this page. The rudiments have no automated test; one run was played
  in the browser by script (32 of 32 strokes, credited to drums).
- soundLAB Gear, the Android app and the light theme were not looked at.

## Where the facts come from

Lines are those of commit `a914df2` (`git show a914df2:<file>`). soundLAB 2.1.0 has since moved lines in
`js/quiz.js`, `js/midi.js`, `js/fretboard.js`, `js/settings.js` and `js/practiceplan.js`. The longer version, with every check that was run, is the map
`map-matrix.md` that belongs to the Phase B plan.

| Row | Evidence |
|---|---|
| Categories | `js/learn-instruments.js:5-28`; the same seven names in `js/performance-player.js:9`, `js/practice-progress-ui.js:6`, `js/practice-progress.js:20`, `js/practiceplan.js:22`, `js/xp.js:24` |
| Tabs and pages | `js/app.js:78-85` |
| Lessons | Keys: `js/keylessons.js:59-85`. Guitar runner: `js/fretboard.js:818-823`, `:1270-1283`; "casual tool": `js/practiceplan.js:94`. Rudiments: `js/woodshed.js:119-190`, `:1176-1182` |
| Exercises | Course: `js/quiz.js:953-1050`. Neck levels: `:967-969`, `:977-979`. Bass neck: `:326-330`. "Play" tasks in piano mode only: `:910-912`, `:927-929`, `:942-944`. Drums: `js/learn-instruments.js:9`, `:16` |
| Woodshed | Generators: `js/woodshed.js:50-117`; "+ Scale" is always piano: `:1379`. Six-line tab only: `:346-391`. Drums, any hit counts: `:604`, `:627`. Drum file lanes: `:317`, `:331`. Credit: `:445-447` |
| Help levels | Defined: `js/app.js:1258-1277`. Read by `js/piano.js:97-98`, `js/keylessons.js:864`, `js/midi.js:1093`, `:1150-1183`, `js/lights.js:70-80`. Not read by `js/fretboard.js`, `js/pads.js`, `js/woodshed.js` |
| Plan blocks | Rules: `js/practiceplan.js:9-18`. Scale lines: `:88-108`. Starter plans: `:118-127`. What can complete: `:172-175`, `:190`, `:284` |
| Progress | Written by `js/quiz.js:1602`, `:1711`; `js/keylessons.js:94`; `js/woodshed.js:447`; `js/performance-player.js:58`. No other page writes it |
| Audio | App-wide input: `js/tonein.js:28-31`, `:43`, `:56`, `:99`. Woodshed Mic: `js/woodshed.js:722-783`, `:1218-1220`. Tuner: `js/tuner.js:199-203`, `:360`. Guided performance: `js/practice-input.js:47-59`, `:95-97`, `:124`, `:168-169`; default lowest note: `js/performance-player.js:333`. Detector: `js/pitch-detector.js:15`, `:28-31` |
| MIDI | Every channel: `js/midi.js:134-143`. Bend off by default: `:65-67`, `:144-146`. Neck by pitch only: `js/fretboard.js:446-459`. String not checked for MIDI: `js/quiz.js:1776-1778`, `:2937`. Pads maps: `js/pads.js:32`, `:61-74` |
| On-screen | Tunings: `js/theory.js:65-72`. Six strings in the Neck: `js/fretboard.js:359-422`, `:2123`. Notation clef: `:1111-1116`. Pads play-only: `js/pads.js:21-24` |
| LUMI | Engine: `js/midi.js:1150-1218`. Neck: `js/fretboard.js:818-823`. Chords, this chord only: `js/chords.js:640`. Pads: `js/pads.js:85-113`. Woodshed drums, none: `js/woodshed.js:798` |
| Tuner | `js/tuner.js:139-192`, `:415-438`, `:442-466` |
| Songs | Six-line tab: `js/songs.js:76`, `:682`. Drum channel dropped: `:144`. Low notes moved up: `:168-171`. Open a score: `:546` |
| Jam | Mixer with a Mute per player: `js/jam.js:1090-1105`. Neck follows: `js/fretboard.js:466-503` |
| Charts | Keyboards only: `js/chordchart.js:1-6`, `:18-21` |

## Changed by soundLAB 2.1.0 (19 November 2026)

2.1.0 was built in another line of work while this page waited to be merged. It closes part of three gaps and
changes no cell's status (the counts above stand):

- **MIDI guitar** (`js/midiguitar.js`, `docs/MIDI-GUITAR.md`): a guitar with one MIDI channel per string is
  found by one strum; the Neck lights the string and fret played (`js/fretboard.js`, the `guitar:note` event).
  Task 3 is now only its second half: use the string when grading. Finding 2 and the guitar cell of "Note input
  by MIDI" are rewritten above.
- **Voice trainer** (`js/vocal.js`, page `vocal`, Train > Voice, `docs/VOCAL-TRAINER.md`): the Voice category
  has a page of its own. soundLAB has 15 pages with it. It is not one of the four instruments of the table.
- **Weak-spot map** (`js/quiz.js`): Exercises shows which frets and strings (guitar, bass) or which notes (keys)
  you miss or answer slowly, and the note levels ask those more often. This helps the "Exercises" row for
  guitar, bass and keys; the gaps named there (few neck levels, no five-string, no bass topics) are unchanged.

## Changed by Phase B

Nothing yet. Each step of Phase B that changes a cell of the table corrects the cell and adds one line here
(the plan names them: where the instrument is chosen, the home, the Piano's and the pads' picture, the Help
level on the neck, one way of showing lit notes on every instrument).
