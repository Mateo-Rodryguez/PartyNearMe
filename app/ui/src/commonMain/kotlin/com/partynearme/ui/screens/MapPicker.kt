package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import com.partynearme.core.api.Place
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.LatLng
import com.partynearme.ui.Brand
import kotlinx.coroutines.launch
import kotlin.math.abs
import org.maplibre.compose.camera.CameraPosition
import org.maplibre.compose.map.MapUiOptions
import org.maplibre.compose.map.MaplibreMap
import org.maplibre.compose.map.rememberMapState
import org.maplibre.compose.style.BaseStyle
import org.maplibre.spatialk.geojson.Position

/**
 * Free OpenStreetMap-based maps (no API key, no billing account) in the quiet, low-colour
 * look of Uber's maps: pale grey streets by day, charcoal by night, so the pin stands out.
 */
private val mapStyle: BaseStyle
    @Composable get() = BaseStyle.Uri(
        if (Brand.isNight) "https://tiles.openfreemap.org/styles/dark" else "https://tiles.openfreemap.org/styles/positron",
    )

/**
 * The pin, drawn like Uber's: a round head with a hole and a thin stem whose foot marks
 * the spot. Monochrome by default, in the brand gradient for a party.
 * Its foot sits at the centre of the box it is aligned in, given offset(y = -PIN_HEIGHT / 2).
 */
@Composable
private fun Pin(modifier: Modifier = Modifier, brand: Boolean = false) {
    val ink = MaterialTheme.colorScheme.onSurface
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(PIN_HEAD).shadow(6.dp, CircleShape).clip(CircleShape)
                .background(if (brand) Brand.gradient else SolidBrush(ink)),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(PIN_HEAD / 3).clip(CircleShape).background(MaterialTheme.colorScheme.surface))
        }
        Box(Modifier.width(3.dp).height(PIN_HEIGHT - PIN_HEAD).background(if (brand) MaterialTheme.colorScheme.primary else ink))
    }
}

private val PIN_HEAD = 26.dp
private val PIN_HEIGHT = 44.dp

/** Finds places for the search box; see PlaceSearch. */
typealias FindPlaces = suspend (text: String, near: LatLng?) -> List<Place>

/**
 * Pick a spot by moving the map under a fixed pin, the way ride-hailing apps do, or
 * by searching for a place or address. Starts at [start] (usually where the phone
 * is), or shows the whole world without it. [onPicked] gets the place's name when
 * the spot came from search and the map wasn't moved after.
 */
@Composable
fun MapPicker(start: LatLng?, findPlaces: FindPlaces, onPicked: (LatLng, String?) -> Unit, onCancel: () -> Unit) {
    // A new map when the phone switches between light and dark, to load the matching style.
    key(Brand.isNight) { Picker(start, findPlaces, onPicked, onCancel) }
}

@Composable
private fun Picker(start: LatLng?, findPlaces: FindPlaces, onPicked: (LatLng, String?) -> Unit, onCancel: () -> Unit) {
    val scope = rememberCoroutineScope()
    val map = rememberMapState(
        baseStyle = mapStyle,
        initialCameraPosition = CameraPosition(
            center = Position(longitude = start?.lng ?: 0.0, latitude = start?.lat ?: 20.0),
            zoom = if (start != null) 15.0 else WORLD_ZOOM,
        ),
    )
    // The phone's location often arrives after the map opens: go there, unless the
    // user has already zoomed in somewhere themselves.
    LaunchedEffect(start) {
        if (start != null && map.cameraPosition.zoom <= WORLD_ZOOM + 0.5) {
            map.setCameraPosition(CameraPosition(center = Position(longitude = start.lng, latitude = start.lat), zoom = 15.0))
        }
    }
    Box(Modifier.fillMaxSize()) {
        MaplibreMap(modifier = Modifier.fillMaxSize(), state = map)
        // The pin's foot marks the centre of the map, with a soft shadow where it lands.
        Box(
            Modifier.align(Alignment.Center).size(width = 12.dp, height = 5.dp).clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.25f)),
        )
        Pin(Modifier.align(Alignment.Center).offset(y = -PIN_HEIGHT / 2))
        // Back and search float over the map, as in Uber.
        var chosen by remember { mutableStateOf<Place?>(null) }
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            FloatingButton(Icons.AutoMirrored.Filled.ArrowBack, "Back", onCancel)
            PlaceSearchBox(
                near = { map.cameraPosition.center.let { LatLng(it.latitude, it.longitude) } },
                findPlaces = findPlaces,
                onChosen = { place ->
                    chosen = place
                    scope.launch {
                        map.setCameraPosition(
                            CameraPosition(center = Position(longitude = place.spot.lng, latitude = place.spot.lat), zoom = 16.0),
                        )
                    }
                },
                modifier = Modifier.weight(1f),
            )
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
            if (start != null) {
                FloatingButton(
                    Icons.Filled.LocationOn,
                    "Go to where I am",
                    {
                        scope.launch {
                            map.setCameraPosition(
                                CameraPosition(center = Position(longitude = start.lng, latitude = start.lat), zoom = 15.0),
                            )
                        }
                    },
                    Modifier.align(Alignment.End).padding(end = 16.dp, bottom = 16.dp),
                )
            }
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 16.dp,
            ) {
                PickerSheet(
                    onPicked = {
                        val c = map.cameraPosition.center
                        val here = LatLng(c.latitude, c.longitude)
                        // The name only fits if the pin is still on the place (moved less than about 50 m).
                        val name = chosen?.takeIf { abs(it.spot.lat - here.lat) < 0.0005 && abs(it.spot.lng - here.lng) < 0.0007 }?.name
                        onPicked(here, name)
                    },
                    onCancel,
                )
            }
        }
    }
}

