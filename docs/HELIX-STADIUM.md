# Helix Stadium in soundLAB

The **Helix** page (*Guitar › Helix*, `js/helix.js`) reads, writes and
controls a Line 6 **Helix Stadium / Stadium XL**. Since the Helix deck
([HELIX-DECK.md](HELIX-DECK.md)) it opens on a **Perform** face; the views
described below live under **Edit**. It is built in since 0.82.0;
it began as a plugin (`plugins/helix-stadium.js`, now a stub) and outgrew the
100 KB plugin cap. Nothing connects when soundLAB starts: the page asks for
MIDI access when you open it only once you have said yes to MIDI somewhere in
soundLAB (otherwise *Connect MIDI* does), and the bridge connects only after you
press *Connect bridge* once. It uses two routes at once:

| Route | Needs | Gives |
|---|---|---|
| **MIDI** (USB-C or 5-pin DIN) | Web MIDI (Chrome/Edge desktop, Android) or the app's native MIDI bridge whose output is the Helix | control of everything the manual's MIDI chapter lists, plus read-back of preset / snapshot changes when the pedal is set to send them |
| **Bridge** (`node tools/helix-bridge.js`) | Node on this computer; the Stadium on the same Wi-Fi/LAN (its *Remote Access* allowing connections) | the editor's own protocol: product info, active preset, the whole edit buffer (named blocks + parameters), live param / bypass writes, snapshot recall + rename, preset browsing + loading, save, the pedal's pitch detector |

The Stadium's USB connection does **not** carry the editor protocol on
firmware 1.1 — the editor talks over the network (ZeroMQ + OSC). USB gives
audio, class-compliant MIDI, an HID interface and a vendor bulk interface.
Line 6 added USB editing in app/firmware 1.4 (release notes dated 2026-10-13;
hardware firmware 1.4.1 on 2026-10-20). Research on 2026-10-26 (community
`helix-stadium-tools`, verified on a Stadium XL fw 1.4.0): that USB editing is a
CDC-NCM **network link over the cable** — the pedal appears as a network adapter
and the same ZeroMQ/OSC services (TCP 2001/2002/2003, mDNS `_stadiumserver._tcp`,
`p35x1.local`, an IPv6 ULA ending in `::1`) answer over it. The vendor bulk
interface is only the firmware-update path (a framed text protocol). So soundLAB's
USB route is the bridge reaching the pedal over that adapter once the pedal runs
1.4 and Windows binds its in-box UsbNcm driver; this pedal runs 1.1.0 today.

**On this PC, MIDI worked without a Line 6 driver.** null's device inventory
(2026-10-22, Windows 11 build 26200) found the Stadium's MIDI on Microsoft's
class driver (`wdma_usb.inf`) and audio on `usbaudio2.inf`, with no Line 6
software installed, and MIDI to the pedal worked. That is one observed
system, not a rule: the official manual still calls for the Stadium ASIO
driver on Windows.

## Running the bridge

```bash
node tools/helix-bridge.js
```

It finds the pedal by name (`p35x1.local`, falling back to an mDNS query for
`_stadiumserver._tcp`), or takes an address: `node tools/helix-bridge.js
192.168.1.23`. It listens on **ws://127.0.0.1:4575** (loopback only — the pedal
has no authentication, so nothing off this computer may reach it through the
bridge) and loads `tools/helix-defs.json` for model/parameter names. `-v` logs
every message. Press *Connect bridge* on the Helix page once (the address is in the page header); after that it reconnects whenever you open the page, until you press *Disconnect*.

`tools/helix-defs.json` is the Stadium model table (828 models, their numeric ids,
categories and per-parameter id/type/range), vendored from
[helixgen-core](https://github.com/sheax0r/helixgen-core) (MIT, © 2026 Mike
Shea), which generated it from the Helix Stadium app's bundled `modeldefs`.

## What the page does

