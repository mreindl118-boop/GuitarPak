# soundLAB 2.0 Phase B: the wording list (rule 16)

Rule 16 of `docs/plans/phase-b/PLAN.md` asks for plain words: a text says what happens, in sentence case, without
the words *legacy*, *canonical*, *context*, *disclosure*, *module*. This is the list of the texts that exist
today and break that rule: 227 rows, 214 for soundLAB and 13 for soundLAB Gear. A row is one text as the
screen shows it. It says where the text is in the code, where the user sees it, what it says today, a proposal
in plain words, whether a suite reads the text, and which step rewords it.

Nothing in the app changes with this file. Line numbers are those of this branch: `js/`, `index.html` and
`gear.html` are the same here as in commit `0133287` (B1a), and the three lines the plan names
(`js/woodshed.js:1140`, `js/practiceplan.js:292`, `js/quiz.js:2088`) are where they were in `a914df2`.

## How to read a row

| Column | Meaning |
|---|---|
| Line | File and line, or lines, that hold the text. A script checked that each quoted piece is on those lines. Rows are in the order of the lines within each file |
| Where it is shown | Tab, page, card or sheet, and what has to happen before the text appears |
| Today | The text word for word. `…` stands for a part that changes (a name, a number) or for the rest of a longer line. ` / ` separates the forms one text can take. ` · ` separates several texts that sit on the same line or lines. Where the code builds a text from pieces (a fixed start and one of several endings, a number in the middle), the column shows the text as the screen shows it, and the pieces are on the lines named |
| Proposal | The same in plain words. Names and numbers in a proposal are examples |
| Why | **W** uses one of the five words. **R** uses a close relative: a word from inside the program that a musician does not know (the word list is in “How this list was made”). **S** names a setting or a part of the app instead of saying what it does. **P** found by reading: none of the listed words, and still not plain |
| Pinned by | The suite line that reads this text, or “not pinned”. A pinned text cannot change without that line |
| Step | The step that rewords the row (see below) |

**First screen** means: what a page or a sheet shows when it opens, before anything is tapped, used the way it
is meant to be used (the lights sheet with a LUMI connected, Practice progress with some practice in it). A
text inside a closed fold, behind a tab of the page, in a tour, or shown only after a tap or a fault is not on
the first screen. How far down the page a text sits does not matter: it needs no tap, so everybody reads it. A
tooltip belongs to its control. The plan uses the words “first screen” without saying what they cover; this is
the reading used here.

**Step.** Rule 16 decides it:

- **B7a, B11, …** (a step alone): the text is on the first screen of that step’s page and no suite pins it. The
  step that re-skins the page rewords it. Section 3 of the plan says which step owns which page.
- **B5a (plan)**: the plan itself edits this line in that step, for the reason its section gives (the key bar),
  and names the suite lines that change with it. The row adds the plain words to that edit.
- **Phase C or D**: everything else: the text is pinned, or it is not on a first screen. B18 writes these rows
  into the Phase C and D rows of the roadmap.
- **Phase C or D †**: on a first screen and not pinned, but the row carries a name that is pinned or shown
  deeper in another row. A name changes in every place in one step, so the row waits with its name (next
  section).
- **Phase H**: Gear’s own pages, which Phase B does not change.

## The words the proposals use

The proposals say the same thing the same way everywhere. Four of these rename something the owner knows by
its old name and are his to decide; they are marked.

| Today | Proposal | |
|---|---|---|
| Legacy / unassigned | Earlier practice; “from before you picked an instrument” | owner |
| Consistency level, consistency XP, decay | Habit level, habit points, “fades” | owner |
| Simulated / Hardware (the two ways to use the LUMI section) | On screen / With my keyboards | owner |
| armed, disarmed, arm output (the LUMI section) | lights on, lights off, “Light the LUMI” | owner |
| LUMI Display | LUMI lights | plan, B5a |
| the treble-clef menu, the clef menu, the context bar | the key bar | plan, B5a |
| Scale Lock (as a bare label) | “Scale lock” with its state as a sentence: “ON · only A Dorian notes sound” | plan, D17 |
| canonical observations, observations | practice; what you played | |
| engaged minutes, engaged practice | minutes practised, time practised | |
| Lifetime earned XP | All-time XP | |
| Credit, Credit category, Completion category, Practice credit | Counts for, Counted for | |
| Learn category | your instrument | |
| guided module, module gaps, setup hook | exercise; “soundLAB has no exercise for this yet”; “the plan cannot open this for you yet” | |
| mapping (of lesson notes) | the practice blocks soundLAB made from the notes | |
| parse, parsed | read | |
| target | the note, or notes, to play | |
| answer input, display output, port | the keyboard you answer on, the LUMI that shows the notes, keyboard | |
| synth sound route | passing your notes on to the synth | |
| virtual keys, virtual input | the keys on screen | |
| onset, attack | when a note starts; a note | |
| raw accuracy | notes right | |
| observed tempo, completed tempo | tempo you practised at, tempo of finished runs | |
| monophonic | one note at a time; single notes | |

Spelling is one more open point. The app writes “color” and, in most places, “practice” for the verb; newer
texts (`js/app.js:1935`, the Exercises tour) and the plan’s new sentences (“Practising: Guitar”, D23) write
“practise”. The proposals keep “color” and write “practise” for the verb. One spelling should be chosen in B5a,
where the first new sentences go in.

## Names that change in every place at once

Seven of the proposals are new names for something the app shows in several places. If one place gets the new
name and another keeps the old one, the page is worse than before. So a name waits as a whole when one of its
rows is pinned by a suite, or sits where Phase B does not reword (not on a first screen). That is the † in the
Step column. A row that carries two names waits if either of them does, and then holds the other name back as
well: that is why the two tempo names wait although no suite pins them (the table head
`js/practice-progress-ui.js:101-103` also carries “engaged minutes” and “raw accuracy”). If the owner wants one
of these names in Phase B, the page step has to take all its rows and the suite lines named here: that is more
than rule 16 gives a page step, and needs a yes.

| Name today | Proposal | Rows that carry it | Suite lines that pin one of these rows | Phase B |
|---|---|---|---|---|
| Consistency level, consistency XP, decay | Habit level, habit points, “fades” | `js/quiz.js:1902`, `js/quiz.js:2088`, `js/quiz.js:2093`, `js/practice-progress-ui.js:56`, `js/practice-progress-ui.js:116`, `js/practice-progress-ui.js:117`, `js/practice-progress-ui.js:61`, `js/practice-progress-ui.js:9-19`, `js/practice-progress-ui.js:64-65`, `js/performance-player.js:67`, `js/help.js:85` | `tests/learn-instruments.test.js:195`, `tests/practice-progress-ui.test.js:63`, `tests/performance-progress.test.js:53` | waits; † on `js/quiz.js:1902`, `js/practice-progress-ui.js:116`, `js/practice-progress-ui.js:61` |
| engaged minutes, engaged practice | minutes practised, time practised | `js/quiz.js:1898`, `js/quiz.js:1901`, `js/quiz.js:2409`, `js/quiz.js:2034`, `js/quiz.js:2090`, `js/quiz.js:2091`, `js/quiz.js:2093`, `js/quiz.js:2094`, `js/quiz.js:2098`, `js/quiz.js:2237`, `js/quiz.js:2238`, `js/practice-progress-ui.js:119`, `js/practice-progress-ui.js:126`, `js/practice-progress-ui.js:128-129`, `js/practice-progress-ui.js:90-94`, `js/practice-progress-ui.js:101-103`, `js/practice-progress-ui.js:9-19` | `tests/game.test.js:126`, `tests/practice.test.js:99`, `tests/practice.test.js:100`, `tests/practice.test.js:101`, `tests/practice-progress-ui.test.js:74` | waits; † on `js/quiz.js:1898`, `js/quiz.js:1901`, `js/practice-progress-ui.js:119`, `js/practice-progress-ui.js:126`, `js/practice-progress-ui.js:90-94`, `js/practice-progress-ui.js:101-103` |
| Lifetime earned XP, Lifetime | All-time XP, All time | `js/quiz.js:1898`, `js/quiz.js:2089`, `js/practice-progress-ui.js:116`, `js/performance-player.js:67` | `tests/learn-instruments.test.js:195`, `tests/practice.test.js:99`, `tests/performance-progress.test.js:53` | waits; † on `js/quiz.js:1898`, `js/practice-progress-ui.js:116` |
| Observed tempo, Completed tempo | Tempo you practised at, Tempo of finished runs | `js/practice-progress-ui.js:122`, `js/practice-progress-ui.js:123`, `js/practice-progress-ui.js:101-103` | not pinned | waits; † on `js/practice-progress-ui.js:122`, `js/practice-progress-ui.js:123`, `js/practice-progress-ui.js:101-103` |
| raw accuracy | notes right | `js/practice-progress-ui.js:120`, `js/practice-progress-ui.js:128-129`, `js/practice-progress-ui.js:101-103` | `tests/practice-progress-ui.test.js:57`, `tests/practice-progress-ui.test.js:77`, `tests/practice-progress-ui.test.js:74` | waits; † on `js/practice-progress-ui.js:101-103` |
| Legacy / unassigned | Earlier practice | `js/learn-instruments.js:51`, `js/help.js:84`, `js/quiz.js:1196` | `tests/learn-instruments.test.js:194`, `tests/practice.test.js:102` | waits |
| Credit, Credit category, Completion category, Practice credit | Counts for, Counted for | `js/quiz.js:1414`, `js/quiz.js:1580`, `js/keylessons.js:538`, `js/woodshed.js:1183` | `tests/learn-instruments.test.js:72`, `tests/instrument-xp.test.js:102`, `tests/instrument-xp.test.js:110` | waits |

Three things the plan itself changes leave stragglers that it does not list:

- **“LUMI Display” becomes “LUMI lights”** on the switch (`js/app.js:1675`). The old name stays in
  `js/midi.js:450` (the status sentence shown beside that switch; B5a.2 keeps “the status sentences of
  `js/midi.js:448`”, and lines 448 to 450 are one expression), in `js/help.js:129` (a
  tour step’s title) and in `js/performance-player.js:217`. B5a also edits `js/lumi-practice.js:183`, `:378`
  and `:480`, `js/lights.js:96` and `:118` and `js/keylessons.js:575` only to say “the key bar” for “the clef
  menu”; each of them names “LUMI Display” too. The rows of this list give all of them the new name.
- **The time signature leaves the bar** for the metronome sheet. `js/settings.js:110` still says the bar holds
  it.
- **The Learn bar goes** in B8. `js/trainer.js:470` sends the user to “the Learn bar at the top of this page”,
  and `tests/trim.test.js:482` pins those words.

## Shell: a page that did not start

Shown only after a fault, so no step has it on a first screen.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/app.js:1815` | Any page, in place of its content, when the page’s script did not load | Module "…" failed to load (script error?). Check the console. | This page could not be loaded. Reload soundLAB to try again. | W | `tests/smoke.test.js:88`<br>`tests/storage-import.test.js:178`<br>`tests/trim.test.js:181` | Phase C or D |
| `js/app.js:1822` | Any page, in place of its content, when the page failed while starting | Module "…" crashed during init: … | This page could not start (…). Reload soundLAB to try again. | W | `tests/smoke.test.js:88`<br>`tests/storage-import.test.js:178`<br>`tests/trim.test.js:181` | Phase C or D |

Notes:

- `js/app.js:1815`: The three suites look for the words “failed to load” and “crashed during init” to prove that no page is broken. A new sentence without them makes the suites blind, so the suite lines change with it. The same holds for `js/app.js:1822`.

## Shell: key, scale and tempo (the key bar from B5a on)

Today these texts sit in a dropdown behind the clef button, on every page of both apps, so none of them is on a first screen. B5a turns the dropdown into the key bar, which is always shown.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/app.js:1670` | Key, scale & tempo dropdown (the clef button), the note under the two switches while Scale Lock is on | Only … pitched notes play across tools, playback and MIDI. Drums and recorded/live audio keep their own sound. | ON · only A Dorian notes sound (the plan’s sentence, D17). In the lock’s panel, once: “Drums and audio you record always sound.” | P | `tests/lights.test.js:114` | B5a (plan) |
| `js/app.js:1675` | Key, scale & tempo dropdown, first switch | LUMI Display | LUMI lights (the plan’s label, B5a) | S | `tests/display-master.test.js:80` | B5a (plan) |
| `js/app.js:1679` | Key, scale & tempo dropdown, second switch | Scale Lock | A switch “Scale lock” with its state as a sentence beside it: “ON · only A Dorian notes sound” / “OFF · every note sounds” (B5a) | S | not pinned | B5a (plan) |
| `index.html:55`<br>`gear.html:54` | Tooltip of the LUMI Display switch | Show the selected scale and practice targets on the configured LUMI; independent of Scale Lock | Lights the scale and the notes to play on your LUMI. Scale lock does not change the lights. | R | not pinned | B5a (plan) |
| `index.html:56`<br>`gear.html:55` | Tooltip of the Scale Lock switch | Block out-of-scale pitched notes across instruments, playback and musical MIDI output; drums and recorded/live audio are separate | Notes outside the scale make no sound, anywhere in soundLAB. Drums and audio you record always sound. | P | not pinned | B5a (plan) |
| `js/midi.js:448` | Three places: the note under the switches in the dropdown, the status line of the Lights & help sheet, the “LUMI Display:” line of the guided performance player. Shown while LUMI Display is on and no LUMI was chosen | Choose a LUMI display output on the Piano page…, under Notes and triads on the LUMI (MIDI must be connected). | No LUMI chosen yet. Connect your keyboard, then pick your LUMI on the Piano page under “Notes and triads on the LUMI”. | S | `tests/gear.test.js:654`<br>`tests/gear.test.js:664`<br>`tests/context-global.test.js:85` | Phase C or D |
| `js/midi.js:449` | The same three places, while the chosen LUMI is not connected | The configured LUMI display is disconnected or unavailable; no fallback is used. | Your LUMI is not connected. No other keyboard is lit in its place. | R | not pinned | Phase C or D |
| `js/midi.js:450` | The same three places, with a LUMI connected | LUMI Display is off. / LUMI Display is on: …. | LUMI lights are off. / LUMI lights are on: …. | S | not pinned | Phase C or D |

