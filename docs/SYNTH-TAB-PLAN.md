# Synth tab — plan (agreed with Matt, 2026-10-25)

The Synth Deck (today the Control view inside Keys › MIDI, `js/synthdeck.js`, docs/SYNTH-DECK.md)
becomes its own top-level **Synth** tab, touch-first, with presets and Live sets. Decisions, in
Matt's words and ours:

| Decision | Choice |
|---|---|
| Placement | A new top-level group **Synth** in the practice tab bar, after Keys. Pills: **Deck** (play), **Live** (setlists), **Hub** (today's MIDI Hub: Player, Play, Controls, Rules, SysEx, Monitor, Learn, plus the deck's Map/Scope under Edit). The MIDI Hub page leaves the Keys group; `midihub` keeps its page id, so every `App.switchTo('midihub')` cross-link and test keeps working. |
| What a preset remembers | A **full snapshot**: the synth sound (bank MSB/LSB/program, the Part), knob and button values (the deck's `kv` + switch states), the Scene (CC 92 band), a **key split** (per key range → MIDI channel = synth Part; the Hub rule set), and soundLAB's own key/scale/mode and LUMI layout (fb.root/scale/mode, lights.* relevant bits). Loading a preset restores all of it, in the deck's safe order (bank/program → settle → values → rules → app state). |
| iPad | Touch-first now; test in the iPad "Web MIDI Browser" app (Safari has no Web MIDI); the native wrapper (`ios/`, CoreMIDI incl. Bluetooth) when a Mac is available. |
| Live set mode | Named sets, **pages of 16 slots (4 × 4)** like the MODX, prev/next page; a slot = a preset; step with a foot switch CC (FS Assign) or the LUMI octave buttons (option); a slot may also recall a MODX Live Set slot (Bank MSB 62 + page + slot) instead of a soundLAB preset. |
| Users | **Profiles**: a named bundle of deck settings + presets + live sets (store namespace `midihub.profile.<id>`), a switcher on the Live pill, export/import JSON per profile (the deck's existing export grows to cover sets). |

## Views

**Deck (Perform face)** — the default. Big, finger-sized, nothing technical:
- Now bar: sound name (library → typed name → MODX factory name → "Program n"), Part, bank/program,
  port; Prev / Next sound; **Save preset** (opens the preset builder with everything captured).
- The current Live set's page: 4 × 4 slot grid, the active slot highlighted, prev/next page.
- **Strips, not knobs** (Matt, 2026-10-25: "the knobs were clunky"): every continuous control on
  the Deck is a horizontal slider strip, 44 px tall, tap or drag anywhere along it, drag away from
  it for fine steps, the value in big type. The Super Knob is one full-width strip; under it four
  strips with a **row picker** that mirrors the MODX's knob-function button: Favourites (yours;
  defaults Cutoff, Reverb, Attack, Assign knob 1) · Tone · Envelope · Effects · Assign 1-4 ·
  Assign 5-8. Naming: "Assign knob n" = the Assignable Knobs (CC 17-24); "Assign 1 / 2" = the two
  Assignable SWITCHES by the Super Knob (CC 86 / 87) and they are chips, not strips.
- **Assign knobs are named by what they control** (Matt): the Performance bulk dump (block
  `30 50 00`, 8 x 16 ASCII fields, "Assigned" when blank on the factory sound captured
  2026-10-24) carries the per-Performance Assign knob display names; the Deck reads them from the
  dump it already requests (Read name from synth) and labels the strips "Assign knob n · <name>",
  falling back to "Assign knob n"; a user name typed in the Map wins. Verify the block offset on
  the MODX before shipping (a knob renamed on the synth must move the label).
- Chips for what matters live: Arp, Motion seq, Split, Assign 1, Assign 2, Sustain; the Scenes as a
  1-8 strip.
- **Didactic** (Matt: "it should help me learn what things can be done with the MODX as I use it"):
  an **Explain** toggle in the Deck header; on, every strip, chip and button shows a one-line
  caption naming the MODX panel control it mirrors, what it does and the message it sends (one
  source of wording, shared with the Deck tour and the Hub's Learn page); "Try this" nudges read
  from the loaded Performance (an arpeggio on Part 2 -> "tap Arp and hold a chord"); long-press a
  control in Explain mode opens its Learn entry. Off = a clean performance screen.
- A **Perform / Edit** toggle. Edit reveals today's deck tabs (Knobs pages, Buttons, Sounds library
  with the bank browser and Read name from synth, Scope, Map). Nothing is lost; it is folded away.
- Touch rules: 44 px minimum targets, no hover-only affordances, knobs by drag with a value readout,
  no page scroll while a knob is held; the top bar auto-hide stays.

**Live** — setlists:
- Set picker (name, duplicate, delete, reorder), pages of 16, slot editor (assign a preset / a MODX
  Live Set slot / empty; name override; colour), **Go live** = full-screen-ish performance page with
  only the grid + Now + the favourite knobs; stepping: on-screen Next, foot switch CC (number from
  the map's `fs` control once Learned), LUMI octave buttons (option, off by default so they keep
  switching hands in lessons).
- Profiles switcher + export/import.

**Hub** — the MIDI Hub as it is (Player, Play, Controls, Rules, SysEx, Monitor, Learn). The deck's
Control view stays mounted there for the tests and the knob card, but the Synth pills are the way in.

## Preset tiles and zones (Matt, 2026-10-25)

- A slot/preset tile carries its data, not just a name: name, colour, the sound (bank/program,
  Part), Scene, split summary ("below C4 -> Part 2"), the four favourite values as mini bars, tags,
  and a "changed since saved" dot when the synth drifted from the snapshot. Compact on the phone
  grid (name + two badges), full on the iPad and in the Sounds library.
- A **zone picker**: a strip of the keyboard (the LUMI's 24 keys highlighted inside the 88) with two
  drag handles, or "Play the lowest key / play the highest key" buttons that capture from MIDI, to
  say which part of the keyboard a preset or a split zone covers. A preset may be a whole-keyboard
  sound or a zone (range -> Part -> sound); layered zones make a split.

## Preset builder

One sheet, opened by Save preset: name, tags, colour; checkboxes for what to include (sound,
knobs, buttons, scene, split, app key/scale, LUMI layout) all on by default; a split editor
(split point by note name or "play the split key", Part per zone, 2-3 zones); "Capture now" re-reads
the current values; Save → the preset lands in the library and, if a Live set page is open, in the
next empty slot. Presets are the deck library items (`midihub.decklib`) extended with `snap`
(scene, split rules, app state); old items stay valid (missing parts are simply not restored).

## Engine work this needs

- `js/synthdeck.js`: a `perform` tab (default), favourite knobs, the preset snapshot (capture /
  restore incl. scene + rules + app state), the slot grid component (shared by Deck and Live).
- `js/midihub.js`: Rules gain a port match (`port` substring) and a **split preset** (notes below a
  split point on the LUMI's port → set channel N; note on/off only); Thru never forwards to a
  LUMI-named output (guard). `applyRules` unchanged in shape.
- `js/app.js`: GROUPS gains `{ id: 'gsynth', label: 'Synth', icon: 'sliders', pages: ['deck',
  'liveset', 'midihub'] }` after Keys; `midihub` leaves `gkeys`; SUB_LABELS for the pills; the
  mobile tab bar fits six groups (check at 360 px).
- New pages `deck` and `liveset` (one new file `js/synthtab.js` registering both; the deck page
  mounts the existing Synth Deck DOM — reparent like `synth` borrows the Keys page — or the deck
  module renders into both hosts); help tours for both.
- Store: `midihub.livesets`, `midihub.profile`, `midihub.profiles`; migrations in `readBlob`.
- iPad: `css/style.css` touch sizes under `(pointer: coarse)`; test with the iPad viewport in
  Playwright (768 × 1024, touch) and on the device in Web MIDI Browser.

## Tests and docs

- `tests/synthtab.test.js`: group/pills and cross-links, Perform ↔ Edit, favourite knobs, preset
  capture/restore order (fake MODX records bytes; settle respected), split preset bytes (fake LUMI
  input → ch 2 below the split, LUMI output receives nothing), Live set paging and stepping (foot
  switch CC, octave-button option), profiles export/import, 768 × 1024 touch layout (no horizontal
  scroll, 44 px targets). Existing `synthdeck`, `synthdeck-scope`, `midihub*`, `nav`, `smoke`
  stay green (nav's group list changes).
- docs/SYNTH-DECK.md gains the tab/Live/preset sections (or a new docs/SYNTH-TAB.md); CLAUDE.md
  GROUPS note and the midihub/synthdeck entries; help.js tours.

## Order of work (each a commit)

1. The Synth group + `deck` / `liveset` pages mounting the existing deck (nothing new yet), nav
   tests green.
2. Perform face: Now bar, favourite knobs, Perform/Edit, touch sizing.
3. Preset snapshot (capture/restore) + builder sheet.
4. Split rules in the Hub (port match, preset) + the split in the snapshot.
5. Live sets: sets, pages, slots, stepping, Go live.
6. Profiles + export/import; iPad pass; docs; tours; release stamps only on Matt's say-so
   (above whatever main has then: APP_VERSION, version.json web, sw CACHE).

Facts to respect (checked on the hardware, docs/MODX-MIDI-REFERENCE.md "Checked on the MODX8+" and
docs/NOTE-PALETTE.md "Checked on a real LUMI Keys Block"): a CC in the same burst as a Program
Change is lost (keep the settle); the MODX transmits nothing for panel edits (read back, do not
Learn); Live Set recall = MSB 62 / LSB page / PC slot on the active bank; the LUMI must never
receive synth messages; every LUMI config frame wipes its lit keys.
