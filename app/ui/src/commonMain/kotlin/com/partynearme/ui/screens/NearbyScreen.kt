package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
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
import com.partynearme.core.model.LatLng
import com.partynearme.ui.Brand
import com.partynearme.ui.LocalAppPrefs
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.calendarTile
import com.partynearme.ui.clockTime
import com.partynearme.ui.dayLabel
import com.partynearme.ui.distance
import com.partynearme.ui.radiusLabel
import kotlinx.coroutines.CoroutineScope

class NearbyState(private val ui: Ui, scope: CoroutineScope) {
    var noLocation by mutableStateOf(false)
        private set
    val list = LazyListState()
    /** The radius the list was loaded with, so changing it in settings reloads the list. */
    private var radiusKm = ui.prefs.current.radiusKm
    val paged = Paged(scope) { cursor ->
        if (cursor == null) radiusKm = ui.prefs.current.radiusKm
        val here: LatLng? = ui.location.current()
        noLocation = here == null
        if (here == null) {
            emptyList<Event>() to null
        } else {
            ui.api.nearbyEvents(here.lat, here.lng, radiusKm = radiusKm.toDouble(), cursor = cursor).let { it.events to it.nextCursor }
        }
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
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
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
