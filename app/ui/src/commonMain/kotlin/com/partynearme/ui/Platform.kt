package com.partynearme.ui

import androidx.compose.runtime.Composable
import com.partynearme.core.model.LatLng

/** A photo ready to upload: already shrunk and re-encoded by the platform. */
class PickedPhoto(val bytes: ByteArray, val contentType: String)

fun interface LocationProvider {
    /** Asks for permission if needed; null when the user says no or there is no fix. */
    suspend fun current(): LatLng?
}

/** What each phone OS supplies to the shared screens. */
interface Platform {
    /** Returns a function that opens the photo picker. */
    @Composable
    fun rememberPhotoPicker(maxPhotos: Int, onPicked: (List<PickedPhoto>) -> Unit): () -> Unit

    @Composable
    fun rememberLocationProvider(): LocationProvider
}
