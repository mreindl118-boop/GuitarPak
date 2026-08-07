import SwiftUI
import WebKit

/// GuitarLab wrapper: a full-screen WKWebView serving the bundled web app from
/// WebAssets/. Native concerns, mirroring the Android MainActivity: granting
/// the WebView's microphone request (tuner tab), bridging the web app's
/// keep-screen-on calls to the idle timer, and sending external links
/// (e.g. the auto-updater's download page) to Safari.
@main
struct GuitarLabApp: App {
    var body: some Scene {
        WindowGroup {
            WebShell()
                .ignoresSafeArea()   // the web app handles its own safe areas
        }
    }
}

struct WebShell: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // window.GuitarLabHost — the same bridge object the Android wrapper
        // exposes, so the web app's App.wake code drives both platforms.
        // The presence of messageHandlers.midi is what flips js/midi.js into
        // its native-bridge backend (CoreMIDI instead of Web MIDI).
        let bridge = """
        window.GuitarLabHost = {
          setKeepScreenOn: function (on) {
            window.webkit.messageHandlers.wake.postMessage(!!on);
          }
        };
        """
        config.userContentController.addUserScript(WKUserScript(
            source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(context.coordinator, name: "wake")
        config.userContentController.add(context.coordinator, name: "midi")

        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = context.coordinator
        web.navigationDelegate = context.coordinator
        context.coordinator.midiBridge.webView = web
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.075, green: 0.067, blue: 0.078, alpha: 1)

        if let index = Bundle.main.url(forResource: "index", withExtension: "html",
                                       subdirectory: "WebAssets") {
            web.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate,
                             WKScriptMessageHandler {

        let midiBridge = MIDIBridge()

        // Tuner mic: grant capture to our own bundled pages; iOS shows its own
        // system permission prompt the first time (NSMicrophoneUsageDescription).
        func webView(_ webView: WKWebView,
                     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(type == .microphone ? .grant : .deny)
        }

        // GuitarLabHost.setKeepScreenOn(bool) -> idle timer;
        // messageHandlers.midi -> CoreMIDI bridge commands
        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            if message.name == "wake" {
                let on = (message.body as? Bool) ?? false
                DispatchQueue.main.async {
                    UIApplication.shared.isIdleTimerDisabled = on
                }
                return
            }
            guard message.name == "midi", let body = message.body as? [String: Any],
                  let cmd = body["cmd"] as? String else { return }
            DispatchQueue.main.async { [midiBridge] in
                switch cmd {
                case "init":
                    midiBridge.start()
                case "send":
                    if let data = body["data"] as? [Any] {
                        midiBridge.send(data.compactMap { ($0 as? NSNumber)?.uint8Value })
                    }
                case "setOutput":
                    if let id = (body["id"] as? NSNumber)?.intValue { midiBridge.setOutput(id: id) }
                case "bluetooth":
                    midiBridge.presentBluetoothPairing()
                default:
                    break
                }
            }
        }

        // keep file:// navigation in-app; everything else goes to Safari
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = navigationAction.request.url, url.scheme != "file" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
