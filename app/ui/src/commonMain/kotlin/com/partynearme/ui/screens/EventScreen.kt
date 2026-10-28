package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.api.ReportTarget
import com.partynearme.core.model.Event
import com.partynearme.core.model.EventUpdate
import com.partynearme.core.model.LatLng
import com.partynearme.core.model.Post
import com.partynearme.ui.Brand
import com.partynearme.ui.LocalAppPrefs
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.clockTime
import com.partynearme.ui.dayLabel
import com.partynearme.ui.distance
import com.partynearme.ui.eventTime
import com.partynearme.ui.shareParty
import com.partynearme.ui.userMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun EventScreen(ui: Ui, id: String) {
    val scope = rememberCoroutineScope()
    var event by remember { mutableStateOf<Event?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<HostAction?>(null) }
    var photos by remember { mutableStateOf<List<Post>?>(null) }
    LaunchedEffect(id) {
        attempt { ui.api.event(id) }.onSuccess { event = it }.onFailure { error = it.userMessage }
        attempt { ui.api.eventPosts(id).posts }.onSuccess { photos = it }
    }

    val pickCover = ui.platform.rememberPhotoPicker(1) { picked ->
        val photo = picked.firstOrNull() ?: return@rememberPhotoPicker
        scope.launch {
            attempt { ui.api.setCover(id, ui.api.uploadPhoto(photo.contentType, photo.bytes)) }
                .onSuccess {
                    ui.toast("The cover shows once it's been checked")
                    delay(PICTURE_CHECK_DELAY)
                    attempt { ui.api.event(id) }.onSuccess { event = it }
                }
                .onFailure { ui.toast(it.userMessage) }
        }
    }

    fun rsvp(status: String?) {
        busy = true
        scope.launch {
            attempt { ui.api.rsvp(id, status) }
                .onSuccess { event = it; ui.track("rsvp", "status" to (status ?: "none")) }
                .onFailure { ui.toast(it.userMessage) }
            busy = false
        }
    }

    val e = event
    if (e == null) {
        Column {
            BackBar(ui, "Party")
            if (error != null) Message(error!!, null) else Box(Modifier.fillMaxWidth().padding(48.dp)) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            }
        }
        return
    }
    val mine = e.organiser.id == ui.myId
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            // The cover fills the top of the page, with the title on it, like a poster.
            Box(Modifier.fillMaxWidth().aspectRatio(1.15f)) {
                Cover(e.coverUrl, e.title, Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brand.scrim))
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    RoundIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Back", onPhoto = true) { ui.nav.back() }
                    Spacer(Modifier.weight(1f))
                    RoundIconButton(
                        if (e.savedByMe) PartyIcons.Bookmark else PartyIcons.BookmarkBorder,
                        if (e.savedByMe) "Remove from saved" else "Save party",
                        onPhoto = true,
                    ) {
                        val saved = !e.savedByMe
                        event = e.copy(savedByMe = saved)
                        scope.launch {
                            attempt { ui.api.saveEvent(id, saved) }
                                .onSuccess { if (saved) ui.toast("Saved. Find it under Saved on your profile.") }
                                .onFailure { event = event?.copy(savedByMe = !saved); ui.toast(it.userMessage) }
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    if (e.status == "published") {
                        RoundIconButton(Icons.Filled.Share, "Share party", onPhoto = true) { shareParty(ui, scope, e) }
                        Spacer(Modifier.width(8.dp))
                    }
                    Box {
                        RoundIconButton(Icons.Filled.MoreVert, "More", onPhoto = true) { menu = true }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            if (mine) {
                                DropdownMenuItem(text = { Text("Edit party") }, onClick = { menu = false; ui.nav.open(Route.EditEvent(id)) })
                                DropdownMenuItem(text = { Text("Change cover photo") }, onClick = { menu = false; pickCover() })
                                if (e.coverUrl != null) {
                                    DropdownMenuItem(text = { Text("Remove cover photo") }, onClick = {
                                        menu = false
                                        scope.launch {
                                            attempt { ui.api.removeCover(id) }
                                                .onSuccess { event = event?.copy(coverUrl = null) }
                                                .onFailure { ui.toast(it.userMessage) }
                                        }
                                    })
                                }
                                when (e.status) {
                                    "published" -> DropdownMenuItem(text = { Text("Cancel party") },
                                        onClick = { menu = false; confirm = HostAction.Cancel })
                                    "cancelled" -> DropdownMenuItem(text = { Text("Put the party back on") },
                                        onClick = { menu = false; confirm = HostAction.Restore })
                                }
                                DropdownMenuItem(
                                    text = { Text("Delete party", color = MaterialTheme.colorScheme.error) },
                                    onClick = { menu = false; confirm = HostAction.Delete },
                                )
                            } else {
                                DropdownMenuItem(text = { Text("Report party") }, onClick = { menu = false; reporting = true })
                            }
                        }
                    }
                }
                Column(Modifier.align(Alignment.BottomStart).padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (e.status == "cancelled") {
                        Pill("Cancelled", dark = true)
                    } else {
                        Pill(dayLabel(e.startsAt), brand = true)
                    }
                    Text(e.title, style = MaterialTheme.typography.headlineMedium, color = Color.White)
                }
            }
            Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                InfoRow(
                    Icons.Filled.DateRange,
                    listOfNotNull(clockTime(e.startsAt), e.endsAt?.let { clockTime(it) }).joinToString(" – "),
                    detail = eventTime(e.startsAt),
                )
                InfoRow(
                    Icons.Filled.Place,
                    e.venueName ?: "Pinned on the map",
                    detail = distance(e.distanceM, LocalAppPrefs.current.miles).ifEmpty { null },
                )
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                        .clickable { ui.nav.open(Route.User(e.organiser.id)) }.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(e.organiser.avatarUrl, e.organiser.name, 44.dp)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text("Hosted by ${e.organiser.name}", style = MaterialTheme.typography.titleSmall)
                        Text("${e.goingCount} going · ${e.interestedCount} interested", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                FriendsGoing(e, Modifier.padding(vertical = 4.dp))
                Row(Modifier.padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (e.status == "published") {
                        SecondaryButton("Invite friends", { ui.nav.open(Route.Invite(e.id, e.title)) },
                            icon = Icons.AutoMirrored.Filled.Send)
                    }
                    // The host and everyone going share a group chat.
                    e.chatId?.let { chat ->
                        SecondaryButton("Party chat", { ui.nav.open(Route.Chat(chat, e.title)) }, icon = PartyIcons.ChatBubbleOutline)
                    }
                }
                if (e.status == "cancelled") {
                    Text("This party was cancelled.", color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(vertical = 8.dp))
                }
                e.description?.takeIf { it.isNotBlank() }?.let {
                    SectionHeader("About", Modifier.padding(top = 12.dp))
                    Text(it, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.9f))
                }
                SectionHeader("Location", Modifier.padding(top = 12.dp))
            }
            PartyMap(LatLng(e.lat, e.lng), Modifier.fillMaxWidth().height(200.dp))
            Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                PartyPhotos(ui, e, photos)
            }
            // Room for the RSVP bar, so it never covers the last photos.
            Spacer(Modifier.height(if (e.status == "published") 96.dp else 16.dp))
        }
        if (e.status == "published") {
            RsvpBar(e, busy, Modifier.align(Alignment.BottomCenter), ::rsvp)
        }
    }
    if (reporting) ReportDialog(ui, ReportTarget.Event, id) { reporting = false }
    confirm?.let { action ->
        HostActionDialog(action, e, onDismiss = { confirm = null }) {
            confirm = null
            scope.launch {
                when (action) {
                    HostAction.Delete -> attempt { ui.api.deleteEvent(id) }
                        .onSuccess { ui.toast("Party deleted"); ui.nav.back() }
                        .onFailure { ui.toast(it.userMessage) }
                    else -> attempt {
                        ui.api.updateEvent(id, EventUpdate(status = if (action == HostAction.Cancel) "cancelled" else "published"))
                    }
                        .onSuccess {
                            event = it
                            ui.toast(
                                if (action == HostAction.Cancel) "Party cancelled. Guests have been told." else "Your party is back on",
                            )
                        }
                        .onFailure { ui.toast(it.userMessage) }
                }
            }
        }
    }
}

