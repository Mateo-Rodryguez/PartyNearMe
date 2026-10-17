package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.model.NewPost
import com.partynearme.ui.PickedPhoto
import com.partynearme.ui.Tab
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.parseInstant
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days

private const val MAX_PHOTOS = 10
/** Parties you can post to: ones that started up to this long ago, or haven't started yet. */
private val RECENT_PARTY = 3.days

/** A party a post can be attached to. */
data class PartyRef(val id: String, val title: String)

/**
 * [preset] is set when the screen was opened from a party's page; the post goes to that party
 * and the screen closes afterwards. From the Post tab, people pick one of their parties or none.
 */
@Composable
fun NewPostScreen(ui: Ui, preset: PartyRef? = null, onPosted: () -> Unit) {
    val scope = rememberCoroutineScope()
    var party by remember { mutableStateOf(preset) }
    var parties by remember { mutableStateOf(emptyList<PartyRef>()) }
    var partyMenu by remember { mutableStateOf(false) }
    LaunchedEffect(preset) {
        if (preset != null) return@LaunchedEffect
        attempt {
            val cutoff = Clock.System.now() - RECENT_PARTY
            (ui.api.myEvents(organising = false) + ui.api.myEvents(organising = true))
                .filter { it.status == "published" && (parseInstant(it.startsAt) ?: cutoff) >= cutoff }
                .distinctBy { it.id }
                .sortedBy { it.startsAt }
                .map { PartyRef(it.id, it.title) }
        }.onSuccess { parties = it }
    }
    val photos = remember { mutableStateListOf<PickedPhoto>() }
    var caption by remember { mutableStateOf("") }
    var place by remember { mutableStateOf("") }
    var tagLocation by remember { mutableStateOf(true) }
    var progress by remember { mutableStateOf<Float?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val pick = ui.platform.rememberPhotoPicker(MAX_PHOTOS - photos.size) { photos.addAll(it.take(MAX_PHOTOS - photos.size)) }
    val camera = ui.platform.rememberCamera { if (photos.size < MAX_PHOTOS) photos.add(it) }

    fun share() {
        error = null
        progress = 0f
        scope.launch {
            attempt {
                val ids = photos.mapIndexed { i, photo ->
                    val ticket = ui.api.requestUpload(photo.contentType, photo.bytes.size.toLong())
                    ui.api.upload(ticket, photo.bytes)
                    progress = (i + 1f) / (photos.size + 1)
                    ticket.uploadId
                }
                val here = if (tagLocation) ui.location.current() else null
                ui.api.createPost(
                    NewPost(
                        uploadIds = ids,
                        caption = caption.trim().ifEmpty { null },
                        eventId = party?.id,
                        lat = here?.lat,
                        lng = here?.lng,
                        placeName = place.trim().ifEmpty { null },
                    ),
                )
            }.onSuccess {
                photos.clear()
                caption = ""
                place = ""
                ui.toast("Posted. It shows up for everyone once the photo is checked.")
                onPosted()
                if (preset != null) ui.nav.back() else { party = null; ui.nav.select(Tab.Feed) }
            }.onFailure { error = it.userMessage }
            progress = null
        }
    }

    Column(Modifier.verticalScroll(rememberScrollState())) {
        if (preset != null) BackBar(ui, "Add photos") else TitleBar("New post")
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (photos.isEmpty()) {
                Button(onClick = pick, modifier = Modifier.fillMaxWidth()) { Text("Choose photos") }
                camera?.let { OutlinedButton(onClick = it, modifier = Modifier.fillMaxWidth()) { Text("Take a photo") } }
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    itemsIndexed(photos) { index, photo ->
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            AsyncImage(
                                model = photo.bytes,
                                contentDescription = "Photo ${index + 1}",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(120.dp).clip(RoundedCornerShape(8.dp)),
                            )
                            TextButton(onClick = { photos.removeAt(index) }, enabled = progress == null) { Text("Remove") }
                        }
                    }
                }
                if (photos.size < MAX_PHOTOS) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = pick, enabled = progress == null) { Text("Add more") }
                        camera?.let { OutlinedButton(onClick = it, enabled = progress == null) { Text("Take a photo") } }
                    }
                }
            }
            OutlinedTextField(caption, { caption = it.take(2200) }, label = { Text("Write a caption") },
                minLines = 2, modifier = Modifier.fillMaxWidth())
            if (preset != null) {
                Text("At ${preset.title}", style = MaterialTheme.typography.titleSmall)
            } else if (parties.isNotEmpty()) {
                Box {
                    OutlinedButton(onClick = { partyMenu = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(party?.let { "At ${it.title}" } ?: "Add to a party (optional)")
                    }
                    DropdownMenu(expanded = partyMenu, onDismissRequest = { partyMenu = false }) {
                        DropdownMenuItem(text = { Text("No party") }, onClick = { party = null; partyMenu = false })
                        parties.forEach { p ->
                            DropdownMenuItem(text = { Text(p.title) }, onClick = { party = p; partyMenu = false })
                        }
                    }
                }
            }
            OutlinedTextField(place, { place = it.take(120) }, label = { Text("Place name (optional)") },
                singleLine = true, modifier = Modifier.fillMaxWidth())
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Show it to people nearby", Modifier.weight(1f))
                Switch(tagLocation, { tagLocation = it })
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            progress?.let { LinearProgressIndicator(progress = { it }, modifier = Modifier.fillMaxWidth()) }
            Button(onClick = ::share, enabled = photos.isNotEmpty() && progress == null, modifier = Modifier.fillMaxWidth()) {
                Text(if (progress != null) "Sharing…" else "Share")
            }
        }
    }
}
