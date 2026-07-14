package com.mreindl.guitarlab;

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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * GuitarLab wrapper: a full-screen WebView serving the bundled web app from
 * assets. Native concerns: bridging the WebView's microphone request (tuner
 * tab) to Android's runtime RECORD_AUDIO permission, and sending external
 * links (e.g. the auto-updater's APK download) to the system browser.
 */
public class MainActivity extends Activity {

    private static final int REQ_MIC = 1;

    private WebView web;
    private PermissionRequest pendingMicRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        // Let the bundled app fetch version.json from GitHub for the startup
        // update check — WebView blocks network requests from file:// pages
        // without this. All file:// content here is our own bundled assets.
        s.setAllowUniversalAccessFromFileURLs(true);

        // Screen Wake Lock isn't available to file:// pages (not a secure
        // context), so the web app calls GuitarLabHost.setKeepScreenOn(...) to
        // hold the screen on during active practice. Only our own bundled
        // assets run in this WebView (external links open in the browser), so
        // exposing this single method is safe.
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
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file://")) return false; // in-app navigation
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) { /* no handler for this URL */ }
                return true;
            }
        });

        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
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

    /** Bridge the web app's keep-awake requests to the window's screen flag. */
    private final class WebHost {
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
    }
}
