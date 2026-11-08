import Foundation

/// The first page of Home as it was last loaded, so the app can show it at once
/// (or offline) while the fresh one loads: the free server can take up to a minute
/// to wake. Kept only for the user who saved it, and dropped on sign-out.
/// Matches Android's SettingsFeedCache.
struct FeedCache {
    /// About one screenful of scrolling; keeps the saved copy small.
    static let maxPosts = 20

    let file: URL

    init(file: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("feed_cache.json")) {
        self.file = file
    }

    private struct Saved: Codable {
        let userId: String
        let posts: [Post]
    }

    func load(userId: String) -> [Post] {
        guard !userId.isEmpty,
              let data = try? Data(contentsOf: file),
              let saved = try? JSON.decoder.decode(Saved.self, from: data),
              saved.userId == userId else { return [] }
        return saved.posts
    }

    func save(userId: String, posts: [Post]) {
        guard !userId.isEmpty, let data = try? JSON.encoder.encode(Saved(userId: userId, posts: Array(posts.prefix(Self.maxPosts)))) else { return }
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func clear() { try? FileManager.default.removeItem(at: file) }
}
