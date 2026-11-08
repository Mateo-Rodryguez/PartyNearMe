import Foundation

/// Everything the screens ask the server for. The real one is `APIClient`; the
/// screenshot demo swaps in sample data.
@MainActor
protocol PartyAPI: AnyObject {
    func me() async throws -> OwnProfile
    func updateMe(_ update: ProfileUpdate) async throws -> OwnProfile
    func interests() async throws -> [Interest]
    func setInterests(_ ids: [Int]) async throws -> OwnProfile
    func registerDevice(token: String, platform: String) async throws
    func unregisterDevice(token: String) async throws

    // Feed and posts
    /// A nil page means the ranked list behind `cursor` expired; start again from the top.
    func feed(lat: Double?, lng: Double?, cursor: String?) async throws -> PostPage?
    func logInteractions(_ events: [Interaction]) async throws
    func post(_ id: String) async throws -> Post
    func deletePost(_ id: String) async throws
    /// An empty caption removes it. The server checks the new words, so a post can be hidden afterwards.
    func updateCaption(_ id: String, caption: String) async throws -> Post
    func setLiked(_ id: String, liked: Bool) async throws
    func setSaved(_ id: String, saved: Bool) async throws
    func untagMe(_ postId: String) async throws
    /// Sets everyone tagged on your post; people left out are untagged.
    func setTags(_ postId: String, userIds: [String]) async throws -> Post
    func userPosts(_ userId: String, cursor: String?) async throws -> PostPage
    /// Uploads one JPEG straight to storage and returns its upload id.
    func uploadPhoto(_ jpeg: Data) async throws -> String
    func createPost(_ post: NewPost) async throws -> Post

    // Comments
    func comments(_ postId: String, cursor: String?) async throws -> CommentPage
    func addComment(_ postId: String, body: String) async throws -> Comment
    func deleteComment(_ id: String) async throws

    // People
    func user(_ id: String) async throws -> PublicProfile
    func setFollowing(_ id: String, following: Bool) async throws
    func followers(_ id: String, cursor: String?) async throws -> PeoplePage
    func following(_ id: String, cursor: String?) async throws -> PeoplePage
    func setAvatar(uploadId: String) async throws
    func setBlocked(_ id: String, blocked: Bool) async throws
    func report(_ target: ReportTarget, id: String, reason: String) async throws

    // Parties
    /// `from` and `to` are ISO-8601 times (default: now to two weeks ahead); `interestId` picks one kind of party.
    func nearbyEvents(lat: Double, lng: Double, radiusKm: Double, cursor: String?, from: String?, to: String?,
                      interestId: Int?) async throws -> EventPage
    /// Parties you host (`organising`) or said you're going to.
    func myEvents(organising: Bool) async throws -> [Event]
    func event(_ id: String) async throws -> Event
    /// Photos posted at a party, newest first.
    func eventPosts(_ id: String, cursor: String?) async throws -> PostPage
    func createEvent(_ event: NewEvent) async throws -> Event
    /// Host only. Cancelling tells guests with a push.
    func updateEvent(_ id: String, _ update: EventUpdate) async throws -> Event
    /// Takes the party's kind off. Sent on its own so the null reaches the server.
    func clearEventKind(_ id: String) async throws -> Event
    func deleteEvent(_ id: String) async throws
    func setEventSaved(_ id: String, saved: Bool) async throws
    /// "going" or "interested"; nil takes the RSVP back. Returns the party with new counts.
    func rsvp(_ eventId: String, status: String?) async throws -> Event
    /// The cover shows once the server has checked the photo.
    func setCover(_ eventId: String, uploadId: String) async throws
    func removeCover(_ eventId: String) async throws
    func guests(_ eventId: String) async throws -> GuestList
    func approveGuest(_ eventId: String, userId: String) async throws
    /// Declines a request, or takes someone off the guest list.
    func removeGuest(_ eventId: String, userId: String) async throws
    /// Sends a party invite to each person as a chat message.
    func invite(_ eventId: String, userIds: [String]) async throws -> InviteResult

    /// People by username or name.
    func searchUsers(_ query: String) async throws -> [ListedPerson]
    func savedPosts(cursor: String?) async throws -> PostPage
    func savedEvents() async throws -> [Event]
    func blockedUsers() async throws -> [ListedPerson]
    /// Nil hides the heart.
    func setRelationshipStatus(_ status: String?) async throws -> OwnProfile
    func removeAvatar() async throws
    func settings() async throws -> AccountSettings
    func updateSettings(_ settings: AccountSettings) async throws -> AccountSettings
    /// Deletes the signed-in account and everything it owns.
    func deleteAccount() async throws
    /// Open reports, one entry per reported thing. Moderators only.
    func moderationQueue() async throws -> [ReportedItem]
    /// Acts on a reported thing and closes its reports. Moderators only.
    func moderate(_ targetType: String, id: String, action: ModerationAction, note: String?) async throws

