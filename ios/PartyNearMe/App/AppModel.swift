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
    /// New chat messages as they arrive.
    let live: any LiveMessages
    /// Chats with unread messages, for the Messages tab's badge.
    var unreadChats = 0
    /// New notifications, for the bell on Home.
    var unreadNotifications = 0
    private let auth: AuthClient
    /// Debug builds only: the sample-data screen CI asked for, if any.
    let demoScreen: String?

    /// This phone's push token once it is registered, so signing out can remove it.
    @ObservationIgnored var pushToken: String?

    /// What the user saw and did in the feed, sent in batches for ranking.
    @ObservationIgnored private(set) lazy var interactions = InteractionLog { [api] events in
        try await api.logInteractions(events)
    }

    /// A short note at the bottom of the screen, such as "Post deleted".
    private(set) var toast: Toast?

    struct Toast: Equatable {
        let id = UUID()
        let text: String
    }

    /// The signed-in user's id; empty when signed out.
    var myId: String { sessions.session?.userId ?? "" }

    /// Shows a short note for a few seconds.
    func show(_ text: String) {
        let toast = Toast(text: text)
        self.toast = toast
        Task {
            try? await Task.sleep(for: .seconds(3))
            if self.toast == toast { self.toast = nil }
        }
    }

    init(sessions: SessionManager, api: any PartyAPI, location: any LocationProvider, live: any LiveMessages,
         auth: AuthClient = AuthClient(), demoScreen: String? = nil) {
        self.sessions = sessions
        self.api = api
        self.location = location
        self.live = live
        self.auth = auth
        self.demoScreen = demoScreen
    }

    /// The real app: the session in the Keychain, the live API.
    static func live() -> AppModel {
        let sessions = SessionManager(store: KeychainSessionStore())
        return AppModel(sessions: sessions, api: APIClient(sessions: sessions), location: DeviceLocation(),
                        live: Realtime(sessions: sessions))
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

    /// Fetches the badge counts: unread chats and new notifications. Keeps the old ones when offline.
    func refreshBadges() async {
        if let chats = try? await api.unreadChats() { unreadChats = chats }
        if let notifications = try? await api.unreadNotifications() { unreadNotifications = notifications }
    }

    /// Signs out, first stopping this phone getting the user's notifications.
    func signOut() async {
        if let token = pushToken {
            // Best effort: signing out must work offline too.
            try? await api.unregisterDevice(token: token)
        }
        pushToken = nil
        interactions.flush()
        await sessions.signOut()
    }
}
