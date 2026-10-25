# 20261025T0010Z modx-check (Claude)

- Objective: make the Synth Deck's MODX maps true to Matt's MODX8+ — re-tag
  `js/synthdeck-maps.js` entries verified / corrected with
  `src: "checked on MODX8+ 2026-10-24"`, record what differed from the
  documentation in `docs/MODX-MIDI-REFERENCE.md` and `docs/SYNTH-DECK.md`,
  keep `tests/synthdeck.test.js` and `tests/synthdeck-scope.test.js` green.
- Authorization: Matt, 2026-10-24 (the pasted brief; "Do it here" in the
  "Yamaha MOD8X MIDI USB controller" session). No pushes, no release stamps,
  no artifact publishing; LUMI never receives synth messages.
- Owner / sole record writer: Claude (this session). Matt chose this session
  to finish the check when a second session, "Check the Synth Deck on the
  MODX8+ (hardware)" (local_8aeeb5d5), turned out to be running the same
  brief; that session stopped sending, made no repo edits and handed over its
  findings (side-session note `20261024T2130Z-modx-gate-handover-claude.md`;
  its worktree `.claude/worktrees/modx-gate`, branch `worktree-modx-gate`,
  clean at main, zero commits — safe to remove). Credit for the readback /
  dump-diff evidence below goes to that session.
- Repository: mreindl118-boop/GuitarPak. Branch `check/modx-maps-claude`,
  worktree `C:\Users\mrein\AppData\Local\Temp\sl-modx`, base `main` 358d204
  (1.2.0). Not pushed.
- Changed paths: `js/synthdeck-maps.js`, `docs/MODX-MIDI-REFERENCE.md`
  (new section "Checked on the MODX8+ (2026-10-24)"), `docs/SYNTH-DECK.md`
  (hardware gate results), `tests/synthdeck.test.js` (one assertion: the
  31 6p 00 example is verified now, so no "unverified" toast), this record.
- Setup: MODX8+ on USB (MIDI IN/OUT = USB, Multi mode), Chrome 152 (Claude in
  Chrome) with Web MIDI + SysEx on localhost:4573 (1.2.0 = main 358d204), Hub
  profile yamaha, Synth out MODX-1. The LUMI was a Bluetooth input only; no
  deck message went to it (the deck refuses LUMI-named outputs anyway).
  Matt pressed the panel; this session tapped `midi:raw` for everything the
  synth sent. The other session's method: write, Parameter Request readback,
  bulk-dump byte diff, restore.

## Results against the brief

1. Monitor / transmit: SCENE 1-8 -> CC 92 ch 1 values 0/16/32/48/64/80/96/112
   (bands confirmed). A.SW1 / A.SW2 -> CC 86 / 87 (127 press, 0 release) on
   every keyboard-control Part channel (ch 1-3). MSEQ HOLD -> CC 88 127 then 0
   on the next press (a latch). MSEQ TRIGGER -> CC 89 127/0. Super Knob ->
   CC 95 ch 1. Assign knobs: with Common selected and ASSIGN lit the panel
   knobs 1-4 transmit Parameter Changes 30 40 53/54/55/56 (Common Assign Knob
   values), not CC; CC 17-24 need a Part selected (not reached on the panel;
   receive side verified: CC 17-24 -> 31 0p 6A..71 by readback). With the
   TONE row lit a knob sent CC 74.
2. SysEx buttons: 30 47 03 arp master, 30 48 00 MS master, 31 0p 18 mute,
   31 0p 17 keyboard control and the unverified 31 6p 00 Part arp switch all
   take, read back (Parameter Request F0 43 30 7F 1C 07 addr F7) and restore
   by dump diff; the deck's Arpeggiator button sent exactly
   F0 43 10 7F 1C 07 30 47 03 01 F7 / ...00 F7. Nobody watched the panel for
   these (readback stands in). The panel's own ARP ON/OFF and MOTION SEQ
   ON/OFF buttons transmit NOTHING (readback showed the state changed); the
   synth never echoes a received Parameter Change (sent 30 47 03 01, listened
   600 ms). Active Scene: 30 4C 00 byte 0 = scene index, readable, NOT settable
   by Parameter Change; Scene CC = Off capture not done.
