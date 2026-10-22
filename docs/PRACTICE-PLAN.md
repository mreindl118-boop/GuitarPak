# Practice plan

The `practiceplan` module turns pasted teacher notes into a short daily session:
warm-up, technique, repertoire, then ear/theory. Each block quotes the source
line, explains any setup still needed, and opens an existing soundLAB module.
The navigation home is **Learn > Plan** (page title **Practice plan**). Starter blocks are suggestions,
not assignments from a teacher.

Implementation: `js/practiceplan.js`, registered through
`App.register('practiceplan', {init, onShow, onHide, onKey})`. DOM IDs and new
classes use `pp-`; styles use `App.injectCSS`; owned storage uses `App.store`
keys under `pp.*`. Other modules' progress is read, not rewritten.

## Use a teacher's notes

1. Select a student, or add a separate student workspace.
2. Open **Teacher's lesson notes**, choose Keys or Guitar, and optionally paste
   the Google Docs share link.
3. Paste the assignments, one per line, or import `.txt`, `.md`, or a Google
   Docs API JSON export. Files and pasted text are limited to 128 KB. Semicolons
   also separate assignments. Empty lines, common headings, duplicate lines,
   and standalone URLs do not become blocks.
4. Choose **Review mapping**. Check both the proposed blocks and the module
   gaps, then choose **Accept this plan**. Previewing does not replace the
   accepted plan. Escape dismisses the preview.
5. Start a block. Use the module's remaining controls where the guide requests
   them, then return to Practice plan to see measured progress. **Refresh
   progress** updates it immediately; the visible page also refreshes regularly.

The saved Google Docs link is a bookmark. **Open saved lesson Doc** opens it in
the browser; the module neither fetches it nor obtains Google authorization.
Save the link with an accepted plan. Docs JSON is converted to text, including
paragraphs in tabs and tables; it does not retain rich formatting, verify the
source document's identity against the link, or interpret red assignment
markers. Import the relevant assignments and review the result. The module does
not import the Desktop 4 planner's private backup format or migrate its browser
profile.

No OAuth client, API key, secret, token, external script, network request, or
automatic synchronization is introduced. Source notes stay in this browser's
local storage. Exported gaps include source text, so choose an appropriate
private location when downloading them.

## Mapping rules and setup limits

`RULES` near the top of `js/practiceplan.js` is the single readable routing
table. The first matching rule wins; keep one assignment per line. The scale
matcher then checks the actual `App.keysLessons.LESSONS` catalog for an exact
root, scale, hand, octave count, and pattern.

| Notes contain | Destination | Setup and limits |
| --- | --- | --- |
| Tune, tuner, tuning | Tuner (`tuner`) | Open the tuner, then press Start and grant microphone access if wanted. Tuning accuracy and a completed tuning task are not recorded. |
| Scale or pentatonic, with Keys selected | Keys lesson (`piano`) | Open the matching lesson with `App.keysLessons.open(id)`. An unspecified hand defaults to RH; hands separate produces RH and LH blocks where both exact lessons exist. An unspecified octave count defaults to one. Uses the lesson's saved speed level. |
| Scale or pentatonic, with Guitar selected or guitar/fretboard specified | Fretboard (`fretboard`) | `App.emit('fb:practice', {root, scale, bpm})` applies the context and starts the runner. Practice time is measured; note correctness is not graded by this planner. |
| Hanon, rudiment, paradiddle | Woodshed (`shed`) | Choose or generate the exercise and start it. No public hook selects/imports this exact score, so a setup gap is also recorded. |
| Chord, triad, voicing, progression, cadence | Chords (`chords`) | Shared key and tempo are applied. Select the requested voicing or pattern in the module. Area practice time does not verify the assigned chord exercise. |
| Jam, improvise/improvisation, backing track | Jam (`jam`) | Shared key and tempo are applied. Select and start the requested backing material. Area practice time does not judge the musical result. |
| Song, piece, repertoire, numbered bars/measures | Woodshed (`shed`) | Choose or import the piece manually. The missing direct score setup hook is logged as a gap. A measured run or time does not prove that the assigned piece was played correctly. |
| Ear training, interval, note names, key signature, theory, quiz, exercise | Exercises (`quiz`) | Choose the topic/ear mode. Answer time and new passing best scores can complete a block. Ear/interval/key-signature requests also log the missing exact topic setup hook. |
| Warm-up | Fretboard (`fretboard`) | Start the scale runner with the shared context. |
| Unmatched text or an unsupported assignment | No substitute block | Keep the original source text and a reason in module gaps. |

