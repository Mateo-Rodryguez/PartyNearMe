package com.partynearme.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.GuestList
import com.partynearme.core.model.Person
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

/** A private party's guest list: requests to approve or decline, then who's going. */
@Composable
fun GuestListScreen(ui: Ui, eventId: String, title: String) {
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<GuestList?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(eventId) {
        attempt { ui.api.guests(eventId) }.onSuccess { list = it }.onFailure { error = it.userMessage }
    }

    fun answer(person: Person, approve: Boolean) {
        working = person.id
        scope.launch {
            attempt { if (approve) ui.api.approveGuest(eventId, person.id) else ui.api.removeGuest(eventId, person.id) }
                .onSuccess {
                    list = list?.let { l ->
                        GuestList(
                            requested = l.requested.filter { it.id != person.id },
                            going = if (approve) l.going + person else l.going.filter { it.id != person.id },
                        )
                    }
                    if (approve) ui.toast("${person.name} is on the list")
                }
                .onFailure { ui.toast(it.userMessage) }
            working = null
        }
    }

    Column(Modifier.fillMaxSize()) {
        BackBar(ui, "Guest list")
        val l = list
        when {
            l == null && error != null -> Message(error!!, null)
            l == null -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            l.requested.isEmpty() && l.going.isEmpty() -> EmptyState(
                Icons.Filled.Person,
                "No guests yet",
                body = "People who ask to come to $title show up here for you to let in.",
            )
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                if (l.requested.isNotEmpty()) {
                    item { SectionHeader("Asking to come (${l.requested.size})", Modifier.padding(vertical = 8.dp)) }
                    items(l.requested, key = { "r" + it.id }) { person ->
                        GuestRow(ui, person) {
                            PrimaryButton("Let in", { answer(person, true) }, compact = true, busy = working == person.id)
                            IconButton(onClick = { answer(person, false) }, enabled = working == null) {
                                Icon(Icons.Filled.Close, "Decline")
                            }
                        }
                    }
                }
                if (l.going.isNotEmpty()) {
                    item { SectionHeader("Going (${l.going.size})", Modifier.padding(top = 16.dp, bottom = 8.dp)) }
                    items(l.going, key = { "g" + it.id }) { person ->
                        GuestRow(ui, person) {
                            if (person.id != ui.myId) {
                                IconButton(onClick = { answer(person, false) }, enabled = working == null) {
                                    Icon(Icons.Filled.Close, "Take off the list")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GuestRow(ui: Ui, person: Person, actions: @Composable () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { ui.nav.open(Route.User(person.id)) }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Avatar(person.avatarUrl, person.name, 48.dp)
        Column(Modifier.weight(1f)) {
            Text(person.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            person.username?.let {
                Text("@$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        actions()
    }
}
