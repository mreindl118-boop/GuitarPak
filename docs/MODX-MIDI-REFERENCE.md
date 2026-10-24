# Yamaha MODX / MODX+ / MONTAGE MIDI reference (research notes)

Collected 2026-10-24 for the Synth Deck (js/synthdeck.js, js/synthdeck-maps.js) from public
sources — forum posts quoting the Data List, working code and user captures. Yamaha's own PDFs could
not be fetched by the research tooling, so every value carries a confidence; `unverified` entries are
not used as defaults that send. Nothing here was verified on the owner's MODX8+ yet: the Map tab's
MIDI Learn and the Monitor are the way to confirm a number on the real synth.

# Yamaha MODX / MODX+ / MONTAGE MIDI implementation — research notes

Date: 2026-10-24. Scope: facts needed by soundLAB's MIDI Hub (Yamaha profile) to build a remote-control surface for a MODX8+. Method: WebSearch + WebFetch only. Every Yamaha-hosted PDF (usa/uk/de/fr/br/fi/jp.yamaha.com, and web.archive.org) returns HTTP 403 to WebFetch, so the official Data List / Reference Manual could NOT be read directly; the tables below rely on (a) forum posts that quote the Data List with page numbers, (b) working code (arachsys Web MIDI scratchpad) and (c) user-confirmed byte captures. Anything not backed by one of those is marked UNVERIFIED.

Confidence key: high = official wording quoted, or a working capture/code; medium = consistent community reports; low = single unconfirmed post or inference.

## 0. Source documents (what exists, what could not be fetched)

| Document | URL | Status / notes |
|---|---|---|
| MODX6+/7+/8+ Data List (Rev A0, English, 5.2 MB) | https://usa.yamaha.com/files/download/other_assets/5/1583935/modx_plus_en_dl_a0.pdf | 403 to WebFetch. Authoritative for everything in sections 1-3. Per forum comparison it is content-identical to the MODX Data List Rev D0 (same 2227 Performances, same page layout, same documentation errors). |
| MODX6/7/8 Data List (Rev D0, English) | https://uk.yamaha.com/files/download/other_assets/2/1192592/modx_en_dl_d0.pdf (also usa.yamaha.com/files/download/other_assets/2/1192592/modx_en_dl_d0.pdf) | 403. Page numbers cited by forum users below (184, 187-191, 193-194, 196, 202, 211, 218-220) refer to this revision / the identical MODX+ A0. |
| MODX+ Reference Manual (Rev A0, English) | https://fr.yamaha.com/files/download/other_assets/4/1583934/modx_plus_en_rm_a0.pdf | 403. Holds the Utility > Settings > MIDI I/O, Advanced and Control Number screens with defaults. |
| MONTAGE Data List (Rev J0 = OS 3.5, English) | https://de.yamaha.com/files/download/other_assets/9/1341759/montage_en_dl_j0.pdf | 403. Same table structure as MODX (model ID 02 instead of 07). |
| MONTAGE Reference Manual (Rev B0) | https://fi.yamaha.com/files/download/other_assets/9/812529/montage_en_rm_b0.pdf | 403. |
| arachsys "Montage notes" (Chris Webb): SysEx notes + Web MIDI tools | https://arachsys.github.io/montage/ , https://arachsys.github.io/montage/sysex , https://github.com/arachsys/webmidi (montage/scratchpad.html) | Readable. Working code for MODX and MONTAGE bulk request / name parsing. |
| Data List errata thread (MODX, MODX+ and MONTAGE 3.50 share the same errors) | https://yamahamusicians.com/forum/threads/modx-modx-quality-issues-with-data-list-documents.20588/ | Readable. Checksum description wrong; Motion Seq lane bulk address misprinted. |

## 1. Default control-change numbers

Two places hold CC numbers. GLOBAL (Utility > Settings > MIDI I/O; saved in the User file .X7U, not per Performance): Super Knob CC, Scene CC, FS Assign. PER PERFORMANCE (Home > Edit > Common/Audio > Control > Control Number): Ribbon, Breath, FC1, FC2, Assign Switch 1/2, Motion Seq Hold/Trigger, Assign Knob 1-8. All are user-changeable; the selectable range is Off / 1-95 (CC 96-127 cannot be chosen). The per-Performance numbers are used for transmit AND receive (the manual: controllers that are not physical on the instrument "can be controlled by transmitting the corresponding MIDI control number from an external MIDI controller").

