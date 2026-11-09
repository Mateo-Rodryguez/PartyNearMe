package com.partynearme.core

import com.partynearme.core.analytics.Analytics
import com.partynearme.core.api.ApiClient
import com.partynearme.core.api.InteractionLog
import com.partynearme.core.api.PlaceSearch
import com.partynearme.core.api.Realtime
import com.partynearme.core.auth.AuthClient
import com.partynearme.core.auth.SessionManager
import com.partynearme.core.auth.SessionStore
import com.partynearme.core.cache.FeedCache
import com.partynearme.core.cache.NoFeedCache
import com.partynearme.core.prefs.Preferences
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlin.time.Clock

/** The kinds of feedback people can send; see the feedback migration. */
enum class FeedbackKind(val wire: String) {
    Love("love"), Problem("problem"), Idea("idea"), Recommend("nps"), HeardFrom("heard_from"), Leaving("leaving"),
}

/** Wires the shared pieces together once per app. */
class PartyNearMe(
    val config: AppConfig,
    store: SessionStore,
    engine: HttpClientEngine,
    now: () -> Long = { Clock.System.now().epochSeconds },
    /** The saved copy of the feed's first page. */
    val feedCache: FeedCache = NoFeedCache,
    /** Theme, units and other choices kept on this phone. */
    val preferences: Preferences = Preferences(),
    /** "android" or "ios", sent with analytics and feedback. */
    val platform: String = "unknown",
    /** The app's version name ("1.2.0"), so a release that made things worse shows up. */
    val appVersion: String? = null,
) {
    private val http = HttpClient(engine) {
        expectSuccess = false
        install(HttpTimeout) {
            // Generous: the free server sleeps when idle and takes up to a minute to wake.
            requestTimeoutMillis = 75_000
            connectTimeoutMillis = 15_000
        }
    }
    val auth = AuthClient(http, config, now)
    val sessions = SessionManager(auth, store, now)
    val analytics = Analytics(
        config.posthogKey, platform, enabled = { preferences.current.shareUsage }, appVersion = appVersion,
        post = { body ->
            http.post("${config.posthogHost}/batch/") {
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        },
    )
    val api = ApiClient(http, config, sessions, onResult = analytics::apiResult)
    val interactions = InteractionLog(api::logInteractions)
    /** Place and address search for the party map. */
    val places = PlaceSearch(http)

    // A separate client: the request timeout above would cut long-lived sockets.
    private val sockets = HttpClient(engine) { install(WebSockets) }
    val realtime = Realtime(sockets, config, sessions)

    /** This phone's push token once it is registered, so signing out can remove it. */
    var pushToken: String? = null

    /** Registers this phone for the signed-in user's notifications. */
    suspend fun registerForPush(token: String, platform: String) {
        api.registerDevice(token, platform)
        pushToken = token
    }

    /**
     * Sends something the user told us (see docs/analytics.md): what they love,
     * what isn't working, an idea, their recommend score, or how they found us.
     * Unlike usage stats, this is sent even with "Share usage stats" off, since
     * they chose to send it.
     */
    suspend fun sendFeedback(kind: FeedbackKind, body: String? = null, score: Int? = null) {
        api.sendFeedback(
            kind = kind.wire, body = body?.trim()?.ifEmpty { null }, score = score, screen = analytics.screen,
            platform = platform.takeIf { it == "android" || it == "ios" } ?: "android", appVersion = appVersion,
        )
        analytics.capture("feedback_sent", mapOf("kind" to kind.wire, "score" to score, "has_text" to (body?.isNotBlank() == true)))
    }

    /** Emails a link to choose a new password; the link opens a page on our server. */
    suspend fun sendPasswordReset(email: String) = auth.recover(email, config.resetPasswordPage)

    /**
     * Signs in with [provider] ("google") in the browser; see [SessionManager.signInWith].
     * Returns false when the user closed the page.
     */
    suspend fun signInWith(provider: String, openBrowser: suspend (String) -> String?): Boolean =
        sessions.signInWith(provider, config.authCallback, openBrowser)

    /** Signs out, first stopping this phone getting the user's notifications. */
    suspend fun signOut() {
        pushToken?.let { token ->
            // Best effort: signing out must work offline too.
            try {
                api.unregisterDevice(token)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
            }
        }
        pushToken = null
        feedCache.clear()
        analytics.capture("signed_out")
        analytics.flush()
        analytics.reset()
        sessions.signOut()
    }

    /** Deletes the account on the server (which also drops its push tokens), then forgets the session here. */
    suspend fun deleteAccount() {
        api.deleteAccount()
        pushToken = null
        feedCache.clear()
        analytics.flush() // Sends account_deleted, the strongest "didn't like it" there is.
        analytics.reset()
        sessions.forget()
    }
}
