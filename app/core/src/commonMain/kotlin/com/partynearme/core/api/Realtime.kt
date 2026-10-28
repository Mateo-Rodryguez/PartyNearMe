package com.partynearme.core.api

import com.partynearme.core.AppConfig
import com.partynearme.core.SignedOutException
import com.partynearme.core.auth.SessionManager
import com.partynearme.core.model.Message
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Live chat through Supabase Realtime. The socket signs in with the user's own
 * token, so Postgres row-level security decides which messages arrive, exactly
 * as it does for the API.
 */
class Realtime(
    private val http: HttpClient,
    private val config: AppConfig,
    private val sessions: SessionManager,
) {
    private val url get() =
        config.supabaseUrl.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") +
            "/realtime/v1/websocket?apikey=${config.supabaseKey}&vsn=1.0.0"

    /**
     * New messages as they are sent: in one conversation, or in all of the user's
     * chats when [conversationId] is null. Reconnects by itself until collection stops.
     */
    fun messages(conversationId: String?): Flow<Message> = channelFlow {
        val topic = "realtime:messages:${conversationId ?: "all"}"
        var failures = 0
        while (isActive) {
            try {
                http.webSocket(url) {
                    var token = sessions.accessToken()
                    send(Frame.Text(Phoenix.join(topic, conversationId, token)))
                    val heartbeat = launch {
                        var ref = 1
                        while (isActive) {
                            delay(HEARTBEAT_MS)
                            send(Frame.Text(Phoenix.heartbeat(++ref)))
                            // Realtime drops the channel when the token expires, so hand it fresh ones.
                            val fresh = sessions.accessToken()
                            if (fresh != token) {
                                token = fresh
                                send(Frame.Text(Phoenix.accessToken(topic, fresh)))
                            }
                        }
                    }
                    try {
                        for (frame in incoming) {
                            if (frame !is Frame.Text) continue
                            failures = 0
                            Phoenix.parseInsert(frame.readText())?.let { send(it) }
                        }
                    } finally {
                        heartbeat.cancel()
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: SignedOutException) {
                return@channelFlow
            } catch (_: Exception) {
                // Offline or the server restarted: try again below.
            }
            delay(backoff(failures++))
        }
    }

    private fun backoff(failures: Int) = (1_000L shl failures.coerceAtMost(5)).coerceAtMost(30_000L)

    private companion object {
        const val HEARTBEAT_MS = 25_000L
    }
}

/** The bits of the Phoenix channel protocol that Supabase Realtime speaks. */
internal object Phoenix {
    private val json = Json { ignoreUnknownKeys = true }

    fun join(topic: String, conversationId: String?, token: String): String = buildJsonObject {
        put("topic", topic)
        put("event", "phx_join")
        put("ref", "1")
        put("join_ref", "1")
        putJsonObject("payload") {
            putJsonObject("config") {
                putJsonObject("broadcast") { put("self", false) }
                putJsonObject("presence") { put("key", "") }
                put("postgres_changes", buildJsonArray {
                    add(buildJsonObject {
                        put("event", "INSERT")
                        put("schema", "public")
                        put("table", "messages")
                        if (conversationId != null) put("filter", "conversation_id=eq.$conversationId")
                    })
                })
            }
            put("access_token", token)
        }
    }.toString()

    fun heartbeat(ref: Int): String = buildJsonObject {
        put("topic", "phoenix")
        put("event", "heartbeat")
        putJsonObject("payload") {}
        put("ref", ref.toString())
    }.toString()

    fun accessToken(topic: String, token: String): String = buildJsonObject {
        put("topic", topic)
        put("event", "access_token")
        putJsonObject("payload") { put("access_token", token) }
    }.toString()

    /** Returns the new message from a postgres_changes INSERT, or null for anything else. */
    fun parseInsert(text: String): Message? {
        val frame = runCatching { json.decodeFromString<JsonObject>(text) }.getOrNull() ?: return null
        if (frame["event"]?.jsonPrimitive?.contentOrNull != "postgres_changes") return null
        val data = frame["payload"]?.jsonObject?.get("data")?.jsonObject ?: return null
        if (data["type"]?.str() != "INSERT" && data["eventType"]?.str() != "INSERT") return null
        val row = (data["record"] ?: data["new"])?.jsonObject ?: return null
        return Message(
            id = row["id"]?.str() ?: return null,
            conversationId = row["conversation_id"]?.str() ?: return null,
            senderId = row["sender_id"]?.str() ?: return null,
            body = row["body"]?.str() ?: return null,
            createdAt = row["created_at"]?.str()?.let(::isoUtc) ?: return null,
            eventId = row["event_id"]?.str(),
        )
    }

    private fun kotlinx.serialization.json.JsonElement.str() = (this as? JsonPrimitive)?.contentOrNull

    /** Postgres sends "2026-10-12 19:00:00.123456+00" style times; the app expects ISO-8601. */
    private fun isoUtc(value: String): String {
        var s = value.replace(' ', 'T')
        if (Regex("[+-]\\d{2}$").containsMatchIn(s)) s += ":00"
        return s.replace("+00:00", "Z")
    }
}