    // Chat
    func inbox(cursor: String?) async throws -> ConversationPage
    /// Opens the one-to-one chat with someone, making it if it's new.
    func startConversation(with userId: String) async throws -> Conversation
    func conversation(_ id: String) async throws -> Conversation
    /// Chats with unread messages, for the tab's badge.
    func unreadChats() async throws -> Int
    /// Newest first; pass the oldest id you have as `before` to page back.
    func messages(_ conversationId: String, before: String?) async throws -> MessagePage
    func send(_ conversationId: String, body: String) async throws -> ChatMessage
    func markRead(_ conversationId: String) async throws

    // Notifications
    /// Likes, comments, follows, RSVPs and party reminders, newest first.
    func notifications() async throws -> NotificationPage
    func unreadNotifications() async throws -> Int
    /// Called when the user opens their notifications, so the bell's count clears.
    func markNotificationsSeen() async throws

    /// Something the user told us (docs/analytics.md). Private: nobody can read it back through the API.
    func sendFeedback(_ feedback: Feedback) async throws
}

/// The PartyNearMe API. Every call is signed in; a 401 triggers one token refresh and a retry.
@MainActor
final class APIClient: PartyAPI {
    private let sessions: SessionManager
    /// Told about every call's outcome (method, path as called, status; 0 when no
    /// answer came), so analytics can count actions and struggles.
    var onResult: @MainActor (String, String, Int) -> Void = { _, _, _ in }

    init(sessions: SessionManager) {
        self.sessions = sessions
    }

    // MARK: People

    func me() async throws -> OwnProfile { try await call("GET", "/me") }

    func updateMe(_ update: ProfileUpdate) async throws -> OwnProfile {
        try await call("PATCH", "/me", body: update)
    }

    func interests() async throws -> [Interest] { try await call("GET", "/interests") }

    func setInterests(_ ids: [Int]) async throws -> OwnProfile {
        try await call("PUT", "/me/interests", body: InterestIds(interestIds: ids))
    }

    // MARK: Push

    func registerDevice(token: String, platform: String) async throws {
        try await callUnit("PUT", "/devices/\(token.pathEscaped)", body: DeviceBody(platform: platform))
    }

    func unregisterDevice(token: String) async throws {
        try await callUnit("DELETE", "/devices/\(token.pathEscaped)")
    }

    // MARK: Feed and posts

    func feed(lat: Double?, lng: Double?, cursor: String?) async throws -> PostPage? {
        do {
            let page: PostPage = try await call("GET", "/feed", query: [
                .init(name: "lat", value: lat.map { String($0) }),
                .init(name: "lng", value: lng.map { String($0) }),
                .init(name: "cursor", value: cursor),
                .init(name: "limit", value: "20"),
            ])
            return page
        } catch let error as APIError where error.status == 410 {
            return nil
        }
    }

    func logInteractions(_ events: [Interaction]) async throws {
        for start in stride(from: 0, to: events.count, by: 50) {
            let batch = Array(events[start..<min(start + 50, events.count)])
            try await callUnit("POST", "/interactions", body: InteractionBatch(events: batch))
        }
    }

    func post(_ id: String) async throws -> Post { try await call("GET", "/posts/\(id.pathEscaped)") }

    func deletePost(_ id: String) async throws { try await callUnit("DELETE", "/posts/\(id.pathEscaped)") }

    func updateCaption(_ id: String, caption: String) async throws -> Post {
        try await call("PATCH", "/posts/\(id.pathEscaped)", body: CaptionBody(caption: caption))
    }

    func setLiked(_ id: String, liked: Bool) async throws {
        try await callUnit(liked ? "PUT" : "DELETE", "/posts/\(id.pathEscaped)/like")
    }

    func setSaved(_ id: String, saved: Bool) async throws {
        try await callUnit(saved ? "PUT" : "DELETE", "/posts/\(id.pathEscaped)/save")
    }

    func untagMe(_ postId: String) async throws { try await callUnit("DELETE", "/posts/\(postId.pathEscaped)/tags/me") }

    func setTags(_ postId: String, userIds: [String]) async throws -> Post {
        try await call("PUT", "/posts/\(postId.pathEscaped)/tags", body: TagsBody(userIds: userIds))
    }

