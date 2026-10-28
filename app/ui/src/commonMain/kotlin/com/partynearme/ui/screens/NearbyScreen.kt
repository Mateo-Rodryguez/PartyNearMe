package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.Event
import com.partynearme.core.model.Interest
import com.partynearme.core.model.LatLng
import com.partynearme.ui.Brand
import com.partynearme.ui.LocalAppPrefs
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.calendarTile
import com.partynearme.ui.clockTime
import com.partynearme.ui.dayLabel
import com.partynearme.ui.distance
import com.partynearme.ui.radiusLabel
import com.partynearme.ui.tonightWindow
import com.partynearme.ui.weekendWindow
import kotlinx.coroutines.CoroutineScope

/** The time filter above the Nearby list. */
enum class PartyTime(val label: String) { AnyTime("Any time"), Tonight("Tonight"), Weekend("This weekend") }

class NearbyState(private val ui: Ui, scope: CoroutineScope) {
    var noLocation by mutableStateOf(false)
        private set
    val list = LazyListState()
    /** The radius the list was loaded with, so changing it in settings reloads the list. */
    private var radiusKm = ui.prefs.current.radiusKm
    var time by mutableStateOf(PartyTime.AnyTime)
        private set
    /** Only parties of this kind (an interest id), or all of them. */
    var kind by mutableStateOf<Int?>(null)
        private set
    /** The kinds to filter by, loaded with the first page. */
    var kinds by mutableStateOf(emptyList<Interest>())
        private set
    val paged = Paged(scope) { cursor ->
        if (cursor == null) radiusKm = ui.prefs.current.radiusKm
        if (kinds.isEmpty()) attempt { ui.api.interests() }.onSuccess { kinds = it }
        val here: LatLng? = ui.location.current()
        noLocation = here == null
        if (here == null) {
            emptyList<Event>() to null
        } else {
            val window = when (time) {
                PartyTime.AnyTime -> null
                PartyTime.Tonight -> tonightWindow()
                PartyTime.Weekend -> weekendWindow()
            }
            ui.api.nearbyEvents(
                here.lat, here.lng, radiusKm = radiusKm.toDouble(), cursor = cursor,
                from = window?.first?.toString(), to = window?.second?.toString(), interestId = kind,
            ).let { it.events to it.nextCursor }
        }
    }

    /** True while a filter is on. */
    val filtered: Boolean get() = time != PartyTime.AnyTime || kind != null

    fun filter(time: PartyTime = this.time, kind: Int? = this.kind) {
        if (time == this.time && kind == this.kind) return
        this.time = time
        this.kind = kind
        paged.refresh()
    }

    fun refreshIfRadiusChanged() {
        if (paged.loadedOnce && radiusKm != ui.prefs.current.radiusKm) paged.refresh()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyScreen(ui: Ui, state: NearbyState) {
    val paged = state.paged
    LaunchedEffect(Unit) { if (!paged.loadedOnce && !paged.loading) paged.refresh() else state.refreshIfRadiusChanged() }
    val nearEnd by remember {
        derivedStateOf {
            val info = state.list.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: 0) >= info.totalItemsCount - 3
        }
    }
    LaunchedEffect(nearEnd) { if (nearEnd && paged.loadedOnce) paged.loadMore() }

    Box(Modifier.fillMaxSize()) {
        Column {
            TitleBar("Near you")
            Filters(state)
            PullToRefreshBox(
                isRefreshing = paged.loading && paged.loadedOnce && paged.items.isEmpty(),
                onRefresh = { paged.refresh() },
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    !paged.loadedOnce -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                    state.noLocation -> EmptyState(
                        Icons.Filled.LocationOn,
                        "Where are you?",
                        body = "Turn on location so we can show the parties around you.",
                        action = "Try again",
                        onAction = { paged.refresh() },
                    )
                    paged.items.isEmpty() && paged.error != null -> Message(paged.error!!) { paged.refresh() }
                    paged.items.isEmpty() && state.filtered -> EmptyState(
                        Icons.Filled.Star,
                        "Nothing matches",
                        body = "No parties like that within ${radiusLabel(ui.prefs.current.radiusKm, LocalAppPrefs.current.miles)} yet.",
                        action = "Show all parties",
                        onAction = { state.filter(PartyTime.AnyTime, null) },
                    )
                    paged.items.isEmpty() -> EmptyState(
                        Icons.Filled.Star,
                        "No parties nearby yet",
                        body = "Nothing in the next two weeks within ${radiusLabel(ui.prefs.current.radiusKm, LocalAppPrefs.current.miles)}. " +
                            "Start one and get your friends along.",
                        action = "Start a party",
                        onAction = { ui.nav.open(Route.NewEvent()) },
                    )
                    else -> LazyColumn(
                        state = state.list,
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                        contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 96.dp),
                    ) {
                        // Grouped by day, so "what's on tonight" is the first thing you see.
                        paged.items.groupBy { dayLabel(it.startsAt) }.forEach { (day, events) ->
                            item(key = "day-$day") {
                                Text(day, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
                            }
                            items(events, key = { it.id }) { event ->
                                EventCard(event) { ui.nav.open(Route.Event(event.id)) }
                            }
                        }
                    }
                }
            }
        }
        PrimaryButton(
            "New party",
            onClick = { ui.nav.open(Route.NewEvent()) },
            icon = Icons.Filled.Add,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp).shadow(12.dp, CircleShape),
        )
    }
}