| Fact | Value | Source URL | Confidence | Notes |
|---|---|---|---|---|
| Super Knob CC default | 95 (Off / 1-95). Transmitted on MIDI ch 1 in Multi mode (the MIDI I/O channel in Single/Hybrid). "Off" = sends SysEx parameter change 30 4B 00 instead. | https://yamahasynth.com/?p=2453 ; https://yamahamusicians.com/forum/threads/modx-quick-setup-on-off.20290/ ; https://yamahasynth.com/community/montage-series-synthesizers/sequencing-the-movements-of-the-super-knob-in-an-external-sequencer | high | Global. Quick Setup "Standalone" resets it to 95. A "!" prefix in the UI marks a conflict with an Assign Knob CC. Added in MONTAGE fw 1.20. |
| Scene CC default | 92 (Off / 1-95). Value bands: 0-15 Scene 1, 16-31 Scene 2, 32-47 S3, 48-63 S4, 64-79 S5, 80-95 S6, 96-111 S7, 112-127 S8. Received/sent on ch 1. "Off" = SysEx parameter change. | https://yamahasynth.com/community/modx-series-synthesizers/assigning-control-change-numbers-to-scenes-on-montage-or-modx/ ; https://yamahasynth.com/forum/changing-scenes-on-montage-using-footswitch | high | Global. Pressing a SCENE button transmits CC92 with the band's value (a Cantabile user drives scenes with it in both directions). |
| Assignable Knob 1-8 (Common and Part) | CC 17, 18, 19, 20, 21, 22, 23, 24 | https://support.spectrasonics.net/manual/Omnisphere3HW/3/en/topic/setting-up-the-modx ; https://yamahasynth.com/community/montage-series-synthesizers/can-the-super-knob-control-an-external-device ; forum quote of MODX Data List Rev A0 p.184 at https://yamahasynth.com/community/modx-series-synthesizers/cc-to-trigger-assign-12-buttons/ | high | Per Performance. Knobs transmit CC only when a Part is selected (sent on that Part's channel); with Common selected they send SysEx. Part knobs moved indirectly by the Super Knob do NOT transmit. |
| Assignable Switch 1 / 2 (A.SW1 / A.SW2) | CC 86 / 87 | Data List Rev A0 p.184 quoted at https://yamahasynth.com/community/modx-series-synthesizers/cc-to-trigger-assign-12-buttons/ ; MODX8+ owner report https://yamahamusicians.com/forum/viewtopic.php?p=121979 | high | Per Performance. Receivable: a MODX8+ user drives Assign 1 with CC 86. Latch/momentary is a property of the panel button, not of incoming CC (value 127 = pressed). |
| Motion Seq Hold / Motion Seq Trigger | CC 88 / 89 | same p.184 quote | high | Per Performance. These are the [MSEQ HOLD] / [MSEQ TRIGGER] panel buttons. |
| Ribbon controller | CC 16 | https://yamahasynth.com/community/modx-series-synthesizers/why-so-many-ribbon-controller-assignments | medium | MODX has no ribbon; an incoming CC16 acts as the ribbon. |
| Breath controller | CC 2 | https://yamahasynth.com/community/montage-series-synthesizers/question-about-external-controllers-fc-and-bc (forum, not manual) | medium | No official quote found; standard MIDI breath. |
| Foot Controller 1 / Foot Controller 2 | CC 11 (Expression) / CC 4 (Foot Control) | https://yamahasynth.com/community/montage-series-synthesizers/fc7-cant-control-super-knob | medium | Per Performance. In the preset Performances FC2 is ASSIGNED (destination) to the Super Knob; that is a control-assign setting, not its CC number. |
| Foot Switch ("FS Assign") | Options: Off, 1-95, Arp SW, MS SW, Play/Stop, Live Set+, Live Set-, Oct Reset (Tap Tempo added by later firmware). Factory default UNVERIFIED (one forum table lists Arp SW; the Quick Setups use Arp SW). | https://yamahasynth.com/community/montage-series-synthesizers/yamaha-montage-fs-assign-footswitch-assign-control-number-live-set-page-update ; https://yamahasynth.com/?p=2453 | medium (options) / UNVERIFIED (default) | Global (Utility > Settings > MIDI I/O). When set to a number the pedal sends that CC (0 open / 127 closed). |
| Faders | MODX/MODX+ have no faders (4 control sliders). On MONTAGE, with a Part selected ([PART CONTROL]) fader n sends CC 7 Volume on Part n's channel; with Common selected the faders send SysEx. | https://yamahasynth.com/community/montage-series-synthesizers/can-the-super-knob-control-an-external-device | medium | For remote Part volume use CC7 on the Part's channel (Multi mode). |
| Front-panel Cutoff / Resonance knobs | CC 74 / CC 71 | https://yamahasynth.com/forum/built-in-control-change-responses | medium | Received as offsets on the Part's channel. |
| "Arp/MS On/Off" CC | No CC exists for Arp master, Arp Part switch or MS master. Only the physical foot switch can be assigned "Arp SW"/"MS SW". Use SysEx (section 2). | https://yamahasynth.com/community/montage-series-synthesizers/external-midi-controller-performance-change (search summary) | medium | Scenes can memorise Arp/MS Select, so Scene CC 92 is the CC-only way to change arps remotely. |
| Keyboard hold (sustain), Portamento | Fixed standard CCs: Hold/Sustain 64, Portamento Switch 65, Portamento Time 5, Mod wheel 1, Volume 7, Pan 10, Expression 11. Not in the Control Number list. | Data List section 3-1-3 "Control Change" (p.184 MODX / p.187 MONTAGE) per https://yamahasynth.com/forum/built-in-control-change-responses | medium | "Keyboard Hold" is not a MODX setting name; treated as CC64. |
| CC range cap | A controller can be set only to 1-95; CC 96-127 unavailable | https://yamahasynth.com/community/montage-series-synthesizers/montage-fs-assign-arp-sw-to-scene-or-live-set/ (search summary) | high | Affects the Hub's mapping UI. |
| Channel of controller output | Super Knob / Scene / Common knobs: ch 1 in Multi mode; Part knobs: the selected Part's channel; Single/Hybrid: the MIDI I/O channel | https://yamahamusicians.com/forum/threads/modx-quick-setup-on-off.20290/ | medium | |

## 2. Arp / Motion Seq / Scenes / Parts over MIDI: SysEx formats and addresses

### 2a. Message formats (MODX / MODX+ model ID 07; MONTAGE classic 02; MONTAGE M / MODX M use a different model ID and FOUR address bytes, so nothing below applies to them)

