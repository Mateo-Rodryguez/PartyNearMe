package com.partynearme.core

import com.partynearme.core.api.Phoenix
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PhoenixTest {
    @Test
    fun joinAsksForNewMessagesInOneChatWithTheUsersToken() {
        val join = Json.decodeFromString<JsonObject>(Phoenix.join("realtime:messages:c1", "c1", "jwt"))
        assertEquals("phx_join", join["event"]?.jsonPrimitive?.content)
        val payload = join["payload"]!!.jsonObject
        assertEquals("jwt", payload["access_token"]?.jsonPrimitive?.content)
        val change = payload["config"]!!.jsonObject["postgres_changes"]!!.jsonArray.single().jsonObject
        assertEquals("INSERT", change["event"]?.jsonPrimitive?.content)
        assertEquals("messages", change["table"]?.jsonPrimitive?.content)
        assertEquals("conversation_id=eq.c1", change["filter"]?.jsonPrimitive?.content)
    }

    @Test
    fun allChatsHasNoFilter() {
        val join = Json.decodeFromString<JsonObject>(Phoenix.join("realtime:messages:all", null, "jwt"))
        val change = join["payload"]!!.jsonObject["config"]!!.jsonObject["postgres_changes"]!!.jsonArray.single().jsonObject
        assertNull(change["filter"])
    }

    @Test
    fun readsAnInsertedMessage() {
        val frame = """{"event":"postgres_changes","topic":"realtime:messages:c1","ref":null,"payload":{"ids":[1],
            "data":{"schema":"public","table":"messages","type":"INSERT","commit_timestamp":"2026-10-12T19:00:00Z",
            "record":{"id":9007199254740,"conversation_id":"c1","sender_id":"u2","body":"hi",
            "created_at":"2026-10-12T19:00:00.123456+00:00","event_id":null},"errors":null}}}"""
        val message = Phoenix.parseInsert(frame)!!
        assertNull(message.eventId)
        assertEquals("9007199254740", message.id)
        assertEquals("u2", message.senderId)
        assertEquals("hi", message.body)
        assertEquals("2026-10-12T19:00:00.123456Z", message.createdAt)
    }

    @Test
    fun readsAPartyInvite() {
        val frame = """{"event":"postgres_changes","topic":"realtime:messages:c1","ref":null,"payload":{"ids":[1],
            "data":{"schema":"public","table":"messages","type":"INSERT","commit_timestamp":"2026-10-12T19:00:00Z",
            "record":{"id":5,"conversation_id":"c1","sender_id":"u2","body":"You're invited to Rooftop",
            "created_at":"2026-10-12T19:00:00+00","event_id":"e1"},"errors":null}}}"""
        assertEquals("e1", Phoenix.parseInsert(frame)!!.eventId)
    }

    @Test
    fun ignoresRepliesAndHeartbeats() {
        assertNull(Phoenix.parseInsert("""{"event":"phx_reply","topic":"phoenix","payload":{"status":"ok"},"ref":"2"}"""))
        assertNull(Phoenix.parseInsert("not json"))
    }
}
