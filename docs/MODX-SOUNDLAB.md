# soundLAB and the Yamaha MODX8+ (consolidated knowledge)

Written 2026-11-02. This page keeps what the laptop chat **"Yamaha MOD8X MIDI USB controller"**
(`session_01NgEttGJjrqGft9i3ttsfZq`, also called the "Synth tab session" in its own records) learned
about Matt's MODX8+, plus the LUMI and Helix hardware facts that matter for it. That chat ran on the
laptop that is no longer reachable; its transcript could not be read. Everything here comes from git,
PR bodies and the coordination records, and each fact names its source.

For detail, see [MODX-MIDI-REFERENCE.md](MODX-MIDI-REFERENCE.md) (the research notes),
[SYNTH-DECK.md](SYNTH-DECK.md) (the control surface), [SYNTH-TAB.md](SYNTH-TAB.md) (Deck / Live / Hub)
and [SYNTH-TAB-PLAN.md](SYNTH-TAB-PLAN.md). How to set up and test: [DEV-HANDBOOK.md](DEV-HANDBOOK.md).

## Read this first

The only real-hardware check of the MODX8+ (2026-10-24) and of the LUMI (2026-10-25) live on two
branches that are **not on `main`** and have **no PR**:

| Branch | Commits | What it holds |
|---|---|---|
| `check/modx-maps-claude` | `e6ce52c` | The MODX8+ verified map: section "Checked on the MODX8+" in `docs/MODX-MIDI-REFERENCE.md`, about 25 entries re-tagged in `js/synthdeck-maps.js` (incl. identity `106: 'MODX8+'`), the hardware-gate results in `docs/SYNTH-DECK.md`, record `tasks/20261025T0010Z-modx-check-claude.md` |
| `check/lumi-claude` | `a9a243d`, `5cdc826` | The LUMI firmware findings and fixes in `js/midi.js` (relight after note-off, config frames only on change, stale-output stand-in), `tests/lumi-firmware.test.js` (12 checks), notes in `NOTE-PALETTE.md` / `LUMI-PRACTICE.md` / `CLAUDE.md`, record `tasks/20261025T0100Z-lumi-check-claude.md` |

`docs/RELEASE-1.3-CHECKLIST.md` section 6 ticks both checks with "PRs open", but no PR exists, and
1.3.0 / 1.3.1 shipped without them. So, until they are merged, **`main` contradicts the hardware**:

- `docs/MODX-MIDI-REFERENCE.md` still says nothing was verified on the owner's MODX8+, and gives the
  bulk-dump footer as `0F 00 00` (the real one is `0F 25 00`).
- `docs/SYNTH-DECK.md` still has "Hardware gate (not yet run)".
- `js/synthdeck-maps.js` has no `0x6A` in its identity table and tags `31 6p 00` (Arp on this Part)
  `unverified`.
- `CLAUDE.md` says LUMI velocity 127 is white (it is violet), and `js/midi.js` has no relight.

Where this page and `main` differ, this page (and the check branches) are right. Section 7 says how
to bring them onto `main`.

**Source key.** `e6ce52c:docs/X.md` = the file as it is on that commit (read it with
`git fetch origin check/modx-maps-claude && git show e6ce52c:docs/X.md`). `rec:<name>` = a task
record on the coord branch (`git show origin/coord/cowork-20261022-claude:tasks/<name>`), with two
exceptions that are **not** on the coord branch or `main`: `rec:20261025T0010Z-modx-check-claude.md`
is only on `check/modx-maps-claude` (`git show e6ce52c:tasks/20261025T0010Z-modx-check-claude.md`)
and `rec:20261025T0100Z-lumi-check-claude.md` only on `check/lumi-claude`
(`git fetch origin check/lumi-claude && git show 5cdc826:tasks/20261025T0100Z-lumi-check-claude.md`). A bare
path = the file in this checkout (PR #90's head `bc47da5`). PR #90 changes a few of them (for
example `js/midi.js` gains the remote's input claim); the MODX facts cited are the same on `main`.

## 1. What the chat built

| When | What | Where |
|---|---|---|
| 2026-10-22 | Synth control 0.80.0: the Hub's own synth output, big-knob Control view; LUMI Display aid (Songs and the Woodshed light the notes to play); released 0.80.0, 0.81.0 (null's practice plan) | `3c09036`, `0e0600c`, `4122d31` |
| 2026-10-24 | MIDI Hub Player (MIDI / MusicXML file to the synth, key shifter, Open as tab): web 1.1.0 | `6c99335` .. `3caa04a` |
| 2026-10-24 | Score review to synth / MIDI / tab on Codex's 1.1 line (unmerged) | `feat/review-to-synth` `473814f` |
| 2026-10-24 | The MODX8+ hardware check ("Do it here") | `check/modx-maps-claude` `e6ce52c` |
| 2026-10-25 | The LUMI hardware check (attribution to this chat inferred) | `check/lumi-claude` `a9a243d`, `5cdc826` |
| 2026-10-25/26 | The Synth tab (Deck / Live / Hub, strips, presets, Live sets, splits, One Open): web 1.3.0 | PR #88, stamps `6475638` |
| 2026-10-26/27 | Taps survive the MODX clock; the tab connects by itself: web 1.3.1 | PR #91, stamps `129720b` |
| throughout | The coordination records 0.80.0 to 1.3.1 | `coord/cowork-20261022-claude` |

Open item it left: **the MODX finger-tap test after the 1.3.1 fix** (section 5.1).

## 2. Matt's MODX8+ setup

