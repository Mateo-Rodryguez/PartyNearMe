package com.partynearme.core.analytics

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.random.Random
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant

/**
 * Product analytics: what people use, skip, and get stuck on, sent to PostHog
 * (EU) in batches. The event names and properties are a contract shared with
 * the iPhone app: see docs/analytics.md before adding or renaming one.
 *
 * Privacy: signed-in use is counted under the account's id, and nothing else
 * that identifies anyone: no names, emails, locations, or anything people post
 * or write, and no person profiles. Before sign-in, events carry a random id
 * made fresh each launch and never stored. Off when there is no key or the user
 * turned "Share usage stats" off.
 */
class Analytics(
    private val key: String?,
    private val platform: String,
    private val enabled: () -> Boolean,
    /** Posts a JSON body to PostHog's batch endpoint. */
    private val post: suspend (body: String) -> Unit,
    private val appVersion: String? = null,
    private val clock: () -> Instant = { Clock.System.now() },
    private val batchSize: Int = 20,
    private val random: Random = Random.Default,
) {
    private val lock = Mutex()
    // Outlives any screen, so an event recorded as a screen closes still gets sent.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    private val pending = mutableListOf<JsonObject>()
    private var userId: String? = null
    private var anonymousId = uuidV7(clock(), random)

    private var sessionId: String? = null
    private var lastEventAt: Instant? = null
    private var foregroundSince: Instant? = null
    private var backgroundedAt: Instant? = null

    /** The screen on show, sent with every event so struggles have a place. */
    var screen: String? = null
        private set
    private var screenSince: Instant? = null

    val active: Boolean get() = key != null && enabled()

    /** Counts what follows as this account's. */
    fun identify(userId: String) {
        this.userId = userId
    }

    /** On sign-out: stop counting as that account, and drop anything not sent. */
    suspend fun reset() {
        userId = null
        anonymousId = uuidV7(clock(), random)
        sessionId = null
        lock.withLock { pending.clear() }
    }

    /**
     * Records [event] with a few plain properties (counts, kinds, choices);
     * never personal data or anything a person wrote.
     */
    suspend fun capture(event: String, properties: Map<String, Any?> = emptyMap()) {
        if (!active) return
        val now = clock()
        val last = lastEventAt
        if (sessionId == null || (last != null && now - last > SESSION_GAP)) sessionId = uuidV7(now, random)
        lastEventAt = now
        val item = buildJsonObject {
            put("event", event)
            put("distinct_id", userId ?: anonymousId)
            put("timestamp", now.toString())
            put("properties", buildJsonObject {
                // Events only: no person profile is built for anyone.
                put("\$process_person_profile", false)
                put("\$session_id", sessionId)
                put("platform", platform)
                put("signed_in", userId != null)
                appVersion?.let { put("\$app_version", it) }
                screen?.let { put("\$screen_name", it) }
                properties.forEach { (name, value) ->
                    when (value) {
                        null -> Unit
                        is Boolean -> put(name, value)
                        is Number -> put(name, value)
                        else -> put(name, value.toString())
                    }
                }
            })
        }
        val full = lock.withLock {
            pending += item
            pending.size >= batchSize
        }
        if (full) flush()
    }

    /** [capture] without waiting, from anywhere; the event is recorded at once. */
    fun track(event: String, properties: Map<String, Any?> = emptyMap()) {
        scope.launch { capture(event, properties) }
    }

    /** Counts a screen being opened, with how long the one before was open. */
    suspend fun screen(name: String) {
        if (name == screen) return
        val now = clock()
        val from = screen
        val seconds = screenSince?.let { (now - it).inWholeSeconds }
        screen = name
        screenSince = now
        capture("\$screen", mapOf("from" to from, "from_seconds" to seconds))
    }

    /** The app came to the front. A return after a long break counts as opening it again. */
    suspend fun foreground() {
        val now = clock()
        val away = backgroundedAt?.let { now - it }
        foregroundSince = now
        backgroundedAt = null
        screenSince = now
        if (away != null && away > SESSION_GAP) capture("app_opened", mapOf("resumed" to true))
    }

    /**
     * The app went to the back: records how long it was used and the screen
     * people left it on, then sends what is waiting.
     */
    suspend fun background() {
        val now = clock()
        val since = foregroundSince
        foregroundSince = null
        backgroundedAt = now
        if (since != null) capture("app_backgrounded", mapOf("seconds" to (now - since).inWholeSeconds))
        flush()
    }

    /**
     * Sees every API call the app makes: a failure is a struggle worth knowing
     * about ([API_ERROR]), and some successes are the actions in [ACTIONS].
     */
    suspend fun apiResult(method: String, path: String, status: Int) {
        val endpoint = endpointOf(method, path)
        when {
            status in 200..299 -> ACTIONS[endpoint]?.let { capture(it) }
            // 410 is the feed asking to start again from the top, which is normal.
            status != 410 -> capture(API_ERROR, mapOf("endpoint" to endpoint, "status" to status))
        }
    }

    /** Sends what is waiting; failures are dropped, analytics is never worth an error. */
    suspend fun flush() {
        val apiKey = key ?: return
        val batch = lock.withLock { pending.toList().also { pending.clear() } }
        if (batch.isEmpty() || !active) return
        val body = buildJsonObject {
            put("api_key", apiKey)
            put("batch", buildJsonArray { batch.forEach { add(it) } })
        }
        runCatching { post(body.toString()) }
    }

    companion object {
        /** Quiet this long and the next event starts a new session (PostHog's own default). */
        val SESSION_GAP: Duration = 30.minutes

        const val API_ERROR = "api_error"

        /**
         * Actions counted straight from a successful API call, so every screen that
         * does them is covered. Actions with useful extra detail (post_created,
         * party_created, rsvp_changed, comment_posted, invites_sent) are captured by
         * the screen instead. Keep in step with docs/analytics.md.
         */
        val ACTIONS: Map<String, String> = mapOf(
            "PUT /posts/:id/like" to "post_liked",
            "DELETE /posts/:id/like" to "post_unliked",
            "PUT /posts/:id/save" to "post_saved",
            "DELETE /posts/:id/save" to "post_unsaved",
            "PATCH /posts/:id" to "caption_edited",
            "DELETE /posts/:id" to "post_deleted",
            "PUT /posts/:id/tags" to "people_tagged",
            "DELETE /posts/:id/tags/me" to "tag_removed",
            "DELETE /comments/:id" to "comment_deleted",
            "PUT /events/:id/save" to "party_saved",
            "DELETE /events/:id/save" to "party_unsaved",
            "PATCH /events/:id" to "party_edited",
            "DELETE /events/:id" to "party_deleted",
            "PUT /events/:id/cover" to "party_cover_set",
            "POST /events/:id/guests/:id/approve" to "guest_approved",
            "DELETE /events/:id/guests/:id" to "guest_removed",
            "PUT /users/:id/follow" to "user_followed",
            "DELETE /users/:id/follow" to "user_unfollowed",
            "PUT /users/:id/block" to "user_blocked",
            "DELETE /users/:id/block" to "user_unblocked",
            "POST /reports" to "report_sent",
            "POST /conversations" to "chat_started",
            "POST /conversations/:id/messages" to "message_sent",
            "PATCH /me" to "profile_edited",
            "PUT /me/avatar" to "avatar_set",
            "PUT /me/interests" to "interests_set",
            "PATCH /me/settings" to "account_setting_changed",
            "DELETE /me" to "account_deleted",
        )

        /**
         * "PUT /posts/:id/like" for "PUT" and "/posts/0b9e.../like?x=1": ids and
         * tokens become ":id", so calls group by what they do, never by whom.
         */
        fun endpointOf(method: String, path: String): String {
            val segments = path.substringBefore('?').split('/').map { segment ->
                if (segment.length >= 16 || (segment.isNotEmpty() && segment.all { it.isDigit() })) ":id" else segment
            }
            return "${method.uppercase()} ${segments.joinToString("/")}"
        }
    }
}

/** A random, time-ordered id (UUID version 7), the kind PostHog expects for sessions. */
internal fun uuidV7(at: Instant, random: Random): String {
    val bytes = random.nextBytes(16)
    val ms = at.toEpochMilliseconds()
    for (i in 0..5) bytes[i] = (ms shr (40 - 8 * i)).toByte()
    bytes[6] = ((bytes[6].toInt() and 0x0F) or 0x70).toByte()
    bytes[8] = ((bytes[8].toInt() and 0x3F) or 0x80).toByte()
    val hex = bytes.joinToString("") { (it.toInt() and 0xFF).toString(16).padStart(2, '0') }
    return "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}"
}
