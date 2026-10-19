package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.Event
import com.partynearme.core.model.Post
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage

/** What you bookmarked: posts as a grid, parties as cards. Only you can see it. */
@Composable
fun SavedScreen(ui: Ui) {
    val scope = rememberCoroutineScope()
    var parties by remember { mutableStateOf(false) }
    val posts = remember { Paged<Post>(scope) { c -> ui.api.savedPosts(c).let { it.posts to it.nextCursor } } }
    val events = remember { mutableStateListOf<Event>() }
    var eventsLoaded by remember { mutableStateOf(false) }
    var eventsError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { posts.refresh() }
    LaunchedEffect(parties) {
        if (parties && !eventsLoaded) {
            attempt { ui.api.savedEvents() }
                .onSuccess { events.clear(); events.addAll(it); eventsError = null }
                .onFailure { eventsError = it.userMessage }
            eventsLoaded = true
        }
    }

    Column(Modifier.fillMaxSize()) {
        BackBar(ui, "Saved")
        Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ChoiceChip("Posts", !parties, { parties = false })
            ChoiceChip("Parties", parties, { parties = true })
        }
        if (!parties) {
            PostGrid(ui, posts, empty = {
                EmptyState(
                    PartyIcons.BookmarkBorder,
                    "No saved posts yet",
                    body = "Tap the bookmark under a post to keep it here. Only you can see what you save.",
                )
            }) {
                item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.padding(top = 8.dp)) }
            }
        } else {
            when {
                !eventsLoaded -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                eventsError != null -> Message(eventsError!!, null)
                events.isEmpty() -> EmptyState(
                    PartyIcons.BookmarkBorder,
                    "No saved parties yet",
                    body = "Tap the bookmark on a party to keep it here for later.",
                )
                else -> LazyColumn(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 24.dp),
                ) {
                    items(events, key = { it.id }) { event ->
                        EventCard(event) { ui.nav.open(Route.Event(event.id)) }
                    }
                }
            }
        }
    }
}
