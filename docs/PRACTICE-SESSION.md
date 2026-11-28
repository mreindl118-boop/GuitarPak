# Practice session (Learn > Plan)

`js/practicesession.js` — prefix `ps-`, store `ps.*`, hook `App.practiceSession`
/ `window.SLSession`, suite `tests/practicesession.test.js`.

## What it is

Not a page. Three small pieces on top of what the app already has:

1. **The session card** `#ps-card`, the first card of Learn > Plan (mounted by
   `practiceplan.js` init).
2. **The countdown chip** `#ps-chip` in the top bar, shown only while a block
   runs. A tap opens the session card (or the check-in when time is up).
3. **The check-in dialog** `#ps-check` after every block.

## How a session is built

- Pick one or more of Guitar / Keys / Bass / Voice. Default = the weekday's
  suggestion (`SUGGEST`, Sun..Sat).
- Pick the minutes (stepper in 5s, chips 10-60; 5 minutes per part at least,
  120 at most). The last choice is remembered (`ps.len`).
- The minutes split **evenly into parts, one instrument after the other**.
  Inside a part every block keeps its share (`fit`), 2 minutes at least; under
  12 minutes a part keeps only its `core` blocks.
- **Voice is the only thing that rides on another instrument.** Voice plus an
  instrument offers "Sing with <instrument>" (a sing-and-play part right after
  that instrument: play alone, hum, speak, sing) or "On its own".
- **Keys uses the teacher's plan when one was accepted** (`teacherBlocks`): the
  blocks are the Plan's own piano items and start through
  `App.practicePlan.launch`, so the Plan's measured completion still applies.
  Without accepted notes the built-in Keys template is used.

## Running a block

`start(uid)` sets the Learn category to the part's instrument, pushes the
block's key / scale / tempo over the bus (`fb:set`, `tempo`, `fb:practice` for
the Neck runner), switches to the block's page and shows its one-line hint as
an `App.toast`. The clock (`ps.run`) is wall-clock based and ticks on a 500 ms
interval; `App.wake` tag `ps-run` keeps the screen on.

- 1 minute left (blocks over 2 minutes): one soft beep.
- Time up: the alarm chimes every 2 s (through `App.getAudio()`, so master
  volume applies) until the check-in is touched, 1 minute at most. `ps.sound`
  switches the sound off; the dialog still opens.
- Check-in: focus (Locked in / Drifted / Lost it) and difficulty (Too easy /
  Just right / Too hard), an optional note, one line of advice, then **Next**
  starts the following block straight away.

## Rules it keeps

- Nothing starts, sounds, prompts or switches pages at boot or on a reload. A
  block that was running comes back **paused**.
- No new page, pill or tab. Outside Learn > Plan only the chip shows, and only
  during a session.
- It never writes other modules' progress. Its own record is
  `ps.log[day] = { picks, len, sing, blocks: { uid: { done, focus, fit, note,
  secs, at } }, win }`, 90 days kept.

## Not done yet

- The controller remote's Next / Back still drive the Plan's own blocks.
- No per-day history view of the check-ins (the data is stored).
- Bass exercises are 4-string; a 5-string's low B is not covered.
