package com.partynearme.core.auth

import com.partynearme.core.ApiException
import com.partynearme.core.AppConfig
import io.ktor.client.HttpClient
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Talks to Supabase Auth (GoTrue) directly; the API only checks the tokens it issues. */
class AuthClient(
    private val http: HttpClient,
    private val config: AppConfig,
    private val now: () -> Long,
) {
    private val base get() = "${config.supabaseUrl}/auth/v1"

    sealed interface SignUpResult {
        data class SignedIn(val session: Session) : SignUpResult
        /** The project requires email confirmation; the user must tap the link first. */
        data object CheckEmail : SignUpResult
    }

    suspend fun signUp(email: String, password: String): SignUpResult {
        val response = http.post("$base/signup") {
            header("apikey", config.supabaseKey)
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(Credentials(email, password)))
        }
        val text = response.checked()
        val obj = json.decodeFromString<JsonObject>(text)
        return if (obj.containsKey("access_token")) {
            SignUpResult.SignedIn(json.decodeFromString<TokenResponse>(text).toSession())
        } else {
            SignUpResult.CheckEmail
        }
    }

    suspend fun signIn(email: String, password: String): Session {
        val response = http.post("$base/token?grant_type=password") {
            header("apikey", config.supabaseKey)
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(Credentials(email, password)))
        }
        return json.decodeFromString<TokenResponse>(response.checked()).toSession()
    }

    /** Returns null when the refresh token is no longer valid. */
    suspend fun refresh(refreshToken: String): Session? {
        val response = http.post("$base/token?grant_type=refresh_token") {
            header("apikey", config.supabaseKey)
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(RefreshBody(refreshToken)))
        }
        if (response.status.value in 400..499) return null
        return json.decodeFromString<TokenResponse>(response.checked()).toSession()
    }

    suspend fun signOut(accessToken: String) {
        // Best effort: the local session is cleared either way.
        runCatching {
            http.post("$base/logout") {
                header("apikey", config.supabaseKey)
                bearerAuth(accessToken)
            }
        }
    }

    private suspend fun HttpResponse.checked(): String {
        val text = bodyAsText()
        if (!status.isSuccess()) throw ApiException(status.value, authMessage(text))
        return text
    }

    private fun TokenResponse.toSession() = Session(
        accessToken = accessToken,
        refreshToken = refreshToken,
        expiresAt = expiresAt ?: (now() + expiresIn),
        userId = user.id,
        email = user.email,
    )

    @Serializable
    private data class Credentials(val email: String, val password: String)

    @Serializable
    private data class RefreshBody(@SerialName("refresh_token") val refreshToken: String)

    @Serializable
    private data class TokenResponse(
        @SerialName("access_token") val accessToken: String,
        @SerialName("refresh_token") val refreshToken: String,
        @SerialName("expires_in") val expiresIn: Long,
        @SerialName("expires_at") val expiresAt: Long? = null,
        val user: User,
    )

    @Serializable
    private data class User(val id: String, val email: String? = null)

    internal companion object {
        val json = Json { ignoreUnknownKeys = true }

        /** Supabase uses a few error shapes over its versions; pick whichever message is there. */
        fun authMessage(text: String): String {
            val obj = runCatching { json.decodeFromString<JsonObject>(text) }.getOrNull()
                ?: return "Sign-in failed"
            val raw = listOf("msg", "error_description", "message", "error")
                .firstNotNullOfOrNull { obj[it]?.jsonPrimitive?.contentOrNull }
                ?: return "Sign-in failed"
            return when {
                raw.contains("Invalid login credentials", ignoreCase = true) -> "Wrong email or password"
                raw.contains("Email not confirmed", ignoreCase = true) -> "Confirm your email first, using the link we sent you"
                else -> raw
            }
        }
    }
}
