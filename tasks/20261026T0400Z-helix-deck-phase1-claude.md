# Helix deck phase 0+1 built: branch feat/helix-deck on main 1.3.0 (Claude, 2026-10-26T04:00Z)

- Branch `feat/helix-deck` (pushed; worktree `C:\Users\mrein\AppData\Local\Temp\sl-helix`), rebased on
  `main` 6475638 (1.3.0). Three commits: scaffold, the deck, sw CACHE v128. NOT merged; no version
  stamp (1.3.0 stays); Matt decides when it lands (its own PR against main).
- What it is: the Synth Deck model on the Helix page. `js/helix-map.js` (pure data + Explain + the
  tour), `js/helix-routes.js` (`App.helix`: routes midi / net / usb-stub, null's arm gate unchanged,
  ops table with exact bytes + timing, provenance sent / echo / state, favorites as addresses, events),
  `js/helix.js` slimmed to the shell (same hx- ids, Edit keeps the six views, no window dialogs),
  `js/helix-deck.js` (Perform face). Docs `docs/HELIX-DECK.md` + `HELIX-DECK-SPEC.md`;
  `docs/HELIX-STADIUM.md` updated. Suites: helix 56, helix-deck 126; nav / smoke / context-global /
  update / synthdeck / midihub green on the PC. Files of the Synth session untouched.
- USB finding (2026-10-26, `docs/HELIX-STADIUM.md`): the Stadium's "USB editing" on fw 1.4 is a
  CDC-NCM network link over the cable; the SAME editor services the bridge speaks over Wi-Fi answer on
  it. No WebUSB, no driver rebinding; the vendor bulk interface is firmware-update only. Phase 4 =
  the bridge finds the pedal over that adapter (mDNS / the link's IPv6 ULA) once the pedal runs 1.4
  and Windows binds UsbNcm — both to verify with Matt.
- Open for Matt (recorded, not decided): firmware update to 1.4.x (irreversible, enables USB editing,
  Matrix and Showcase MIDI); a Wi-Fi capture of the desktop app's editor commands (model swap, block
  add/move, setlist edits, save-as) which needs no driver; hardware hour for the MIDI checks (setlist
  CC32 = 5 + position, pin recall with snapshot, strip arm flow, Send MIDI PC / Snapshot CC echo);
  which flows matter most on stage; Panic / arm-window exceptions (none taken: null's contract kept).
- Not in phase 1: the chain strip with bypass dots + per-block strips (phase 2), Go-live stage with
  Lock and a 60 px Panic (phase 3), the Matrix row (fw 1.4), the bridge's USB-link discovery (phase 4),
  a unit table for parameters.

## Phase 4 built (2026-10-26T05:00Z) — USB = the bridge over the pedal's USB network link

Matt (2026-10-26): "Yes: I will update the Stadium to 1.4 with the Line 6 app. Then plan phase 4."
On `feat/helix-deck` (pushed): `tools/helix-bridge.js` 0.2.0 probes every unique-local IPv6
`<prefix>::1` on port 2002 (USB first, `--prefer usb|net|auto`, page `{op:'transport', want}`),
status carries `transport` + `transports` (Windows names the UsbNcm adapter); the page's USB badge
and Now bar follow it; `tools/helix-usb-inventory.ps1` (read-only) + `docs/HELIX-USB.md` = the
checklist after the firmware update. Suites: helix-bridge-usb 88 (pure Node), helix 56, helix-deck
140, nav/smoke/context-global green on the PC. Unverified until the pedal is on 1.4 and plugged in:
Windows binding the NCM adapter, IPv4 on the link, Require-PIN semantics. No driver, no WebUSB,
nothing sent to any device by this work.
