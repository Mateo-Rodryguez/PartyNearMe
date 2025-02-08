package com.example.partynearme

data class EventPost(
    val id: String,
    val text: String,
    val music: String?,
    val photos: List<String>?,
    val videos: List<String>?,
    val location: String?
)
data class PostResponse(
    val message: String,
    val postId: Int,
)