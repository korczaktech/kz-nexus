import SwiftUI
import UIKit
import WebKit
import UniformTypeIdentifiers

struct ContentView: View {
    @ObservedObject var bridge: IOSBridge

    var body: some View {
        ZStack {
            WebContainer(bridge: bridge)
                .background(Color.black)
        }
        .onOpenURL { url in
            bridge.openDocument(url)
        }
    }
}

final class IOSBridge: NSObject, ObservableObject, UIDocumentPickerDelegate {
    @Published var pendingDocument: URL?
    weak var webView: WKWebView?

    let appURL = URL(string: "https://korczaktech.github.io/kz-nexus/")!

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    func openDocument(_ url: URL) {
        guard url.isFileURL else { return }
        let granted = url.startAccessingSecurityScopedResource()
        defer {
            if granted { url.stopAccessingSecurityScopedResource() }
        }

        do {
            let data = try Data(contentsOf: url)
            let name = url.lastPathComponent.replacingOccurrences(of: "'", with: "\\'")
            let base64 = data.base64EncodedString()
            let mime = mimeType(for: url.pathExtension)
            let script = "window.dispatchEvent(new CustomEvent('ios-document-open', {detail:{name:'\(name)',mime:'\(mime)',base64:'\(base64)'}}));"
            webView?.evaluateJavaScript(script)
        } catch {
            webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('ios-document-error'));")
        }
    }

    private func mimeType(for ext: String) -> String {
        guard let type = UTType(filenameExtension: ext),
              let mime = type.preferredMIMEType else { return "application/octet-stream" }
        return mime
    }

    func pickDocument() {
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).first else { return }

        let picker = UIDocumentPickerViewController(
            forOpeningContentTypes: [
                .plainText, .text, .utf8PlainText, .rtf, .html, .json,
                .commaSeparatedText, .xml, .pdf, .item
            ],
            asCopy: true
        )
        picker.allowsMultipleSelection = false
        picker.delegate = self

        root.keyWindow?.rootViewController?.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        openDocument(url)
    }

    func share(url: URL) {
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).first,
              let presenter = root.keyWindow?.rootViewController else { return }

        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        presenter.present(controller, animated: true)
    }
}

struct WebContainer: UIViewRepresentable {
    @ObservedObject var bridge: IOSBridge

    func makeCoordinator() -> Coordinator { Coordinator(bridge: bridge) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "ios")
        config.userContentController = controller

        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.contentInsetAdjustmentBehavior = .never
        bridge.attach(view)
        view.load(URLRequest(url: bridge.appURL))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let bridge: IOSBridge
        init(bridge: IOSBridge) { self.bridge = bridge }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }

            switch action {
            case "pickFile":
                bridge.pickDocument()
            case "share":
                if let path = body["path"] as? String {
                    bridge.share(url: URL(fileURLWithPath: path))
                }
            default:
                break
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if let url = navigationAction.request.url,
               url.scheme == "mailto" || url.scheme == "tel" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}

private extension UIWindowScene {
    var keyWindow: UIWindow? {
        windows.first(where: { $0.isKeyWindow })
    }
}
