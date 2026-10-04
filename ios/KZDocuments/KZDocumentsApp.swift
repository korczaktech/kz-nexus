import SwiftUI

@main
struct KZDocumentsApp: App {
    @StateObject private var bridge = IOSBridge()

    var body: some Scene {
        WindowGroup {
            ContentView(bridge: bridge)
                .ignoresSafeArea(.container, edges: [.bottom])
        }
    }
}
