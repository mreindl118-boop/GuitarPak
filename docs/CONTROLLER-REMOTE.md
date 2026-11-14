# Hands-free control (the controller remote)

Move practice on from the instrument: no reaching for the iPad or the computer. Three actions:

| Action | What it does |
|---|---|
| **Next** | start · show answer · next question · next level · next block · play / pause |
| **Back** | retry · hear it again · restart |
| **Stop** | end the run |

Set it up in **Settings › Hands-free control**. The Lights & help sheet shows what is set, with a *Set up* link.

Since 2.0 there are two apps: soundLAB (`index.html`) and soundLAB Gear (`gear.html`: the Deck, Live sets,
the Hub, Helix). The card is in **soundLAB › Settings**, and Gear users set the pedal up there too. Gear has
no Settings page: its gear icon and the *Set up* link in its Lights & help sheet open soundLAB's Settings.
Both apps read the same saved bindings, so a pedal learned in soundLAB works in Gear. [Two windows](#two-windows)
says which app answers when both are open.

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
  - A bound message is **claimed** in `js/midi.js` before any listener (`App.midi.setInputClaim`), in
    soundLAB and in Gear alike. It never sustains, sounds, goes through the Hub's Thru, reaches the
    Woodshed's grading or answers a question. It only advances. The Hub Monitor doesn't list it; it
    shows up as the `'midi:remote'` event instead.
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
    claimed. Their lowest-key double-tap stands down while the LUMI section is open.
  - In soundLAB Gear the key is never reserved: on the Deck and Live sets the lowest key plays the
    synth, and the Hub and Helix have nothing for it to do.

## What each page does

The active page decides, through its module hook `onRemote(action, info)`.

### soundLAB (`index.html`)

| Page | Next | Back | Stop |
|---|---|---|---|
| Exercises | Continue the path or start the level · Next after an answer · on an unanswered question, press twice to show the answer (never in Endless) · the result screen's main button | Hear the question again · Try again · close the node card | End the run |
| Exercises: multiple choice | **Play the answer's white key**: each choice shows one (up to 7 choices: C D E F G A B in any octave; more: the white keys up from the window's bottom C, so a LUMI's two octaves hold 14). After a miss, the right answer's key moves on. | | |
| Keys lessons (Keys page) | Start · Next level / Again · next lesson after the top level | Retry the level just played · restart the run (a finished run is scored first) | Stop, like the Stop button (End run in ∞) · results → the lesson list |
| Keys page runner (while it plays or guides) | Resume · skip a note (Guide) | Restart · one note back (Guide) | Pause |
| Woodshed / Guided performance | Start · Again · Resume · in Phrases, the next phrase | Restart · in Phrases the phrase before | End the run (stays in the session) · with nothing running, back to the Library |
| LUMI practice (on the Piano page, while its section is open) | Start · Check → next target · skip a target in guided flow | — | Stop |
| Practice plan | Launch the next block not yet done | Relaunch the last block | — |
| Plan page: one-minute chord changes (Free practice) | Count a chord change | Nothing during a chord run (the press is held, so the run goes on) · with no run, the Practice plan row | End the chord run · with no run, pause the Free practice timer |
| Fretboard / Tab / Notation runner, Songs | Play / pause | Restart | Stop |

On the Songs page the pedal drives the bar-loop player. The score Player card under *Open a score* has
its own Play and Stop buttons and does not answer the pedal.

### soundLAB Gear (`gear.html`)

| Page | Next | Back | Stop |
|---|---|---|---|
| Live sets | Next slot of the active set (not while slots are being edited or picked; while its foot-switch Learn listens, the press only says that this pedal is the remote's) | Previous slot | — |
| The Deck | Next slot of the active Live set; with no set, the next program (never while the Deck's Map Learn listens or the preset builder is open) | Previous slot or program | — |
| Hub, Helix | — | — | — |

A step goes through the Deck's one send path, so a refused send (Synth out is the LUMI, no MIDI) moves
nothing and the Deck says why. The Hub and Helix have nothing to move on; a toast says so.

In soundLAB, two pages hold more than one thing a press could mean. Each has one rule:

- **Piano page: the open LUMI section owns the pedal.** While *Notes and triads on the LUMI* is open, it
  alone answers. A press it has no use for does nothing: it never starts a lesson or the runner.
  Opening the section stops a lesson run and the runner. Starting a lesson or the runner, or opening a
  lesson from the Plan page or the Learn bar, closes the section and stops its session. With the
  section closed, the lessons answer first, then the runner.
- **Plan page: the Free practice cards are asked first.** During a one-minute chord run, Next counts a
  change. For 1.5 seconds after the minute ran out it answers "Time's up", so a late press doesn't
  launch a plan block. Back does nothing during a run and answers "Chord changes running": the plan's
  Back would relaunch the last block, which leaves the page and cancels the run. Stop ends the run;
  with no run, it pauses the Free practice timer if that is running. Folding the section cancels a
  run. At any other time the Practice plan row applies.

The order of checks:
1. A help tour takes the action first: Next and Back move through it, Stop closes it.
2. The clef dropdown and any sheet fold away.
3. Settings only shows "Next works", which is a test.
4. The active page decides.
5. If the page has nothing to do, a toast says so.

A big HUD (`#remote-hud`, `role=status`) confirms what happened, so you can read it from the bench.
MIDI isn't a user gesture: if the sound is asleep, a toast asks for one tap on the screen (soundLAB
only: in Gear a step sounds on the synth, so there is nothing to wake).

## Two windows

soundLAB and soundLAB Gear can be open at the same time: the link at the top of each opens the other,
and it can be opened in a second window. Both windows hear the same pedal and both claim it, so a bound
press never reaches the Hub's Thru, the Deck or the Live page as an ordinary message. One app acts:

- **The pedal belongs to soundLAB while a soundLAB window is visible**, focused or not. It keeps
  answering while another program (FL Studio) has the focus. Two soundLAB windows both act, as before.
- **Gear answers when no soundLAB window is visible**: soundLAB is minimised, on a hidden tab or closed.
  While a soundLAB window is visible, Gear shows nothing for a bound press: no HUD, no toast, no step.
  Two Gear windows that are both on screen both act, as two soundLAB windows do (one on Live sets
  steps the set; one on the Hub says "Nothing to move on here").
- **Live sets have their own foot switch** (*Foot switch › Learn* on the Live page, stored as
  `synthtab.fsCC`). The remote does not touch it. To step Live sets while soundLAB is visible, give that
  foot switch a CC that is not bound to the remote. A CC that is bound to the remote cannot be learned
  there.
- **Keys** (a page-turner pedal, a learned key) go to the window that has the keyboard focus, as any
  key does.

How it works: soundLAB holds a Web Lock (`soundlab-remote-main`, shared) while its document is visible
and lets it go when hidden. For each MIDI press Gear asks the browser whether that lock is held
(`navigator.locks.query()`) and acts only when it is not, so in Gear a MIDI press acts a moment after
the message. Gear never takes the lock itself: an earlier version did, for an instant per press, and
two Gear windows then shut each other out (the press acted in one of them, at random). Nothing is
stored. Where the browser has no Web Locks, or cannot be asked, Gear acts on a MIDI press only while
its window has the focus; soundLAB is unchanged. A binding changed in soundLAB works in an open Gear
window at once on the keyboard Gear
listens to (or with *All keyboards*); a pedal on a port Gear has not opened is picked up when Gear next
refreshes its ports (reload, reconnect, a device plugged in).

**Not checked on real hardware.** The suites use fake MIDI ports and set each page's visibility
themselves. To check on the owner's Windows PC with the LUMI and the MODX:

- Gear in a second window keeps receiving and sending MIDI while soundLAB is open.
- With both windows visible, one pedal press moves the lesson on and the MODX Performance does not
  change.
- With soundLAB minimised, the same pedal steps the Live set.
- A MODX heard through Hear input sounds once, not twice, and keeps sounding when the window that
  played it is closed (the other window takes over; see [PRACTICE-INPUTS.md](PRACTICE-INPUTS.md)).

## Store and API

- **Store keys:**
  - `remote.map`: `{next|back|stop: {midi: {t, n, ch, port, latch}|null, key: {code, key}|null}}`
  - `remote.pt`: the page-turner keys
  - `remote.dbl`: the double-tap key
  - All three live in the 2.0 store, under its prefix: `soundlab2.remote.map` and so on
    (`soundlab2-next.remote.map` on the beta under `/next/`). Both apps read them there.
  - All three are included in Settings › Backup. A 2.0 backup file holds them under that prefix
    (`"soundlab2.remote.map"`); an import puts them into the store of the app that reads the file,
    whether the file came from the live address, the beta or an older build.
  - Bindings learned in the beta before the 2.0 prefix existed were stored under `guitarlab.*`. They
    are copied across once with the rest of that data, at the first start; the `guitarlab.*`
    originals are left as they are.
- **API:** `App.remote` exposes `learn`, `cancelLearn`, `clear`, `setLatch`, `setPageTurner`,
  `setDoubleTap`, `map`, `summary`, `bindingText`, `fire(action, via)`, `mount`, `paint` and
  `holdsMain` (this document holds the shared lock: a visible soundLAB window; always false in Gear).
  In Gear, `fire` with a MIDI `via` (`cc`, `pc`, `note`, `dbltap`) returns `null` and acts a task
  later; `key`, `test` and no `via` stay synchronous. `mount` (the Settings card) is only called in
  soundLAB.
- **Routing:** `App.remoteAction(action, info)` and `App.remoteKeyPage()` live in app.js.
- **Bus events:** `'remote'` `{action, via, handled}`, `'remote:map'` and `'midi:remote'`.
- **Tests:** `tests/remote.test.js` covers the core: Learn, claiming, press edges, ports, page turner,
  double-tap, routing, the Android bridge, and the two rules soundLAB keeps (a bound CC fires without
  the focus; `holdsMain` follows visibility). `tests/remote-*.test.js` covers each page;
  `tests/remote-gear.test.js` runs on `gear.html` (Live sets, the Deck) and holds the two-window cases.
