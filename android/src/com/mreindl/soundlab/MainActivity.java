package com.mreindl.soundlab;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * soundLAB wrapper: a full-screen WebView running the LIVE web app (GitHub
 * Pages), so every web release reaches Android the moment it ships — the same
 * way the PWA updates, through the site's service worker, which also keeps it
 * working offline once it has loaded. The copy bundled in this APK's assets is
 * the fallback for a first launch with no connection (or the site being down).
 *
 * Because the app itself updates live, a new APK is only needed when THIS
 * shell changes; version.json's "version" names the APK in releases/, and the
 * web app compares it with shellVersion() before offering a download.
 *
 * Native concerns: bridging the WebView's microphone request (tuner, tone-in)
 * to Android's RECORD_AUDIO permission, keep-screen-on, and sending links that
 * leave the app (e.g. an APK download) to the system browser.
 */
public class MainActivity extends Activity {

    /** The live app. Navigation inside this prefix stays in the app. */
    private static final String LIVE_URL = "https://mreindl118-boop.github.io/GuitarPak/";
    /** The copy bundled into assets by build.ps1 — offline / site-down fallback. */
    private static final String BUNDLED_URL = "file:///android_asset/index.html";

    private static final int REQ_MIC = 1;

    private WebView web;
    private PermissionRequest pendingMicRequest;
    private boolean onBundled = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT); // HTTP cache + the site's service worker
        s.setAllowFileAccess(true);
        // The bundled fallback (file://) still fetches version.json from GitHub
        // for its update check — WebView blocks network requests from file://
        // pages without this. All file:// content here is our own assets.
        s.setAllowUniversalAccessFromFileURLs(true);

        // Exposes two harmless methods: keep the screen on during practice, and
        // report this shell's version for the update check. Only our own pages
        // load in this WebView — anything else opens in the browser (route()).
        web.addJavascriptInterface(new WebHost(), "GuitarLabHost");

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        if (Build.VERSION.SDK_INT >= 23
                                && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                                   != PackageManager.PERMISSION_GRANTED) {
                            pendingMicRequest = request;
                            requestPermissions(
                                new String[] { Manifest.permission.RECORD_AUDIO }, REQ_MIC);
                        } else {
                            request.grant(request.getResources());
                        }
                        return;
                    }
                }
                request.deny();
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return route(request.getUrl().toString());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return route(url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) useBundled();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) useBundled();
            }
        });

        web.loadUrl(LIVE_URL);
        setContentView(web);
    }

    /** true = handled here (opened outside), false = let the WebView load it. */
    private boolean route(String url) {
        if (url.startsWith(LIVE_URL) || url.startsWith("file:///android_asset/")) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) { /* no handler for this URL */ }
        return true;
    }

    /** No connection on first launch, or the site is down: run the bundled copy. */
    private void useBundled() {
        if (onBundled) return;
        onBundled = true;
        web.loadUrl(BUNDLED_URL);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_MIC && pendingMicRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                pendingMicRequest.grant(pendingMicRequest.getResources());
            } else {
                pendingMicRequest.deny();
            }
            pendingMicRequest = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    /** The JavaScript bridge (window.GuitarLabHost). */
    private final class WebHost {
        /** Keep-awake: file:// has no Screen Wake Lock, and WebView lacks it too. */
        @JavascriptInterface
        public void setKeepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                }
            });
        }

        /** This APK's versionName — compared with version.json's "version". */
        @JavascriptInterface
        public String shellVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }
}
