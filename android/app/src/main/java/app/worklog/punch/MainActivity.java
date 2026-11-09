package app.worklog.punch;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.fragment.app.FragmentActivity;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;

import java.io.OutputStream;
import java.util.Collections;
import java.util.Set;

/**
 * The whole app, offline, inside the APK.
 *
 * The page is served through WebViewAssetLoader on https://appassets.androidplatform.net,
 * not from file://. That matters: it is a real secure origin, so localStorage
 * persists, the service worker registers, and the page behaves exactly as it
 * does on a web host. Loading the same file from file:// would strip all of it.
 *
 * Until 2026-10-26 a BioBridge here answered navigator.credentials with
 * Android's BiometricPrompt, because the punch pad asked for a fingerprint.
 * Punching is one tap now (CHANGELOG, eighty-sixth entry), so the fingerprint
 * bridge, its shim, the USE_BIOMETRIC permission and androidx.biometric are gone.
 *
 * A WebView also has no file picker and no downloads unless the host supplies
 * them, which is what onShowFileChooser (백업 불러오기) and the save bridge
 * (백업 내보내기) below are for. Both go through the Storage Access Framework,
 * so the worker chooses the file and the folder, no storage permission is
 * asked for, and nothing leaves the phone — the app still holds no INTERNET
 * permission. Without these the backup silently did nothing in either
 * direction, which is the worst way for a records app to fail.
 */
public class MainActivity extends FragmentActivity {

    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START = ORIGIN + "/assets/www/index.html";

    private WebView web;

    // 화면 · the phone's dark-mode setting, handed to the page (2026-11-09,
    // ninety-fourth entry). The manifest keeps uiMode in configChanges, so the
    // activity is not recreated when the worker flips dark mode, and the
    // WebView's own prefers-color-scheme can be left on the value it started
    // with. The page reads window.__worklogSystemDark first instead: set at
    // document start, and updated in place by onConfigurationChanged.
    private ScriptHandler darkScript;

    // 불러오기 · the page's <input type="file"> waiting on a picked document
    private ValueCallback<Uri[]> fileCallback;
    private ActivityResultLauncher<Intent> picker;

