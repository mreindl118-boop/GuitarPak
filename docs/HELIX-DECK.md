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
interface, the pedal shows up as a network adapter): the same editor services the bridge already
speaks over Wi-Fi (TCP 2001 stream, 2002 commands, 2003 telemetry) answer at the pedal's address on
that link. The pedal gives itself an IPv6 ULA on the link — the device is `<prefix>::1`, this
computer gets another address in the same /64 — and still answers mDNS (`p35x1.local`) there.
Nothing about the protocol changes, so there is no USB driver, no WebUSB and no new code path on the
page: **the bridge finds the pedal over the link** (phase 4, `tools/helix-bridge.js`):

- it looks for a USB network adapter (Windows 11's in-box *UsbNcm Host Device*), takes that
  adapter's `fd..` IPv6 address, derives the pedal's `::1` and **probes port 2002** there;
- an answer makes the USB link its **preferred** transport; no adapter or no answer and it **falls
  back to Wi-Fi** (mDNS `_stadiumserver._tcp` / `p35x1.local`, or the manual address);
- its status reports what it found: `transport` = `usb` | `net` | `manual` (the link in use) and
  `transports.usb` = `{present, adapter:{name, description}, local, candidate, reachable}` plus
  `transports.net` = `{host, ip}`; `{op:'transport', want:'usb'|'net'|'auto'}` from the page asks
  it to move, and the page sends its stored wish (`hx.transport`, default `auto`) on every connect.

On the page (`App.helix.routes.usb`, the USB badge): **online** = the bridge is on the link (the Now
sub-line says *via USB* or *via MIDI + USB*; the net badge reads *Wi-Fi idle*); **available** = the
pedal answers on the link but the bridge is on Wi-Fi — **tap the badge** to ask the bridge to move
(a bridge message, never a byte to the pedal; the badge reads *connecting* until the bridge reports
the move); **needs setup** = the bridge is up but found no USB link (the caption names firmware 1.4
and the pedal's firmware when read) or found one the pedal did not answer on (the caption names the
adapter and asks about firmware 1.4 / Remote Access); **absent** = no bridge. A tap in any other
state toggles that honest caption under the badges. `routes.usb.prefer('usb'|'net'|'auto')` stores
the wish; `state().routes.usb` carries `{status, caption, adapter, candidate}` and `state().via` /
`App.helix.dest()` name the routes in use.

**After the 1.4 update, on this laptop** (the pedal was on 1.1.0, which has no USB link; the
Windows binding is unverified on this pedal), in this order:

1. Plug the pedal in. *Device Manager › Network adapters* shows a **UsbNcm / NCM** network adapter
   (if the pedal only appears under *Other devices* or *Sound, video and game controllers*, Windows
   did not bind the NCM driver — see `docs/HELIX-USB.md`).
2. `ipconfig /all` shows an **`fd..` IPv6** address on that adapter (the pedal is the same prefix
   with `::1`).
3. Start the bridge: it logs **`usb: Helix answered`** (else what it tried: no adapter, no `fd..`
   address, or no answer on 2002 — then check *Global Settings › Remote Access* on the pedal).
4. On the Helix page the **USB badge turns green** and the Now sub-line says *via USB*.

`tools/helix-usb-inventory.ps1` runs steps 1–3 read-only in one go (the pedal's USB functions and
their drivers, the adapter, its IPv6 addresses, whether `p35x1.local` resolves, whether `::1`
answers on 2002; `-Json` for a task record). The protocol notes and the driver fallbacks are in
`docs/HELIX-USB.md`; the research behind the plan is summarised in `docs/HELIX-STADIUM.md`.

## Not in this phase

The signal-chain strip with block bypass dots and per-block parameter strips (phase 2), the Go-live
stage layout with Lock and a 60 px Panic (phase 3), the Matrix mixer row (needs firmware 1.4), a
transport picker in the Edit face's bridge strip (today: `App.helix.routes.usb.prefer`), and a unit
table for parameters (dB, ms, Hz). Hardware checks still open: the USB link itself (steps 1–4 above),
setlist CC32 = 5 + position, a pin recall with a snapshot, the arm flow on strips, and whether *Send
MIDI PC* / *Send Snapshot CC* are on so tiles follow the footswitches.
