# Helix Stadium: Claude's plugin merged with null's work; proposed split

- Author / sole writer: Claude ("Helix Stadium" session, worktree
  `C:\Users\mrein\Creative-Workspace\GuitarPak-helix`).
- Created: 2026-10-22T19:27Z. Remote checked 19:21Z: `main` = `e9426ce`
  (0.81.1); this branch's previous head `830eae3`; no newer null records.
- Authorization: Matt, in that session: "combine your work and develop
  together", then "integrate with null best as possible". Pushing and any
  release still need Matt's say-so; nothing here is pushed yet.

## What exists

| Who | Work | Where |
|---|---|---|
| Claude | Helix plugin (MIDI + network bridge, 6 views) | branch `feat/helix-stadium`: `3de807b` (plugin, bridge, defs, docs, suite), `5e5bfde` (this merge) |
| null | Recall profile (MIDI only, arm/disarm, favorites, allow-list; mocked ports only) | `codex/sl-helix-0780-20261019` @ `69bb917`, only in `C:\Users\mrein\Documents\Codex\2026-10-19\task\soundlab-midi-release\helix` (not on origin) |
| null | Stadium Local Control (Python WinMM, 127.0.0.1:4790, allowlisted CC9 / CC69, 90 s arm, observed events, device inventory) | `C:\Users\mrein\Documents\Codex\2026-10-22\task-2` (not in the repo) |

Claude read both read-only and changed neither.

## What Claude took from null (credited in the plugin header and docs)

- Output starts **disarmed**; Arm = 90 s window, renewed by every command
  (null's server did not renew; renewal keeps knob and XY sweeps usable).
- Disarm on page exit, app hidden, window blur, MIDI destination change,
  Global channel change, bridge drop, failed send. Reads never gated.
- **Port allow-list** (null's regex, plus "wavetable"). New consequence: the
  plugin no longer falls back to soundLAB's shared output unless that output
  is itself the Helix. Before, a MODX or LUMI chosen in Settings could have
  received Helix CCs.
- **Favorites**: named CC32 + PC + optional snapshot, 32 max, saving never
  sends, byte preview. Added: ★ in the bridge's preset list fills the address
  from the Helix's numbering, and the snapshot goes 300 ms after the PC.
- **Observed** panel: newest value per CC / PC with age, message and clock
  counts.
- Windows finding from null's inventory: MIDI runs on Microsoft's class
  driver, no Line 6 driver needed. The plugin's old toast said otherwise; fixed.

## What Claude did not take, and why (null: say if you disagree)

1. **Firmware declaration gate (output only on a declared v1.4).** The bridge
   reads the firmware from the pedal (1.1.0, build 1274), and CC69 is verified
   working on it, so the gate would block the real device.
2. **150 ms minimum between commands.** It breaks knob, EXP and XY sweeps.
   Network param writes are coalesced to one per param per 40 ms instead.
3. **Channel-confirmation checkbox before arming.** Replaced by the channel on
   the destination line ("→ Helix Stadium MIDI · ch 1") and a disarm on any
   channel change.
4. **`App.midi.explicitPortsSupported / subscribeInput / sendToOutput`.** Those
   never landed on `main`; the plugin opens its own Web MIDI access to the
   Helix port instead, so `js/midi.js` stays untouched.

## Verified

- `tests/helix.test.js`: 51 checks pass on `5e5bfde` (the commit message says 53, a miscount): startup silence,
  disarmed refusals with snap-back, lifecycle disarms, failed-send disarm,
  safe mode off, favorites, observed, ★ addresses, port isolation with MODX /
  LUMI / loopMIDI ports, plus the earlier MIDI, bridge and presets checks.
- On the pedal (Stadium XL fw 1.1.0 at `p35x1.local`, 192.168.86.37):
  bridge ports 2001–2003 open with no PIN; edit buffer, lists and product info
  decoded; a param write read back; **CC69 = 1 then 0 sent over USB MIDI and
  read back as snapshot 1 then 0 through `/ActiveSnapshotIndexGet`**. That is
  the device-confirmed effect null's README left pending.
- Not verified on the pedal: the setlist CC32 mapping, a favorite recall with
  a snapshot, the arm flow by hand.

## Path claims

- **Claude:** `plugins/helix-stadium.js`, `tools/helix-bridge.js`,
  `tools/helix-defs.json`, `tests/helix.test.js`, `docs/HELIX-STADIUM.md`,
  and the Helix entries in `CLAUDE.md`, `PLUGINS.md`, `tests/run.sh`.
- **null:** its own `task-2` directory and `codex/sl-helix-0780-20261019`;
  nothing of null's was edited.

## Proposed next pieces for null (pick, then claim in your own record)

- **A. MIDI relay where Web MIDI is missing** (the Claude desktop browser pane
  refuses Web MIDI; Firefox and Safari lack it). Your WinMM transport could
  relay for the page. Two shapes: your server accepts a soundLAB origin over a
  WebSocket with the same allowlist and arm rules, or a `tools/helix-midi.py`
  sidecar that the bridge forwards to. Claude would add the plugin side.
- **B. Firmware 1.4 USB editing, read-only research**: does the MI_06 bulk
  interface carry the same ZMTP / OSC stream? No firmware update without Matt.
- **C. Adversarial review of the plugin's safety coverage**: any write path
  that skips `gate()`, any way a non-Helix port gets bytes.
- **D. Your call on `task-2`**: keep it as the no-browser fallback (the plugin
  docs can link it), or retire it once A lands.

## Open questions for null

1. Agree with dropping the firmware gate, the 150 ms limit and the channel
   checkbox for the reasons above?
2. Your 4790 server is running (pid seen 19:20Z, ports disconnected per your
   verification). Intended to stay up?

## Open questions for Matt

1. Push `feat/helix-stadium` and this record so null can fetch them?
2. The plugin is near the 100 KB plugin cap. The next feature should promote
   it to a built-in page (`js/helix.js`), which means a release.
