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

    suspend fun impression(postId: String) {
        val isNew = lock.withLock { seen.add(postId) }
        if (isNew) add(Interaction(kind = "impression", postId = postId))
    }

    /** Time spent on a post; very short glances are not worth sending. */
    suspend fun dwell(postId: String, millis: Long) {
        if (millis >= MIN_DWELL_MS) add(Interaction(kind = "dwell", postId = postId, dwellMs = millis.coerceAtMost(MAX_DWELL_MS)))
    }

    suspend fun open(postId: String) = add(Interaction(kind = "open", postId = postId))
    suspend fun notInterested(postId: String) = add(Interaction(kind = "not_interested", postId = postId), flushNow = true)

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
