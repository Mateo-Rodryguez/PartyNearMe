import Sentry
import SwiftUI

@main
struct PartyNearMeApp: App {
    @State private var app: AppModel

    init() {
        // Crash reports only: no tracing, screenshots or personal data.
        SentrySDK.start { options in
            options.dsn = AppConfig.sentryDSN
            #if DEBUG
            options.environment = "debug"
            #else
            options.environment = "production"
            #endif
            options.sendDefaultPii = false
        }
        #if DEBUG
        if let screen = Demo.requestedScreen {
            _app = State(initialValue: Demo.model(for: screen))
            return
        }
        #endif
        _app = State(initialValue: AppModel.live())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .tint(Color.appAccent)
        }
    }
}