    func userPosts(_ userId: String, cursor: String?) async throws -> PostPage {
        try await call("GET", "/users/\(userId.pathEscaped)/posts", query: [.init(name: "cursor", value: cursor)])
    }

    func uploadPhoto(_ jpeg: Data) async throws -> String {
        let ticket: UploadTicket = try await call("POST", "/uploads",
                                                  body: UploadRequest(contentType: "image/jpeg", sizeBytes: jpeg.count))
        guard let url = URL(string: ticket.uploadUrl) else { throw APIError(status: 0, message: "The photo didn't upload. Try again.") }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        for (name, value) in ticket.headers { request.setValue(value, forHTTPHeaderField: name) }
        let status: Int
        do {
            let (_, response) = try await HTTP.session.upload(for: request, from: jpeg)
            status = (response as? HTTPURLResponse)?.statusCode ?? 0
        } catch {
            if !(error is CancellationError) && (error as? URLError)?.code != .cancelled { onResult("PUT", "/photo-upload", 0) }
            throw error
        }
        guard (200..<300).contains(status) else {
            onResult("PUT", "/photo-upload", status)
            throw APIError(status: status, message: "The photo didn't upload. Try again.")
        }
        return ticket.uploadId
    }

    func createPost(_ post: NewPost) async throws -> Post { try await call("POST", "/posts", body: post) }

    // MARK: Comments

    func comments(_ postId: String, cursor: String?) async throws -> CommentPage {
        try await call("GET", "/posts/\(postId.pathEscaped)/comments", query: [.init(name: "cursor", value: cursor)])
    }

    func addComment(_ postId: String, body: String) async throws -> Comment {
        try await call("POST", "/posts/\(postId.pathEscaped)/comments", body: SendBody(body: body))
    }

    func deleteComment(_ id: String) async throws { try await callUnit("DELETE", "/comments/\(id.pathEscaped)") }

    // MARK: People

    func user(_ id: String) async throws -> PublicProfile { try await call("GET", "/users/\(id.pathEscaped)") }

    func setFollowing(_ id: String, following: Bool) async throws {
        try await callUnit(following ? "PUT" : "DELETE", "/users/\(id.pathEscaped)/follow")
    }

    func followers(_ id: String, cursor: String?) async throws -> PeoplePage {
        try await call("GET", "/users/\(id.pathEscaped)/followers", query: [.init(name: "cursor", value: cursor)])
    }

    func following(_ id: String, cursor: String?) async throws -> PeoplePage {
        try await call("GET", "/users/\(id.pathEscaped)/following", query: [.init(name: "cursor", value: cursor)])
    }

    func setAvatar(uploadId: String) async throws {
        try await callUnit("PUT", "/me/avatar", body: UploadIdBody(uploadId: uploadId))
    }

    func setBlocked(_ id: String, blocked: Bool) async throws {
        try await callUnit(blocked ? "PUT" : "DELETE", "/users/\(id.pathEscaped)/block")
    }

    func report(_ target: ReportTarget, id: String, reason: String) async throws {
        try await callUnit("POST", "/reports", body: ReportBody(targetType: target.rawValue, targetId: id, reason: reason))
    }

    // MARK: Parties

    func nearbyEvents(lat: Double, lng: Double, radiusKm: Double, cursor: String?, from: String?, to: String?,
                      interestId: Int?) async throws -> EventPage {
        try await call("GET", "/events/nearby", query: [
            .init(name: "lat", value: String(lat)),
            .init(name: "lng", value: String(lng)),
            .init(name: "radius_km", value: String(radiusKm)),
            .init(name: "cursor", value: cursor),
            .init(name: "from", value: from),
            .init(name: "to", value: to),
            .init(name: "interest_id", value: interestId.map { String($0) }),
        ])
    }

    func myEvents(organising: Bool) async throws -> [Event] {
        try await call("GET", "/me/events", query: [.init(name: "role", value: organising ? "organising" : "going")])
    }

    func event(_ id: String) async throws -> Event { try await call("GET", "/events/\(id.pathEscaped)") }

    func eventPosts(_ id: String, cursor: String?) async throws -> PostPage {
        try await call("GET", "/events/\(id.pathEscaped)/posts", query: [.init(name: "cursor", value: cursor)])
    }

    func createEvent(_ event: NewEvent) async throws -> Event { try await call("POST", "/events", body: event) }