Specific Keys limitations are reported rather than disguised as equivalent
lessons. For example, G major two octaves exists for LH as `g2-l`; the current
catalog has no matching RH lesson. G major one octave has `g-r` and `g-l`.
Hands together, graded arpeggios, chromatic/whole-tone/diminished scale lessons,
and missing key/hand/octave combinations are gaps. Requests for an exact Keys
speed or level also create a gap: `open(id)` cannot set either through a public
setup hook. The user can select the lesson level in Keys. Singing, sight reading,
transcription, pedal technique, embouchure, and bowing requests are currently
unmapped.

Mode names and spelled flat/sharp keys are recognized. Unsupported larger
octave ranges, contrary motion, articulation, and interval patterns such as
tenths become gaps rather than simpler substitute exercises. Markdown heading
markers are stripped while actionable heading text is still mapped. Put
assignments with different keys on separate lines. Resolved key, scale, tempo,
duration, and requested Help are part of plan/block identity, so a changed
configuration does not inherit an old completion.

Suggested durations are 2 minutes for tuning; 3 for warm-up or ear/theory; 4 for
chords; and 5 for scales, Woodshed, Jam, or repertoire. A recognized explicit
`N min`/`N minutes` replaces the suggestion, clamped to 1–60 minutes. These are
practice-plan suggestions, not inferred teacher prescriptions. The source line
remains visible for comparison.

Recognized key/scale and explicit BPM are applied to the shared context. If no
key is given, the current shared root is used; the scale defaults to major, and
tempo uses the current `met.bpm` (fallback 80). Explicit BPM is clamped to
30–280. A source request such as `help level 2` uses `App.help.set(2)`; the
**Lights & help** button opens the shared controls. Help levels are None (0),
Tonic (1), Target (2), Colors (3), and Full (4). These controls affect the app's
shared context, not a separate student-specific instrument session.

## What counts as done

Blocks are measured; there is no manual completion checkbox. Immediately before
launching a block, the planner snapshots the relevant telemetry and compares
later evidence against that baseline. Old best scores, earlier lesson runs,
and practice time recorded before launch do not complete it.

| Block | Evidence after launch |
| --- | --- |
| Keys lesson | A newly recorded run for that exact lesson with positive played-note/score evidence, or the suggested number of active Keys minutes. An empty infinite run does not count. A played run is evidence of practice, not a passing score. |
| Exercises | A new or improved passing best result in `qz.prog` (at least 8 correct), or the suggested number of seconds answering questions from `App.xp.today().s`. |
| Woodshed | An increase in `ws.xp` from a finished run, or the suggested active Woodshed minutes. Phrase mode does not increment `ws.xp` at each repeated phrase. |
| Fretboard, Chords, Jam and other timed areas | The suggested number of active seconds in the matching XP practice area. |
| Tuner | No dedicated completion signal exists. It stays open without recorded playing-time evidence; merely opening it or leaving it open is insufficient. |

The Keys comparison reads `kl.prog[lessonId].runs` rather than treating a saved
level, passed flag, or mastery as new work. The log retains only 40 runs and
lacks unique run IDs. A rare new run identical to an old entry at the 40-run
rollover can therefore be undercounted; the planner keeps the block open until
fresh evidence or the time target exists. It does not manufacture completion.
Exercises best scores likewise do not change when a student repeats the same
best result; answering time still accumulates.

Only one block is measured at a time. Starting another block, changing students,
or accepting a plan settles the previous block and changes/stops its active
measurement. Continuing a block preserves the already measured seconds and
starts a fresh baseline. Measurement ends at a date change or plan change.
Activity in the matching area while a block is active can count even if the
user chooses a different exercise there. Timed activity measures practice in
that area; it does not judge the assigned piece, voicing, passage, or technique.

