package com.example.partynearme

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.Modifier
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Arrangement

@Composable
fun forYouScreen() {
    val dummyPosts = listOf(
        EventPost("1", "Event 1", null, null, null, "Location 1"),
        EventPost("2", "Event 2", null, null, null, "Location 2"),
        // More posts to be added here
    )
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top
    ){
        Text(
            text = "For You",
            textAlign = TextAlign.Center
        )
        LazyColumn {
            items(dummyPosts) { post ->
                EventPostView(post)
            }
        }
    }
}
@Preview(showBackground = true)
@Composable
fun PreviewForYouScreen() {
    forYouScreen()
}