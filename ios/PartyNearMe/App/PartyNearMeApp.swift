import Sentry
import SwiftUI

@main
struct PartyNearMeApp: App {
    @UIApplicationDelegateAdaptor(PushDelegate.self) private var pushDelegate
    @State private var app: AppModel

    init() {
        // Crash reports only: no tracing, screenshots or personal data.
        // Simulators are skipped. The only ones that run this app are CI's, and their
        // screenshot runs kill the app on purpose and render maps on a virtual GPU,
        // which Sentry reported as app hangs that no real phone would hit.
        #if !targetEnvironment(simulator)
        SentrySDK.start { options in
            options.dsn = AppConfig.sentryDSN
            #if DEBUG
            options.environment = "debug"
            #else
            options.environment = "production"
            #endif
            options.sendDefaultPii = false
        }
        #endif
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
                .preferredColorScheme(AppPrefs.shared.theme.colorScheme)
                .environment(app)
                .tint(Color.appAccent)
        }
    }
}