XP's ledger counts active playing/runners and Exercises answer time, not simply
time with a page open. The planner reads `App.xp.today()` and
`App.xp.history(7)`, which include current in-memory ledger increments. It does
not award its own XP or edit existing telemetry. The weekly minutes and active
days are shared across soundLAB on this browser/device; the displayed completed
blocks belong to the selected student. They are different measures and should
not be interpreted as isolated student practice minutes.

## Local plans, history, and gaps

- `pp.students`: student IDs/names, saved Doc bookmarks, selected instrument,
  and each student's accepted plan and source text.
- `pp.active`: selected student ID.
- `pp.sessions`: per-student, local-date, and plan completion evidence. Sessions
  older than 90 days are pruned when sessions are saved.
- `pp.running`: one active block and its telemetry baseline.
- `pp.history`: up to 40 previously replaced plans, with student ID and archive
  time. Accepting new notes does not erase earlier session evidence.
- `pp.gaps`: per-student source text, reason, count, plan IDs, and last-seen time.

Gaps appear under **What soundLAB can't do yet** after acceptance. Each matching
source/reason is counted once per distinct accepted plan. Reaccepting the same
plan does not inflate its count. An assignment can have a supported block and
also a setup gap, such as a Woodshed piece needing manual import.

**Export gaps** downloads `soundlab-module-gaps-YYYY-MM-DD.json` with the
selected student's name, export time, and cumulative gaps. It does not upload
the data or send it to Claude. The export is a planning metric for deciding
which module or public setup hook to build next, not a full plan/history backup.

## Validation

`tests/practiceplan.test.js` uses Playwright and `tests/env.js`. Serve a separate
checkout with the repository's quiet server, which supplies the intended JS and
font MIME types:

```powershell
# Terminal 1, from this checkout:
& 'C:\Users\mrein\AppData\Local\Programs\Python\Python313\python.exe' tests/serve.py
```

```powershell
# Terminal 2, from this checkout; existing isolated test dependencies:
$env:NODE_PATH = 'C:\Users\mrein\Documents\Codex\2026-10-22\task\practice-test-tools\node_modules'
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\mrein\Documents\Codex\2026-10-22\task\practice-test-tools\browsers'
$env:SL_URL = 'http://127.0.0.1:4573/index.html'
& 'C:\Program Files\nodejs\node.exe' tests/practiceplan.test.js
```

These paths describe the isolated Windows validation setup for this change;
replace them with the local runtime/dependency paths on another machine.
`CHROMIUM` may point to an existing compatible browser executable; otherwise
Playwright uses its installed Chromium. Keep dependencies/browser caches outside
the repository. `AAPT` enables the optional APK checks in the existing update
suite when available.

Run every suite listed in `tests/run.sh`, then the new suite. With the server
above still running, the equivalent PowerShell loop is:

```powershell
$suiteNames = @('fingering','lights','keys','practice','game','quiz','nav',
  'smoke','taps','update','audio-level','midihub','audioin','btmidi','colors',
  'multiin','lumidisplay','practiceplan')
foreach ($suiteName in $suiteNames) {
  & 'C:\Program Files\nodejs\node.exe' "tests/$suiteName.test.js"
  if ($LASTEXITCODE -ne 0) { throw "Failed suite: $suiteName" }
}
```

## Release handoff

The feature needs its panel and script in `index.html`, its page ID/label in
`js/app.js` navigation, its `sw.js` asset entry, and its own
`TOURS.practiceplan` guide in `js/help.js`. Review the small integration changes
with the new module, test, and this document.

Claude's release integration should add `practiceplan` to the default suite
list in `tests/run.sh`, bump the service-worker cache/release version according
to `CLAUDE.md`, rerun the complete suite list, and include the feature in the
approved release. This feature does not change release bookkeeping, Android
packaging, or Claude-owned modules. Missing setup hooks are documented as gaps
and questions for that integration work. Publishing a branch/handoff to Claude
or deploying a release still requires the applicable user approval; a local
implementation or this document does not grant it.
