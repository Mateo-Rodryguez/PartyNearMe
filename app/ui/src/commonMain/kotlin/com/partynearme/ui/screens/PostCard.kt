package com.partynearme.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.model.Media
import com.partynearme.core.model.Post
import com.partynearme.ui.timeAgo

/** One post, Instagram style: author, swipeable photos, likes and caption. */
@Composable
fun PostCard(
    post: Post,
    isMine: Boolean,
    onAuthor: () -> Unit,
    onLike: (Boolean) -> Unit,
    onDelete: () -> Unit,
    onNotInterested: (() -> Unit)? = null,
    onReport: () -> Unit = {},
    onEvent: (String) -> Unit = {},
) {
    var menu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).clickable(onClick = onAuthor).padding(vertical = 8.dp)) {
                Text(post.author.name, fontWeight = FontWeight.SemiBold)
                post.placeName?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
            val eventId = post.eventId
            val eventTitle = post.eventTitle
            if (eventId != null && eventTitle != null) {
                TextButton(onClick = { onEvent(eventId) }) { Text("At $eventTitle", maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "More") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    if (isMine) {
                        DropdownMenuItem(text = { Text("Delete post") }, onClick = { menu = false; onDelete() })
                    } else {
                        if (onNotInterested != null) {
                            DropdownMenuItem(text = { Text("Not interested") }, onClick = { menu = false; onNotInterested() })
                        }
                        DropdownMenuItem(text = { Text("Report") }, onClick = { menu = false; onReport() })
                    }
                    DropdownMenuItem(text = { Text("Close") }, onClick = { menu = false })
                }
            }
        }
        Photos(post.media, pending = post.status != "visible", onDoubleTap = { if (!post.likedByMe) onLike(true) })
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { onLike(!post.likedByMe) }, enabled = post.status == "visible") {
                Icon(
                    if (post.likedByMe) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    if (post.likedByMe) "Unlike" else "Like",
                    tint = if (post.likedByMe) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                )
            }
            Text(
                when (post.likeCount) { 0 -> ""; 1 -> "1 like"; else -> "${post.likeCount} likes" },
                fontWeight = FontWeight.SemiBold,
            )
        }
        post.caption?.takeIf { it.isNotBlank() }?.let {
            Text(it, Modifier.padding(horizontal = 12.dp))
        }
        Text(
            timeAgo(post.createdAt),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Photos(media: List<Media>, pending: Boolean, onDoubleTap: () -> Unit) {
    // Instagram's range: from 4:5 portrait to 1.91:1 landscape.
    val first = media.firstOrNull()
    val ratio = if (first?.width != null && first.height != null && first.height!! > 0) {
        (first.width!!.toFloat() / first.height!!).coerceIn(0.8f, 1.91f)
    } else {
        1f
    }
    val pager = rememberPagerState { media.size.coerceAtLeast(1) }
    Box(
        Modifier.fillMaxWidth().aspectRatio(ratio).background(MaterialTheme.colorScheme.surfaceVariant)
            .pointerInput(Unit) { detectTapGestures(onDoubleTap = { onDoubleTap() }) },
    ) {
        if (pending || media.isEmpty()) {
            Text(
                "Checking your photo… it appears for everyone once it's approved.",
                Modifier.align(Alignment.Center).padding(24.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            HorizontalPager(pager) { page ->
                AsyncImage(
                    model = media[page].urlFor(1080),
                    contentDescription = "Photo ${page + 1}",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().aspectRatio(ratio),
                )
            }
            if (media.size > 1) {
                Text(
                    "${pager.currentPage + 1}/${media.size}",
                    color = Color.White,
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)
                        .background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
    }
}

/** Puts a like (or unlike) on the screen at once, then tells the server. */
fun Post.withLike(liked: Boolean) =
    if (liked == likedByMe) this else copy(likedByMe = liked, likeCount = (likeCount + if (liked) 1 else -1).coerceAtLeast(0))

