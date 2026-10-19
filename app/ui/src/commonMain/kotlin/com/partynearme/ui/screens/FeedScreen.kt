package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.SingletonImageLoader
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import com.partynearme.core.api.FeedExpiredException
import com.partynearme.core.api.ReportTarget
import com.partynearme.core.model.Event
import com.partynearme.core.model.LatLng
import com.partynearme.core.model.Post
import com.partynearme.ui.Brand
import com.partynearme.ui.Overline
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Tab
import com.partynearme.ui.Ui
import com.partynearme.ui.Wordmark
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
            ui.api.feed(here?.lat, here?.lng, cursor).also { page ->
                if (cursor == null) ui.app.feedCache.save(ui.myId, page.posts)
            }.let { it.posts to it.nextCursor }
        } catch (e: FeedExpiredException) {
            // The ranked list behind this cursor is gone; pull to refresh starts a new one.
            emptyList<Post>() to null
        }
    }

    init {
        // The server can take a while to wake; the last feed shows meanwhile.
        paged.seed(ui.app.feedCache.load(ui.myId))
    }

    fun like(post: Post, liked: Boolean) = likePost(ui, scope, paged, post, liked)

    fun delete(post: Post) = deletePost(ui, scope, paged, post)

    fun save(post: Post, saved: Boolean) = savePost(ui, scope, paged, post, saved)

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

