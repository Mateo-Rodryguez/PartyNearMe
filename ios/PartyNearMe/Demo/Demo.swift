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
    static let screens = ["sign_in", "sign_up", "forgot", "profile_setup", "onboarding", "location", "app",
                          "feed", "post", "comments", "new_post", "me", "user", "followers"]

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
        case "feed": MainView(me: me, tab: .home)
        case "new_post": MainView(me: me, tab: .post)
        case "me", "profile": MainView(me: me, tab: .profile)
        case "post": NavigationStack { PostDetailView(id: "p1").routeDestinations() }
        case "comments": NavigationStack { CommentsView(postId: "p1").routeDestinations() }
        case "user": NavigationStack { ProfileView(userId: sam.id).routeDestinations() }
        case "followers": NavigationStack { PeopleListView(userId: me.id, followers: true, title: "@maya.nights").routeDestinations() }
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

    static let sam = Person(id: "00000000-0000-4000-8000-000000000002", username: "sam", displayName: "Sam Rivera",
                            avatarUrl: "https://picsum.photos/seed/sam-avatar/200/200")
    static let alex = Person(id: "00000000-0000-4000-8000-000000000003", username: "alex", displayName: "Alex Chen",
                             avatarUrl: "https://picsum.photos/seed/alex-avatar/200/200")
    static let maya = Person(id: me.id, username: me.username, displayName: me.displayName, avatarUrl: nil)

    static func ago(_ seconds: TimeInterval) -> String {
        ISO8601DateFormatter().string(from: Date().addingTimeInterval(-seconds))
    }

    static func photo(_ seed: String, _ width: Int, _ height: Int, position: Int = 0) -> Media {
        Media(position: position, url: "https://picsum.photos/seed/\(seed)/\(width)/\(height)",
              thumbnails: ["320": "https://picsum.photos/seed/\(seed)/320/\(320 * height / width)"],
              width: width, height: height, blurhash: "LKO2?U%2Tw=w]~RBVZRi};RPxuwH")
    }

    static var feed: [Post] {
        [
            Post(id: "p1", author: sam, eventId: "e1", eventTitle: "Rooftop Sunset Party", caption: "Best night of the summer",
                 placeName: "Fabric, London", likeCount: 128, commentCount: 3, likedByMe: true, savedByMe: true,
                 media: [photo("party1", 1080, 1350), photo("party4", 1080, 1350, position: 1), photo("party5", 1080, 1350, position: 2)],
                 tags: [TaggedPerson(id: me.id, username: "maya.nights", displayName: "Maya"),
                        TaggedPerson(id: alex.id, username: "alex", displayName: "Alex Chen")],
                 createdAt: ago(42 * 60)),
            Post(id: "p2", author: alex, caption: "Warming up for Saturday", likeCount: 37, media: [photo("party2", 1080, 1080)],
                 createdAt: ago(5 * 3600)),
            Post(id: "p3", author: sam, caption: "Sunset session on the roof", placeName: "Shoreditch", likeCount: 412,
                 commentCount: 18, media: [photo("party3", 1350, 1080)], createdAt: ago(2 * 86400)),
        ]
    }

    static var myPosts: [Post] {
        [
            Post(id: "p4", author: maya, caption: "First post", likeCount: 12, media: [photo("mine1", 1080, 1080)], createdAt: ago(86400)),
            Post(id: "p5", author: maya, caption: "Just uploaded", status: "pending", media: [photo("mine2", 1080, 1080)],
                 createdAt: ago(60)),
            Post(id: "p6", author: maya, caption: "Throwback", likeCount: 51,
                 media: [photo("mine3", 1080, 1080), photo("mine4", 1080, 1080, position: 1)], createdAt: ago(9 * 86400)),
        ] + (1...6).map { n in
            Post(id: "p\(10 + n)", author: maya, likeCount: n * 7, media: [photo("night\(n)", 1080, 1080)], createdAt: ago(Double(n) * 12 * 86400))
        }
    }

    static var comments: [Comment] {
        [
            Comment(id: "c1", postId: "p1", author: alex, body: "This looks unreal 🔥", status: "visible", canDelete: false, createdAt: ago(5 * 60)),
            Comment(id: "c2", postId: "p1", author: maya, body: "Wish I'd stayed for the last set", status: "visible", canDelete: true,
                    createdAt: ago(20 * 60)),
            Comment(id: "c3", postId: "p1", author: sam, body: "Same time next week?", status: "visible", canDelete: false, createdAt: ago(3600)),
        ]
    }

    static var people: [ListedPerson] {
        [
            ListedPerson(id: sam.id, username: "sam", displayName: "Sam Rivera", avatarUrl: sam.avatarUrl, relationshipStatus: "taken", isFollowing: true),
            ListedPerson(id: "p-samira", username: "samira.k", displayName: "Samira Khan", avatarUrl: "https://picsum.photos/seed/samira/200/200",
                         relationshipStatus: "single", isFollowing: false),
            ListedPerson(id: "p-sasha", username: "sasha_dj", displayName: "Sasha Novak", avatarUrl: "https://picsum.photos/seed/sasha/200/200",
                         relationshipStatus: nil, isFollowing: false),
            ListedPerson(id: alex.id, username: "alex", displayName: "Alex Chen", avatarUrl: alex.avatarUrl, relationshipStatus: "talking", isFollowing: true),
            ListedPerson(id: "p-salsa", username: "salsa.nights", displayName: "Salsa Nights London", avatarUrl: nil,
                         relationshipStatus: nil, isFollowing: false),
        ]
    }

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

    func feed(lat: Double?, lng: Double?, cursor: String?) async throws -> PostPage? {
        PostPage(posts: cursor == nil ? Demo.feed : [], nextCursor: nil)
    }
    func logInteractions(_ events: [Interaction]) async throws {}
    func post(_ id: String) async throws -> Post {
        guard let post = (Demo.feed + Demo.myPosts).first(where: { $0.id == id }) else { throw APIError(status: 404, message: "Post not found") }
        return post
    }
    func deletePost(_ id: String) async throws {}
    func updateCaption(_ id: String, caption: String) async throws -> Post {
        var post = try await self.post(id)
        post.caption = caption.isEmpty ? nil : caption
        return post
    }
    func setLiked(_ id: String, liked: Bool) async throws {}
    func setSaved(_ id: String, saved: Bool) async throws {}
    func untagMe(_ postId: String) async throws {}
    func userPosts(_ userId: String, cursor: String?) async throws -> PostPage {
        let posts = userId == Demo.me.id ? Demo.myPosts : Demo.feed.filter { $0.author.id == userId }
        return PostPage(posts: cursor == nil ? posts : [], nextCursor: nil)
    }
    func uploadPhoto(_ jpeg: Data) async throws -> String { UUID().uuidString }
    func createPost(_ post: NewPost) async throws -> Post { Demo.myPosts[1] }

    func comments(_ postId: String, cursor: String?) async throws -> CommentPage {
        CommentPage(comments: cursor == nil ? Demo.comments : [], nextCursor: nil)
    }
    func addComment(_ postId: String, body: String) async throws -> Comment {
        Comment(id: UUID().uuidString, postId: postId, author: Demo.maya, body: body, status: "visible", canDelete: true,
                createdAt: Demo.ago(0))
    }
    func deleteComment(_ id: String) async throws {}

    func user(_ id: String) async throws -> PublicProfile {
        if id == Demo.me.id {
            return PublicProfile(id: id, username: profile.username, displayName: profile.displayName, bio: profile.bio,
                                 avatarUrl: nil, relationshipStatus: profile.relationshipStatus, parties: 14, followers: 1890,
                                 following: 312, isFollowing: false, isBlocked: false)
        }
        return PublicProfile(id: id, username: "sam", displayName: "Sam Rivera", bio: "Rooftops, house music and the last train home",
                             avatarUrl: Demo.sam.avatarUrl, relationshipStatus: "taken", parties: 27, followers: 12_500,
                             following: 480, isFollowing: false, isBlocked: false)
    }
    func setFollowing(_ id: String, following: Bool) async throws {}
    func followers(_ id: String, cursor: String?) async throws -> PeoplePage {
        PeoplePage(users: cursor == nil ? Demo.people : [], nextCursor: nil)
    }
    func following(_ id: String, cursor: String?) async throws -> PeoplePage {
        PeoplePage(users: cursor == nil ? Demo.people.filter { $0.isFollowing == true } : [], nextCursor: nil)
    }
    func setAvatar(uploadId: String) async throws {}
    func setBlocked(_ id: String, blocked: Bool) async throws {}
    func report(_ target: ReportTarget, id: String, reason: String) async throws {}
}

/// Central London, without asking for permission.
@MainActor
final class DemoLocation: LocationProvider {
    func current() async -> CLLocationCoordinate2D? { CLLocationCoordinate2D(latitude: 51.5136, longitude: -0.1340) }
}
#endif
