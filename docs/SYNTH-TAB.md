# Synth tab — Deck, Live, Hub (1.3)

The Synth tab is soundLAB's control station for the synth on the cable (built around Matt's Yamaha
MODX8+, device-agnostic by design). Three pills:

- **Deck** (`js/synthtab.js`) — the play face over the Synth Deck (`js/synthdeck.js`): the sound
  you are on, your Live set page, strips, buttons, Scenes; **Edit** folds out everything the deck has
  (knob pages, every button, your Sounds with the bank browser and *Read name from synth*, the Scope,
  the Map with Learn).
- **Live** (`js/synthlive.js`) — Live sets in pages of 16, stepping, *Go live*, profiles.
- **Hub** (`js/midihub.js`) — the MIDI Hub as it is: Player, Keys, CCs, Rules (with key splits),
  SysEx, Monitor, Learn.

Plan and decisions: `docs/SYNTH-TAB-PLAN.md`; the 1.3 checklist: `docs/RELEASE-1.3-CHECKLIST.md`;
the design boards Matt chose from: the "Synth Deck design options" artifact (option A, strips).

## Deck

- **Now bar**: name (your library → your typed name → the MODX factory name → "Program n"), Part,
  bank/program, port. *Prev* / *Next* step programs; **Save preset** opens the builder.
- **Strips, not knobs** — every continuous control is a horizontal slider 44 px tall: tap or drag
  anywhere along it, drag up or down away from it for fine steps (a quarter of the travel), one CC
  per animation frame on the Part's channel. The **Super Knob** is one full-width strip (CC 95).
- **Row picker** under it mirrors the MODX's knob-function button: *Favourites* (yours; defaults
  Cutoff, Reverb, Attack, Assign knob 1 — "Choose these four"), *Tone* (Cutoff, Resonance, Attack,
  Release), *Effects* (Reverb, Chorus, Volume, Pan), *Assign 1-4*, *Assign 5-8*, *Expression* (Mod,
  Breath, Expression, Portamento time). **Assign knob n** = the Assignable Knobs (CC 17-24), named by
  what the Performance wired them to when the synth says so: *Read name from synth* keeps the eight
  display names from the Performance dump (block `30 50 00`, 16 characters each, "Assigned" =
  blank). "Assign 1 / 2" are the two Assignable *switches* by the Super Knob (CC 86 / 87) — chips.
- **Chips**: Arp (SysEx 30 47 03), Motion seq (30 48 00), **Split** (shows the split point, toggles
  the split, or opens the builder), Assign 1 / 2, Sustain; **Scenes 1-8** (CC 92 bands).
- **Explain** (the ? button): a caption under every control naming the MODX panel control it mirrors
  and what it sends — one wording shared with the Deck tour. Off = a clean performance screen.
- The grid under the Now bar is the active **Live set page** (one tap loads a slot, *Go live* jumps
  to the stage page); without a set it shows your pinned sounds.
- Every send goes through the deck's funnel (`App.synthDeck.perform.*` → `sendCtl` / the Hub's
  `turn()`), so the LUMI guard, Rules-on-app-controls and the musical ledger apply. Nothing is sent
  on show, on a tab switch or on a profile switch.

### Connecting (1.3.1)

The Deck and Live pages show a panel until the synth is reachable, and dim their controls:

| State | What it says | What it offers |
|---|---|---|
| No Web MIDI | This browser can’t reach MIDI devices; on iPad/iPhone it names MIDIWeb Browser and Web MIDI Browser | nothing to press |
| Never connected | Connect your synth | **Connect** (the one browser prompt) |
| Waiting | Allow MIDI devices in the browser’s prompt | — |
| Blocked | MIDI is blocked for this site; allow it in the site settings | **Try again** |
| No output | Plug the synth in by USB; or choose where to send | an output picker when ports exist |
| LUMI as output | The LUMI never gets synth messages | an output picker |

On show the page reconnects without a prompt when MIDI was switched on before or the browser
already allows it. A tap on a dimmed control shakes the panel instead of silently doing nothing.

The chips, Scenes and slots update in place and the page repaints only for controllers, program
changes and SysEx replies. A MODX with MIDI clock out sends about 36 clock ticks a second; until
1.3.1 each one rebuilt the buttons, so a finger often lifted off a different element and the tap was
lost (found on the MODX8+ on 2026-10-26).

On the **Android / iOS** app MIDI has ONE output, shared with the key lights: picking the synth in the
panel moves that output (`App.midi.setOutput`, as Settings › MIDI does) and, if the key lights would
paint a non-LUMI output, sets the LED mode off — lights are note-ons and would play on the synth.

