package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.LatLng
import com.partynearme.core.model.NewEvent
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.eventTime
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

    Column(Modifier.verticalScroll(rememberScrollState())) {
        BackBar(ui, "New party")
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(title, { title = it.take(120) }, label = { Text("What's the party?") },
                singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(venue, { venue = it.take(120) }, label = { Text("Venue name (optional)") },
                singleLine = true, modifier = Modifier.fillMaxWidth())
            Text("Starts ${eventTime(start.toString())}", style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { pickDate = true }) { Text("Change date") }
                OutlinedButton(onClick = { pickTime = true }) { Text("Change time") }
            }
            Text("Lasts about $hours hours", style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DURATIONS.forEach { h ->
                    if (h == hours) Button(onClick = {}) { Text("${h}h") } else OutlinedButton(onClick = { hours = h }) { Text("${h}h") }
                }
            }
            OutlinedTextField(description, { description = it.take(2000) }, label = { Text("Details (optional)") },
                minLines = 3, modifier = Modifier.fillMaxWidth())
            Text(
                if (spot == null) "Where: where you are now" else "Where: the spot you picked on the map",
                style = MaterialTheme.typography.titleSmall,
            )
            OutlinedButton(onClick = { picking = true }) { Text(if (spot == null) "Pick on the map" else "Change on the map") }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                enabled = title.isNotBlank() && !busy,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
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
                            }.onSuccess {
                                ui.toast("Your party is live")
                                onCreated()
                                ui.nav.back()
                            }.onFailure { error = it.userMessage }
                        }
                        busy = false
                    }
                },
            ) { Text(if (busy) "Publishing…" else "Publish party") }
        }
    }
}

private fun LocalDate.utcMillis() = LocalDateTime(this, LocalTime(0, 0)).toInstant(TimeZone.UTC).toEpochMilliseconds()
