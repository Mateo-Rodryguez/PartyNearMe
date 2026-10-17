package com.partynearme.demo

import androidx.compose.runtime.Composable
import com.partynearme.core.AppConfig
import com.partynearme.core.PartyNearMe
import com.partynearme.core.auth.MemorySessionStore
import com.partynearme.core.auth.Session
import com.partynearme.core.model.LatLng
import com.partynearme.ui.DemoSetup
import com.partynearme.ui.LocationProvider
import com.partynearme.ui.Navigator
import com.partynearme.ui.PickedPhoto
import com.partynearme.ui.Platform
import com.partynearme.ui.Route
import com.partynearme.ui.Tab
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes

/**
 * Sample data for debug builds on Android and iOS: opens the app at the named screen
 * with no server or account needed. CI uses it to screenshot every screen.
 */
object Demo {
    fun setUp(screen: String): DemoSetup {
        val signedIn = screen != "sign_in"
        val session = Session("demo-token", "demo-refresh", Long.MAX_VALUE / 2, ME, "mateo@example.com")
        val core = PartyNearMe(
            AppConfig("https://api.demo", "https://auth.demo", "demo"),
            MemorySessionStore(if (signedIn) session else null),
            MockEngine { request ->
                val (status, body) = FakeApi.handle(request.method, request.url.encodedPath)
                respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
            },
        )
        val nav = Navigator()
        when (screen) {
            "nearby" -> nav.select(Tab.Nearby)
            "event" -> { nav.select(Tab.Nearby); nav.open(Route.Event("e1")) }
            "new_event" -> { nav.select(Tab.Nearby); nav.open(Route.NewEvent()) }
            "map_picker" -> { nav.select(Tab.Nearby); nav.open(Route.NewEvent(pickOnMap = true)) }
            "post" -> nav.select(Tab.Post)
            "inbox" -> nav.select(Tab.Chat)
            "chat" -> { nav.select(Tab.Chat); nav.open(Route.Chat("c1", "@sam")) }
            "profile" -> nav.select(Tab.Me)
            "user" -> nav.open(Route.User(SAM))
        }
        return DemoSetup(core, DemoPlatform, nav)
    }
}

private object DemoPlatform : Platform {
    @Composable
    override fun rememberPhotoPicker(maxPhotos: Int, onPicked: (List<PickedPhoto>) -> Unit): () -> Unit = {}

    @Composable
    override fun rememberLocationProvider() = LocationProvider { LatLng(51.5136, -0.1365) }

    @Composable
    override fun rememberPushTokenProvider(): suspend () -> String? = { null }

    override val pushPlatform = "android"
}

private const val ME = "00000000-0000-4000-8000-000000000001"
private const val SAM = "00000000-0000-4000-8000-000000000002"
private const val ALEX = "00000000-0000-4000-8000-000000000003"

private object FakeApi {
    private fun ago(d: Duration) = (Clock.System.now() - d).toString()
    private fun ahead(d: Duration) = (Clock.System.now() + d).toString()
    private fun person(id: String, username: String, name: String) =
        """{"id":"$id","username":"$username","display_name":"$name"}"""

    private val sam = person(SAM, "sam", "Sam Rivera")
    private val alex = person(ALEX, "alex", "Alex Chen")
    private val mateo = person(ME, "mateo", "Mateo")

    private fun photo(seed: String, w: Int, h: Int) =
        """{"position":0,"url":"https://picsum.photos/seed/$seed/$w/$h",
           "thumbnails":{"320":"https://picsum.photos/seed/$seed/320/${320 * h / w}"},
           "width":$w,"height":$h,"blurhash":null}"""

    private fun post(id: String, author: String, caption: String, likes: Int, liked: Boolean, age: Duration, media: String,
                     place: String? = null, status: String = "visible") =
        """{"id":"$id","author":$author,"event_id":null,"caption":"$caption",
           "place_name":${place?.let { "\"$it\"" }},"lat":null,"lng":null,"status":"$status","like_count":$likes,
           "liked_by_me":$liked,"media":[$media],"created_at":"${ago(age)}"}"""

    private val feedPosts get() = listOf(
        post("p1", sam, "Best night of the summer", 128, true, 42.minutes, photo("party1", 1080, 1350), "Fabric, London"),
        post("p2", alex, "Warming up for Saturday", 37, false, 5.hours, photo("party2", 1080, 1080)),
        post("p3", sam, "Sunset session on the roof", 412, false, 2.days, photo("party3", 1350, 1080), "Shoreditch"),
    ).joinToString(",")

