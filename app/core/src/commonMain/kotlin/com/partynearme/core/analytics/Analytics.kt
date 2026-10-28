package com.partynearme.core.analytics

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.time.Clock

/**
 * Product analytics: which features people use, sent to PostHog (EU) in batches.
 * Only signed-in use is counted, under the account's id and nothing else: no
 * names, emails, locations or content, and no person profiles. Off when there
 * is no key or the user turned "Share usage stats" off.
 */
class Analytics(
    private val key: String?,
    private val platform: String,
    private val enabled: () -> Boolean,
    /** Posts a JSON body to PostHog's batch endpoint. */
    private val post: suspend (body: String) -> Unit,
    private val now: () -> String = { Clock.System.now().toString() },
    private val batchSize: Int = 10,
) {
    private val lock = Mutex()
    private val pending = mutableListOf<JsonObject>()
    private var distinctId: String? = null

    val active: Boolean get() = key != null && enabled()

    /** Counts what follows as this account's. */
    fun identify(userId: String) {
        distinctId = userId
    }

    /** On sign-out: stop counting and drop anything not sent. */
    suspend fun reset() {
        distinctId = null
        lock.withLock { pending.clear() }
    }

    /** Records [event] with a few plain properties (counts, kinds); never personal data. */
    suspend fun capture(event: String, properties: Map<String, Any?> = emptyMap()) {
        val id = distinctId ?: return
        if (!active) return
        val item = buildJsonObject {
            put("event", event)
            put("distinct_id", id)
            put("timestamp", now())
            put("properties", buildJsonObject {
                // Events only: no person profile is built for anyone.
                put("\$process_person_profile", false)
                put("platform", platform)
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
}
