package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import com.partynearme.core.api.ModerationAction
import com.partynearme.core.model.ReportedItem
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.timeAgo
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

/** What a moderator can do to each kind of reported thing, with the button's label. */
private fun actionsFor(type: String): List<Pair<ModerationAction, String>> = when (type) {
    "post" -> listOf(ModerationAction.Remove to "Remove post", ModerationAction.Restore to "Put back")
    "event" -> listOf(ModerationAction.Remove to "Remove party", ModerationAction.Restore to "Put back")
    "user" -> listOf(ModerationAction.RemovePicture to "Remove picture", ModerationAction.DeleteAccount to "Delete account")
    "message" -> listOf(ModerationAction.Remove to "Delete message")
    else -> emptyList()
} + (ModerationAction.Dismiss to "Nothing wrong")

private fun kindName(type: String) = when (type) {
    "post" -> "Post"
    "event" -> "Party"
    "user" -> "Person"
    "message" -> "Message"
    else -> type
}

/** Open reports for moderators, oldest first; each decision closes the thing's reports. */
@Composable
fun ModerationScreen(ui: Ui) {
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<ReportedItem>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirming by remember { mutableStateOf<Pair<ReportedItem, Pair<ModerationAction, String>>?>(null) }

    suspend fun load() {
        attempt { ui.api.moderationQueue() }.onSuccess { items = it; error = null }.onFailure { error = it.userMessage }
    }
    LaunchedEffect(Unit) { load() }

    fun act(item: ReportedItem, action: ModerationAction, note: String?) {
        scope.launch {
            attempt { ui.api.moderate(item.targetType, item.targetId, action, note) }
                .onSuccess { items = items?.filterNot { it.targetType == item.targetType && it.targetId == item.targetId } }
                .onFailure { ui.toast(it.userMessage) }
        }
    }

    Column {
        BackBar(ui, "Reports to review")
        val list = items
        when {
            list == null && error != null -> Message(error!!) { scope.launch { load() } }
            list == null -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            list.isEmpty() -> Message("Nothing to review. New reports show up here.", null)
            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(list, key = { "${it.targetType}/${it.targetId}" }) { item ->
                    ReportCard(ui, item) { action -> confirming = item to action }
                }
            }
        }
    }

    confirming?.let { (item, action) ->
        var note by remember(item, action) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { confirming = null },
            title = { Text("${action.second}?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (action.first == ModerationAction.DeleteAccount) {
                        Text("This deletes the account and everything they posted. It can't be undone.")
                    }
                    OutlinedTextField(note, { note = it.take(500) }, label = { Text("Note for the log (optional)") })
                }
            },
            confirmButton = {
                TextButton(onClick = { confirming = null; act(item, action.first, note.trim().ifEmpty { null }) }) {
                    Text(action.second)
                }
            },
            dismissButton = { TextButton(onClick = { confirming = null }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReportCard(ui: Ui, item: ReportedItem, onAction: (Pair<ModerationAction, String>) -> Unit) {
    val preview = item.preview
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "${kindName(item.targetType)} · ${item.reportCount} report${if (item.reportCount == 1) "" else "s"} · ${timeAgo(item.firstReportedAt)}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (preview == null) {
                Text("This was deleted after it was reported.")
            } else {
                Text(preview.title, fontWeight = FontWeight.SemiBold)
                preview.status?.let { Text("Status: $it", style = MaterialTheme.typography.bodySmall) }
                preview.imageUrl?.let {
                    AsyncImage(it, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxWidth().height(220.dp).background(MaterialTheme.colorScheme.surfaceVariant))
                }
                preview.body?.takeIf { it.isNotBlank() }?.let { Text(it) }
            }
            Text("Reasons: " + item.reasons.distinct().joinToString(" · "), style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                preview?.userId?.let { userId ->
                    TextButton(onClick = { ui.nav.open(Route.User(userId)) }) { Text("View person") }
                }
                val actions = if (preview == null) actionsFor(item.targetType).takeLast(1) else actionsFor(item.targetType)
                actions.forEach { action ->
                    OutlinedButton(onClick = { onAction(action) }) { Text(action.second) }
                }
            }
        }
    }
}