    // 내보내기 · the bytes waiting for a destination, and the JS promise to settle
    private ActivityResultLauncher<Intent> saver;
    private byte[] pendingBytes;
    private String pendingId;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        // both launchers must be registered before the activity starts
        picker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
            ValueCallback<Uri[]> cb = fileCallback;
            fileCallback = null;
            if (cb == null) return;
            // a cancelled picker must hand back null, or the file input jams
            // and the worker can never open the picker again
            cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.getResultCode(), r.getData()));
        });

        saver = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
            String id = pendingId;
            byte[] data = pendingBytes;
            pendingId = null;
            pendingBytes = null;
            Uri uri = r.getData() == null ? null : r.getData().getData();
            if (r.getResultCode() != RESULT_OK || uri == null || data == null) {
                // backing out of the save sheet is not a failure: the page
                // treats AbortError as "nothing happened" and says nothing
                settleSave(id, false, "AbortError");
                return;
            }
            try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new java.io.IOException("no stream");
                out.write(data);
                out.flush();
                settleSave(id, true, "");
            } catch (Exception e) {
                // only now may the page claim the export failed — and it must,
                // because a backup that was never written is worse than none.
                // DataError: the page reads the other DOMException names as a
                // cancel and says nothing (review 2026-10-27 S4)
                settleSave(id, false, "DataError");
            }
        });

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        // A WebView paints opaque white until its first frame, which hid the
        // night theme's dark window (dark-mode review S2). Until the page picks
        // its own theme and calls setDarkBars, guess from the phone's setting.
        web.setBackgroundColor(systemDark() ? GROUND_DARK : GROUND_LIGHT);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage — every record lives here
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);                    // the layout is fixed; don't let font scaling reflow it

        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(@NonNull WebView v, @NonNull WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(@NonNull WebView v, @NonNull WebResourceRequest req) {
                // nothing in this app links out; if anything ever does, refuse it
                // rather than open a page inside the punch clock
                return !ORIGIN.equals(req.getUrl().getScheme() + "://" + req.getUrl().getHost());
            }
        });

        // 백업 불러오기 · without this the file input does nothing at all in a
        // WebView — the tap is swallowed and no picker ever opens
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(@NonNull WebView v,
                                             @NonNull ValueCallback<Uri[]> cb,
                                             @NonNull FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                // deliberately not params.createIntent(): a backup that came
                // back from Drive or KakaoTalk is often octet-stream, and an
                // application/json filter hides it. The page checks the
                // contents anyway and rejects anything that is not a backup.
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    picker.launch(i);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        // 백업 내보내기, fallback path · a WebView old enough to miss the
        // document-start script leaves the page on its <a download>, and a
        // blob: download dies silently unless it is caught here
        web.setDownloadListener((url, ua, disposition, mime, size) -> {
            if (url == null || !url.startsWith("blob:")) return;
            web.evaluateJavascript(FileShim.rescueDownload(url, backupFileName(disposition)), null);
        });

        // the service worker fetches through the same asset loader, so its
        // precache works and the app opens with the network off (which is the
        // only state it is ever in — the APK holds no INTERNET permission)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
                @Override
                public WebResourceResponse shouldInterceptRequest(@NonNull WebResourceRequest req) {
                    return loader.shouldInterceptRequest(req.getUrl());
                }
            });
        }

        web.addJavascriptInterface(new NativeBridge(), "WorkLogNative");

        // must run before the page's own scripts, or the page has already
        // decided there is no share sheet by the time we install one
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Set<String> origins = Collections.singleton(ORIGIN);
            WebViewCompat.addDocumentStartJavaScript(web, FileShim.SOURCE, origins);
        }
        setSystemDarkScript();

        setContentView(web);
        if (saved == null) web.loadUrl(START);
        else web.restoreState(saved);
    }

    private static final int GROUND_LIGHT = 0xFFF3F2F2;
    private static final int GROUND_DARK = 0xFF2B2A29;

    /**
     * The bars and the icons on them, always together (dark-mode review M1).
     * Only API 35+ (targetSdk 36) is forced edge-to-edge, where the bars are
     * transparent over the page. Below that each bar keeps a colour of its own
     * — Material's black navigation bar, a grey or black status bar — and
     * flipping only the icon colour put dark back/home buttons on a black bar.
     * So below 35 the bar takes the page's ground first, then the icons follow.
     * API 24–25 cannot draw dark navigation icons at all, so there the
     * navigation bar is left exactly as the theme draws it.
     */
    private void paintBars(boolean dark) {
        int ground = dark ? GROUND_DARK : GROUND_LIGHT;
        if (web != null) web.setBackgroundColor(ground);
        WindowInsetsControllerCompat c =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (Build.VERSION.SDK_INT < 35) getWindow().setStatusBarColor(ground);
        c.setAppearanceLightStatusBars(!dark);
        if (Build.VERSION.SDK_INT >= 26) {
            if (Build.VERSION.SDK_INT < 35) getWindow().setNavigationBarColor(ground);
            c.setAppearanceLightNavigationBars(!dark);
        }
    }

    /** Is the phone in dark mode right now? */
    private boolean systemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    /** The value every future page load starts with — replaced on each change. */
    private void setSystemDarkScript() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        if (darkScript != null) darkScript.remove();
        darkScript = WebViewCompat.addDocumentStartJavaScript(web,
                "window.__worklogSystemDark=" + systemDark() + ";", Collections.singleton(ORIGIN));
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration c) {
        super.onConfigurationChanged(c);
        if (web == null) return;
        setSystemDarkScript();
        // and the page that is open now: it re-decides only if it is on 자동
        web.evaluateJavascript("window.__worklogSystemDark=" + systemDark()
                + ";window.dispatchEvent(new Event('worklogsystemtheme'));", null);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // a stray back press must never look like the app lost the shift
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    /** Resolves the backup save's JS promise on the WebView thread. An empty id is the fallback path: nobody is waiting. */
    private void settleSave(final String id, final boolean ok, final String err) {
        if (id == null || id.isEmpty()) return;
        final String js = "window.__worklogFiles && window.__worklogFiles.settle("
                + FileShim.quote(id) + "," + ok + "," + FileShim.quote(err) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    /** Only used by the fallback path, where the anchor's own filename is lost. */
    private static String backupFileName(String disposition) {
        if (disposition != null) {
            java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("filename\\*?=(?:UTF-8'')?\"?([^\";]+)\"?")
                    .matcher(disposition);
            if (m.find()) {
                String n = Uri.decode(m.group(1)).trim();
                if (!n.isEmpty()) return n;
            }
        }
        java.util.Calendar c = java.util.Calendar.getInstance();
        return String.format(java.util.Locale.US, "근무기록-%04d%02d%02d.json",
                c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH) + 1,
                c.get(java.util.Calendar.DAY_OF_MONTH));
    }

    /** "data:application/json;base64,eyJ..." → the bytes, or null if it is not that. */
    @Nullable
    private static byte[] decodeDataUrl(String dataUrl) {
        if (dataUrl == null) return null;
        int comma = dataUrl.indexOf(',');
        if (comma < 0 || !dataUrl.regionMatches(true, 0, "data:", 0, 5)) return null;
        String head = dataUrl.substring(0, comma);
        String body = dataUrl.substring(comma + 1);
        try {
            if (head.toLowerCase(java.util.Locale.US).contains(";base64")) {
                return Base64.decode(body, Base64.DEFAULT);
            }
            return Uri.decode(body).getBytes("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    private class NativeBridge {

        /**
         * 화면 · the status bar and navigation bar icons follow the page's theme:
         * dark icons on the light ground, light icons on the dark one. The page
         * calls this whenever its theme changes — including when the worker picks
         * 어둡게 on a phone that is in light mode, which no resource qualifier sees.
         */
        @JavascriptInterface
        public void setDarkBars(final boolean dark) {
            runOnUiThread(() -> paintBars(dark));
        }

        /**
         * 백업 파일 저장 · the page hands over the finished backup as a data:
         * URL and waits. It stays waiting until the worker has picked a
         * destination and the bytes are on disk, so "내보냈습니다" is only ever
         * shown when a file really exists.
         */
        @JavascriptInterface
        public void saveFile(final String id, final String name, final String mime, final String dataUrl) {
            final byte[] bytes = decodeDataUrl(dataUrl);
            if (bytes == null) {
                settleSave(id, false, "DataError");
                return;
            }
            runOnUiThread(() -> {
                // a second export before the first is answered would strand the
                // earlier promise — settle it rather than leave the page hanging
                if (pendingId != null) settleSave(pendingId, false, "AbortError");
                pendingId = id;
                pendingBytes = bytes;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/json" : mime);
                i.putExtra(Intent.EXTRA_TITLE, name == null || name.isEmpty() ? "worklog.json" : name);
                try {
                    saver.launch(i);
                } catch (Exception e) {
                    pendingId = null;
                    pendingBytes = null;
                    settleSave(id, false, "DataError");
                }
            });
        }
    }
}
