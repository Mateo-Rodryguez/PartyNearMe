package com.example.partynearme

data class ConversationRequest(
    val senderId: Int,
    val receiverId: Int,
)
data class ConversationResponse(
    val conversationId: String,
)
data class MessageResponse(
    val id: String,
    val conversationId: String,
    val senderId: String,
    val content: String,
    val timestamp: String
)
