import CoreGraphics
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

/// Someone shown next to their content: post authors, commenters.
struct Person: Codable, Equatable, Hashable, Identifiable {
    let id: String
    var username: String?
    var displayName: String?
    /// Small profile picture, once one is set and checked.
    var avatarUrl: String?

    var name: String { displayName ?? username.map { "@\($0)" } ?? "Someone" }
}

/// Someone in a list: search results, followers, following, blocked accounts.
struct ListedPerson: Codable, Equatable, Hashable, Identifiable {
    let id: String
    var username: String?
    var displayName: String?
    var avatarUrl: String?
    var relationshipStatus: String?
    var isFollowing: Bool?

    var name: String { displayName ?? username.map { "@\($0)" } ?? "Someone" }
}

struct PeoplePage: Decodable {
    let users: [ListedPerson]
    let nextCursor: String?
}

/// Someone's profile as others see it, with their counts.
struct PublicProfile: Codable, Equatable, Identifiable {
    let id: String
    var username: String?
    var displayName: String?
    var bio: String?
    var avatarUrl: String?
    var relationshipStatus: String?
    /// Parties hosted plus parties said "going" to.
    var parties: Int?
    var followers: Int
    var following: Int
    var isFollowing: Bool
    var isBlocked: Bool?
}

/// One photo of a post, with smaller copies the server made.
struct Media: Codable, Equatable, Hashable {
    let position: Int
    var url: String?
    /// Width in pixels ("150", "640", "1080") to address.
    var thumbnails: [String: String]?
    var width: Int?
    var height: Int?
    var blurhash: String?

    /// The smallest copy at least `minWidth` pixels wide, falling back to the full image.
    func url(minWidth: Int) -> URL? {
        let sized = (thumbnails ?? [:])
            .compactMap { key, value in Int(key).map { ($0, value) } }
            .sorted { $0.0 < $1.0 }
            .first { $0.0 >= minWidth }?.1
        return (sized ?? url).flatMap(URL.init(string:))
    }

    /// Width over height, kept within Instagram's range: 4:5 portrait to 1.91:1 landscape.
    var aspectRatio: CGFloat {
        guard let width, let height, height > 0 else { return 1 }
        return min(max(CGFloat(width) / CGFloat(height), 0.8), 1.91)
    }
}

/// Someone tagged in a post's photos.
struct TaggedPerson: Codable, Equatable, Hashable, Identifiable {
    let id: String
    var username: String?
    var displayName: String?

    var name: String { displayName ?? username.map { "@\($0)" } ?? "Someone" }
}

struct Post: Codable, Equatable, Identifiable {
    let id: String
    let author: Person
    var eventId: String?
    var eventTitle: String?
    var caption: String?
    var placeName: String?
    var lat: Double?
    var lng: Double?
    /// "visible" once the photo is checked; "pending" before.
    var status: String
    var likeCount: Int
    var commentCount: Int
    var likedByMe: Bool
    var savedByMe: Bool
    var media: [Media]
    var tags: [TaggedPerson]
    let createdAt: String

    var isVisible: Bool { status == "visible" }

    init(id: String, author: Person, eventId: String? = nil, eventTitle: String? = nil, caption: String? = nil,
         placeName: String? = nil, lat: Double? = nil, lng: Double? = nil, status: String = "visible", likeCount: Int = 0,
         commentCount: Int = 0, likedByMe: Bool = false, savedByMe: Bool = false, media: [Media] = [],
         tags: [TaggedPerson] = [], createdAt: String) {
        self.id = id
        self.author = author
        self.eventId = eventId
        self.eventTitle = eventTitle
        self.caption = caption
        self.placeName = placeName
        self.lat = lat
        self.lng = lng
        self.status = status
        self.likeCount = likeCount
        self.commentCount = commentCount
        self.likedByMe = likedByMe
        self.savedByMe = savedByMe
        self.media = media
        self.tags = tags
        self.createdAt = createdAt
    }

    /// Fields newer servers added are optional on the wire, so older answers still decode.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(Person.self, forKey: .author)
        eventId = try c.decodeIfPresent(String.self, forKey: .eventId)
        eventTitle = try c.decodeIfPresent(String.self, forKey: .eventTitle)
        caption = try c.decodeIfPresent(String.self, forKey: .caption)
        placeName = try c.decodeIfPresent(String.self, forKey: .placeName)
        lat = try c.decodeIfPresent(Double.self, forKey: .lat)
        lng = try c.decodeIfPresent(Double.self, forKey: .lng)
        status = try c.decode(String.self, forKey: .status)
        likeCount = try c.decode(Int.self, forKey: .likeCount)
        commentCount = try c.decodeIfPresent(Int.self, forKey: .commentCount) ?? 0
        likedByMe = try c.decode(Bool.self, forKey: .likedByMe)
        savedByMe = try c.decodeIfPresent(Bool.self, forKey: .savedByMe) ?? false
        media = try c.decodeIfPresent([Media].self, forKey: .media) ?? []
        tags = try c.decodeIfPresent([TaggedPerson].self, forKey: .tags) ?? []
        createdAt = try c.decode(String.self, forKey: .createdAt)
    }

    /// Puts a like (or unlike) on screen at once, before the server answers.
    mutating func setLiked(_ liked: Bool) {
        guard liked != likedByMe else { return }
        likedByMe = liked
        likeCount = max(0, likeCount + (liked ? 1 : -1))
    }
}

struct PostPage: Decodable {
    let posts: [Post]
    let nextCursor: String?
}

/// A comment under a post.
struct Comment: Codable, Equatable, Identifiable {
    let id: String
    let postId: String
    let author: Person
    let body: String
    /// "hidden" only reaches the comment's author, after moderation took it down.
    var status: String?
    /// The author, or the post's author, may delete it.
    var canDelete: Bool?
    let createdAt: String
}

struct CommentPage: Decodable {
    let comments: [Comment]
    let nextCursor: String?
}

/// Where to send a photo: a signed URL straight to storage, so the API never sees the bytes.
struct UploadTicket: Decodable {
    let uploadId: String
    let uploadUrl: String
    let headers: [String: String]
}

struct NewPost: Encodable {
    var uploadIds: [String]
    var caption: String?
    var eventId: String?
    var lat: Double?
    var lng: Double?
    var placeName: String?
}

/// What the user saw or did, reported in batches for ranking.
struct Interaction: Codable, Equatable {
    let kind: String
    var postId: String?
    var eventId: String?
    var dwellMs: Int?
}

/// What gets reported: the server's names for each kind of thing.
enum ReportTarget: String {
    case post, event, user, message, comment
}
