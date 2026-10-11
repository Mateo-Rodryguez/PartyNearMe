package com.partynearme.core.auth

import com.partynearme.core.SignedOutException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Owns the current session: hands out a fresh access token, refreshing it
 * shortly before it expires, with one refresh at a time.
 */
class SessionManager(
    private val auth: AuthClient,
    private val store: SessionStore,
    private val now: () -> Long,
) {
    private val _session = MutableStateFlow(store.load())
    val session: StateFlow<Session?> = _session.asStateFlow()
    private val refreshLock = Mutex()

    suspend fun signIn(email: String, password: String) = set(auth.signIn(email, password))

    /** Returns false when the user has to confirm their email before signing in. */
    suspend fun signUp(email: String, password: String): Boolean =
        when (val result = auth.signUp(email, password)) {
            is AuthClient.SignUpResult.SignedIn -> { set(result.session); true }
            AuthClient.SignUpResult.CheckEmail -> false
        }

    suspend fun signOut() {
        val current = _session.value ?: return
        set(null)
        auth.signOut(current.accessToken)
    }

    /** A token that is valid for at least another minute. */
    suspend fun accessToken(): String {
        val current = _session.value ?: throw SignedOutException()
        if (current.expiresAt - now() > MARGIN_SECONDS) return current.accessToken
        return refresh(current.accessToken)
    }

    /**
     * Gets a new access token. [stale] is the token that just failed, so a
     * caller that lost the race to another refresh reuses its result.
     */
    suspend fun refresh(stale: String): String = refreshLock.withLock {
        val current = _session.value ?: throw SignedOutException()
        if (current.accessToken != stale && current.expiresAt - now() > MARGIN_SECONDS) {
            return current.accessToken
        }
        val renewed = auth.refresh(current.refreshToken)
        if (renewed == null) {
            set(null)
            throw SignedOutException()
        }
        set(renewed)
        renewed.accessToken
    }

    private fun set(session: Session?) {
        store.save(session)
        _session.value = session
    }

    private companion object {
        const val MARGIN_SECONDS = 60
    }
}
