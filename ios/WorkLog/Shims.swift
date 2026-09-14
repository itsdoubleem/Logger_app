import Foundation

/// The JS halves of the native bridges, injected before any page script runs.
///
/// These are the iOS counterparts of android/.../BioShim.java and FileShim.java
/// and they keep the same promise: WorkLogApp.v2.dc.html is not modified for
/// the app and does not know it is inside one. It calls navigator.credentials
/// and navigator.share exactly as it does on the web.
///
/// The mechanism differs from Android's in one welcome way. WKWebView answers
/// postMessage with a real Promise (WKScriptMessageHandlerWithReply), so there
/// is no pending-map and no settle() callback to route back through the page —
/// the whole id-bookkeeping half of BioShim.java is simply absent here.
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

    /// 지문 · Face ID / Touch ID standing in for a platform authenticator.
    ///
    /// Unlike the Android shim this one does NOT stand aside for an existing
    /// window.PublicKeyCredential, and that difference is deliberate. WKWebView
    /// does expose the WebAuthn interface, so the Android guard
    /// ("if PublicKeyCredential exists, keep it") would hand the punch pad to
    /// an authenticator that cannot possibly work: WebKit resolves a passkey's
    /// relying party through the app's Associated Domains entitlement, and this
    /// page's origin is 127.0.0.1, which no domain can claim. The page would
    /// find isUserVerifyingPlatformAuthenticatorAvailable(), call it, and get
    /// back a rejection at punch time rather than at feature-detect time — the
    /// silent failure this repo keeps writing down.
    ///
    /// isUVPAA() is answered by LAContext.canEvaluatePolicy, so a phone (or a
    /// simulator) with no face or finger enrolled reports false and the app
    /// falls back to press-and-hold on its own, exactly as it does in a desktop
    /// browser. The guarantee is Android's guarantee: the person holding the
    /// phone was verified locally, nothing was sent anywhere, nothing is signed
    /// because there is no server to check a signature.
    static var bio: String { """
    (function () {
    \(bridge)
      function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
      window.PublicKeyCredential = function () {};
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable =
        function () { return nativeCall('bioAvailable').then(function (r) { return !!r; })
                                                       .catch(function () { return false; }); };
      window.PublicKeyCredential.isConditionalMediationAvailable =
        function () { return Promise.resolve(false); };
      if (!navigator.credentials) navigator.credentials = {};
      navigator.credentials.create = function () {
        return nativeCall('bioAuth', { reason: '\\uc9c0\\ubb38 \\ub4f1\\ub85d' }).then(function () {
          var id = rnd(16);
          return { rawId: id.buffer, type: 'public-key', authenticatorAttachment: 'platform' };
        });
      };
      navigator.credentials.get = function (o) {
        var allow = o && o.publicKey && o.publicKey.allowCredentials;
        var id = allow && allow.length ? allow[0].id : rnd(16).buffer;
        return nativeCall('bioAuth', { reason: '\\uc9c0\\ubb38 \\ud655\\uc778' }).then(function () {
          return { rawId: id, type: 'public-key', authenticatorAttachment: 'platform' };
        });
      };
    })();
    """ }

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
