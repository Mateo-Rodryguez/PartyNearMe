package com.partynearme.core.api

import com.partynearme.core.model.Interaction
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Collects what the user sees and does in the feed and sends it in batches,
 * so ranking can learn without a request per scroll. Each post's impression
 * is only counted once per session.
 */
class InteractionLog(
    private val send: suspend (List<Interaction>) -> Unit,
    private val batchSize: Int = 20,
) {
    private val lock = Mutex()
    private val pending = mutableListOf<Interaction>()
    private val seen = mutableSetOf<String>()

    /**
     * Something was on screen in a list. [surface] says which list (feed,
     * for_you_parties, nearby...), [serveId] and [position] where in a ranked one.
     * Counted once per item and list per session.
     */
    suspend fun impression(
        postId: String? = null,
        eventId: String? = null,
        surface: String? = null,
        serveId: String? = null,
        position: Int? = null,
    ) {
        val isNew = lock.withLock { seen.add("$surface:${postId ?: eventId}") }
        if (isNew) add(Interaction("impression", postId, eventId, surface = surface, serveId = serveId, position = position))
    }

    /** Time spent on a post; very short glances are not worth sending. */
    suspend fun dwell(postId: String, millis: Long, surface: String? = null, serveId: String? = null) {
        if (millis >= MIN_DWELL_MS) {
            add(Interaction("dwell", postId, dwellMs = millis.coerceAtMost(MAX_DWELL_MS), surface = surface, serveId = serveId))
        }
    }

    suspend fun open(
        postId: String? = null,
        eventId: String? = null,
        surface: String? = null,
        serveId: String? = null,
        position: Int? = null,
    ) = add(Interaction("open", postId, eventId, surface = surface, serveId = serveId, position = position))
    /** Someone shared a post or party: a strong signal for ranking. */
    suspend fun share(postId: String? = null, eventId: String? = null) =
        add(Interaction(kind = "share", postId = postId, eventId = eventId))
    suspend fun notInterested(postId: String? = null, eventId: String? = null) =
        add(Interaction(kind = "not_interested", postId = postId, eventId = eventId), flushNow = true)

    suspend fun add(event: Interaction, flushNow: Boolean = false) {
        val full = lock.withLock {
            pending += event
            pending.size >= batchSize
        }
        if (full || flushNow) flush()
    }

    /** Sends what is waiting. Failures are dropped: this data is nice to have, never worth an error. */
    suspend fun flush() {
        val batch = lock.withLock { pending.toList().also { pending.clear() } }
        if (batch.isNotEmpty()) runCatching { send(batch) }
    }

    private companion object {
        const val MIN_DWELL_MS = 800L
        const val MAX_DWELL_MS = 10 * 60 * 1000L
    }
}