- **Rig** — setlist + preset recall (CC32, PC) with Prev/Next (CC9 12/13),
  Save edit buffer (bridge), 8 snapshot buttons (bridge `/activateSnapshot`,
  else CC69; long-press renames over the bridge), Knobs 1–8 (CC38–45), EXP 1/2
  (CC1/2), toe switch (CC36), XY pad (CC7/8), tap tempo (CC64; "Send app
  tempo" taps four times at soundLAB's BPM, optional follow), tuner on/off
  (CC9 = 34) and a **network tuner** fed by the pedal's continuous pitch
  detector, footswitch mode (CC37), top-panel buttons (CC9), your own
  Bypass/Control CCs on channel 2, MIDI channel settings. Keys 1–8 recall
  snapshots, `[` `]` step presets, `T` taps.
- **Blocks** — the live edit buffer: every block per path with its category,
  model and grid slot; the dot bypasses (`/BlockEnableSet`), tapping a block
  lists its parameters as sliders/switches that write live
  (`/ParamValueSet`, coalesced to one write per param per 40 ms). The pedal's
  change stream (port 2001) moves the page when you turn a knob on the Helix.
- **Presets** — Factory, User and each setlist (`/GetContainerContents`), with
  the active preset marked; tapping loads it (`/LoadPresetWithCID`, after a
  confirm — unsaved edits on the pedal are lost).
- **Looper & Song** — CC52–62 and CC10/46–51/63.
- **Mixer** — the Matrix mixer per output layer (¼" ch 3, XLR ch 4, Phones
  ch 5): level, pan, mute, solo, clear solos. Per null's reading of Line 6's
  release notes, Matrix MIDI needs firmware 1.4 (and Showcase commands 1.3);
  this pedal runs 1.1.0, so the Mixer view is unverified and probably inert
  on it. Snapshot CC69 works on 1.1.0 (read back over the network).
- **Monitor** — every MIDI byte and every bridge message in and out, raw MIDI
  hex send, raw OSC send (address + JSON args; the request id is added).

## Safety, favorites and observed state (built with null)

These come from null's two Helix efforts: the **recall profile** (branch
`codex/sl-helix-0780-20261019`) and **Stadium Local Control**
(`C:\Users\mrein\Documents\Codex\2026-10-22\task-2`, a standalone Python
WinMM server on 127.0.0.1:4790).

- **Output starts disarmed.** *Arm output* opens a 90-second window that every
  command renews. Opening or leaving the page, hiding the app, switching to
  another window, a MIDI destination change, a Global channel change, a bridge
  drop and any failed send all disarm it. A refused control snaps back, so the
  screen never shows a value that was not sent. Reads never need arming;
  saving and loading presets keep their confirm dialogs on top. *Safe mode*
  (on by default, `hx.safe`) can be switched off after a confirm, for people
  who want every control live.
- **Port allow-list.** Only a port whose name says Helix or Stadium, and never
  one that also says MODX, MONTAGE, LUMI, ROLI, virtual, loopback, loopMIDI or
  thru. soundLAB's own shared output is used only when it is the Helix, so
  Helix CCs can never reach a synth or a LUMI. Rechecked before every send.
- **Favorites.** Named addresses (setlist CC32 + preset PC + optional snapshot
  CC69), up to 32, on this device only (`hx.favs`). Saving, editing and
  removing never send. Recall sends CC32, the PC 30 ms later and the snapshot
  300 ms after that, because a CC that beats the preset change is ignored.
  With the bridge up, ★ beside a preset (or *★ Active preset*) fills the
  address from the Helix's own numbering instead of copying it from its
  screen: User slot *p* is CC32 1 + ⌊p / 128⌋, PC *p* mod 128; Factory is CC32
  0; a setlist at position *s* is CC32 5 + *s*. The setlist mapping follows
  the manual's table and has not been checked on the pedal yet.
- **Byte preview.** The Preset card shows the exact bytes Recall sends.
- **Observed from the pedal** (Monitor view). The newest value of each CC and
  Program Change the Helix sent, named, with its age, plus message and clock
  counts. Clock ticks are counted and kept out of the monitor log. An echo is
  not proof a command was applied; the network read-back is.

null's pending first hardware test (send CC9 = 14 twice and watch the Preset
List toggle) is answered differently: on 2026-10-22 CC69 = 1 then CC69 = 0 went
out over USB MIDI and the pedal's own `/ActiveSnapshotIndexGet` read back 1,
then 0, over the network — a device-confirmed effect, not an echo.

## MIDI map used (global channel 1 unless noted)

| What | CC / message |
|---|---|
| Setlist | CC32: 0 Factory, 1–4 User groups (1A–32D … 97A–128D), 5+ your setlists |
| Preset | Program Change 0–127 within the setlist |
| Snapshot | CC69: 0–7 snapshots 1–8, 8 next, 9 previous |
| Knobs 1–8 | CC38–45 |
| EXP 1 / EXP 2 / toe | CC1 / CC2 / CC36 |
| XY | CC7 (across) / CC8 (up) |
| Buttons | CC9 value: 12 preset ▼, 13 preset ▲, 34 tuner, 23 click, 24 mute all … |
| Footswitch mode | CC37 0–6 |
| Tap tempo | CC64 ≥ 64 |
| Looper | 52 clear, 53 undo/redo, 54 half/full, 55 fwd/rev, 58 overdub/record, 59 stop/play, 60 play once, 62 block off/on |
| Song | 63 playlist, 10 song, 46 marker, 47 RTZ, 48 cycle, 49 prev/next song, 50 prev/next marker, 51 play/pause |
| Matrix mixer | level 11–29, pan 34–52, mute 57–75, solo 80–98, clear solos 103 — on the layer's channel |
| Bypass/Control | your assignments, channel 2 |

