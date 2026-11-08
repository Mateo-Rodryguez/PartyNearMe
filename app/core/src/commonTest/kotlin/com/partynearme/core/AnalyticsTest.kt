package com.partynearme.core

import com.partynearme.core.analytics.Analytics
import com.partynearme.core.prefs.LocalPrefs
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

class AnalyticsTest {
    private val sent = mutableListOf<JsonObject>()
    private var on = true
    private var now = Instant.parse("2026-11-02T20:00:00Z")
    private fun later(by: Duration) { now += by }

    private fun analytics(key: String? = "phc_test", batchSize: Int = 100) =
        Analytics(key, "android", enabled = { on }, post = { sent += Json.parseToJsonElement(it).jsonObject },
            appVersion = "1.4.0", clock = { now }, batchSize = batchSize, random = Random(42))

    private fun events() = sent.flatMap { body -> body["batch"]!!.jsonArray.map { it.jsonObject } }
    private fun JsonObject.name() = this["event"]!!.jsonPrimitive.content
    private fun JsonObject.props() = this["properties"]!!.jsonObject
    private fun JsonObject.prop(name: String) = props()[name]?.jsonPrimitive

    @Test
    fun sendsBatchesUnderTheAccountIdWithoutPersonProfiles() = runTest {
        val a = analytics(batchSize = 2)
        a.identify("u1")
        a.capture("post_created", mapOf("photos" to 3, "at_party" to true, "skip" to null))
        assertTrue(sent.isEmpty())
        a.capture("link_shared", mapOf("kind" to "post"))
        val body = sent.single()
        assertEquals("phc_test", body["api_key"]?.jsonPrimitive?.content)
        val events = events()
        assertEquals(listOf("post_created", "link_shared"), events.map { it.name() })
        val first = events[0]
        assertEquals("u1", first["distinct_id"]!!.jsonPrimitive.content)
        assertEquals(false, first.prop("\$process_person_profile")!!.boolean)
        assertEquals("android", first.prop("platform")!!.content)
        assertEquals("1.4.0", first.prop("\$app_version")!!.content)
        assertEquals(true, first.prop("signed_in")!!.boolean)
        assertEquals(3, first.prop("photos")!!.int)
        assertEquals(false, "skip" in first.props())
    }

    @Test
    fun beforeSignInUsesAThrowawayIdThatChangesOnSignOut() = runTest {
        val a = analytics()
        a.capture("auth_failed")
        a.flush()
        val anon = events().single()["distinct_id"]!!.jsonPrimitive.content
        assertEquals(false, events().single().prop("signed_in")!!.boolean)
        a.identify("u1")
        a.reset()
        a.capture("auth_failed")
        a.flush()
        val next = events().last()["distinct_id"]!!.jsonPrimitive.content
        assertNotEquals(anon, next)
        assertNotEquals("u1", next)
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
        off.screen("home")
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
        assertTrue(sent.isEmpty())
    }

    @Test
    fun screensCarryWhereTheUserCameFromAndForHowLong() = runTest {
        val a = analytics()
        a.identify("u1")
        a.screen("home")
        later(42.seconds)
        a.screen("party")
        a.screen("party") // the same screen again is not a new view
        a.capture("rsvp_changed")
        a.flush()
        val (home, party, rsvp) = events()
        assertEquals("\$screen", home.name())
        assertEquals("home", home.prop("\$screen_name")!!.content)
        assertNull(home.prop("from"))
        assertEquals("party", party.prop("\$screen_name")!!.content)
        assertEquals("home", party.prop("from")!!.content)
        assertEquals(42, party.prop("from_seconds")!!.long)
        // Every event says which screen it happened on.
        assertEquals("party", rsvp.prop("\$screen_name")!!.content)
        assertEquals(3, events().size)
    }

    @Test
    fun aLongBreakStartsANewSessionAndCountsAsOpeningTheAppAgain() = runTest {
        val a = analytics()
        a.identify("u1")
        a.foreground()
        a.screen("home")
        later(5.minutes)
        a.background()
        val backgrounded = events().single { it.name() == "app_backgrounded" }
        assertEquals(300, backgrounded.prop("seconds")!!.long)
        assertEquals("home", backgrounded.prop("\$screen_name")!!.content)

        later(2.minutes) // a short break: same session, not a new open
        a.foreground()
        a.capture("post_liked")
        later(1.minutes)
        a.background()
        later(31.minutes)
        a.foreground()
        a.flush()
        val all = events()
        val sessions = all.map { it.prop("\$session_id")!!.content }
        assertEquals(sessions[0], sessions[1])
        assertEquals(sessions[0], sessions[2])
        val reopened = all.last()
        assertEquals("app_opened", reopened.name())
        assertEquals(true, reopened.prop("resumed")!!.boolean)
        assertNotEquals(sessions[0], reopened.prop("\$session_id")!!.content)
        // A UUID v7, as PostHog wants for sessions.
        assertTrue(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$").matches(sessions[0]))
    }

    @Test
    fun apiCallsBecomeActionsAndStruggles() = runTest {
        val a = analytics()
        a.identify("u1")
        a.apiResult("PUT", "/posts/0b9e3f5c-1d2e-4f6a-8b9c-0d1e2f3a4b5c/like", 204)
        a.apiResult("GET", "/feed", 200) // reading isn't an action
        a.apiResult("GET", "/feed", 410) // an expired feed is normal
        a.apiResult("POST", "/conversations/0b9e3f5c-1d2e-4f6a-8b9c-0d1e2f3a4b5c/messages", 500)
        a.apiResult("PUT", "/photo-upload", 0)
        a.flush()
        val all = events()
        assertEquals(listOf("post_liked", "api_error", "api_error"), all.map { it.name() })
        assertEquals("POST /conversations/:id/messages", all[1].prop("endpoint")!!.content)
        assertEquals(500, all[1].prop("status")!!.int)
        assertEquals(0, all[2].prop("status")!!.int)
    }

    @Test
    fun endpointsGroupByWhatTheyDoNeverByWhom() {
        assertEquals("DELETE /devices/:id", Analytics.endpointOf("delete", "/devices/fcm-token-aaaaaaaaaaaaaaaaaaaa"))
        assertEquals("POST /events/:id/guests/:id/approve",
            Analytics.endpointOf("POST", "/events/0b9e3f5c-1d2e-4f6a-8b9c-0d1e2f3a4b5c/guests/1c9e3f5c-1d2e-4f6a-8b9c-0d1e2f3a4b5c/approve"))
        assertEquals("GET /users/search", Analytics.endpointOf("GET", "/users/search?q=mateo"))
        assertEquals("GET /interests/:id", Analytics.endpointOf("GET", "/interests/12"))
    }

    @Test
    fun theRecommendQuestionWaitsUntilSomeoneKnowsTheAppAndNeverNags() {
        var prefs = LocalPrefs()
        val day0 = 20_000L
        prefs = prefs.activeOn(day0).activeOn(day0) // the same day counts once
        assertEquals(1, prefs.activeDays)
        prefs = prefs.activeOn(day0 + 1).activeOn(day0 + 3)
        assertFalse(prefs.recommendDue(day0 + 3), "3 days of use, but not a week yet")
        assertTrue(prefs.recommendDue(day0 + 7))
        prefs = prefs.copy(recommendAskedDay = day0 + 7)
        assertFalse(prefs.recommendDue(day0 + 60))
        assertTrue(prefs.recommendDue(day0 + 97))
        assertFalse(LocalPrefs().activeOn(day0).recommendDue(day0 + 30), "one day of use isn't enough")
    }
}
