package com.partynearme.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.partynearme.core.api.ReportTarget
import com.partynearme.core.model.Comment
import com.partynearme.ui.Brand
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.timeAgo
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

/** A post's comments, newest first like TikTok, with the box to add one pinned at the bottom. */
@Composable
fun CommentsScreen(ui: Ui, postId: String) {
    val scope = rememberCoroutineScope()
    val paged = remember(postId) {
        Paged<Comment>(scope) { cursor -> ui.api.comments(postId, cursor).let { it.comments to it.nextCursor } }
    }
    LaunchedEffect(paged) { paged.refresh() }
    val list = rememberLazyListState()
    val nearEnd by remember(paged) {
        derivedStateOf { (list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= list.layoutInfo.totalItemsCount - 5 }
    }
    LaunchedEffect(nearEnd, paged) { if (nearEnd && paged.loadedOnce) paged.loadMore() }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<Comment?>(null) }

    fun send() {
        val body = draft.trim()
        sending = true
        scope.launch {
            attempt { ui.api.addComment(postId, body) }
                .onSuccess { paged.items.add(0, it); draft = ""; ui.track("comment_posted"); list.scrollToItem(0) }
                .onFailure { ui.toast(it.userMessage) }
            sending = false
        }
    }

    Column(Modifier.fillMaxSize()) {
        BackBar(ui, "Comments")
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 0.5.dp)
        Box(Modifier.weight(1f)) {
            when {
                !paged.loadedOnce -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                paged.items.isEmpty() && paged.error != null -> Message(paged.error!!) { paged.refresh() }
                paged.items.isEmpty() -> EmptyState(
                    PartyIcons.ChatBubbleOutline,
                    "No comments yet",
                    body = "Start the conversation.",
                )
                else -> LazyColumn(state = list, modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                    items(paged.items, key = { it.id }) { c ->
                        CommentRow(
                            c,
                            mine = c.author.id == ui.myId,
                            onAuthor = { ui.nav.open(Route.User(c.author.id)) },
                            onDelete = { deleting = c },
                            onReport = { reporting = c.id },
                        )
                    }
                    if (paged.error != null) item { Message(paged.error!!) { paged.retry() } }
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 0.5.dp)
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.Bottom) {
            TextField(
                value = draft,
                onValueChange = { draft = it.take(1000) },
                placeholder = { Text("Add a comment…") },
                maxLines = 4,
                shape = RoundedCornerShape(24.dp),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    cursorColor = MaterialTheme.colorScheme.primary,
                ),
                modifier = Modifier.weight(1f),
            )
            val canSend = draft.isNotBlank() && !sending
            Box(
                Modifier.padding(start = 8.dp, bottom = 4.dp).size(48.dp).clip(CircleShape)
                    .background(if (canSend) Brand.gradient else SolidBrush(MaterialTheme.colorScheme.surfaceContainerHigh))
                    .clickable(enabled = canSend, onClickLabel = "Post comment", onClick = ::send),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, "Post comment", Modifier.size(20.dp),
                    tint = if (canSend) Color.White else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    reporting?.let { id -> ReportDialog(ui, ReportTarget.Comment, id) { reporting = null } }
    deleting?.let { c ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("Delete comment?") },
            text = { Text("It disappears for everyone.") },
            confirmButton = {
                TextButton(onClick = {
                    deleting = null
                    scope.launch {
                        attempt { ui.api.deleteComment(c.id) }
                            .onSuccess { paged.remove { it.id == c.id } }
                            .onFailure { ui.toast(it.userMessage) }
                    }
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Cancel") } },
        )
    }
}

/** One comment: picture, name and words, with when it was posted. Holding it down offers delete or report. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun CommentRow(c: Comment, mine: Boolean, onAuthor: () -> Unit, onDelete: () -> Unit, onReport: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                .combinedClickable(onClick = {}, onLongClick = { menu = true })
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Avatar(c.author.avatarUrl, c.author.name, 36.dp, Modifier.clip(CircleShape).clickable(onClick = onAuthor))
            Column(Modifier.weight(1f).padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(c.author.name) }
                        append("  ")
                        append(c.body)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    if (c.status == "visible") timeAgo(c.createdAt)
                    else "Only you can see this. It was hidden for breaking the community rules.",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (c.status == "visible") MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                )
            }
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            if (c.canDelete) {
                DropdownMenuItem(text = { Text("Delete comment") }, onClick = { menu = false; onDelete() })
            }
            if (!mine) {
                DropdownMenuItem(text = { Text("Report comment") }, onClick = { menu = false; onReport() })
            }
        }
    }
}
