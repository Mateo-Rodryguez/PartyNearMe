import XCTest
@testable import PartyNearMe

@MainActor
final class SettingsTests: XCTestCase {
    private func freshDefaults() -> UserDefaults {
        let name = "SettingsTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    func testPrefsStartWithDefaultsAndRemember() {
        let defaults = freshDefaults()
        let prefs = AppPrefs(defaults: defaults)
        XCTAssertEqual(prefs.theme, .system)
        XCTAssertEqual(prefs.radiusKm, 25)
        XCTAssertFalse(prefs.hideLikeCounts)

        prefs.theme = .dark
        prefs.radiusKm = 50
        prefs.miles = true
        prefs.hideLikeCounts = true
        let again = AppPrefs(defaults: defaults)
        XCTAssertEqual(again.theme, .dark)
        XCTAssertEqual(again.radiusKm, 50)
        XCTAssertTrue(again.miles)
        XCTAssertTrue(again.hideLikeCounts)
    }

    func testRadiusLabels() {
        let prefs = AppPrefs(defaults: freshDefaults())
        prefs.miles = false
        XCTAssertEqual(prefs.radiusLabel(25), "25 km")
        prefs.miles = true
        XCTAssertEqual(prefs.radiusLabel(25), "16 mi")
    }

    func testAccountSettingsFillInMissingFields() throws {
        let settings = try JSON.decoder.decode(AccountSettings.self, from: Data(#"{"messages_from":"following"}"#.utf8))
        XCTAssertEqual(settings.messagesFrom, "following")
        XCTAssertTrue(settings.pushMessages)
        let json = try XCTUnwrap(String(data: JSON.encoder.encode(settings), encoding: .utf8))
        XCTAssertTrue(json.contains(#""push_comments":true"#))
    }

    func testReportedItemsDecode() throws {
        let json = #"{"target_type":"post","target_id":"p1","report_count":2,"first_reported_at":"2026-11-01T20:00:00Z"}"#
        let item = try JSON.decoder.decode(ReportedItem.self, from: Data(json.utf8))
        XCTAssertEqual(item.id, "post:p1")
        XCTAssertEqual(item.reasons, [])
        XCTAssertNil(item.preview)
    }

    func testEveryReportCanBeDismissed() {
        for type in ["post", "event", "user", "message", "comment", "other"] {
            XCTAssertEqual(ModerationView.actions(for: type).last?.action, .dismiss)
        }
        XCTAssertEqual(ModerationView.actions(for: "user").map(\.label), ["Remove picture", "Delete account", "Nothing wrong"])
    }
}
