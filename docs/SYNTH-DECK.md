# Synth Deck — control your synth from soundLAB (1.2.0)

The **Synth Deck** is the Control view of the MIDI Hub (*Keys › MIDI*). It turns the Hub into a
control surface for whatever synth is on the cable — built around the owner's Yamaha MODX8+ but
device-agnostic: every number it sends lives in an editable, MIDI-learnable **Map**, and a generic
synth gets the same deck with standard controllers only.

Files: `js/synthdeck.js` (the deck), `js/synthdeck-scope.js` (the Scope), `js/synthdeck-maps.js`
(default maps = pure data), `data/modx-performances.json` (2,143 MODX factory Performance names),
`docs/MODX-MIDI-REFERENCE.md` (the research the maps come from, with sources and confidence).
Suites: `tests/synthdeck.test.js`, `tests/synthdeck-scope.test.js`. The Hub (`js/midihub.js`) mounts the
deck into `#mh-deck` / `#mh-deck2` at the end of `render()` and hands it `HUB_API` (also
`window.SLMidiHub.api`); the deck is `App.synthDeck` / `window.SLSynthDeck`.

## What you see

- **Now bar** — the sound the synth is on (library name → your program names → the MODX factory name
  → "Program 12 · Bank 63/0"), the Part, the bank/program and the port it goes to. *Prev* / *Next*
  step programs, ★ pins the sound, **Save sound** keeps the program plus the knobs and buttons as they
  are. Pinned sounds sit in a strip under it on every tab: one tap loads.
- **Knobs** — the Hub's big knobs (Super Knob, filter, envelope, effects, volume/pan, Assign 1–8 on a
  MODX) plus **pages** of extra knobs (Expression: mod, breath, foot, portamento time, expression,
  decay, ribbon; Master: master volume and the Super Knob over SysEx). Drag, scroll when focused,
  arrows, double-tap resets; the synth's own knobs move them too.
- **Buttons** — Scenes 1–8 (CC 92 value bands), Arpeggiator master and *Arp on this Part*, Motion
  Sequencer master / hold / trigger, Part mute and Keyboard control, sustain / sostenuto / soft /
  portamento, Assign switches 1–2, All notes off, Reset controllers. Toggles, momentaries (held while
  pressed, always released on blur / hide / Part change), radios, triggers. A **?** badge means the
  number came from documentation and was not checked on your synth; a control with no number yet
  shows *Set in Map* instead of sending.
- **Sounds** — your library: tiles you tap to load, search, All / ★ / This Part filters, sort, an
  inline save/edit card (This Part / All Parts / Program only, include program / knobs / buttons),
  star, duplicate, two-step delete, export/import JSON, settle and gap timing, and a **bank browser**
  with the synth's banks by name (*Into this Part* = MSB 63, *Whole performance* = MSB 64 on a MODX),
  *Name it* and *Add to library*. On a MODX, **Read name from synth** asks the synth for the current
  Performance name over SysEx.
- **Scope** — a canvas that draws what the synth transmits against the beat grid: notes per channel
  (the arpeggiator's ladder, the sequencer's parts), up to four CC lanes (Super Knob, Assign 1, mod,
  cutoff by default — a Motion Sequencer driving the Super Knob shows as its waveform), transport
  marks, and the clock: `Clock: synth 120.0 BPM` when the synth sends MIDI clock, else the Hub's clock
  out, else the app tempo. Window 1/2/4/8 bars, freeze, show what I send, add/remove lanes.
- **Map** — one table of every control: name, kind (CC / Program / SysEx), channel scope (Part /
  Global / fixed), number or address, on/off/default values, confidence, **Learn** (the next message
  from the synth fills it), **Learn 2 moves** (two SysEx frames → the differing byte becomes on/off),
  Default, Reset map. Global channel and Learn-from port live here too.

## Safety

Nothing is sent on load, show, tab switch, Part change, profile change, Import, Reset, Learn, save,
star or delete. Every deck message goes through one funnel: the Hub's `send()` (so Rules-on-app-controls,
echo suppression and the ledger apply) after a check that the resolved output is not LUMI-named — the
key lights never receive synth messages, even when *Same as key lights* is chosen (the Hub's own knobs
deliberately allow that; the deck is stricter). The screen only changes for messages actually sent.
Loading a sound sends Bank MSB, LSB and Program Change back to back, waits the settle time (default
250 ms, editable), then the knob and button values one per gap (default 2 ms), cancellable at any
point (new load, Stop, leaving the page, hiding the app, port change, a failed send).

## Store

`midihub.deck` (settings + map overrides per profile: patches over the defaults, custom controls,
pages), `midihub.decklib` (the library, cap 200), `midihub.deckvals` (switch states per Part + the
last bank/program the synth reported), `midihub.names` (program names you typed). All versioned and
migrated on read; writes debounced. The Hub's Export/Import include them; **Reset Hub keeps the library
and your names** — the deck's own two-step *Delete all sounds* removes them.

## What the synth must have switched on (MODX / MONTAGE)

Check on the synth — these are from documentation, not yet confirmed on the owner's unit:

- *Utility › Settings › MIDI I/O › Arp MIDI Out = On* for the Scope to see arpeggio notes (it also makes
  incoming MIDI bypass the arpeggiator). *Clock Out = On* and *MIDI Sync = Internal* for the beat grid.
  *Local Control = Off* avoids doubled notes when the Hub's Thru is on.
- *Utility › Settings › Advanced › MIDI I/O Mode = Multi*: Part n listens on channel n (the deck's
  Part buttons). Scene CC (92) and Super Knob CC (95) numbers are on the MIDI I/O screen; Assign knob
  and switch numbers are per Performance (*Edit › Common › Control › Control Number*).
- The Motion Sequencer itself transmits nothing — only the knob it drives, when that knob's CC is set.
  A Performance change made on the panel sends no Program Change: use *Read name from synth*.
- Bank Select: MSB 63 + LSB + PC loads one Performance's Part 1 into the Part on that channel (a sound
  per Part); MSB 64 loads the whole Performance (send on channel 1). LSB 0–17 = Preset pages, 32–36 =
  User, 40+ = Library; MSB 62 = Live Set slots.

## Where it runs

Laptop: Chrome / Edge (Web MIDI) or the soundLAB desktop app. Android app: one shared output — pick
the synth in Settings › MIDI. iPad: Safari has no Web MIDI; open soundLAB in the *Web MIDI Browser*
app with the synth on a USB adapter, or use the deck offline (library, map, tips) until then.

## Hardware gate (not yet run)

With the MODX connected: confirm Scene CC 92 bands, Assign switch CC 86/87, the SysEx addresses for
Arp master (30 47 03), Motion Seq master (30 48 00), Part mute (31 0p 18), Keyboard control (31 0p 17)
and the unverified *Arp on this Part* (31 6p 00); confirm the settle time after a Performance load;
confirm *Read name from synth* (bulk request 0E 25 00, name at 30 40 00); confirm MSB 63 vs 64
behaviour. Anything wrong: Learn it in the Map and note it in `docs/MODX-MIDI-REFERENCE.md`.