| Item | Value | Status | Source |
|---|---|---|---|
| Instrument | Yamaha MODX8+. Identity reply `F0 7E 7F 06 02 43 00 41 6A 06 00 00 00 7F F7`: model byte **0x6A** = MODX8+ | verified 2026-10-24 | `e6ce52c:docs/MODX-MIDI-REFERENCE.md` |
| Firmware | MODX+ ships 1.00 / 1.01 and has no update; it equals MODX OS 2.52. "OS 3.x" in old briefs is a mix-up | documented | `docs/MODX-MIDI-REFERENCE.md` |
| Cable / host | USB to the Windows 11 laptop. On the synth: *UTILITY › Settings › MIDI I/O › MIDI IN/OUT = USB* | verified (setup of the check) | `rec:20261025T0010Z-modx-check-claude.md` |
| PC driver | Yamaha Steinberg USB Driver (MIDI and audio on Windows) | documented in app text | `js/midihub.js` (profile notes), `js/audioin.js` |
| USB MIDI port | **`MODX-1`** = Port 1 (tone generator, bulk dumps, clock). The deck's "Synth out" was MODX-1 | verified | `rec:20261025T0010Z-modx-check-claude.md` |
| Other ports | Port 2 = DAW remote, Port 3 = 5-pin MIDI thru. Their Windows names were never recorded | documented | `docs/MODX-MIDI-REFERENCE.md` |
| Port auto-pick | Hub "Synth out" auto = a synth-named port, port "-1" first, never `lumi`/`wavetable`/`microsoft` | code | `js/midihub.js` (`NOT_SYNTH_RE`) |
| USB audio | Windows shows the MODX audio as **"Line (MODX)"**; Settings › Sound input › *Hear input* plays it through soundLAB (gain 0-200 %, raw stream) | in code; no verification record | `js/audioin.js`, CLAUDE.md audioin entry |
| MIDI I/O Mode | *Utility › Settings › Advanced › MIDI I/O Mode = **Multi***: Part n = channel n (ch 2 moved Part 2) | verified | `e6ce52c:docs/MODX-MIDI-REFERENCE.md`; `docs/SYNTH-DECK.md` |
| Device number | SysEx `F0 43 1n ...` with n = 0 worked; the MODX answers any device number unless *Advanced › Device Number* is changed | used in the check | `docs/MODX-MIDI-REFERENCE.md` |
| Local Control | Default On. **Must be OFF** for Hub Thru, LUMI splits and the practice sound route; soundLAB never changes it. Matt's actual setting is not recorded | documented | `docs/PRACTICE-ROUTER.md`; `docs/SYNTH-TAB.md` |
| Clock Out | **On by default on this unit**: F8 every ~28 ms (Scope read "Clock: synth 89.9 BPM") plus Active Sensing FE every ~300 ms | verified | `e6ce52c:docs/MODX-MIDI-REFERENCE.md` |
| MIDI Sync | *Internal* for the Scope's beat grid; *MIDI* makes arp / motion seq follow the Hub's clock | documented | `js/synthdeck-maps.js`; `js/midihub.js` |
| Arp MIDI Out | Must be On for the Scope to see arpeggio notes (it also makes incoming MIDI bypass the arp) | **not tested** | `docs/SYNTH-DECK.md` |
| Controller channels | Super Knob CC 95 and Scene CC 92 on ch 1 only. A.SW1 / A.SW2 / MS Hold / MS Trigger go out on **every keyboard-control Part's channel** (ch 1-3 on a 3-Part Performance) | verified (transmit capture) | `e6ce52c:docs/MODX-MIDI-REFERENCE.md` |
| Super Knob | CC 95, ch 1; received as `30 4B 00` | verified both ways | same |
| Scenes | CC 92 values 0/16/32/48/64/80/96/112 = Scenes 1-8, ch 1, both ways. Active Scene readable at `30 4C 00` byte 0, **not settable** | verified | same |
| Assign knobs 1-8 | CC 17-24 on the Part channel; received as `31 0p 6A..71`. With Common selected, panel knobs 1-4 send Parameter Changes `30 40 53..56`, not CCs | receive verified; transmit with a Part selected **not checked** | same |
| Assign knob names | Bulk block `30 50 00` = 8 × 16 ASCII ("Assigned" = blank); the Deck names its strips with them | verified on a dump | `js/synthdeck.js` (`readName`); `docs/SYNTH-TAB-PLAN.md` |
| Assign switches | A.SW1 / A.SW2 = CC 86 / 87 (127 press, 0 release) | verified | `e6ce52c:docs/MODX-MIDI-REFERENCE.md` |
| Motion Seq | MS Hold CC 88 is **a latch** (127, then 0 on the next press); MS Trigger CC 89 (127 then 0) | verified | same |
| Part CC → Part address | 74→`+50`, 71→`+51`, 73→`+46`, 75→`+47`, 72→`+49`, 91→`+29`, 7→`+24`, 10→`+25`, 5→`+32`, 65→`+31`. CC 93 left no trace | verified by readback | same |
| Control Number block | In `30 40 00` after the name: `10 02 0B 60 56 57 58 59 11 12 13 14 15 16 17 18` = ribbon 16, breath 2, FC1 11, FC2 byte **0x60** (not decoded; docs say CC 4), A.SW 86/87, MS 88/89, Assign 17-24 | verified (dump) | same |
| Foot switch | *FS Assign* is global; factory default **unverified**. Live sets learn it (`synthtab.fsCC`, 150 ms debounce); the remote wants FS Assign = a CC no Performance uses | documented | `js/synthlive.js`; `docs/CONTROLLER-REMOTE.md` |
| Whole-Performance recall | Bank MSB **64** / LSB / PC on ch 1 (64/0/PC 1 reloaded "CFX + FM EP 2") | verified | `e6ce52c:docs/MODX-MIDI-REFERENCE.md` |
| One-Part recall | MSB **63** / LSB / PC on the Part's channel (63/0/PC 3 on ch 2 → Part 2 = "CFX Stage") | verified | same |
| Bank layout | LSB 0-17 = Preset pages of 128 (N → LSB = (N-1) div 128, PC = (N-1) mod 128), 32-36 = User, 40-79 = Library | documented (high) | `docs/MODX-MIDI-REFERENCE.md` |
| Live Set slot | MSB **62** / LSB page / PC slot on the active Live Set bank; bank select by SysEx `09 00 00` (`F0 43 10 7F 1C 07 09 00 00 01 F7` = User 1). Live sets send `program(62, lsb, pc)` | documented. **No hardware test recorded**, although `docs/SYNTH-TAB-PLAN.md` lists it as checked | `docs/MODX-MIDI-REFERENCE.md`; `js/synthlive.js` |
| Factory names | `data/modx-performances.json` = 2,143 names (public Cakewalk .ins list; MSB 63 and 64 share the layout) | data | `docs/SYNTH-DECK.md` |
| Settle time | A CC in the same burst as a Program Change is lost; 25 ms or more later, all land. Default kept at 250 ms (`deck.settleMs`, 0-2000) | verified | `e6ce52c:docs/MODX-MIDI-REFERENCE.md`; `js/synthdeck.js` |
| Browsers used | Chrome 152 (2026-10-24, localhost); installed Chrome 155 and Edge 156 (2026-10-26). Playwright's Chromium 131 **crashes on any send to the MODX** on that PC | observed | `rec:20261025T0010Z-modx-check-claude.md`; `rec:20261027T0000Z-release-1.3.1-claude.md` |

