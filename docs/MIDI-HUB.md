# MIDI Hub in soundLAB 0.78.0

Claude's original MIDI Hub work is retained from local source commit `bf55d2819ef2cd1bb2c8d6d6f0b2c8db50b74a80`. The integration adds reviewed routing and cleanup safeguards. This page contains public product instructions only.

Open **Keys → MIDI**. The hub shares soundLAB's existing MIDI service. Choose input/output explicitly. Play offers keys and expression; Controls offers CCs and transport; Rules can remap, transpose or block; SysEx offers explicit message builders; Monitor displays decoded input/output and exports a log. Profile labels and templates do not establish compatibility with every firmware version.

Thru is a deliberate session action. It starts off, excludes automatic SysEx forwarding, and stops when the hub is hidden or routing changes. A missing selected device remains disconnected. Stop or Panic clears the hub's tracked notes; no device programs or patches are uploaded automatically.

The separate LUMI Practice page grades only its selected MODX input and targets only its selected LUMI output. Its hardware lighting behavior is experimental. Simulated devices are labeled and are not physical-device evidence. Helix controls likewise require an explicit documented-firmware choice and output arm.

Web MIDI requires browser support and the user's existing device permission. Native wrappers retain their generic MIDI path; independent per-port tools explicitly report unavailable when that backend cannot provide isolation. No new driver, browser permission, device configuration or firmware is installed by this release.

Browser mock tests check message bytes, routing, UI behavior and cleanup. They do not prove hardware lights, sound, latency, SysEx round trips or native-device compatibility.
