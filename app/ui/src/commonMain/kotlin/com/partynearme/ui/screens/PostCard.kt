package com.partynearme.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.model.Media
import com.partynearme.core.model.Post
import com.partynearme.ui.LocalAppPrefs
import com.partynearme.ui.timeAgo
import kotlinx.coroutines.delay

/** One post: author, swipeable photos with rounded corners, likes, comments and caption. */
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
    onSave: ((Boolean) -> Unit)? = null,
    onComments: (() -> Unit)? = null,
    /** Called with the new caption; empty removes it. */
    onEditCaption: ((String) -> Unit)? = null,
) {
    var menu by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var bursts by remember { mutableIntStateOf(0) }
    val visible = post.status == "visible"
    Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(post.author.avatarUrl, post.author.name, 38.dp, Modifier.clip(CircleShape).clickable(onClick = onAuthor))
            Column(Modifier.weight(1f).clickable(onClick = onAuthor).padding(start = 10.dp)) {
                Text(post.author.name, style = MaterialTheme.typography.titleSmall)
                Text(
                    listOfNotNull(post.placeName, timeAgo(post.createdAt).ifEmpty { null }).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Box {
                IconButton(onClick = { menu = true }) {
                    Icon(Icons.Filled.MoreVert, "More", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    if (isMine) {
                        if (onEditCaption != null) {
                            DropdownMenuItem(text = { Text(if (post.caption.isNullOrBlank()) "Add caption" else "Edit caption") },
                                onClick = { menu = false; editing = true })
                        }
                        DropdownMenuItem(text = { Text("Delete post") }, onClick = { menu = false; onDelete() })
                    } else {
                        if (onNotInterested != null) {
                            DropdownMenuItem(text = { Text("Not interested") }, onClick = { menu = false; onNotInterested() })
                        }
                        DropdownMenuItem(text = { Text("Report") }, onClick = { menu = false; onReport() })
                    }
                }
            }
        }
        Box(Modifier.padding(horizontal = 12.dp).clip(RoundedCornerShape(24.dp))) {
            Photos(post.media, pending = !visible, bursts = bursts, onDoubleTap = {
                if (visible) {
                    bursts++
                    if (!post.likedByMe) onLike(true)
                }
            })
            val eventId = post.eventId
            val eventTitle = post.eventTitle
            if (eventId != null && eventTitle != null) {
                Pill(
                    eventTitle,
                    icon = Icons.Filled.Place,
                    dark = true,
                    modifier = Modifier.align(Alignment.BottomStart).padding(12.dp).clip(CircleShape)
                        .clickable { onEvent(eventId) },
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { onLike(!post.likedByMe) }, enabled = visible) {
                Icon(
                    if (post.likedByMe) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    if (post.likedByMe) "Unlike" else "Like",
                    modifier = Modifier.size(26.dp),
                    tint = if (post.likedByMe) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                )
            }
            if (onComments != null) {
                IconButton(onClick = onComments, enabled = visible) {
                    Icon(PartyIcons.ChatBubbleOutline, "Comments", modifier = Modifier.size(24.dp),
                        tint = MaterialTheme.colorScheme.onSurface)
                }
            }
            // People can hide counts on others' posts in settings; your own always show.
            if (isMine || !LocalAppPrefs.current.hideLikeCounts) {
                Text(
                    when (post.likeCount) { 0 -> "Be the first to like this"; 1 -> "1 like"; else -> "${post.likeCount} likes" },
                    style = MaterialTheme.typography.labelLarge,
                    color = if (post.likeCount == 0) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                )
            }
            Spacer(Modifier.weight(1f))
            if (onSave != null) {
                IconButton(onClick = { onSave(!post.savedByMe) }, enabled = visible) {
                    Icon(
                        if (post.savedByMe) PartyIcons.Bookmark else PartyIcons.BookmarkBorder,
                        if (post.savedByMe) "Remove from saved" else "Save",
                        modifier = Modifier.size(26.dp),
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
        post.caption?.takeIf { it.isNotBlank() }?.let { caption ->
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(post.author.name) }
                    append("  ")
                    append(caption)
                },
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }
        if (onComments != null && visible) {
            Text(
                when (post.commentCount) {
                    0 -> "Add a comment…"
                    1 -> "View 1 comment"
                    else -> "View all ${post.commentCount} comments"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp).clickable(onClick = onComments),
            )
        }
    }
    if (editing && onEditCaption != null) {
        EditCaptionDialog(post.caption.orEmpty(), onDismiss = { editing = false }) { editing = false; onEditCaption(it) }
    }
}

@Composable
private fun EditCaptionDialog(current: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var text by remember { mutableStateOf(current) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit caption") },
        text = {
            OutlinedTextField(text, { text = it.take(2200) }, placeholder = { Text("Write a caption…") }, minLines = 3)
        },
        confirmButton = { TextButton(onClick = { onSave(text.trim()) }, enabled = text.trim() != current) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Photos(media: List<Media>, pending: Boolean, bursts: Int, onDoubleTap: () -> Unit) {
    // Instagram's range: from 4:5 portrait to 1.91:1 landscape.
    val first = media.firstOrNull()
    val ratio = if (first?.width != null && first.height != null && first.height!! > 0) {
        (first.width!!.toFloat() / first.height!!).coerceIn(0.8f, 1.91f)
    } else {
        1f
    }
    val pager = rememberPagerState { media.size.coerceAtLeast(1) }
    // The gesture handler lives across recompositions, so it reads the latest callback.
    val doubleTap by rememberUpdatedState(onDoubleTap)
    // The heart that pops up on a double tap, Instagram style.
    val heart = remember { Animatable(0f) }
    LaunchedEffect(bursts) {
        if (bursts == 0) return@LaunchedEffect
        heart.snapTo(0.4f)
        heart.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = 400f))
        delay(450)
        heart.animateTo(0f, tween(180))
    }
    Box(
        Modifier.fillMaxWidth().aspectRatio(ratio).background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .pointerInput(Unit) { detectTapGestures(onDoubleTap = { doubleTap() }) },
    ) {
        if (pending || media.isEmpty()) {
            Column(
                Modifier.align(Alignment.Center).padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
                Text(
                    "Checking your photo. It appears for everyone once it's approved.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
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
                Row(
                    Modifier.align(Alignment.BottomCenter).padding(12.dp)
                        .background(Color(0x66000000), CircleShape).padding(horizontal = 8.dp, vertical = 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    repeat(media.size) { i ->
                        Box(
                            Modifier.size(6.dp).clip(CircleShape)
                                .background(if (i == pager.currentPage) Color.White else Color.White.copy(alpha = 0.45f)),
                        )
                    }
                }
            }
        }
        if (heart.value > 0f) {
            Icon(
                Icons.Filled.Favorite,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.align(Alignment.Center).size(110.dp).graphicsLayer {
                    scaleX = heart.value
                    scaleY = heart.value
                    alpha = heart.value.coerceIn(0f, 1f)
                },
            )
        }
    }
}

/** Puts a save (or unsave) on the screen at once, then tells the server. */
fun Post.withSave(saved: Boolean) = copy(savedByMe = saved)

/** Puts a like (or unlike) on the screen at once, then tells the server. */
fun Post.withLike(liked: Boolean) =
    if (liked == likedByMe) this else copy(likedByMe = liked, likeCount = (likeCount + if (liked) 1 else -1).coerceAtLeast(0))

