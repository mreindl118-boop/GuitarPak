# UI logic sweep for 1.3 — every place the app says one thing twice (2026-10-25)

Asked by Matt: "a full sweep logic pass for avoiding redundancies — learn and practice should be
grouped together in some way, etc." This extends the UI primer (docs/PRIMER-UI-AND-SCORE-2026-10-25.md)
with the whole app in one table. Each row: what is doubled, where, the proposal, and who does it in
1.3 (phase A/B = the UI session; Synth = this branch; "decide" = Matt's call). Page ids never change.

## 1. Tabs and pills (the navigation itself)

| Doubled | Where today | Proposal | 1.3 |
|---|---|---|---|
| "Learn" vs "Practice": the Learn tab holds Exercises (drills you answer by playing), Chords, Circle, Plan; the Practice tab holds Woodshed (graded practice), Trainer (prompts), Tuner. Exercises and Woodshed are both "practice you are scored on"; Plan schedules both. | GROUPS gtheory / gprac | Keep two tabs but make the split *by kind, not by name*: **Learn** = understand (Exercises, Chords, Circle); **Train** = do it to the clock and get scored (Woodshed, Trainer, **Plan**). Plan moves from Learn to Train: it launches training blocks. Tuner is a tool, not training: it goes to the Session panel's instrument chip (one tap from anywhere) and leaves the tab. Result: Train = Woodshed / Trainer / Plan. | decide, then phase A |
| Keys › **Synth** pill vs the new **Synth** tab | piano.js registers 'synth' (the Keys page with a synth voice) | Rename the pill **Voice** (it is the Keys page with a different sound) or fold it into the Keys page's Voice picker (primer B3 keeps Voice visible). Two things called Synth cannot ship. | Synth branch (SUB_LABELS) + phase B3 |
| **Chords** under Learn vs the Guitar tab | chords.js = chord explorer with a neck | Stays under Learn (it is theory with a neck), but its neck follows the Guitar tab's tuning/colors — no change, just no second copy of the neck controls. | none |
| **LUMI** pill under Keys vs Lights & help vs the clef's LUMI Display chip | lumi-practice.js page; lights.js sheet; app.js #cx-led | The page is a practice mode (keep, as "LUMI" under Keys). The *settings* (lights on/off, LUMI Display, colors) live once in the Session panel (primer B1); the page shows a status line and a link, not its own copies. | phase B1 |
| **Pads** under Keys vs the Studio's drum track | pads.js; studio.js tracks | One page: Pads stays under Keys and *is* the Studio's drum input (it already records to st.tracks). Remove the Studio editor's duplicate pad strip if one grows; today none. | none |
| **Play** tab (Songs, Jam) vs the Hub's **Player** vs the Woodshed's MIDI import | four file inputs, four outcomes (primer finding 6) | **One Open** (primer C2): one "Open a score" under Play that routes to Play on synth / Practice / Tab. Songs keeps its page; the Player stays inside Hub as the synth destination. | Synth branch (C2) |
| **Jam** vs the Studio (song mode, loops) | jam.js; daw/engine.js | Different jobs (auto-band vs recording). Keep both; but Jam's genre song could become a Studio song with one button ("Send to Studio") instead of a second arrangement UI. | later |
| Hub views **Play** next to **Player**, **Control** next to **Controls** | midihub.js #mh-views | Rename Play → **Keys**, Controls → **CCs**, Control is the Deck (lives in the Synth tab now). | Synth branch |
| **Practice plan** under Learn vs the Woodshed's "Practice progress" card vs Exercises' Progress tab | practiceplan.js, woodshed.js, quiz.js | Progress is read in two places and written in one ledger (practice-progress.js). Keep one Progress view (Exercises › Progress) and link to it from the Woodshed card (one line, no second chart). | phase A3 |

## 2. Settings that live in two places

| Doubled | Where today | Proposal | 1.3 |
|---|---|---|---|
| **Help level** | Keys page #pn-assist, Lights & help sheet, help.js tours, Practice plan | One control in the Session panel; Keys shows the current level as a chip that opens the panel. | phase B1 |
| **Color notes by (Interval / Note)** | clef dropdown chip, Lights & help sheet, Fretboard settings | One control in the Session panel; the Fretboard editor edits the palette only. | phase B1 |
| **Instrument** | Exercises home card, Progress tab select, Woodshed card | One app-level instrument chip in the Session panel (`learn.instrument`, `instrument` bus event). | phase B2 |
| **Key / scale / mode / BPM / time** | clef dropdown (the one home) — and BPM again in the Metronome sheet, Jam, the Woodshed's run bar, the Hub's clock | They all read met.bpm (one store), so this is display, not state. Rule: a page may *show* the tempo, never a second editor; the Metronome sheet's BPM editor becomes the panel's. Jam keeps its tempo *offset* control only if it is one. | phase B1 (audit) |
| **MIDI ports** | Settings › MIDI, the Hub header (In / Synth out), Lights & help (key-light output), LUMI page (three roles) | Three *different* outputs are legitimate (app sound, synth, lights). Make it one **Ports** card (in Settings) listing the three roles with the same names everywhere; the Hub and the Deck show the synth out as a read-only chip that opens that card. | Synth branch (Deck chip) + settings |
| **App voice on/off while a synth plays** | Settings › MIDI keyboard switch, Hub "App voice" checkbox | One switch (Settings); the Hub/Deck show its state. | Synth branch |
| **Metronome** | the corner sheet; the clef's transport button; Jam/Studio transports | Transport exclusivity already exists. Keep the header transport; the sheet's settings join the Session panel (B1). | phase B1 |
| **Theme / accent** | Settings only | fine | none |

## 3. Words that mean two things

| Word | Meanings today | Proposal | 1.3 |
|---|---|---|---|
| Practice | the space, the tab, Practice plan, LUMI practice, Practice progress | Space = Practice; tab = Train; "Plan"; "LUMI"; "Progress". | phase A1 |
| Synth | Keys › Synth pill, the new Synth tab, "synth out", DAW synth presets | Tab = Synth; pill → Voice; "synth out" → "Synth" port role; Studio keeps "synth presets" (its own space). | Synth branch + A1 |
| Control / Controls | Hub views | Deck / CCs (above). | Synth branch |
| Play / Player | Play tab, Hub Play view, Hub Player, Woodshed "Play at tempo" | Play tab stays; Hub Play → Keys; Player stays (it is a player); Woodshed modes keep their names. | Synth branch |
| Exercises / Learn | the Learn tab's home is "Exercises" | Home reads **Learn**; the course inside keeps "exercises" as the thing you do. | phase A1 |
| Lights / LUMI Display / LED scale | three names for keyboard lighting | One section "Keyboard lights" in the Session panel with On/Off, Display aid, Scale always; the clef chips go. | phase B1 |

## 4. What stays deliberately doubled

- The on-screen keyboard (Keys) and the LUMI show the same thing: by design (screen + hardware).
- Songs (tab) and the Hub Player (synth) both play MIDI: different outputs; One Open routes to them.
- Studio has its own file inputs (samples): a different domain.

## 5. Live-performance readiness for the Deck (Matt: "good enough to be live performance ready")

Hard requirements for the Synth tab, each with a test:
1. **Nothing sent by accident**: a Lock button on Live (and Perform) that turns every control into
   press-and-hold (400 ms) except Next/Prev; knobs never move from a page scroll.
2. **One tap = one sound**: a Live slot sends bank/program, waits the settle, then values; a second
   tap during the load cancels and starts the new one (the deck's cancelLoad already does this).
3. **Next/Prev from the floor**: foot switch CC (FS Assign, learned once) steps the Live set; the
   LUMI's octave buttons as an option; both debounced (150 ms).
4. **Panic in reach**: All notes off + sustain off on all 16 channels, one big button, always visible
   on Live, never behind a confirm.
5. **Screen stays on**: keep-awake while Live is open (App.wake with its own tag).
6. **Ports come back**: a synth that reconnects mid-set is re-bound without a page reload (the Hub's
   onstatechange path), the Now bar says "MODX-1 reconnected", nothing is re-sent on its own.
7. **Offline**: the Synth tab and its presets work with no network (the PWA cache; presets in
   localStorage, export/import JSON as the backup).
8. **Readable from a metre away**: Now name ≥ 34 px, slot labels ≥ 14 px, contrast ≥ 4.5:1, dark
   theme; the Go live page hides the top bar.
9. **Latency**: a slot change reaches the synth in < 50 ms + settle; knob drags send at most one CC
   per 10 ms (coalesced), no audible stepping.
10. **Nothing surprising on load**: opening the tab sends nothing (the deck's rule); the first
    thing sent is the thing you tapped.

These go into docs/SYNTH-TAB-PLAN.md's acceptance and tests/synthtab.test.js.