/** When, then what kind: one scrolling row of chips, as event apps do it. */
@Composable
private fun Filters(state: NearbyState) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(PartyTime.entries) { t -> ChoiceChip(t.label, state.time == t, { state.filter(time = t) }) }
        if (state.kinds.isNotEmpty()) {
            item { Box(Modifier.width(1.dp).height(24.dp).background(MaterialTheme.colorScheme.outlineVariant)) }
            items(state.kinds, key = { "kind-${it.id}" }) { k ->
                ChoiceChip(k.name, state.kind == k.id, { state.filter(kind = if (state.kind == k.id) null else k.id) })
            }
        }
    }
}

/** A party as a big photo card: date tile, distance, title on the photo, and who's going below. */
@Composable
fun EventCard(event: Event, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable(onClick = onClick),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f)) {
            Cover(event.coverUrl, event.title, Modifier.fillMaxSize())
            Box(Modifier.fillMaxSize().background(Brand.scrim))
            DateTile(event.startsAt, Modifier.align(Alignment.TopStart).padding(12.dp))
            distance(event.distanceM, LocalAppPrefs.current.miles).takeIf { it.isNotEmpty() }?.let {
                Pill(it, Modifier.align(Alignment.TopEnd).padding(12.dp), icon = Icons.Filled.Place, dark = true)
            }
            Column(Modifier.align(Alignment.BottomStart).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                when {
                    event.status == "cancelled" -> Pill("Cancelled", dark = true)
                    event.myRsvp == "going" -> Pill("You're going", brand = true, icon = Icons.Filled.Check)
                    event.myRsvp == "interested" -> Pill("Interested", dark = true, icon = Icons.Filled.Star)
                }
                Text(event.title, style = MaterialTheme.typography.headlineSmall, color = Color.White, maxLines = 2,
                    overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(clockTime(event.startsAt), event.venueName).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.85f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FriendsGoing(event)
            Text(
                buildString {
                    append("${event.goingCount} going")
                    if (event.interestedCount > 0) append(" · ${event.interestedCount} interested")
                    append(" · Hosted by ${event.organiser.name}")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** "Sam and 2 others you follow are going", with their faces overlapping, as event apps show it. */
@Composable
fun FriendsGoing(event: Event, modifier: Modifier = Modifier) {
    val friends = event.friendsGoing
    if (friends.isEmpty()) return
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width((22 + 16 * (friends.size - 1)).dp)) {
            friends.forEachIndexed { i, friend ->
                Avatar(
                    friend.avatarUrl, friend.name, 22.dp,
                    Modifier.offset(x = (16 * i).dp).border(1.5.dp, MaterialTheme.colorScheme.surfaceContainer, CircleShape),
                )
            }
        }
        Text(
            friendsGoingText(friends.first().name, event.friendsGoingCount),
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

fun friendsGoingText(first: String, count: Int): String = when (count) {
    1 -> "$first is going"
    2 -> "$first and 1 other you follow are going"
    else -> "$first and ${count - 1} others you follow are going"
}

/** The month and day on a small white tile, like a calendar page. */
@Composable
fun DateTile(iso: String, modifier: Modifier = Modifier) {
    val (month, day) = calendarTile(iso)
    Column(
        modifier.clip(RoundedCornerShape(14.dp)).background(Color.White).padding(horizontal = 10.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(month, style = MaterialTheme.typography.labelSmall, color = Brand.Pink)
        Text(day, style = MaterialTheme.typography.titleLarge, color = Brand.Night, fontWeight = FontWeight.ExtraBold)
    }
}
