import XCTest
@testable import PartyNearMe

@MainActor
final class AnalyticsTests: XCTestCase {
    /// A clock the test moves by hand.
    private final class Clock {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    /// Batches "sent" to PostHog, decoded.
    private final class Sent {
        var batches: [[String: Any]] = []
        var events: [[String: Any]] { batches.flatMap { $0["batch"] as? [[String: Any]] ?? [] } }
        var names: [String] { events.compactMap { $0["event"] as? String } }
    }

    private func make(key: String? = "phc_test", on: @escaping () -> Bool = { true }, clock: Clock = Clock(),
                      sent: Sent = Sent()) -> Analytics {
        Analytics(key: key, enabled: on, appVersion: "1.2.3", clock: { clock.now }, batchSize: 100) { body in
            let object = try JSONSerialization.jsonObject(with: body) as? [String: Any] ?? [:]
            sent.batches.append(object)
        }
    }

    private func properties(_ event: [String: Any]) -> [String: Any] { event["properties"] as? [String: Any] ?? [:] }

    func testEventsCarryTheSharedProperties() async {
        let sent = Sent()
        let analytics = make(sent: sent)
        analytics.identify("user-1")
        analytics.screenOpened("party")
        analytics.capture("rsvp_changed", ["status": "going", "missing": nil as String?])
        await analytics.flush()

        XCTAssertEqual(sent.batches.first?["api_key"] as? String, "phc_test")
        XCTAssertEqual(sent.names, ["$screen", "rsvp_changed"])
        let event = sent.events[1]
        XCTAssertEqual(event["distinct_id"] as? String, "user-1")
        XCTAssertNotNil(event["timestamp"] as? String)
        let props = properties(event)
        XCTAssertEqual(props["platform"] as? String, "ios")
        XCTAssertEqual(props["$app_version"] as? String, "1.2.3")
        XCTAssertEqual(props["$screen_name"] as? String, "party")
        XCTAssertEqual(props["signed_in"] as? Bool, true)
        XCTAssertEqual(props["$process_person_profile"] as? Bool, false)
        XCTAssertEqual(props["status"] as? String, "going")
        XCTAssertNil(props["missing"])
        XCTAssertEqual((props["$session_id"] as? String)?.count, 36)
    }

    func testNothingIsRecordedWithoutAKeyOrWhenTurnedOff() async {
        let sent = Sent()
        var on = true
        let analytics = make(on: { on }, sent: sent)
        on = false
        analytics.capture("post_liked")
        await analytics.flush()
        XCTAssertTrue(sent.batches.isEmpty)

        let keyless = make(key: nil, sent: sent)
        keyless.capture("post_liked")
        await keyless.flush()
        XCTAssertTrue(sent.batches.isEmpty)
    }

    func testTheLastEventBeforeTurningOffStillGoes() async {
        let sent = Sent()
        var on = true
        let analytics = make(on: { on }, sent: sent)
        analytics.capture("usage_stats_turned_off")
        on = false
        analytics.capture("post_liked")
        await analytics.flush()
        XCTAssertEqual(sent.names, ["usage_stats_turned_off"])
    }

    func testScreensSayWhereFromAndHowLong() async {
        let sent = Sent()
        let clock = Clock()
        let analytics = make(clock: clock, sent: sent)
        let home = UUID(), party = UUID()
        analytics.appeared(home, "home")
        clock.now += 12
        analytics.appeared(party, "party")
        // Popping back: the party page goes, Home is on show again.
        analytics.disappeared(party)
        await analytics.flush()

        XCTAssertEqual(sent.names, ["$screen", "$screen", "$screen"])
        let second = properties(sent.events[1])
        XCTAssertEqual(second["$screen_name"] as? String, "party")
        XCTAssertEqual(second["from"] as? String, "home")
        XCTAssertEqual(second["from_seconds"] as? Int, 12)
        XCTAssertEqual(properties(sent.events[2])["$screen_name"] as? String, "home")
        XCTAssertEqual(analytics.screen, "home")
    }

    func testANewSessionStartsAfterHalfAnHourQuiet() async {
        let sent = Sent()
        let clock = Clock()
        let analytics = make(clock: clock, sent: sent)
        analytics.capture("a")
        clock.now += 60
        analytics.capture("b")
        clock.now += 31 * 60
        analytics.capture("c")
        await analytics.flush()
        let sessions = sent.events.map { properties($0)["$session_id"] as? String }
        XCTAssertEqual(sessions[0], sessions[1])
        XCTAssertNotEqual(sessions[1], sessions[2])
    }

    func testComingBackAfterABreakCountsAsOpening() async {
        let sent = Sent()
        let clock = Clock()
        let analytics = make(clock: clock, sent: sent)
        analytics.foreground()
        clock.now += 90
        await analytics.background()
        clock.now += 5 * 60
        analytics.foreground()
        clock.now += 10
        await analytics.background()
        clock.now += 45 * 60
        analytics.foreground()
        await analytics.flush()

        XCTAssertEqual(sent.names, ["app_backgrounded", "app_backgrounded", "app_opened"])
        XCTAssertEqual(properties(sent.events[0])["seconds"] as? Int, 90)
        XCTAssertEqual(properties(sent.events[2])["resumed"] as? Bool, true)
    }