fun savePost(ui: Ui, scope: CoroutineScope, paged: Paged<Post>, post: Post, saved: Boolean) {
    paged.update { if (it.id == post.id) it.withSave(saved) else it }
    scope.launch {
        attempt { ui.api.savePost(post.id, saved) }
            .onSuccess { if (saved) ui.toast("Saved. Find it under Saved on your profile.") }
            .onFailure { error ->
                paged.update { if (it.id == post.id) it.withSave(!saved) else it }
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
fun FeedScreen(ui: Ui, state: FeedState, nearby: NearbyState) {
    val paged = state.paged
    var reporting by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { if (!paged.loadedOnce && !paged.loading) paged.refresh() }
    LaunchedEffect(Unit) {
        if (!nearby.paged.loadedOnce && !nearby.paged.loading) nearby.paged.refresh() else nearby.refreshIfRadiusChanged()
    }
    val nearEnd by remember {
        derivedStateOf {
            val info = state.list.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: 0) >= info.totalItemsCount - PREFETCH_POSTS * 2
        }
    }
    LaunchedEffect(nearEnd) { if (nearEnd && paged.loadedOnce) paged.loadMore() }
    PrefetchImages(state.list, paged.items)

    androidx.compose.foundation.layout.Column {
        Row(
            Modifier.fillMaxWidth().height(64.dp).padding(start = 20.dp, end = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Wordmark(size = 26.sp)
            Spacer(Modifier.weight(1f))
            RoundIconButton(Icons.Filled.Search, "Search people") { ui.nav.open(Route.Search()) }
            Spacer(Modifier.width(8.dp))
            Bell(ui.unreadNotifications) { ui.nav.open(Route.Notifications) }
        }
        PullToRefreshBox(
            isRefreshing = paged.loading && paged.loadedOnce && paged.items.isEmpty(),
            onRefresh = { paged.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                !paged.loadedOnce && paged.items.isEmpty() -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                paged.items.isEmpty() && paged.error != null -> Message(paged.error!!) { paged.refresh() }
                paged.items.isEmpty() -> EmptyState(
                    Icons.Filled.Home,
                    "Your feed is warming up",
                    body = "Post the first photo, or follow people to see their nights out here.",
                    action = "Find parties nearby",
                    onAction = { ui.nav.select(Tab.Nearby) },
                )
                else -> LazyColumn(state = state.list, modifier = Modifier.fillMaxSize()) {
                    if (nearby.paged.items.isNotEmpty()) {
                        item(key = "parties") { PartyRail(ui, nearby.paged.items) }
                    }
                    if (paged.saved && paged.error != null) {
                        item(key = "saved") {
                            Text(
                                "Showing the posts you saw last. ${paged.error}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                        }
                    }
                    items(paged.items, key = { it.id }) { post ->
                        TrackView(ui, post.id)
                        PostCard(
                            post = post,
                            isMine = post.author.id == ui.myId,
                            onAuthor = { ui.nav.open(Route.User(post.author.id)) },
                            onLike = { state.like(post, it) },
                            onDelete = { state.delete(post) },
                            onNotInterested = { state.notInterested(post) },
                            onReport = { reporting = post.id },
                            onEvent = { ui.nav.open(Route.Event(it)) },
                            onSave = { state.save(post, it) },
                        )
                    }
                    if (paged.error != null) {
                        item { Message(paged.error!!) { paged.retry() } }
                    }
                }
            }
        }
    }
    reporting?.let { ReportDialog(ui, ReportTarget.Post, it) { reporting = null } }
}

/** How many posts below the screen get their photos loaded early, so scrolling doesn't wait. */
private const val PREFETCH_POSTS = 3

/** Starts downloading the photos of the next few posts into the image cache. */
@Composable
private fun PrefetchImages(list: LazyListState, posts: List<Post>) {
    val context = LocalPlatformContext.current
    val last by remember { derivedStateOf { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 } }
    LaunchedEffect(last, posts.size) {
        val loader = SingletonImageLoader.get(context)
        posts.drop(last + 1).take(PREFETCH_POSTS)
            .flatMap { post -> post.media.mapNotNull { it.urlFor(1080) } }
            .forEach { url -> loader.enqueue(ImageRequest.Builder(context).data(url).build()) }
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

/** The notifications bell, top right on Home as in Instagram, with a count of new ones. */
@Composable
private fun Bell(unread: Int, onClick: () -> Unit) {
    Box {
        RoundIconButton(
            if (unread > 0) Icons.Filled.Notifications else Icons.Outlined.Notifications,
            if (unread > 0) "Notifications, $unread new" else "Notifications",
            onClick = onClick,
        )
        if (unread > 0) {
            Box(
                Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = (-2).dp)
                    .clip(CircleShape).background(Brand.gradient)
                    .border(2.dp, MaterialTheme.colorScheme.background, CircleShape)
                    .padding(horizontal = 5.dp, vertical = 1.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(if (unread > 99) "99+" else unread.toString(), color = Color.White, fontSize = 10.sp,
                    fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** Parties coming up near you as a row of rings above the feed, like Instagram stories. */
@Composable
private fun PartyRail(ui: Ui, events: List<Event>) {
    Column(Modifier.padding(bottom = 16.dp)) {
        Text(
            "HAPPENING NEAR YOU",
            style = Overline,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 20.dp, bottom = 10.dp),
        )
        LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            item(key = "new") {
                RailItem("Start one", onClick = { ui.nav.select(Tab.Nearby); ui.nav.open(Route.NewEvent()) }) {
                    Box(
                        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerHigh),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.Add, null, Modifier.size(28.dp), tint = MaterialTheme.colorScheme.onSurface) }
                }
            }
            items(events, key = { it.id }) { event ->
                RailItem(event.title, ring = true, onClick = { ui.nav.open(Route.Event(event.id)) }) {
                    Cover(event.coverUrl, event.title, Modifier.fillMaxSize())
                }
            }
        }
    }
}

@Composable
private fun RailItem(label: String, ring: Boolean = false, onClick: () -> Unit, image: @Composable () -> Unit) {
    Column(
        Modifier.width(78.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(70.dp)
                .then(if (ring) Modifier.border(2.5.dp, Brand.sunset, CircleShape) else Modifier)
                .padding(4.dp).clip(CircleShape),
        ) { image() }
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp, start = 2.dp, end = 2.dp),
        )
    }
}

/** A short note in place of a list, such as an error, with a way to try again. */
@Composable
fun Message(text: String, retry: (() -> Unit)?) {
    androidx.compose.foundation.layout.Column(
        Modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (retry != null) {
            SecondaryButton("Try again", retry, Modifier.padding(top = 16.dp), icon = Icons.Filled.Refresh)
        }
    }
}