Notes:

- `index.html:55`: B4 moves the bar’s markup from the two HTML files into js/shell.js unchanged; B5a rewrites it there. The same holds for index.html:56.
- `js/midi.js:448`: `tests/gear.test.js:654` and `:664` pin the sentence; `tests/context-global.test.js:85` accepts any of “unconfigured”, “select”, “configured”, “connect”. B5a.2 of the plan keeps this sentence as it is.
- `js/midi.js:450`: B5a renames the switch to “LUMI lights” and shows this sentence in the lights panel beside it. Unless B5a takes the line along, the panel then says “LUMI lights” and “LUMI Display is on” side by side (see “Names that change in every place at once”).

## Shell: the instrument bar above the Learn pages (the Instrument sheet from B8 on)

`js/learn-instruments.js`. Shown above Exercises, Chords, Circle and Plan.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/learn-instruments.js:17` | Bar above the four Learn pages, fold “About instrument categories”, with Voice chosen | Shared notation, pitch and ear training. Use monophonic pitch practice for sung notes; this is not a vocal technique curriculum. | Notation, pitch and ear training. To practise sung notes, use “Sing single notes”. soundLAB does not teach singing technique. | R | not pinned | Phase C or D |
| `js/learn-instruments.js:18` | The same fold, with Other chosen | Shared notation, ear training and theory, with an explicit Other instrument credit category. | Notation, ear training and theory. What you practise is counted for “Other”. | R | not pinned | Phase C or D |
| `js/learn-instruments.js:26` | Bar above the four Learn pages, second button with Voice chosen (label and the small line under it) | Monophonic pitch practice · Audio or virtual input | Sing single notes · Microphone or on-screen keys | R | not pinned | B8 |
| `js/learn-instruments.js:27` | Bar above the four Learn pages, small line under “Performance practice” with Other chosen | Explicit instrument selection | Counts for “Other” | R | not pinned | B8 |
| `js/learn-instruments.js:51` | Bar above the four Learn pages, fold “About instrument categories” | Notation, ear training and theory are shared content. Each run keeps the instrument selected at its start. Earlier unassigned history remains Legacy / unassigned. | Notation, ear training and theory are the same for every instrument. A run counts for the instrument you had picked when it started. Practice from before you picked an instrument is kept on its own, as “Earlier practice”. | W | not pinned | Phase C or D |

## Shell: the Lights & help sheet (“Keyboard lights” from B5b on)

`js/lights.js`. The rows listed here show when a LUMI is connected, which is how the sheet is used.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/lights.js:96` | Lights & help sheet, section Keyboard lights, with a LUMI connected | LUMI Display has one master switch in the treble-clef menu. Brightness and color settings below change its appearance. | Switch the LUMI lights on and off in the key bar. Brightness and colors are set here. | S | not pinned | B5a (plan) |
| `js/lights.js:105` | Lights & help sheet, under the color swatches, with a LUMI connected and Color notes by: Note | Every scale key lights in its note color, with the same mapped screen/program color (top: screen, bottom: emitted color); keys outside the scale stay dark. | Every key of the scale lights in its note color. Top swatch: the color on screen. Bottom swatch: the color the LUMI shows. Keys outside the scale stay dark. | R | not pinned | B7a |
| `js/lights.js:106` | The same line with Color notes by: Interval | Every key lights in its scale-degree color, with the same mapped screen/program color (top: screen, bottom: emitted color). | Every key lights in the color of its scale degree. Top swatch: the color on screen. Bottom swatch: the color the LUMI shows. | R | not pinned | B7a |
| `js/lights.js:107-108` | The same paragraph, its last three sentences | Active notes keep their shared pitch color; target focus uses timing and highlights. Answer feedback uses labels and highlights while retaining pitch identity. Edit natural-note colors in the Fretboard settings. | A note keeps its color while you play it. Right and wrong are shown by a mark, never by another color. Change the colors of the natural notes in the Neck’s settings. | R | not pinned | B7a |
| `js/lights.js:113` | Lights & help sheet, with a LUMI connected: the row’s label, and the name a screen reader gives the On / Off pair | Guide focus (group name: Legacy guide focus style) | During a lesson, with the two buttons “Only the notes to play” and “Scale and notes to play” in place of On and Off | W | not pinned | B7a |
| `js/lights.js:116` | Lights & help sheet, under the Guide focus row, when it is On | Legacy guides focus the target; the next target blinks. | In a lesson the LUMI lights only the note to play; the next one blinks. | W | not pinned | B5a (plan) |
| `js/lights.js:117` | The same line when it is Off | Legacy guides keep the scale alongside the target. | In a lesson the scale stays lit around the note to play. | W | not pinned | B5a (plan) |
| `js/lights.js:118` | The same paragraph, its last two sentences | Pitch colors always follow Intervals or Note Names in the clef menu. Its LUMI Display master controls illumination and prioritizes active targets; brightness does not affect sound. | The colors follow “Color notes by” in the key bar. Brightness changes the lights only, never the sound. | R | not pinned | B5a (plan) |

Notes:

- `js/lights.js:113`: This row and `js/keylessons.js:575` name the same switch, “Guide focus”. They should get their new words in one step; B5a edits both files.

## Shell: messages

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/xp.js:78` | A box fixed to the bottom of any page, after a lesson or an Exercises level could not be saved | Lesson progress was not saved. Retry or export the original observations before closing this page. | Your lesson progress could not be saved. Tap “Retry save”, or “Export unsaved” to keep it as a file, before you close this page. | R | not pinned | Phase C or D |

## Shell: the help tours

`js/help.js`. A tour opens from the ? button, so none of its texts is on a first screen.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/help.js:26` | Help tour of the Plan page, step 1 | …paste or import the text, review the mapping and accept it.… | …paste or import the text, look at the practice blocks soundLAB made from it and accept them.… | R | not pinned | Phase C or D |
| `js/help.js:28` | Help tour of the Plan page, step 3 “What to build next” | Unmatched assignments and missing setup hooks become module gaps with their original text. Export them to choose future improvements. Google Doc links are bookmarks; no account connection is required. | Lines of your notes that soundLAB has no exercise for are listed here in your teacher’s words. Export the list to say what should be built next. A Google Doc link is only a bookmark: soundLAB never signs in to Google. | W | not pinned | Phase C or D |
| `js/help.js:40` | Help tour of the Neck page, step 2 “Pick your key and scale” | Tap the clef for the shared key and scale. Scale Lock blocks out-of-scale pitched notes across tools, playback and MIDI; drums and recorded/live audio keep their own sound. LUMI Display independently shows the selected scale and practice targets on the configured LUMI. Its connection status appears here. | The bar under the top row holds key, tempo, Scale lock, lights and Help; it is the same on every page (the plan’s sentence, B5a). Add: “With Scale lock on, notes outside the scale make no sound.” | R | not pinned | B5a (plan) |
| `js/help.js:61` | Help tour of the Piano page, step “Notes and triads on the LUMI” | …the double-tap key from Settings › Hands-free control works here too when it is on, in Simulated mode.… | …the double-tap key from Settings › Hands-free control works here too when it is on, while you answer on screen.… | R | not pinned | Phase C or D |
| `js/help.js:77` | Help tour of the Woodshed, step 3 “Feed it music” | …PDFs and images are not parsed scores.… | …soundLAB cannot read notes from a PDF or a picture.… | R | not pinned | B5a (plan) |
| `js/help.js:84` | Help tour of Exercises, step 2 “Your instrument” | …a run keeps the instrument it started with, and history from before instruments were tracked stays as Legacy / unassigned. | …a run counts for the instrument it started with, and practice from before you picked an instrument is kept on its own, as “Earlier practice”. | W | not pinned | Phase C or D |
| `js/help.js:85` | Help tour of Exercises, step 3 “Your day” | …XP raises your consistency level: a habit meter that fades after a break, not a skill level.… | …XP raises your habit level: it fades after a break and is not a skill level.… | S | not pinned | Phase C or D |
| `js/help.js:129` | Help tour of the Lights & help sheet, the title of step 3 | LUMI Display | LUMI lights | S | not pinned | Phase C or D |

Notes:

- `js/help.js:84`: B8 edits this line for another reason (the step then points at the instrument button, plan B8.1). The name “Legacy / unassigned” waits with the Exercises card that carries it (js/quiz.js:1196, pinned).
- `js/help.js:85`: The name is explained here. The line is listed because it has to follow if “Consistency level” gets another name.
- `js/help.js:129`: B5a renames the switch to “LUMI lights” (js/app.js:1675). From then on this title names something that is gone; B5b edits lines 126-128 of this file and can take it along.

## Learn › Exercises

