package com.partynearme.core

import com.partynearme.core.api.FeedExpiredException
import com.partynearme.core.auth.MemorySessionStore
import com.partynearme.core.auth.Session
import com.partynearme.core.model.Interaction
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val config = AppConfig("https://api.test", "https://sb.test", "pk")
private const val NOW = 1_000_000L

private fun session(token: String = "a1", expiresAt: Long = NOW + 3600) =
    Session(accessToken = token, refreshToken = "r1", expiresAt = expiresAt, userId = "u1")

private fun MockRequestHandleScope.json(body: String, status: HttpStatusCode = HttpStatusCode.OK): HttpResponseData =
    respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))

private fun HttpRequestData.text() = when (val content = body) {
    is TextContent -> content.text
    is OutgoingContent.ByteArrayContent -> content.bytes().decodeToString()
    else -> ""
}

private fun tokens(access: String) =
    """{"access_token":"$access","refresh_token":"r2","expires_in":3600,"token_type":"bearer","user":{"id":"u1","email":"a@b.c"}}"""

private const val POST = """{"id":"p1","author":{"id":"u2","username":"sam","display_name":null},"event_id":null,
  "caption":"hi","place_name":null,"lat":null,"lng":null,"status":"visible","like_count":2,"liked_by_me":false,
  "media":[{"position":0,"url":"https://m/full.jpg","thumbnails":{"320":"https://m/320.jpg","1080":"https://m/1080.jpg"},
  "width":1080,"height":1350,"blurhash":null}],"created_at":"2026-10-11T20:00:00.000Z","extra":"ignored"}"""

class ClientTest {
    private fun app(store: MemorySessionStore, handler: suspend MockRequestHandleScope.(HttpRequestData) -> HttpResponseData) =
        PartyNearMe(config, store, MockEngine(handler), now = { NOW })

    @Test
    fun signInStoresTheSession() = runTest {
        val store = MemorySessionStore()
        val app = app(store) { request ->
            assertEquals("https://sb.test/auth/v1/token?grant_type=password", request.url.toString())
            assertEquals("pk", request.headers["apikey"])
            assertEquals("""{"email":"a@b.c","password":"pw"}""", request.text())
            json(tokens("a1"))
        }
        app.sessions.signIn("a@b.c", "pw")
        assertEquals("a1", store.load()?.accessToken)
        assertEquals(NOW + 3600, store.load()?.expiresAt)
        assertEquals("u1", app.sessions.session.value?.userId)
    }

    @Test
    fun wrongPasswordGivesAFriendlyMessage() = runTest {
        val app = app(MemorySessionStore()) {
            json("""{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}""", HttpStatusCode.BadRequest)
        }
        val error = assertFailsWith<ApiException> { app.sessions.signIn("a@b.c", "nope") }
        assertEquals("Wrong email or password", error.message)
    }

    @Test
    fun signUpWithEmailConfirmationDoesNotSignIn() = runTest {
        val store = MemorySessionStore()
        val app = app(store) { json("""{"id":"u1","email":"a@b.c","confirmation_sent_at":"2026-10-11T20:00:00Z"}""") }
        assertFalse(app.sessions.signUp("a@b.c", "pw"))
        assertNull(store.load())
    }

    @Test
    fun apiCallsSendTheTokenAndParseResponses() = runTest {
        val app = app(MemorySessionStore(session())) { request ->
            assertEquals("Bearer a1", request.headers[HttpHeaders.Authorization])
            assertEquals("/feed", request.url.encodedPath)
            assertEquals("51.5", request.url.parameters["lat"])
            assertNull(request.url.parameters["cursor"])
            json("""{"posts":[$POST],"next_cursor":"c2"}""")
        }
        val page = app.api.feed(51.5, -0.1)
        assertEquals("c2", page.nextCursor)
        val post = page.posts.single()
        assertEquals("@sam", post.author.name)
        assertEquals("https://m/1080.jpg", post.media.single().urlFor(500))
        assertEquals("https://m/full.jpg", post.media.single().urlFor(2000))
    }

    @Test
    fun expiredTokenIsRefreshedBeforeTheCall() = runTest {
        val store = MemorySessionStore(session(expiresAt = NOW + 10))
        val calls = mutableListOf<String>()
        val app = app(store) { request ->
            calls += request.url.encodedPath
            when (request.url.encodedPath) {
                "/auth/v1/token" -> {
                    assertEquals("refresh_token", request.url.parameters["grant_type"])
                    json(tokens("a2"))
                }
                else -> {
                    assertEquals("Bearer a2", request.headers[HttpHeaders.Authorization])
                    json("""{"unread_count":3}""")
                }
            }
        }
        assertEquals(3, app.api.unreadCount())
        assertEquals(listOf("/auth/v1/token", "/conversations/unread"), calls)
        assertEquals("a2", store.load()?.accessToken)
    }

    @Test
    fun a401RefreshesOnceAndRetries() = runTest {
        val store = MemorySessionStore(session())
        val app = app(store) { request ->
            when {
                request.url.encodedPath == "/auth/v1/token" -> json(tokens("a2"))
                request.headers[HttpHeaders.Authorization] == "Bearer a1" -> json("{}", HttpStatusCode.Unauthorized)
                else -> json("""{"unread_count":0}""")
            }
        }
        assertEquals(0, app.api.unreadCount())
    }

    @Test
    fun aDeadRefreshTokenSignsOut() = runTest {
        val store = MemorySessionStore(session(expiresAt = NOW))
        val app = app(store) { json("""{"error":"invalid_grant"}""", HttpStatusCode.BadRequest) }
        assertFailsWith<SignedOutException> { app.api.me() }
        assertNull(store.load())
        assertNull(app.sessions.session.value)
    }

    @Test
    fun serverMessagesAreShownAndServerErrorsAreNot() = runTest {
        val app = app(MemorySessionStore(session())) { request ->
            if (request.url.encodedPath.endsWith("/like")) {
                json("""{"error":"request_failed","message":"Post not found"}""", HttpStatusCode.NotFound)
            } else {
                json("""{"error":"internal","message":"stack trace"}""", HttpStatusCode.InternalServerError)
            }
        }
        assertEquals("Post not found", assertFailsWith<ApiException> { app.api.like("p1") }.message)
        val error = assertFailsWith<ApiException> { app.api.me() }
        assertEquals(500, error.status)
        assertTrue(error.message.startsWith("Something went wrong"))
    }

    @Test
    fun expiredFeedCursorIsItsOwnError() = runTest {
        val app = app(MemorySessionStore(session())) { json("""{"message":"gone"}""", HttpStatusCode.Gone) }
        assertFailsWith<FeedExpiredException> { app.api.feed(null, null, cursor = "old") }
    }

    @Test
    fun bodiesUseTheApiFieldNames() = runTest {
        val bodies = mutableListOf<String>()
        val app = app(MemorySessionStore(session())) { request ->
            bodies += request.text()
            when (request.url.encodedPath) {
                "/interactions" -> respond("", HttpStatusCode.Accepted)
                else -> json("""{"id":"u1","username":"sam","display_name":"Sam","bio":null,"avatar_key":null,
                    "created_at":"2026-10-11T20:00:00Z","interest_ids":[]}""")
            }
        }
        app.api.logInteractions(listOf(Interaction(kind = "dwell", postId = "p1", dwellMs = 1200)))
        app.api.updateMe(displayName = "Sam")
        assertEquals("""{"events":[{"kind":"dwell","post_id":"p1","dwell_ms":1200}]}""", bodies[0])
        assertEquals("""{"display_name":"Sam"}""", bodies[1])
    }
}
