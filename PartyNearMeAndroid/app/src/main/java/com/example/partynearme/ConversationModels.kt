package com.example.partynearme

data class ConversationRequest(
    val user1: String,
    val user2: String
)
data class ConversationResponse(
    val id: String,
)
data class MessageResponse(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val content: String,
    val timestamp: String
)
