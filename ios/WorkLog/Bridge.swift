import Foundation
import UIKit
import WebKit
import UniformTypeIdentifiers

/// The native half of the file shim. One message handler, dispatched on `op`.
///
/// Every reply goes back as a resolved or rejected Promise in the page. The
/// rejection *message* is the DOMException name the page already reads —
/// 'NotAllowedError' for "nothing happened, try again" and 'AbortError' for
/// "the worker backed out" — so Shims.swift can rethrow it unchanged.
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {

    private weak var host: UIViewController?

    /// 내보내기, waiting on the document picker: the bytes on disk and the
    /// promise that must not be answered until they are somewhere permanent.
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
        case "saveFile": saveFile(arg: arg, reply: replyHandler)
        default:         replyHandler(nil, "NotSupportedError")
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
