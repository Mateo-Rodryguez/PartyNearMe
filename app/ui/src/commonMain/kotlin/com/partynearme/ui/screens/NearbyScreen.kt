package com.partynearme.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.Event
import com.partynearme.core.model.LatLng
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.distance
import com.partynearme.ui.eventTime
import kotlinx.coroutines.CoroutineScope

class NearbyState(private val ui: Ui, scope: CoroutineScope) {
    var noLocation by mutableStateOf(false)
        private set
    val list = LazyListState()
    val paged = Paged(scope) { cursor ->
        val here: LatLng? = ui.location.current()
        noLocation = here == null
        if (here == null) {
            emptyList<Event>() to null
        } else {
            ui.api.nearbyEvents(here.lat, here.lng, radiusKm = 25.0, cursor = cursor).let { it.events to it.nextCursor }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyScreen(ui: Ui, state: NearbyState) {
    val paged = state.paged
    LaunchedEffect(Unit) { if (!paged.loadedOnce && !paged.loading) paged.refresh() }
    val nearEnd by remember {
        derivedStateOf {
            val info = state.list.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: 0) >= info.totalItemsCount - 3
        }
    }
    LaunchedEffect(nearEnd) { if (nearEnd && paged.loadedOnce) paged.loadMore() }

    Box(Modifier.fillMaxSize()) {
        Column {
            TitleBar("Parties near you")
            PullToRefreshBox(
                isRefreshing = paged.loading && paged.loadedOnce && paged.items.isEmpty(),
                onRefresh = { paged.refresh() },
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    !paged.loadedOnce -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
                    state.noLocation -> Message("Turn on location to see parties near you.") { paged.refresh() }
                    paged.items.isEmpty() && paged.error != null -> Message(paged.error!!) { paged.refresh() }
                    paged.items.isEmpty() -> Message("No parties near you in the next two weeks. Start one!", null)
                    else -> LazyColumn(
                        state = state.list,
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp, 12.dp, 12.dp, 96.dp),
                    ) {
                        items(paged.items, key = { it.id }) { event ->
                            EventCard(event) { ui.nav.open(Route.Event(event.id)) }
                        }
                    }
                }
            }
        }
        ExtendedFloatingActionButton(
            onClick = { ui.nav.open(Route.NewEvent) },
            icon = { Icon(Icons.Filled.Add, null) },
            text = { Text("New party") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        )
    }
}

@Composable
fun EventCard(event: Event, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(eventTime(event.startsAt).uppercase(), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary)
            Text(event.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(listOfNotNull(event.venueName, distance(event.distanceM).ifEmpty { null }).joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium)
            Text(
                buildString {
                    append("${event.goingCount} going")
                    if (event.interestedCount > 0) append(" · ${event.interestedCount} interested")
                    if (event.myRsvp == "going") append(" · You're going")
                    if (event.status == "cancelled") append(" · Cancelled")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

