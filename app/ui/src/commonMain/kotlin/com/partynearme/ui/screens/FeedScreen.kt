package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.partynearme.core.api.FeedExpiredException
import com.partynearme.core.model.LatLng
import com.partynearme.core.model.Post
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.time.TimeSource

class FeedState(private val ui: Ui, private val scope: CoroutineScope) {
    private var here: LatLng? = null
    private var asked = false
    val list = LazyListState()
    val paged = Paged(scope) { cursor ->
        if (!asked) {
            asked = true
            here = ui.location.current()
        }
        try {
            ui.api.feed(here?.lat, here?.lng, cursor).let { it.posts to it.nextCursor }
        } catch (e: FeedExpiredException) {
            // The ranked list behind this cursor is gone; pull to refresh starts a new one.
            emptyList<Post>() to null
        }
    }

    fun like(post: Post, liked: Boolean) = likePost(ui, scope, paged, post, liked)

    fun delete(post: Post) = deletePost(ui, scope, paged, post)

    fun notInterested(post: Post) {
        paged.remove { it.id == post.id }
        scope.launch { ui.app.interactions.notInterested(post.id) }
        ui.toast("Got it. You'll see fewer posts like this.")
    }
}

fun likePost(ui: Ui, scope: CoroutineScope, paged: Paged<Post>, post: Post, liked: Boolean) {
    paged.update { if (it.id == post.id) it.withLike(liked) else it }
    scope.launch {
        attempt { if (liked) ui.api.like(post.id) else ui.api.unlike(post.id) }.onFailure { error ->
            paged.update { if (it.id == post.id) it.withLike(!liked) else it }
            ui.toast(error.userMessage)
        }
    }
}

fun deletePost(ui: Ui, scope: CoroutineScope, paged: Paged<Post>, post: Post) {
    scope.launch {
        attempt { ui.api.deletePost(post.id) }
            .onSuccess { paged.remove { it.id == post.id }; ui.toast("Post deleted") }
            .onFailure { ui.toast(it.userMessage) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(ui: Ui, state: FeedState) {
    val paged = state.paged
    LaunchedEffect(Unit) { if (!paged.loadedOnce && !paged.loading) paged.refresh() }
    val nearEnd by remember {
        derivedStateOf {
            val info = state.list.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: 0) >= info.totalItemsCount - 3
        }
    }
    LaunchedEffect(nearEnd) { if (nearEnd && paged.loadedOnce) paged.loadMore() }

    androidx.compose.foundation.layout.Column {
        TopAppBar(title = { Text("PartyNearMe", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary) })
        PullToRefreshBox(
            isRefreshing = paged.loading && paged.loadedOnce && paged.items.isEmpty(),
            onRefresh = { paged.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                !paged.loadedOnce -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                paged.items.isEmpty() && paged.error != null -> Message(paged.error!!) { paged.refresh() }
                paged.items.isEmpty() -> Message("Nothing here yet. Post the first photo, or follow some people.", null)
                else -> LazyColumn(state = state.list, modifier = Modifier.fillMaxSize()) {
                    items(paged.items, key = { it.id }) { post ->
                        TrackView(ui, post.id)
                        PostCard(
                            post = post,
                            isMine = post.author.id == ui.myId,
                            onAuthor = { ui.nav.open(Route.User(post.author.id)) },
                            onLike = { state.like(post, it) },
                            onDelete = { state.delete(post) },
                            onNotInterested = { state.notInterested(post) },
                        )
                    }
                    if (paged.error != null) {
                        item { Message(paged.error!!) { paged.loadMore() } }
                    }
                }
            }
        }
    }
}

/** Records that a post was on screen, and for how long, while it stays composed. */
@Composable
private fun TrackView(ui: Ui, postId: String) {
    LaunchedEffect(postId) {
        ui.app.interactions.impression(postId)
        val shown = TimeSource.Monotonic.markNow()
        try {
            awaitCancellation()
        } finally {
            withContext(NonCancellable) { ui.app.interactions.dwell(postId, shown.elapsedNow().inWholeMilliseconds) }
        }
    }
}

@Composable
fun Message(text: String, retry: (() -> Unit)?) {
    androidx.compose.foundation.layout.Column(
        Modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (retry != null) {
            Button(onClick = retry, modifier = Modifier.padding(top = 12.dp)) { Text("Try again") }
        }
    }
}
