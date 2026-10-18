package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.model.NewPost
import com.partynearme.ui.Brand
import com.partynearme.ui.Overline
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

    val sharing = progress != null
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            if (preset != null) BackBar(ui, "Add photos") else TitleBar("New post")
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (photos.isEmpty()) {
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(24.dp))
                            .clickable(onClick = pick)
                            .padding(horizontal = 24.dp, vertical = 32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Box(
                            Modifier.size(64.dp).clip(CircleShape).background(Brand.gradient),
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.Filled.Add, null, Modifier.size(32.dp), tint = Color.White) }
                        Text("Share your night", style = MaterialTheme.typography.titleLarge)
                        Text("Add up to $MAX_PHOTOS photos.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            PrimaryButton("Choose photos", pick)
                            camera?.let { SecondaryButton("Camera", it, Modifier.height(52.dp)) }
                        }
                    }
                } else {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        itemsIndexed(photos) { index, photo ->
                            Box(Modifier.size(width = 136.dp, height = 170.dp).clip(RoundedCornerShape(18.dp))) {
                                AsyncImage(
                                    model = photo.bytes,
                                    contentDescription = "Photo ${index + 1}",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize(),
                                )
                                if (!sharing) {
                                    Box(Modifier.align(Alignment.TopEnd).padding(6.dp).size(28.dp).clip(CircleShape)
                                        .background(Color(0x99000000)).clickable { photos.removeAt(index) },
                                        contentAlignment = Alignment.Center) {
                                        Icon(Icons.Filled.Close, "Remove photo ${index + 1}", Modifier.size(16.dp), tint = Color.White)
                                    }
                                }
                            }
                        }
                        if (photos.size < MAX_PHOTOS && !sharing) {
                            item {
                                AddTile(Icons.Filled.Add, "Add more", pick)
                            }
                            camera?.let { take -> item { AddTile(Icons.Filled.Face, "Camera", take) } }
                        }
                    }
                }
                PartyField(caption, { caption = it.take(2200) }, "Write a caption…", singleLine = false, minLines = 2,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                if (preset != null) {
                    Pill("At ${preset.title}", icon = Icons.Filled.Place, brand = true)
                } else if (parties.isNotEmpty()) {
                    Text("ADD TO A PARTY", style = Overline, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        item { ChoiceChip("None", party == null, { party = null }) }
                        items(parties, key = { it.id }) { p -> ChoiceChip(p.title, party?.id == p.id, { party = p }) }
                    }
                }
                PartyField(place, { place = it.take(120) }, "Place name (optional)",
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
                InfoRow(
                    Icons.Filled.LocationOn,
                    "Show it to people nearby",
                    detail = "Adds where you are to the post",
                    onClick = { tagLocation = !tagLocation },
                    trailing = { Switch(tagLocation, { tagLocation = it }) },
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Spacer(Modifier.height(96.dp))
            }
        }
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, MaterialTheme.colorScheme.background)))
                .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            progress?.let {
                LinearProgressIndicator(progress = { it }, modifier = Modifier.fillMaxWidth().clip(CircleShape))
            }
            PrimaryButton(
                if (sharing) "Sharing…" else "Share",
                ::share,
                Modifier.fillMaxWidth(),
                enabled = photos.isNotEmpty() || sharing,
                busy = sharing,
            )
        }
    }
}

/** A tile at the end of the picked photos for adding another. */
@Composable
private fun AddTile(icon: ImageVector, label: String, onClick: () -> Unit) {
    Column(
        Modifier.size(width = 104.dp, height = 170.dp).clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer).clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurface)
        Text(label, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp))
    }
}
