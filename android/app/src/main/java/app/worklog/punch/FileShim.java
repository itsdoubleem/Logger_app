package app.worklog.punch;

/**
 * The JS half of the backup bridge, injected before any page script runs.
 *
 * The app's 내보내기 hands the backup to navigator.share() and only falls back
 * to an <a download> when the WebView has no share. An Android WebView has
 * neither: navigator.share does not exist, and a blob download goes nowhere
 * unless the host sets a DownloadListener. The old build had none of it, so
 * the export said "내보냈습니다" while nothing had been written — and the file
 * the worker thought they had was not there when the phone was wiped.
 *
 * This installs a real navigator.share backed by the Storage Access Framework:
 * the worker picks where the file goes (Drive, Files, an SD card), the promise
 * resolves only once the bytes are actually written, and cancelling rejects
 * with AbortError — which the app already reads as "nothing happened", not as
 * a success. WorkLogApp.dc.html is not modified for the APK and still does not
 * know it is in one.
 *
 * Restoring needs nothing here: an <input type="file"> works as soon as the
 * host implements WebChromeClient.onShowFileChooser, which MainActivity does.
 */
final class FileShim {

    private FileShim() {}

    static final String SOURCE =
        "(function () {\n" +
        "  if (!window.WorkLogNative || !window.WorkLogNative.saveFile) return;\n" +
        // a WebView that ships a real Web Share keeps it — this is only a stand-in
        "  if (navigator.canShare) return;\n" +
        "  var pending = {};\n" +
        "  window.__worklogFiles = { settle: function (id, ok, err) {\n" +
        "    var p = pending[id]; delete pending[id];\n" +
        "    if (!p) return;\n" +
        "    if (ok) p.res(); else { var e = new Error('save'); e.name = err || 'AbortError'; p.rej(e); }\n" +
        "  } };\n" +
        "  navigator.canShare = function (d) { return !!(d && d.files && d.files.length === 1); };\n" +
        "  navigator.share = function (d) {\n" +
        "    if (!navigator.canShare(d)) return Promise.reject(new TypeError('nothing to share'));\n" +
        "    var f = d.files[0];\n" +
        "    return new Promise(function (res, rej) {\n" +
        "      var fr = new FileReader();\n" +
        "      fr.onerror = function () { var e = new Error('read'); e.name = 'NotAllowedError'; rej(e); };\n" +
        "      fr.onload = function () {\n" +
        "        var id = String(Date.now()) + '-' + String(Math.random()).slice(2);\n" +
        "        pending[id] = { res: res, rej: rej };\n" +
        "        try { window.WorkLogNative.saveFile(id, f.name || 'worklog.json', f.type || 'application/json', String(fr.result)); }\n" +
        "        catch (e) { delete pending[id]; var x = new Error('bridge'); x.name = 'NotAllowedError'; rej(x); }\n" +
        "      };\n" +
        "      fr.readAsDataURL(f);\n" +
        "    });\n" +
        "  };\n" +
        "})();";

    /**
     * Last resort, for a WebView too old to take a document-start script: the
     * page fell through to an <a download>, so pull the blob back out and put
     * it through the same save. Nothing awaits this one — the id is empty and
     * settle() drops it — so the page's own message is all the worker sees.
     */
    static String rescueDownload(String url, String name) {
        return "(function () {\n" +
            "  fetch(" + BioShim.quote(url) + ").then(function (r) { return r.blob(); }).then(function (b) {\n" +
            "    var fr = new FileReader();\n" +
            "    fr.onload = function () { window.WorkLogNative.saveFile('', " + BioShim.quote(name) + ", 'application/json', String(fr.result)); };\n" +
            "    fr.readAsDataURL(b);\n" +
            "  }).catch(function () {});\n" +
            "})();";
    }
}