### SysEx soundLAB sends to or reads from the MODX

Format: `F0 43 1n 7F 1C 07 aH aM aL dd F7` = Parameter Change; `3n` = Parameter Request; `2n` = Bulk
Request (`docs/MODX-MIDI-REFERENCE.md`; builders in `js/midihub.js` and `js/synthdeck-maps.js`).

| Purpose | Address / bytes | Status |
|---|---|---|
| Arp master | `30 47 03` (the deck sends `F0 43 10 7F 1C 07 30 47 03 01 F7` / `... 00 F7`) | verified 2026-10-24 (readback) |
| Motion Seq master | `30 48 00` | verified (readback) |
| Part mute | `31 0p 18` | verified (readback) |
| Part keyboard control | `31 0p 17` | verified (readback) |
| Arp on this Part | `31 6p 00`; `unverified` on `main`, verified on the check branch | verified (readback) |
| Master volume | `00 00 00` (reads 7F) | read verified |
| Super Knob | `30 4B 00`: read verified, **write not tested** | partly |
| Read name from synth | Bulk request `F0 43 20 7F 1C 07 0E 25 00 F7`. Reply: header `0E 25 00`, 189 blocks (~375 ms), name = 20 ASCII at block `30 40 00`, Assign names at `30 50 00`, footer **`0F 25 00`** | verified. The name is filed under the Hub's *assumed* program, because a panel change sends no Program Change |
| Checksum | two's complement of the sum from the model id to the last data byte, low 7 bits | verified on all 189 blocks |
| Live Set bank | `09 00 00` | documented |
| Identity request | `F0 7E 00 06 01 F7` (Hub › SysEx) | reply verified |

## 3. Verified on hardware, documented only, never run

### Verified on real hardware (dated)

| Date | Device | What | How | Source |
|---|---|---|---|---|
| 2026-08-10 .. 10-14 | LUMI | Matt's reports drove fixes: colours not applying (SysEx permission declined silently), note-light modes overwriting SysEx colours, device id ambiguity (send 0x37 and 0x00). Symptom reports, not confirmations of the fixes | user reports | PRs #53, #57, #64, #82 |
| 2026-10-22 | Helix Stadium XL fw 1.1.0 build 1274 (`p35x1.local`) | Bridge ports 2001-2003 open with no PIN; edit buffer, lists, product info decoded; a parameter write read back; CC69 = 1 then 0 over USB MIDI read back as snapshot 1 then 0 | live session | `docs/HELIX-STADIUM.md`; `rec:20261022T1930Z-helix-integration-claude.md` |
| 2026-10-22 | Helix + Windows 11 build 26200 | MIDI on Microsoft's class driver, audio on `usbaudio2.inf`, no Line 6 software installed | null's inventory | `docs/HELIX-STADIUM.md` |
| 2026-10-24 | MODX8+ | Every row marked "verified" in section 2. Also: the panel sends **nothing** for ARP / MOTION SEQ ON/OFF or a Performance change, and the synth **never echoes** a received Parameter Change | transmit capture on `midi:raw` while Matt pressed the panel; write → Parameter Request readback → bulk-dump diff → restore. Synthdeck 136, synthdeck-scope 41, midihub 45 checks passed after | `e6ce52c`; `rec:20261025T0010Z-modx-check-claude.md` |
| 2026-10-25 | LUMI Keys Block "ALXJ" (stock ROLI firmware, Rainbow scheme) over Bluetooth | Note On lights its key in a velocity **hue** until Note Off (`80 nn 00` clears). **127 = violet, not white.** Every SysEx config frame **wipes** lit keys. A pressed key loses its light for good. "Night" = dim rainbow. Notes on ch 1 with release velocity. Octave buttons send nothing. Brightness 80 % = `10 40 04 14`. The 12-step ladder sits within about one step of `colourLookup` | photos + `midi:raw` / `midi:out` taps | `a9a243d`, `5cdc826`; `rec:20261025T0100Z-lumi-check-claude.md` |
| 2026-10-25 | Windows + Chrome 152 | A Bluetooth LUMI is listed only with `--enable-features=MidiManagerWinrt` on the **command line**; the chrome://flags switch did not take. The LUMI's USB MIDI fails with **Code 10** on that PC | live | `rec:20261025T0100Z-lumi-check-claude.md` |
| 2026-10-25 | MODX | Its "USB TO DEVICE" port takes flash drives only. A LUMI → MODX link without a computer needs a Bluetooth-to-DIN bridge (CME WIDI), and then nothing can light the LUMI (Bluetooth MIDI = one host) | observation | same |
| 2026-10-26 | MODX8+ + installed Chrome 155 | Once connected, every Synth tab control worked; Arp and Motion Seq read back on/off. The "controls aren't working" report came from ~36 F8/s + FE rebuilding the Deck's buttons 120 times in 5 s, which ate taps; and nothing on the tab had asked for MIDI | live diagnosis | PR #91; `rec:20261027T0000Z-release-1.3.1-claude.md` |
| 2026-10-26 | Helix USB descriptors | VID 0E41 / PID 4841: MI_00 USB Audio 2.0, MI_03 class MIDI, MI_05 HID keyboard, MI_06 "Helix Stadium Bulk Transfer" (vendor FF, no driver bound) | inventory | `rec:20261026T0200Z-helix-deck-claim-claude.md` |

