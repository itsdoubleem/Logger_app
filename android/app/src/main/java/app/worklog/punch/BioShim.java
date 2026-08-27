package app.worklog.punch;

/**
 * The JS half of the fingerprint bridge, injected before any page script runs.
 *
 * It installs a platform authenticator only when the WebView does not already
 * have one, so the app's own WebAuthn code path is what executes either way —
 * WorkLogApp.dc.html is not modified for the APK and does not know it is in an
 * APK. create() enrols, get() verifies, both through Android's BiometricPrompt.
 *
 * The credential is a random id the app stores in localStorage exactly as it
 * does on the web. It is not a WebAuthn key pair and nothing is signed: there
 * is no server to verify a signature, which is the app's stated design. What
 * is real is the verification — the prompt is the OS one, and it resolves only
 * when the phone accepts the fingerprint.
 */
final class BioShim {

    private BioShim() {}

    /** JSON-quotes a string for injection into evaluateJavascript. */
    static String quote(String s) {
        if (s == null) return "\"\"";
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n");  break;
                case '\r': b.append("\\r");  break;
                default:
                    if (c < 0x20 || c > 0x7e) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    static final String SOURCE =
        "(function () {\n" +
        "  if (!window.WorkLogNative) return;\n" +
        "  try { if (!window.WorkLogNative.available()) return; } catch (e) { return; }\n" +
        // a WebView that ships its own platform authenticator keeps it
        "  if (window.PublicKeyCredential && window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return;\n" +
        "  var pending = {};\n" +
        "  window.__worklogBio = { settle: function (id, ok, err) {\n" +
        "    var p = pending[id]; delete pending[id];\n" +
        "    if (!p) return;\n" +
        "    if (ok) p.res(); else { var e = new Error('biometric'); e.name = err || 'NotAllowedError'; p.rej(e); }\n" +
        "  } };\n" +
        "  function ask(title, sub) {\n" +
        "    return new Promise(function (res, rej) {\n" +
        "      var id = String(Date.now()) + '-' + String(Math.random()).slice(2);\n" +
        "      pending[id] = { res: res, rej: rej };\n" +
        "      try { window.WorkLogNative.authenticate(id, title, sub); }\n" +
        "      catch (e) { delete pending[id]; var x = new Error('bridge'); x.name = 'NotSupportedError'; rej(x); }\n" +
        "    });\n" +
        "  }\n" +
        "  function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }\n" +
        "  window.PublicKeyCredential = function () {};\n" +
        "  window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = function () { return Promise.resolve(true); };\n" +
        "  window.PublicKeyCredential.isConditionalMediationAvailable = function () { return Promise.resolve(false); };\n" +
        "  if (!navigator.credentials) navigator.credentials = {};\n" +
        "  navigator.credentials.create = function () {\n" +
        "    return ask('\\uc9c0\\ubb38 \\ub4f1\\ub85d', 'Register this phone\\u2019s fingerprint').then(function () {\n" +
        "      var id = rnd(16);\n" +
        "      return { rawId: id.buffer, type: 'public-key', authenticatorAttachment: 'platform' };\n" +
        "    });\n" +
        "  };\n" +
        "  navigator.credentials.get = function (o) {\n" +
        "    var allow = o && o.publicKey && o.publicKey.allowCredentials;\n" +
        "    var id = allow && allow.length ? allow[0].id : rnd(16).buffer;\n" +
        "    return ask('\\uc9c0\\ubb38 \\ud655\\uc778', 'Verify to record the punch').then(function () {\n" +
        "      return { rawId: id, type: 'public-key', authenticatorAttachment: 'platform' };\n" +
        "    });\n" +
        "  };\n" +
        "})();";
}