`js/quiz.js`, and one text it takes from `js/xp.js`.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/quiz.js:1191` | Exercises start, a box above the numbers, only after saving a level failed | Practice progress has not been saved. … session(s) are retained for retry. No unconfirmed XP is shown as earned. | Your practice could not be saved. 2 sessions are waiting; their XP is added as soon as saving works. | P | `tests/learn-instruments.test.js:170` | Phase C or D |
| `js/quiz.js:1196` | Exercises › Progress, last card | Legacy / unassigned · … earlier course records · … historical XP. These records are preserved separately; they are not copied into any instrument category. | Earlier practice · 14 levels and 77 XP from before you picked an instrument. They are kept here and are not added to any instrument. | W | `tests/learn-instruments.test.js:194`<br>`tests/practice.test.js:102` | Phase C or D |
| `js/quiz.js:1414` | Exercises, while a level runs: the small line under the level’s name | Credit category: … · … | Counts for: Bass · Four-string bass | R | `tests/learn-instruments.test.js:72` | Phase C or D |
| `js/quiz.js:1438` | Exercises, while a level runs with LUMI lights on, for a question without notes | LUMI: this exercise has no playable note target. | LUMI: this question has no note to light. | P | `tests/lumi-contexts.test.js:233` | Phase C or D |
| `js/quiz.js:1580` | Exercises, the result of a level: the small line above the card | Completion category: … · … | Counted for: Bass · Four-string bass | R | not pinned | Phase C or D |
| `js/quiz.js:1898` | Exercises start, the line under the three numbers at the top | Daily goal: … engaged minutes. Lifetime: … XP. | Daily goal: 10 minutes of practice. All time: 1,240 XP. | R | not pinned | Phase C or D † |
| `js/quiz.js:1901` | Exercises start, second number at the top (the goal ring) | engaged minutes today | minutes practised today | R | not pinned | Phase C or D † |
| `js/quiz.js:1902` | Exercises start, third number at the top | Consistency level … | Habit level 3 (the level rises when you practise often and fades after a break: the Exercises tour already says so) | S | not pinned | Phase C or D † |
| `js/quiz.js:2034` | Exercises › Progress, “This week”: tooltip of a day | engaged-minute goal reached / no daily goal recorded | daily goal reached / daily goal not reached | R | not pinned | Phase C or D |
| `js/quiz.js:2078` | Exercises › Progress, the Keys lessons card (Piano and Synth only) | Shared keys lesson content · … timing and best-score observations only. Curriculum levels are shared. | Keys scale lessons · Your best scores and timing as Piano. The level you reached is the same for Piano and Synth. | R | not pinned | Phase C or D |
| `js/quiz.js:2088` | Exercises › Progress, first tile | Consistency level · … consistency XP; not a measured skill level | Habit level · 1,240 habit points. It fades after a break and does not measure skill. | S | `tests/learn-instruments.test.js:195` | Phase C or D |
| `js/quiz.js:2089` | Exercises › Progress, second tile | Lifetime earned XP · … earned today; lifetime earnings do not decay | All-time XP · 12 today. All-time XP never goes down. | R | `tests/learn-instruments.test.js:195`<br>`tests/practice.test.js:99` | Phase C or D |
| `js/quiz.js:2090` | Exercises › Progress, third tile (Streak), small line | Best … days meeting the engaged-minute goal | Best: 12 days in a row with the daily goal reached | R | not pinned | Phase C or D |
| `js/quiz.js:2091` | Exercises › Progress, fourth tile | Engaged practice | Time practised | R | `tests/practice.test.js:99`<br>`tests/practice.test.js:100` | Phase C or D |
| `js/quiz.js:2093` | Exercises › Progress, card “This week” | A day counts when this instrument reaches its engaged-minute goal. Planned breaks and consistency settings are shared with Practice progress. | A day counts when you reach your daily goal on this instrument. Breaks you plan and the habit-level settings are in the Woodshed, under Practice progress. | R | not pinned | Phase C or D |
| `js/quiz.js:2094` | Exercises › Progress, card “Daily goal” | … of … engaged minutes today | 4.5 of 10 minutes practised today | R | not pinned | Phase C or D |
| `js/quiz.js:2096` | Exercises › Progress, card “Daily goal”, the note under the button | This is the same instrument XP balance used by guided practice. Configured rates apply to bounded active practice time. Correct knowledge answers are tracked separately from musical note accuracy and timing. | Exercises and the Woodshed add to the same XP for this instrument. You earn XP for each minute you spend answering or playing. Right answers here and right notes in the Woodshed are counted separately. | R | not pinned | Phase C or D |
| `js/quiz.js:2097` | Exercises › Progress, card “Earned XP per day” | Last 14 days · recorded instrument earnings | Last 14 days · on this instrument | P | not pinned | Phase C or D |
| `js/quiz.js:2098` | Exercises › Progress, card with the minutes chart | Engaged practice time · Minutes per day, last 14 days · canonical instrument history, counted once | Time practised · Minutes per day on this instrument, last 14 days | W | `tests/practice.test.js:101` | Phase C or D |
| `js/quiz.js:2101` | Exercises › Progress, card “Answer speed”, the note under the table | …A background or modal pause starts a fresh visible response attempt; covered time is excluded. | …Time while soundLAB is in the background, or while something covers the question, is not counted. | R | not pinned | Phase C or D |
| `js/quiz.js:2237` | Exercises › Progress, minutes chart: the tip of a bar | …: … measured engaged minutes | Today: 4.5 minutes practised | R | not pinned | Phase C or D |
| `js/quiz.js:2238` | Exercises › Progress, minutes chart: its name for screen readers and the head of its table | Engaged practice minutes per day over the last 14 days · Engaged minutes | Minutes practised per day over the last 14 days · Minutes practised | R | `tests/practice.test.js:101` | Phase C or D |
| `js/quiz.js:2409` | Exercises, the result of a level: the note with the star | … of … engaged minutes toward today’s instrument goal. | 4.5 of 10 minutes towards today’s goal. | R | `tests/game.test.js:126` | Phase C or D |
| `js/xp.js:86` | Exercises › Progress, under the minutes chart: the name of the one row “Last 7 days” | Explicit … practice | Piano practice | R | `tests/practice.test.js:100` | Phase C or D |

Notes:

- `js/quiz.js:1438`: The check wants “no … note” or “no … pitch”; the proposal still passes it.
- `js/quiz.js:2088`: One of the three lines the plan names (“Consistency level”). Pinned, and the name is one of those that change in every place at once.

## Learn › Chords

Nothing found: no text of this page uses a listed word or names a setting instead of what it does.

## Learn › Circle

Nothing found: no text of this page uses a listed word or names a setting instead of what it does.

## Learn › Plan

`js/practiceplan.js`, and the Free practice cards of `js/trainer.js`.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/practiceplan.js:25` | Plan, wherever a block or a plan from before instruments were tracked is named: the line under “Today’s … session”, the list of blocks for other instruments, the refusal to start a block | Legacy keyboard context / Legacy / unassigned | Keys (older plan) / No instrument (older plan) | W | not pinned | Phase C or D |
| `js/practiceplan.js:86-87` | Plan, preview and “What soundLAB can’t do yet”: the reason beside a line of the notes | No matching guided module for this assignment. / No matching guided module. | soundLAB has no exercise for this yet. | W | not pinned | Phase C or D |
| `js/practiceplan.js:90` | Plan, preview and “What soundLAB can’t do yet”: the reason beside a line of the notes | This explicit technique or octave range has no matching guided lesson. | soundLAB has no lesson for this technique or this many octaves yet. | R | not pinned | Phase C or D |
| `js/practiceplan.js:91` | Plan, preview and “What soundLAB can’t do yet”: the reason beside a line of the notes | No graded arpeggio lesson is available through the current lesson hook. | soundLAB has no arpeggio lessons yet. | R | not pinned | Phase C or D |
| `js/practiceplan.js:94` | Plan, a guitar scale block of an accepted plan, its small line | Runner uses the shared key, scale and tempo. This casual tool has no automated progress timer. | Opens the Neck’s runner in your key and tempo. soundLAB does not time this block. | P | not pinned | Phase C or D |
| `js/practiceplan.js:106` | Plan, preview and “What soundLAB can’t do yet”: the reason beside a line of the notes | Exact lesson speed/level needs selection in Keys; no public setup hook exists. | The plan cannot set the speed level yet: pick it yourself on the Piano page. | R | not pinned | Phase C or D |
| `js/practiceplan.js:110` | Plan, preview and “What soundLAB can’t do yet”: the reason beside a line of the notes | This warm-up hook opens the six-string guitar fretboard; choose a matching instrument-specific exercise instead. | This warm-up is for six-string guitar. Pick an exercise for your instrument instead. | R | not pinned | Phase C or D |
| `js/practiceplan.js:112` | Plan, preview and “What soundLAB can’t do yet”: the reason beside a line of the notes | Direct selection/import of this score needs a Woodshed setup hook. | The plan cannot open this piece for you yet: choose or import it in the Woodshed. | R | not pinned | Phase C or D |
| `js/practiceplan.js:113` | Plan, preview and “What soundLAB can’t do yet”: the reason beside a line of the notes | Exact Exercises topic/ear-mode selection needs a public setup hook. | The plan cannot open this topic for you yet: choose it in Exercises. | R | not pinned | Phase C or D |
| `js/practiceplan.js:122` | Plan, the starter plan’s block “Ear & theory”, its small line | Choose an available topic for the current Learn category. | Choose a topic for your instrument. | S | not pinned | B11 |
| `js/practiceplan.js:185` | Plan, the status line after Start on a block of another instrument | This block is preserved for …. Choose that Learn category before launching. | This block is for Guitar. Switch to that instrument to start it. | S | not pinned | Phase C or D |
| `js/practiceplan.js:255` | Plan, the status line after importing a Google Docs file without text | No Google Docs text runs found. Export as plain text instead. | No text found in this Google Docs file. Export the Doc as plain text (.txt) and import that. | P | not pinned | Phase C or D |
| `js/practiceplan.js:261` | Plan, the name of the file “Export gaps” saves | soundlab-module-gaps-….json | soundlab-plan-missing-….json | W | `tests/practiceplan.test.js:377` | Phase C or D |
| `js/practiceplan.js:267` | Plan, the preview after “Review mapping” | … practice blocks · … gaps | 4 practice blocks · 1 line without an exercise | P | not pinned | Phase C or D |
| `js/practiceplan.js:282` | Plan, card “Today’s … session”, the line under the heading | … minutes suggested · accepted plan context: … | 15 minutes suggested · plan made for: Piano | W | `tests/practiceplan.test.js:215` | Phase C or D |
| `js/practiceplan.js:284` | Plan, a block that soundLAB cannot time (the starter’s “Tune up”, a guitar scale), the line under its title, after “0 seconds recorded · ” | No automated timer or completion is available for this casual tool; opening it earns no progress. | Not timed: soundLAB cannot tell when this block is done, so it does not count towards the plan. | P | `tests/practiceplan.test.js:246` | Phase C or D |
| `js/practiceplan.js:286` | Plan, card “Today’s … session”, the line under the blocks | … / … matching blocks measured complete. Time comes from recorded sessions for …; opening a page earns no minutes or XP. | 2 of 4 blocks done. Only time you play or answer as Piano counts; opening a page does not. | P | not pinned | B11 |
| `js/practiceplan.js:286` | Plan, card “Today’s … session”, with a plan whose blocks are for another instrument | No matching blocks for this Learn category. Your accepted plan is preserved below. · … blocks preserved for other instrument contexts | No blocks for this instrument. Your plan is kept: see below. · 3 blocks for other instruments | W | `tests/practiceplan.test.js:215` | Phase C or D |
| `js/practiceplan.js:289` | Plan, card “Last seven days” | … recorded minutes · … observed days | 34 minutes · 3 days with practice | R | not pinned | B11 |
| `js/practiceplan.js:292` | Plan, card “Last seven days”, the line under the seven days | Only this instrument’s canonical observations are counted. Legacy / unassigned history remains separate. | Only practice on this instrument is counted. Practice from before you picked an instrument is not. | W | not pinned | B11 |
| `js/practiceplan.js:293` | Plan, card “What soundLAB can’t do yet”: its button and its empty line | Export gaps · No gaps recorded. Unmatched assignments appear here after you accept notes. | Export this list · Nothing yet. Lines of your notes that soundLAB has no exercise for appear here. | P | not pinned | B11 |
| `js/practiceplan.js:306` | Plan, fold “Teacher’s lesson notes”: a field’s label, the main button and the file button | Current Learn instrument · Review mapping · Import text / Docs JSON | Instrument · Show the plan · Import a text file or a Google Docs export | R | not pinned | Phase C or D |
| `js/practiceplan.js:338` | Plan, the status line after the instrument was changed | Instrument changed. The previous block’s tracking ended; its original context and history are preserved. | Instrument changed. The block you had open is no longer timed; what you did so far is kept. | W | not pinned | Phase C or D |
| `js/trainer.js:470` | Plan › Free practice, a message after “Open ear training” with Drums chosen | Ear training is not part of the … category. Pick another instrument in the Learn bar at the top of this page. | There is no ear training for Drums. Pick another instrument with the instrument button at the top. | S | `tests/trim.test.js:482` | Phase C or D |

Notes:

- `js/practiceplan.js:25`: Shown only for a plan saved before soundLAB kept an instrument with each plan.
- `js/practiceplan.js:261`: The check wants “gap” or “practice” in the file’s name.
- `js/practiceplan.js:282`: `tests/practiceplan.test.js:215` passes while the card holds “preserved” or “context”. This line and the “… blocks preserved for other instrument contexts” row change together with that check.
- `js/practiceplan.js:292`: One of the three lines the plan names. Not pinned, on the first screen: B11 rewords it. The proposal describes the older practice instead of naming it, so it does not depend on the new name for “Legacy / unassigned”.
- `js/trainer.js:470`: B8 takes the Learn bar away: from then on this sentence points at something that is gone.

## Guitar › Neck, Tab, Notation

