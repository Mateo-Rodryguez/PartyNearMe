package com.example.partynearme

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query


interface ApiService {
    //Users
    @POST("/conversations/find-or-create")
    fun findOrCreateConversation(@Body request: ConversationRequest): Call<ConversationResponse>

    @GET("/conversations/{conversationId}/messages")
    fun getMessages(@Path("conversationId") conversationId: String): Call<List<MessageResponse>>

    @POST("/messages")
    fun sendMessage(@Body message: MessageRequest): Call<MessageResponse>

    @POST("/users")
    fun registerUser(@Body user:User): Call<User>
    //Messages

    @PATCH("/messages/{messageId}/status")
    fun updateMessageStatus(@Path("messageId") messageId: String, @Body status: StatusUpdate): Call<Message>

    //Conversations
    @POST("/conversations")
    fun createConversation(@Body conversation: ConversationRequest): Call<Conversation>

    @GET("/users/{userId}/conversations")
    fun getUserConversations(@Path("userId") userId: Int): Call<List<Conversation>>

    @POST("/conversations/{conversationId}/participants")
    fun addParticipant(@Path("conversationId") conversationId: String, @Body participant: ParticipantRequest): Call<Participant>

    //Reactions
    @POST("/messages/{messageId}/reactions")
    fun addReaction(@Path("messageId") messageId: String, @Body reaction: ReactionRequest): Call<Reaction>

    // Posts
    @Multipart
    @POST("/posts")
    fun createPost(
        @Part("userId") userId: RequestBody,
        @Part("caption") caption: RequestBody?,
        @Part("location") location: RequestBody?,
        @Part media: List<MultipartBody.Part>
    ): Call<PostResponse>

    @GET("/user/posts")
    suspend fun getUserPosts(@Query("userId") userId: Int, @Query("page") page: Int = 1): PostResponse


}