    func updateEvent(_ id: String, _ update: EventUpdate) async throws -> Event {
        try await call("PATCH", "/events/\(id.pathEscaped)", body: update)
    }

    func clearEventKind(_ id: String) async throws -> Event {
        try await call("PATCH", "/events/\(id.pathEscaped)", body: ClearKind())
    }

    func deleteEvent(_ id: String) async throws { try await callUnit("DELETE", "/events/\(id.pathEscaped)") }

    func setEventSaved(_ id: String, saved: Bool) async throws {
        try await callUnit(saved ? "PUT" : "DELETE", "/events/\(id.pathEscaped)/save")
    }

    func rsvp(_ eventId: String, status: String?) async throws -> Event {
        guard let status else {
            try await callUnit("DELETE", "/events/\(eventId.pathEscaped)/rsvp")
            return try await event(eventId)
        }
        return try await call("PUT", "/events/\(eventId.pathEscaped)/rsvp", body: RsvpBody(status: status))
    }

    func setCover(_ eventId: String, uploadId: String) async throws {
        try await callUnit("PUT", "/events/\(eventId.pathEscaped)/cover", body: UploadIdBody(uploadId: uploadId))
    }

    func removeCover(_ eventId: String) async throws { try await callUnit("DELETE", "/events/\(eventId.pathEscaped)/cover") }

    func guests(_ eventId: String) async throws -> GuestList { try await call("GET", "/events/\(eventId.pathEscaped)/guests") }

    func approveGuest(_ eventId: String, userId: String) async throws {
        try await callUnit("POST", "/events/\(eventId.pathEscaped)/guests/\(userId.pathEscaped)/approve")
    }

    func removeGuest(_ eventId: String, userId: String) async throws {
        try await callUnit("DELETE", "/events/\(eventId.pathEscaped)/guests/\(userId.pathEscaped)")
    }

    func invite(_ eventId: String, userIds: [String]) async throws -> InviteResult {
        try await call("POST", "/events/\(eventId.pathEscaped)/invites", body: UserIdsBody(userIds: userIds))
    }

    func searchUsers(_ query: String) async throws -> [ListedPerson] {
        let page: PeoplePage = try await call("GET", "/users/search", query: [.init(name: "q", value: query)])
        return page.users
    }

    func savedPosts(cursor: String?) async throws -> PostPage {
        try await call("GET", "/me/saved/posts", query: [.init(name: "cursor", value: cursor)])
    }

    func savedEvents() async throws -> [Event] {
        let list: EventList = try await call("GET", "/me/saved/events")
        return list.events
    }

    func blockedUsers() async throws -> [ListedPerson] {
        let page: PeoplePage = try await call("GET", "/me/blocks")
        return page.users
    }

    func setRelationshipStatus(_ status: String?) async throws -> OwnProfile {
        try await call("PATCH", "/me", body: RelationshipBody(relationshipStatus: status))
    }

    func removeAvatar() async throws { try await callUnit("DELETE", "/me/avatar") }

    func settings() async throws -> AccountSettings { try await call("GET", "/me/settings") }

    func updateSettings(_ settings: AccountSettings) async throws -> AccountSettings {
        try await call("PATCH", "/me/settings", body: settings)
    }

    func deleteAccount() async throws { try await callUnit("DELETE", "/me") }

    func moderationQueue() async throws -> [ReportedItem] {
        let queue: ModerationQueue = try await call("GET", "/moderation/queue")
        return queue.items
    }

    func moderate(_ targetType: String, id: String, action: ModerationAction, note: String?) async throws {
        try await callUnit("POST", "/moderation/actions",
                           body: ModerationBody(targetType: targetType, targetId: id, action: action.rawValue, note: note))
    }

    // MARK: Chat

    func inbox(cursor: String?) async throws -> ConversationPage {
        try await call("GET", "/conversations", query: [.init(name: "cursor", value: cursor)])
    }

    func startConversation(with userId: String) async throws -> Conversation {
        try await call("POST", "/conversations", body: UserIdBody(userId: userId))
    }

    func conversation(_ id: String) async throws -> Conversation { try await call("GET", "/conversations/\(id.pathEscaped)") }

    func unreadChats() async throws -> Int {
        let count: UnreadCount = try await call("GET", "/conversations/unread")
        return count.unreadCount
    }

    func messages(_ conversationId: String, before: String?) async throws -> MessagePage {
        try await call("GET", "/conversations/\(conversationId.pathEscaped)/messages", query: [.init(name: "before", value: before)])
    }

