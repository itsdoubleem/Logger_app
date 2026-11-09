import UIKit
import WebKit

/// The whole app, offline, inside the bundle.
///
/// This is the iOS counterpart of android/.../MainActivity.java and it does the
/// same two jobs: give the page a real secure origin, and hand it a way to
/// write a backup file. (A third — Face ID for the fingerprint punch — went
/// with the one-tap pad on 2026-10-26.) The page itself is byte-identical
/// to the one the web build and the APK serve.
///
/// The app talks to nothing. There is no outbound request in the codebase, the
/// server it does run is bound to the loopback interface, and every record the
/// worker owns stays in that origin's localStorage on this device.
final class PunchViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private var server: LocalServer!
    private var web: WKWebView!
    private var bridge: Bridge!

    /// The app's ground — #f3f2f2 light, #2b2a29 graphite dark. Set on every
    /// layer the worker can see behind the page (the window, the web view, its
    /// scroll view) so a rubber-band scroll or the area beside the notch never
    /// flashes white or black.
    private static let groundLight = UIColor(red: 0xf3/255, green: 0xf2/255, blue: 0xf2/255, alpha: 1)
    private static let groundDark = UIColor(red: 0x2b/255, green: 0x2a/255, blue: 0x29/255, alpha: 1)

    /// 화면 · the theme the page chose (설정 › 화면), reported through
    /// WorkLogNative.setDarkBars. Until the page reports, follow the iPhone —
    /// which is what 자동 does anyway, so the first frame is usually right.
    /// The page can choose 라이트 on a dark iPhone or 다크 on a light one, and
    /// no trait collection knows about that, so this value wins once it is set.
    var pageDark: Bool? {
        didSet { paintGround() }
    }
    private var isDark: Bool { pageDark ?? (traitCollection.userInterfaceStyle == .dark) }

    private func paintGround() {
        let g = isDark ? Self.groundDark : Self.groundLight
        view.backgroundColor = g
        web?.backgroundColor = g
        web?.scrollView.backgroundColor = g
        setNeedsStatusBarAppearanceUpdate()
    }

    override func traitCollectionDidChange(_ previous: UITraitCollection?) {
        super.traitCollectionDidChange(previous)
        // only matters before the page has spoken; after that it repaints itself
        // through setDarkBars when 자동 follows the change
        if pageDark == nil { paintGround() }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = isDark ? Self.groundDark : Self.groundLight

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
        // Must run before the page's own scripts, or the page has already
        // decided there is no share sheet by the time we install one.
        for source in [Shims.files, Shims.theme] {
            ucc.addUserScript(WKUserScript(source: source,
                                           injectionTime: .atDocumentStart,
                                           forMainFrameOnly: true))
        }

        web = WKWebView(frame: view.bounds, configuration: config)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = isDark ? Self.groundDark : Self.groundLight
        web.scrollView.backgroundColor = web.backgroundColor
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
    /// Every one of these is a silent failure if it is wrong: an origin that is
    /// not secure or not fixed is not the one the records were saved under, a missing
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
          share:  !!navigator.canShare
        })
        """
        webView.evaluateJavaScript(probe) { value, _ in
            NSLog("[worklog] %@", String(describing: value ?? "nil"))
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

    /// Light text on the graphite ground, dark text on the light one — fixed at
    /// .darkContent, 다크 left the clock and battery invisible.
    override var preferredStatusBarStyle: UIStatusBarStyle { isDark ? .lightContent : .darkContent }
}
