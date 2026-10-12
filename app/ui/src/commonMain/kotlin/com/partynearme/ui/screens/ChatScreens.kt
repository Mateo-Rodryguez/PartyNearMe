package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Badge
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.Conversation
import com.partynearme.core.model.Message
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.timeAgo
import com.partynearme.ui.userMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class InboxState(ui: Ui, scope: CoroutineScope) {
    val paged = Paged<Conversation>(scope) { cursor -> ui.api.inbox(cursor).let { it.conversations to it.nextCursor } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(ui: Ui, state: InboxState) {
    val paged = state.paged
    // Always fresh when you open the tab, and again whenever a message arrives.
    LaunchedEffect(Unit) { paged.refresh() }
    LaunchedEffect(Unit) { ui.app.realtime.messages(null).collect { paged.refresh() } }
    Column {
        TitleBar("Messages")
        PullToRefreshBox(
            isRefreshing = paged.loading && paged.loadedOnce,
            onRefresh = { paged.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                !paged.loadedOnce -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                paged.items.isEmpty() && paged.error != null -> Message(paged.error!!) { paged.refresh() }
                paged.items.isEmpty() -> Message("No messages yet. Start a chat from someone's profile.", null)
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(paged.items, key = { it.id }) { c ->
                        val name = c.other?.name ?: "Deleted account"
                        Row(
                            Modifier.fillMaxWidth().clickable { ui.nav.open(Route.Chat(c.id, name)) }.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(name, fontWeight = if (c.unreadCount > 0) FontWeight.Bold else FontWeight.Normal)
                                c.lastMessage?.let {
                                    Text(
                                        (if (it.senderId == ui.myId) "You: " else "") + it.body,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                c.lastMessageAt?.let { Text(timeAgo(it), style = MaterialTheme.typography.bodySmall) }
                                if (c.unreadCount > 0) Badge { Text(c.unreadCount.toString()) }
                            }
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

/** A conversation. New messages arrive live; a slow check also catches anything missed while offline. */
@Composable
fun ChatScreen(ui: Ui, conversationId: String, title: String, onLeave: () -> Unit) {
    val scope = rememberCoroutineScope()
    val messages = remember { mutableStateListOf<Message>() } // newest first, like the API
    var hasMore by remember { mutableStateOf(false) }
    var loadingOlder by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val list = rememberLazyListState()

    fun merge(fresh: List<Message>) {
        val known = messages.map { it.id }.toSet()
        val added = fresh.filter { it.id !in known }
        if (added.isNotEmpty()) {
            messages.addAll(0, added)
            messages.sortByDescending { it.id.toLongOrNull() ?: 0L }
        }
    }

    LaunchedEffect(conversationId) {
        var first = true
        while (true) {
            attempt { ui.api.messages(conversationId) }
                .onSuccess { page ->
                    val before = messages.firstOrNull()?.id
                    merge(page.messages)
                    if (first) hasMore = page.hasMore
                    if (first || messages.firstOrNull()?.id != before) attempt { ui.api.markRead(conversationId) }
                    error = null
                    first = false
                }
                .onFailure { if (first) error = it.userMessage }
            delay(30_000)
        }
    }
    LaunchedEffect(conversationId) {
        ui.app.realtime.messages(conversationId).collect { message ->
            merge(listOf(message))
            if (message.senderId != ui.myId) attempt { ui.api.markRead(conversationId) }
        }
    }
    DisposableEffect(conversationId) { onDispose(onLeave) }

    val atOldest by remember {
        derivedStateOf { (list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= messages.size - 5 }
    }
    LaunchedEffect(atOldest, hasMore) {
        if (atOldest && hasMore && !loadingOlder && messages.isNotEmpty()) {
            loadingOlder = true
            attempt { ui.api.messages(conversationId, before = messages.last().id) }.onSuccess {
                messages.addAll(it.messages.filter { m -> messages.none { k -> k.id == m.id } })
                hasMore = it.hasMore
            }
            loadingOlder = false
        }
    }

    Column(Modifier.fillMaxSize()) {
        BackBar(ui, title)
        Box(Modifier.weight(1f)) {
            if (error != null && messages.isEmpty()) {
                Message(error!!, null)
            } else {
                LazyColumn(
                    state = list,
                    reverseLayout = true,
                    modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(messages, key = { it.id }) { m -> Bubble(m, mine = m.senderId == ui.myId) }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it.take(4000) },
                placeholder = { Text("Message…") },
                maxLines = 4,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                enabled = draft.isNotBlank() && !sending,
                onClick = {
                    val body = draft.trim()
                    sending = true
                    scope.launch {
                        attempt { ui.api.send(conversationId, body) }
                            .onSuccess { merge(listOf(it)); draft = ""; list.scrollToItem(0) }
                            .onFailure { ui.toast(it.userMessage) }
                        sending = false
                    }
                },
            ) { Icon(Icons.AutoMirrored.Filled.Send, "Send") }
        }
    }
}

@Composable
private fun Bubble(message: Message, mine: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Text(
            message.body,
            color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.widthIn(max = 300.dp)
                .background(
                    if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                    RoundedCornerShape(16.dp),
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
        )
    }
}