All three pages are `js/fretboard.js`.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/fretboard.js:235-236` | Neck, the settings fold, colors by note: tooltip of the five sharp-note swatches, and their name for screen readers | Derived blend of neighboring natural-note colors for … (name: Derived accidental color) | C# is a mix of the colors of C and D. Change those two to change it. (name: Color of C#, mixed from its neighbors) | P | not pinned | Phase C or D |
| `js/fretboard.js:1883` | Neck, the settings fold, a checkbox | Jam: auto-switch mode | Follow the Jam band: show the mode that fits each chord | S | not pinned | Phase C or D |

## Keys › Piano

`js/piano.js`, the scale lessons (`js/keylessons.js`), and the fold “Notes and triads on the LUMI” (`js/lumi-practice.js` with `js/practice-router.js`). The fold is closed when the page opens, so none of its texts is on the first screen.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/keylessons.js:538` | Piano, card “Scale lessons”, the line beside the heading | Credit: …. Shared keyboard course. Play along with the click. Right notes on the beat level you up. | Counts for: Piano. Piano and Synth share these lessons. Play along with the click. Right notes on the beat level you up. | R | `tests/instrument-xp.test.js:102` | Phase C or D |
| `js/keylessons.js:575` | Piano, card “Scale lessons”, a chip under the Start button and its tooltip | Guide focus (tooltip: Legacy guide focus; pitch colors are shared, LUMI Display master is in the clef menu) | Only the notes to play (tooltip: In a lesson the LUMI lights only the note to play. Switch the LUMI lights on and off in the key bar.) | W | not pinned | B5a (plan) |
| `js/piano.js:991` | Piano, the practice runner’s status line while it plays, with a LUMI whose keys do not reach the note | … · display shows pitch class; play the named octave on your synth | … · the LUMI lights this note in its own octave; play it in the octave named here | R | `tests/lumi-contexts.test.js:119` | Phase C or D |
| `js/piano.js:1464` | Piano, fold “Notes and triads on the LUMI”, its first line | …The double-tap key from Settings › Hands-free control, if it is on, works here in Simulated mode.… | …The double-tap key from Settings › Hands-free control, if it is on, works here while you answer on screen.… | R | not pinned | Phase C or D |
| `js/lumi-practice.js:22` | Piano, fold “Notes and triads on the LUMI”: the status line before the first start | Ready for simulated practice. Device output is OFF. | Ready. Answer with the keys on screen. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:24` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status before the first start | OFF — no device messages sent by this section. | Lights off: this section sends nothing to your keyboards. | P | not pinned | Phase C or D |
| `js/lumi-practice.js:25` | Piano, fold “Notes and triads on the LUMI”, Simulated mode: the line under “Preview simulated display” | Simulated display idle. No device ports are used. | Nothing shown yet. No keyboard is used. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:101` | Piano, fold “Notes and triads on the LUMI”: the lights’ status after any stop | OFF — output disarmed; pending notes released. / OFF — note-off attempted; the disconnected device could not confirm delivery. | Lights off. / Lights off, but the keyboard was disconnected: a key may still be lit on it. | R | `tests/lumi-practice.test.js:733` | Phase C or D |
| `js/lumi-practice.js:172` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the start of the lights’ status whenever lighting fails or is switched off, and its end when switching off failed | OFF — … Note-off delivery could not be confirmed. | Lights off: … A key may still be lit on the LUMI. | P | not pinned | Phase C or D |
| `js/lumi-practice.js:183` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status (after “OFF — ”) when the master switch is off | LUMI Display is off in the treble-clef menu. | The LUMI lights are switched off in the key bar. | S | not pinned | B5a (plan) |
| `js/lumi-practice.js:188` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status (after “OFF — ”) when lighting failed | Display frame failed or its original output changed. | The LUMI could not be lit, or another keyboard was picked. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:190` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status during a test | TEST target to selected output. Note-off follows in 300 ms. | Test: the lowest of the 24 keys lights for a moment. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:191` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status while the LUMI is lit | ARMED — instructional target stays lit until it changes or you disarm. Targets and answers keep their shared pitch colors. Correct/wrong states use the labeled preview and outlines. | Lights on: the notes to play stay lit until the next ones come or you tap “Lights off”. Every note keeps its usual color; right and wrong are marked on screen. | R | `tests/lumi-practice.test.js:688` | Phase C or D |
| `js/lumi-practice.js:197` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status (after “OFF — ”) when a test could not be ended | Test note-off could not be delivered to its original device. | The test key may still be lit on the LUMI. | P | not pinned | Phase C or D |
| `js/lumi-practice.js:200` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status after a test | OFF — test ended. Observe the selected device before arming; hardware lighting remains unverified. | Lights off: the test is over. Did the right key light up on the LUMI? Then tap “Light the LUMI”. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:258` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status line after Start without a keyboard to answer on | Choose an available synth or LUMI answer input. Independent ports require an enabled Web MIDI backend; native bridges are unsupported here. | Pick the keyboard you answer on. This needs MIDI in a browser such as Chrome or Edge; it does not work in the Android or iPad app. | R | `tests/remote-plan.test.js:159` | Phase C or D |
| `js/lumi-practice.js:262` | Piano, fold “Notes and triads on the LUMI”: the status line after Start | SIMULATED session — answer pads and display preview use no MIDI ports. / Listening only to the selected answer keyboard. | Started. Answer with the keys on screen. / Started. soundLAB listens to the keyboard picked above. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:263` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status after Start | OFF — simulated mode never sends MIDI device messages. / OFF — every fresh start requires a new selected-device test and explicit arm. | Lights off: on-screen practice sends nothing to your keyboards. / Lights off: tap “Test the lights”, then “Light the LUMI”. This is needed after every start. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:320-321` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status line when a keyboard is unplugged | Device connection changed. Session stopped and output disarmed; choose ports and start again. / Answer input is unavailable. Session stopped and output disarmed. | A keyboard was connected or unplugged. Practice stopped and the lights are off. Pick your keyboards and start again. / The keyboard you answer on is gone. Practice stopped and the lights are off. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:326` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the line under the two lists | Independent Web MIDI ports available. Synth answer inputs and LUMI display outputs are independent; LUMI input is optional; mixed and virtual names are excluded. Other ROLI devices do not qualify. Both choices apply only to this section. | Pick the keyboard you answer on and the LUMI that shows the notes: they can be two keyboards. Only a LUMI can show the notes. Both choices are used in this section only. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:327` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the same line in the Android or iPad app, or without MIDI | Native MIDI bridge: independent port routing is unsupported. Simulated practice remains available. / Independent ports unavailable. Enable Web MIDI in Settings, then refresh ports; simulated practice remains available. | In this app soundLAB cannot use two keyboards at once. You can still practise on screen. / No keyboards found. Connect MIDI in Settings, then tap “Look for keyboards again”. You can still practise on screen. | R | `tests/lumi-practice.test.js:833` | Phase C or D |
| `js/lumi-practice.js:333` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: first choice of the list “Synth SOUND OUTPUT” | None — synth sound routing OFF | None (my synth plays by itself) | R | not pinned | Phase C or D |
| `js/lumi-practice.js:339-340` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the line under that list | Selected scale: … Targets follow this selected scale; sound admission follows Scale Lock in the clef menu. / Selected scale: … Targets and the display follow this scale. Sound routing remains independently selected. | Scale: A Dorian. The notes to play come from this scale. With Scale lock on in the key bar, only its notes reach the synth. / Scale: A Dorian. The notes to play and the lights come from this scale. | R | not pinned | B5a (plan) |
| `js/lumi-practice.js:346-347` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” while it is on, and before a synth is picked | ON — selected keyboard → selected synth output. Scale Lock ON: allowed scale notes only. / OFF: all notes allowed. · OFF — choose separate sound output and acknowledge Local Control OFF. | On: what you play goes to the synth. Scale lock is on: only notes of the scale. / Scale lock is off: every note. · Off: pick the synth above and tick the box about Local Control. | P | not pinned | Phase C or D |
| `js/lumi-practice.js:354` | Piano, fold “Notes and triads on the LUMI”, Simulated mode: what a screen reader says for each answer key | Simulated answer …, MIDI … | Answer key C4 (MIDI 60) | R | not pinned | Phase C or D |
| `js/lumi-practice.js:374` | Piano, fold “Notes and triads on the LUMI”: the badge at the top right | SIMULATED — NO DEVICE I/O / HARDWARE — EXPERIMENTAL / UNVERIFIED | On screen: no keyboard is used / With your keyboards: still being tested | R | `tests/lumi-practice.test.js:606` | Phase C or D |
| `js/lumi-practice.js:378` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the line under the test buttons | LUMI Display is … — use its single toggle in the treble-clef menu. | LUMI lights are on. Switch them on and off in the key bar. | S | not pinned | B5a (plan) |
| `js/lumi-practice.js:382` | Piano, fold “Notes and triads on the LUMI”: the line under the note to play, before the first start | Targets stay inside the configured window. | Every note to play is one of the 24 keys above. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:384` | Piano, fold “Notes and triads on the LUMI”: the small line above the answer buttons | Answer source: simulated answer pads / Answer source: selected keyboard input only | You answer with the keys on screen / You answer on the keyboard picked above | R | not pinned | Phase C or D |
| `js/lumi-practice.js:385` | Piano, fold “Notes and triads on the LUMI”: the main button | Restart session (output OFF) / Start session (output OFF) | Start again / Start | P | `tests/remote-plan.test.js:119` | Phase C or D |
| `js/lumi-practice.js:413` | Piano, fold “Notes and triads on the LUMI”: the status line after a setting of the section was changed, after the sentence that says which | … Start again; output remains OFF. | … Start again. | P | not pinned | Phase C or D |
| `js/lumi-practice.js:419` | Piano, fold “Notes and triads on the LUMI”: heading and first line | LUMI practice · Follow the illuminated LUMI target while you play your separate synth. LUMI answer input is optional. Wait mode continues when the exact notes are correct. | LUMI practice · The LUMI lights a note or a chord; play it on your synth, or on the LUMI itself. The next one comes when you play exactly those notes. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:420` | Piano, fold “Notes and triads on the LUMI”: the list “Practice mode” | Simulated — no device I/O / Hardware — independent Web MIDI ports | On screen (no keyboard needed) / With my keyboards (a LUMI for the lights, a synth to play) | R | not pinned | Phase C or D |
| `js/lumi-practice.js:423` | Piano, fold “Notes and triads on the LUMI”: a number field | 24-key window starts at MIDI | Lowest of the 24 keys (MIDI note number; 48 = C3) | S | not pinned | Phase C or D |
| `js/lumi-practice.js:424` | Piano, fold “Notes and triads on the LUMI”: a list | Display channel | MIDI channel of the LUMI’s lights | S | not pinned | Phase C or D |
| `js/lumi-practice.js:425` | Piano, fold “Notes and triads on the LUMI”: the note under the fields | Exact pitches: MIDI 60 = C4 here. Match the physical LUMI octave to this window yourself. Device octave labels can differ; targets and answers are never folded into another octave. | The octave counts: note 60 is C4 here. Set the LUMI’s octave buttons so that its keys are these 24. A note played an octave too high or too low is wrong. | P | not pinned | Phase C or D |
| `js/lumi-practice.js:426` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: two lists and a button | Synth answer INPUT (LUMI optional) · LUMI display OUTPUT · Refresh ports | Keyboard you answer on · LUMI that shows the notes · Look for keyboards again | R | not pinned | Phase C or D |
| `js/lumi-practice.js:428` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the box “Independent synth sound route” | Independent synth sound route · Synth SOUND OUTPUT · …This app cannot mute the synth’s physical local sound. It never changes Local Control. Scale Lock in the treble-clef menu controls whether this sound route blocks notes outside the selected scale; LUMI Display is independent. · Start synth sound route · Stop synth sound route | Scale lock for my synth · Synth that makes the sound · …soundLAB cannot silence the synth’s own keys: that is what Local Control OFF on the synth does. With Scale lock on in the key bar, notes outside the scale are not passed on to the synth. The LUMI’s lights are not changed by this. · Start · Stop | R | not pinned | B5a (plan) |
| `js/lumi-practice.js:429` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the warning above the test buttons | EXPERIMENTAL / UNVERIFIED hardware lighting. The keyboard is an instructional display: target notes stay lit in their shared pitch colors. The preview labels and outlines correct and wrong answers without changing pitch identity. Shared key lights pause on that output while armed, then return. A test may make sound; device behavior remains unverified. | Lighting a real LUMI is still being tested. The notes to play stay lit in their usual colors; right and wrong are marked on screen, not by another color. While this section lights the LUMI, the scale lights pause; they come back afterwards. The test may make a sound. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:430` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: three buttons | Test selected output (300 ms) · I observed the test — arm output · Disarm output | Test the lights · I saw the key light up: light the LUMI · Lights off | R | not pinned | Phase C or D |
| `js/lumi-practice.js:433` | Piano, fold “Notes and triads on the LUMI”: the card with the note to play | Target · on-screen reference · … · The preview never counts as answer input. | Play this · … · Tapping the keys of this picture is not an answer. | P | not pinned | Phase C or D |
| `js/lumi-practice.js:434` | Piano, fold “Notes and triads on the LUMI”, Simulated mode: the answer card | SIMULATED DEVICES — no actual MIDI ports · Simulated keyboard answers · select notes to hold · Release simulated answers | On screen: no keyboard is used · Answer here: tap the keys you would hold · Let all keys go | R | not pinned | Phase C or D |
| `js/lumi-practice.js:435` | Piano, fold “Notes and triads on the LUMI”, Simulated mode: the second half of the answer card | Simulated LUMI display output · Preview simulated display | What the LUMI would show · Show it | R | not pinned | Phase C or D |
| `js/lumi-practice.js:468` | Piano, fold “Notes and triads on the LUMI”, Simulated mode: the line after “Preview simulated display” | Last SIMULATED output only: …. No device messages sent; answers unchanged. | The LUMI would light: C4, E4, G4. Nothing was sent to a keyboard. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:475` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status (after “OFF — ”) after “Disarm output” | Disarmed. A new test is required to arm again. | Tap “Test the lights” before you light the LUMI again. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:480` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the lights’ status when the master switch is flipped off | OFF — LUMI Display disabled in the clef menu. Sound routing is unchanged. / OFF — display disabled; original LED cleanup could not be confirmed. | Lights off: the LUMI lights were switched off in the key bar. Your synth’s sound is not changed. / Lights off, but a key may still be lit on the LUMI. | R | not pinned | B5a (plan) |
| `js/lumi-practice.js:492` | Piano, fold “Notes and triads on the LUMI”: the status line when MIDI changes | MIDI connection changed. Session stopped and output disarmed; start again. | A keyboard was connected or unplugged. Practice stopped and the lights are off. Start again. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:495-497` | Piano, fold “Notes and triads on the LUMI”: the status line after leaving the window or the app | Window lost focus. Session stopped and output disarmed. / Page closed or hidden. Output disarmed. / App hidden. Session stopped and output disarmed. | You left soundLAB, so practice stopped and the lights are off. | R | not pinned | Phase C or D |
| `js/lumi-practice.js:515` | Piano, fold “Notes and triads on the LUMI”: the status line after the fold was closed or the page left | Section closed or page left. Session stopped and output disarmed. | You closed this section, so practice stopped and the lights are off. | R | not pinned | Phase C or D |
| `js/practice-router.js:14` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), before the first start | Synth sound route OFF. | Nothing is passed on to the synth. | R | not pinned | Phase C or D |
| `js/practice-router.js:85-86` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), after a stop | Synth sound route stopped. Original-output cleanup could not be confirmed; release notes/pedal on the synth. | Stopped. A note may still sound on the synth: press and let go of the keys and the pedal on it. | R | `tests/practice-router.test.js:219`<br>`tests/practice-router.test.js:221` | Phase C or D |
| `js/practice-router.js:147` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), when a note could not be sent | Synth note send failed. Route disarmed. | A note could not be sent to the synth, so soundLAB stopped passing notes on. | R | not pinned | Phase C or D |
| `js/practice-router.js:153` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), when the end of a note could not be sent | Synth note-off failed. Route disarmed. | The end of a note could not be sent to the synth, so soundLAB stopped passing notes on. If a note hangs, play that key again on the synth. | R | not pinned | Phase C or D |
| `js/practice-router.js:157` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), when the pedal could not be sent | Synth sustain send failed. Route disarmed. | The sustain pedal could not be sent to the synth, so soundLAB stopped passing notes on. | R | not pinned | Phase C or D |
| `js/practice-router.js:164` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), when key pressure could not be sent | Synth pressure send failed. Route disarmed. | Key pressure could not be sent to the synth, so soundLAB stopped passing notes on. | R | not pinned | Phase C or D |
| `js/practice-router.js:180` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), in a browser or app that cannot do it | Independent Web MIDI and the shared scale predicate are required. | This needs MIDI in a browser such as Chrome or Edge. | R | not pinned | Phase C or D |
| `js/practice-router.js:184` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), when the two keyboards are not picked | Choose explicit synth input and sound output, separate from the LUMI display; virtual/mixed ports are excluded. | Pick the keyboard you play and the synth that makes the sound. The synth must not be the LUMI that shows the notes. | R | not pinned | Phase C or D |
| `js/practice-router.js:187` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), when the synth is also the keyboard soundLAB lights | Select the LUMI as the shared key-light output, or turn shared key lights off, before routing sound to this synth. | This synth is set as the keyboard soundLAB lights. In Settings › MIDI keyboard, pick the LUMI under Key lights (or switch key lights off) first. | R | not pinned | Phase C or D |
| `js/practice-router.js:193` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), when the synth is in use | Synth output is busy or pinned output ownership is unavailable. | The synth is in use by another part of soundLAB. Stop what is playing and try again. | R | not pinned | Phase C or D |
| `js/practice-router.js:198` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), when the keyboard could not be listened to | Could not subscribe to the selected synth input. | soundLAB could not listen to the keyboard you picked. Unplug it, plug it in again and start again. | R | not pinned | Phase C or D |
| `js/practice-router.js:208-211` | Piano, fold “Notes and triads on the LUMI”, Hardware mode: the status under “Start synth sound route” (after “OFF — ”), after MIDI changed or soundLAB was left | MIDI routing or connection changed. Start again. / Window lost focus. Synth route stopped. / Page closed. Synth route stopped. / App hidden. Synth route stopped. | A keyboard was connected or unplugged. Start again. / You left soundLAB, so nothing is passed on to the synth any more. | R | not pinned | Phase C or D |

Notes:

- `js/keylessons.js:538`: On the first screen, but `tests/instrument-xp.test.js:102` reads “Credit: synth”.

## Keys › Charts

Nothing found: no text of this page uses a listed word or names a setting instead of what it does.

## Keys › Pads

Nothing found: no text of this page uses a listed word or names a setting instead of what it does.

## Play › Songs

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/songs.js:238` | Songs, card “Add a song”, its last row while nothing is saved | Nothing saved yet — parse a song and hit Save. | Nothing saved yet. Open a song and press “Save to library”. | R | not pinned | B14b |
| `js/songs.js:559` | Songs, card “Add a song”, the line above the box | …Everything is parsed on your device — nothing is uploaded, and only content you bring in is used.… | …Everything is read on your device: nothing is uploaded, and soundLAB uses only what you bring in.… | R | not pinned | B14b |
| `js/songs.js:562` | Songs, card “Add a song”, the main button | Parse tab | Read the tab | R | not pinned | B14b |
| `js/songs.js:685` | Songs, card “Add a song”, the line after “Parse tab” | Parsed: … steps, … bars. | Read: 64 steps in 8 bars. | R | not pinned | Phase C or D |
| `js/songs.js:761` | Songs, card “Open a score”, the line after “Practice” | In the Woodshed: … — pitches, beat positions, durations and velocities kept; controllers, program changes, bend and lyrics are not targets. | In the Woodshed: … — the notes, their timing, length and loudness are kept. Knob moves, sound changes, pitch bend and lyrics are left out. | P | `tests/oneopen.test.js:122` | Phase C or D |

