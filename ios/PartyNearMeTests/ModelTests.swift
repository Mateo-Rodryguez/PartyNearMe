import XCTest
@testable import PartyNearMe

final class ModelTests: XCTestCase {
    func testOwnProfileDecodesFromTheApiShape() throws {
        let json = #"""
        {"id":"u1","username":"maya.nights","display_name":"Maya","bio":null,"avatar_url":"https://x/a.webp",
         "relationship_status":"single","created_at":"2026-10-01T20:00:00Z","interest_ids":[1,3],"is_moderator":true,
         "something_new":"ignored"}
        """#
        let profile = try JSON.decoder.decode(OwnProfile.self, from: Data(json.utf8))
        XCTAssertEqual(profile.username, "maya.nights")
        XCTAssertEqual(profile.displayName, "Maya")
        XCTAssertEqual(profile.avatarUrl, "https://x/a.webp")
        XCTAssertEqual(profile.interestIds, [1, 3])
        XCTAssertEqual(profile.isModerator, true)
        XCTAssertEqual(profile.name, "Maya")
    }

    func testNewAccountHasNoUsernameYet() throws {
        let json = #"{"id":"u1","username":null,"display_name":null,"created_at":"2026-10-01T20:00:00Z"}"#
        let profile = try JSON.decoder.decode(OwnProfile.self, from: Data(json.utf8))
        XCTAssertNil(profile.username)
        XCTAssertNil(profile.interestIds)
    }

    func testProfileUpdateLeavesOutWhatDidNotChange() throws {
        let data = try JSON.encoder.encode(ProfileUpdate(username: "maya", displayName: nil, bio: nil))
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(object?["username"] as? String, "maya")
        XCTAssertEqual(object?.count, 1)
        let named = try JSON.encoder.encode(ProfileUpdate(username: nil, displayName: "Maya", bio: nil))
        XCTAssertEqual(String(data: named, encoding: .utf8), #"{"display_name":"Maya"}"#)
    }

    func testServerErrorsReadWell() {
        XCTAssertEqual(APIClient.errorMessage(status: 409, data: Data(#"{"message":"That username is taken"}"#.utf8)),
                       "That username is taken")
        XCTAssertEqual(APIClient.errorMessage(status: 503, data: Data()), "Something went wrong on our side. Try again in a moment.")
        XCTAssertEqual(APIClient.errorMessage(status: 418, data: Data("teapot".utf8)), "Request failed (418)")
    }

    @MainActor
    func testUsernameRules() {
        XCTAssertTrue(ProfileSetupView.isValid("maya.nights_2"))
        XCTAssertFalse(ProfileSetupView.isValid("ma"))
        XCTAssertFalse(ProfileSetupView.isValid("Maya"))
        XCTAssertEqual(ProfileSetupView.clean("Maya Nights!"), "mayanights")
        XCTAssertEqual(ProfileSetupView.clean("été"), "t")
        XCTAssertEqual(ProfileSetupView.clean(String(repeating: "a", count: 40)).count, 30)
    }

    func testPathsAreEscaped() {
        XCTAssertEqual("a/b c".pathEscaped, "a%2Fb%20c")
    }
}
