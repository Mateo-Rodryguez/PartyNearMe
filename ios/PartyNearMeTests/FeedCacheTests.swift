import XCTest
@testable import PartyNearMe

final class FeedCacheTests: XCTestCase {
    private var cache: FeedCache!

    override func setUp() {
        cache = FeedCache(file: FileManager.default.temporaryDirectory.appendingPathComponent("feed-\(UUID().uuidString).json"))
    }

    override func tearDown() { cache.clear() }

    private func post(_ id: String) throws -> Post {
        let json = #"""
        {"id":"\#(id)","author":{"id":"u1","username":"sam","display_name":"Sam","avatar_url":null},
         "caption":"Hi","status":"visible","like_count":3,"liked_by_me":true,"saved_by_me":true,"comment_count":2,
         "media":[{"position":0,"url":"https://x/full.webp","thumbnails":{"150":"https://x/150.webp"},"width":1080,"height":1350,"blurhash":"LKO2?U%2Tw=w]~RBVZRi};RPxuwH"}],
         "tags":[{"id":"u2","username":"alex","display_name":"Alex"}],
         "created_at":"2026-10-01T20:00:00.123Z"}
        """#
        return try JSON.decoder.decode(Post.self, from: Data(json.utf8))
    }

    func testSavedPageComesBackTheSame() throws {
        let posts = [try post("p1"), try post("p2")]
        cache.save(userId: "me", posts: posts)
        XCTAssertEqual(cache.load(userId: "me"), posts)
    }

    func testSomeoneElsesFeedIsNeverShown() throws {
        cache.save(userId: "me", posts: [try post("p1")])
        XCTAssertEqual(cache.load(userId: "someone else"), [])
        XCTAssertEqual(cache.load(userId: ""), [])
    }

    func testKeepsOnlyAScreenful() throws {
        let posts = try (0..<30).map { try post("p\($0)") }
        cache.save(userId: "me", posts: posts)
        XCTAssertEqual(cache.load(userId: "me").count, FeedCache.maxPosts)
    }

    func testClearForgetsIt() throws {
        cache.save(userId: "me", posts: [try post("p1")])
        cache.clear()
        XCTAssertEqual(cache.load(userId: "me"), [])
    }

    @MainActor
    func testSeededCopyIsReplacedByTheFirstPageAndNeverPagedOn() async throws {
        var asked: [String?] = []
        let fresh = try post("fresh")
        let paged = Paged<Post> { cursor in
            asked.append(cursor)
            return ([fresh], "next")
        }
        paged.seed([try post("old")])
        XCTAssertEqual(paged.items.map(\.id), ["old"])
        await paged.loadMore()
        XCTAssertEqual(asked, [], "a saved copy has no next page")

        await paged.refresh()
        XCTAssertEqual(paged.items.map(\.id), ["fresh"])

        paged.seed([try post("old")])
        XCTAssertEqual(paged.items.map(\.id), ["fresh"], "a seed never covers loaded items")
    }

    @MainActor
    func testRetryAfterAFailedFirstLoadReplacesTheSeed() async throws {
        var fail = true
        let fresh = try post("fresh")
        let paged = Paged<Post> { _ in
            if fail { throw URLError(.notConnectedToInternet) }
            return ([fresh], nil)
        }
        paged.seed([try post("old")])
        await paged.refresh()
        XCTAssertEqual(paged.items.map(\.id), ["old"], "the saved copy stays while offline")
        XCTAssertNotNil(paged.error)

        fail = false
        await paged.retry()
        XCTAssertEqual(paged.items.map(\.id), ["fresh"])
    }
}
