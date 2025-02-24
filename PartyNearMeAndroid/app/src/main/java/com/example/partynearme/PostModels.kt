package com.example.partynearme

import com.google.gson.annotations.SerializedName

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
    @SerializedName("mediaUrls")
    val media: List<String>,
    val username: String,
    val profilePicture: String?,
    val likeCount: Int,
    val isLiked: Boolean,
)
data class PartyListing(
    val id: Int,
    val media: List<String>,
    val title: String
)
data class RecommendationRequest(
    val userId: Int,
    )
data class RecommendationResponse(
    val posts: List<Post>)

