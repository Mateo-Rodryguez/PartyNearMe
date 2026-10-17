package com.partynearme.core.cache

import com.partynearme.core.model.Post
import com.russhwolf.settings.Settings
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The first page of the feed as it was last loaded, so the app can show it at
 * once (or offline) while the fresh one loads. Only for the user who saved it.
 */
interface FeedCache {
    fun load(userId: String): List<Post>
    fun save(userId: String, posts: List<Post>)
    fun clear()
}

/** Keeps nothing; for tests and the demo. */
object NoFeedCache : FeedCache {
    override fun load(userId: String) = emptyList<Post>()
    override fun save(userId: String, posts: List<Post>) = Unit
    override fun clear() = Unit
}

/** Stores the saved page as JSON in the phone's app settings. */
class SettingsFeedCache(
    private val settings: Settings,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : FeedCache {
    @Serializable
    private data class Saved(@SerialName("user_id") val userId: String, val posts: List<Post>)

    override fun load(userId: String): List<Post> =
        settings.getStringOrNull(KEY)
            ?.let { runCatching { json.decodeFromString(Saved.serializer(), it) }.getOrNull() }
            ?.takeIf { it.userId == userId }
            ?.posts
            .orEmpty()

    override fun save(userId: String, posts: List<Post>) {
        settings.putString(KEY, json.encodeToString(Saved.serializer(), Saved(userId, posts.take(MAX_POSTS))))
    }

    override fun clear() = settings.remove(KEY)

    companion object {
        private const val KEY = "feed_cache"
        /** About one screenful of scrolling; keeps the saved copy small. */
        const val MAX_POSTS = 20
    }
}
