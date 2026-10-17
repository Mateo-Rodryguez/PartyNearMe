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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.api.ReportTarget
import com.partynearme.core.model.Event
import com.partynearme.core.model.LatLng
import com.partynearme.core.model.Post
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.eventTime
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

@Composable
fun EventScreen(ui: Ui, id: String) {
    val scope = rememberCoroutineScope()
    var event by remember { mutableStateOf<Event?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf(false) }
    var photos by remember { mutableStateOf<List<Post>?>(null) }
    LaunchedEffect(id) {
        attempt { ui.api.event(id) }.onSuccess { event = it }.onFailure { error = it.userMessage }
        attempt { ui.api.eventPosts(id).posts }.onSuccess { photos = it }
    }

    fun rsvp(status: String?) {
        busy = true
        scope.launch {
            attempt { ui.api.rsvp(id, status) }
                .onSuccess { event = it }
                .onFailure { ui.toast(it.userMessage) }
            busy = false
        }
    }

    Column(Modifier.verticalScroll(rememberScrollState())) {
        BackBar(ui, event?.title ?: "Party") {
            if (event != null && event?.organiser?.id != ui.myId) {
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "More") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("Report party") }, onClick = { menu = false; reporting = true })
                    }
                }
            }
        }
        val e = event
        when {
            e != null -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(eventTime(e.startsAt), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                e.endsAt?.let { Text("Until ${eventTime(it)}", style = MaterialTheme.typography.bodySmall) }
                Text(e.title, style = MaterialTheme.typography.headlineSmall)
                e.venueName?.let { Text(it, style = MaterialTheme.typography.titleSmall) }
                TextButton(onClick = { ui.nav.open(Route.User(e.organiser.id)) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Text("Hosted by ${e.organiser.name}")
                }
                Text("${e.goingCount} going · ${e.interestedCount} interested")
                if (e.status == "cancelled") Text("This party was cancelled.", color = MaterialTheme.colorScheme.error)
                if (e.status == "published") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (e.myRsvp == "going") {
                            FilledTonalButton(onClick = { rsvp(null) }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("Going ✓") }
                        } else {
                            Button(onClick = { rsvp("going") }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("I'm going") }
                        }
                        if (e.myRsvp == "interested") {
                            FilledTonalButton(onClick = { rsvp(null) }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("Interested ✓") }
                        } else {
                            OutlinedButton(onClick = { rsvp("interested") }, enabled = !busy, modifier = Modifier.weight(1f)) { Text("Interested") }
                        }
                    }
                }
                e.description?.takeIf { it.isNotBlank() }?.let { Text(it) }
                PartyMap(
                    LatLng(e.lat, e.lng),
                    Modifier.fillMaxWidth().height(220.dp),
                )
                PartyPhotos(ui, e, photos)
            }
            error != null -> Message(error!!, null)
            else -> CircularProgressIndicator(Modifier.padding(32.dp))
        }
    }
    if (reporting) ReportDialog(ui, ReportTarget.Event, id) { reporting = false }
}

/** The photos people posted at the party, in rows of three, and a way to add yours. */
@Composable
private fun PartyPhotos(ui: Ui, event: Event, photos: List<Post>?) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("Photos", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        if (event.status == "published") {
            TextButton(onClick = { ui.nav.open(Route.NewPost(event.id, event.title)) }) { Text("Add photos") }
        }
    }
    when {
        photos == null -> Unit
        photos.isEmpty() -> Text("No photos yet. Be the first to post one.", style = MaterialTheme.typography.bodySmall)
        else -> Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            photos.chunked(3).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    row.forEach { post ->
                        Box(
                            Modifier.weight(1f).aspectRatio(1f).background(MaterialTheme.colorScheme.surfaceVariant)
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
