# MIDI guitar (js/midiguitar.js)

For a guitar that sends each string on its own MIDI channel. Built for the
Rock Band 3 Squier Stratocaster (5-pin MIDI OUT, 3 x AA batteries), wired
into an interface's MIDI IN (the owner's Steinberg UR24C).

## What it does

- **Found by itself**: no setup screen. With no guitar chosen, one strum
  (notes on 3+ of channels 1-6 within 1.5 s, from a port that is not a
  LUMI / ROLI / self-sounding synth and plays nothing above channel 6)
  picks that port (`mg.port`) and toasts "MIDI guitar found". Picking "No
  MIDI guitar" by hand sets `mg.auto` false and stops the search.
- **String order by itself**: with the octave buttons in the middle, a note
  on channel 1 or 6 tells which end is the high E (64+ vs 62-), until a
  pluck or the box pins it (`mg.set` 'pluck').
- Lives INSIDE Settings > MIDI keyboard (`#set-guitar`, a "MIDI guitar"
  sub-section), not its own card: one status line (last string/fret),
  **Fix strings** (pluck the open low E once) and a folded "Guitar options"
  (port, ring time `mg.ring`, "Strings are upside down"). The Found chip
  says "MIDI guitar" for that port.
- **String and fret**: `guitar:note` {on, string 1-6 (1 = high E), fret,
  valid, midi, vel, chan, portId}. `App.midiGuitar.held` = string -> {fret,
  midi}. The fretboard lights the one ring on that string/fret
  (`data-gs` / `data-f` on `.fb-jam-ring`) instead of every place the pitch
  lives.
- **Mono strings** (midi.js ingress, `guitarSrc`): on the chosen port,
  channels 1-6 hold one note each. A new Note On first releases what that
  string held. The Squier sends Note Off only when the fretting changes, so
  a re-strum of the same fret is a second Note On; without this, Exercises
  (which ignores a Note On for a pitch it thinks is still held) would miss
  it. A note still held after `mg.ring` seconds releases itself; its late
  real Note Off is dropped.
- Every other page keeps hearing plain `midi:note`: Exercises answers by
  playing, the Woodshed grades, Jam reads 3+ held notes as a chord.

## Set up math

`mg.layout` 'hi1' (default, the guitar-synth custom: channel 1 = high E) or
'lo1'. `mg.oct` = the guitar's octave buttons (Yellow / Blue). Set up reads
one open low-E pluck: channel 6 -> hi1, channel 1 -> lo1; oct =
round((note - 40) / 12). Fret = note - (open pitch of that string + 12 x oct).

## Not verified on hardware yet

Channel order (which end is channel 1) and the open-string note numbers of
the real Squier: Set up learns both, so either answer works. Button facts
(Start = synth mode, Start + Back = panic, Yellow/Blue octave, Green/Red
program change, Back + Yellow pitch bend, Back + Blue expression) are from
the community wiki at dtm.noyu.me, citing the owner's manual pp. 6-8.

Suite: `tests/midiguitar.test.js` (real midi.js + midiguitar.js in a VM,
fake UR24C port).
