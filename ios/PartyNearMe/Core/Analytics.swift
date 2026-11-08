import Foundation
import SwiftUI

/// Product analytics: what people use, skip, and get stuck on, sent to PostHog
/// (EU) in batches. The event names and properties are a contract shared with
/// the Android app: see docs/analytics.md before adding or renaming one.
///
/// Privacy: signed-in use is counted under the account's id, and nothing else
/// that identifies anyone: no names, emails, locations, or anything people post
/// or write, and no person profiles. Before sign-in, events carry a random id
/// made fresh each launch and never stored. Off when there is no key or the user
/// turned "Share usage stats" off.
@MainActor
final class Analytics {
    /// Quiet this long and the next event starts a new session (PostHog's own default).
    static let sessionGap: TimeInterval = 30 * 60
    static let apiError = "api_error"

    private let key: String?
    private let enabled: @MainActor () -> Bool
    private let post: @MainActor (Data) async throws -> Void
    private let appVersion: String?
    private let clock: () -> Date
    private let batchSize: Int

    private(set) var pending: [[String: Any]] = []
    private var userId: String?
    private var anonymousId: String
    private var sessionId: String?
    private var lastEventAt: Date?
    private var foregroundSince: Date?
    private var backgroundedAt: Date?

    /// The screen on show, sent with every event so struggles have a place.
    private(set) var screen: String?
    private var screenSince: Date?
    /// Screens on show now, oldest first; the last is the one people are looking at.
    private var visible: [(token: UUID, name: String)] = []

    init(key: String?, enabled: @escaping @MainActor () -> Bool = { true },
         appVersion: String? = Analytics.bundleVersion, clock: @escaping () -> Date = Date.init, batchSize: Int = 20,
         post: @escaping @MainActor (Data) async throws -> Void = { try await Analytics.postToPostHog($0) }) {
        self.key = key
        self.enabled = enabled
        self.appVersion = appVersion
        self.clock = clock
        self.batchSize = batchSize
        self.post = post
        anonymousId = Self.uuidV7(at: clock())
    }

    /// Analytics that never sends anything: the screenshot demo and tests.
    static let off = Analytics(key: nil)

    var active: Bool { key != nil && enabled() }

    /// Counts what follows as this account's.
    func identify(_ userId: String) {
        self.userId = userId
    }

    /// On sign-out: stop counting as that account, and drop anything not sent.
    func reset() {
        userId = nil
        anonymousId = Self.uuidV7(at: clock())
        sessionId = nil
        pending.removeAll()
    }

    /// Records `event` with a few plain properties (counts, kinds, choices);
    /// never personal data or anything a person wrote. Nil values are left out.
    func capture(_ event: String, _ properties: [String: Any?] = [:]) {
        guard active else { return }
        let now = clock()
        if sessionId == nil || lastEventAt.map({ now.timeIntervalSince($0) > Self.sessionGap }) == true {
            sessionId = Self.uuidV7(at: now)
        }
        lastEventAt = now
        var props: [String: Any] = [
            // Events only: no person profile is built for anyone.
            "$process_person_profile": false,
            "$session_id": sessionId ?? "",
            "platform": "ios",
            "signed_in": userId != nil,
        ]
        if let appVersion { props["$app_version"] = appVersion }
        if let screen { props["$screen_name"] = screen }
        for (name, value) in properties {
            guard let value else { continue }
            // Exact types, so a count of 1 is never read as `true`.
            if type(of: value) == Bool.self || type(of: value) == Int.self || type(of: value) == Int64.self
                || type(of: value) == Double.self {
                props[name] = value
            } else {
                props[name] = String(describing: value)
            }
        }
        pending.append([
            "event": event,
            "distinct_id": userId ?? anonymousId,
            "timestamp": Self.timestamp(now),
            "properties": props,
        ])
        if pending.count >= batchSize { Task { await flush() } }
    }

    /// Counts a screen being opened, with how long the one before was open.
    func screenOpened(_ name: String) {
        guard name != screen else { return }
        let now = clock()
        let from = screen
        let seconds = screenSince.map { Int(now.timeIntervalSince($0)) }
        screen = name
        screenSince = now
        capture("$screen", ["from": from, "from_seconds": seconds])
    }

    /// A screen came on show. SwiftUI tells every view on screen when it appears
    /// and disappears (pushed over, popped, a sheet closed, another tab), so the
    /// newest one still showing is where people are.
    func appeared(_ token: UUID, _ name: String) {
        visible.removeAll { $0.token == token }
        visible.append((token, name))
        screenOpened(name)
    }

    func disappeared(_ token: UUID) {
        visible.removeAll { $0.token == token }
        if let top = visible.last { screenOpened(top.name) }
    }

    /// The app came to the front. A return after a long break counts as opening it again.
    func foreground() {
        let now = clock()
        let away = backgroundedAt.map { now.timeIntervalSince($0) }
        foregroundSince = now
        backgroundedAt = nil
        screenSince = now
        if let away, away > Self.sessionGap { capture("app_opened", ["resumed": true]) }
    }

    /// The app went to the back: records how long it was used and the screen
    /// people left it on, then sends what is waiting.
    func background() async {
        let now = clock()
        let since = foregroundSince
        foregroundSince = nil
        backgroundedAt = now
        if let since { capture("app_backgrounded", ["seconds": Int(now.timeIntervalSince(since))]) }
        await flush()
    }

