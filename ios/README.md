# GuitarLab — iPad/iPhone wrapper (WKWebView)

The exact analog of `android/`: a full-screen WKWebView serving the bundled
web app, with the same native bridges (microphone permission, keep-screen-on,
external links to Safari).

## What you need (none of this exists in the cloud session)

- A Mac with **Xcode 15+**
- **XcodeGen** (`brew install xcodegen`) — generates the `.xcodeproj` from
  `project.yml`, so no binary project file lives in git
- An **Apple ID** (free: 7-day sideload to your own devices via Xcode) or an
  **Apple Developer account** ($99/yr: TestFlight + App Store)

## Build steps

```sh
cd ios
./sync-web.sh          # copy the web app into ios/WebAssets/
xcodegen               # generate GuitarLab.xcodeproj
open GuitarLab.xcodeproj
```

Then in Xcode: select your team under Signing & Capabilities, pick your iPad
as the destination, and Run.

## How the pieces map to the Android wrapper

| Concern              | android/                          | ios/                                       |
|----------------------|-----------------------------------|--------------------------------------------|
| Web bundle           | `assets/` in the APK              | `WebAssets/` folder reference in the bundle |
| Mic permission       | `onPermissionRequest` + runtime   | `WKUIDelegate` grant + `NSMicrophoneUsageDescription` |
| Keep screen on       | `FLAG_KEEP_SCREEN_ON` bridge      | `isIdleTimerDisabled` via script message    |
| External links       | `Intent.ACTION_VIEW`              | `UIApplication.open`, policy = cancel      |
| JS-side hook         | `window.GuitarLabHost`            | same object, injected as a user script     |

The web app already speaks this bridge (`GuitarLabHost.setKeepScreenOn`), so
no web changes are needed — the same code drives both wrappers.

## Updates

The in-app update checker works here too (fetches `version.json` from GitHub),
but iOS cannot install an IPA from a link — the button opens the download page
in Safari, and actual app updates ship through TestFlight/App Store (or a
re-run from Xcode). For friction-free updates on iPad, the PWA
(Add to Home Screen from Safari) remains the recommended install.
