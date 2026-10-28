package com.partynearme.core

import com.partynearme.core.analytics.Analytics
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AnalyticsTest {
    private val sent = mutableListOf<JsonObject>()
    private var on = true
    private fun analytics(key: String? = "phc_test") =
        Analytics(key, "android", enabled = { on }, post = { sent += Json.parseToJsonElement(it).jsonObject },
            now = { "2026-10-28T12:00:00Z" }, batchSize = 2)

    @Test
    fun sendsBatchesUnderTheAccountIdWithoutPersonProfiles() = runTest {
        val a = analytics()
        a.capture("app_opened") // not signed in yet: dropped
        a.identify("u1")
        a.capture("post_created", mapOf("photos" to 3, "at_party" to true, "skip" to null))
        assertTrue(sent.isEmpty())
        a.capture("share", mapOf("kind" to "post"))
        val body = sent.single()
        assertEquals("phc_test", body["api_key"]?.jsonPrimitive?.content)
        val events = body["batch"]!!.jsonArray.map { it.jsonObject }
        assertEquals(listOf("post_created", "share"), events.map { it["event"]!!.jsonPrimitive.content })
        val first = events[0]
        assertEquals("u1", first["distinct_id"]!!.jsonPrimitive.content)
        val props = first["properties"]!!.jsonObject
        assertEquals(false, props["\$process_person_profile"]!!.jsonPrimitive.boolean)
        assertEquals("android", props["platform"]!!.jsonPrimitive.content)
        assertEquals(3, props["photos"]!!.jsonPrimitive.int)
        assertEquals(false, "skip" in props)
    }

    @Test
    fun staysQuietWithoutAKeyOrWhenTurnedOff() = runTest {
        val none = analytics(key = null)
        none.identify("u1")
        repeat(3) { none.capture("app_opened") }
        none.flush()
        on = false
        val off = analytics()
        off.identify("u1")
        repeat(3) { off.capture("app_opened") }
        off.flush()
        assertTrue(sent.isEmpty())
    }

    @Test
    fun signingOutDropsWhatWasWaiting() = runTest {
        val a = analytics()
        a.identify("u1")
        a.capture("app_opened")
        a.reset()
        a.flush()
        a.capture("app_opened")
        assertTrue(sent.isEmpty())
    }
}
