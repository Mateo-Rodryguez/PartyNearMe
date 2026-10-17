package com.partynearme.core.api

import com.partynearme.core.ApiException
import com.partynearme.core.AppConfig
import com.partynearme.core.auth.SessionManager
import com.partynearme.core.model.Conversation
import com.partynearme.core.model.ConversationPage
import com.partynearme.core.model.Event
import com.partynearme.core.model.EventPage
import com.partynearme.core.model.Interaction
import com.partynearme.core.model.Interest
import com.partynearme.core.model.Message
import com.partynearme.core.model.MessagePage
import com.partynearme.core.model.NewEvent
import com.partynearme.core.model.NewPost
import com.partynearme.core.model.OwnProfile
import com.partynearme.core.model.Post
import com.partynearme.core.model.PostPage
import com.partynearme.core.model.PublicProfile
import com.partynearme.core.model.UploadId
import com.partynearme.core.model.UploadTicket
import io.ktor.client.HttpClient
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.put
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** The PartyNearMe API. Every call is signed in; a 401 triggers one token refresh and a retry. */
class ApiClient(
    private val http: HttpClient,
    private val config: AppConfig,
    private val sessions: SessionManager,
) {
    // Feed

    /** [cursor] comes from the previous page; a [FeedExpiredException] means start again from the top. */
    suspend fun feed(lat: Double?, lng: Double?, cursor: String? = null, limit: Int = 20): PostPage =
        call(HttpMethod.Get, "/feed", expect = { if (it == HttpStatusCode.Gone) throw FeedExpiredException() }) {
            parameter("lat", lat); parameter("lng", lng); parameter("cursor", cursor); parameter("limit", limit)
        }

    suspend fun logInteractions(events: List<Interaction>) {
        if (events.isEmpty()) return
        events.chunked(50).forEach { batch -> callUnit(HttpMethod.Post, "/interactions") { json(InteractionBatch(batch)) } }
    }

    // Posts

    suspend fun requestUpload(contentType: String, sizeBytes: Long): UploadTicket =
        call(HttpMethod.Post, "/uploads") { json(UploadRequest(contentType, sizeBytes)) }

    /** Sends the photo straight to storage with the signed URL; the API never sees the bytes. */
    suspend fun upload(ticket: UploadTicket, bytes: ByteArray) {
        val response = http.put(ticket.uploadUrl) {
            ticket.headers.forEach { (name, value) -> header(name, value) }
            setBody(bytes)
        }
        if (!response.status.isSuccess()) throw ApiException(response.status.value, "The photo didn't upload. Try again.")
    }

    /** Uploads one photo and returns its upload id. */
    suspend fun uploadPhoto(contentType: String, bytes: ByteArray): String {
        val ticket = requestUpload(contentType, bytes.size.toLong())
        upload(ticket, bytes)
        return ticket.uploadId
    }

    suspend fun createPost(post: NewPost): Post = call(HttpMethod.Post, "/posts") { json(post) }
    suspend fun post(id: String): Post = call(HttpMethod.Get, "/posts/${id.path()}")
    suspend fun deletePost(id: String) = callUnit(HttpMethod.Delete, "/posts/${id.path()}")
    suspend fun like(id: String) = callUnit(HttpMethod.Put, "/posts/${id.path()}/like")
    suspend fun unlike(id: String) = callUnit(HttpMethod.Delete, "/posts/${id.path()}/like")

    suspend fun userPosts(userId: String, cursor: String? = null): PostPage =
        call(HttpMethod.Get, "/users/${userId.path()}/posts") { parameter("cursor", cursor) }

    // Events

    suspend fun nearbyEvents(lat: Double, lng: Double, radiusKm: Double = 10.0, cursor: String? = null): EventPage =
        call(HttpMethod.Get, "/events/nearby") {
            parameter("lat", lat); parameter("lng", lng); parameter("radius_km", radiusKm); parameter("cursor", cursor)
        }

    suspend fun myEvents(organising: Boolean): List<Event> =
        call(HttpMethod.Get, "/me/events") { parameter("role", if (organising) "organising" else "going") }

    suspend fun event(id: String): Event = call(HttpMethod.Get, "/events/${id.path()}")
    /** Photos posted at a party, newest first. */
    suspend fun eventPosts(id: String, cursor: String? = null): PostPage =
        call(HttpMethod.Get, "/events/${id.path()}/posts") { parameter("cursor", cursor) }
    suspend fun createEvent(event: NewEvent): Event = call(HttpMethod.Post, "/events") { json(event) }

    /** [status] is "going" or "interested"; null removes the RSVP. */
    /** The cover shows once the server has checked the photo. */
    suspend fun setCover(eventId: String, uploadId: String) =
        callUnit(HttpMethod.Put, "/events/${eventId.path()}/cover") { json(UploadId(uploadId)) }
    suspend fun removeCover(eventId: String) = callUnit(HttpMethod.Delete, "/events/${eventId.path()}/cover")

    suspend fun rsvp(eventId: String, status: String?): Event =
        if (status == null) {
            callUnit(HttpMethod.Delete, "/events/${eventId.path()}/rsvp")
            event(eventId)
        } else {
            call(HttpMethod.Put, "/events/${eventId.path()}/rsvp") { json(RsvpBody(status)) }
        }

    // People

    suspend fun me(): OwnProfile = call(HttpMethod.Get, "/me")
    suspend fun updateMe(username: String? = null, displayName: String? = null, bio: String? = null): OwnProfile =
        call(HttpMethod.Patch, "/me") { json(ProfileUpdate(username, displayName, bio)) }
    /** The picture shows once the server has checked the photo. */
    suspend fun setAvatar(uploadId: String) = callUnit(HttpMethod.Put, "/me/avatar") { json(UploadId(uploadId)) }
    suspend fun removeAvatar() = callUnit(HttpMethod.Delete, "/me/avatar")
    suspend fun interests(): List<Interest> = call(HttpMethod.Get, "/interests")
    suspend fun setInterests(ids: List<Int>): OwnProfile = call(HttpMethod.Put, "/me/interests") { json(InterestIds(ids)) }
    suspend fun user(id: String): PublicProfile = call(HttpMethod.Get, "/users/${id.path()}")
    suspend fun follow(id: String) = callUnit(HttpMethod.Put, "/users/${id.path()}/follow")
    suspend fun unfollow(id: String) = callUnit(HttpMethod.Delete, "/users/${id.path()}/follow")
    suspend fun block(id: String) = callUnit(HttpMethod.Put, "/users/${id.path()}/block")
    suspend fun unblock(id: String) = callUnit(HttpMethod.Delete, "/users/${id.path()}/block")

    // Safety

    suspend fun report(targetType: ReportTarget, targetId: String, reason: String) =
        callUnit(HttpMethod.Post, "/reports") { json(ReportBody(targetType.wire, targetId, reason)) }

    /** Deletes the signed-in account and everything it owns. */
    suspend fun deleteAccount() = callUnit(HttpMethod.Delete, "/me")

    // Chat

    suspend fun inbox(cursor: String? = null): ConversationPage =
        call(HttpMethod.Get, "/conversations") { parameter("cursor", cursor) }
    suspend fun startConversation(userId: String): Conversation =
        call(HttpMethod.Post, "/conversations") { json(StartConversation(userId)) }
    suspend fun conversation(id: String): Conversation = call(HttpMethod.Get, "/conversations/${id.path()}")
    suspend fun unreadCount(): Int = call<UnreadCount>(HttpMethod.Get, "/conversations/unread").unreadCount

    /** Newest first; pass the oldest id you have as [before] to page back. */
    suspend fun messages(conversationId: String, before: String? = null): MessagePage =
        call(HttpMethod.Get, "/conversations/${conversationId.path()}/messages") { parameter("before", before) }

    suspend fun send(conversationId: String, body: String): Message =
        call(HttpMethod.Post, "/conversations/${conversationId.path()}/messages") { json(SendBody(body)) }

    suspend fun markRead(conversationId: String) =
        callUnit(HttpMethod.Post, "/conversations/${conversationId.path()}/read")

    // Push

    suspend fun registerDevice(token: String, platform: String) =
        callUnit(HttpMethod.Put, "/devices/${token.path()}") { json(DeviceBody(platform)) }
    suspend fun unregisterDevice(token: String) = callUnit(HttpMethod.Delete, "/devices/${token.path()}")

    // Plumbing

    private suspend inline fun <reified T> call(
        method: HttpMethod,
        path: String,
        noinline expect: (HttpStatusCode) -> Unit = {},
        noinline configure: HttpRequestBuilder.() -> Unit = {},
    ): T = json.decodeFromString(send(method, path, expect, configure))

    private suspend fun callUnit(method: HttpMethod, path: String, configure: HttpRequestBuilder.() -> Unit = {}) {
        send(method, path, {}, configure)
    }

    private suspend fun send(
        method: HttpMethod,
        path: String,
        expect: (HttpStatusCode) -> Unit,
        configure: HttpRequestBuilder.() -> Unit,
    ): String {
        suspend fun attempt(token: String): HttpResponse = http.request("${config.apiBaseUrl}$path") {
            this.method = method
            bearerAuth(token)
            configure()
        }
        val token = sessions.accessToken()
        var response = attempt(token)
        if (response.status == HttpStatusCode.Unauthorized) response = attempt(sessions.refresh(token))
        expect(response.status)
        val text = response.bodyAsText()
        if (!response.status.isSuccess()) throw ApiException(response.status.value, errorMessage(response.status, text))
        return text
    }

    private inline fun <reified B> HttpRequestBuilder.json(body: B) {
        contentType(ContentType.Application.Json)
        setBody(json.encodeToString(body))
    }

    private fun String.path() = encodeURLPathPart()

    @Serializable private data class InteractionBatch(val events: List<Interaction>)
    @Serializable private data class UploadRequest(
        @SerialName("content_type") val contentType: String,
        @SerialName("size_bytes") val sizeBytes: Long,
    )
    @Serializable private data class RsvpBody(val status: String)
    @Serializable private data class ProfileUpdate(
        val username: String? = null,
        @SerialName("display_name") val displayName: String? = null,
        val bio: String? = null,
    )
    @Serializable private data class InterestIds(@SerialName("interest_ids") val interestIds: List<Int>)
    @Serializable private data class StartConversation(@SerialName("user_id") val userId: String)
    @Serializable private data class UnreadCount(@SerialName("unread_count") val unreadCount: Int)
    @Serializable private data class SendBody(val body: String)
    @Serializable private data class DeviceBody(val platform: String)
    @Serializable private data class ReportBody(
        @SerialName("target_type") val targetType: String,
        @SerialName("target_id") val targetId: String,
        val reason: String,
    )

    internal companion object {
        // Leaves out nulls so PATCH /me only changes the fields that were passed.
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

        fun errorMessage(status: HttpStatusCode, text: String): String {
            val message = runCatching { json.decodeFromString<JsonObject>(text)["message"]?.jsonPrimitive?.contentOrNull }
                .getOrNull()
            return when {
                status.value >= 500 -> "Something went wrong on our side. Try again in a moment."
                message != null -> message
                else -> "Request failed (${status.value})"
            }
        }
    }
}

/** The feed snapshot behind a cursor has expired; reload from the top. */
class FeedExpiredException : Exception("The feed has moved on")

enum class ReportTarget(val wire: String) { Post("post"), Event("event"), User("user"), Message("message") }
