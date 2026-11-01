import Foundation
import Observation

/// Wires the app's pieces together once, and is handed to every screen through the
/// SwiftUI environment. Screens talk to the server through `api` only, so the
/// screenshot demo can swap in sample data.
@MainActor
@Observable
final class AppModel {
    let sessions: SessionManager
    let api: any PartyAPI
    let location: any LocationProvider
    private let auth: AuthClient
    /// Debug builds only: the sample-data screen CI asked for, if any.
    let demoScreen: String?

    /// This phone's push token once it is registered, so signing out can remove it.
    @ObservationIgnored var pushToken: String?

    init(sessions: SessionManager, api: any PartyAPI, location: any LocationProvider,
         auth: AuthClient = AuthClient(), demoScreen: String? = nil) {
        self.sessions = sessions
        self.api = api
        self.location = location
        self.auth = auth
        self.demoScreen = demoScreen
    }

    /// The real app: the session in the Keychain, the live API.
    static func live() -> AppModel {
        let sessions = SessionManager(store: KeychainSessionStore())
        return AppModel(sessions: sessions, api: APIClient(sessions: sessions), location: DeviceLocation())
    }

    /// The sign-in providers switched on in Supabase. Empty when offline.
    func providers() async -> Set<String> {
        if demoScreen != nil { return ["google"] }
        return (try? await auth.providers()) ?? []
    }

    /// Emails a link to choose a new password; the link opens a page on our server.
    func sendPasswordReset(email: String) async throws {
        try await auth.recover(email: email, redirectTo: AppConfig.resetPasswordPage)
    }

    /// Signs out, first stopping this phone getting the user's notifications.
    func signOut() async {
        if let token = pushToken {
            // Best effort: signing out must work offline too.
            try? await api.unregisterDevice(token: token)
        }
        pushToken = nil
        await sessions.signOut()
    }
}
