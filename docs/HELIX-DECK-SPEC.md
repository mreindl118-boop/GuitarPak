# Helix Deck — implementation contract (phase 0 + phase 1)

Worktree: `C:\Users\mrein\AppData\Local\Temp\sl-helix` (branch `feat/helix-deck`, cut from
`feat/synth-tab` f7bd32f = main 1.2.0 + the Synth tab). Vanilla ES5-style JS (IIFEs, `var`, no
arrows / template literals / classes / modules), CSS via `App.injectCSS`, tokens only, no new icons
(App.icon names that exist: left, right, close, plus, minus, check, star, play, stop, sliders, lock,
clock, learn, help, bolt, record, pause, restart, expand, up, down, target). CLAUDE.md is in your
context. Suites: Playwright, `NODE_PATH=/c/Users/mrein/AppData/Local/Temp/hxprobe/node_modules`,
serve with `SL_PORT=<port> python tests/serve.py` from the worktree (ports 4591–4599 are free),
`SL_URL=http://127.0.0.1:<port>/index.html node tests/<suite>.test.js`.

## What Matt asked (2026-10-26)
"evaluate what we're doing with the MODX UI built into soundLAB and try to emulate it for the Helix
specifically. USB control read write privileges on the Helix like the Helix desktop app does."
Helix = Line 6 Helix Stadium XL (fw 1.1.0 today). The Synth Deck (js/synthdeck.js, the MODX) is the
UI MODEL; the Helix has a real editor protocol, so the DATA model differs (see below).

## Facts that shape the design
- The Helix page today (`js/helix.js`, 1111 lines, page id `helix`, Guitar › Helix, store `hx.*`,
  prefix `hx-`, hook `window.SLHelix`) has: a header (MIDI strip, bridge strip, ARM row, device line,
  six views Rig / Blocks / Presets / Looper & Song / Mixer / Monitor), null's SAFETY model (disarmed on
  every visit, 90 s arm window renewed per command, disarm on hide/blur/app hidden/destination
  change/Global channel change/bridge drop/failed send/safe on; reads never gated; Load/Save confirm;
  port allow-list `/helix|stadium/i` minus `NOT_HELIX`), favorites (address = CC32 bank + PC prog +
  CC69 snap + bridge cid), observed panel, two transports used together: its OWN Web MIDI port pair
  (or App.midi in 'app' mode when the shared output IS the Helix) and the network BRIDGE
  (`tools/helix-bridge.js`, Node, `ws://127.0.0.1:4575`, JSON `{op:'rpc'|'telemetry'|'lookup'|
  'host'|'status'}` in, `{op:'msg'|'status'|'defs'|'error'}` out; online = `status.ports['2002']`).
  Bridge reads/writes: /ProductInfoGet, /EditBufferStateGet (blocks + params + snapshots),
  /ActiveSnapshotIndexGet, /PropertyValueGet active cid, /GetContainerContents (-1 Factory, -2 User,
  -5 setlists), /ParamValueGet; writes /ParamValueSet (40 ms coalesce), /BlockEnableSet,
  /activateSnapshot, /SetSnapshotName, /LoadPresetWithCID, /SavePresetWithCID; stream (2001)
  /setParamValue, /setBlockEnable, /activateSnapshot, /setEditBuffer, /heartbeat; telemetry pitch.
  Test: `tests/helix.test.js` (55 checks, fake Helix port pair `__sent/__sentTo/__failNext/__recv`
  + `FakeWS`; pins ~60 `hx-` ids and exact bytes; uses page.on('dialog') auto-accept).
