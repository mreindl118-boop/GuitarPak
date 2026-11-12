# Hands-free control (the controller remote)

Move practice on from the instrument: no reaching for the iPad or the computer. Three actions:

| Action | What it does |
|---|---|
| **Next** | start · show answer · next question · next level · next block · play / pause |
| **Back** | retry · hear it again · restart |
| **Stop** | end the run |

Set it up in **Settings › Hands-free control**. The Lights & help sheet shows what is set, with a *Set up* link.

## What can press them

- **A MIDI button or pedal.** Press *Learn* beside an action, then the button. The app takes the first
  press of a CC (value 64 or more; bank select and channel-mode CCs are skipped), a Program Change or a
  key. It remembers the channel and the port name. If that port isn't connected, the learned button
  works from any port, so it survives another computer or the Android app.
  - **Yamaha MODX / MONTAGE:** the best button is a foot switch in the assignable FOOT SWITCH jack, with
    UTILITY › Settings › Controller › *FS Assign* set to a CC number no Performance uses. It is a global
    setting, so it survives Performance changes.
  - The **Assign switches 1 / 2** (CC 86 / 87) also work, but they also do whatever the Performance
    assigns to them.
  - A switch that latches sends on / off on alternate presses. Tick *Latching button* so that every
    press counts.
  - A bound message is **claimed** in `js/midi.js` before any listener (`App.midi.setInputClaim`). It
    never sustains, sounds, goes through the Hub's Thru, reaches the Woodshed's grading or answers a
    question. It only advances. The Hub Monitor doesn't list it; it shows up as the `'midi:remote'`
    event instead.
- **A Bluetooth page turner.** These pedals type keys.
  - Tick *Page turner pedal* to map Page Down, Right or Down to Next, and Page Up, Left or Up to Back.
    Alternatively, *Learn* any key per action.
  - Keys never fire while you type in a field. Their default is prevented, so the page doesn't scroll.
  - **This is the only hands-free option in Safari on an iPad, which has no Web MIDI.**
- **Double-tap the lowest key** (opt-in, for a LUMI with no pedal). The leftmost key of the LUMI's
  window (`App.midi.range().lo`) moves with the octave buttons.
  - On pages that allow it (`remoteKey` in the module contract), that key is **reserved**: it doesn't
    play or count as an answer there. Two strikes within 350 ms count as Next.
  - When a LUMI is connected, only the LUMI's key is reserved.
  - The Woodshed releases the key while you play.
  - On the Piano page (Keys › Piano; older notes call it the Keys page) the key is reserved only while
    the section *Notes and triads on the LUMI* is open with simulated answers. Hardware answers arrive
    on their own port, so the key isn't reserved then. With the section closed, the key plays and is
    graded as always.
  - The Keys page's scale lessons keep their own double-tap (`kl.dbltap`: start / stop) and are never
    claimed. Their double-tap stands down while the LUMI section is open.

## What each page does

The active page decides, through its module hook `onRemote(action, info)`:

| Page | Next | Back | Stop |
|---|---|---|---|
| Exercises | Continue the path or start the level · Next after an answer · on an unanswered question, press twice to show the answer (never in Endless) · the result screen's main button | Hear the question again · Try again · close the node card | End the run |
| Exercises: multiple choice | **Play the answer's white key**: each choice shows one (up to 7 choices: C D E F G A B in any octave; more: the white keys up from the window's bottom C, so a LUMI's two octaves hold 14). After a miss, the right answer's key moves on. | | |
| Keys lessons (Keys page) | Start · Next level / Again · next lesson after the top level | Retry the level just played · restart the run (a finished run is scored first) | Stop, like the Stop button (End run in ∞) · results → the lesson list |
| Keys page runner (while it plays or guides) | Resume · skip a note (Guide) | Restart · one note back (Guide) | Pause |
| Woodshed / Guided performance | Start · Again · Resume · in Phrases, the next phrase | Restart · in Phrases the phrase before | End the run (stays in the session) · with nothing running, back to the Library |
| LUMI practice (on the Piano page, while its section is open) | Start · Check → next target · skip a target in guided flow | — | Stop |
| Practice plan | Launch the next block not yet done | Relaunch the last block | — |
| Plan page: one-minute chord changes (Free practice) | Count a chord change | — | End the chord run · with no run, pause the Free practice timer |
| Fretboard / Tab / Notation runner, Songs | Play / pause | Restart | Stop |
| Live sets, the Deck | Next slot (or next program; never while the Deck's Map Learn listens) | Previous | — |

Two pages hold more than one thing a press could mean. Each has one rule:

- **Piano page: the open LUMI section owns the pedal.** While *Notes and triads on the LUMI* is open, it
  alone answers. A press it has no use for does nothing: it never starts a lesson or the runner.
  Opening the section stops a lesson run and the runner. Starting a lesson or the runner, or opening a
  lesson from the Plan page or the Learn bar, closes the section and stops its session. With the
  section closed, the lessons answer first, then the runner.
- **Plan page: the Free practice cards are asked first.** During a one-minute chord run, Next counts a
  change. For 1.5 seconds after the minute ran out it answers "Time's up", so a late press doesn't
  launch a plan block. Stop ends the run; with no run, it pauses the Free practice timer if that is
  running. At any other time the Practice plan row applies. Back is always the plan's.

The order of checks:
1. A help tour takes the action first: Next and Back move through it, Stop closes it.
2. The clef dropdown and any sheet fold away.
3. Settings only shows "Next works", which is a test.
4. The active page decides.
5. If the page has nothing to do, a toast says so.

A big HUD (`#remote-hud`, `role=status`) confirms what happened, so you can read it from the bench.
MIDI isn't a user gesture: if the sound is asleep, a toast asks for one tap on the screen.

## Store and API

- **Store keys:**
  - `remote.map`: `{next|back|stop: {midi: {t, n, ch, port, latch}|null, key: {code, key}|null}}`
  - `remote.pt`: the page-turner keys
  - `remote.dbl`: the double-tap key
  - All three are included in Settings › Backup.
- **API:** `App.remote` exposes `learn`, `cancelLearn`, `clear`, `setLatch`, `setPageTurner`,
  `setDoubleTap`, `map`, `summary`, `bindingText`, `fire(action, via)`, `mount` and `paint`.
- **Routing:** `App.remoteAction(action, info)` and `App.remoteKeyPage()` live in app.js.
- **Bus events:** `'remote'` `{action, via, handled}`, `'remote:map'` and `'midi:remote'`.
- **Tests:** `tests/remote.test.js` covers the core: Learn, claiming, press edges, ports, page turner,
  double-tap, routing and the Android bridge. `tests/remote-*.test.js` covers each page.
