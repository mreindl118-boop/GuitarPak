# Helix deck — the Synth Deck model on the Helix Stadium page

*Guitar › Helix* is now a **Perform** face over the technical page it used to be. It copies what
works on the MODX Synth Deck (a Now bar, big buttons, pinned favourites as tiles, strips instead of
knobs, a row picker, chips, Explain captions, page-owned sheets instead of browser dialogs) and
changes what the Helix needs differently:

| | MODX Synth Deck | Helix deck |
|---|---|---|
| A saved sound | a value dump re-sent after a program change | a **pointer** to a preset on the pedal (setlist/bank CC32 + program PC + snapshot CC69, or the editor id); the pedal keeps the values |
| Read-back | none (the MODX transmits nothing) | real: the editor protocol returns the edit buffer, the active preset and snapshot |
| Values on screen | what we last sent | **provenance**: grey = what we sent, amber = the pedal's MIDI echo (not proof), green = read from the editor or its change stream |
| Destructive actions | none | Load (discards unsaved pedal edits), Save, safe mode off — behind the arm window **and** an in-page confirm sheet |
| Hero control | Super Knob | your choice, default EXP 1 |

Files: `js/helix-map.js` (pure data: every control with its CC or address, channel, confidence,
minimum firmware and one Explain sentence; the help tour is built from the same sentences),
`js/helix-routes.js` (`App.helix`: the routes, the arm gate, the operations table with exact bytes
and timing, the value store with provenance, favourites, the ledger — no DOM), `js/helix.js` (the
page shell and the Edit views), `js/helix-deck.js` (the Perform face and sheets, prefix `hxd-`).
Spec: [HELIX-DECK-SPEC.md](HELIX-DECK-SPEC.md). Suites: `tests/helix.test.js`,
`tests/helix-deck.test.js`.

## What you see

- **Routes** (top right): three badges — MIDI, net, USB — each absent / available / needs setup /
  connecting / online. Tap one to connect; nothing connects by itself.
- **Now**: the preset the pedal is on (its name when the bridge is up, else your pin's name, else
  the slot such as *User 35B*), the snapshot, the firmware and which routes are live. Arm / Disarm,
  Prev / Next preset, Pin (saves a pointer, sends nothing), Save (the pedal's own save; bridge only).
- **Snapshots 1–8** with their names, the active one coloured by how we know it.
- **Pins**: your favourites as tiles; tap to recall (bank, program, then the snapshot, 300 ms apart
  so the pedal honours it), tap again to cancel, long-press to edit. Up to 48.
- **Strips**: a hero strip and a row of four — Knobs 1–4, Knobs 5–8 (whatever the Helix screen shows
  under them), Pedals (EXP 1, EXP 2, the XY pad, the toe switch), Stomps (your own Bypass/Control
  CCs on the control channel), Block (the open block's first parameters, bridge only), Mixer
  (firmware 1.4). Tap or drag anywhere on a strip; drag off it for fine steps; arrows, Home, End;
  double-tap resets.
- **Chips**: tuner, toe, tap tempo (and tap the app tempo), click, mute all, the looper. Momentary
  chips flash; they never pretend to be "on". A **?** marks a number from documentation that your
  pedal has not confirmed; a greyed chip names the firmware it needs.
- **Explain** (the ? button) writes one line under every region saying exactly what it sends and
  over which route.
- **Edit**: the six technical views as before — Rig, Blocks, Presets, Looper & Song, Mixer, Monitor.

## Safety (unchanged from the page's first release, built with null)

Output starts **disarmed** on every visit; Arm opens a 90 s window that every command renews; it
closes on leaving the page, hiding the app, a lost window focus, a changed destination or bridge
drop, a changed Global channel, any failed send, or switching safe mode on. Reads never need arming.
Only ports named Helix or Stadium are ever written to — never a MODX, LUMI, ROLI, virtual or
loopback port. Refused controls snap back and say so. Nothing is sent on load, on show, on a mode
or row change, when you pin, edit or remove a favourite, or when you toggle Explain.

## USB like the desktop app

On firmware 1.4 the Stadium's "USB editing" is a network link over the USB cable (a CDC-NCM
interface): the same editor services the bridge already speaks over Wi-Fi become reachable at the
pedal's USB address. So the plan is not a USB driver or WebUSB — it is the bridge finding the pedal
over that link (mDNS `p35x1.local` or the link's IPv6 address). Prerequisites, all Matt's calls:
update the pedal to 1.4.x with the Line 6 app, plug it into the laptop, and check that Windows binds
its in-box UsbNcm driver (a new network adapter appears). Until then the USB badge reads *needs
setup* with that explanation, and MIDI + Wi-Fi cover everything the page does today.

## Not in this phase

The signal-chain strip with block bypass dots and per-block parameter strips (phase 2), the Go-live
stage layout with Lock and a 60 px Panic (phase 3), the Matrix mixer row (needs firmware 1.4), the
bridge's USB-link discovery (phase 4), and a unit table for parameters (dB, ms, Hz). Hardware checks
still open: setlist CC32 = 5 + position, a pin recall with a snapshot, the arm flow on strips, and
whether *Send MIDI PC* / *Send Snapshot CC* are on so tiles follow the footswitches.
