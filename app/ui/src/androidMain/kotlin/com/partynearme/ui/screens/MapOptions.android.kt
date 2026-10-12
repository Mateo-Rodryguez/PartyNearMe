package com.partynearme.ui.screens

import org.maplibre.compose.map.AndroidRenderMode
import org.maplibre.compose.map.MapUiOptions

// The default SurfaceView ignores Compose clipping and draws nothing inside the
// event page's rounded card; a TextureView behaves like any other view there.
internal actual fun embeddedMapOptions() = MapUiOptions(MapUiOptions.None) { renderMode = AndroidRenderMode.Texture }
