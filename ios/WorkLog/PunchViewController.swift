import UIKit
import WebKit

/// The whole app, offline, inside the bundle.
///
/// This is the iOS counterpart of android/.../MainActivity.java and it does the
/// same three jobs: give the page a real secure origin, hand it a fingerprint,
/// and hand it a way to write a backup file. The page itself is byte-identical
/// to the one the web build and the APK serve.
///
/// The app talks to nothing. There is no outbound request in the codebase, the
/// server it does run is bound to the loopback interface, and every record the
/// worker owns stays in that origin's localStorage on this device.
final class PunchViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private var server: LocalServer!
    private var web: WKWebView!
    private var bridge: Bridge!

    /// #f3f2f2 — the app's ground. Set on every layer the worker can see behind
    /// the page (the window, the web view, its scroll view) so a rubber-band
    /// scroll or the area beside the notch never flashes white or black.
    private static let ground = UIColor(red: 0xf3/255, green: 0xf2/255, blue: 0xf2/255, alpha: 1)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.ground

        let www = Bundle.main.url(forResource: "www", withExtension: nil)!
        server = LocalServer(root: www)
        do {
            try server.start()
        } catch {
            showFatal("포트를 열지 못했습니다\nCould not open the local port.")
            return
        }

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()          // localStorage — every record lives here
        config.allowsInlineMediaPlayback = true

        bridge = Bridge(host: self)
        let ucc = config.userContentController
        ucc.addScriptMessageHandler(bridge, contentWorld: .page, name: "worklog")
        // Both must run before the page's own scripts, or the app has already
        // decided there is no authenticator by the time we install one.
        for source in [Shims.bio, Shims.files] {
            ucc.addUserScript(WKUserScript(source: source,
                                           injectionTime: .atDocumentStart,
                                           forMainFrameOnly: true))
        }

        web = WKWebView(frame: view.bounds, configuration: config)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = Self.ground
        web.scrollView.backgroundColor = Self.ground
        web.scrollView.contentInsetAdjustmentBehavior = .never
        // The layout is fixed and the page does its own scrolling; a bounce at
        // the top drags the punch pad out from under the finger.
        web.scrollView.bounces = false
        web.allowsBackForwardNavigationGestures = false
        view.addSubview(web)

        web.load(URLRequest(url: URL(string: LocalServer.origin + "/index.html")!))
    }

    /// What the origin actually bought us, printed once per launch.
    ///
    /// Every one of these is a silent failure if it is wrong: isSecureContext
    /// false means the punch pad quietly drops to press-and-hold, a missing
    /// localStorage means the worker's records are gone and nothing is raised,
    /// and an origin that moved means they are gone the next launch instead.
    /// The repo's standing rule is that when a change appears to do nothing you
    /// measure it, so this measures it.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if DEBUG
        let probe = """
        JSON.stringify({
          origin: location.origin,
          secure: window.isSecureContext,
          store:  (function () { try { localStorage.setItem('__p','1');
                                       return localStorage.getItem('__p') === '1'; }
                                 catch (e) { return false; } })(),
          records: !!localStorage.getItem('worklog.v2'),
          sw:     !!navigator.serviceWorker,
          share:  !!navigator.canShare,
          cred:   !!(window.PublicKeyCredential && navigator.credentials)
        })
        """
        webView.evaluateJavaScript(probe) { value, _ in
            NSLog("[worklog] %@", String(describing: value ?? "nil"))
        }
        // isUVPAA() answers a Promise, and evaluateJavaScript cannot await one --
        // it hands back nil, which reads exactly like "no authenticator".
        webView.callAsyncJavaScript(
            "return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()",
            in: nil, in: .page) { result in
                NSLog("[worklog] isUVPAA=%@", String(describing: result))
        }
        #endif
    }

    /// Nothing in this app links out. If anything ever does, refuse it rather
    /// than open a page inside the punch clock.
    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url?.absoluteString ?? ""
        decisionHandler(url.hasPrefix(LocalServer.origin) || url.hasPrefix("about:") ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showFatal("앱을 여는 데 실패했습니다\n\(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFatal("앱을 여는 데 실패했습니다\n\(error.localizedDescription)")
    }

    /// A records app must never come up as a blank screen — if the page did not
    /// load, say so on the screen rather than leave the worker tapping nothing.
    private func showFatal(_ text: String) {
        let label = UILabel(frame: view.bounds.insetBy(dx: 24, dy: 24))
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = UIColor(red: 0xec/255, green: 0x30/255, blue: 0x13/255, alpha: 1)
        label.text = text
        view.addSubview(label)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }
}
