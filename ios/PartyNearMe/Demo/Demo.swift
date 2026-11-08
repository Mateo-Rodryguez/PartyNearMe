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
    static let screens = ["sign_in", "sign_up", "forgot", "profile_setup", "onboarding", "heard_from", "location", "app",
                          "feed", "post", "comments", "new_post", "me", "user", "followers",
                          "nearby", "nearby_map", "event", "my_event", "new_event", "edit_event", "pick_spot", "guests",
                          "inbox", "chat", "party_chat", "notifications", "invite",
                          "search", "saved", "settings", "feedback", "recommend", "blocked", "moderation"]

    static func model(for screen: String) -> AppModel {
        let signedOut = ["sign_in", "sign_up", "forgot"].contains(screen)
        let session = Session(accessToken: "demo", refreshToken: "demo", expiresAt: .greatestFiniteMagnitude,
                              userId: me.id, email: "maya@example.com")
        let sessions = SessionManager(store: MemorySessionStore(signedOut ? nil : session))
        return AppModel(sessions: sessions, api: DemoAPI(), location: DemoLocation(), live: DemoLive(), demoScreen: screen)
    }

    @MainActor @ViewBuilder
    static func screen(_ name: String) -> some View {
        switch name {
        case "sign_up": SignInView(mode: .create)
        case "forgot": SignInView(mode: .reset)
        case "profile_setup": ProfileSetupView(profile: newAccount) { _ in }
        case "onboarding": OnboardingView { }
        case "heard_from": OnboardingView(step: 1) { }
        case "location": OnboardingView(step: 2) { }
        case "app": SignedInView()
        case "feed": MainView(me: me, tab: .home)
        case "new_post": MainView(me: me, tab: .post)
        case "me", "profile": MainView(me: me, tab: .profile)
        case "post": NavigationStack { PostDetailView(id: "p1").routeDestinations() }
        case "comments": NavigationStack { CommentsView(postId: "p1").routeDestinations() }
        case "user": NavigationStack { ProfileView(userId: sam.id).routeDestinations() }
        case "followers": NavigationStack { PeopleListView(userId: me.id, followers: true, title: "@maya.nights").routeDestinations() }
        case "nearby": MainView(me: me, tab: .nearby)
        case "nearby_map": DemoNearby(map: true)
        case "event": NavigationStack { EventView(id: "e1").routeDestinations() }
        case "my_event": NavigationStack { EventView(id: "e2").routeDestinations() }
        case "new_event": NavigationStack { EventFormView(editing: nil) { _ in } }
        case "edit_event": NavigationStack { EventFormView(editing: events[1]) { _ in } }
        case "pick_spot": NavigationStack { MapPinPicker(start: here, chosen: .constant(nil)) }
        case "guests": NavigationStack { GuestListView(eventId: "e2", title: events[1].title).routeDestinations() }
        case "inbox": MainView(me: me, tab: .messages)
        case "chat": NavigationStack { ChatView(start: .conversation("c1"), title: "Sam Rivera").routeDestinations() }
        case "party_chat": NavigationStack { ChatView(start: .conversation("c2"), title: "Rooftop Sunset Party").routeDestinations() }
        case "notifications": NavigationStack { NotificationsView().routeDestinations() }
        case "invite": NavigationStack { InviteView(eventId: "e1", title: "Rooftop Sunset Party") }
        case "search": NavigationStack { SearchView().routeDestinations() }
        case "saved": NavigationStack { SavedView().routeDestinations() }
        case "settings": NavigationStack { SettingsView().routeDestinations() }
        case "feedback": NavigationStack { FeedbackView(kind: .problem).routeDestinations() }
        case "recommend": MainView(me: me, tab: .home, askRecommend: true)
        case "blocked": NavigationStack { BlockedView().routeDestinations() }
        case "moderation": NavigationStack { ModerationView().routeDestinations() }
        default: SignInView()
        }
    }

    static var reports: [ReportedItem] {
        [
            ReportedItem(targetType: "post", targetId: "p3", reportCount: 3, reasons: ["Spam", "Spam", "Something else"],
                         firstReportedAt: ago(3 * 3600),
                         preview: ReportedPreview(title: "Post by @sam", body: "Sunset session on the roof",
                                                  imageUrl: "https://picsum.photos/seed/party3/200/200", status: "visible", userId: sam.id)),
            ReportedItem(targetType: "comment", targetId: "c9", reportCount: 1, reasons: ["Harassment or hate"],
                         firstReportedAt: ago(26 * 3600),
                         preview: ReportedPreview(title: "Comment by @alex", body: "You won't get in looking like that", userId: alex.id)),
            ReportedItem(targetType: "message", targetId: "m7", reportCount: 1, reasons: ["Spam"], firstReportedAt: ago(2 * 86400)),
        ]
    }

    static let samira = Person(id: "p-samira", username: "samira.k", displayName: "Samira Khan",
                               avatarUrl: "https://picsum.photos/seed/samira/200/200")

    static func message(_ id: Int, in conversation: String, from sender: Person, _ body: String, minutesAgo: Double,
                        eventId: String? = nil) -> ChatMessage {
        ChatMessage(id: String(id), conversationId: conversation, senderId: sender.id, body: body,
                    createdAt: ago(minutesAgo * 60), eventId: eventId)
    }

    static var chats: [String: [ChatMessage]] {
        [
            "c1": [
                message(10, in: "c1", from: sam, "Are you coming to the roof tonight?", minutesAgo: 95),
                message(11, in: "c1", from: maya, "Obviously 🙌", minutesAgo: 93),
                message(12, in: "c1", from: maya, "What time are you getting there?", minutesAgo: 93),
                message(13, in: "c1", from: sam, "Rooftop Sunset Party, tonight at 22:00", minutesAgo: 60, eventId: "e1"),
                message(14, in: "c1", from: sam, "Around 10. Bring a jacket, it gets cold after midnight", minutesAgo: 12),
                message(15, in: "c1", from: maya, "See you there!", minutesAgo: 3),
            ].reversed(),
            "c2": [
                message(20, in: "c2", from: alex, "Who's here already?", minutesAgo: 40),
                message(21, in: "c2", from: samira, "Just arrived, the view is unreal", minutesAgo: 38),
                message(22, in: "c2", from: samira, "Queue is short right now", minutesAgo: 37),
                message(23, in: "c2", from: maya, "On my way 🏃‍♀️", minutesAgo: 30),
                message(24, in: "c2", from: sam, "DJ starts at 11, don't miss it", minutesAgo: 5),
            ].reversed(),
        ]
    }

    static var conversations: [Conversation] {
        [
            Conversation(id: "c1", other: sam, lastMessage: chats["c1"]?.first, unreadCount: 0, lastMessageAt: ago(3 * 60)),
            Conversation(id: "c2", party: ChatParty(id: "e1", title: "Rooftop Sunset Party", coverUrl: events[0].coverUrl),
                         members: [sam, alex, samira, maya], lastMessage: chats["c2"]?.first, unreadCount: 2, lastMessageAt: ago(5 * 60)),
            Conversation(id: "c3", other: alex,
                         lastMessage: message(30, in: "c3", from: alex, "Techno in the Tunnels tomorrow?", minutesAgo: 180),
                         unreadCount: 1, lastMessageAt: ago(3 * 3600)),
            Conversation(id: "c4", other: samira,
                         lastMessage: message(40, in: "c4", from: maya, "Thanks for the photos!", minutesAgo: 2 * 24 * 60),
                         lastMessageAt: ago(2 * 86400)),
        ]
    }

    static var notifications: [AppNotification] {
        [
            AppNotification(id: "n1", type: "like", actor: sam, postId: "p4",
                            postThumbnailUrl: "https://picsum.photos/seed/mine1/200/200", createdAt: ago(4 * 60), unread: true),
            AppNotification(id: "n2", type: "comment", actor: alex, commentText: "Wish I'd been there!", postId: "p4",
                            postThumbnailUrl: "https://picsum.photos/seed/mine1/200/200", createdAt: ago(25 * 60), unread: true),
            AppNotification(id: "n3", type: "request", actor: Person(id: "p-sasha", username: "sasha_dj", displayName: "Sasha Novak",
                                                                     avatarUrl: "https://picsum.photos/seed/sasha/200/200"),
                            eventId: "e2", eventTitle: "Maya's Birthday", eventCoverUrl: "https://picsum.photos/seed/birthday/400/400",
                            createdAt: ago(2 * 3600)),
            AppNotification(id: "n4", type: "follow", actor: samira, createdAt: ago(5 * 3600)),
            AppNotification(id: "n5", type: "rsvp", actor: alex, eventId: "e2", eventTitle: "Maya's Birthday",
                            eventCoverUrl: "https://picsum.photos/seed/birthday/400/400", createdAt: ago(86400)),
            AppNotification(id: "n6", type: "reminder", eventId: "e1", eventTitle: "Rooftop Sunset Party",
                            eventCoverUrl: "https://picsum.photos/seed/rooftop/400/400", createdAt: ago(2 * 86400)),
        ]
    }

    static let here = CLLocationCoordinate2D(latitude: 51.5136, longitude: -0.1340)

    /// A time the given number of hours from now, or today at the given hour.
    static func at(hours: Double) -> String {
        ISO8601DateFormatter().string(from: Date().addingTimeInterval(hours * 3600))
    }

    static func at(day: Int, hour: Int) -> String {
        let calendar = Calendar.current
        let date = calendar.date(byAdding: .day, value: day, to: calendar.date(bySettingHour: hour, minute: 0, second: 0, of: Date())!)!
        return ISO8601DateFormatter().string(from: date)
    }

    static var events: [Event] {
        [
            Event(id: "e1", organiser: sam, title: "Rooftop Sunset Party",
                  description: "House and disco on the roof until late. Dress for the cold after midnight, bring good vibes.",
                  startsAt: at(day: 0, hour: 22), endsAt: at(day: 1, hour: 3), venueName: "Netil360, Hackney",
                  lat: 51.5175, lng: -0.1290, coverUrl: "https://picsum.photos/seed/rooftop/1080/1350", interestId: 1,
                  goingCount: 128, interestedCount: 40, myRsvp: "going", ticketUrl: "https://example.com/tickets",
                  friendsGoing: [alex, Person(id: "p-samira", username: "samira.k", displayName: "Samira Khan",
                                              avatarUrl: "https://picsum.photos/seed/samira/200/200")],
                  friendsGoingCount: 4, chatId: "c2", createdAt: ago(3 * 86400), distanceM: 640),
            Event(id: "e2", organiser: maya, title: "Maya's Birthday", description: "Drinks, then dancing. Plus ones welcome.",
                  startsAt: at(day: 0, hour: 21), endsAt: at(day: 1, hour: 1), venueName: "The Vaults, Waterloo",
                  lat: 51.5010, lng: -0.1160, coverUrl: "https://picsum.photos/seed/birthday/1080/1350", goingCount: 18,
                  interestedCount: 3, isPrivate: true, requestedCount: 2, createdAt: ago(86400), distanceM: 2300),
            Event(id: "e3", organiser: alex, title: "Techno in the Tunnels", startsAt: at(day: 1, hour: 23), endsAt: at(day: 2, hour: 6),
                  venueName: "Printworks", lat: 51.4970, lng: -0.0440, coverUrl: "https://picsum.photos/seed/tunnels/1080/1350",
                  interestId: 1, goingCount: 512, interestedCount: 230, myRsvp: "interested", createdAt: ago(5 * 86400), distanceM: 6400),
            Event(id: "e4", organiser: sam, title: "Secret Garden Session", startsAt: at(day: 1, hour: 20), endsAt: at(day: 2, hour: 0),
                  venueName: "Primrose Hill", lat: 51.5390, lng: -0.1600, goingCount: 9, createdAt: ago(2 * 86400), distanceM: 3100),
            Event(id: "e5", organiser: alex, title: "Salsa Social", description: "Beginners' class at 8, social dancing after.",
                  startsAt: at(day: 4, hour: 20), endsAt: at(day: 5, hour: 0), venueName: "Bar Salsa, Soho",
                  lat: 51.5130, lng: -0.1310, coverUrl: "https://picsum.photos/seed/salsa/1080/1350", interestId: 1, goingCount: 46,
                  friendsGoing: [sam], friendsGoingCount: 1, createdAt: ago(7 * 86400), distanceM: 300),
        ]
    }

    static var guests: GuestList {
        GuestList(
            requested: [Person(id: "p-sasha", username: "sasha_dj", displayName: "Sasha Novak", avatarUrl: "https://picsum.photos/seed/sasha/200/200"),
                        Person(id: "p-salsa", username: "salsa.nights", displayName: "Salsa Nights London", avatarUrl: nil)],
            going: [sam, alex, Person(id: "p-samira", username: "samira.k", displayName: "Samira Khan",
                                      avatarUrl: "https://picsum.photos/seed/samira/200/200")]
        )
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
    func setTags(_ postId: String, userIds: [String]) async throws -> Post {
        var post = try await self.post(postId)
        let people = Demo.people.filter { userIds.contains($0.id) }
        post.tags = people.map { TaggedPerson(id: $0.id, username: $0.username, displayName: $0.displayName) }
        return post
    }
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

    private var events = Demo.events

    func nearbyEvents(lat: Double, lng: Double, radiusKm: Double, cursor: String?, from: String?, to: String?,
                      interestId: Int?) async throws -> EventPage {
        guard cursor == nil else { return EventPage(events: [], nextCursor: nil) }
        let lower = from.flatMap(Formatting.date), upper = to.flatMap(Formatting.date)
        let shown = events.filter { event in
            let start = Formatting.date(event.startsAt) ?? Date()
            return !event.isPrivate && (interestId == nil || event.interestId == interestId)
                && (lower.map { start >= $0.addingTimeInterval(-6 * 3600) } ?? true) && (upper.map { start < $0 } ?? true)
        }
        return EventPage(events: shown.sorted { $0.startsAt < $1.startsAt }, nextCursor: nil)
    }
    func forYouEvents(lat: Double, lng: Double, radiusKm: Double, from: String?, to: String?,
                      interestId: Int?) async throws -> ForYouPage {
        let page = try await nearbyEvents(lat: lat, lng: lng, radiusKm: radiusKm, cursor: nil, from: from, to: to,
                                          interestId: interestId)
        // The demo puts parties with friends going first, as the real ranking tends to.
        let ranked = page.events.sorted { $0.friendsGoingCount > $1.friendsGoingCount }.map { event -> Event in
            var event = event
            if event.friendsGoingCount > 0 {
                event.reason = Reason(kind: "friends_going", text: "\(event.friendsGoingCount) people you follow are going")
            } else if event.interestId == 1 {
                event.reason = Reason(kind: "interest", text: "Because you like Music")
            }
            return event
        }
        return ForYouPage(events: ranked, serveId: "00000000-0000-0000-0000-000000000000")
    }
    func myEvents(organising: Bool) async throws -> [Event] {
        events.filter { organising ? $0.organiser.id == Demo.me.id : $0.myRsvp == "going" }
    }
    func event(_ id: String) async throws -> Event {
        guard let event = events.first(where: { $0.id == id }) else { throw APIError(status: 404, message: "Party not found") }
        return event
    }
    func eventPosts(_ id: String, cursor: String?) async throws -> PostPage {
        PostPage(posts: cursor == nil && id == "e1" ? Demo.feed + Array(Demo.myPosts.prefix(3)) : [], nextCursor: nil)
    }
    func createEvent(_ event: NewEvent) async throws -> Event {
        let made = Event(id: UUID().uuidString, organiser: Demo.maya, title: event.title, description: event.description,
                         startsAt: event.startsAt, endsAt: event.endsAt, venueName: event.venueName, lat: event.lat, lng: event.lng,
                         interestId: event.interestId, isPrivate: event.isPrivate, ticketUrl: event.ticketUrl, createdAt: Demo.ago(0))
        events.append(made)
        return made
    }
    func updateEvent(_ id: String, _ update: EventUpdate) async throws -> Event {
        var event = try await self.event(id)
        if let title = update.title { event.title = title }
        if let status = update.status { event.status = status }
        if let venue = update.venueName { event.venueName = venue.isEmpty ? nil : venue }
        if let isPrivate = update.isPrivate { event.isPrivate = isPrivate }
        replace(event)
        return event
    }
    func clearEventKind(_ id: String) async throws -> Event {
        var event = try await self.event(id)
        event.interestId = nil
        replace(event)
        return event
    }
    func deleteEvent(_ id: String) async throws { events.removeAll { $0.id == id } }
    func setEventSaved(_ id: String, saved: Bool) async throws {}
    func rsvp(_ eventId: String, status: String?) async throws -> Event {
        var event = try await self.event(eventId)
        let wasGoing = event.myRsvp == "going"
        event.myRsvp = status == "going" && event.isPrivate ? "requested" : status
        event.goingCount += (event.myRsvp == "going" ? 1 : 0) - (wasGoing ? 1 : 0)
        replace(event)
        return event
    }
    func setCover(_ eventId: String, uploadId: String) async throws {}
    func removeCover(_ eventId: String) async throws {}
    func guests(_ eventId: String) async throws -> GuestList { Demo.guests }
    func approveGuest(_ eventId: String, userId: String) async throws {}
    func removeGuest(_ eventId: String, userId: String) async throws {}

    func savedPosts(cursor: String?) async throws -> PostPage {
        PostPage(posts: cursor == nil ? Demo.feed + Demo.myPosts.filter { $0.isVisible } : [], nextCursor: nil)
    }
    func savedEvents() async throws -> [Event] { Array(events.prefix(3)) }
    func blockedUsers() async throws -> [ListedPerson] { Array(Demo.people.suffix(2)) }
    func setRelationshipStatus(_ status: String?) async throws -> OwnProfile {
        profile.relationshipStatus = status
        return profile
    }
    func removeAvatar() async throws {}
    private var account = AccountSettings()
    func settings() async throws -> AccountSettings { account }
    func updateSettings(_ settings: AccountSettings) async throws -> AccountSettings {
        account = settings
        return account
    }
    func deleteAccount() async throws {}
    func moderationQueue() async throws -> [ReportedItem] { Demo.reports }
    func moderate(_ targetType: String, id: String, action: ModerationAction, note: String?) async throws {}

    func invite(_ eventId: String, userIds: [String]) async throws -> InviteResult { InviteResult(sent: userIds.count, skipped: 0) }
    func searchUsers(_ query: String) async throws -> [ListedPerson] {
        Demo.people.filter { ($0.displayName ?? "").localizedCaseInsensitiveContains(query) || ($0.username ?? "").contains(query.lowercased()) }
    }

    private var sent: [ChatMessage] = []
    func inbox(cursor: String?) async throws -> ConversationPage {
        ConversationPage(conversations: cursor == nil ? Demo.conversations : [], nextCursor: nil)
    }
    func startConversation(with userId: String) async throws -> Conversation {
        Demo.conversations.first { $0.other?.id == userId } ?? Conversation(id: "c-\(userId)", other: Demo.sam)
    }
    func conversation(_ id: String) async throws -> Conversation {
        guard let conversation = Demo.conversations.first(where: { $0.id == id }) else { throw APIError(status: 404, message: "Chat not found") }
        return conversation
    }
    func unreadChats() async throws -> Int { Demo.conversations.filter { $0.unreadCount > 0 }.count }
    func messages(_ conversationId: String, before: String?) async throws -> MessagePage {
        let all = Array(sent.filter { $0.conversationId == conversationId }.reversed()) + (Demo.chats[conversationId] ?? [])
        return MessagePage(messages: before == nil ? Array(all) : [], hasMore: false)
    }
    func send(_ conversationId: String, body: String) async throws -> ChatMessage {
        let message = ChatMessage(id: String(1000 + sent.count), conversationId: conversationId, senderId: Demo.me.id, body: body,
                                  createdAt: Demo.ago(0))
        sent.append(message)
        return message
    }
    func markRead(_ conversationId: String) async throws {}

    func notifications() async throws -> NotificationPage {
        NotificationPage(notifications: Demo.notifications, unreadCount: 2)
    }
    func unreadNotifications() async throws -> Int { 2 }
    func markNotificationsSeen() async throws {}
    func sendFeedback(_ feedback: Feedback) async throws {}

    private func replace(_ event: Event) {
        if let index = events.firstIndex(where: { $0.id == event.id }) { events[index] = event }
    }
}

/// No live updates in the demo: the stream stays open and quiet.
@MainActor
final class DemoLive: LiveMessages {
    func messages(in conversationId: String?) -> AsyncStream<ChatMessage> { AsyncStream { _ in } }
}

/// The Nearby tab on its own, on the map or the list.
private struct DemoNearby: View {
    @Environment(AppModel.self) private var app
    let map: Bool
    @State private var model: NearbyModel?

    init(map: Bool) {
        self.map = map
    }

    var body: some View {
        NavigationStack {
            if let model {
                NearbyView(model: model).routeDestinations()
            } else {
                Color.clear
            }
        }
        .onAppear {
            let nearby = NearbyModel(app: app)
            nearby.showMap = map
            model = nearby
        }
    }
}

/// Central London, without asking for permission.
@MainActor
final class DemoLocation: LocationProvider {
    func current() async -> CLLocationCoordinate2D? { Demo.here }
}
#endif
