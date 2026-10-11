package com.partynearme.core.auth

import com.russhwolf.settings.Settings
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class Session(
    val accessToken: String,
    val refreshToken: String,
    /** Epoch seconds when [accessToken] stops working. */
    val expiresAt: Long,
    val userId: String,
    val email: String? = null,
)

/** Keeps the session across app restarts. */
interface SessionStore {
    fun load(): Session?
    fun save(session: Session?)
}

class SettingsSessionStore(
    private val settings: Settings,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : SessionStore {
    override fun load(): Session? =
        settings.getStringOrNull(KEY)?.let { runCatching { json.decodeFromString<Session>(it) }.getOrNull() }

    override fun save(session: Session?) {
        if (session == null) settings.remove(KEY) else settings.putString(KEY, json.encodeToString(Session.serializer(), session))
    }

    private companion object {
        const val KEY = "session"
    }
}

class MemorySessionStore(private var session: Session? = null) : SessionStore {
    override fun load() = session
    override fun save(session: Session?) {
        this.session = session
    }
}
