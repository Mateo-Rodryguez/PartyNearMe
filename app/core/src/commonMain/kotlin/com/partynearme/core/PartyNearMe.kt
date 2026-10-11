package com.partynearme.core

import com.partynearme.core.api.ApiClient
import com.partynearme.core.api.InteractionLog
import com.partynearme.core.auth.AuthClient
import com.partynearme.core.auth.SessionManager
import com.partynearme.core.auth.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import kotlin.time.Clock

/** Wires the shared pieces together once per app. */
class PartyNearMe(
    config: AppConfig,
    store: SessionStore,
    engine: HttpClientEngine,
    now: () -> Long = { Clock.System.now().epochSeconds },
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
}
