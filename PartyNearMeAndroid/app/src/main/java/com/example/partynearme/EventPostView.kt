package com.example.partynearme

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.painterResource

@Composable
fun EventPostView(eventPost: EventPost) {
    Column {
        Row {
            Image(painterResource(id = R.drawable.profile_pic), contentDescription = null)
            Text("Username")
        }
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