A refused send (the deck's funnel, `txCheck`) toasts where the player is — `App.toast` on the Deck /
Live pages, the Hub's own `#mh-toast` on the Hub page — with the reason (`connState()` in
`js/synthdeck.js`), emits `synth:conn {refused}` and nudges the panel. A Live slot is marked loaded only
when its program could go out (`perform.check()`).

## Presets (the builder)

*Save preset* opens a sheet: name, tags, colour, and what the preset remembers — **Sound**
(bank/program, Part), **Knobs**, **Buttons & Scene**, **Key & scale** (the context bar's key / scale
/ mode; the LUMI layout follows), **Split**. *Capture now* re-reads the synth and the app. A preset is
a deck library item with `snap {colour, app, fav, split}` beside its `prog` / `parts`; loading one
sends the synth side in the deck's safe order (bank/program → settle → knob values → Scene and
switches), then restores the app's key and the Deck's favourite strips, then the split (`{off: true}`
switches a split off). Slots show their data: colour bar, bank/program, Scene, key, split.

## Key splits (Hub › Rules)

A split is a Rule tagged `split` with a **port match**: "notes below C4 on the LUMI → Part 2" (a
second point makes a middle zone). Only note on/off is re-channeled; the hold pedal is copied to every
zone's Part; the MODX's own keys are untouched because the rule matches the LUMI port only (the match
is empty when no LUMI is listed, so any keyboard splits). `SLMidiHub.split {get, set, enable, text}`;
the Rules view has a Split row (point, Part, *Two zones*, *Learn: play the split key*, *Split off*)
and every rule has a *port* field. The MODX side: Multi mode (Part n = channel n), Keyboard Control
off for the split Parts so the synth's own keys do not double them. Thru never forwards to a
LUMI-named output.

## Live

- A **set** is pages of 16 slots (4 × 4). *Edit slots* → tap a slot → pick a preset, a **MODX Live Set
  slot** (page + slot: Bank MSB 62 / LSB page / Program slot on the Part channel) or clear it. Pages
  are added as needed (16 at most).
- Tap a filled slot to load it. **Next / Prev** step through filled slots across pages and wrap.
- **Foot switch**: *Learn* once (the next CC pressed), then every press steps (release does nothing;
  150 ms debounce). Option: a LUMI's octave buttons step the set (down = previous, up = next).
- **Go live**: the top bar, tabs and footer fold away, the screen stays on (`App.wake`), NOW and
  NEXT in big type, the grid, *Prev* / *Next*, **Panic** (all notes off + sustain off on all 16
  channels), **Lock** (every slot becomes a 400 ms press-and-hold). *Exit* or Back restores everything.
- **Profiles**: a profile is a whole setup — the deck library and names, Live sets, favourite strips,
  foot switch, options. *New* (empty), *Duplicate* (a copy of this setup), *Rename*, *Delete*,
  *Export* (a `soundlab-profile-<name>.json` file), *Import*. Switching saves the active profile first.
  The device map (Hub › Map) is shared, not per profile.

## Live-performance requirements (docs/UI-LOGIC-SWEEP-1.3.md §5)

Nothing sent by accident (Lock), one tap = one sound with cancel (the deck's load job), Next/Prev
from the floor, Panic in reach, screen stays on, ports come back without a reload (the Hub's
statechange path), offline (PWA + localStorage; export as the backup), readable from a metre, < 50 ms
+ settle, nothing surprising on load.

## Store

`synthtab.mode | explain | row | fav | live | fsCC | octStep | profiles | profile`,
`midihub.assignnames`, the deck's `midihub.deck / decklib / deckvals / names`, the Hub's
`midihub.split` and the split rules inside `midihub.rules`.

## Tests

`tests/synthtab.test.js` (fake MODX + LUMI, every byte per port): pills and silence on open; strips
(tap / drag / fine / coalesced / Hub twin); rows and Assign names from a dump; the builder, snapshot
and slot badges; splits (rule + port, chip, bytes per zone, pedal copy, presets, the LUMI thru guard);
Live sets (slots, MODX slot bytes, stepping, foot switch, Go live / lock / panic / exit, the Deck
grid); profiles; the phone and iPad layouts. The LUMI bucket must stay empty throughout.
`tests/synthconn.test.js`: refusals out loud next to the 1.3.1 panel (`tests/synthconnect.test.js`): the toast on the Deck / Live (the Hub keeps its own), the nudge, a refused strip drag speaking once, the Live slot that stays put, the Android one-output pick with the key lights off, and the same press sending after the fix.