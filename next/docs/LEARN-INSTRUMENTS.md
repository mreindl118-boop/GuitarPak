# Learn categories and instrument credit

Learn has one explicit category: Piano, Synth, Guitar, Bass, Drums, Voice or
Other. Its shared category bar appears on Exercises, Chords, Circle and Plan.
Keyboard exercises appear for Piano/Synth, six-string neck exercises for
Guitar, and four-string E1–A1–D2–G2 exercises for Bass. Notation, ear training
and theory are shared where appropriate. Drums currently has shared theory
and links to actual drum/rhythm practice; it does not claim a dedicated pitched
drum quiz curriculum. Voice has shared pitch/ear material, not vocal technique.

Entry links lead to existing instrument tools and supported lessons. Shared
source material can be practiced by another instrument; its source label does
not decide the instrument receiving practice credit. The active credit category
is visible in the player/lesson. Audio remains monophonic, with incompatible
chords explicitly rejected or adapted as described in [practice inputs](PRACTICE-INPUTS.md).

## One award ledger

New lessons, Keys lessons, Woodshed runs and guided performance use
`App.practiceProgress`, with one lifetime/current consistency balance per stable
instrument ID. Earning parameters, daily goals, streaks and consistency decay
come from that same service. The legacy `SLXP` interface now supplies scoped
question statistics and bridges explicit observed sessions to this ledger.
There is no second per-answer bonus balance or passive wake-based XP timer.

Each run captures its instrument and a unique session ID at start. It cannot
be relabeled by a category change, tab switch, selected device name or later
score-source label. An active quiz must end before changing its category. A
guided player category change stops and records the old run before selecting
the next instrument; hiding/returning alone pauses the same run. Restarts use
new IDs. The canonical store rejects a repeated ID across instruments, including
retry callbacks, so the same run is not awarded twice.

Knowledge questions retain question accuracy/speed observations, separately
from musical note accuracy. They record bounded actual answer engagement, at
most five seconds per answer, and no fabricated note/timing/tempo observations.
Musical lessons preserve measured/pending note counts. Casual tools, a looping
backing track or an open metronome do not infer an instrument or earn passive
XP. Unsaved observations have visible retry/export recovery.

## Preserved history

Existing `xp.*` totals/days and old course `qz.prog` remain **Legacy / unassigned**.
They are not copied into all seven instrument balances. New course completion
is stored under `qz.instrumentProg` by instrument. Earlier keyboard/Woodshed
records and achievements are retained, with original identity where available;
missing historical instrument identity is not guessed. Shared keyboard course
unlock state is labeled as a shared course rather than a measured instrument
skill score.

Switching a category alone writes no practice session, award or completion.
The progress selector changes the history being viewed, not historic ownership.
All data remains local and versioned; exports provide a backup, while clearing
browser site data is outside app persistence guarantees.

## Global musical context

The vector treble-clef control remains in the header on every built-in tab and
workspace, including Exercises and Settings. It provides the single root/scale,
Scale Lock, LUMI Display and pitch-color mode. Keyboard opening, Escape/focus
return, outside tap and navigation closure are supported. Modal utility sheets
temporarily disable the disclosure to avoid competing overlays. It does not
request hardware permission merely by being opened.

Tests: `learn-instruments`, `instrument-xp`, `instrument-session`,
`context-global`, and the existing course/navigation/progress regressions.