    private val myPosts get() = listOf(
        post("p4", mateo, "First post", 12, false, 1.days, photo("mine1", 1080, 1080)),
        post("p5", mateo, "Just uploaded", 0, false, 1.minutes, photo("mine2", 1080, 1080), status = "pending"),
        post("p6", mateo, "Throwback", 51, false, 9.days, photo("mine3", 1080, 1080)),
    ).joinToString(",")

    private fun event(id: String, title: String, venue: String, starts: Duration, going: Int, interested: Int,
                      mine: String?, distance: Int) =
        """{"id":"$id","organiser":$sam,"title":"$title","description":"Bring your friends. Doors at 9, music until late.",
           "starts_at":"${ahead(starts)}","ends_at":"${ahead(starts + 5.hours)}","venue_name":"$venue",
           "lat":51.51,"lng":-0.13,"cover_url":null,"status":"published","going_count":$going,
           "interested_count":$interested,"my_rsvp":${mine?.let { "\"$it\"" }},"created_at":"${ago(2.days)}",
           "distance_m":$distance}"""

    private val events get() = listOf(
        event("e1", "Rooftop Sunset Party", "Skyline Bar", 6.hours, 42, 17, "going", 650),
        event("e2", "House Night", "Warehouse 9", 1.days + 3.hours, 120, 48, null, 2300),
        event("e3", "Student Mixer", "Union Hall", 3.days, 18, 30, "interested", 4100),
    )

    private fun message(id: Int, from: String, body: String, age: Duration) =
        """{"id":"$id","conversation_id":"c1","sender_id":"$from","body":"$body","created_at":"${ago(age)}"}"""

    private val messages get() = listOf(
        message(105, SAM, "See you there!", 2.minutes),
        message(104, ME, "Perfect, I'll grab the tickets", 5.minutes),
        message(103, SAM, "Doors at 9, let's meet at 8:45", 7.minutes),
        message(102, ME, "Yes! What time?", 12.minutes),
        message(101, SAM, "Are you coming to the rooftop party tonight?", 20.minutes),
    ).joinToString(",")

    private val conversations get() =
        """{"conversations":[
           {"id":"c1","other":$sam,"last_message":${message(105, SAM, "See you there!", 2.minutes)},
            "unread_count":1,"last_message_at":"${ago(2.minutes)}"},
           {"id":"c2","other":$alex,"last_message":{"id":"90","conversation_id":"c2","sender_id":"$ME",
            "body":"Thanks for the invite","created_at":"${ago(1.days)}"},"unread_count":0,
            "last_message_at":"${ago(1.days)}"}],"next_cursor":null}"""

    fun handle(method: HttpMethod, path: String): Pair<HttpStatusCode, String> = when {
        path == "/me" -> HttpStatusCode.OK to """{"id":"$ME","username":"mateo","display_name":"Mateo",
            "bio":"Building PartyNearMe","avatar_url":null,"created_at":"${ago(30.days)}","interest_ids":[1,3]}"""
        path == "/feed" -> HttpStatusCode.OK to """{"posts":[$feedPosts],"next_cursor":null}"""
        path == "/interactions" -> HttpStatusCode.Accepted to ""
        path == "/users/$ME/posts" -> HttpStatusCode.OK to """{"posts":[$myPosts],"next_cursor":null}"""
        path.matches(Regex("/users/[^/]+/posts")) -> HttpStatusCode.OK to """{"posts":[$feedPosts],"next_cursor":null}"""
        path == "/users/$ME" -> HttpStatusCode.OK to """{"id":"$ME","username":"mateo","display_name":"Mateo",
            "bio":"Building PartyNearMe","avatar_url":null,"followers":214,"following":180,"is_following":false}"""
        path.startsWith("/users/") -> HttpStatusCode.OK to """{"id":"$SAM","username":"sam","display_name":"Sam Rivera",
            "bio":"DJ and party host in London","avatar_url":null,"followers":1890,"following":312,"is_following":true}"""
        path == "/events/nearby" -> HttpStatusCode.OK to """{"events":[${events.joinToString(",")}],"next_cursor":null}"""
        path.matches(Regex("/events/[^/]+/posts")) -> HttpStatusCode.OK to """{"posts":[$feedPosts],"next_cursor":null}"""
        path.startsWith("/events/") -> HttpStatusCode.OK to events.first()
        path == "/conversations/unread" -> HttpStatusCode.OK to """{"unread_count":1}"""
        path == "/conversations" && method == HttpMethod.Get -> HttpStatusCode.OK to conversations
        path.endsWith("/messages") -> HttpStatusCode.OK to """{"messages":[$messages],"has_more":false}"""
        path.endsWith("/read") -> HttpStatusCode.NoContent to ""
        path == "/me/avatar" || path.endsWith("/cover") -> HttpStatusCode.Accepted to ""
        else -> HttpStatusCode.NotFound to """{"error":"request_failed","message":"Not in the demo"}"""
    }
}
