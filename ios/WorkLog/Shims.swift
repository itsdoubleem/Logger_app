import Foundation

/// The JS half of the native bridge, injected before any page script runs.
///
/// This is the iOS counterpart of android/.../FileShim.java and keeps the same
/// promise: WorkLogApp.v2.dc.html is not modified for the app and does not know
/// it is inside one. It calls navigator.share exactly as it does on the web.
///
/// The mechanism differs from Android's in one welcome way. WKWebView answers
/// postMessage with a real Promise (WKScriptMessageHandlerWithReply), so there
/// is no pending-map and no settle() callback to route back through the page.
///
/// A Face ID shim (`bio`) lived here until 2026-10-26, answering
/// navigator.credentials for the fingerprint punch. Punching is one tap now
/// (CHANGELOG, eighty-sixth entry), so it is gone, with LocalAuthentication.
enum Shims {

    /// Shared preamble: `nativeCall(op, arg)` -> Promise, rejecting with an
    /// Error whose .name is what the page already knows how to read
    /// ('NotAllowedError' = nothing happened, 'AbortError' = worker backed out).
    private static let bridge = """
      var mh = window.webkit && window.webkit.messageHandlers
               && window.webkit.messageHandlers.worklog;
      if (!mh) return;
      function nativeCall(op, arg) {
        return mh.postMessage({ op: op, arg: arg || {} }).catch(function (e) {
          var x = new Error('bridge');
          x.name = (e && e.message) || 'NotAllowedError';
          throw x;
        });
      }
    """

    /// 백업 내보내기 · a share that ends in a file the worker can actually find.
    ///
    /// Same guard as the Android shim, for the same reason: a WebView that
    /// ships a working Web Share keeps it, because the real share sheet offers
    /// Files, iCloud and AirDrop and this stand-in offers only Files. It is
    /// installed only where navigator.canShare is missing.
    ///
    /// Restoring needs nothing here — <input type="file"> opens the document
    /// picker in WKWebView without any host code, which is the one thing iOS
    /// gives for free that Android charged for.
    static var files: String { """
    (function () {
    \(bridge)
      if (navigator.canShare) return;
      navigator.canShare = function (d) { return !!(d && d.files && d.files.length === 1); };
      navigator.share = function (d) {
        if (!navigator.canShare(d)) return Promise.reject(new TypeError('nothing to share'));
        var f = d.files[0];
        return new Promise(function (res, rej) {
          var fr = new FileReader();
          fr.onerror = function () { var e = new Error('read'); e.name = 'NotAllowedError'; rej(e); };
          fr.onload = function () {
            nativeCall('saveFile', {
              name: f.name || 'worklog.json',
              mime: f.type || 'application/json',
              data: String(fr.result)
            }).then(res, rej);
          };
          fr.readAsDataURL(f);
        });
      };
    })();
    """ }
}