Notes:

- `js/songs.js:685`: Not on the first screen, but it answers the button of `js/songs.js:562`: when B14b gives the button its new word, this line should say the same.

## Play › Jam

Nothing found: no text of this page uses a listed word or names a setting instead of what it does.

## Train › Woodshed

`js/woodshed.js`, the card “Practice progress” (`js/practice-progress-ui.js`, `js/practice-progress.js`) and guided performance (`js/performance-player.js`, `js/performance-engine.js`, `js/practice-input.js`). Guided performance opens after a tap on a piece, so none of its texts is on the first screen.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/woodshed.js:218-301` | Woodshed library, the line under the buttons after “+ MIDI file” on a file that cannot be read: “MIDI import failed: ” and one of 17 reasons | truncated MIDI chunk or event / MIDI variable-length value exceeds four bytes / invalid MIDI data byte / not a MIDI file / invalid MIDI header length / only MIDI formats 0 and 1 are supported / invalid MIDI track count / SMPTE time not supported / MIDI ticks per quarter note must be positive / missing MIDI track chunk / MIDI tick position is too large / MIDI running status has no channel status / invalid MIDI end-of-track event / invalid MIDI tempo event / MIDI tempo must be positive / unsupported system event in MIDI file / MIDI track is missing its end-of-track event | One sentence for all of them: “This MIDI file is damaged, or of a kind soundLAB cannot read. Export it again from your notation app or DAW.” The exact reason may follow in small type for a bug report. | R | `tests/performance-import.test.js:104-126` | Phase C or D |
| `js/woodshed.js:327` | Woodshed library, the line after a MIDI import (also under “Source details and scoring limits” in guided performance) | Conflicting beat-zero tempos: the last beat-zero tempo in track order was selected. | The file names more than one starting tempo; soundLAB uses the last one. | P | `tests/performance-import.test.js:57` | Phase C or D |
| `js/woodshed.js:328-329` | The same two places | … note attacks without matching releases were omitted; no held duration was invented. / … unmatched note releases were ignored. | 3 notes in the file never end, so they were left out. / 2 note endings without a note were ignored. | P | `tests/performance-import.test.js:96` | Phase C or D |
| `js/woodshed.js:330` | The same two places | Overlapping attacks of the same channel/pitch were paired with releases in attack order; ties are not inferred. | Where the same note starts again before it ended, each start gets the next ending. Tied notes are not joined. | R | `tests/performance-import.test.js:66` | Phase C or D |
| `js/woodshed.js:331` | The same two places, for a drum file | Percussion pitches are preserved; sticking and limb assignments are not encoded (display lanes alternate). | The drum sounds are kept. A MIDI file does not say which hand or foot plays, so the two rows on screen simply alternate. | R | `tests/performance-import.test.js:83` | Phase C or D |
| `js/woodshed.js:333` | The same two places | Trailing data after the declared MIDI tracks was ignored. | Extra data at the end of the file was ignored. | P | `tests/performance-import.test.js:92` | Phase C or D |
| `js/woodshed.js:388` | Woodshed, a pasted tab: under “Source details and scoring limits” in guided performance | Standard guitar tuning is assumed. ASCII tab rhythm, rests and techniques are not interpreted; onset groups use even eighths and note holds are approximate. Ties are not inferred. | Standard guitar tuning is assumed. A text tab has no rhythm: soundLAB plays it in even eighth notes, and rests, slides and bends are not read. Tied notes are not joined. | R | `tests/performance-import.test.js:136` | Phase C or D |
| `js/woodshed.js:1140` | Woodshed library, the line beside the heading “Woodshed · …” | Legacy / unassigned: Level … · … XP · …-day legacy streak · Shared achievements …/… achievements | Before you picked an instrument: level 4 · 456 XP · 3-day streak · achievements (all instruments): 5 of 12 | W | `tests/instrument-xp.test.js:111` | Phase C or D |
| `js/woodshed.js:1183` | Woodshed library, card “Shared source library”: its heading and the line under it | Shared source library · Practice credit: …. Source instrument describes the score, not your XP category. | Your pieces · Counts for: Bass. The instrument beside a piece says what it was written for, not what your practice counts for. | R | `tests/instrument-xp.test.js:110` | Phase C or D |
| `js/woodshed.js:1219` | Woodshed, a piece open: tooltip of the Mic chip | Score from your instrument through the mic / audio interface (guitar: pitch detection · drums: onset detection) | Scores what you play into the microphone or audio interface (guitar: the notes · drums: the hits) | R | not pinned | Phase C or D |
| `js/woodshed.js:1272` | Woodshed › Calibrate timing | …The median offset per input is stored and silently applied to all scoring. | …soundLAB remembers how early or late each one reaches it and takes that off every score. | R | not pinned | Phase C or D |
| `js/woodshed.js:1392` | Woodshed library, the line after a MIDI import | Imported “…”: … notes, practice tempo … BPM. Preserved: pitches, beat positions, durations and velocities. Controllers, program changes, pitch bend and lyrics are not performance targets. | Imported “…”: 120 notes at 96 BPM. The notes, their timing, length and loudness are kept. Knob moves, sound changes, pitch bend and lyrics are left out. | P | not pinned | Phase C or D |
| `js/woodshed.js:1405` | Woodshed library, the line after a pasted tab | Imported … notes from tab. Preserved: pitches, string/fret. Dropped: rhythm (marked approximate), technique glyphs (h/p/b noted but unscored). | Imported 48 notes from the tab, with their strings and frets. A text tab has no rhythm, so timing is only roughly scored. Hammer-ons, pull-offs and bends are not scored. | R | not pinned | Phase C or D |
| `js/practice-progress-ui.js:9-19` | Woodshed library, card “Practice progress”, inside the fold “Goals, XP and consistency settings”: the labels of eleven number fields | Daily goal (engaged minutes) · XP per engaged minute · XP per correctly matched note · Correct-note XP cap per session · Streak bonus per day (%) · Maximum streak bonus (%) · Inactive grace days before decay · Consistency decay per day (%) · Maximum consistency XP lost per day · Consistency XP floor · Consistency XP per level | Daily goal (minutes) · XP per minute of practice · XP per right note · Most XP for right notes in one session · Extra XP per streak day (%) · Most extra XP for a streak (%) · Days off before the habit level starts to fade · How fast it fades (% per day) · Most it can fade in one day · It never falls below · Habit points per level | R | not pinned | Phase C or D |
| `js/practice-progress-ui.js:56` | Woodshed library, card “Practice progress”, the line under the heading | Earned XP records your practice. Consistency XP and its level can decline after time away; that is not a measured loss of musical skill. | XP counts your practice. Your habit level can go down after time away; that says nothing about your skill. | R | `tests/practice-progress-ui.test.js:63` | Phase C or D |
| `js/practice-progress-ui.js:61` | Woodshed library, card “Practice progress”, the fold at the bottom: its title and its first line | Goals, XP and consistency settings · These parameters apply to all instruments. They do not erase sessions or rewrite lifetime earned XP. Future sessions keep the earning parameters recorded with them. | Goal, XP and habit-level settings · These settings are the same for every instrument. Changing them never changes practice you have already done. | R | not pinned | Phase C or D † |
| `js/practice-progress-ui.js:63` | Woodshed library, card “Practice progress”, inside the fold “Goals, XP and consistency settings”: a text field | Practice timezone (IANA) | Time zone your days are counted in (for example Europe/Berlin) | R | not pinned | Phase C or D |
| `js/practice-progress-ui.js:64-65` | Woodshed library, card “Practice progress”, inside the fold “Goals, XP and consistency settings”: a checkbox and the note under it | Apply consistency decay after the grace period · Decay is a percentage of consistency XP per inactive day, bounded by the daily XP cap and floor. Vacation dates pause decay. Timezone changes apply to future calendar allocation. | Let the habit level fade after days off · Each day without practice takes a share of your habit points, within the two limits above. Vacation dates stop the fading. A new time zone counts from today on. | R | not pinned | Phase C or D |
| `js/practice-progress-ui.js:66` | Woodshed library, card “Practice progress”, inside the fold “Goals, XP and consistency settings”: a button | Export progress JSON | Save my progress as a file | R | not pinned | Phase C or D |
| `js/practice-progress-ui.js:81` | Woodshed library, card “Practice progress”, in place of the chart while there is no practice | No recorded practice observations in this range. Start a performance to build this instrument’s history. | No practice in these days yet. Play a piece below and it shows up here. | R | `tests/practice-progress-ui.test.js:80` | Phase C or D |
| `js/practice-progress-ui.js:90-94` | Woodshed library, card “Practice progress”, the chart (shown once there is practice): the tip of a bar, and the chart’s name and description for screen readers | …: … engaged minutes · …: engaged practice minutes per day · … of … days have recorded observations. Blank positions have no practice observations. Exact values are in the history table. | 12 Nov: 14 minutes practised · Piano: minutes practised per day · 6 of 30 days have practice. The exact numbers are in the table below. | R | not pinned | Phase C or D † |
| `js/practice-progress-ui.js:101-103` | Woodshed library, card “Practice progress”, the table under the chart (shown once there is practice): its column heads and the small word under a timing | Engaged minutes · Earned XP · Raw accuracy · Measured timing · Observed tempo · Completed tempo · … onsets | Minutes practised · XP · Notes right · Timing (from the beat) · Tempo practised · Tempo of finished runs · 300 notes | R | not pinned | Phase C or D † |
| `js/practice-progress-ui.js:116` | Woodshed library, card “Practice progress”, first number | Lifetime earned XP · Recorded earnings stay intact when consistency decays. | All-time XP · This never goes down, even when your habit level does. | R | not pinned | Phase C or D † |
| `js/practice-progress-ui.js:117` | Woodshed library, card “Practice progress”, second number | Consistency XP · level … · This balance can decay after inactivity; it is not a measured skill level. | Habit level 3 · It fades when you do not practise and does not measure skill. | S | `tests/practice-progress-ui.test.js:63` | Phase C or D |
| `js/practice-progress-ui.js:119` | Woodshed library, card “Practice progress”, fourth number | Lifetime engaged practice · … recorded sessions for …. | Time practised, all time · 42 sessions on piano. | R | not pinned | Phase C or D † |
| `js/practice-progress-ui.js:120` | Woodshed library, card “Practice progress”, fifth number | Lifetime raw note accuracy · … matched / (… expected + … extra). Raw mistakes count before sound filtering. / No scored note observations yet. | Notes right, all time · 480 right out of 520 expected and 12 extra. A wrong note counts even when Scale lock kept it silent. / No scored notes yet. | R | `tests/practice-progress-ui.test.js:57`<br>`tests/practice-progress-ui.test.js:77` | Phase C or D |
| `js/practice-progress-ui.js:121` | Woodshed library, card “Practice progress”, sixth number | Mean absolute timing · … measured onsets; timing is separate from note accuracy. / No measured timed onsets yet. Wait-mode practice does not imply timing accuracy. | Timing: how far from the beat, on average · Measured on 300 notes. / No timed notes yet. Wait mode does not measure timing. | R | `tests/practice-progress-ui.test.js:59` | Phase C or D |
| `js/practice-progress-ui.js:122` | Woodshed library, card “Practice progress”, seventh number | Observed tempo · Tempo seen during recorded practice, including unfinished runs. | Tempo you practised at · Every run counts, finished or not. | R | not pinned | Phase C or D † |
| `js/practice-progress-ui.js:123` | Woodshed library, card “Practice progress”, eighth number | Completed tempo · Tempo of completed runs; completion does not certify note accuracy. | Tempo of finished runs · A finished run can still have wrong notes. | P | not pinned | Phase C or D † |
| `js/practice-progress-ui.js:126` | Woodshed library, card “Practice progress”, the bar under the numbers | Today: … / … engaged minutes · Calendar: …. Activity is assigned to its recorded instrument. | Today: 4.5 of 10 minutes practised · Days are counted in the time zone Europe/Berlin. Practice counts for the instrument it was played on. | R | not pinned | Phase C or D † |
| `js/practice-progress-ui.js:128-129` | Woodshed library, card “Practice progress”, the line under “Recorded history” | … · last … calendar days · … with recorded practice · … engaged minutes · …% raw accuracy (…/… notes) / no scored note observations. Missing timing or tempo stays unknown. | Piano · last 30 days · 6 days with practice · 84 minutes · 92% of notes right (480 of 520) / no scored notes yet. | R | `tests/practice-progress-ui.test.js:74` | Phase C or D |
| `js/practice-progress-ui.js:149` | Woodshed library, card “Practice progress”, inside the fold “Goals, XP and consistency settings”: under “Settings were not saved.” when a field is empty | … must be a finite number. (the field is named by its internal key, for example “xpPerMinute”) | “XP per minute of practice” needs a number. | P | `tests/practice-progress-ui.test.js:91` | Phase C or D |
| `js/practice-progress-ui.js:155` | Woodshed library, card “Practice progress”, inside the fold “Goals, XP and consistency settings”: under “Settings were not saved.” when no reason came back | The progress service rejected these settings. | These settings could not be saved. Check the numbers and try again. | P | not pinned | Phase C or D |
| `js/practice-progress.js:58-59` | Woodshed library, card “Practice progress”, inside the fold “Goals, XP and consistency settings”: under “Settings were not saved.” for a number out of range or an unknown time zone | … must be between … and …. (the field is named by its internal key, for example “dailyMinutes”) / timezone must be a valid IANA time zone. | “Daily goal” must be between 1 and 1440. / soundLAB does not know this time zone. Write it like Europe/Berlin or America/New_York. | R | not pinned | Phase C or D |
| `js/practice-progress.js:126-127` | Woodshed library, card “Practice progress”, inside the fold “Goals, XP and consistency settings”: under “Settings were not saved.” when the browser could not store them | Practice progress could not be persisted. | Your progress could not be saved: this browser’s storage is full or switched off. | R | not pinned | Phase C or D |
| `js/performance-player.js:67` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), the small line under the keyboard | Progress was not saved (… session). Retry or export the unsaved observations before closing the page. / … progress is tracked independently. Open Progress in the Woodshed library for lifetime XP, consistency level, daily goals and history. / … · lifetime … XP · consistency … XP · level … | Your practice could not be saved (1 session). Tap “Retry saving progress”, or “Export unsaved sessions” to keep it as a file, before you close the page. / Each instrument has its own progress: see Practice progress in the Woodshed library. / piano · 1,240 XP all time · habit level 3 | R | `tests/performance-progress.test.js:53` | Phase C or D |
| `js/performance-player.js:90` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: the status line after Start on a piece with chords, playing into the microphone | Chord audio is unsupported. Choose the arpeggio version or MIDI. | soundLAB cannot hear chords through the microphone. Tap “Use arpeggio version”, or play on a MIDI keyboard. | R | not pinned | Phase C or D |
| `js/performance-player.js:204` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), the line under the note to play | ○ Waiting for a fresh attack | ○ Waiting for you to play | P | not pinned | Phase C or D |
| `js/performance-player.js:217` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), a small line under the keyboard | LUMI Display: off — on-screen guidance is active / LUMI Display: … · hardware response unverified | LUMI lights: off. Follow the screen. / LUMI lights: on (LUMI Keys BLOCK). | S | not pinned | Phase C or D |
| `js/performance-player.js:219` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), the last small line under the keyboard | Scale Lock will mute … score notes outside the selected root/scale. Raw mistakes still count. Choose the intended scale in the treble-clef menu. / Raw input is scored before Scale Lock. Sound follows the shared selected root/scale. | Scale lock is on: 4 notes of this piece are outside A Dorian and will make no sound. They are still scored. Pick the piece’s scale in the key bar. / What you play is scored, whether Scale lock lets it sound or not. | R | not pinned | B5a (plan) |
| `js/performance-player.js:298` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: the status line after “Start listening” on a piece with chords | Monophonic audio cannot grade chords. Choose an arpeggio or MIDI pickup. | Through the microphone soundLAB hears one note at a time, so it cannot score chords. Tap “Use arpeggio version”, or play on a MIDI keyboard. | R | not pinned | Phase C or D |
| `js/performance-player.js:300` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: the status line after “Start listening” with an empty or wrong field | Enter valid calibration values and an ordered MIDI pitch range before listening. | Fill in every field under “Audio calibration and range”. The lowest note must be below the highest. | P | not pinned | Phase C or D |
| `js/performance-player.js:311` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), after “Use arpeggio version”: a line under “Source details and scoring limits” | Chords converted to sequential half-beat attacks for monophonic practice; this is an adapted exercise, not the original chord timing. | Each chord was turned into single notes, half a beat apart, so that you can play it one note at a time. The timing is no longer the piece’s own. | R | `tests/practice-audio.test.js:136` | Phase C or D |
| `js/performance-player.js:322` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), the result: eight of its twelve labels | Pending notes · Extra attacks · Complete targets · Tempo grades · Mean timing error · Hold samples · Mean absolute hold error · Hold accuracy | Notes not reached · Extra notes · Chords fully right · Perfect / great / good · Average distance from the beat · Held notes measured · Held too long or too short, on average · Held for the right length | P | `tests/performance.test.js:137` | Phase C or D |
| `js/performance-player.js:323` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), the result: the note under the numbers | Accuracy is matched notes ÷ (expected notes + extra attacks); wrong notes are included in extra attacks. Pending notes in a stopped run are unfinished, not newly marked misses. Loop totals include completed passes and the current pass. Timing is onset-based; hold measurements are separate. Wait for Me does not grade timing. Physical key release is required for repeated notes; pedal does not replace rearticulation. | Accuracy: right notes out of all notes of the piece plus every extra note you played. Notes you had not reached when you stopped are not misses. With a loop, every pass counts. Timing looks at when a note starts; how long you hold it is measured on its own. Wait for Me does not score timing. To repeat a note, lift the key and press it again: the pedal does not count. | R | not pinned | Phase C or D |
| `js/performance-player.js:329` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Source details and scoring limits”: its two fixed lines | PDFs, images and prose are not parsed scores. MIDI notes carry pitches and durations; ASCII rhythm is approximate. Ties are represented only by a single sustained note, never inferred from an image. · Exact pitches and octaves are required. Wait for Me grades chord attacks together and skips held-note duration after a correct answer. Play at Tempo matches each chord onset within ±120 ms; a rolled chord may qualify. Hold measurements are separate. | soundLAB cannot read notes from a PDF, a picture or a description. A MIDI file gives it notes and their lengths; a text tab gives only a rough rhythm. A tied note has to be one long note in the file. · The octave counts. In Wait for Me the notes of a chord are checked together, and how long you hold them is not scored. In Play at Tempo each note of a chord must start within 120 ms of the beat, so a quickly rolled chord can pass. How long you hold a note is measured on its own. | R | not pinned | Phase C or D |
| `js/performance-player.js:333` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: a list, a second list and a checkbox | Input source, with the choices “MIDI / virtual keys” and “Audio · single notes” · Performance input · Virtual key sound | Play with, with the choices “MIDI keyboard or the keys on screen” and “Microphone or audio interface (one note at a time)” · Keyboard to listen to · Sound of the keys on screen | R | not pinned | Phase C or D |
| `js/performance-player.js:333` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: the note under the keyboard list | MIDI sound uses soundLAB’s own voice, or MIDI Hub Thru in soundLAB Gear. LUMI output is selected separately in MIDI/LUMI settings. For lockout of an external synth’s own engine, Local Control must be OFF; software cannot mute its direct keyboard path. | A MIDI keyboard is heard through soundLAB’s own sound, or through your synth when MIDI Hub Thru is on in soundLAB Gear. The LUMI for the lights is picked in Settings › MIDI keyboard. Scale lock can silence a synth’s own keys only when Local Control is OFF on the synth. | P | not pinned | Phase C or D |
| `js/performance-player.js:333` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”, with “Audio · single notes” chosen: heading, first note and the status line | Instrument audio practice · USB-MIDI sends notes; USB audio/direct interfaces send sound. Play one clean note at a time. Audio is analysed locally, never uploaded or monitored by this detector. Scale Lock cannot mute acoustic or direct instrument sound. · Listening is off. Start deliberately to allow your chosen input. | Play into the microphone · soundLAB listens to your instrument and names the note. Play one clean note at a time. The sound stays on this device and is not played back. Scale lock cannot silence a real instrument. · Not listening. Tap “Start listening”; the browser may ask if soundLAB may use the input. | P | `tests/practice-audio.test.js:82` | Phase C or D |
| `js/performance-player.js:333` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”, inner fold “Audio calibration and range”: seven fields and the note under them | Lowest MIDI pitch · Highest MIDI pitch · Input transpose · Confidence · Noise gate RMS · Detection delay (ms) · Set reference tuning and the instrument’s sounding range; written-pitch transposition is separate from score transpose. Delay compensation is manual: compare consistent early/late results to a reference click, then adjust the measured input delay. The default is an estimate, not hardware calibration. Manual delay supports 0–400 ms plus a 100 ms confirmation allowance. No octave is guessed toward the target. Repeated notes need silence or a distinct new pluck. Chords, distorted signals and unstable bends may be rejected. In audio mode the key strip is a target preview; virtual/MIDI answers are ignored. Switch input source to use virtual keys. | Lowest note of my instrument · Highest note · My instrument sounds this many semitones away from what is written · How sure soundLAB must be of a note (0.7 to 1) · Ignore sound quieter than · How late my sound reaches soundLAB (ms) · Set your tuning and the range of your instrument. If every note is marked early or late by about the same amount, change the last field until a note played on the click is marked on time; the 100 ms it starts with is a guess. soundLAB never moves a note to the octave it expects. To repeat a note, stop it or pluck it again. Chords, heavy distortion and wide bends may not be heard. While you play into the microphone, the keys on screen only show what to play. | R | not pinned | Phase C or D |
| `js/performance-player.js:377` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece): the status after the chosen keyboard is unplugged | Selected performance input is disconnected. Virtual keys still work. | The keyboard you picked is not connected. The keys on screen still work. | R | not pinned | Phase C or D |
| `js/performance-engine.js:22` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Source details and scoring limits”, for a piece without exact rhythm | Source timing is approximate; timed results use the assumed beat positions. | This piece has no exact rhythm, so timing is scored against evenly spaced notes. | P | `tests/performance-engine.test.js:30` | Phase C or D |
| `js/performance-engine.js:31` | The same fold | An invalid or transposed out-of-range note was omitted. | A note outside the range of MIDI (after transposing) was left out. | R | `tests/performance-engine.test.js:26` | Phase C or D |
| `js/performance-engine.js:34` | The same fold | Zero-duration notes are graded for onset only. | A note without a length is scored only for when it starts. | R | `tests/performance-engine.test.js:34` | Phase C or D |
| `js/performance-engine.js:36` | The same fold | Tie marks are not interpreted; provide one sustained note per tied pitch. | Tied notes are not joined: the file must hold one long note. | R | `tests/performance-engine.test.js:30` | Phase C or D |
| `js/performance-engine.js:51` | The same fold | Overlapping repeated pitches require rearticulation; their hold durations are not scored. | Where a note starts again before it ended, lift the key and press it again. How long you hold these is not scored. | R | `tests/performance-engine.test.js:25` | Phase C or D |
| `js/performance-engine.js:385` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), the feedback line while playing | Release this pitch on every input channel before repeating it. | Let this key go before you play it again. | P | not pinned | Phase C or D |
| `js/performance-engine.js:415` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), the feedback line while playing | Extra note outside the target window. | Extra note: nothing was due just then. | P | not pinned | Phase C or D |
| `js/practice-input.js:96` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: the status line, playing into the microphone on a piece with chords | Audio practice supports single-note scores only. Use an arpeggio or MIDI pickup for chords. | Through the microphone soundLAB can score single notes only. For chords, tap “Use arpeggio version” or play on a MIDI keyboard. | P | not pinned | Phase C or D |
| `js/practice-input.js:104` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: the status line where the browser gives no audio input | Audio input is unavailable here. Use MIDI or virtual keys. | This browser gives soundLAB no microphone. Play on a MIDI keyboard or on the keys on screen. | R | not pinned | Phase C or D |
| `js/practice-input.js:122` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: the status line when the chosen input cannot be opened | The selected input is unavailable; no default input was substituted. | The input you picked is not connected. soundLAB did not switch to another one. | R | not pinned | Phase C or D |
| `js/practice-input.js:153` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: the status line when a chord comes up | This target contains a chord. Choose a monophonic score or a MIDI pickup. | The next thing to play is a chord, which soundLAB cannot hear through the microphone. Pick a piece of single notes, or play on a MIDI keyboard. | R | not pinned | Phase C or D |
| `js/practice-input.js:182` | Woodshed › guided performance (after “Wait for Me” or “Play at Tempo” on a piece), fold “Section and input”: the status line for a note outside the range set | Detected note is outside the configured instrument range; it was ignored. | That note is outside the range you set for your instrument, so it was ignored. | R | not pinned | Phase C or D |

Notes:

- `js/woodshed.js:1140`: The line the plan names for B15a (B15a.1: “reworded if no suite pins its text”). `tests/instrument-xp.test.js:111` pins it, so it waits.
- `js/practice-progress-ui.js:61`: Only the fold’s title is on the first screen.
- `js/performance-player.js:322`: The check wants “Hold samples” or “hold error” in the result.

## Train › Tuner

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/tuner.js:304-306` | Tuner, the red line after “Start listening” where the browser gives no microphone | This browser does not expose the microphone API on this page. Chrome and Edge allow mic access even when soundLAB is opened from file:// — Firefox and Safari need the app served over http(s) or localhost. | This browser gives soundLAB no microphone here. Open soundLAB from its web address in Chrome, Edge, Firefox or Safari. | R | not pinned | Phase C or D |

