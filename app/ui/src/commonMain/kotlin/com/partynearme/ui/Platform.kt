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

    /** Returns a function that opens the camera for one photo, or null when the phone has no camera. */
    @Composable
    fun rememberCamera(onTaken: (PickedPhoto) -> Unit): (() -> Unit)?

    @Composable
    fun rememberLocationProvider(): LocationProvider

    /**
     * Returns a function that asks for permission to show notifications if needed and
     * gives this phone's push token, or null when push isn't available or allowed.
     */
    @Composable
    fun rememberPushTokenProvider(): suspend () -> String?

    /**
     * Shows a sign-in page in an in-app browser and waits for it to send the browser to
     * a [callbackScheme]:// address, which it returns. Null if the user closed the page.
     */
    suspend fun openSignIn(url: String, callbackScheme: String): String?

    /** The platform name the server expects with a push token: "android" or "ios". */
    val pushPlatform: String
}
