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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.model.LatLng
import com.partynearme.core.model.NewEvent
import com.partynearme.ui.Brand
import com.partynearme.ui.Overline
import com.partynearme.ui.PickedPhoto
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.clockTime
import com.partynearme.ui.dayLabel
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

private val DURATIONS = listOf(2, 4, 6, 8, 12)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewEventScreen(ui: Ui, pickOnMap: Boolean = false, onCreated: () -> Unit) {
    val scope = rememberCoroutineScope()
    val zone = remember { TimeZone.currentSystemDefault() }
    var title by remember { mutableStateOf("") }
    var venue by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    // Default: tonight at 21:00, or tomorrow if that's already passed.
    var start by remember {
        val now = Clock.System.now()
        val tonight = LocalDateTime(now.toLocalDateTime(zone).date, LocalTime(21, 0)).toInstant(zone)
        mutableStateOf(if (tonight > now) tonight else tonight + 24.hours)
    }
    var hours by remember { mutableIntStateOf(4) }
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    // Null means "where I am now", worked out when publishing.
    var spot by remember { mutableStateOf<LatLng?>(null) }
    var picking by remember { mutableStateOf(pickOnMap) }
    var mapStart by remember { mutableStateOf<LatLng?>(null) }
    LaunchedEffect(Unit) { mapStart = ui.location.current() }
    var error by remember { mutableStateOf<String?>(null) }
    var cover by remember { mutableStateOf<PickedPhoto?>(null) }
    val pickCover = ui.platform.rememberPhotoPicker(1) { picked -> picked.firstOrNull()?.let { cover = it } }

    if (picking) {
        MapPicker(
            start = spot ?: mapStart,
            onPicked = { spot = it; picking = false },
            onCancel = { picking = false },
        )
        return
    }
    if (pickDate) {
        val state = rememberDatePickerState(initialSelectedDateMillis = start.toLocalDateTime(zone).date.utcMillis())
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { millis ->
                        val date = Instant.fromEpochMilliseconds(millis).toLocalDateTime(TimeZone.UTC).date
                        start = LocalDateTime(date, start.toLocalDateTime(zone).time).toInstant(zone)
                    }
                    pickDate = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Cancel") } },
        ) { DatePicker(state) }
    }
    if (pickTime) {
        val current = start.toLocalDateTime(zone)
        val state = rememberTimePickerState(current.hour, current.minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { pickTime = false },
            confirmButton = {
                TextButton(onClick = {
                    start = LocalDateTime(current.date, LocalTime(state.hour, state.minute)).toInstant(zone)
                    pickTime = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickTime = false }) { Text("Cancel") } },
            text = { TimePicker(state) },
        )
    }

    fun publish() {
        busy = true
        error = null
        scope.launch {
            val here = spot ?: ui.location.current()
            if (here == null) {
                error = "Turn on location so people can find your party."
            } else {
                attempt {
                    ui.api.createEvent(
                        NewEvent(
                            title = title.trim(),
                            description = description.trim().ifEmpty { null },
                            startsAt = start.toString(),
                            endsAt = (start + hours.hours).toString(),
                            venueName = venue.trim().ifEmpty { null },
                            lat = here.lat,
                            lng = here.lng,
                            publish = true,
                        ),
                    )
                }.onSuccess { created ->
                    // The party is live either way; a cover that fails to upload can be added later.
                    cover?.let { photo ->
                        attempt { ui.api.setCover(created.id, ui.api.uploadPhoto(photo.contentType, photo.bytes)) }
                            .onFailure { ui.toast("Your party is live, but the cover didn't upload. Try again from its page.") }
                    }
                    ui.toast("Your party is live")
                    onCreated()
                    ui.nav.back()
                }.onFailure { error = it.userMessage }
            }
            busy = false
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            BackBar(ui, "New party")
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // A live preview of the card people will see, which doubles as the cover picker.
                Box(
                    Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(24.dp))
                        .background(Brand.coverFor(title.trim().ifEmpty { "New party" }))
                        .clickable(onClick = pickCover),
                ) {
                    cover?.let {
                        AsyncImage(it.bytes, contentDescription = "Cover photo", contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize())
                    }
                    Box(Modifier.fillMaxSize().background(Brand.scrim))
                    Pill(
                        if (cover == null) "Add a cover photo" else "Change cover",
                        Modifier.align(Alignment.TopEnd).padding(12.dp),
                        icon = if (cover == null) Icons.Filled.Add else Icons.Filled.Edit,
                        dark = true,
                    )
                    Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
                        Text(dayLabel(start.toString()).uppercase(), style = Overline, color = Color.White.copy(alpha = 0.85f))
                        Text(title.trim().ifEmpty { "Your party" }, style = MaterialTheme.typography.headlineSmall,
                            color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
                PartyField(title, { title = it.take(120) }, "What's the party?",
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next))
                PartyField(venue, { venue = it.take(120) }, "Venue (optional)",
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done))

                FormLabel("When")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PickerTile(Icons.Filled.DateRange, "Date", dayLabel(start.toString()), Modifier.weight(1f)) { pickDate = true }
                    PickerTile(Icons.Filled.PlayArrow, "Starts", clockTime(start.toString()), Modifier.weight(1f)) { pickTime = true }
                }
                Text("Lasts about $hours hours", style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                // Equal shares of the row, so "12h" fits on one line on narrower screens such as an iPhone's.
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DURATIONS.forEach { h -> ChoiceChip("${h}h", h == hours, { hours = h }, Modifier.weight(1f)) }
                }

                FormLabel("Where")
                InfoRow(
                    Icons.Filled.Place,
                    if (spot == null) "Where you are now" else "The spot you picked",
                    detail = if (spot == null) "Tap to pick a different spot on the map" else "Tap to change it on the map",
                    onClick = { picking = true },
                    trailing = {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                )

                FormLabel("Details")
                PartyField(description, { description = it.take(2000) }, "Dress code, tickets, what to bring (optional)",
                    singleLine = false, minLines = 3)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Spacer(Modifier.height(96.dp))
            }
        }
        Box(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, MaterialTheme.colorScheme.background)))
                .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 12.dp),
        ) {
            PrimaryButton("Publish party", ::publish, Modifier.fillMaxWidth(), enabled = title.isNotBlank() || busy, busy = busy)
        }
    }
}

@Composable
private fun FormLabel(text: String) {
    Text(text.uppercase(), style = Overline, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
}

/** A big tappable tile showing a chosen value, such as the date, that opens its picker. */
@Composable
private fun PickerTile(icon: ImageVector, label: String, value: String, modifier: Modifier, onClick: () -> Unit) {
    Row(
        modifier.clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.padding(start = 12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

private fun LocalDate.utcMillis() = LocalDateTime(this, LocalTime(0, 0)).toInstant(TimeZone.UTC).toEpochMilliseconds()
