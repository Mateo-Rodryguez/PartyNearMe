package com.partynearme.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.partynearme.core.api.ReportTarget
import com.partynearme.core.model.Conversation
import com.partynearme.core.model.Message
import com.partynearme.ui.Brand
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
                paged.items.isEmpty() -> EmptyState(
                    Icons.Filled.Email,
                    "No messages yet",
                    body = "Open someone's profile and tap Message to plan your next night out.",
                )
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 4.dp)) {
                    items(paged.items, key = { it.id }) { c ->
                        val party = c.party
                        val name = party?.title ?: c.other?.name ?: "Deleted account"
                        val unread = c.unreadCount > 0
                        Row(
                            Modifier.fillMaxWidth().clickable { ui.nav.open(Route.Chat(c.id, name)) }
                                .padding(horizontal = 20.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (party != null) {
                                Cover(party.coverUrl, party.id, Modifier.size(56.dp).clip(CircleShape))
                            } else {
                                Avatar(c.other?.avatarUrl, name, 56.dp, ring = unread)
                            }
                            Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                                Text(name, style = MaterialTheme.typography.titleSmall,
                                    fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold)
                                c.lastMessage?.let {
                                    Text(
                                        senderPrefix(c, it.senderId, ui.myId) + it.body +
                                            (c.lastMessageAt?.let { at -> " · ${timeAgo(at)}" } ?: ""),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal,
                                        color = if (unread) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            if (unread) {
                                Box(Modifier.size(10.dp).clip(CircleShape).background(Brand.gradient))
                            }
                        }
                    }
                }
            }
        }
    }
}

/** "You: ", or the sender's first name in a party chat, before the inbox's last message. */
private fun senderPrefix(c: Conversation, senderId: String, me: String): String = when {
    senderId == me -> "You: "
    c.party != null -> (c.members.firstOrNull { it.id == senderId }?.name ?: "Someone") + ": "
    else -> ""
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
    var reporting by remember { mutableStateOf<String?>(null) }
    // Party chats: who's in it (for names) and who you blocked (whose messages stay hidden).
    var conversation by remember { mutableStateOf<Conversation?>(null) }
    val list = rememberLazyListState()
    LaunchedEffect(conversationId) { attempt { ui.api.conversation(conversationId) }.onSuccess { conversation = it } }

    fun merge(fresh: List<Message>) {
        val known = messages.map { it.id }.toSet()
        val hidden = conversation?.hiddenSenderIds.orEmpty()
        val added = fresh.filter { it.id !in known && it.senderId !in hidden }
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
        Row(Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            RoundIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Back") { ui.nav.back() }
            Avatar(null, title, 36.dp, Modifier.padding(start = 12.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 10.dp))
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 0.5.dp)
        Box(Modifier.weight(1f)) {
            if (error != null && messages.isEmpty()) {
                Message(error!!, null)
            } else {
                LazyColumn(
                    state = list,
                    reverseLayout = true,
                    modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
                    contentPadding = PaddingValues(vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    itemsIndexed(messages, key = { _, m -> m.id }) { i, m ->
                        // In a party chat, the sender's name tops each run of their messages.
                        val group = conversation?.party != null
                        val older = messages.getOrNull(i + 1)
                        if (group && m.senderId != ui.myId && older?.senderId != m.senderId) {
                            val sender = conversation?.members?.firstOrNull { it.id == m.senderId }
                            Text(sender?.name ?: "Someone", style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 12.dp, top = 8.dp, bottom = 2.dp))
                        }
                        Bubble(
                            m,
                            mine = m.senderId == ui.myId,
                            onReport = { reporting = m.id },
                            onOpenParty = { ui.nav.open(Route.Event(it)) },
                        )
                    }
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            TextField(
                value = draft,
                onValueChange = { draft = it.take(4000) },
                placeholder = { Text("Message…") },
                maxLines = 4,
                shape = RoundedCornerShape(24.dp),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    cursorColor = MaterialTheme.colorScheme.primary,
                ),
                modifier = Modifier.weight(1f),
            )
            val canSend = draft.isNotBlank() && !sending
            Box(
                Modifier.padding(start = 8.dp, bottom = 4.dp).size(48.dp).clip(CircleShape)
                    .background(if (canSend) Brand.gradient else SolidBrush(MaterialTheme.colorScheme.surfaceContainerHigh))
                    .clickable(enabled = canSend, onClickLabel = "Send") {
                        val body = draft.trim()
                        sending = true
                        scope.launch {
                            attempt { ui.api.send(conversationId, body) }
                                .onSuccess { merge(listOf(it)); draft = ""; list.scrollToItem(0) }
                                .onFailure { ui.toast(it.userMessage) }
                            sending = false
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, "Send", Modifier.size(20.dp),
                    tint = if (canSend) Color.White else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    reporting?.let { id -> ReportDialog(ui, ReportTarget.Message, id) { reporting = null } }
}

/**
 * A message; holding down on someone else's offers to report it. A party invite
 * reads like a card and opens the party when tapped.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Bubble(message: Message, mine: Boolean, onReport: () -> Unit, onOpenParty: (String) -> Unit) {
    var menu by remember { mutableStateOf(false) }
    // Rounded bubbles with one tighter corner pointing at the sender, as in iMessage and Instagram.
    val shape = if (mine) {
        RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 20.dp, bottomEnd = 6.dp)
    } else {
        RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 6.dp, bottomEnd = 20.dp)
    }
    val ink = if (mine) Color.White else MaterialTheme.colorScheme.onSurface
    val party = message.eventId
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Box {
            Column(
                Modifier.widthIn(max = 290.dp)
                    .clip(shape)
                    .combinedClickable(
                        enabled = !mine || party != null,
                        onClick = { party?.let(onOpenParty) },
                        onLongClick = if (mine) null else ({ menu = true }),
                    )
                    .background(if (mine) Brand.gradient else SolidBrush(MaterialTheme.colorScheme.surfaceContainerHigh))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                if (party != null) {
                    Text("PARTY INVITE", color = ink.copy(alpha = 0.75f), style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold)
                }
                Text(message.body, color = ink, style = MaterialTheme.typography.bodyLarge)
                if (party != null) {
                    Text("Tap to see the party", color = ink.copy(alpha = 0.75f), style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp))
                }
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Report message") }, onClick = { menu = false; onReport() })
            }
        }
    }
}
