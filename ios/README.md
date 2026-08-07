# GuitarLab — native iPad/iPhone app (WKWebView + CoreMIDI)

The analog of `android/`: a full-screen WKWebView serving the bundled web
app, with native bridges the web can't get on iOS by itself:

- **CoreMIDI bridge** (`MIDIBridge.swift`) — the big one. WebKit has no Web
  MIDI, so the wrapper feeds CoreMIDI to the web app instead:
  USB **and Bluetooth** MIDI keyboards (ROLI LUMI!), input with velocity /
  per-key bend / pressure, LED output, LUMI SysEx, plus the system
  **Bluetooth MIDI pairing sheet** (a "Pair Bluetooth…" button appears in the
  app's Settings when running in this wrapper). `js/midi.js` auto-detects the
  bridge — the exact same web code drives Web MIDI in Chrome and CoreMIDI here.
- Microphone permission (tuner), keep-screen-on, external links to Safari.

## Getting it built (three paths)

### A. No Mac at all — GitHub Actions + sideload  ← easiest today
1. Run the **"iOS app (unsigned IPA)"** workflow on GitHub (Actions tab →
   Run workflow; it also runs automatically when `ios/**` changes on main).
2. Download the `GuitarLab-unsigned-ipa` artifact.
3. Install **AltStore** (altstore.io) or **SideStore** — their desktop helper
   runs on Windows — and sideload the IPA onto the iPad with your free
   Apple ID. Free-account apps re-sign every 7 days (AltStore automates the
   refresh when the iPad is on your Wi-Fi).

### B. A Mac with Xcode (borrowed counts)
```sh
brew install xcodegen
cd ios
./sync-web.sh          # copy the web app into ios/WebAssets/
xcodegen               # generate GuitarLab.xcodeproj
open GuitarLab.xcodeproj
```
Pick your team under Signing & Capabilities, select the iPad, Run. Free
Apple ID = 7-day resign; paid Developer account = 1-year certs + TestFlight.

### C. Apple Developer account ($99/yr) — the "real app" path
Same build, then archive → TestFlight (easy installs + updates for friends)
or App Store. This is the only route with friction-free updates.

## How the pieces map across platforms

| Concern              | android/                          | ios/                                        |
|----------------------|-----------------------------------|---------------------------------------------|
| Web bundle           | `assets/` in the APK              | `WebAssets/` folder reference in the bundle |
| MIDI                 | (WebView: none)                   | CoreMIDI bridge, incl. Bluetooth pairing    |
| Mic permission       | `onPermissionRequest` + runtime   | `WKUIDelegate` grant + usage description    |
| Keep screen on       | `FLAG_KEEP_SCREEN_ON` bridge      | `isIdleTimerDisabled` via script message    |
| External links       | `Intent.ACTION_VIEW`              | `UIApplication.open`, policy = cancel       |
| JS-side hooks        | `window.GuitarLabHost`            | same + `messageHandlers.midi` / `__glMIDI`  |

## Updates

The in-app checker still fetches `version.json`, but iOS can't install an
IPA from a link — updates ship by re-running the workflow + re-sideloading
(AltStore can auto-update from a source URL), via TestFlight, or through
Xcode. The PWA (Add to Home Screen in Safari) remains the zero-friction
install when MIDI isn't needed.