- USB "editing" on fw 1.4 (research 2026-10-26, `scratchpad/stadium-usb-research.md`): the pedal
  exposes a CDC-NCM network interface over USB; the SAME ZeroMQ/OSC services (TCP 2001/2002/2003,
  mDNS `_stadiumserver._tcp`, `p35x1.local`, IPv6 ULA `<prefix>::1`) are reachable over that link.
  The vendor bulk interface (MI_06, driverless here) is only the firmware-update path. So the USB
  route = the existing bridge connecting over the USB network adapter once the pedal runs 1.4
  (Matt's firmware decision) and Windows binds its in-box UsbNcm driver (to verify). No WebUSB.
  Phase 1 shows an honest badge; no USB code beyond the bridge accepting a host later.
- Design verdict (3 designers, 2 judges): "Synth Deck shape over an App.helix engine": Perform |
  Edit fold, Now bar, snapshots strip, favorites as tiles (an ADDRESS, never a value dump), strips
  (not knobs) with a row picker, chips, Explain captions from one wording table, page-owned sheets
  instead of window.confirm/prompt, PROVENANCE on every value (sent = grey, MIDI echo = amber, bridge
  state = green), the firmware gate, null's safety contract unchanged.

## Files and ownership (phase 0 + 1)
| Owner | Files |
|---|---|
| map agent | `js/helix-map.js` (NEW, pure data: `window.SLHelixMap`) |
| engine agent | `js/helix-routes.js` (NEW: `App.helix`), `js/helix.js` (slimmed shell + mount points + sheet-confirm hook) |
| deck agent | `js/helix-deck.js` (NEW: `window.SLHelixDeck`, CSS `App.injectCSS('helixdeck')`, prefix `hxd-`) |
| tests agent | `tests/helix-deck.test.js` (NEW), `tests/helix.test.js` (updated: sheet-confirm, Perform default) |
| main session | `index.html` (script tags), `sw.js` (ASSETS + CACHE), `js/help.js` TOURS.helix, `docs/HELIX-DECK.md`, `docs/HELIX-STADIUM.md`, `CLAUDE.md`, task record |

NOT touched by anyone: `js/synthdeck*.js`, `js/synthtab.js`, `js/synthlive.js`, `js/midihub.js`,
`js/midi.js`, `js/app.js`, the Synth CSS/tours, `tools/helix-bridge.js` (phase 1), null's folder.
Script order (main session wires it): … `js/midi.js` … `js/helix-map.js`, `js/helix-routes.js`,
`js/helix.js`, `js/helix-deck.js`, then `js/help.js`. Every file loads before `App.boot()`.

## js/helix-map.js — `window.SLHelixMap` (pure data, no DOM)
```
{ v:1,
  CONTROLS: [ { id, name, kind:'cc'|'pc'|'osc', ui:'strip'|'chip'|'radio'|'tile'|'pad'|'snap', ch:'global'|'ctl'|'layer',
                num, on:127, off:0, def, conf:'verified'|'documented'|'unverified'|'learned', minFw?:'1.3'|'1.4', src, row?, explain } ],
  ROWS: [ {id:'knobs14', name:'Knobs 1–4', ctl:['knob:0'..'knob:3']}, {id:'knobs58', ...}, {id:'pedals', ctl:['exp:0','exp:1','xy']}, {id:'stomps', dynamic:true}, {id:'block', dynamic:true, needs:'net'}, {id:'mix', minFw:'1.4', dynamic:true} ],
  CHIPS: [ 'tuner','toe','tap','click','muteall','looprec','loopover','loopplay','loopstop','looponce','loopundo' ] (ids into CONTROLS),
  BUTTONS (CC9 panel buttons, from helix.js BUTTONS), FSMODES (7), MIX (19 strips), LAYERS (3), CATS, COLOURS ['amber','teal','blue','pink','green','grey'],
  EXPLAIN: { key: 'One sentence naming the panel control, the message (CC n / OSC address), the channel and the route.' },
  tour(): -> the TOURS.helix steps array built from EXPLAIN (sel + t + x), keep today's four stops' intent }
```
CONTROLS at least: knob:0..7 (CC38–45, ch global, strip, def 64, verified = manual), exp:0/exp:1 (CC1/CC2,
strip, def 0), xy (CC7 across / CC8 up, pad), toe (CC36=127 chip), fsmode (CC37 0–6 radio), tap (CC64
chip), tuner (CC9=34), click (CC9=23), muteall (CC9=24), prev/next preset (CC9 12/13), setlist (CC32),
program (PC), snapshot (CC69 0–7, next 8, prev 9), looper CC52–62 (chips, momentary), song CC63/10/46–51
(minFw 1.3), matrix level/pan/mute/solo per layer (minFw 1.4, src 'manual §Matrix 1.4'), stomps
(ch 'ctl' = hx.ctlCh, learned). Confidence per the manual/null's matrix; CC32 setlist mapping '5 +
position' is `unverified` on hardware.

## js/helix-routes.js — `App.helix` (the engine; phase 0 = MOVE the code out of helix.js)
Move verbatim where possible: the midi block (midiPick/midiConnect/onMidiIn/hasMidiOut/tx/cc/pc,
isHelix/NOT_HELIX/appOk), the arm block (ARM_MS, arm, safe, armed, gate, setArmed, disarm, canArm),
the bridge block (brUrl/brConnect/brRetry/brClose/brSend/brTele/devOnline, rpc, onBridge/onStream/
onTelemetry, devRefresh/readInfo/readActive/readEditBuffer/readSnapshot/listContainer, writeParam
coalescing, EB parsing into dev.blocks/snapNames), favorites math (favs/saveFavs/addFav/addrOf/
favFromItem/favActive/recallBytes/sendRecall/recallFav), observed/ledger. The engine owns the
runtime state `dev`, `st`, `midi`, `br`, `arm`, `obs` and EMITS events; it never touches the DOM.
helix.js subscribes and paints (keep its paint* functions, now driven by events).

```
App.helix = {
  init(),                                // no connections; called once from helix.js init
  state() -> { armed, safe, until, msg, mode, fw:{str,build,src:'read'|'confirmed'|null},
               routes:{ midi:{status,dest,mode:'web'|'app'|'none'}, net:{status,host,ip,ports}, usb:{status:'needs-setup',caption} },
               dev:{ product, name, active:{cid,name,posi,ccid}, snap, snapNames:[8], blocks:[...], setlists:[...] },
               st:{ setlist, prog, snapAfter, kv:[8], exp:[2], xy:[2], fsmode } },
  on(evt, fn), off(evt, fn),            // 'state' (arm/routes/fw/mode), 'dev' (device/EB/snapshot/active), 'value' {key,v,src}, 'stream' {addr,args}, 'ledger' {row}, 'observed', 'toast' {msg}
  arm(on, why), armed(), safe(), setSafe(on), gate(kind, quiet) -> bool,   // kind 'read' (never gated) | 'write' | 'destructive' (armed + confirm via ui.confirm)
  routes: { midi:{status(),connect(quiet),dest(),mode()}, net:{status(),connect(),disconnect(),url(),setUrl()}, usb:{status(),caption()} },
  ui: { confirm: null },                 // the deck installs confirm({title, body, ok, danger}) -> Promise<bool>; fallback window.confirm
  op(name, params, opts) -> Promise<{ok, route:'midi'|'net', sent:number, reason?}>,
  plan(name, params) -> [{at, bytes?|rpc?}],   // the recall plan for previews/tests
  cancel(),                              // cancel a running timed plan
  values(key) -> {v, src:'sent'|'echo'|'state', t} | null,
  favs(), saveFav(f), removeFav(id), addrOf(item), favActive() -> Promise, recallFav(id),
  observed(), clearObserved(), ledger(),
  isHelix(port), hasMidiOut(), devOnline(), fwOk(minFw) -> bool, setFwConfirmed(str),
  defs: { shortName(mid), paramDefs(block), cat(type) }   // from tools/helix-defs.json via the bridge 'lookup'
}
```
OPS (name → gate, route preference, bytes/rpc, timing): recallPreset {bank,prog,snap?,cid?} write;
midi plan [[0,[B0|c,32,bank]],[30,[C0|c,prog]],[300,[B0|c,69,snap]]], net plan /LoadPresetWithCID
(destructive confirm) then /activateSnapshot at +700 ms; prevPreset/nextPreset CC9 12/13 write;
snapshot {i} write: net /activateSnapshot else [B0|c,69,i]; snapPrev/snapNext CC69 9/8;
renameSnapshot {i,name} net write (≤16 chars); knob {i,v} CC38+i; exp {i,v} CC1/2; xy {x,y} CC7+CC8;
toe CC36 127; fsmode {m} CC37; button {n} CC9 n; tap CC64 127; tapTempo {bpm} 4 taps at 60000/bpm;
tuner CC9 34; click CC9 23; muteAll CC9 24 (= panic, write, never silent-refused: the deck shows
'Arm & mute' when disarmed); looper {cc,val}; song ops (minFw 1.3); stomp {cc,v} on hx.ctlCh;
param {path,slot,pid,v} net write coalesced 40 ms; bypass {path,slot,on} net write; save net
destructive (/SavePresetWithCID active cid); load {cid} net destructive; mix {layer,cc,v} midi write
minFw 1.4; rawMidi {bytes} write; rawOsc {addr,args} write; readInfo/readActive/readEditBuffer/
readSnapshot/listContainer read (never gated). Every successful send → values[key] = {v, src:'sent'},
a ledger row, `App.emit('midi:out', {bytes, port})`; a failed send disarms. `midi:raw` frames from a
Helix-named port (app mode) and the page's own input feed observed + values (src 'echo') + Learn.

helix.js after the move: `App.register('helix', …)` shell; render() builds `#hx-head` (same ids),
then `<div id="hxd-top"></div>` and `<div id="hxd-perform"></div>`, then `#hxd-edit` wrapping the
existing `#hx-views` seg and the six `.hx-view` containers (hidden unless mode 'edit'); at the end of
render: `if (window.SLHelixDeck) SLHelixDeck.init(document.getElementById('hxd-top'),
document.getElementById('hxd-perform'), App.helix)`. Replaces every `window.confirm`/`prompt` with
`App.helix.ui.confirm` / a deck sheet (fallback to window.* when the deck is absent). Keeps
`window.SLHelix` (builtIn true, arm, armed, midi, isHelix, mode(name) getter/setter, every member
the suite uses) with members delegating to App.helix. onShow: disarm, visible, request Web MIDI only
when `midi.wanted` (unchanged), bridge auto only when hx.bridgeAuto. onKey unchanged. onBack:
sheet → edit→perform → false (ask the deck first).

## js/helix-deck.js — `window.SLHelixDeck` (the Perform face)
`init(topBox, performBox, helix)` idempotent (bus/window listeners once; DOM rebuilt per call),
`stop()`, `onBack()`, `mode(name?)`, `openSheet(kind, data)`, `closeSheet()`, `row(id?)`,
`version`. Installs `helix.ui.confirm`. Store: `hx.mode` 'perform'|'edit' (default perform),
`hx.explain` bool, `hx.row` (default 'knobs14'), `hx.hero` (default 'exp:0'), `hx.pinPage`,
`hx.fwConfirmed`, `hx.stripsFav`.

DOM (prefix hxd-):
```
#hxd-top: button#hxd-explain[aria-pressed] '?', div.seg#hxd-mode > button[data-mode=perform|edit] (44 px), div#hxd-routes > span.hxd-rbadge[data-route=midi|net|usb][data-status=absent|available|needs-setup|connecting|online] (tap = connect on a gesture / opens the Connections details)
#hxd-perform (grid, hidden when mode edit):
  div.card#hxd-now: b#hxd-nowname (32 px --font-condensed; bridge dev.active.name → matching pin name → 'User 35B' / 'Setlist 2 · 12B'), span#hxd-nowsub.muted.small ('Snapshot 3 "Lead" · fw 1.1.0 · via MIDI + net'; .bad when no route), i.hxd-prov[data-src=sent|echo|state|none],
    div#hxd-nowacts: button#hxd-arm.hxd-big (Arm / Disarm, reflects helix.armed(); DISARMED pill text in #hxd-armst), button#hxd-prev.hxd-big, button#hxd-next.hxd-big, button#hxd-pin.hxd-big ('Pin' → sheet, never sends), button#hxd-save.hxd-big (bridge only, hidden otherwise; destructive → confirm sheet), div#hxd-armmsg[aria-live=polite]
  div#hxd-snaps > button.hxd-snap[data-snap=0-7] (≥44 px; digit in --font-display + name) .active[data-src]; button#hxd-snprev, button#hxd-snnext
  div#hxd-pins > div.hxd-pingrid > button.hxd-tile[data-fav=id] (name, sub badges 'User 35B · snap 3', colour via border-left, .active, .drift, .sending), div#hxd-pinempty ('★ Pin the loaded preset'), #hxd-pinpager when >16
  div.card#hxd-strips: div#hxd-hero > div.hxd-strip[data-key=exp:0] (role=slider, 52 px) + b.hxd-heroval; div.seg#hxd-rows > button[data-row=knobs14|knobs58|pedals|stomps|block|mix]; div.hxd-four > div.hxd-one > (span.hxd-lab + b.hxd-val + div.hxd-strip[data-key]) ; pedals row adds div#hxd-xy (pad, CC7/8) and the Toe chip; block row (bridge) = the open block's first four numeric params; mix row disabled with caption until fwOk('1.4')
  div#hxd-chips > button.chip.hxd-chip[data-chip=tuner|toe|tap|apptempo|click|muteall|looprec|loopover|loopplay|loopstop|looponce|loopundo] (44 px; momentary: flash .sent 150 ms, never .active; .unsure + '?' badge when conf≠verified; disabled + caption when minFw > fw); div.seg#hxd-fsmode > button[data-fs=0-6]
  p.hxd-cap under each region when Explain is on (text = SLHelixMap.EXPLAIN[key])
#hxd-sheet[role=dialog][aria-modal][hidden] (bottom sheet <700 px): modes pin (input#hxd-pname ≤40, swatches .hxd-swatch[data-colour], input#hxd-ptags, address = current / typed bank+prog / '★ Active' (bridge), select#hxd-psnap, label>input#hxd-papp 'soundLAB key & tempo'), rename (input#hxd-sname ≤16), confirm (h3#hxd-ctitle, p#hxd-cbody, button#hxd-confirmok.btn.danger|primary, button#hxd-confirmcancel)
```
Behaviours: STRIP = the synthtab gesture copied as an hxd- twin (tap/drag anywhere, drag off
vertically ≥1.5× height = quarter-speed fine steps, one send per rAF, aria slider, arrows ±1 /
Shift ±10, Home/End, wheel only when focused, double-tap 350 ms = def, touch-action:none, no page
scroll while held); gate re-checked at pointerdown AND every move; a refusal ends the drag, snaps back
to the last confirmed value, toasts once; the thumb moves only after op() resolved ok. TILE tap =
op('recallPreset') (cancellable; .sending until done; second tap cancels); long-press 650 ms = edit
sheet. SNAP tap = op('snapshot'); long-press = rename sheet (bridge). Prev/Next = CC9 12/13. Arm =
helix.arm(!armed). muteall when disarmed → the chip becomes a two-step 'Arm & mute' (never a silent
refusal). Provenance paint: .active/.hxd-prov from values(key).src ('state' green, 'echo' amber,
'sent' grey). Route badges from helix.state().routes; usb caption: 'USB editing needs firmware 1.4
on the pedal (it adds a USB network link that the bridge can use). This pedal: fw <x>'. Explain
captions from the map. Light/dark via tokens. Touch: 44 px targets (48 big, 56–64 tiles/snaps), 16 px
inputs, no horizontal scroll at 375 px; grid 4 → 8 columns at ≥900 px.

## Safety contract (unchanged; asserted by tests)
Zero bytes on boot/show/mode/row change/Explain/pin save/edit/remove; disarmed on every visit; 90 s
window renewed per command; disarm on hide / app hidden / blur / route destination change or drop /
Global channel change / failed send / safe on; allow-list rechecked per send; reads never gated;
destructive = armed + confirm sheet; refused controls snap back; momentary chips never latch;
MIDI echo is never promoted to 'state'; the bridge connects only after Connect bridge once; no
USB code; no window.confirm/prompt on the page.

## Tests
`tests/helix.test.js` (tests agent updates): keep every byte assertion and id; replace
page.on('dialog') auto-accept with clicking `#hxd-confirmok` (after Load/Save), and put
`SLHelix.mode('edit')` (or clicking `#hxd-mode [data-mode=edit]`) before assertions that need the six
views visible; isolation context unchanged. NEW `tests/helix-deck.test.js` (same harness: fake
Helix port pair + FakeWS from helix.test.js; add a MODX-1/LUMI isolation context; 375x812 and
768x1024 hasTouch contexts): Perform default + Edit fold + hx.mode persists + onBack order; Now bar
name precedence and .bad; route badges (midi online, net online after Connect, usb needs-setup);
strips (tap at 25 % → exactly [0xB0,38,32] once per frame with rAF shimmed by setTimeout; drag
coalesces; fine mode; arrows; double-tap 64; wheel ignored unless focused; disarmed → zero bytes and
unchanged thumb; lapse mid-drag → snap-back + one toast); EXP hero CC1; XY pairs; chips bytes
(tuner CC9=34, toe, click, muteall two-step when disarmed, looper data bytes, fsmode CC37=n, song
chips disabled on fw 1.1 and enabled after setFwConfirmed('1.3'), mix row disabled until '1.4'; no
chip .active from a send); snapshots (/activateSnapshot when online else [B0,69,i]; echo → amber,
stream → green; rename ≤16 via /SetSnapshotName); pins (sheet saves without bytes; cap 48;
validate-on-read; tile tap → CC32/PC/CC69 at 0/30/300 ms; cancel mid-plan; bridge recall via confirm
sheet → /LoadPresetWithCID then /activateSnapshot ≥700 ms; app include emits fb:set only after the
last byte; .drift; '★ Active'); Explain captions only when on + every CONTROLS entry has an
EXPLAIN sentence (pure Node check); layouts (no horizontal scroll, targets ≥40 px, 4/8 columns);
failed send disarms and reverts; zero page errors; MODX-1/LUMI/loopMIDI buckets empty throughout.