    func send(_ conversationId: String, body: String) async throws -> ChatMessage {
        try await call("POST", "/conversations/\(conversationId.pathEscaped)/messages", body: SendBody(body: body))
    }

    func markRead(_ conversationId: String) async throws {
        try await callUnit("POST", "/conversations/\(conversationId.pathEscaped)/read")
    }

    // MARK: Notifications

    func notifications() async throws -> NotificationPage { try await call("GET", "/notifications") }

    func unreadNotifications() async throws -> Int {
        let count: UnreadCount = try await call("GET", "/notifications/unread")
        return count.unreadCount
    }

    func markNotificationsSeen() async throws { try await callUnit("POST", "/notifications/seen") }

    // MARK: Feedback

    func sendFeedback(_ feedback: Feedback) async throws { try await callUnit("POST", "/feedback", body: feedback) }

    // MARK: Plumbing

    private func call<T: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = []) async throws -> T {
        try JSON.decoder.decode(T.self, from: try await send(method, path, query: query, body: nil))
    }

    private func call<T: Decodable, B: Encodable>(_ method: String, _ path: String, body: B) async throws -> T {
        try JSON.decoder.decode(T.self, from: try await send(method, path, query: [], body: try JSON.encoder.encode(body)))
    }

    private func callUnit(_ method: String, _ path: String, query: [URLQueryItem] = []) async throws {
        _ = try await send(method, path, query: query, body: nil)
    }

    private func callUnit<B: Encodable>(_ method: String, _ path: String, body: B) async throws {
        _ = try await send(method, path, query: [], body: try JSON.encoder.encode(body))
    }

    private func send(_ method: String, _ path: String, query: [URLQueryItem], body: Data?) async throws -> Data {
        var components = URLComponents(string: AppConfig.apiBase + path)!
        let items = query.filter { $0.value != nil }
        if !items.isEmpty { components.queryItems = items }
        let url = components.url!

        func attempt(_ token: String) async throws -> (Data, Int) {
            var request = URLRequest(url: url)
            request.httpMethod = method
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let body {
                request.httpBody = body
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
            return try await HTTP.send(request)
        }

        let token = try await sessions.accessToken()
        var data: Data
        var status: Int
        do {
            (data, status) = try await attempt(token)
            if status == 401 { (data, status) = try await attempt(try await sessions.refresh(stale: token)) }
        } catch {
            // No answer at all (offline, timed out) counts as status 0; a screen closing doesn't count.
            if !(error is CancellationError) && (error as? URLError)?.code != .cancelled { onResult(method, path, 0) }
            throw error
        }
        onResult(method, path, status)
        guard (200..<300).contains(status) else { throw APIError(status: status, message: Self.errorMessage(status: status, data: data)) }
        return data
    }

    nonisolated static func errorMessage(status: Int, data: Data) -> String {
        if status >= 500 { return "Something went wrong on our side. Try again in a moment." }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if let message = object?["message"] as? String { return message }
        return "Request failed (\(status))"
    }

    private struct InterestIds: Encodable { let interestIds: [Int] }
    private struct DeviceBody: Encodable { let platform: String }
    private struct InteractionBatch: Encodable { let events: [Interaction] }
    private struct CaptionBody: Encodable { let caption: String }
    private struct TagsBody: Encodable { let userIds: [String] }
    private struct SendBody: Encodable { let body: String }
    private struct UploadRequest: Encodable { let contentType: String; let sizeBytes: Int }
    private struct UploadIdBody: Encodable { let uploadId: String }
    private struct RsvpBody: Encodable { let status: String }
    private struct UserIdBody: Encodable { let userId: String }
    private struct UserIdsBody: Encodable { let userIds: [String] }
    private struct UnreadCount: Decodable { let unreadCount: Int }
    private struct ModerationQueue: Decodable { let items: [ReportedItem] }
    private struct ModerationBody: Encodable { let targetType: String; let targetId: String; let action: String; let note: String? }
    /// Always sends the key, so a nil reaches the server as null and hides the heart.
    private struct RelationshipBody: Encodable {
        let relationshipStatus: String?
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(relationshipStatus, forKey: .relationshipStatus)
        }
        private enum CodingKeys: String, CodingKey { case relationshipStatus = "relationship_status" }
    }
    /// Encodes as {"interest_id":null}: the one place a null has to reach the server.
    private struct ClearKind: Encodable {
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encodeNil(forKey: .interestId)
        }
        private enum CodingKeys: String, CodingKey { case interestId = "interest_id" }
    }
    private struct ReportBody: Encodable { let targetType: String; let targetId: String; let reason: String }
}