private enum class HostAction { Cancel, Restore, Delete }

/** Asks the host to confirm cancelling, restoring or deleting their party, saying what happens. */
@Composable
private fun HostActionDialog(action: HostAction, e: Event, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    val guests = e.goingCount + e.interestedCount
    val (title, body, button) = when (action) {
        HostAction.Cancel -> Triple(
            "Cancel this party?",
            (if (guests > 0) "The $guests people who RSVP'd get a notification. " else "") +
                "It comes off the map, its page says it's cancelled, and you can put it back on later.",
            "Cancel party",
        )
        HostAction.Restore -> Triple("Put the party back on?", "People can RSVP again.", "Put it back on")
        HostAction.Delete -> Triple(
            "Delete this party?",
            "It disappears for everyone, along with its RSVPs. Photos posted at it stay on people's profiles. This can't be undone.",
            "Delete",
        )
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(button, color = if (action == HostAction.Restore) Color.Unspecified else MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now") } },
    )
}

/** Going and Interested, pinned to the bottom so they're always in reach. */
@Composable
private fun RsvpBar(e: Event, busy: Boolean, modifier: Modifier, rsvp: (String?) -> Unit) {
    Row(
        modifier.fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, MaterialTheme.colorScheme.background)))
            .padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (e.myRsvp == "going") {
            SecondaryButton("You're going", { rsvp(null) }, Modifier.weight(1f).height(52.dp), enabled = !busy, icon = Icons.Filled.Check)
        } else {
            PrimaryButton("I'm going", { rsvp("going") }, Modifier.weight(1f), busy = busy)
        }
        val interested = e.myRsvp == "interested"
        SecondaryButton(
            "Interested",
            { rsvp(if (interested) null else "interested") },
            Modifier.height(52.dp),
            enabled = !busy,
            icon = if (interested) Icons.Filled.Check else Icons.Filled.Star,
        )
    }
}

/** The photos people posted at the party, in rows of three, and a way to add yours. */
@Composable
private fun PartyPhotos(ui: Ui, event: Event, photos: List<Post>?) {
    SectionHeader(
        "Photos",
        action = if (event.status == "published") "Add yours" else null,
        onAction = { ui.nav.open(Route.NewPost(event.id, event.title)) },
    )
    when {
        photos == null -> Unit
        photos.isEmpty() -> Text("No photos yet. Be the first to post one.", style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        else -> Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            photos.chunked(3).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    row.forEach { post ->
                        Box(
                            Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { ui.nav.open(Route.Post(post.id)) },
                        ) {
                            val thumb = post.media.firstOrNull()?.urlFor(320)
                            if (thumb != null) {
                                AsyncImage(thumb, contentDescription = post.caption, contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize())
                            } else {
                                Text("Checking…", Modifier.align(Alignment.Center), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                    // Keeps the last row's photos the same size as the others.
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}
