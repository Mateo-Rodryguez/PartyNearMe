package com.partynearme.core.auth

import com.partynearme.core.ApiException
import com.partynearme.core.AppConfig
import io.ktor.client.HttpClient
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.URLBuilder
import io.ktor.http.Url
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.http.parseQueryString
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
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

    /**
     * Emails a link for choosing a new password. Supabase answers the same whether
     * or not the address has an account, so this doesn't reveal who signed up.
     */
    suspend fun recover(email: String, redirectTo: String) {
        val response = http.post("$base/recover") {
            header("apikey", config.supabaseKey)
            parameter("redirect_to", redirectTo)
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(EmailBody(email)))
        }
        response.checked()
    }

    /** The sign-in providers switched on in Supabase, such as "google" or "apple". */
    suspend fun providers(): Set<String> {
        val response = http.get("$base/settings") { header("apikey", config.supabaseKey) }
        val external = json.decodeFromString<JsonObject>(response.checked())["external"]?.jsonObject ?: return emptySet()
        return external.filterValues { it.jsonPrimitive.booleanOrNull == true }.keys
    }

    /** Where to send the browser to sign in with [provider]; it comes back to [redirectTo] with a code. */
    fun authorizeUrl(provider: String, redirectTo: String, pkce: Pkce): String =
        URLBuilder("$base/authorize").apply {
            parameters.append("provider", provider)
            parameters.append("redirect_to", redirectTo)
            parameters.append("code_challenge", pkce.challenge)
            parameters.append("code_challenge_method", "s256")
        }.buildString()

    /** Swaps the code from a browser sign-in for a session. */
    suspend fun exchangeCode(code: String, pkce: Pkce): Session {
        val response = http.post("$base/token?grant_type=pkce") {
            header("apikey", config.supabaseKey)
            contentType(ContentType.Application.Json)
            setBody(json.encodeToString(CodeExchange(code, pkce.verifier)))
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
    private data class EmailBody(val email: String)

    @Serializable
    private data class CodeExchange(
        @SerialName("auth_code") val authCode: String,
        @SerialName("code_verifier") val codeVerifier: String,
    )

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

        /**
         * Reads where a browser sign-in came back to: the code on success, or the
         * provider's error. Supabase puts errors in the query or the fragment.
         */
        fun parseCallback(url: String): Result<String> {
            val parsed = runCatching { Url(url) }.getOrNull() ?: return Result.failure(ApiException(400, "Sign-in failed"))
            val fragment = parseQueryString(parsed.fragment)
            parsed.parameters["code"]?.let { return Result.success(it) }
            val error = parsed.parameters["error_description"] ?: fragment["error_description"]
                ?: parsed.parameters["error"] ?: fragment["error"]
            return Result.failure(ApiException(400, error?.replace('+', ' ') ?: "Sign-in failed"))
        }

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