| Fact | Value | Source URL | Confidence | Notes |
|---|---|---|---|---|
| Parameter Change | `F0 43 1n 7F 1C 07 aH aM aL dd [dd...] F7` (n = device number, 0 by default; the MODX answers any device number unless Utility > Settings > Advanced > Device Number is changed) | https://yamahasynth.com/community/modx-series-synthesizers/how-to-change-part-via-sysex-58083 ; https://yamahasynth.com/community/modx-series-synthesizers/control-code-for-midi-to-transpose-modx | high | Data List "Native Parameter Change, Mode Change" p.188 (MODX). Multi-byte parameters send all bytes. |
| Parameter Request | `F0 43 3n 7F 1C 07 aH aM aL F7` -> the MODX replies with the Parameter Change above | https://arachsys.github.io/montage/sysex ; https://yamahasynth.com/community/modx-series-synthesizers/modx-sysex-further-applications | high (MONTAGE), medium (MODX) | Used by forum members to read undocumented registers on MODX too. |
| Bulk Dump Request | `F0 43 2n 7F 1C 07 aH aM aL F7` | https://raw.githubusercontent.com/arachsys/webmidi/master/montage/scratchpad.html | high | Working MODX code: `f0 43 20 7f 1c 07 0e 25 00 f7`. |
| Bulk Dump (reply / send) | `F0 43 0n 7F 1C bb bb 07 aH aM aL dd ... cc F7` ; bb bb = 7-bit big-endian byte count; cc = checksum | https://yamahasynth.com/community/modx-series-synthesizers/how-to-change-part-via-sysex-58083 ; errata https://yamahamusicians.com/forum/threads/modx-modx-quality-issues-with-data-list-documents.20588/ | high | The Data List's checksum text is WRONG. Correct rule (verified against the example `F0 43 00 7F 1C 00 04 07 0E 52 00 19 F7`: 07+0E+52+00 = 0x67, (-0x67) & 0x7F = 0x19): checksum = two's complement of the sum from the MODEL ID byte through the last data byte, low 7 bits; the byte count is NOT included. In that example the count is 4 for a header block with no data (it seems to span model ID + 3 address bytes; verify on p.193 before generating dumps). |
| Universal Device Inquiry | Send `F0 7E 00 06 01 F7`; reply `F0 7E 7F 06 02 43 00 41 mm 06 vv ...` ; mm = 0x56 MODX6, 0x57 MODX7, 0x58 MODX8; 0x4E/0x4F/0x50 MONTAGE 6/7/8; the scratchpad derives the version as 1.0 + 0.1*byte[10] | https://raw.githubusercontent.com/arachsys/webmidi/master/montage/scratchpad.html | high (MODX/MONTAGE) | MODX+ model bytes UNVERIFIED (may equal the MODX's). Useful for the Hub's auto-profile. |
| Nothing is transmitted when a parameter changes on the panel (apart from controllers set to CC/SysEx) | "Nothing. You must poll the edit buffer." | https://yamahasynth.com/community/modx-series-synthesizers/external-hardware-controller-for-fm-x-programmingdesign/paged/2 | medium | A live visualiser must poll (bulk 0E 25 00 or parameter requests). |

### 2b. Address map (3-byte, MODX/MODX+ unless stated). p = Part 1-16 as 0-F.

