package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.Event
import com.partynearme.core.model.LatLng
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
    LaunchedEffect(id) {
        attempt { ui.api.event(id) }.onSuccess { event = it }.onFailure { error = it.userMessage }
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
        BackBar(ui, event?.title ?: "Party")
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
                    Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(12.dp)),
                )
            }
            error != null -> Message(error!!, null)
            else -> CircularProgressIndicator(Modifier.padding(32.dp))
        }
    }
}
