import PartyNearMeKit
import Sentry
import SwiftUI

@main
struct PartyNearMeApp: App {
    init() {
        // Crash reports go to the Sentry project partynearme-app (the DSN is public).
        // A Kotlin crash ends the app with a signal, which Sentry records and sends on
        // the next launch. No tracing, screenshots or personal data.
        SentrySDK.start { options in
            options.dsn = "https://7a9348ef5e13ce90b731507e7b463137@o4512272125394944.ingest.de.sentry.io/4512272236609616"
            #if DEBUG
            options.environment = "debug"
            #else
            options.environment = "production"
            #endif
            options.sendDefaultPii = false
        }
    }

    var body: some Scene {
        WindowGroup {
            SharedScreens().ignoresSafeArea().preferredColorScheme(.dark)
        }
    }
}

/// All the screens are written once in Kotlin (Compose Multiplatform) and shared with Android.
struct SharedScreens: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        MainViewControllerKt.MainViewController()
    }

    func updateUIViewController(_ controller: UIViewController, context: Context) {}
}