    func testCountsAreNumbersAndFlagsAreBooleans() async {
        let sent = Sent()
        let analytics = make(sent: sent)
        analytics.capture("post_created", ["photos": 1, "tagged": 0, "at_party": true])
        await analytics.flush()
        let body = try? JSONSerialization.data(withJSONObject: sent.events[0])
        let text = body.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        XCTAssertTrue(text.contains(#""photos":1"#), text)
        XCTAssertTrue(text.contains(#""at_party":true"#), text)
    }

    func testApiCallsBecomeActionsAndStruggles() async {
        let sent = Sent()
        let analytics = make(sent: sent)
        analytics.apiResult(method: "PUT", path: "/posts/0b9e6c1a-1111-4222-8333-944445555666/like", status: 204)
        analytics.apiResult(method: "GET", path: "/feed?cursor=abc", status: 200)
        analytics.apiResult(method: "GET", path: "/feed", status: 410)
        analytics.apiResult(method: "POST", path: "/posts/0b9e6c1a-1111-4222-8333-944445555666/comments", status: 0)
        analytics.apiResult(method: "DELETE", path: "/me", status: 200)
        await analytics.flush()

        XCTAssertEqual(sent.names, ["post_liked", "api_error", "account_deleted"])
        let error = properties(sent.events[1])
        XCTAssertEqual(error["endpoint"] as? String, "POST /posts/:id/comments")
        XCTAssertEqual(error["status"] as? Int, 0)
    }

    func testEndpointsHideIds() {
        XCTAssertEqual(Analytics.endpoint(method: "put", path: "/posts/0b9e6c1a-1111-4222-8333-944445555666/like?x=1"),
                       "PUT /posts/:id/like")
        XCTAssertEqual(Analytics.endpoint(method: "DELETE", path: "/events/abcdefabcdefabcdef/guests/42"),
                       "DELETE /events/:id/guests/:id")
        XCTAssertEqual(Analytics.endpoint(method: "DELETE", path: "/posts/abc/tags/me"), "DELETE /posts/abc/tags/me")
    }

    func testSignOutStartsAnonymousAgain() async {
        let sent = Sent()
        let analytics = make(sent: sent)
        analytics.identify("user-1")
        analytics.capture("dropped")
        analytics.reset()
        analytics.capture("after")
        await analytics.flush()
        XCTAssertEqual(sent.names, ["after"])
        XCTAssertNotEqual(sent.events[0]["distinct_id"] as? String, "user-1")
        XCTAssertEqual(properties(sent.events[0])["signed_in"] as? Bool, false)
    }

    func testUUIDv7Shape() {
        let id = Analytics.uuidV7(at: Date(timeIntervalSince1970: 1_800_000_000))
        XCTAssertEqual(id.count, 36)
        let parts = id.split(separator: "-")
        XCTAssertEqual(parts.map(\.count), [8, 4, 4, 4, 12])
        XCTAssertTrue(parts[2].hasPrefix("7"))
        XCTAssertTrue("89ab".contains(parts[3].first!))
    }

    func testEveryActionMatchesAndroid() {
        // The same 28 actions as Android's Analytics.ACTIONS (docs/analytics.md).
        XCTAssertEqual(Analytics.actions.count, 28)
        XCTAssertEqual(Analytics.actions["POST /events/:id/guests/:id/approve"], "guest_approved")
        XCTAssertEqual(Analytics.actions["PATCH /me/settings"], "account_setting_changed")
    }

    func testRecommendWaitsUntilSomeoneKnowsTheApp() {
        let name = "AnalyticsTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        let prefs = AppPrefs(defaults: defaults)
        XCTAssertTrue(prefs.shareUsage)
        prefs.activeOn(100)
        prefs.activeOn(100)
        prefs.activeOn(103)
        XCTAssertEqual(prefs.activeDays, 2)
        XCTAssertFalse(prefs.recommendDue(103))
        prefs.activeOn(107)
        XCTAssertTrue(prefs.recommendDue(107))
        prefs.recommendAskedDay = 107
        XCTAssertFalse(prefs.recommendDue(150))
        XCTAssertTrue(prefs.recommendDue(197))
        XCTAssertEqual(AppPrefs(defaults: defaults).activeDays, 3)
    }

    func testFeedbackEncodesLikeAndroid() throws {
        let body = try JSON.encoder.encode(Feedback(kind: .recommend, score: 9, body: nil, screen: "home", appVersion: "1.0"))
        let object = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        XCTAssertEqual(object?["kind"] as? String, "nps")
        XCTAssertEqual(object?["score"] as? Int, 9)
        XCTAssertEqual(object?["platform"] as? String, "ios")
        XCTAssertEqual(object?["app_version"] as? String, "1.0")
        XCTAssertNil(object?["body"])
        XCTAssertEqual(try JSONSerialization.jsonObject(with: JSON.encoder.encode(Feedback(kind: .heardFrom))) as? [String: String],
                       ["kind": "heard_from", "platform": "ios"])
    }

    func testRoutesHaveTheSharedScreenNames() {
        XCTAssertEqual(Route.event("e1").screenName, "party")
        XCTAssertEqual(Route.people(userId: "u", followers: false, title: "").screenName, "following")
        XCTAssertEqual(Route.guests(eventId: "e", title: "").screenName, "guest_list")
        XCTAssertEqual(Route.feedback.screenName, "feedback")
    }
}
