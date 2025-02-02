package com.example.partynearme
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path

interface AuthService {
    @POST("/login")
    fun login(@Body request: LoginRequest): Call<LoginResponse>

    @POST("/users")
    fun registerUser(@Body request: RegisterRequest): Call<User>

    @GET("/users")
    fun getAllUsers(): Call<List<User>>

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

    @GET("/userId")
    fun getuserId(): Call<UserIdResponse>

    @GET("/users/{userId}/nearby")
    fun getNearbyUsers(@Path("userId") userId: String): Call<List<NearbyUser>>

}