## Settings

`js/settings.js`, and the card “Hands-free control” of `js/remote.js`.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/settings.js:110` | Settings, card Sound, the line under “Time signature” | The context-bar time signature drives the metronome; the Jam band plays 4/4. | Set the time signature in the metronome. The Jam band always plays in 4/4. | W | not pinned | B17 |
| `js/remote.js:290` | Settings, card “Hands-free control”: a message 20 seconds after Learn was pressed and nothing followed | Learn timed out | Nothing was pressed. Tap Learn to try again. | P | not pinned | Phase C or D |

Notes:

- `js/settings.js:110`: From B5a on the time signature is set in the metronome sheet and no longer in the bar (the goal of B5a in the plan): the sentence is wrong from then on. B5a edits this file anyway (the accent row) and can take the line along.

## soundLAB Gear (Phase H)

Texts of Gear’s own files (`js/synthdeck*.js`, `js/synthtab.js`, `js/synthlive.js`, `js/midihub.js`, `js/helix.js`, `js/midirules.js`). Phase B does not change Gear’s pages (rule 11), so every row waits for Phase H. The MIDI words of these pages (CC, SysEx, Thru, Program Change, port, channel) are what the pages are about and are not listed.

| Line | Where it is shown | Today | Proposal | Why | Pinned by | Step |
|---|---|---|---|---|---|---|
| `js/helix.js:181-185` | Helix, the strip under the heading: the badge and the button in their three states | SAFE MODE OFF / ARMED / DISARMED · Disarm / Arm output | Every touch sends / Sending is on / Sending is off · Stop sending / Allow sending for 90 s | R | `tests/helix.test.js:105`<br>`tests/helix.test.js:261` | Phase H |
| `js/helix.js:413` | Helix › Blocks, a message when the pedal’s answer cannot be read | Edit buffer: unexpected reply | The Helix sent an answer soundLAB cannot read. Tap Re-read. | P | not pinned | Phase H |
| `js/helix.js:653` | Helix, the bridge’s status line when the list of model names is missing | Helix at … · no model names (tools/helix-defs.json missing) | Helix at … · amp and effect names are missing: start the bridge from the soundLAB folder so that it finds tools/helix-defs.json | P | not pinned | Phase H |
| `js/helix.js:732` | Helix › Blocks, the Parameters card for a block soundLAB has no names for | No parameter table for this model (tools/helix-defs.json not loaded by the bridge). | soundLAB does not know this block’s knobs. (The bridge did not find its list of names, tools/helix-defs.json.) | R | not pinned | Phase H |
| `js/helix.js:811` | Helix, the strip under the heading: a badge, a button and a chip | DISARMED · Arm output · safe mode (tooltip: Off = every control sends the moment you touch it) | Sending is off · Allow sending for 90 s · Only send after I allow it (tooltip: Off = every control sends to the Helix the moment you touch it) | R | `tests/helix.test.js:105` | Phase H |
| `js/helix.js:879` | Helix › Monitor, the second send row: the hint inside its second field | args JSON, e.g. [["i",-2]] (request id is added) | values, for example [["i",-2]] (soundLAB adds the request number) | R | not pinned | Phase H |
| `js/helix.js:880-881` | Helix › Monitor, second card: heading and the note under it | Observed from the pedal · The newest value of each message the Helix sent over MIDI. An echo is not proof a command was applied; the network read-back is. | What the Helix sent · The newest value of each message the Helix sent over MIDI. A message that comes back does not prove the Helix did it; what the bridge reads from the Helix does. | R | not pinned | Phase H |
| `js/helix.js:1032-1034` | Helix › Monitor, two messages after “Send to Helix” | Args must be JSON like [["i",-2],["s","key"]] · … reply frames (see monitor) | Write the values like [["i",-2],["s","key"]] · 2 answers came back (see the list above) | R | not pinned | Phase H |
| `js/midihub.js:234` | MIDI Hub, a message when a held note could not be ended on the output it was sent to | Original mapped MIDI output unavailable; release delivery could not be confirmed. | The synth this note went to is no longer connected, so the note may still sound. Tap Panic. | R | not pinned | Phase H |
| `js/midihub.js:245` | MIDI Hub, the same for a pedal or another controller that was held | Original mapped MIDI output unavailable; controller release could not be confirmed. | The synth this pedal went to is no longer connected, so it may still be held. Tap Panic. | R | not pinned | Phase H |
| `js/synthdeck.js:418` | Deck, a message the first time a control with an unchecked SysEx address is used | Sending an unverified … address — check the synth | This control’s address for the MODX has not been tried yet. Check on the synth that it did what you wanted. | R | `tests/synthdeck.test.js:199` | Phase H |
| `js/synthdeck.js:1317` | Deck › Sounds, a message after “Read name from synth” when the map’s request cannot be read | Bad request bytes in the map | The Map’s request for the name is not valid hex. Open Map and reset it. | P | not pinned | Phase H |
| `js/synthlive.js:171` | Live sets, a message after Learn was pressed for the foot switch and nothing followed | Foot switch Learn timed out | No foot switch was pressed. Tap Learn to try again. | P | `tests/remote-gear.test.js:212` | Phase H |

## Looked at and not listed

A text that uses a listed word is missing from the tables for one of these reasons. Each line named here was
read.

**Never shown to the user.**

- `js/midi.js:463`, `:616`, `:630`, `:679`, `:690`, `:702`, `:844`, `:1252`, `:1256`, `:1257` (“MIDI inventory
  changed.”, “Musical routes stopped.” and others): reasons handed to the event `midi:cleanup`, which nothing
  listens to.
- `js/tonein.js:84`, `:96`, `:109`, `:131`, `:132` (“Tone input is paused while audio practice owns capture.”):
  handed to the event `tonein:state`, which nothing listens to.
- `js/xp.js:35` and `:62` (“Lesson observations could not be persisted.”): handed to `xp:observation-error` and
  `xp:save-error`, which nothing listens to. `js/xp.js:21` (“Legacy player”), `:86` (the title “Consistency”)
  and `:89` (the label “Legacy / unassigned”): read by suites only (`tests/game.test.js:89`, `:97`,
  `tests/instrument-xp.test.js:28`). `:81`: thrown, printed nowhere.
- `js/practice-progress.js:39`, `:55`, `:60`-`:62`, `:66`, `:112`, `:115`, `:213`, `:233`-`:267`, `:300`,
  `:324`-`:334` (“Engaged seconds must be observed, finite, nonnegative …”): faults of a practice session or of
  a value the page cannot send. No page prints them: the Woodshed and Exercises show their own sentence
  (“Progress was not saved …”, listed).
- `js/practice-router.js:169`, `:199`, `:200`: replaced before they can be read, or covered by the section’s
  own text while the synth sound is on.
- `js/scoreplayer.js:303`-`:306`, `:320` (“Choose a nonempty reviewed score …”): checks of `loadScore`. The
  Songs page is its only caller in this branch (`js/songs.js:739`) and passes a complete score.
- `js/quiz.js:2977`, `js/app.js:1190`, `js/practice-input.js:101`: test hooks (`SLQuiz.lumiState`,
  `App.addPage`, the suites’ simulated microphone).
- `js/chordchart.js:478`, `js/songs.js:734`, `:755`, `js/synthdeck.js:1632` (“… is not in this build.”): shown
  only when a file of the app is missing, which the `assets` suite rules out.
- `js/practiceplan.js:31` and the other one-word strings among the hits: ids, event names, file types, store
  keys.

**Shown, and left as it is.**

- A music or gear word that is also on the word list: “ledger line” (`js/quiz.js:240`, `:243`, `:880`, `:958`,
  `:962`); “Decay” of a synth sound (`js/midihub.js:77`, `js/synthtab.js:74`, `js/synthdeck-maps.js`); “Master
  volume” (`js/settings.js:72`, `:331`); a drum pad’s “mapping” (`js/pads.js:172`, `js/help.js:123`);
  “Unassigned” and “snapshot” as the Helix’s own names (`js/helix.js:63`).
- A word that is explained where it stands: the Helix page’s messages about arming (`js/helix.js:98`, `:141`,
  `:159`, `:165`, `:166`, `:317`, `:900`-`:907`, `:972`, `:1037`, `:1085`, `:1086`, `:1091`, `:1104`: “Output
  is disarmed: press Arm first. Nothing was sent.”) and its tour (`js/help.js:117`); only the bare badge and
  button are listed. “? = from documentation, not checked on your synth” (`js/synthdeck.js:909`, `:947`,
  `:950`). “Latching button (every press switches on / off)” (`js/remote.js:356`). “the MIDI permission the
  browser blocked (SysEx)” (`js/lights.js:119`).
- A name the user has to type or pick as it is: `use-winrt-midi-api` and `chrome://flags`
  (`js/settings.js:160`), `node tools/helix-bridge.js` (`js/helix.js:699`, `js/help.js:116`), file types.
