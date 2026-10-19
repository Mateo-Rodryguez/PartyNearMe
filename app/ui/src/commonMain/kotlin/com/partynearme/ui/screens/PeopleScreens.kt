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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.ListedPerson
import com.partynearme.core.model.RelationshipStatus
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Finding people by username or name, as you type. */
@Composable
fun SearchScreen(ui: Ui, initialQuery: String = "") {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf(initialQuery) }
    val results = remember { mutableStateListOf<ListedPerson>() }
    var searched by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { if (initialQuery.isEmpty()) focus.requestFocus() }
    LaunchedEffect(query) {
        val text = query.trim()
        if (text.isEmpty()) {
            results.clear(); searched = null; error = null
            return@LaunchedEffect
        }
        delay(250) // Waits for a pause in typing instead of searching on every letter.
        attempt { ui.api.searchUsers(text) }
            .onSuccess { results.clear(); results.addAll(it); error = null }
            .onFailure { error = it.userMessage }
        searched = text
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(start = 12.dp, end = 16.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Back") { ui.nav.back() }
            PartyField(
                query,
                { query = it.take(60) },
                "Search people",
                Modifier.padding(start = 12.dp).focusRequester(focus),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                trailing = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Close, "Clear") }
                    } else {
                        Icon(Icons.Filled.Search, null)
                    }
                },
            )
        }
        when {
            query.isBlank() -> EmptyState(
                Icons.Filled.Search,
                "Find your people",
                body = "Search by username or name to follow friends, hosts and DJs.",
            )
            error != null && results.isEmpty() -> Message(error!!, null)
            searched != null && results.isEmpty() -> EmptyState(
                Icons.Filled.AccountCircle,
                "No one found",
                body = "Nobody matches \"${query.trim()}\". Check the spelling or try their name.",
            )
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                items(results, key = { it.id }) { person ->
                    PersonRow(ui, scope, person, onChange = { updated ->
                        val i = results.indexOfFirst { it.id == updated.id }
                        if (i >= 0) results[i] = updated
                    })
                }
            }
        }
    }
}

/** Someone's followers or the people they follow, with a switch between the two, like Instagram. */
@Composable
fun PeopleScreen(ui: Ui, userId: String, followers: Boolean, title: String) {
    val scope = rememberCoroutineScope()
    var showFollowers by remember { mutableStateOf(followers) }
    val paged = remember(showFollowers) {
        Paged<ListedPerson>(scope) { cursor ->
            val page = if (showFollowers) ui.api.followers(userId, cursor) else ui.api.following(userId, cursor)
            page.users to page.nextCursor
        }
    }
    LaunchedEffect(paged) { paged.refresh() }
    val list = rememberLazyListState()
    val nearEnd by remember(paged) {
        derivedStateOf { (list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= list.layoutInfo.totalItemsCount - 5 }
    }
    LaunchedEffect(nearEnd, paged) { if (nearEnd && paged.loadedOnce) paged.loadMore() }

    Column(Modifier.fillMaxSize()) {
        BackBar(ui, title)
        Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ChoiceChip("Followers", showFollowers, { showFollowers = true })
            ChoiceChip("Following", !showFollowers, { showFollowers = false })
        }
        when {
            !paged.loadedOnce -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            paged.items.isEmpty() && paged.error != null -> Message(paged.error!!) { paged.refresh() }
            paged.items.isEmpty() -> EmptyState(
                Icons.Filled.AccountCircle,
                if (showFollowers) "No followers yet" else "Not following anyone yet",
                body = if (showFollowers) "People who follow show up here." else "People they follow show up here.",
            )
            else -> LazyColumn(state = list, modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                items(paged.items, key = { it.id }) { person ->
                    PersonRow(ui, scope, person, onChange = { updated -> paged.update { if (it.id == updated.id) updated else it } })
                }
                if (paged.error != null) item { Message(paged.error!!) { paged.retry() } }
            }
        }
    }
}

/** People you blocked, each with an Unblock button. */
@Composable
fun BlockedScreen(ui: Ui) {
    val scope = rememberCoroutineScope()
    val people = remember { mutableStateListOf<ListedPerson>() }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        attempt { ui.api.blockedUsers() }.onSuccess { people.addAll(it) }.onFailure { error = it.userMessage }
        loaded = true
    }
    Column(Modifier.fillMaxSize()) {
        BackBar(ui, "Blocked accounts")
        when {
            !loaded -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            error != null -> Message(error!!, null)
            people.isEmpty() -> EmptyState(
                PartyIcons.Block,
                "No one blocked",
                body = "People you block can't see your posts or message you. They show up here so you can undo it.",
            )
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                items(people, key = { it.id }) { person ->
                    PersonRow(ui, scope, person, action = {
                        SecondaryButton("Unblock", {
                            scope.launch {
                                attempt { ui.api.unblock(person.id) }
                                    .onSuccess { people.remove(person); ui.toast("Unblocked ${person.name}") }
                                    .onFailure { ui.toast(it.userMessage) }
                            }
                        }, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp))
                    })
                }
            }
        }
    }
}

/**
 * One person in a list: picture, name with their heart, username, and a Follow
 * button (or a custom [action]). Tapping the row opens their profile.
 */
@Composable
fun PersonRow(
    ui: Ui,
    scope: CoroutineScope,
    person: ListedPerson,
    onChange: (ListedPerson) -> Unit = {},
    action: (@Composable () -> Unit)? = null,
) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { ui.nav.open(Route.User(person.id)) }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(person.avatarUrl, person.name, 52.dp)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(person.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false))
                RelationshipHeart(RelationshipStatus.of(person.relationshipStatus), 16.dp)
            }
            person.username?.let {
                Text("@$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        when {
            action != null -> action()
            person.id == ui.myId -> Unit
            else -> {
                val toggle = {
                    val now = !person.isFollowing
                    onChange(person.copy(isFollowing = now))
                    scope.launch {
                        attempt { if (now) ui.api.follow(person.id) else ui.api.unfollow(person.id) }
                            .onFailure { onChange(person); ui.toast(it.userMessage) }
                    }
                    Unit
                }
                val padding = PaddingValues(horizontal = 18.dp, vertical = 8.dp)
                if (person.isFollowing) {
                    SecondaryButton("Following", toggle, contentPadding = padding)
                } else {
                    PrimaryButton("Follow", toggle, compact = true)
                }
            }
        }
    }
}