Read-back over MIDI needs *Global Settings › MIDI › Send MIDI PC* and *Send
Snapshot CC* on the pedal. It answers no SysEx identity request.

## The editor protocol in one page

Reverse-engineered by the community (the
[helixgen-core protocol reference](https://github.com/sheax0r/helixgen-core/blob/main/docs/helix-protocol.md)
is the thorough one); what the bridge and plugin rely on, all verified against
a Stadium XL on firmware 1.1.0 (build 1274):

- Three ZeroMQ sockets, ZMTP 3 with the `NULL` mechanism (no auth, cleartext):
  **2002** ROUTER (we are a DEALER: commands, replies), **2001** PUB (change
  stream; each message = an 8-byte sequence frame + the OSC frame), **2003**
  PUB (telemetry). Subscribe by sending a one-byte `0x01` frame.
- Every frame is an **OSC** message; blobs are **msgpack**. Content blobs carry
  an 8-byte magic (`_sbepgsm` edit buffer, `\xff\xff\xff\xffpgsm` stored
  preset) and use 4-character tags packed as integer keys (`cg__`, `sfg_` …) —
  the bridge turns those back into text.
- The first int of a command is a request id the device echoes. Unknown
  commands answer `/error [id, 0, "Msg dispatch failed: … is NOT known!!!"]`.
- Reads: `/ProductInfoGet` → `/getProductInfo`; `/EditBufferStateGet` →
  `/getEditBufferState [id, len, blob]`; `/ActiveSnapshotIndexGet`;
  `/PropertyValueGet [id, "server.active.preset.id"]` → the active cid (on
  fw 1.1 `/GetContentRef` returns `{}` for it, so the page looks the cid up in
  the lists it has read); `/GetContainerContents [id, cid]` with containers
  `-1` Factory, `-2` User, `-5` setlists (each setlist is a container of
  references with `rcid`); `/ParamValueGet [id, path, slot, 0, pid]`.
- Writes: `/ParamValueSet [id, path, slot, 0, pid, value, -1]` (raw units;
  the pedal quantises), `/BlockEnableSet [id, path, slot, 0|1]`,
  `/activateSnapshot [id, i]`, `/SetSnapshotName [id, i, name]`,
  `/LoadPresetWithCID [id, cid]`, `/SavePresetWithCID [id, cid, 0, 0]`.
  Writes answer `/status [id, 0, n]`.
- Edit buffer: `sfg_.flow[path].blks` is a flat `[slot, block, slot, block…]`
  list; `block.mdls[0].id__` is the model id, `.parm[]` the `{pid_, valu}`
  values; `cg__.asnp` the active snapshot; `cg__.entt.snps[]` the snapshots
  (listed 8→1, each with its `si__` index and a `name` once used).
- 2001 echoes: `/setParamValue [sess, cmd, path, slot, 0, pid, value]`,
  `/setBlockEnable [sess, cmd, path, slot, on]`, `/activateSnapshot [-1, -1,
  i]`, `/setEditBuffer` (full blob after a load), `/heartbeat`.
- 2003: `/dspEvent` blobs `{id__:{eid_, mid_}, vals}`; `eid_ 10` is the
  pitch detector (one float: MIDI note with cents as the fraction, −1 =
  silence), `eid_ 1` the meters (128 floats).

The bridge's JSON wire format is documented at the top of
`tools/helix-bridge.js`. Suite: `tests/helix.test.js` (fake MIDI port + fake
bridge).

## Not done yet / ideas

Proposed split with null (details in the coordination record
`tasks/20261022T1930Z-helix-integration-claude.md`):

- **MIDI where Web MIDI is missing** (the Claude desktop browser pane, Firefox,
  Safari): null's WinMM transport could relay for the page — proposed for null,
  whose code it is.
- **Firmware 1.4 USB editing**: does the bulk interface carry the same
  ZeroMQ/OSC stream? Read-only research proposed for null; updating the
  pedal's firmware is Matt's call.
- **Hardware checks with Matt watching**: the setlist CC32 mapping, a favorite
  recall with a snapshot, and the arm/disarm flow on the real pedal.
- More: MIDI clock out at soundLAB's tempo (the MIDI Hub already has a clock
  sender), footswitch-assignment / Command Center editing, model swapping
  (`/ModelSet`), IRs, Global EQ, song files (SFTP), exporting presets as
  `.hsp`.
- The embedded browser pane in the Claude desktop app grants no Web MIDI
  permission; use Chrome/Edge for the MIDI half until the relay exists.
