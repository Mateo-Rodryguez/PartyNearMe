package com.partynearme.core

import com.partynearme.core.auth.AuthClient
import com.partynearme.core.auth.MemorySessionStore
import com.partynearme.core.auth.Pkce
import com.partynearme.core.auth.base64Url
import com.partynearme.core.auth.sha256
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.Url
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private val config = AppConfig("https://api.test", "https://sb.test", "pk")

private fun hex(bytes: ByteArray) = bytes.joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }
private fun HttpRequestData.text() = (body as? TextContent)?.text.orEmpty()
private val json = headersOf(HttpHeaders.ContentType, "application/json")

class AuthFlowTest {
    @Test
    fun sha256MatchesKnownAnswers() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", hex(sha256(ByteArray(0))))
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", hex(sha256("abc".encodeToByteArray())))
        // Two blocks after padding.
        assertEquals(
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
            hex(sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq".encodeToByteArray())),
        )
    }

    @Test
    fun pkceChallengeIsTheRfcExample() {
        // RFC 7636, appendix B.
        val pkce = Pkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", pkce.challenge)
        assertEquals("_-8", base64Url(byteArrayOf(-1, -17)))
        assertTrue(Pkce().verifier.length in 43..128)
    }

    @Test
    fun googleSignInSwapsTheCodeForASession() = runTest {
        val store = MemorySessionStore()
        var opened = ""
        val app = PartyNearMe(config, store, MockEngine { request ->
            assertEquals("https://sb.test/auth/v1/token?grant_type=pkce", request.url.toString())
            assertTrue(request.text().contains("\"auth_code\":\"c0de\""))
            respond(
                """{"access_token":"a1","refresh_token":"r1","expires_in":3600,"user":{"id":"u1","email":"a@b.c"}}""",
                HttpStatusCode.OK, json,
            )
        }, now = { 0L })
        assertTrue(app.signInWith("google") { url -> opened = url; "partynearme://auth-callback?code=c0de" })
        val sent = Url(opened)
        assertEquals("/auth/v1/authorize", sent.encodedPath)
        assertEquals("google", sent.parameters["provider"])
        assertEquals("partynearme://auth-callback", sent.parameters["redirect_to"])
        assertEquals("s256", sent.parameters["code_challenge_method"])
        assertEquals("u1", store.load()?.userId)
    }

    @Test
    fun closingTheBrowserIsNotAnError() = runTest {
        val app = PartyNearMe(config, MemorySessionStore(), MockEngine { error("no request expected") }, now = { 0L })
        assertFalse(app.signInWith("google") { null })
    }

    @Test
    fun providerErrorsReachTheUser() {
        val error = assertFailsWith<ApiException> {
            AuthClient.parseCallback("partynearme://auth-callback#error=access_denied&error_description=User+said+no").getOrThrow()
        }
        assertEquals("User said no", error.message)
    }

    @Test
    fun passwordResetPointsAtOurPage() = runTest {
        var url = ""
        val app = PartyNearMe(config, MemorySessionStore(), MockEngine { request ->
            url = request.url.toString()
            assertEquals("""{"email":"a@b.c"}""", request.text())
            respond("{}", HttpStatusCode.OK, json)
        }, now = { 0L })
        app.sendPasswordReset("a@b.c")
        assertEquals("https://sb.test/auth/v1/recover?redirect_to=https%3A%2F%2Fapi.test%2Freset-password", url)
    }

    @Test
    fun onlySwitchedOnProvidersAreListed() = runTest {
        val app = PartyNearMe(config, MemorySessionStore(), MockEngine {
            respond("""{"external":{"google":true,"apple":false,"email":true},"disable_signup":false}""", HttpStatusCode.OK, json)
        }, now = { 0L })
        assertEquals(setOf("google", "email"), app.auth.providers())
    }
}