- Technical, and plain enough: `js/learn-instruments.js:13`; `js/practice-router.js:93`-`:97`, `:134`, `:171`,
  `:175`, `:206`; `js/woodshed.js:309`, `:314`, `:324`-`:325`, `:332`, `:389`; `js/lumi-practice.js:184`,
  `:185`, `:211`-`:213`, `:235`, `:268`-`:272`, `:438`-`:452`; `js/performance-player.js:132`, `:202`;
  `js/practice-input.js:21`-`:31`, `:87`, `:107`-`:131`, `:165`-`:211`; `js/scoreplayer.js:85`-`:248` (“Damaged
  MIDI file (running status).”: plain first, the detail in brackets).
- The source notes of the Deck’s map (`js/synthdeck-maps.js`, shown as tooltips in the Map table: “Data List:
  Performance Common, Arp master switch (MONTAGE capture confirmed)”): reference notes for someone who edits
  the map.

**Outside this list by its own rule:** code comments, console messages, and aria texts that only repeat a
visible label.

**Not read sentence by sentence:** the lesson texts of the Exercises course (`js/quiz.js:1`-`:1100`, about 270
strings of music theory), the Deck’s map data, `js/theory.js` and `js/daw/`. The two word lists ran over all
of them; what they hit there were music and gear words (“ledger line”, “Ear hooks”, “Decay”, “Master”) and the
map’s source notes.

