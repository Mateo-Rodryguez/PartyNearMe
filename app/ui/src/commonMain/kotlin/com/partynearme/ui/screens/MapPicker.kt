package com.partynearme.ui.screens

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.partynearme.core.model.LatLng
import org.maplibre.compose.camera.CameraPosition
import org.maplibre.compose.map.MapUiOptions
import org.maplibre.compose.map.MaplibreMap
import org.maplibre.compose.map.rememberMapState
import org.maplibre.compose.style.BaseStyle
import org.maplibre.spatialk.geojson.Position

/** Free OpenStreetMap-based maps: no API key, no billing account. */
private const val MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty"

/**
 * Pick a spot by moving the map under a fixed pin, the way ride-hailing apps do.
 * Starts at [start] (usually where the phone is), or shows the whole world without it.
 */
@Composable
fun MapPicker(start: LatLng?, onPicked: (LatLng) -> Unit, onCancel: () -> Unit) {
    val map = rememberMapState(
        baseStyle = BaseStyle.Uri(MAP_STYLE),
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
        // The pin's tip marks the centre of the map.
        Icon(
            Icons.Filled.Place,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.align(Alignment.Center).size(48.dp).offset(y = (-24).dp),
        )
        Surface(
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
            color = MaterialTheme.colorScheme.surfaceContainer,
            shadowElevation = 12.dp,
        ) {
            Column(Modifier.padding(20.dp).navigationBarsPadding()) {
                Text("Where's the party?", style = MaterialTheme.typography.titleLarge)
                Text("Move the map so the pin sits on the spot.", style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                Row(Modifier.fillMaxWidth().padding(top = 16.dp)) {
                    SecondaryButton("Cancel", onCancel, Modifier.weight(1f).height(52.dp))
                    PrimaryButton(
                        "Put it here",
                        onClick = {
                            val center = map.cameraPosition.center
                            onPicked(LatLng(center.latitude, center.longitude))
                        },
                        modifier = Modifier.weight(1f).padding(start = 10.dp),
                    )
                }
            }
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
    val map = rememberMapState(
        baseStyle = BaseStyle.Uri(MAP_STYLE),
        initialCameraPosition = CameraPosition(center = Position(longitude = spot.lng, latitude = spot.lat), zoom = 15.0),
    )
    Box(modifier) {
        MaplibreMap(modifier = Modifier.fillMaxSize(), state = map, uiOptions = MapUiOptions.None)
        Icon(
            Icons.Filled.Place,
            contentDescription = "The party is here",
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.align(Alignment.Center).size(40.dp).offset(y = (-20).dp),
        )
    }
}
