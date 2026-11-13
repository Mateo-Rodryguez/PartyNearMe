package com.partynearme.ui.screens

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/*
 * Grey shapes in the layout of what's loading, with a soft light sweeping across,
 * like Instagram and Facebook use instead of a spinner: the screen looks ready at
 * once and the real content drops into place. Same shapes as the iPhone app.
 */

/** Where the sweep is, from -1 to 2 across the width; shared so every bone moves together. */
private val LocalSweep = compositionLocalOf<State<Float>?> { null }

/** Gives everything inside one moving light, and reads as "Loading" to TalkBack. */
@Composable
fun Shimmer(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val sweep = rememberInfiniteTransition(label = "shimmer").animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(1300, easing = LinearEasing), RepeatMode.Restart),
        label = "sweep",
    )
    Box(modifier.semantics(mergeDescendants = true) { contentDescription = "Loading" }) {
        CompositionLocalProvider(LocalSweep provides sweep) { content() }
    }
}

/** One grey block of a skeleton. */
@Composable
fun Bone(modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(6.dp)) {
    val base = MaterialTheme.colorScheme.surfaceVariant
    val sweep = LocalSweep.current
    Box(
        modifier
            .clip(shape)
            .background(base)
            .drawWithContent {
                drawContent()
                val x = (sweep?.value ?: return@drawWithContent) * size.width
                drawRect(
                    Brush.horizontalGradient(
                        listOf(Color.Transparent, Color.White.copy(alpha = 0.16f), Color.Transparent),
                        startX = x - size.width * 0.4f,
                        endX = x + size.width * 0.4f,
                    ),
                    topLeft = Offset.Zero,
                )
            },
    )
}

@Composable
private fun Line(width: Dp, height: Dp = 12.dp) = Bone(Modifier.width(width).height(height))

/** A post while the feed loads: author row, a 4:5 photo, action row and caption lines. */
@Composable
fun PostSkeleton() {
    Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
        Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Bone(Modifier.size(38.dp), CircleShape)
            Spacer(Modifier.width(10.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Line(120.dp)
                Line(80.dp, 10.dp)
            }
        }
        Bone(Modifier.padding(horizontal = 12.dp).fillMaxWidth().aspectRatio(0.8f), RoundedCornerShape(24.dp))
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            repeat(3) { Bone(Modifier.size(24.dp), CircleShape) }
        }
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Line(220.dp)
            Line(160.dp)
        }
    }
}

/** Home while the first page loads. */
@Composable
fun FeedSkeleton() {
    Shimmer(Modifier.fillMaxSize()) { Column { repeat(2) { PostSkeleton() } } }
}

/** A party card while Nearby loads: the cover, then title and details. */
@Composable
fun PartySkeleton() {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Bone(Modifier.fillMaxWidth().height(190.dp), RoundedCornerShape(22.dp))
        Line(200.dp, 14.dp)
        Line(140.dp)
    }
}

/** Nearby while it looks for parties. */
@Composable
fun PartiesSkeleton() {
    Shimmer(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            repeat(3) { PartySkeleton() }
        }
    }
}

/** A whole list loading: rows of a round picture and two lines, as in chats and notifications. */
@Composable
fun ListSkeleton(rows: Int = 8, picture: Dp = 48.dp) {
    Shimmer(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(rows) {
                Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Bone(Modifier.size(picture), CircleShape)
                    Spacer(Modifier.width(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Line(170.dp)
                        Line(110.dp, 10.dp)
                    }
                }
            }
        }
    }
}

/** A profile while it loads: picture, name, the three counts and a grid of photos. */
@Composable
fun ProfileSkeleton() {
    Shimmer(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Bone(Modifier.size(96.dp), CircleShape)
            Spacer(Modifier.height(14.dp))
            Bone(Modifier.width(150.dp).height(18.dp), RoundedCornerShape(8.dp))
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(36.dp)) {
                repeat(3) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Line(28.dp, 16.dp)
                        Line(56.dp, 10.dp)
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
            repeat(3) {
                Row(Modifier.fillMaxWidth().padding(bottom = 3.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    repeat(3) { Bone(Modifier.weight(1f).aspectRatio(0.8f), RoundedCornerShape(0.dp)) }
                }
            }
        }
    }
}