## How this list was made

1. **Every string of the app.** A script read the 46 files under `js/` with the TypeScript parser and wrote out
   every string and template piece with its file and line: 22,005 strings. Comments are not strings, so they
   fall away here. `index.html` (151 lines) and `gear.html` (118 lines) were read whole.
2. **The five words.** A plain `grep -rniE "\b(legacy|canonical|context|disclosure|module)" js index.html
   gear.html` finds 164 lines, comments and identifiers included, none of them in the two HTML files. As
   strings it is 28 strings on 24 lines: 21 lines are rows of this list, 3 are not shown
   (`js/practiceplan.js:31`, `js/xp.js:21`, `:89`).
3. **The word list** (92 patterns, case ignored, at the start of a word), run over the 22,005 strings:
   legacy, canonical, context, disclosure, module, unassigned, observ…, ingress, lease, leased, facade,
   payload, fallback, fall back, falls back, disarm…, arm, armed, arming, persist…, explicit, scoped, bounded,
   hook, inventory, pinned, ownership, owns, subscri…, predicate, backend, native, virtual, simulated,
   synthetic, I/O, unverified, configured, instructional, illuminat…, pitch identity, emitted, mapped, mapping,
   admission, cleanup, frame, onset, rearticulat…, IANA, JSON, UTC, epoch, finite, nonnegative, null, console,
   init, script error, raw, engaged, consistency, decay, parsed, inferred, encoded, interpreted, glyph,
   localStorage, service worker, API, file://, localhost, substitut…, routing, route, master, credit,
   curriculum, allocation, certif…, monophonic, subset, stored, program color, sink, timestamp, capture,
   registered, parameter, invalid, unsupported.
   Result: 327 strings on 284 lines in soundLAB’s files and 145 strings on 122 lines in Gear’s files. 128 of
   those 406 lines hold a one-word string (an id, an event name, a file type). The other 278 lines were read
   as whole strings, and the source around them was opened wherever the string alone did not say whether, and
   where, it is shown.
4. **Reading.** Every string of two or more words (three or more in the larger files, four or five in Gear’s)
   was printed per file and read: 1,590 strings in 41 files, plus the tours of `js/help.js` in the source.
   Short labels (up to four words) of 21 files were listed and read for settings that are named instead of
   described. A second word list (42 patterns: retained, unconfirmed, structured, qualif…, acknowledg…,
   excluded, omitted, rejected, timed out, this build, identity, sandbox, viewer, runtime, flag, toggle, modal,
   keybed, transport, claim and others) gave 140 more hits to read.
5. **Where it is shown.** For every row the code that prints the text was followed to the element that gets it
   (the status line, the card, the message), and for an event to its listeners. That is how the texts under
   “Never shown to the user” were found.
6. **Checked by a script.** Each quoted piece of each row is on the line or lines the row names, after joining
   `'a' + 'b'`, dropping tags and decoding entities: 227 rows on 350 lines in 30 files, no miss. No proposal
   holds one of the five words.
7. **Pins.** A script took every regular expression and every string that is compared or searched for out of
   `tests/*.js` (68 suites, 20,078 lines, 3,235 pieces) and matched them against each row three ways: the
   piece is inside the text; the piece starts like the end of a text or ends like its start (a suite names a
   value where the text has a changing part: `/Credit: synth/`); the two share three words in a row. A second
   pass listed every one-word piece of five letters or more that occurs in a row. Each likely candidate was
   opened in the suite to see which element the check reads. 61 suite lines in 26 suites pin 60 rows. No suite finds one
   of these texts by a text locator (`:has-text` is used for tab names only).

## Count per step

| Step | Rows | The plan edits the line anyway | By rule 16 (first screen, not pinned) | Lines |
|---|---|---|---|---|
| B5a | 18 | 18 | 0 | `js/app.js:1670`, `js/app.js:1675`, `js/app.js:1679`, `index.html:55`, `index.html:56`, `js/lights.js:96`, `js/lights.js:116`, `js/lights.js:117`, `js/lights.js:118`, `js/help.js:40`, `js/help.js:77`, `js/keylessons.js:575`, `js/lumi-practice.js:428`, `js/lumi-practice.js:339-340`, `js/lumi-practice.js:378`, `js/lumi-practice.js:183`, `js/lumi-practice.js:480`, `js/performance-player.js:219` |
| B7a | 4 | 0 | 4 | `js/lights.js:105`, `js/lights.js:106`, `js/lights.js:107-108`, `js/lights.js:113` |
| B8 | 2 | 0 | 2 | `js/learn-instruments.js:26`, `js/learn-instruments.js:27` |
| B11 | 5 | 0 | 5 | `js/practiceplan.js:122`, `js/practiceplan.js:286`, `js/practiceplan.js:289`, `js/practiceplan.js:292`, `js/practiceplan.js:293` |
| B14b | 3 | 0 | 3 | `js/songs.js:238`, `js/songs.js:559`, `js/songs.js:562` |
| B17 | 1 | 0 | 1 | `js/settings.js:110` |
| Phase C or D | 181 | — | — | — |
| Phase H | 13 | — | — | — |
| **All** | **227** | | | |

The 181 rows for Phase C or D are: 54 pinned by a suite (11 of them on a first screen), 11 on a first screen and not pinned that wait with their name (†), and 116 that are neither pinned nor on a first screen.

Steps without a row: B5b, B6, B7b, B9, B10, B12, B13, B14a, B15a, B15b, B16.
They have nothing to reword from this list. B10 (Exercises), B12 (Piano) and B15a (Woodshed) are among them
because every first-screen row of those pages is pinned, waits with its name, or is a line the plan already
edits in B5a. B5b and B7b still change the texts the plan gives them (“Keyboard lights”, the tours’ steps).

| Page | Rows | On a first screen | Pinned by a suite | Reworded in Phase B |
|---|---|---|---|---|
| Shell: a page that did not start | 2 | 0 | 2 | 0 |
| Shell: key, scale and tempo (the key bar from B5a on) | 8 | 0 | 3 | 5 |
| Shell: the instrument bar above the Learn pages (the Instrument sheet from B8 on) | 5 | 2 | 0 | 2 |
| Shell: the Lights & help sheet (“Keyboard lights” from B5b on) | 8 | 8 | 0 | 8 |
| Shell: messages | 1 | 0 | 0 | 0 |
| Shell: the help tours | 8 | 0 | 0 | 2 |
| Learn › Exercises | 24 | 3 | 11 | 0 |
| Learn › Chords | 0 | 0 | 0 | 0 |
| Learn › Circle | 0 | 0 | 0 | 0 |
| Learn › Plan | 24 | 7 | 5 | 5 |
| Guitar › Neck, Tab, Notation | 2 | 0 | 0 | 0 |
| Keys › Piano | 61 | 2 | 9 | 6 |
| Keys › Charts | 0 | 0 | 0 | 0 |
| Keys › Pads | 0 | 0 | 0 | 0 |
| Play › Songs | 5 | 3 | 1 | 3 |
| Play › Jam | 0 | 0 | 0 | 0 |
| Train › Woodshed | 63 | 16 | 25 | 1 |
| Train › Tuner | 1 | 0 | 0 | 0 |
| Settings | 2 | 1 | 0 | 1 |
| soundLAB Gear (Phase H) | 13 | 2 | 4 | 0 |
| **All** | **227** | **44** | **60** | **33** |

By reason: 20 rows use one of the five words (W), 146 a close relative (R), 19 name a setting or a part of the app (S), 42 were found by reading (P).

