import Foundation
import LocalAuthentication
import UIKit
import WebKit
import UniformTypeIdentifiers

/// The native half of both shims. One message handler, dispatched on `op`.
///
/// Every reply goes back as a resolved or rejected Promise in the page. The
/// rejection *message* is the DOMException name the page already reads —
/// 'NotAllowedError' for "nothing happened, try again" and 'AbortError' for
/// "the worker backed out" — so Shims.swift can rethrow it unchanged.
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {

    private weak var host: UIViewController?

    /// 내보내기, waiting on the document picker: the bytes on disk and the
    /// promise that must not be answered until they are somewhere permanent.
    /// The authentication in flight. See authenticate() — an LAContext that
    /// deallocates cancels its own evaluation, so this reference is what keeps
    /// the Face ID sheet on screen.
    private var authContext: LAContext?

    private var pendingSave: ((Any?, String?) -> Void)?
    private var pendingURL: URL?

    init(host: UIViewController) {
        self.host = host
        super.init()
    }

    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        let body = message.body as? [String: Any] ?? [:]
        let op = body["op"] as? String ?? ""
        let arg = body["arg"] as? [String: Any] ?? [:]

        switch op {
        case "bioAvailable": replyHandler(Self.bioAvailable(), nil)
        case "bioAuth":      authenticate(reason: arg["reason"] as? String ?? "", reply: replyHandler)
        case "saveFile":     saveFile(arg: arg, reply: replyHandler)
        default:             replyHandler(nil, "NotSupportedError")
        }
    }

    // MARK: 지문

    /// Biometrics only, no passcode fallback — parity with the Android build,
    /// which asks for BIOMETRIC_STRONG and nothing else. A device with nothing
    /// enrolled answers false here and the page drops to press-and-hold by
    /// itself, which is the same thing it does in a desktop browser.
    private static func bioAvailable() -> Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
    }

    private func authenticate(reason: String, reply: @escaping (Any?, String?) -> Void) {
        let context = LAContext()
        context.localizedCancelTitle = "취소"
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else {
            reply(nil, "NotAllowedError")
            return
        }
        // An LAContext cancels the evaluation it is running when it deallocates,
        // and evaluatePolicy's signature does nothing to keep it alive, so the
        // context is held here rather than left as a local for the optimiser to
        // release at a moment of its choosing.
        //
        // If you are chasing a punch that fails the instant it is asked, with no
        // sheet drawn: check whether the app was frontmost before you suspect
        // this. iOS refuses to evaluate biometrics for an inactive app and the
        // refusal arrives as a plain failure, indistinguishable from a worker
        // who declined. That is only reachable from a test harness driving a
        // simulator window that does not have focus — a worker's finger on the
        // punch pad means the app is active by definition — and it cost a round
        // of blaming this line for it. It is the same shape as the note in
        // CLAUDE.md about focus events in headless Chrome, and it lies the same
        // way: it looks exactly like a broken feature.
        authContext = context
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { [weak self] ok, _ in
            DispatchQueue.main.async {
                self?.authContext = nil
                // A face that did not match is retried inside the OS sheet, so
                // anything that reaches here is a real refusal or a cancel —
                // both of which the page reads as "nothing happened".
                ok ? reply(true, nil) : reply(nil, "NotAllowedError")
            }
        }
    }

    // MARK: 백업 내보내기

    private func saveFile(arg: [String: Any], reply: @escaping (Any?, String?) -> Void) {
        guard let dataURL = arg["data"] as? String,
              let bytes = Self.decodeDataURL(dataURL) else {
            reply(nil, "NotAllowedError")
            return
        }
        let name = (arg["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "worklog.json"
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do { try bytes.write(to: tmp) } catch { reply(nil, "NotAllowedError"); return }

        DispatchQueue.main.async { [weak self] in
            guard let self, let host = self.host else { reply(nil, "NotAllowedError"); return }
            // A second export before the first is answered would strand the
            // earlier promise — settle it rather than leave the page waiting.
            self.pendingSave?(nil, "AbortError")
            self.pendingSave = reply
            self.pendingURL = tmp

            let picker = UIDocumentPickerViewController(forExporting: [tmp], asCopy: true)
            picker.delegate = self
            picker.shouldShowFileExtensions = true
            host.present(picker, animated: true)
        }
    }

    /// Answers the waiting export exactly once, and clears the temp copy.
    private func settleSave(_ ok: Bool) {
        let reply = pendingSave
        let tmp = pendingURL
        pendingSave = nil
        pendingURL = nil
        if let tmp { try? FileManager.default.removeItem(at: tmp) }
        // Only now may the page say "내보냈습니다" — a backup the worker thinks
        // they have and does not is worse than no backup at all.
        ok ? reply?(true, nil) : reply?(nil, "AbortError")
    }

    /// "data:application/json;base64,eyJ..." -> the bytes, or nil if it is not that.
    private static func decodeDataURL(_ s: String) -> Data? {
        guard s.lowercased().hasPrefix("data:"), let comma = s.firstIndex(of: ",") else { return nil }
        let head = String(s[s.startIndex..<comma]).lowercased()
        let body = String(s[s.index(after: comma)...])
        if head.contains(";base64") {
            return Data(base64Encoded: body)
        }
        return (body.removingPercentEncoding ?? body).data(using: .utf8)
    }
}

extension Bridge: UIDocumentPickerDelegate {
    func documentPicker(_ c: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        settleSave(true)
    }
    func documentPickerWasCancelled(_ c: UIDocumentPickerViewController) {
        settleSave(false)
    }
}
