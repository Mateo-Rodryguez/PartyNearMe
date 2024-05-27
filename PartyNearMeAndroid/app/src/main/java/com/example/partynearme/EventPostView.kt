package com.example.partynearme

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable

@Composable
fun EventPostView(eventPost: EventPost) {
    Column {
        Text(text = eventPost.text)
        eventPost.music?.let {
            //music will be displayed here
        }
        eventPost.photos?.forEach { photoUrl ->
            //Display each photo
        }
        eventPost.videos?.forEach { videoUrl ->
            // Display each video
        }
        eventPost.location?.let { location ->
            // Display location button
        }
    }
}