package com.example.partynearme

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.material3.Text

@Composable
fun forYouScreen() {
    val dummyPosts = listOf(
        EventPost("1", "Event 1", null, null, null, "Location 1"),
        EventPost("2", "Event 2", null, null, null, "Location 2"),
        // More posts to be added here
    )
    LazyColumn {
        items(dummyPosts) { post ->
            EventPostView(post)
        }
    }
}