    /// Sees every API call the app makes: a failure is a struggle worth knowing
    /// about (`api_error`), and some successes are the actions in `actions`.
    func apiResult(method: String, path: String, status: Int) {
        let endpoint = Self.endpoint(method: method, path: path)
        if (200..<300).contains(status) {
            if let action = Self.actions[endpoint] { capture(action) }
        } else if status != 410 {
            // 410 is the feed asking to start again from the top, which is normal.
            capture(Self.apiError, ["endpoint": endpoint, "status": status])
        }
    }

    /// Sends what is waiting; failures are dropped, analytics is never worth an error.
    /// Only events recorded while usage stats were on are ever waiting, so the
    /// last one before turning them off (usage_stats_turned_off) still goes.
    func flush() async {
        guard let key, !pending.isEmpty else { return }
        let batch = pending
        pending.removeAll()
        guard let body = try? JSONSerialization.data(withJSONObject: ["api_key": key, "batch": batch]) else { return }
        try? await post(body)
    }

    /// Actions counted straight from a successful API call, so every screen that
    /// does them is covered. Actions with useful extra detail (post_created,
    /// party_created, rsvp_changed, comment_posted, invites_sent) are captured by
    /// the screen instead. Keep in step with docs/analytics.md and Android's Analytics.ACTIONS.
    static let actions: [String: String] = [
        "PUT /posts/:id/like": "post_liked",
        "DELETE /posts/:id/like": "post_unliked",
        "PUT /posts/:id/save": "post_saved",
        "DELETE /posts/:id/save": "post_unsaved",
        "PATCH /posts/:id": "caption_edited",
        "DELETE /posts/:id": "post_deleted",
        "PUT /posts/:id/tags": "people_tagged",
        "DELETE /posts/:id/tags/me": "tag_removed",
        "DELETE /comments/:id": "comment_deleted",
        "PUT /events/:id/save": "party_saved",
        "DELETE /events/:id/save": "party_unsaved",
        "PATCH /events/:id": "party_edited",
        "DELETE /events/:id": "party_deleted",
        "PUT /events/:id/cover": "party_cover_set",
        "POST /events/:id/guests/:id/approve": "guest_approved",
        "DELETE /events/:id/guests/:id": "guest_removed",
        "PUT /users/:id/follow": "user_followed",
        "DELETE /users/:id/follow": "user_unfollowed",
        "PUT /users/:id/block": "user_blocked",
        "DELETE /users/:id/block": "user_unblocked",
        "POST /reports": "report_sent",
        "POST /conversations": "chat_started",
        "POST /conversations/:id/messages": "message_sent",
        "PATCH /me": "profile_edited",
        "PUT /me/avatar": "avatar_set",
        "PUT /me/interests": "interests_set",
        "PATCH /me/settings": "account_setting_changed",
        "DELETE /me": "account_deleted",
    ]

    /// "PUT /posts/:id/like" for "PUT" and "/posts/0b9e.../like?x=1": ids and
    /// tokens become ":id", so calls group by what they do, never by whom.
    nonisolated static func endpoint(method: String, path: String) -> String {
        let bare: String = path.components(separatedBy: "?").first ?? path
        let segments: [String] = bare.components(separatedBy: "/").map { (segment: String) -> String in
            let isNumber = !segment.isEmpty && segment.allSatisfy { $0.isNumber }
            return segment.count >= 16 || isNumber ? ":id" : segment
        }
        return "\(method.uppercased()) \(segments.joined(separator: "/"))"
    }

    /// A random, time-ordered id (UUID version 7), the kind PostHog expects for sessions.
    nonisolated static func uuidV7(at date: Date) -> String {
        var bytes = (0..<16).map { _ in UInt8.random(in: 0...255) }
        let ms = UInt64(max(0, date.timeIntervalSince1970 * 1000))
        for i in 0..<6 { bytes[i] = UInt8(truncatingIfNeeded: ms >> (40 - 8 * UInt64(i))) }
        bytes[6] = (bytes[6] & 0x0F) | 0x70
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let parts = [0..<8, 8..<12, 12..<16, 16..<20, 20..<32].map { range in
            String(hex[hex.index(hex.startIndex, offsetBy: range.lowerBound)..<hex.index(hex.startIndex, offsetBy: range.upperBound)])
        }
        return parts.joined(separator: "-")
    }

    nonisolated static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    nonisolated static var bundleVersion: String? {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
    }

    /// Posts a batch to PostHog's EU endpoint.
    nonisolated static func postToPostHog(_ body: Data) async throws {
        var request = URLRequest(url: URL(string: "\(AppConfig.posthogHost)/batch/")!)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        _ = try await HTTP.send(request)
    }
}

extension View {
    /// Counts this view as the screen `name` (docs/analytics.md lists the names;
    /// never rename one) while it is on show.
    func analyticsScreen(_ name: String) -> some View {
        modifier(AnalyticsScreen(name: name))
    }
}

private struct AnalyticsScreen: ViewModifier {
    @Environment(AppModel.self) private var app
    let name: String
    @State private var token = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { app.analytics.appeared(token, name) }
            .onDisappear { app.analytics.disappeared(token) }
            // One view that changes what it shows, like the steps of onboarding.
            .onChange(of: name) { _, new in app.analytics.appeared(token, new) }
    }
}
