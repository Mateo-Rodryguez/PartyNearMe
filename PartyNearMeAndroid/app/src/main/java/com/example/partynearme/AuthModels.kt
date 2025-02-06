package com.example.partynearme

data class LoginRequest(
    val email: String,
    val password: String
)
data class LoginResponse(
    val token: String,
    val userId: Int,
)
data class RegisterRequest(
    val email: String,
    val password: String
)
data class User(
    val id: Int,
    val username: String,
    val email: String,
    val password_hash: String,
    val distance: Double? = null,
)
data class MessageRequest(
    val conversationId: String,
    val senderId: String,
    val content: String
)
data class StatusUpdate(
    val status: String
)


data class ParticipantRequest(
    val userId: String
)
data class ReactionRequest(
    val userId: String,
    val reaction: String
)
data class Message(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val content: String,
    val status: String
)
data class Conversation(
    val id: String,
    val name: String,
    val creatorId: String,
    val lastMessage: String
)
data class Participant(
    val conversationId: String,
    val userId: String
)
data class Reaction(
    val messageId: String,
    val userId: String,
    val reaction: String
)
data class Post(
    val id: String,
    val imageUrl: String,
    val description: String,
    val userId: Int
)
data class UserIdResponse(
    val id: Int
)