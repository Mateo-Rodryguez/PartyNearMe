package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import com.partynearme.core.model.RelationshipStatus
import com.partynearme.ui.Brand

/** What each heart means. Only shown where people pick theirs, in settings; profiles show the heart alone. */
val RelationshipStatus?.meaning: String
    get() = when (this) {
        RelationshipStatus.Taken -> "In a relationship"
        RelationshipStatus.Talking -> "Talking to someone"
        RelationshipStatus.Single -> "Single and looking"
        null -> "Don't show"
    }

private val Red = Color(0xFFE5132A)
/** Softer and lighter than [Red]: interested, not taken. */
private val SoftRed = Color(0xFFF2788A)

private val LeftHalf = GenericShape { size, _ -> addRect(Rect(0f, 0f, size.width / 2f, size.height)) }

/**
 * The small heart next to someone's name: full red when taken, half filled in a
 * softer red when talking to someone, an empty outline when single. Nothing
 * when they chose not to show it. [size] should match the name's text height.
 */
@Composable
fun RelationshipHeart(status: RelationshipStatus?, size: Dp, modifier: Modifier = Modifier) {
    if (status == null) return
    // Black on the light theme as designed; on the dark theme black would vanish, so it uses white.
    val outline = if (Brand.isNight) Color.White else Color.Black
    Box(modifier.size(size).semantics { contentDescription = status.meaning }) {
        when (status) {
            RelationshipStatus.Taken -> Icon(Icons.Filled.Favorite, null, Modifier.fillMaxSize(), tint = Red)
            RelationshipStatus.Talking -> {
                Icon(Icons.Filled.FavoriteBorder, null, Modifier.fillMaxSize(), tint = SoftRed)
                Icon(Icons.Filled.Favorite, null, Modifier.fillMaxSize().clip(LeftHalf), tint = SoftRed)
            }
            RelationshipStatus.Single -> Icon(Icons.Filled.FavoriteBorder, null, Modifier.fillMaxSize(), tint = outline)
        }
    }
}
