import XCTest
@testable import PartyNearMe

final class PostTests: XCTestCase {
    private let postJSON = #"""
    {"id":"p1","author":{"id":"u1","username":"sam","display_name":"Sam","avatar_url":null},
     "event_id":null,"caption":"Hi","status":"visible","like_count":3,"liked_by_me":false,
     "media":[{"position":0,"url":"https://x/full.webp","thumbnails":{"150":"https://x/150.webp","640":"https://x/640.webp","1080":"https://x/1080.webp"},
               "width":1080,"height":1350,"blurhash":"LKO2?U%2Tw=w]~RBVZRi};RPxuwH"}],
     "created_at":"2026-10-01T20:00:00.123Z"}
    """#

    func testPostDecodesAndFillsInMissingFields() throws {
        let post = try JSON.decoder.decode(Post.self, from: Data(postJSON.utf8))
        XCTAssertEqual(post.author.name, "Sam")
        XCTAssertEqual(post.commentCount, 0)
        XCTAssertFalse(post.savedByMe)
        XCTAssertEqual(post.tags, [])
        XCTAssertTrue(post.isVisible)
        XCTAssertEqual(post.media.first?.aspectRatio ?? 0, 0.8, accuracy: 0.001)
    }

    func testNewPostSendsTagsOnlyWhenSomeoneIsTagged() throws {
        let tagged = try JSON.encoder.encode(NewPost(uploadIds: ["up1"], tagIds: ["u2", "u3"]))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: tagged) as? [String: Any])
        XCTAssertEqual(object["tag_ids"] as? [String], ["u2", "u3"])
        XCTAssertEqual(object["upload_ids"] as? [String], ["up1"])

        let plain = try JSON.encoder.encode(NewPost(uploadIds: ["up1"]))
        let keys = try XCTUnwrap(JSONSerialization.jsonObject(with: plain) as? [String: Any]).keys
        XCTAssertEqual(Set(keys), ["upload_ids"])
    }

    func testTaggedPersonBecomesAPickerRow() {
        let person = TaggedPerson(id: "u2", username: "alex", displayName: nil)
        XCTAssertEqual(person.listed, ListedPerson(id: "u2", username: "alex", displayName: nil))
        XCTAssertEqual(person.listed.name, "@alex")
    }

    func testMediaPicksTheSmallestCopyThatIsBigEnough() throws {
        let post = try JSON.decoder.decode(Post.self, from: Data(postJSON.utf8))
        let media = try XCTUnwrap(post.media.first)
        XCTAssertEqual(media.url(minWidth: 320)?.absoluteString, "https://x/640.webp")
        XCTAssertEqual(media.url(minWidth: 1080)?.absoluteString, "https://x/1080.webp")
        XCTAssertEqual(media.url(minWidth: 2000)?.absoluteString, "https://x/full.webp")
    }

    func testAspectRatioStaysInInstagramsRange() {
        XCTAssertEqual(Media(position: 0, width: 1000, height: 3000).aspectRatio, 0.8)
        XCTAssertEqual(Media(position: 0, width: 4000, height: 1000).aspectRatio, 1.91)
        XCTAssertEqual(Media(position: 0).aspectRatio, 1)
    }

    func testLikingChangesTheCountOnce() throws {
        var post = try JSON.decoder.decode(Post.self, from: Data(postJSON.utf8))
        post.setLiked(true)
        post.setLiked(true)
        XCTAssertEqual(post.likeCount, 4)
        post.setLiked(false)
        XCTAssertEqual(post.likeCount, 3)
        XCTAssertFalse(post.likedByMe)
    }

    func testNewPostLeavesOutWhatIsNotSet() throws {
        let data = try JSON.encoder.encode(NewPost(uploadIds: ["a"], caption: "Hi"))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["upload_ids"] as? [String], ["a"])
        XCTAssertEqual(object["caption"] as? String, "Hi")
        XCTAssertEqual(object.count, 2)
    }

    func testInteractionsUseTheServersNames() throws {
        let data = try JSON.encoder.encode(Interaction(kind: "dwell", postId: "p1", dwellMs: 900))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["post_id"] as? String, "p1")
        XCTAssertEqual(object["dwell_ms"] as? Int, 900)
    }

    func testCountsReadLikeSocialApps() {
        XCTAssertEqual(Formatting.compactCount(999), "999")
        XCTAssertEqual(Formatting.compactCount(1890), "1,890")
        XCTAssertEqual(Formatting.compactCount(1005), "1,005")
        XCTAssertEqual(Formatting.compactCount(12_500), "12.5K")
        XCTAssertEqual(Formatting.compactCount(20_000), "20K")
        XCTAssertEqual(Formatting.compactCount(1_250_000), "1.2M")
    }

    func testTimesReadLikeSocialApps() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        func iso(_ secondsAgo: TimeInterval) -> String { ISO8601DateFormatter().string(from: now.addingTimeInterval(-secondsAgo)) }
        XCTAssertEqual(Formatting.timeAgo(iso(20), now: now), "now")
        XCTAssertEqual(Formatting.timeAgo(iso(5 * 60), now: now), "5m")
        XCTAssertEqual(Formatting.timeAgo(iso(3 * 3600), now: now), "3h")
        XCTAssertEqual(Formatting.timeAgo(iso(2 * 86400), now: now), "2d")
        XCTAssertEqual(Formatting.timeAgo("not a date", now: now), "")
        XCTAssertNotNil(Formatting.date("2026-10-01T20:00:00.123Z"))
        XCTAssertNotNil(Formatting.date("2026-10-01T20:00:00Z"))
    }

    func testTaggedNames() {
        XCTAssertEqual(Formatting.tagged(["Sam"]), "Sam")
        XCTAssertEqual(Formatting.tagged(["Sam", "Alex"]), "Sam and Alex")
        XCTAssertEqual(Formatting.tagged(["Sam", "Alex", "Kim"]), "Sam and 2 others")
    }

    func testBlurHashDecodes() {
        let image = BlurHash.decode("LKO2?U%2Tw=w]~RBVZRi};RPxuwH", width: 8, height: 8)
        XCTAssertEqual(image?.size, CGSize(width: 8, height: 8))
        XCTAssertNil(BlurHash.decode("short", width: 8, height: 8))
    }

    func testPhotosAreScaledDownNotUp() {
        XCTAssertEqual(PickedPhoto.scaled(CGSize(width: 4032, height: 3024), maxEdge: 2048), CGSize(width: 2048, height: 1536))
        XCTAssertEqual(PickedPhoto.scaled(CGSize(width: 800, height: 600), maxEdge: 2048), CGSize(width: 800, height: 600))
    }

    @MainActor
    func testInteractionLogCountsEachImpressionOnceAndSkipsGlances() {
        let log = InteractionLog(batchSize: 100) { _ in }
        log.impression("p1")
        log.impression("p1")
        log.dwell("p1", milliseconds: 200)
        log.dwell("p1", milliseconds: 99_999_999)
        XCTAssertEqual(log.waiting.map(\.kind), ["impression", "dwell"])
        XCTAssertEqual(log.waiting.last?.dwellMs, InteractionLog.maxDwellMs)
    }

    @MainActor
    func testInteractionLogCountsAnImpressionOncePerListAndKeepsWhereItWas() {
        let log = InteractionLog(batchSize: 100) { _ in }
        log.impression(eventId: "e1", surface: "for_you_parties", serveId: "s1", position: 0)
        log.impression(eventId: "e1", surface: "for_you_parties", serveId: "s1", position: 0)
        log.impression(eventId: "e1", surface: "nearby", position: 3)
        log.open(eventId: "e1", surface: "for_you_parties", serveId: "s1", position: 0)
        XCTAssertEqual(log.waiting.map(\.kind), ["impression", "impression", "open"])
        XCTAssertEqual(log.waiting.map(\.surface), ["for_you_parties", "nearby", "for_you_parties"])
        XCTAssertEqual(log.waiting.map(\.serveId), ["s1", nil, "s1"])
        XCTAssertEqual(log.waiting.map(\.position), [0, 3, 0])
    }

    func testDecodesForYouReasons() throws {
        let json = #"{"kind":"interest","text":"Because you like Music"}"#
        let reason = try JSONDecoder().decode(Reason.self, from: Data(json.utf8))
        XCTAssertEqual(reason, Reason(kind: "interest", text: "Because you like Music"))
    }
}
