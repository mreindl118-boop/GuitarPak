# MIDI guitar (js/midiguitar.js)

For a guitar that sends each string on its own MIDI channel. Built for the
Rock Band 3 Squier Stratocaster (5-pin MIDI OUT, 3 x AA batteries), wired
into an interface's MIDI IN (the owner's Steinberg UR24C).

## What it does

- **Settings > MIDI guitar** (`#set-guitar-card`): pick the input port the
  guitar comes in on (`mg.port`, port name; empty = no guitar), how long a
  plucked note rings (`mg.ring` seconds, 0 = until the fretting changes),
  **Set up** (pluck the open low E once) and "Strings are upside down".
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
