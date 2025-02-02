package com.example.partynearme

import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path



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
    fun getUserConversations(@Path("userId") userId: String): Call<List<Conversation>>

    @POST("/conversations/{conversationId}/participants")
    fun addParticipant(@Path("conversationId") conversationId: String, @Body participant: ParticipantRequest): Call<Participant>

    //Reactions
    @POST("/messages/{messageId}/reactions")
    fun addReaction(@Path("messageId") messageId: String, @Body reaction: ReactionRequest): Call<Reaction>


}