3. Settle: a CC in the same burst as the Program Change is lost; 25-400 ms all
   land; requests during the load are queued. 250 ms default kept. Read name
   from synth works (bulk 0E 25 00, block 30 40 00 = "CFX + FM EP 2") but files
   the name under the Hub's assumed program (63/0/1) — documented, no code
   change. MSB 63/0/PC 3 on ch 2 loads one Part ("CFX Stage" into Part 2),
   MSB 64/0/PC 1 on ch 1 the whole Performance — as docs/SYNTH-DECK.md says.
4. Clock Out was already on: F8 median gap 28 ms, Scope "Clock: synth 89.9
   BPM". Arp MIDI Out / arpeggio notes in the Scope: NOT tested.

## Differences from the documentation (what the maps and docs now say)

- Bulk footer block is 0F 25 00, not 0F 00 00.
- Device Inquiry model byte 0x6A (106) = MODX8+; added to the map's identity
  table (was 86/87/88 only).
- 31 6p 00 Part arp switch: unverified -> verified.
- Motion Seq Hold is a latch on the panel (127 / 0), not a momentary.
- Panel edits transmit nothing; no echo of received Parameter Changes
  (the research doc's "nothing is transmitted" is now confirmed, and Learn
  cannot capture the SysEx toggles — readback can).
- Common knobs transmit 30 40 53.. (new addresses), Part knobs CC 17-24.
- Checksum rule confirmed on all 189 blocks; byte count = model id .. last
  data byte.
- Receive map CC -> Part address (74->+50, 71->+51, 73->+46, 75->+47,
  72->+49, 91->+29, 7->+24, 10->+25, 5->+32, 65->+31, 17-24->+6A..71,
  95->30 4B 00); CC 93 left no trace (kept documented).

## Map tags changed (js/synthdeck-maps.js)

verified + "checked on MODX8+ 2026-10-24": hero (95), ex1-8 (17-24), main1-5
and main7-8 (74/71/73/72/91/7/10; main6 chorus 93 stays documented), scenes,
arpMaster, arpPart (was unverified), msMaster, msHold, msTrig, mute, kbdCtl,
porta, asw1, asw2, portaTime, decay (was documented), tgVol, superSx.
Unchanged: sus/sost/soft (standard CCs, not testable by dump), fs (still
unverified, no number), mod/breath/foot/expr/ribbon (no evidence either way).
identity gains 106: 'MODX8+'. Two notes added (panel transmits nothing /
readback; active scene readable only).

## Tests

`tests/synthdeck.test.js` 136 PASS, `tests/synthdeck-scope.test.js` 41 PASS
(NODE_PATH=C:\Users\mrein\AppData\Local\Temp\hxprobe\node_modules, served
from the worktree on 127.0.0.1:4595 by tests/serve.py). Also `tests/midihub.test.js` 45 PASS (sanity check, same server).

## State of the synth

Left as found except: the arpeggiator master is ON (Matt's last ARP ON/OFF
press, done on purpose for the readback test) and the Performance was
re-loaded by MSB 64/0/PC 1 during the other session's tests (dump diff
empty). Nothing stored on the synth.

## Open / next

- Arp MIDI Out + Scope arpeggio ladder; Scene CC = Off capture (Learn 2
  moves); FS Assign; Assign knob transmit with a Part selected — need Matt
  at the panel with Utility access.
- Read name from synth could store under the synth's real program when the
  Hub knows it (doc line added; no code change in this task).
- Version: any release of this branch must be stamped above whatever main
  has at that moment (APP_VERSION, version.json web only, sw.js CACHE); none
  done here.
