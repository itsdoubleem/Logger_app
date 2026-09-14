import Foundation
import Network

/// The page's origin, and the reason there is a server in an offline app at all.
///
/// WorkLogApp.v2.dc.html gives up on the fingerprint the moment
/// `window.isSecureContext` is false, and it keeps every record the worker owns
/// in localStorage, which is keyed by origin. A WKWebView can load the page
/// three ways and only one of them satisfies both:
///
///   file://              — not a secure context in WebKit; localStorage is
///                          unreliable and the punch pad drops to press-and-hold.
///   a custom scheme      — WKURLSchemeHandler cannot register a scheme as
///                          trustworthy, so isSecureContext is false again.
///   http://127.0.0.1     — loopback is "potentially trustworthy" by spec, so
///                          the page behaves exactly as it does on a web host.
///
/// So the app serves itself, on the loopback interface, from the bundle. This
/// is the iOS counterpart of Android's WebViewAssetLoader origin
/// (https://appassets.androidplatform.net) and exists for the same reason.
/// The app still talks to nothing: the listener is bound to 127.0.0.1 and
/// there is no outbound request anywhere in the codebase.
///
/// PORT IS FIXED, AND MUST STAY FIXED. The port is part of the origin, so a
/// port picked at random — or a fallback to "the next free one" — gives the
/// page a different localStorage on every launch and the worker's entire
/// history disappears without a single error being raised. If the bind fails
/// we retry the same port rather than move; see start().
final class LocalServer {

    static let port: UInt16 = 8787
    static var origin: String { "http://127.0.0.1:\(port)" }

    private let root: URL
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "app.worklog.punch.server")

    init(root: URL) { self.root = root }

    /// Binds the fixed port, retrying it rather than moving to another one.
    /// A relaunch can find the previous socket still in TIME_WAIT; that clears
    /// in a moment. Moving ports would "work" and lose every record, so the
    /// only two outcomes here are the right port or a thrown error.
    func start(attempts: Int = 20) throws {
        var lastError: Error?
        for _ in 0..<attempts {
            do {
                try bind()
                return
            } catch {
                lastError = error
                Thread.sleep(forTimeInterval: 0.25)
            }
        }
        throw lastError ?? POSIXError(.EADDRINUSE)
    }

    private func bind() throws {
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredInterfaceType = .loopback
        let l = try NWListener(using: params, on: NWEndpoint.Port(rawValue: Self.port)!)
        l.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
        l.start(queue: queue)
        listener = l
    }

    private func accept(_ conn: NWConnection) {
        conn.start(queue: queue)
        receive(conn, buffer: Data())
    }

    /// Reads until the end of the request head. The app never sends a body —
    /// every request the page makes is a GET for a file that shipped in the
    /// bundle — so the head is the whole request.
    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] chunk, _, done, error in
            guard let self else { return }
            var buf = buffer
            if let chunk { buf.append(chunk) }
            if let range = buf.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: buf[..<range.lowerBound], as: UTF8.self)
                self.respond(to: head, on: conn)
                return
            }
            if error != nil || done {
                conn.cancel()
                return
            }
            self.receive(conn, buffer: buf)
        }
    }

    private func respond(to head: String, on conn: NWConnection) {
        let requestLine = head.split(separator: "\r\n", maxSplits: 1).first.map(String.init) ?? ""
        let parts = requestLine.split(separator: " ")
        let method = parts.first.map(String.init) ?? "GET"
        var path = parts.count > 1 ? String(parts[1]) : "/"

        if let q = path.firstIndex(of: "?") { path = String(path[..<q]) }
        path = path.removingPercentEncoding ?? path
        if path == "/" { path = "/index.html" }

        guard let file = resolve(path) else {
            send(status: "404 Not Found", body: Data("not found".utf8), type: "text/plain", method: method, on: conn)
            return
        }
        guard let data = try? Data(contentsOf: file) else {
            send(status: "500 Internal Server Error", body: Data(), type: "text/plain", method: method, on: conn)
            return
        }
        send(status: "200 OK", body: data, type: Self.mime(for: file.pathExtension), method: method, on: conn)
    }

    /// Maps a URL path to a file inside the bundled site, refusing anything
    /// that climbs out of it.
    private func resolve(_ path: String) -> URL? {
        let clean = path.split(separator: "/").filter { $0 != ".." && $0 != "." }
        let file = clean.reduce(root) { $0.appendingPathComponent(String($1)) }
        guard file.standardizedFileURL.path.hasPrefix(root.standardizedFileURL.path) else { return nil }
        return FileManager.default.fileExists(atPath: file.path) ? file : nil
    }

    private func send(status: String, body: Data, type: String, method: String, on conn: NWConnection) {
        var head = "HTTP/1.1 \(status)\r\n"
        head += "Content-Type: \(type)\r\n"
        head += "Content-Length: \(body.count)\r\n"
        // The site is baked into the bundle and changes only when the app is
        // replaced, but a cached copy of the previous build outliving an
        // upgrade is the exact trap pwa/sw.js already had to be fixed for.
        head += "Cache-Control: no-store\r\n"
        head += "Connection: close\r\n\r\n"
        var out = Data(head.utf8)
        if method != "HEAD" { out.append(body) }
        conn.send(content: out, completion: .contentProcessed { _ in conn.cancel() })
    }

    private static func mime(for ext: String) -> String {
        switch ext.lowercased() {
        case "html":        return "text/html; charset=utf-8"
        case "js":          return "text/javascript; charset=utf-8"
        case "css":         return "text/css; charset=utf-8"
        case "json":        return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json; charset=utf-8"
        case "png":         return "image/png"
        case "svg":         return "image/svg+xml"
        case "woff2":       return "font/woff2"
        default:            return "application/octet-stream"
        }
    }
}
