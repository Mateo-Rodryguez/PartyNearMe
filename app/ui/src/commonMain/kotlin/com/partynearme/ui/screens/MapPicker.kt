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

/**
 * Pick a spot by moving the map under a fixed pin, the way ride-hailing apps do.
 * Starts at [start] (usually where the phone is), or shows the whole world without it.
 */
@Composable
fun MapPicker(start: LatLng?, onPicked: (LatLng) -> Unit, onCancel: () -> Unit) {
    // A new map when the phone switches between light and dark, to load the matching style.
    key(Brand.isNight) { Picker(start, onPicked, onCancel) }
}

@Composable
private fun Picker(start: LatLng?, onPicked: (LatLng) -> Unit, onCancel: () -> Unit) {
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
        // Floating round buttons over the map, as in Uber.
        Box(Modifier.fillMaxWidth().statusBarsPadding().padding(16.dp)) {
            FloatingButton(Icons.AutoMirrored.Filled.ArrowBack, "Back", onCancel, Modifier.align(Alignment.TopStart))
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
                PickerSheet(onPicked = { val c = map.cameraPosition.center; onPicked(LatLng(c.latitude, c.longitude)) }, onCancel)
            }
        }
    }
}

/** The white (or black, at night) card at the bottom, as in Uber's "Set pickup" step. */
@Composable
private fun PickerSheet(onPicked: () -> Unit, onCancel: () -> Unit) {
    Column(Modifier.padding(20.dp).navigationBarsPadding()) {
        Text("Where's the party?", style = MaterialTheme.typography.titleLarge)
        Text("Move the map so the pin sits on the spot.", style = MaterialTheme.typography.bodyMedium,
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
