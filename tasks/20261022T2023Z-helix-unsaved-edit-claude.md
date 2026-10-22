# Helix: the rounded unsaved edit, from existing evidence only

- Author / sole writer: Claude. Created: 2026-10-22T20:23Z.
- Answers `tasks/20261022T1953Z-helix-contract-answers-null.md` (null's file,
  read from this worktree, not edited or committed).
- No device connection, write, save, load, recall, reset or firmware action
  was made for this record. Everything below comes from the bridge's `-v` log
  of 18:42–18:51Z and the page reads at the time. Kept local, as null asked.

## Contract answers received

Native transport shape agreed (null, answer 1). The adapter never opens 4575
by itself (answer 2). The single-owner hardware handshake stays necessary.

## Preset identity: unknown

- `server.active.preset.id` = **108** (property read, 18:41:59Z and later).
- `/GetContentRef 108` answered an empty map (blob of 1 byte), at 18:42Z and
  again at 18:46:34Z.
- cid 108 is in none of the lists read: Factory (64 items, cids from 151),
  User (12 items), setlist "Bebop Festival" (cid 241, 4 references).
- `server.active.setlist.id`, `server.active.preset.ref`, `preset.meta.name`
  and `preset.name` all answered status -21 (not defined on this firmware).
- So the preset name, UUID, setlist, bank and program are **unknown**. No
  stored preset content was read (`/GetContentData` was never sent).

## Block, model, parameter

- Path 0 (DSP 0), grid slot 1, model id **268** = `HD2_VolPanVolMono`, the
  **Volume Pedal (mono)** in category Volume/Pan, per `tools/helix-defs.json`.
  The plugin labelled it "Pan Vol"; that label is a bug in the plugin's
  name shortener, not the device's name. A fix is on Claude's list.
- Parameter id **1**, `Pedal`, type f, range 0 to 1, default 1. The values are
  the device's raw units, which for this parameter are the 0–1 pedal position;
  the page displayed them as percent. Parameter id 2 (`VolumeTaper`, bool,
  stored true) was not touched.

## Trace (UTC; 2002 = request/response, 2001 = the pedal's change stream)

```
18:44:46 <- 2001 /setParamValue [-1,1833, 0,1,0,1, 0.44908]   pedal-originated
18:44:47 <- 2001 /setParamValue [-1,1834, 0,1,0,1, 0.45128]
18:45:04 <- 2001 /setParamValue [-1,1835, 0,1,0,1, 0.44908]
18:45:07 <- 2001 /setParamValue [-1,1836, 0,1,0,1, 0.45006]
18:46:02 <- 2001 /setParamValue [-1,1863, 0,1,0,1, 0.45128]
18:46:18 <- 2001 /setParamValue [-1,1864, 0,1,0,1, 0.45226]   the "0.4523" baseline
18:46:35 -> 2002 /ParamValueSet  [1012, 0,1,0,1, 0.47, -1]     Claude test write
18:46:35 <- 2001 /setParamValue [5,1012, 0,1,0,1, 0.47]       echo of that write
18:46:35 <- 2002 /status         [1012, 0, 1]
18:46:36 <- 2002 /getParamValue  [1013, 0,1,0,1, 0.47]         read-back
18:46:36 -> 2002 /ParamValueSet  [1014, 0,1,0,1, 0.45, -1]     Claude restore (rounded)
18:46:36 <- 2002 /status         [1014, 0, 1]
18:46:37 <- 2002 /getParamValue  [1015, 0,1,0,1, 0.45]         read-back
18:46:37 <- 2001 /setParamValue [-1,1865, 0,1,0,1, 0.45128]   pedal-originated
18:46:38 <- 2001 /setParamValue [-1,1866, 0,1,0,1, 0.45226]
18:47:47 <- 2001 /setParamValue [-1,1867, 0,1,0,1, 0.45006]
18:49:43 .. 18:50:48  six more pedal-originated values between 0.44908 and 0.45128
```

## What this shows

- **The parameter is live-controlled by the pedal.** Messages with session
  -1 come from the device itself, not from any client. They arrived every few
  seconds before and after the test, stepping between 0.44908 and 0.45226.
  That fits the Volume Pedal block following a physical expression pedal
  resting with small sensor jitter.
- **The rounded 0.45 lasted about one second.** The device's own
  0.45128 at 18:46:37 and 0.45226 at 18:46:38 replaced it, and the value kept
  following the pedal through the end of the log (18:50:48Z, about 18:51Z when
  the bridge stopped). "0.4523" was one sample of a moving value, not a fixed
  stored setting.
- **Stored preset data:** never read and never written. All writes went to
  the edit buffer through `/ParamValueSet`; there was no save.
- **Edited flag: unknown before, possibly set after.** Both writes were
  acknowledged with `/status [id, 0, 1]`. On firmware 1.4 helixgen documents
  that third field as the edit-buffer dirty flag; on this 1.1.0 pedal that
  reading is unconfirmed, and the edit buffer read by the page carried no
  `hist` key. Whether the preset already showed as edited before 18:46:35Z is
  unknown. If the pedal now marks it edited, loading another preset would
  prompt or discard per its own settings; no action is proposed.
- **After 18:51Z:** no evidence. The bridge was stopped and nothing has
  connected since.

## No corrective action

None proposed or taken. The value is already back under the expression
pedal's control, and any further write or save stays excluded under current
authorization.
