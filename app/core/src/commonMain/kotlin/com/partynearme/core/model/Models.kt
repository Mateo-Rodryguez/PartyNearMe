package com.partynearme.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Mirrors the API's JSON. Timestamps stay ISO-8601 strings; screens format them.

@Serializable
data class Person(
    val id: String,
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    /** Small profile picture, once one is set and checked. */
    @SerialName("avatar_url") val avatarUrl: String? = null,
) {
    val name: String get() = displayName ?: username?.let { "@$it" } ?: "Someone"
}

@Serializable
data class OwnProfile(
    val id: String,
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    val bio: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("interest_ids") val interestIds: List<Int> = emptyList(),
    @SerialName("is_moderator") val isModerator: Boolean = false,
)

@Serializable
data class PublicProfile(
    val id: String,
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    val bio: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val followers: Int,
    val following: Int,
    @SerialName("is_following") val isFollowing: Boolean,
    @SerialName("is_blocked") val isBlocked: Boolean = false,
)

/** Something people reported, with all its open reports, for moderators. */
@Serializable
data class ReportedItem(
    @SerialName("target_type") val targetType: String,
    @SerialName("target_id") val targetId: String,
    @SerialName("report_count") val reportCount: Int,
    val reasons: List<String> = emptyList(),
    @SerialName("first_reported_at") val firstReportedAt: String,
    /** Null when it was deleted after being reported. */
    val preview: ReportedPreview? = null,
)

@Serializable
data class ReportedPreview(
    val title: String,
    val body: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    val status: String? = null,
    @SerialName("user_id") val userId: String? = null,
)

@Serializable
data class ModerationQueue(val items: List<ReportedItem>)

@Serializable
data class UploadId(@SerialName("upload_id") val uploadId: String)

@Serializable
data class Interest(val id: Int, val slug: String, val name: String)

@Serializable
data class Media(
    val position: Int,
    val url: String? = null,
    val thumbnails: Map<String, String> = emptyMap(),
    val width: Int? = null,
    val height: Int? = null,
    val blurhash: String? = null,
) {
    /** Picks the smallest size that is at least [minWidth] wide, falling back to the full image. */
    fun urlFor(minWidth: Int): String? =
        thumbnails.entries
            .mapNotNull { (size, url) -> size.toIntOrNull()?.let { it to url } }
            .sortedBy { it.first }
            .firstOrNull { it.first >= minWidth }?.second
            ?: url
}

@Serializable
data class Post(
    val id: String,
    val author: Person,
    @SerialName("event_id") val eventId: String? = null,
    @SerialName("event_title") val eventTitle: String? = null,
    val caption: String? = null,
    @SerialName("place_name") val placeName: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    val status: String,
    @SerialName("like_count") val likeCount: Int,
    @SerialName("liked_by_me") val likedByMe: Boolean,
    val media: List<Media> = emptyList(),
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class PostPage(val posts: List<Post>, @SerialName("next_cursor") val nextCursor: String? = null)

@Serializable
data class Event(
    val id: String,
    val organiser: Person,
    val title: String,
    val description: String? = null,
    @SerialName("starts_at") val startsAt: String,
    @SerialName("ends_at") val endsAt: String? = null,
    @SerialName("venue_name") val venueName: String? = null,
    val lat: Double,
    val lng: Double,
    @SerialName("cover_url") val coverUrl: String? = null,
    val status: String,
    @SerialName("going_count") val goingCount: Int,
    @SerialName("interested_count") val interestedCount: Int,
    @SerialName("my_rsvp") val myRsvp: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("distance_m") val distanceM: Int? = null,
)

@Serializable
data class EventPage(val events: List<Event>, @SerialName("next_cursor") val nextCursor: String? = null)

@Serializable
data class NewEvent(
    val title: String,
    val description: String? = null,
    @SerialName("starts_at") val startsAt: String,
    @SerialName("ends_at") val endsAt: String? = null,
    @SerialName("venue_name") val venueName: String? = null,
    val lat: Double,
    val lng: Double,
    val publish: Boolean = true,
)

@Serializable
data class UploadTicket(
    @SerialName("upload_id") val uploadId: String,
    @SerialName("upload_url") val uploadUrl: String,
    val headers: Map<String, String>,
)

@Serializable
data class NewPost(
    @SerialName("upload_ids") val uploadIds: List<String>,
    val caption: String? = null,
    @SerialName("event_id") val eventId: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    @SerialName("place_name") val placeName: String? = null,
)

@Serializable
data class Message(
    val id: String,
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String,
    val body: String,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class Conversation(
    val id: String,
    val other: Person? = null,
    @SerialName("last_message") val lastMessage: Message? = null,
    @SerialName("unread_count") val unreadCount: Int,
    @SerialName("last_message_at") val lastMessageAt: String? = null,
)

@Serializable
data class ConversationPage(
    val conversations: List<Conversation>,
    @SerialName("next_cursor") val nextCursor: String? = null,
)

@Serializable
data class MessagePage(val messages: List<Message>, @SerialName("has_more") val hasMore: Boolean)

/** What the user saw or did, reported in batches for ranking. */
@Serializable
data class Interaction(
    val kind: String,
    @SerialName("post_id") val postId: String? = null,
    @SerialName("event_id") val eventId: String? = null,
    @SerialName("dwell_ms") val dwellMs: Long? = null,
)