/**
 * The search box at the top of the map, with results dropping down under it.
 * Searches after a short pause in typing, so the free service gets one request, not ten.
 */
@Composable
private fun PlaceSearchBox(near: () -> LatLng, findPlaces: FindPlaces, onChosen: (Place) -> Unit, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val focus = LocalFocusManager.current
    var text by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Place>>(emptyList()) }
    var note by remember { mutableStateOf<String?>(null) }
    var picked by remember { mutableStateOf(false) }
    LaunchedEffect(text, picked) {
        note = null
        if (picked || text.trim().length < 3) {
            results = emptyList()
            return@LaunchedEffect
        }
        delay(350)
        results = try {
            findPlaces(text, near()).also { if (it.isEmpty()) note = "No places found. Try a street or a town." }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            note = "Search isn't working right now. You can still move the map."
            emptyList()
        }
    }
    fun choose(place: Place) {
        picked = true
        text = place.name
        focus.clearFocus()
        onChosen(place)
    }
    Column(modifier) {
        Surface(shape = RoundedCornerShape(24.dp), color = colors.surface, shadowElevation = 8.dp) {
            TextField(
                value = text,
                onValueChange = { text = it.take(120); picked = false },
                placeholder = { Text("Search a place or address") },
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { results.firstOrNull()?.let(::choose) }),
                modifier = Modifier.fillMaxWidth().height(48.dp + 8.dp),
                shape = RoundedCornerShape(24.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = colors.surface,
                    unfocusedContainerColor = colors.surface,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    cursorColor = colors.primary,
                ),
            )
        }
        if (results.isNotEmpty() || note != null) {
            Spacer(Modifier.height(8.dp))
            Surface(shape = RoundedCornerShape(20.dp), color = colors.surface, shadowElevation = 8.dp) {
                Column(Modifier.padding(vertical = 6.dp)) {
                    note?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
                    }
                    results.forEach { place ->
                        Row(
                            Modifier.fillMaxWidth().clickable { choose(place) }.padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.Place, null, tint = colors.onSurfaceVariant)
                            Column(Modifier.padding(start = 12.dp)) {
                                Text(place.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (place.detail.isNotEmpty()) {
                                    Text(place.detail, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** The white (or black, at night) card at the bottom, as in Uber's "Set pickup" step. */
@Composable
private fun PickerSheet(onPicked: () -> Unit, onCancel: () -> Unit) {
    Column(Modifier.padding(20.dp).navigationBarsPadding()) {
        Text("Where's the party?", style = MaterialTheme.typography.titleLarge)
        Text("Search above, or move the map so the pin sits on the spot.", style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        Row(Modifier.fillMaxWidth().padding(top = 16.dp)) {
            SecondaryButton("Cancel", onCancel, Modifier.weight(1f).height(52.dp))
            PrimaryButton("Put it here", onClick = onPicked, modifier = Modifier.weight(1f).padding(start = 10.dp))
        }
    }
}

/** A round button that floats over the map with a shadow. */
@Composable
private fun FloatingButton(icon: ImageVector, description: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        onClick = onClick,
        modifier = modifier.size(48.dp),
        shape = CircleShape,
        // At night a shadow doesn't show on the dark map, so the button is a lighter grey instead.
        color = if (Brand.isNight) MaterialTheme.colorScheme.surfaceContainerHighest else MaterialTheme.colorScheme.surface,
        shadowElevation = 8.dp,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, description, Modifier.size(22.dp), tint = MaterialTheme.colorScheme.onSurface)
        }
    }
}

private const val WORLD_ZOOM = 1.5

/**
 * A small map with the party's pin, for the event page. It ignores touches, so the page
 * scrolls freely over it. No clipping or rounded corners: Android draws maps through a
 * SurfaceView, which shows nothing when clipped.
 */
@Composable
fun PartyMap(spot: LatLng, modifier: Modifier = Modifier) {
    Box(modifier.semantics { contentDescription = "Map showing where the party is" }) {
        key(Brand.isNight) {
            val map = rememberMapState(
                baseStyle = mapStyle,
                initialCameraPosition = CameraPosition(center = Position(longitude = spot.lng, latitude = spot.lat), zoom = 15.0),
            )
            MaplibreMap(modifier = Modifier.fillMaxSize(), state = map, uiOptions = MapUiOptions.None)
        }
        Pin(Modifier.align(Alignment.Center).offset(y = -PIN_HEIGHT / 2), brand = true)
    }
}
