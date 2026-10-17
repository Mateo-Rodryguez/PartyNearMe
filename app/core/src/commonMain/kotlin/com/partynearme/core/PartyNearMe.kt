package com.partynearme.core

import com.partynearme.core.api.ApiClient
import com.partynearme.core.api.InteractionLog
import com.partynearme.core.api.Realtime
import com.partynearme.core.auth.AuthClient
import com.partynearme.core.auth.SessionManager
import com.partynearme.core.auth.SessionStore
import com.partynearme.core.cache.FeedCache
import com.partynearme.core.cache.NoFeedCache
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.websocket.WebSockets
import kotlin.time.Clock

/** Wires the shared pieces together once per app. */
class PartyNearMe(
    val config: AppConfig,
    store: SessionStore,
    engine: HttpClientEngine,
    now: () -> Long = { Clock.System.now().epochSeconds },
    /** The saved copy of the feed's first page. */
    val feedCache: FeedCache = NoFeedCache,
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
    val api = ApiClient(http, config, sessions)
    val interactions = InteractionLog(api::logInteractions)

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
        sessions.signOut()
    }

    /** Deletes the account on the server (which also drops its push tokens), then forgets the session here. */
    suspend fun deleteAccount() {
        api.deleteAccount()
        pushToken = null
        feedCache.clear()
        sessions.forget()
    }
}
