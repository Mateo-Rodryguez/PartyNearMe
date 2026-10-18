package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import androidx.compose.ui.unit.dp
import com.partynearme.ui.Brand
import kotlin.time.Duration.Companion.seconds

/**
 * A round profile picture, or the first letter of the name on a gradient when there isn't one.
 * [ring] draws the brand ring around it, Instagram-story style, for highlighted people.
 */
@Composable
fun Avatar(url: String?, name: String, size: Dp, modifier: Modifier = Modifier, ring: Boolean = false) {
    val ringed = if (ring) Modifier.border(2.dp, Brand.sunset, CircleShape).padding(3.dp) else Modifier
    Box(
        modifier.size(size).then(ringed).clip(CircleShape).background(initialsBrush(name)),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            AsyncImage(url, contentDescription = name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Text(
                name.trimStart('@').take(1).uppercase(),
                color = androidx.compose.ui.graphics.Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = (size.value * 0.4f).sp,
            )
        }
    }
}

/** A colour pair per person, so letter avatars tell people apart at a glance. */
private fun initialsBrush(name: String): Brush = Brand.coverFor(name.trimStart('@'))

/** How long to wait before reloading a picture the server is still checking. */
val PICTURE_CHECK_DELAY = 5.seconds
