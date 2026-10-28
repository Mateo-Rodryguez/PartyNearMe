package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.ListedPerson
import com.partynearme.ui.Brand
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Picks people: the ones you follow first, or anyone by searching. Used to invite
 * people to a party and to tag them in photos. [busy] shows on the button while
 * the caller sends.
 */
@Composable
fun PeoplePicker(
    ui: Ui,
    title: String,
    button: String,
    initial: List<ListedPerson> = emptyList(),
    max: Int = 20,
    busy: Boolean = false,
    onBack: () -> Unit,
    onDone: (List<ListedPerson>) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val following = remember { mutableStateListOf<ListedPerson>() }
    val results = remember { mutableStateListOf<ListedPerson>() }
    var loaded by remember { mutableStateOf(false) }
    val picked = remember { mutableStateListOf<ListedPerson>().apply { addAll(initial) } }
    LaunchedEffect(Unit) {
        attempt { ui.api.following(ui.myId).users }.onSuccess { following.addAll(it) }
        loaded = true
    }
    LaunchedEffect(query) {
        val text = query.trim()
        if (text.isEmpty()) {
            results.clear()
            return@LaunchedEffect
        }
        delay(250)
        attempt { ui.api.searchUsers(text) }.onSuccess { results.clear(); results.addAll(it) }
    }
    val shown = if (query.isBlank()) following else results

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            RoundIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Back", onClick = onBack)
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).padding(horizontal = 12.dp))
        }
        PartyField(
            query,
            { query = it.take(60) },
            "Search people",
            Modifier.padding(horizontal = 16.dp),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            trailing = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Close, "Clear") }
                } else {
                    Icon(Icons.Filled.Search, null)
                }
            },
        )
        Box(Modifier.weight(1f)) {
            when {
                !loaded -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                shown.isEmpty() && query.isBlank() -> EmptyState(
                    Icons.Filled.AccountCircle,
                    "Search for people",
                    body = "Follow people to see them here, or search by name or username.",
                )
                shown.isEmpty() -> Message("Nobody matches \"${query.trim()}\".", null)
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                    items(shown.filter { it.id != ui.myId }, key = { it.id }) { person ->
                        val chosen = picked.any { it.id == person.id }
                        PickRow(person, chosen) {
                            if (chosen) picked.removeAll { it.id == person.id } else if (picked.size < max) picked.add(person)
                        }
                    }
                }
            }
        }
        PrimaryButton(
            if (picked.isEmpty()) button else "$button (${picked.size})",
            { onDone(picked.toList()) },
            Modifier.fillMaxWidth().padding(16.dp),
            enabled = (picked.isNotEmpty() || initial.isNotEmpty()) && !busy,
            busy = busy,
        )
    }
}

@Composable
private fun PickRow(person: ListedPerson, chosen: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(vertical = 8.dp),
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
        Box(
            Modifier.size(28.dp).clip(CircleShape)
                .background(if (chosen) Brand.gradient else SolidBrush(MaterialTheme.colorScheme.surfaceContainerHigh)),
            contentAlignment = Alignment.Center,
        ) {
            if (chosen) Icon(Icons.Filled.Check, "Picked", Modifier.size(18.dp), tint = Color.White)
        }
    }
}

/** Invites people to a party: each one gets a message in their chat with you that opens it. */
@Composable
fun InviteScreen(ui: Ui, eventId: String, eventTitle: String) {
    val scope = rememberCoroutineScope()
    var sending by remember { mutableStateOf(false) }
    PeoplePicker(
        ui,
        title = "Invite to $eventTitle",
        button = "Send invites",
        busy = sending,
        onBack = { ui.nav.back() },
    ) { people ->
        sending = true
        scope.launch {
            attempt { ui.api.invite(eventId, people.map { it.id }) }
                .onSuccess {
                    ui.toast(inviteResultText(it.sent, it.skipped))
                    if (it.sent > 0) ui.nav.back()
                }
                .onFailure { ui.toast(it.userMessage) }
            sending = false
        }
    }
}

internal fun inviteResultText(sent: Int, skipped: Int): String {
    val done = when (sent) {
        0 -> "No invites sent"
        1 -> "Invite sent"
        else -> "$sent invites sent"
    }
    return when (skipped) {
        0 -> done
        1 -> "$done. 1 person can't get messages from you."
        else -> "$done. $skipped people can't get messages from you."
    }
}
