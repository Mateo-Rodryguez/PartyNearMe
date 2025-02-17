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
    val posts: List<Post>
)
data class Post(
    val id: Int,
    val caption: String,
    val location: String,
    val createdAt: String,
    val media: List<String>,
)
data class PartyListing(
    val id: Int,
    val media: List<String>,
    val title: String
)