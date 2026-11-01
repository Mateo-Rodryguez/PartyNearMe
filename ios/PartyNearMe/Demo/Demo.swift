#if DEBUG
import CoreLocation
import SwiftUI

/// Debug builds only: launching with `-demo <screen>` (for example
/// `xcrun simctl launch booted com.partynearme.app -demo sign_in`) opens the app on
/// sample data at that screen, with no network. CI uses it to screenshot every screen.
@MainActor
enum Demo {
    static var requestedScreen: String? { UserDefaults.standard.string(forKey: "demo") }

    /// Every screen the demo can show, in the order CI screenshots them.
    static let screens = ["sign_in", "sign_up", "forgot", "profile_setup", "onboarding", "location", "app", "profile"]

    static func model(for screen: String) -> AppModel {
        let signedOut = ["sign_in", "sign_up", "forgot"].contains(screen)
        let session = Session(accessToken: "demo", refreshToken: "demo", expiresAt: .greatestFiniteMagnitude,
                              userId: me.id, email: "maya@example.com")
        let sessions = SessionManager(store: MemorySessionStore(signedOut ? nil : session))
        return AppModel(sessions: sessions, api: DemoAPI(), location: DemoLocation(), demoScreen: screen)
    }

    @MainActor @ViewBuilder
    static func screen(_ name: String) -> some View {
        switch name {
        case "sign_up": SignInView(mode: .create)
        case "forgot": SignInView(mode: .reset)
        case "profile_setup": ProfileSetupView(profile: newAccount) { _ in }
        case "onboarding": OnboardingView { }
        case "location": OnboardingView(step: 1) { }
        case "app": SignedInView()
        case "profile": MainView(me: me, tab: .profile)
        default: SignInView()
        }
    }

    static let me = OwnProfile(
        id: "00000000-0000-4000-8000-000000000001", username: "maya.nights", displayName: "Maya", bio: "Out most weekends",
        avatarUrl: nil, relationshipStatus: "single", createdAt: "2026-10-01T20:00:00Z", interestIds: [1, 8], isModerator: false
    )

    static let newAccount = OwnProfile(
        id: me.id, username: nil, displayName: nil, bio: nil, avatarUrl: nil, relationshipStatus: nil,
        createdAt: "2026-11-01T20:00:00Z", interestIds: [], isModerator: false
    )

    /// The same list the server has (supabase/migrations, init).
    static let interests = ["Music", "Sports", "Fitness", "Food", "Travel", "Tech", "Fashion", "Art", "Gaming", "Other"]
        .enumerated().map { Interest(id: $0.offset + 1, slug: $0.element.lowercased(), name: $0.element) }
}

/// Answers like the server would, from memory.
@MainActor
final class DemoAPI: PartyAPI {
    private var profile = Demo.me

    func me() async throws -> OwnProfile { profile }

    func updateMe(_ update: ProfileUpdate) async throws -> OwnProfile {
        if let username = update.username { profile.username = username }
        if let displayName = update.displayName { profile.displayName = displayName }
        if let bio = update.bio { profile.bio = bio }
        return profile
    }

    func interests() async throws -> [Interest] { Demo.interests }

    func setInterests(_ ids: [Int]) async throws -> OwnProfile {
        profile.interestIds = ids
        return profile
    }

    func registerDevice(token: String, platform: String) async throws {}
    func unregisterDevice(token: String) async throws {}
}

/// Central London, without asking for permission.
@MainActor
final class DemoLocation: LocationProvider {
    func current() async -> CLLocationCoordinate2D? { CLLocationCoordinate2D(latitude: 51.5136, longitude: -0.1340) }
}
#endif