### Documented only (research, never seen on Matt's units)

- MODX: bank LSB 32-36 / 40-79; Live Set MSB 62 and the `09 00 00` bank select; GM banks; ribbon
  CC 16, breath 2, FC1 11, FC2 4; cutoff / resonance CC 74 / 71 as *panel* transmit; Arp MIDI Out;
  Quick Setups; the MIDI Mode address `00 00 30` value map; Scene keyboard-control / Super Knob link
  addresses `30 4C 0C..0F` and `36 sp 0D`; Part volume via `31 0p 24` (receive verified only as the
  target of CC 7). Sources: `docs/MODX-MIDI-REFERENCE.md`, `e6ce52c:docs/MODX-MIDI-REFERENCE.md`.
- `main`'s map still carries the pre-check confidences (arp master `documented`, arp-on-Part
  `unverified`): `js/synthdeck-maps.js`.
- Helix MIDI map: setlist CC32 = 5 + position, Matrix mixer (fw 1.4), Showcase (1.3)
  (`docs/HELIX-STADIUM.md`).
- Helix USB editing on fw 1.4 = a CDC-NCM network link: from community notes, not Matt's pedal
  (`feat/helix-deck:docs/HELIX-USB.md`).

### Never run on hardware

- **Android APK MidiBridge** (USB and Bluetooth): built in the cloud 2026-10-12 (PR #77), tested only
  against a fake bridge (`tests/btmidi.test.js`).
- **iOS CoreMIDI bridge**: "runtime behavior on a physical iPad/ROLI still needs a hands-on pass"
  (PR #25). The IPA is probably blank anyway ([DEV-HANDBOOK.md](DEV-HANDBOOK.md) 4.8).
- **iPad in a Web MIDI browser app** (`docs/RELEASE-1.3-CHECKLIST.md` 1.8).
- **Practice router / Scale lock** on a real synth with Local Control OFF: cloud simulation only
  (`docs/PRACTICE-ROUTER.md`, `docs/EXTERNAL-MIDI-COVERAGE.md`, `docs/VALIDATION-2026-10-23.md`).
- **LUMI practice page** with a real LUMI + MODX route: "EXPERIMENTAL / UNVERIFIED"
  (`docs/LUMI-PRACTICE.md`).
- **Controller remote** (1.4.0, PR #90) with a MODX foot switch / A.SW or a page turner
  (`docs/CONTROLLER-REMOTE.md`).
- **The 1.3.1 fix on the real MODX**: the synth was switched off mid-session
  (`rec:20261027T0000Z-release-1.3.1-claude.md`).

## 4. MIDI bridging per platform

All backends feed one service, `App.midi` (`js/midi.js`). It picks iOS when
`window.webkit.messageHandlers.midi` exists, Android when `window.SoundLabMidi.post` exists, else Web
MIDI. The native protocol: page → native `{cmd: init|send|setOutput|bluetooth}`; native → page
`window.__glMIDI.onports / onmidi / onstatus`. Web MIDI asks with `sysex: true` and falls back to plain
MIDI. `midi.wanted` reconnects silently at the next launch (PR #63).

| Platform | Build | How it runs | Tests | Needs / state |
|---|---|---|---|---|
| **Chrome / Edge desktop (Web MIDI)** | nothing: the Pages site, or `python3 tests/serve.py` | One browser prompt (MIDI + SysEx). The Synth tab has its own connect panel and never prompts by itself (PR #91). The Hub's own output (`App.midi.sendTo`) is Web MIDI only. **One program per port on Windows**: close the DAW | The 22 MIDI suites of section 8 (`midi-ports`, `midi-ingress`, `multiin`, `lights`, `lumidisplay`, `colors`, `display-master`, `lumi-contexts`, `midihub*` (4), `synth*` (5), `practice-router`, `lumi-practice`, `audioin`, `btmidi`, `helix`): 1,117 checks, all passed in the cloud on PR #90's head, 2026-11-02 (fresh full run) | Any computer + the Yamaha driver. This is the tested path. |
| **Android Chrome (Web MIDI)** | same site | USB-OTG, or Bluetooth devices paired by the OS | same suites | No soundLAB record of real use |
| **Windows Bluetooth (WinRT) + launcher** | `releases/soundLAB-windows.bat` in `releases/soundLAB-windows.zip` | Edge first, then Chrome, `--enable-features=MidiManagerWinrt --app=<site>`. Pair the keyboard in Windows first; close the browser fully once. Settings › MIDI shows a hint until a "Bluetooth" port appears | hint logic only | Verified with the LUMI 2026-10-25. **The zip is stale**: rebuild it ([DEV-HANDBOOK.md](DEV-HANDBOOK.md) 4.9) |
| **Android APK MidiBridge** | `android/build.sh` (cloud) / `build.ps1` (PC); key in the private artifact ([DEV-HANDBOOK.md](DEV-HANDBOOK.md) 4.7). Shipped 0.75.0 (`639a571`) | `MainActivity` loads the live site, exposes `GuitarLabHost` and `SoundLabMidi`. Opens every MidiManager device; SysEx supported. Bluetooth: scans 10 s for the BLE-MIDI service, connects, remembers `btAddr`, reconnects at launch. **One output**, shared by the synth and the key lights | `btmidi` (fake bridge) | No real-device test recorded |
| **iOS CoreMIDI wrapper** | `ios/` (XcodeGen) via `.github/workflows/ios.yml`, unsigned IPA | `MIDIBridge.swift` connects every source (USB + Bluetooth), `setOutput` by id, the system Bluetooth pairing sheet. **Sends of 200 bytes or more are dropped**; receive copies at most 256 bytes per packet | simulated wrapper (PR #25) | Never run on an iPad; IPA probably blank |
| **iPad / iPhone Safari** | | No Web MIDI. Use a Web MIDI browser app ("MIDIWeb Browser", "Web MIDI Browser") with the synth on a USB camera adapter, or the wrapper | | Device test open |
| **ROLI LUMI** | | Detected by port name (`knownLumi` in `js/midi.js`: `lumi` minus modx / montage / helix / stadium / seaboard / lightpad / virtual / loopback / loopmidi / thru). Lights = note-ons in a 24-key window learned from played notes. Config SysEx per benob/LUMI-lights: `F0 00 21 10 77 {37 and 00} <cmd> <checksum> F7`. **Never receives synth messages** (deck `txCheck`, Hub Thru guard, practice-router exclusion) | `lights`, `lumidisplay`, `colors`, `display-master`, `lumi-contexts`, `lumi-practice`; `lumi-firmware` only on `check/lumi-claude` | Bluetooth on Windows needs WinRT; USB failed (Code 10) on the laptop |
| **Helix bridge** | `tools/helix-bridge.js` (Node, no dependencies) 0.1.0 on `main`; 0.2.0 with USB discovery on `feat/helix-deck` | Relays the pedal's editor protocol as JSON on `ws://127.0.0.1:4575` (loopback only). MIDI uses its own allow-listed port (Helix / Stadium, never MODX / MONTAGE / LUMI / ROLI / virtual / loopMIDI / thru / wavetable) and a 90 s arm window | `helix` (fake port + bridge); `helix-deck`, `helix-bridge-usb` on `feat/helix-deck` | A computer on the pedal's LAN, or USB on fw 1.4 |
| **Controller remote over MIDI** (PR #90) | `js/remote.js` | Learned CC / Program Change / note per action; claimed before `'midi:raw'` (`App.midi.setInputClaim`). MODX: foot switch with FS Assign = an unused CC, or A.SW1/2 = CC 86 / 87 | `remote*` suites | |
| Gone: the laptop's "Desktop soundLAB" | not in the repo | A launcher on the laptop that served `C:\Users\mrein\Creative-Workspace\GuitarPak` on port 4590 (`docs/SYNTH-DECK.md` calls it "the soundLAB desktop app") | | **Gone with the laptop.** Replacement: the Windows launcher above |
| Gone: null's "Stadium Local Control" | not in any repo | A Python WinMM server on 127.0.0.1:4790 with a 297-definition Helix MIDI catalog (`C:\Users\mrein\Documents\Codex\2026-10-22\task-2`) | | **Gone with the laptop** |

## 5. Open hardware tests, with exact steps

Common setup: an installed Chrome or Edge (not Playwright's Chromium) on a computer with the Yamaha
Steinberg USB Driver; the MODX on USB with MIDI IN/OUT = USB and MIDI I/O Mode = Multi. soundLAB's
**Synth › Hub › Monitor** shows every byte in and out. A LUMI, if used, over Bluetooth with the WinRT
switch.

### 5.1 MODX finger-tap test (the open item of the Yamaha chat; 1.3.1, PR #91)

1. Synth › Deck → the connect panel → *Connect* → allow MIDI and SysEx.
2. Synth out = `MODX-1`.
3. Confirm the MODX is sending clock: the Scope shows "Clock: synth … BPM", or the Monitor fills with
   F8 once its clock filter is off.
4. With a finger (touch screen, or a slow mouse press of about 140 ms), tap **Arp** six times. After
   each tap the chip must flip and the synth's ARP ON/OFF LED must follow. Optional readback: Hub ›
   SysEx, Parameter Request `F0 43 30 7F 1C 07 30 47 03 F7` returns `... 30 47 03 0v`.
5. Repeat with **Motion seq** (`30 48 00`), **Scenes 1-8** (the Monitor shows `B0 5C 00/10/…/70` and
   the SCENE LED moves) and a few **Live set slots**.
6. **Pass** = every tap lands: none lost, no "Not sent" toast.
7. Meanwhile the LUMI (if connected) must receive no synth bytes.
8. The automated twin is `tests/synthconnect.test.js` (six 140 ms taps during a 28 ms F8 stream).

### 5.2 MODX items still unchecked

From `e6ce52c:docs/MODX-MIDI-REFERENCE.md` and `rec:20261025T0010Z-modx-check-claude.md`:

1. **Arp MIDI Out**: *Utility › Settings › MIDI I/O › Arp MIDI Out = On*; hold a chord on an arp
   Performance; Synth › Edit › Scope must draw the arpeggio per Part channel. Set it Off again.
2. **Scene CC = Off**: set Scene CC Off on the MIDI I/O screen, press SCENE 1-8, record the Parameter
   Change in the Monitor (Map › *Learn 2 moves*). Restore Scene CC 92.
3. **FS Assign**: read the factory value; set it to an unused CC (1-95); press the pedal; Live ›
   *Learn* must capture it and each press must step a slot. Also settle the menu path:
   `docs/CONTROLLER-REMOTE.md` says *Settings › Controller*, `docs/MODX-MIDI-REFERENCE.md` says
   *Settings › MIDI I/O*.
4. **Assign knob transmit**: select a Part (not Common), turn knobs 1-8, expect CC 17-24 on that
   Part's channel.
5. **Watch the panel** while the deck's SysEx toggles fire (Arp, MS, mute, keyboard control, Part arp).
6. **Super Knob SysEx write** `30 4B 00` from the Master page.
7. **Live Set slot**: select a user Live Set bank on the panel, load a soundLAB Live slot that holds a
   MODX slot (MSB 62 / LSB page / PC slot); the synth must jump there.
8. **Read name from synth** after a *panel* Performance change: expect the name filed under the Hub's
   assumed program (a known limitation, not a bug to fix).

Afterwards: switch the arpeggiator master back if it is not wanted (it was left ON on 2026-10-24).

### 5.3 iPad

1. Install "Web MIDI Browser" or "MIDIWeb Browser" (named by `js/synthtab.js`).
2. Connect the MODX through a USB camera adapter; open the live site.
3. Run Synth › Deck and Live at 768 × 1024: Connect, strips, chips, Scenes, Go live, Lock, Panic.

### 5.4 LUMI follow-ups (`rec:20261025T0100Z-lumi-check-claude.md`)

1. **Colour calibration**: one daylight, straight-on photo of the 24-key sweep (notes 60..83 at
   velocity 1..127) to replace the archived `colourLookup`.
2. **Device id**: find whether the unit answers 0x37 or 0x00 (both are sent today).
3. **Brightness steps**, by eye.
4. **"Relight after you play" switch**: give it a home in Lights & help (the API exists only on
   `check/lumi-claude`).
5. **benob LittleFoot program** (true per-key RGB): needs ROLI Dashboard over USB, which the laptop
   could not do.

### 5.5 Helix Stadium over USB on firmware 1.4 (the blocked item of "Helix controls and sound lab")

Needs `feat/helix-deck` checked out on a Windows PC with Node (`feat/helix-deck:docs/HELIX-USB.md`,
`.../docs/HELIX-DECK.md`).

1. Update the pedal to 1.4.x with the Line 6 app. Matt agreed on 2026-10-26; the update cannot be
   undone (`rec:20261026T0400Z-helix-deck-phase1-claude.md`).
2. Turn on *Global Settings › Remote Access* (Require PIN off for the first test); plug in USB.
3. *Device Manager › Network adapters* shows a UsbNcm / NCM adapter. If the pedal shows only under
   *Other devices*, Windows did not bind NCM: stop and note the entry.
4. `ipconfig /all` shows an `fd..` IPv6 address on that adapter; the pedal is `<prefix>::1`.
5. `Resolve-DnsName p35x1.local` (optional).
6. `node tools/helix-bridge.js -v` logs `usb: Helix answered on fd…::1 via <adapter>`, then ports
   2001 / 2002 / 2003 open.
7. Helix page: the **USB** badge turns green; the Now bar says *via USB*.
8. `powershell -NoProfile -ExecutionPolicy Bypass -File tools/helix-usb-inventory.ps1 -Json` for the
   record.
9. Re-check Edit › Blocks / Presets (fw 1.4 may change `/EditBufferStateGet`, `/GetContentRef` or the
   snapshot order).
10. The alternative the chat offered: if the pedal is on Wi-Fi without the update, the bridge works over
    the LAN (`node tools/helix-bridge.js [ip]`).

### 5.6 Other Helix MIDI checks (`docs/HELIX-STADIUM.md`)

Setlist CC32 = 5 + position; a favourite recall with a snapshot (CC32 → 30 ms → PC → 300 ms → CC69);
the arm / disarm flow; *Send MIDI PC* / *Send Snapshot CC* echo so tiles follow the footswitches;
null's pending "CC9 = 14 twice toggles the Preset List"; the Matrix mixer (fw 1.4).

### 5.7 Android APK

1. Install `releases/soundLAB-alpha.apk` (0.75.0).
2. USB: with a USB-OTG cable to the MODX, Settings › MIDI lists it, notes play, and the Deck works
   through the single shared output (picking the synth turns the LED mode off, `docs/SYNTH-TAB.md`).
3. Bluetooth: Lights & help › *Find a Bluetooth keyboard* finds the LUMI within 10 s and reconnects
   it at the next launch.

### 5.8 Practice router (`docs/PRACTICE-ROUTER.md`)

1. MODX Local Control OFF; Hub Thru off; release keys and pedal.
2. Keys › LUMI: answer input = MODX, display = LUMI, sound out = MODX-1, Scale lock on.
3. Out-of-scale keys stay silent; in-scale keys keep pitch, velocity and channel.
4. Local Control back ON afterwards.

## 6. Pitfalls and their fixes

| # | Pitfall | Fix / rule | Source |
|---|---|---|---|
| 1 | **The MODX clock ate taps.** ~36 F8/s + FE rebuilt the Deck's chips, Scenes and slots on every message (120 rebuilds in 5 s) | 1.3.1: `morph()` updates in place; repaint only on CC / Program Change / SysEx (`js/synthtab.js`). Real-MODX confirmation still open (5.1) | PR #91; `30db09d` |
| 2 | **The Synth tab never asked for MIDI**: first visits refused silently | Connect panel (unsupported / off / busy / denied / noout / lumi) + silent reconnect via `midi.wanted` or `permissions.query` | PR #91; `c29ee0b`; `docs/SYNTH-TAB.md` "Connecting" |
| 3 | **Doubled sound**: soundLAB's piano replayed every note the MODX already sounds | 0.78.1: `midi:note {mute: true}`; Settings switch `midi.appSound`; the Hub holds `mute('midihub')` while open | `91213cc` |
| 4 | **Doubled notes with Thru + Local Control ON** | Local Control OFF on the synth (soundLAB never sends CC 122), or leave Thru off | `docs/PRACTICE-ROUTER.md`; `docs/EXTERNAL-MIDI-COVERAGE.md` |
| 5 | **"Microsoft GS Wavetable Synth" taken for the synth** | Excluded from Hub auto-out (`NOT_SYNTH_RE`), the deck's port list and the Helix allow-list | `js/midihub.js`; `js/synthdeck.js` |
| 6 | **Key lights are note-ons**: lights on a non-LUMI output make the synth *play* them | Hub warning keyed on the OUTPUT name; on Android / iOS (one output) picking the synth turns the LED mode off | `js/midihub.js`; `docs/SYNTH-TAB.md` |
| 7 | **The LUMI must never receive synth messages** | The deck refuses LUMI-named outputs even when "Same as key lights" is chosen (`txCheck`); Thru never forwards to a LUMI; splits match the LUMI *input* only | `js/synthdeck.js`; `js/midihub.js`; `docs/SYNTH-DECK.md` |
| 8 | **A CC sent with a Program Change is lost** | 250 ms settle (`deck.settleMs`); Live slots send bank / program → settle → values | `e6ce52c:docs/MODX-MIDI-REFERENCE.md` |
| 9 | **The panel transmits nothing** for ARP / MS / Part edits or Performance changes, and the synth never echoes a Parameter Change, so Learn cannot capture SysEx toggles | Confirm by Parameter Request readback; use *Read name from synth* after a panel change | `e6ce52c` |
| 10 | **`main`'s docs and map are stale vs the hardware** (footer, identity, `31 6p 00`, MS Hold "momentary", "gate not yet run", "127 white") | Merge the check branches (section 7) | "Read this first" |
| 11 | **Mouse wheel over a big knob** turned it (CC 7 / 74 down, the synth went quiet) | 0.80.1 / 0.81.1: the wheel turns only a focused knob; `tests/midihub-wheel.test.js` | `93983e2`; `e9426ce` |
| 12 | **LUMI config frames wipe lit keys**: a MODX plugging in = 4 port events = 48 frames = a dark keyboard | Send mode / brightness frames only on change, then relight all. **Only on `check/lumi-claude`**; `main` only skips when already 'night' | `a9a243d` |
| 13 | **A pressed LUMI key loses its light for good** | Re-send its colour on the LUMI's own note-off (`lights.relight`, `holdRelight(owner)`), 0 ms delay (60 ms felt obstructive). **Unmerged** | `a9a243d` |
| 14 | **A stale stored `midi.outputId` blocked the LUMI auto-pick** | The LUMI stands in; the stored choice is kept. **Unmerged** | `a9a243d` |
| 15 | **LUMI device id unknown (0x37 vs 0x00)** | Send both, every frame | PR #64 |
| 16 | **SysEx permission declined silently**, so LUMI colours never arrive | Settings shows the SysEx status + *Push to LUMI now*; Web MIDI asks `sysex: true` first | PR #53 |
| 17 | **Bluetooth MIDI invisible on Windows** (WinMM) | `--enable-features=MidiManagerWinrt` on the command line (the launcher does it); chrome://flags did not take; close the browser fully once | `releases/soundLAB-windows.bat`; `rec:20261025T0100Z-lumi-check-claude.md` |
| 18 | **LUMI over USB fails with Code 10** on the laptop | Use Bluetooth | same record |
| 19 | **Bluetooth MIDI = one host**; the MODX's USB TO DEVICE is storage only | The computer or phone is the hub: LUMI (Bluetooth) → Hub Thru + split Rules → MODX (USB). A Bluetooth-to-DIN dongle loses the lights | same record; CLAUDE.md android/ entry |
| 20 | **Playwright's Chromium 131 crashes on any send to the MODX** (laptop) | Test hardware with an installed Chrome / Edge | `rec:20261027T0000Z-release-1.3.1-claude.md` |
| 21 | **One program per MIDI port on Windows** | Close the DAW / other apps holding `MODX-1` | `js/midihub.js` profile notes |
| 22 | **The iOS bridge drops sends of 200 bytes or more** | Short frames are fine (deck SysEx 11 bytes, LUMI frames); large raw SysEx from the Hub will not go out on iOS | `ios/Sources/MIDIBridge.swift` |
| 23 | **Native bridges have ONE output** | The Hub's "Synth out" and the practice router's three-port routing are Web MIDI only | `docs/PRACTICE-ROUTER.md`; `docs/EXTERNAL-MIDI-COVERAGE.md` |
| 24 | **Pitch bend from a LUMI bent everything** | 0.75.1: bend off by default; Off / ±2 / ±12 / ±48 in Settings | PR #78 |
| 25 | **Helix CCs could reach a MODX or LUMI** through the shared output | Port allow-list rechecked before every send; disarmed by default; 90 s arm window | `js/helix.js`; `docs/HELIX-STADIUM.md` |
| 26 | **Helix: a CC that beats a preset change is ignored** | Recall = CC32, PC 30 ms later, snapshot 300 ms after | `docs/HELIX-STADIUM.md` |
| 27 | **Helix fw 1.1 USB carries no editor protocol** | LAN bridge; on fw 1.4 the NCM link (`feat/helix-deck`) | `docs/HELIX-STADIUM.md` |
| 28 | **Port 4590 was the laptop's Desktop launcher**; a preview server there replaced Matt's app | Moot without the laptop; preview on other ports | `rec:20261022T1700Z-release-0800-claude.md` |
| 29 | **`pages-deploy` / `release-workflow` suites fail on a Windows checkout** (CRLF) | Run them on Linux or CI | `rec:20261026T0600Z-release-1.3.0-claude.md` |

Doc drift to fix while merging: the FS Assign menu path (5.2 item 3); `ios/README.md` says Android has
no MIDI (wrong since PR #77); `docs/SYNTH-TAB-PLAN.md` lists MSB 62 Live Set recall as checked on the
hardware with no test on record; `docs/RELEASE-1.3-CHECKLIST.md` section 6 says "PRs open"; and even
`e6ce52c:docs/MODX-MIDI-REFERENCE.md` still gives the old bulk footer `0F 00 00` in its research
"BULK blocks" row and in step 2 of its dump recipe (only its new "Checked on the MODX8+" table says
`0F 25 00`), so correct those two lines when the branch lands.

## 7. Bringing the hardware findings onto `main`

Trial merges (read-only `git merge-tree`, 2026-11-02):

| Branch | Into `main` `129720b` | Into PR #90 `bc47da5` | Stamps it carries |
|---|---|---|---|
| `check/modx-maps-claude` `e6ce52c` | clean | clean | none changed (based on 1.2.0) |
| `check/lumi-claude` `5cdc826` | conflict in `tests/run.sh` only | conflict in `tests/run.sh` only (keep both suite lists; add `lumi-firmware`) | none changed |

Plan: open one PR per branch (or port both onto the next release branch), resolve `tests/run.sh`, run
the MIDI suites (`lights lumidisplay colors keys lumi-practice midi-ports multiin display-master
lumi-contexts practice midihub synthdeck synthdeck-scope lumi-firmware`), then fix the doc drift above.
Whoever stamps the release follows [DEV-HANDBOOK.md](DEV-HANDBOOK.md) 4.4. Until then, **do not delete
either branch**.

## 8. Where each feature lives in the code

| Feature | Code | Doc | Suites |
|---|---|---|---|
| The MIDI service (ports, backends, dispatch, bend, app-sound mute, `sendTo`, `bindMusicalOutput`, the keybed / LUMI lights; the remote's input claim on PR #90) | `js/midi.js` | CLAUDE.md midi.js entry; [NOTE-PALETTE.md](NOTE-PALETTE.md) | `midi-ports`, `midi-ingress`, `multiin`, `lights`, `lumidisplay`, `colors`, `display-master`, `lumi-contexts` |
| MIDI Hub (Deck host, Keys, CCs, Rules + key splits, SysEx builders, Monitor, Learn, Player) | `js/midihub.js` | CLAUDE.md midihub.js entry | `midihub`, `midihub-lock`, `midihub-wheel`, `midihub-player` |
| Synth Deck (knobs, buttons, sound library, Read name, Map + Learn, one tx funnel) | `js/synthdeck.js` | [SYNTH-DECK.md](SYNTH-DECK.md) | `synthdeck` |
| Device maps (generic / yamaha / roland, confidence per entry) | `js/synthdeck-maps.js` | [MODX-MIDI-REFERENCE.md](MODX-MIDI-REFERENCE.md) | `synthdeck` |
| Scope (note roll, CC lanes, clock) | `js/synthdeck-scope.js` | SYNTH-DECK.md | `synthdeck-scope` |
| Synth tab Deck page + connect panel | `js/synthtab.js` (page `deck`) | [SYNTH-TAB.md](SYNTH-TAB.md) | `synthtab`, `synthconnect`, `synthconn` (PR #90) |
| Live sets, foot switch, Go live, profiles | `js/synthlive.js` (page `liveset`) | SYNTH-TAB.md | `synthtab` |
| MODX factory names | `data/modx-performances.json` | SYNTH-DECK.md | `synthdeck` |
| Scale-locked synth sound for LUMI practice | `js/practice-router.js` | [PRACTICE-ROUTER.md](PRACTICE-ROUTER.md) | `practice-router` |
| LUMI practice page | `js/lumi-practice.js` | [LUMI-PRACTICE.md](LUMI-PRACTICE.md) | `lumi-practice` |
| Hear input ("Line (MODX)") | `js/audioin.js` | CLAUDE.md audioin.js entry | `audioin` |
| MIDI settings, app-sound switch, WinRT hint | `js/settings.js` | | `btmidi`, `smoke` |
| Controller remote (PR #90 only) | `js/remote.js` | [CONTROLLER-REMOTE.md](CONTROLLER-REMOTE.md) | `remote`, `remote-*` |
| Android bridge | `android/src/com/mreindl/soundlab/MidiBridge.java`, `MainActivity.java` | CLAUDE.md android/ entry | `btmidi`, `update` (with `AAPT`) |
| iOS bridge | `ios/Sources/MIDIBridge.swift`, `GuitarLabApp.swift` | [ios/README.md](../ios/README.md) | none on hardware |
| Windows launcher | `releases/soundLAB-windows.bat` | | |
| Helix page and bridge | `js/helix.js`, `tools/helix-bridge.js`, `tools/helix-defs.json` (+ `js/helix-deck.js`, `helix-map.js`, `helix-routes.js` on `feat/helix-deck`) | [HELIX-STADIUM.md](HELIX-STADIUM.md) | `helix` (+ `helix-deck`, `helix-bridge-usb` on the branch) |

## 9. State left on the devices, and what went with the laptop

- **MODX8+**: the arpeggiator master was left **ON** after the 2026-10-24 check; the Performance was
  reloaded with MSB 64/0/PC 1 ("CFX + FM EP 2"); nothing was stored
  (`rec:20261025T0010Z-modx-check-claude.md`).
- **Helix**: the edit buffer was left changed and **unsaved** on 2026-10-22: Volume Pedal
  (`HD2_VolPanVolMono`) at 0.45 instead of 0.4523; no corrective write was authorized
  (`rec:20261022T2023Z-helix-unsaved-edit-claude.md`). A preset reload clears it.
- **Lost with the laptop** (not in any repo): the uncommitted changes of the chat's worktrees; the
  side note `20261024T2130Z-modx-gate-handover-claude.md` from the second MODX session (its findings are
  in `e6ce52c`); the "Desktop soundLAB" launcher on port 4590; null's Stadium Local Control server.
  Full list: [CHATS-AND-HISTORY.md](CHATS-AND-HISTORY.md) section 6.