| Area | Address | Parameter | Value | Source URL | Confidence |
|---|---|---|---|---|---|
| SYSTEM (aH 00) | 00 00 00 | Tone Generator (master) volume | 00-7F, default 7F | https://yamahasynth.com/community/modx-series-synthesizers/how-to-change-part-via-sysex-58083 (Data List "MIDI PARAMETER CHANGE TABLE (SYSTEM)") | high |
| SYSTEM | 00 00 01 | Note Shift | 40 = 0 | https://yamahasynth.com/community/modx-series-synthesizers/control-code-for-midi-to-transpose-modx | medium |
| SYSTEM | 00 00 07 | Keyboard Transpose | 35-4B (40 = 0), -11..+11 | same (poster confirmed working; Data List p.194) | high |
| SYSTEM | 00 00 30 | "MIDI Mode" (Single/Multi/Hybrid) | value map UNVERIFIED | https://yamahasynth.com/community/modx-series-synthesizers/how-to-send-sysex-commands-to-modx/paged/2 (Data List p.194) | low |
| SYSTEM | 00 00 xx | Local Control, MIDI Sync, Clock Out, Arp MIDI Out, Super Knob CC no., Scene CC no., FS Assign | in the SYSTEM table p.194 but low bytes UNVERIFIED | (none) | UNVERIFIED |
| SYSTEM (undocumented) | 00 06 00-2B | DAW Remote (MONTAGE 2.5+) | (none) | https://yamahamusicians.com/forum/threads/undocumented-modx-midi-parameter-addresses.20436/ | low |
| SYSTEM (undocumented) | 00 7F 00-03 | read-only flags (appear in dumps since MODX OS 2.0) | (none) | https://yamahasynth.com/community/modx-series-synthesizers/modx-sysex-further-applications | low |
| LIVE SET | 09 00 00 | Active Live Set bank | 00 preset, 01-08 user 1-8, 09.. library | https://yamahasynth.com/community/modx-series-synthesizers/sysex-to-change-live-set-bank-and-page (confirmed on MODX: `F0 43 10 7F 1C 07 09 00 00 01 F7`) | high |
| LIVE SET | 09 00 01 | Store current Live Set bank (any value) | undocumented | https://yamahamusicians.com/forum/threads/undocumented-modx-midi-parameter-addresses.20436/ | low |
| LIVE SET | (none) | Live Set PAGE select by SysEx | not found by anyone; use Bank 62 program change (changes the sound too) | same thread | high (that it is unknown) |
| PERFORMANCE COMMON (aH 30) | 30 40 00 .. 30 40 13 | Performance Name, 20 ASCII bytes, space padded | text | https://raw.githubusercontent.com/arachsys/webmidi/master/montage/scratchpad.html (name block matched at `30 40 00`, bytes 11..31 of the bulk block) | high |
| PERF COMMON | 30 40 5B | Swing offset | 08-78 | https://yamahasynth.com/community/modx-series-synthesizers/how-to-send-sysex-commands-to-modx/paged/2 | low |
| PERF COMMON | 30 42 45 / 30 42 47 | Variation Pan / Variation Switch | 01-7F / 0-1 | same (Data List p.202) | low |
| PERF COMMON | 30 47 03 | Arpeggio Master Switch | 0 off / 1 on | https://yamahasynth.com/community/montage-series-synthesizers/sysex-parameter-change-mystery (Data List; MONTAGE capture `43 10 7F 1C 02 30 47 03 01`, confirmed working) | high (MONTAGE) / medium (MODX) |
| PERF COMMON | 30 48 00 | Motion Seq Master Switch | 0 / 1 | same thread (Data List) | medium |
| PERF COMMON | 30 4B 00 | Super Knob Value | 00-7F | same thread; capture `F0 43 10 7F 1C 02 30 4B 00 39 F7` (https://yamahasynth.com/community/montage-series-synthesizers/superknob-controller-on-ableton-live-setup-sysex) | high |
| PERF COMMON | 30 4B 11 | Super Knob LED pattern | 00-11 | https://yamahasynth.com/community/modx-series-synthesizers/how-to-send-sysex-commands-to-modx/paged/2 (Data List p.202) | low |
| SCENE common (undocumented in the classic Data List) | 30 4C 0C / 0D / 0E / 0F | Scene 1: Kbd Ctrl Memorize Sw / Super Knob Link MSB (bit0 = knob 8) / Super Knob Link LSB (bits 0-6 = knobs 1-7) / Super Knob Link Memorize Sw; "accordingly for Scene 2-8" (stride not stated) | 0/1, bitmasks | https://yamahamusicians.com/forum/threads/modx-montage-midi-parameter-addresses-for-scene-keyboard-control-and-scene-super-knob-link.20453/ | medium |
| SCENE select (active scene 1-8) | UNVERIFIED | The panel sends a Parameter Change when Scene CC = Off; capture it with the Hub monitor to learn the address | (none) | https://yamahasynth.com/?p=2453 | UNVERIFIED |
| SCENE part | 36 sp 0D (s = scene 0-7, p = part 0-F; written "cp" in the post) | Scene Keyboard Control Switch per Part | 0/1 | same yamahamusicians 20453 thread | medium |
| PERFORMANCE PART (aH 31, aM 0p) | 31 0p 00 .. 13 | Part Name (20 ASCII); the whole Part-common block is 0x79 bytes | text | https://yamahasynth.com/community/montage-series-synthesizers/how-to-change-part-via-sysex-52668 (Data List i0 p.211) | medium |
| PERF PART | 31 0p 17 | Keyboard Control Switch | 0/1 (Parts 9-16 fixed 0) | https://yamahasynth.com/community/modx-series-synthesizers/how-to-change-part-via-sysex-58083 (confirmed working on MODX) | high |
| PERF PART | 31 0p 18 | Mute Switch | 0/1 | Yamaha specialist example `F0 43 10 7F 1C 07 31 00 18 01 F7` (https://yamahasynth.com/community/modx-series-synthesizers/how-to-send-sysex-commands-to-modx/paged/2) ; Data List p.199 (MONTAGE D0) | high |
| PERF PART | 31 0p 24 | Volume (?) | 00-7F | one screenshot label "(PERFORMANCE PART) Volume" with a malformed example (https://yamahasynth.com/community/modx-series-synthesizers/project-from-scratch) | low; verify p.199-201 |
| PERF PART | 31 0p ?? | Pan, Part Switch, Arp Select 1-8, Motion Seq Select 1-8 | UNVERIFIED | Data List "MIDI PARAMETER CHANGE TABLE (PERFORMANCE PART)" | UNVERIFIED |
| PERF PART | 31 2p 00-43 | Insertion A parameters (31 2p 17 = param 11, e.g. side-chain level) | (none) | https://yamahasynth.com/community/modx-series-synthesizers/project-from-scratch | low |
| PERF PART | 31 5p 09 / 0A / 0B | Bank MSB / Bank LSB / Program (unconfirmed poster; use real Bank Select + PC instead) | (none) | https://yamahasynth.com/community/modx-series-synthesizers/how-to-change-part-via-sysex-58083 | low |
| PERF PART ARP | 31 6p 00 | Part Arpeggio Switch (example Part 3: `F0 43 10 7F 1C 07 31 62 00 01 F7`) | 0/1 | same thread (not confirmed by others) | low-medium |
| MOTION SEQ | 34 1p 00 | Motion Seq Part/Lane bulk block (the Data List misprints 31 1p 00) | (none) | https://yamahamusicians.com/forum/threads/modx-modx-quality-issues-with-data-list-documents.20588/ | medium |
| ELEMENT / DRUM / FM-X | 41 pe xx (Normal Part p, Element e); 5p kk 06 drum key wave no. (2 bytes); FM-X operator tables with aM = (operator << 4) + part | (none) | https://yamahasynth.com/community/modx-series-synthesizers/project-from-scratch ; https://yamahasynth.com/community/modx-series-synthesizers/external-hardware-controller-for-fm-x-programmingdesign/paged/2 (Data List p.219-220) | low-medium |
| undocumented | 64 0p 00 | Part mute (alternative, tested on MONTAGE only) | 0/1 | yamahamusicians 20436 | low |
| BULK blocks | 0E 25 00 | Current Performance (edit buffer): the request returns a header block (0E 25 00), all data blocks, and a footer block (0F 00 00) | (none) | arachsys scratchpad (works on MODX) ; https://arachsys.github.io/montage/sysex | high |
| BULK | 0E 51 00 / 0E 54 0p | Current Live Set bank (16 pages) / Live Set page p | (none) | yamahamusicians 20436 ; Data List p.193 | medium |
| BULK | 0E 52 00 | shown in a forum header example (`F0 43 00 7F 1C 00 04 07 0E 52 00 19 F7`) as a "Performance bulk header"; conflicts with 0E 25 00; treat as unknown | (none) | how-to-change-part-via-sysex-58083 | low |
| BULK (MONTAGE) | 0A 00 00 (1 byte), 0B 00 00 (8 bytes, firmware/version info), 0C 00 nn song nn, 0C 40 nn pattern nn, 0D 00 00 song list, 0D 40 00 pattern list | (none) | https://arachsys.github.io/montage/sysex | medium (MONTAGE) / low (MODX) |

### 2c. Byte-level examples (device 0, MODX/MODX+ model 07)

| Action | Bytes | Confidence |
|---|---|---|
| Arp master ON | `F0 43 10 7F 1C 07 30 47 03 01 F7` | medium-high |
| Motion Seq master OFF | `F0 43 10 7F 1C 07 30 48 00 00 F7` | medium |
| Super Knob to 64 | `F0 43 10 7F 1C 07 30 4B 00 40 F7` | high |
| Part 3 Keyboard Control OFF | `F0 43 10 7F 1C 07 31 02 17 00 F7` | high |
| Part 1 Mute ON | `F0 43 10 7F 1C 07 31 00 18 01 F7` | high |
| Part 3 Arp switch ON | `F0 43 10 7F 1C 07 31 62 00 01 F7` | low-medium |
| Live Set bank = User 1 | `F0 43 10 7F 1C 07 09 00 00 01 F7` | high |
| Keyboard transpose -1 / reset | `F0 43 10 7F 1C 07 00 00 07 3F F7` / `F0 43 10 7F 1C 07 00 00 07 40 F7` | high |
| Master volume max | `F0 43 10 7F 1C 07 00 00 00 7F F7` | high |
| Read Super Knob value | `F0 43 30 7F 1C 07 30 4B 00 F7` (reply: parameter change with the value) | medium |
| Request current Performance | `F0 43 20 7F 1C 07 0E 25 00 F7` | high |

### 2d. Reading the current Performance NAME (bulk dump request + reply)

1. Send `F0 43 20 7F 1C 07 0E 25 00 F7`.
2. Collect every incoming message that starts `F0 43 00 7F 1C bb bb 07 aH aM aL ...`. The first is the header (address 0E 25 00); the last is the footer (address 0F 00 00). (arachsys matches `f0 43 00 7f 1c ?? ?? 07 0e 25 00` and `... 07 0f 00 00`.)
3. The block whose address is `30 40 00` is Performance Common; the name is the 20 bytes immediately after the address (message bytes 11-30), ASCII, trailing spaces/NUL trimmed. Code: `ascii.decode(message.slice(11, 31))`.
4. Validate with the checksum rule in 2a if desired (arachsys does not verify it).

Source: https://raw.githubusercontent.com/arachsys/webmidi/master/montage/scratchpad.html (confidence high; working on MODX and MONTAGE). Cheaper alternative (UNVERIFIED): Parameter Request `F0 43 30 7F 1C 07 30 40 00 F7` may return only the name parameter. The MODX does not announce Performance changes by itself; re-request after each Program Change you send, or poll.

### 2e. What is plain CC vs SysEx (summary)

| Function | Plain CC? | SysEx address |
|---|---|---|
| Scene 1-8 recall | YES: Scene CC (default 92) value bands, ch 1 | active-scene address UNVERIFIED (the panel sends it when Scene CC = Off) |
| Super Knob | YES: CC 95 ch 1 | 30 4B 00 |
| Assign Knobs 1-8 | YES: CC 17-24 (Part channel when a Part is selected) | per-knob value addresses UNVERIFIED |
| Assign Sw 1/2, MS Hold, MS Trigger | YES: CC 86/87/88/89 | (none) |
| Part volume / pan | YES: CC 7 / CC 10 on the Part's channel (Multi mode) | 31 0p 24 (volume, low confidence); pan UNVERIFIED |
| Part mute / solo | no CC | mute 31 0p 18; solo UNVERIFIED |
| Keyboard Control per Part | no CC (Scenes can memorise it) | 31 0p 17 |
| Part switch (on/off) | no CC | UNVERIFIED (in the Part table) |
| Arp master / MS master | no CC (foot switch "Arp SW"/"MS SW" only) | 30 47 03 / 30 48 00 |
| Arp Part switch | no CC | 31 6p 00 (low-medium) |
| Arp Select / MS Select 1-8 | no CC; Scenes memorise them (use Scene CC) | UNVERIFIED |
| Local Control, MIDI I/O mode | no CC | SYSTEM table 00 00 xx (MIDI Mode 00 00 30, low) |

## 3. Bank Select / Program Change mapping for Performances

| Fact | Value | Source URL | Confidence | Notes |
|---|---|---|---|---|
| Whole Performance ("Multi-Part") recall | MSB 64 (0x40); LSB 0-31 = Preset, 32-36 = User (5 x 128 = 640), 40-79 = Library (8 libraries x 5 LSB); PC 0-127 | https://yamahasynth.com/community/modx-series-synthesizers/recall-a-performance-with-a-midi-code ; https://yamahasynth.com/community/montage-series-synthesizers/the-same-program-change-codes-result-in-different-performances | high | Data List p.187-188 / 190-191. MODX factory presets occupy LSB 0-17 (2227 entries). |
| Formula for preset Performance number N (1-based, as printed in the Data List) | LSB = (N-1) div 128 ; PC = (N-1) mod 128 ; MSB 64. Examples: #1 "CFX + FM EP" = 64/0/0; #128 "DX Chill" = 64/0/127; #129 "Toy EP" = 64/1/0 | recall-a-performance-with-a-midi-code thread | high | The panel's Property screen shows Program Number as PC+1. The Data List does NOT print MSB/LSB per entry. |
| Single-Part recall | MSB 63 (0x3F), same LSB/PC layout: loads only Part 1 of that Performance into the Part whose channel the message arrived on; the Performance itself does not change | same two threads ; https://yamahasynth.com/community/modx-series-synthesizers/project-from-scratch ("MSB 63, LSB 0, PC 4 on ch 1 recalls CFX Stage as Part 1") | high | This is the source of the MSB 63 vs 64 confusion; Property shows both. |
| Live Set recall | MSB 62 (0x3E); LSB = page index (0-15 reported; one post says 0-1F); PC 0-15 = slot. Applies to the CURRENTLY ACTIVE Live Set bank (choose the bank on the panel or with SysEx 09 00 00) | https://yamahasynth.com/community/modx-series-synthesizers/modx6-live-set-msb-lsb-patch-changes ; sysex-to-change-live-set-bank-and-page thread | high | Data List p.188 (MODX). |
| GM | Voices: MSB 0, LSB 0, PC 0-127 (single Part, on that Part's channel). Drum kits: MSB 127, LSB 0 | https://yamahasynth.com/learn/2010s/bank-select-and-program-change-event/ ; forum tester in search summary | medium | The MODX "does not conform to the full GM spec"; GM multi Performances are also ordinary presets (e.g. "Multi/GM" near #2227). |
| Channel rules (MIDI I/O mode) | Multi mode: Multi-Part (MSB 64) recall is accepted on the basic receive channels 1-8 (ch 1 is the usual choice); Single-Part (MSB 63) on the target Part's channel 1-16. Single mode: everything on the one MIDI I/O channel (Utility > Settings > Advanced > MIDI I/O Ch). Hybrid: like Single for Kbd-Ctrl Parts | the-same-program-change-codes thread (Bad Mister) | medium-high | |
| Global receive/transmit switches | Utility > Settings > Advanced: "Bank Select" and "Pgm Change" (both directions, whole instrument). Per-Part receive switches exist in Part settings. | https://yamahamusicians.com/forum/threads/why-does-the-modx-not-transmit-midi-program-change-when-changing-performances.20458/ | medium | Changing a Performance on the panel does NOT transmit a Program Change; only Zone (external) Parts transmit PC. |
| Counting | 2227 factory Performances (MODX OS 2.5x and MODX+ identical); #2196-2227 were added by MODX fw 2.50 | https://yamahasynth.com/community/modx-series-synthesizers/modx-new-preset-performances | high | |

## 4. Arp MIDI Out, Motion Sequencer output, clock, Local Control

| Fact | Value | Source URL | Confidence | Notes |
|---|---|---|---|---|
| Arp MIDI Out setting | Utility > Settings > MIDI I/O > "Arp MIDI Out" On/Off (global). ON: Keyboard > Arpeggiator > MIDI OUT; the arpeggio's generated notes are transmitted (on each Part's transmit channel, e.g. Part 4 on ch 4 in Multi mode) and incoming MIDI bypasses the arpeggiator. OFF (default): your played notes go out, incoming MIDI passes through the arpeggiator. | https://yamahasynth.com/?p=2314 (Mastering MODX: Arp Record on DAW) ; https://yamahasynth.com/?p=2453 | high | Quick Setup 2 "Arp Rec on DAW" = Arp MIDI Out ON + Local Control OFF + MIDI Sync MIDI. Exception: in Single/Hybrid mode with no Zone switch active the arp output stays internal. SHIFT+[ARP ON/OFF] = arp bypass. |
| Motion Sequencer output | NOT transmitted as MIDI. Motion Sequences driving the Super Knob/knobs generate no MIDI; Part Assign knobs moved indirectly (Super Knob / Common link / MS) do not transmit. | https://yamahasynth.com/community/montage-series-synthesizers/sequencing-the-movements-of-the-super-knob-in-an-external-sequencer ; can-the-super-knob-control-an-external-device thread | medium | A visualiser can only see MS effects by polling SysEx values. |
| Super Knob movement transmitted | Yes: CC (default 95) on ch 1, raw knob value 0-127 (curves not applied); or SysEx 30 4B 00 when CC = Off | https://yamahasynth.com/?p=2453 ; superknob-controller-on-ableton-live-setup-sysex thread | high | Recording/playback round-trip requires the DAW loop (Local Control off test). |
| MIDI Sync | Utility > Settings > MIDI I/O > "MIDI Sync": Internal / MIDI / A/D In (MONTAGE wording; the MODX has the same screen) | https://yamahasynth.com/?p=2453 ; https://yamahasynth.com/community/modx-series-synthesizers/arp-speeds-to-follow-external-clock | high | Arps follow the Performance tempo, or the external clock when Sync = MIDI. |
| Clock Out | Same screen, "Clock Out" On/Off (one MODX post calls it "Sync Out"); the MONTAGE article states default On. Over USB the clock is on Port 1. | https://yamahasynth.com/?p=2453 ; https://yamahasynth.com/community/modx-series-synthesizers/modx-midi-clock | medium | A remote app sees tempo only via F8 clock + FA/FC (no tempo CC). |
| Receive/Transmit Seq Ctrl | Same screen, On/Off each (Start/Stop for the internal player/recorder); default On/On | https://yamahasynth.com/?p=2453 | medium | |
| Local Control | Utility > Settings > MIDI I/O > "Local Control" On/Off; default On | https://yamahasynth.com/?p=2453 ; https://manual.yamaha.com/mi/synth/montage_m/en/om01basicoperation0330.html | high | SysEx address UNVERIFIED (SYSTEM table). |
| MIDI I/O mode | Utility > Settings > Advanced > "MIDI I/O Mode": Single / Multi / Hybrid (Hybrid since MONTAGE 3.0 / MODX 2.0); "MIDI I/O Ch" for Single/Hybrid | https://yamahasynth.com/?p=2314 | high | |
| MIDI IN/OUT port | Utility > Settings > MIDI I/O > "MIDI IN/OUT": USB or MIDI. USB Port 1 = tone generator + bulk; Port 2 = DAW remote; Port 3 = 5-pin thru | https://yamahasynth.com/?p=2453 | high | |
| Controller Reset | Utility > Settings > MIDI I/O: Reset / Hold (controller values on Performance recall) | https://yamahasynth.com/?p=2453 | medium | |
| Quick Setup | SHIFT+[UTILITY]; Standalone, 1 "MIDI Rec on DAW", 2 "Arp Rec on DAW", 3 "Audio Rec on DAW" (user-editable) | quick-setup thread ; ?p=2453 | high | |

## 5. Factory Performance name lists (non-PDF sources)

| Source | URL | Format / contents | Completeness | Licence |
|---|---|---|---|---|
| Royce Craven's Cakewalk/Reaper instrument definition "MODX Performances.ins" (2020) | https://bwalk.com.au/pub/MODX%20Performances.ins (41.7 KB text) | `.Patch Names` section with 17 banks `[MODX Perf 1..17]`, 128 lines `nnn=Name` each (2176 names); `.Instrument Definitions`: `BankSelMethod=1`, `Patch[8192]=MODX Perf 1` ... `Patch[8208]=MODX Perf 17` (8192 = 64*128, i.e. MSB 64, LSB 0-16). No category column. | Matches MODX OS <= 2.0 (2176 of the 2227 current names; the fw 2.50 additions #2196-2227 are missing). | none stated |
| moessieurs.com Cubase patch scripts for Montage (OS 3.x) and MODX (OS 2.x) | https://www.moessieurs.com/cubase-script-montage.html (zip; built with Melas Total Librarian) | Cubase .txt patchname script; the page documents bank ranges, e.g. the 32 MODX 2.x additions at "MSB 63 LSB 17 PC 19-50" | claims full preset + GM + drum + user ranges; download not inspected | none stated |
| Cubase/Nuendo patchnames by "semiono" (2021-2022) | https://yamahasynth.com/community/modx-series-synthesizers/modxnuendo-instrument-definitions (Yandex Disk links) | Cubase patchnames .txt incl. category grouping, GM list | unverifiable (Yandex) | none stated |
| yamahamusicians Excel conversion of the Data List | https://yamahamusicians.com/forum/attachments/data_list_reformatted-zip.11954/ (from https://yamahamusicians.com/forum/viewtopic.php?p=105899) | Excel 97 reformat of the PDF list | likely complete | forum attachment, no licence |
| Official MODX+ Data List PDF pp.2-17 | see section 0 | Number, name, category, voice type per Performance (2227 rows) | complete, canonical | Yamaha copyright; the name list itself is factual data |
| John Melas Total Librarian (paid) | https://www.jmelas.gr/montage/lib.php | exports instrument definitions for Cubase, Cakewalk, Digital Performer | complete, current | commercial |
| Soundmondo | (search by instrument) | database, not a downloadable list | (n/a) | (n/a) |

Sample rows (bwalk .ins, bank `[MODX Perf 1]` = MSB 64 LSB 0): `000=CFX + FM EP`, `001=CFX + FM EP 2`, `002=CFX Concert`, `003=CFX Stage`, `004=CFX Pop/Rock`, `005=CFX PopStudioGrand`, `006=CFX Moody`, `007=CFX & Pad`, `008=CFX & Pad 2`, `009=CFX & Orch`. (Confidence high that these are the real first ten factory names: the recall thread independently cites #1 "CFX + FM EP", #128 "DX Chill", #129 "Toy EP"; the project-from-scratch thread cites PC 4 = "CFX Stage".)

No public CSV/JSON with name + category + MSB/LSB/PC was found. Recommendation: derive MSB/LSB/PC from the row number (section 3 formula) and take names from the Data List pp.2-17 (or the .ins plus the 51 missing tail entries). Reuse of a factual preset-name list is common practice (DAW patch scripts), but no explicit licence exists; flag for the owner's judgement.

## 6. MODX vs MODX+ (and the "OS 3.x" premise)

| Fact | Value | Source URL | Confidence | Notes |
|---|---|---|---|---|
| MODX+ firmware | Ships as 1.00.0 / 1.01.0; NO MODX+ firmware update has ever been released (as of Apr 2026); it is the functional equivalent of the last MODX OS (2.52). "OS 3.x" is MONTAGE classic (3.0/3.5) and MODX M (OS 3.0, Jan 2026), not MODX+. | https://yamahamusicians.com/forum/threads/where-is-the-modx-firmware.24108/ ; https://id.yamaha.com/support/updates/modx-os-updater.html | high | "MODX+ (OS 3.x)" in the task brief is a mix-up; treat the MODX8+ as MODX OS 2.5-class. |
| Hardware differences | FM-X polyphony 64 -> 128 (AWM2 stays 128); user waveform flash 1 GB -> 1.75 GB; rubberised pitch/mod wheels; no AN-X engine; keyboards, panel, engines otherwise identical | https://synthanatomy.com/2022/09/yamaha-modx-plus-multi-engine-synth-workstation-gets-a-small-update.html ; https://yamahasynth.com/community/modx-series-synthesizers/modx-new-preset-performances | high | |
| Presets | Same 2227 Performances; no new Performances on MODX+ (Data List MODX D0 vs MODX+ A0 have identical last pages) | modx-new-preset-performances thread | high | |
| Smart Morph | Introduced by MODX OS 2.5 / MONTAGE 3.5 (FM-X morphing); present on MODX+ from the factory. No MIDI/CC additions documented for it. | https://yamahasynth.com/learn/montage-series-synthesizers/montage-article-roundup-os-v3/ (search summary) | medium | |
| Hybrid MIDI I/O mode, FS "Tap Tempo", Scene Kbd-Ctrl / Super-Knob-Link memorise | Arrived via MODX OS 2.0 firmware (MONTAGE 3.0); included in MODX+ | https://yamahamusicians.com/forum/threads/modx-firmware-uprade-to-modx.20064/post-112761 ; yamahamusicians 20453 | medium | The Scene Kbd-Ctrl / SK-Link addresses are still undocumented in the MODX+ Data List. |
| SysEx | Same Model ID 07 and 3-byte addresses on MODX and MODX+ (forum: "on MODX(+)"); MONTAGE M / MODX M differ (4-byte addresses, documented scene params). | https://yamahasynth.com/community/modx-series-synthesizers/sysex-to-change-live-set-bank-and-page | high | |
| Data List quality | MODX D0 and MODX+ A0 contain the same errors (checksum text, Motion Seq bulk address 31 1p 00 -> 34 1p 00, transmit flow diagram copied from Motif) | yamahamusicians 20588 | high | |
| Device Inquiry bytes for MODX+ | UNVERIFIED (MODX = 0x56-0x58) | (none) | UNVERIFIED | Log the reply in the Hub monitor on first connect. |

## 7. Gaps and what the PDF would settle

Pages of modx_plus_en_dl_a0.pdf (same pagination as modx_en_dl_d0.pdf per forum cites) that would close the UNVERIFIED rows:
- p.2-17: Performance list (names, categories), for the browser.
- p.184: "3-1-3 Control Change" list (official defaults for every controller CC; confirms Ribbon 16 / Breath 2 / FC1 11 / FC2 4 / FS).
- p.187-191: MIDI data format, Bank Select / Program Change tables (MSB 62/63/64 and GM), Live Set page/slot table.
- p.188: Native Parameter Change / Mode Change format; bulk request format.
- p.193: Bulk Dump Block table (confirm 0E 25 00 vs 0E 52 00, 0E 51 00, 0E 54 0p, 34 1p 00) and the (incorrect) checksum text.
- p.194: MIDI PARAMETER CHANGE TABLE (SYSTEM): Local Control, MIDI Mode (00 00 30), MIDI Sync, Clock Out, Arp MIDI Out, Super Knob/Scene CC numbers, FS Assign.
- p.196-202: PERFORMANCE COMMON (30 40 00 name ... 30 47 03 arp master, 30 48 00 MS master, 30 4B 00 super knob, 30 4C scenes) and the active-Scene parameter.
- p.199-211: PERFORMANCE PART (31 0p: part switch, kbd ctrl 17, mute 18, volume/pan, arp select, MS select) and PART ARPEGGIO (31 6p?).
- p.218-219: MIDI Implementation Chart.
Also modx_plus_en_rm_a0.pdf: the Utility > Settings > MIDI I/O, Advanced and Control Number screens for the official default column (the MODX RM is cited at p.153/167 for Control Number).

Practical shortcut without the PDF: with Scene CC and Super Knob CC set to Off, the Hub's raw monitor will show the exact Parameter Change addresses the panel emits for Scene select, Super Knob, Assign knobs, Arp/MS on-off and Part select; recording one bulk dump (0E 25 00) gives every block address and the real checksum rule.
