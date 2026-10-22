# Helix Stadium in soundLAB

`plugins/helix-stadium.js` adds a **Helix** page (Practice workspace) that
reads, writes and controls a Line 6 **Helix Stadium / Stadium XL**. Load it from
*Settings › Plugins › Add plugin (.js)*. It uses two routes at once:

| Route | Needs | Gives |
|---|---|---|
| **MIDI** (USB-C or 5-pin DIN) | Web MIDI (Chrome/Edge desktop, Android) or the app's native MIDI bridge; on Windows the Line 6 Helix Stadium driver for USB MIDI | control of everything the manual's MIDI chapter lists, plus read-back of preset / snapshot changes when the pedal is set to send them |
| **Bridge** (`node tools/helix-bridge.js`) | Node on this computer; the Stadium on the same Wi-Fi/LAN (its *Remote Access* allowing connections) | the editor's own protocol: product info, active preset, the whole edit buffer (named blocks + parameters), live param / bypass writes, snapshot recall + rename, preset browsing + loading, save, the pedal's pitch detector |

The Stadium's USB connection does **not** carry the editor protocol — the editor
talks over the network (ZeroMQ + OSC). USB gives audio, class-compliant MIDI, an
HID interface and a vendor bulk interface the Line 6 app uses for firmware.

## Running the bridge

```bash
node tools/helix-bridge.js
```

It finds the pedal by name (`p35x1.local`, falling back to an mDNS query for
`_stadiumserver._tcp`), or takes an address: `node tools/helix-bridge.js
192.168.1.23`. It listens on **ws://127.0.0.1:4575** (loopback only — the pedal
has no authentication, so nothing off this computer may reach it through the
bridge) and loads `tools/helix-defs.json` for model/parameter names. `-v` logs
every message. The page connects on its own (address in the Helix page header).

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
  ch 5): level, pan, mute, solo, clear solos.
- **Monitor** — every MIDI byte and every bridge message in and out, raw MIDI
  hex send, raw OSC send (address + JSON args; the request id is added).

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

- MIDI clock out at soundLAB's tempo (the MIDI Hub already has a clock
  sender), footswitch-assignment / Command Center editing, model swapping
  (`/ModelSet`), IRs, Global EQ, song files (SFTP), exporting presets as
  `.hsp`.
- The embedded browser pane in the Claude desktop app grants no Web MIDI
  permission; use Chrome/Edge for the MIDI half.
