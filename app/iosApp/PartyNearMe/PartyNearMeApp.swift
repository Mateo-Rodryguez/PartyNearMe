import PartyNearMeKit
import SwiftUI

@main
struct PartyNearMeApp: App {
    var body: some Scene {
        WindowGroup {
            SharedScreens().ignoresSafeArea()
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
