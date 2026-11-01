import Foundation

// Mirrors the API's JSON (snake_case on the wire, see JSON.swift). Timestamps stay
// ISO-8601 strings; screens format them. More models arrive with each screen.

/// The signed-in user's own profile, from GET /me.
struct OwnProfile: Codable, Equatable, Identifiable {
    let id: String
    var username: String?
    var displayName: String?
    var bio: String?
    var avatarUrl: String?
    /// "taken", "talking" or "single"; nil shows no heart.
    var relationshipStatus: String?
    let createdAt: String
    var interestIds: [Int]?
    var isModerator: Bool?

    /// What to call them: their name, else their @username.
    var name: String { displayName ?? username.map { "@\($0)" } ?? "You" }
}

/// What PATCH /me changes; fields left nil stay as they are.
struct ProfileUpdate: Encodable {
    var username: String?
    var displayName: String?
    var bio: String?
}

/// A kind of party people can be into, used by the feed, Nearby filters and party kinds.
struct Interest: Codable, Equatable, Identifiable, Hashable {
    let id: Int
    let slug: String
    let name: String
}
