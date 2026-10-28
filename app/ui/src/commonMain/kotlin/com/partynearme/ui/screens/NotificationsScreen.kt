package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.model.Notification
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.timeAgo
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

private val known = setOf("like", "comment", "tag", "follow", "rsvp", "request", "reminder")

/**
 * Likes, comments, follows, people going to your parties and reminders for the ones you're going to,
 * opened from the bell on Home. New ones are marked and split from the rest, as on Instagram.
 */
@Composable
fun NotificationsScreen(ui: Ui) {
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<Notification>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        attempt { ui.api.notifications() }
            .onSuccess { page ->
                items = page.notifications.filter { it.type in known }
                error = null
                // Opening the list counts as seeing them: the bell's badge clears.
                if (page.unreadCount > 0) attempt { ui.api.markNotificationsSeen() }
                ui.unreadNotifications = 0
            }
            .onFailure { error = it.userMessage }
    }
    LaunchedEffect(Unit) { load() }

    Column {
        BackBar(ui, "Notifications")
        val list = items
        when {
            list == null && error != null -> Message(error.orEmpty()) { scope.launch { load() } }
            list == null -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            list.isEmpty() -> EmptyState(
                Icons.Outlined.Notifications,
                "Nothing yet",
                body = "When people like or comment on your photos, follow you or say they're going to your parties, you'll see it here.",
            )
            else -> {
                val (fresh, earlier) = list.partition { it.unread }
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                    if (fresh.isNotEmpty()) {
                        item(key = "new") { SectionHeader("New", Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) }
                        items(fresh, key = { it.id }) { NotificationRow(ui, it) }
                    }
                    if (earlier.isNotEmpty()) {
                        item(key = "earlier") { SectionHeader("Earlier", Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) }
                        items(earlier, key = { it.id }) { NotificationRow(ui, it) }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(ui: Ui, n: Notification) {
    val actor = n.actor
    val party = n.eventTitle ?: "your party"
    val postId = n.postId
    val eventId = n.eventId
    val open: () -> Unit = {
        when {
            (n.type == "like" || n.type == "tag") && postId != null -> ui.nav.open(Route.Post(postId))
            n.type == "comment" && postId != null -> ui.nav.open(Route.Comments(postId))
            n.type == "follow" && actor != null -> ui.nav.open(Route.User(actor.id))
            n.type == "request" && eventId != null -> ui.nav.open(Route.Guests(eventId, party))
            eventId != null -> ui.nav.open(Route.Event(eventId))
        }
    }
    val text = buildAnnotatedString {
        val bold = SpanStyle(fontWeight = FontWeight.SemiBold)
        when (n.type) {
            "like" -> { withStyle(bold) { append(actor?.name ?: "Someone") }; append(" liked your photo.") }
            "comment" -> {
                withStyle(bold) { append(actor?.name ?: "Someone") }
                append(" commented: ")
                append(n.commentText.orEmpty())
            }
            "tag" -> { withStyle(bold) { append(actor?.name ?: "Someone") }; append(" tagged you in a photo.") }
            "follow" -> { withStyle(bold) { append(actor?.name ?: "Someone") }; append(" started following you.") }
            "request" -> {
                withStyle(bold) { append(actor?.name ?: "Someone") }; append(" asked to come to "); withStyle(bold) { append(party) }; append(".")
            }
            "rsvp" -> { withStyle(bold) { append(actor?.name ?: "Someone") }; append(" is going to "); withStyle(bold) { append(party) }; append(".") }
            else -> { withStyle(bold) { append(party) }; append(" is coming up soon. Get ready!") }
        }
    }
    Row(
        Modifier.fillMaxWidth().clickable(onClick = open)
            .background(if (n.unread) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else Color.Transparent)
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (actor != null) {
            Avatar(actor.avatarUrl, actor.name, 48.dp, ring = n.unread)
        } else {
            Cover(n.eventCoverUrl, n.eventId ?: n.id, Modifier.size(48.dp).clip(CircleShape))
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(text, style = MaterialTheme.typography.bodyMedium, maxLines = 3)
            Text(timeAgo(n.createdAt), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        val thumbnail = n.postThumbnailUrl
        val thumbShape = RoundedCornerShape(10.dp)
        when {
            thumbnail != null -> AsyncImage(
                thumbnail, "The photo",
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(48.dp).clip(thumbShape),
            )
            n.type == "rsvp" || n.type == "request" -> Cover(n.eventCoverUrl, n.eventId ?: n.id, Modifier.size(48.dp).clip(thumbShape))
        }
    }
}
