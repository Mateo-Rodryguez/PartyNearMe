package com.partynearme.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.core.content.FileProvider
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.partynearme.core.model.LatLng
import com.partynearme.ui.LocationProvider
import com.partynearme.ui.PickedPhoto
import com.partynearme.ui.Platform
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.coroutines.resume
import kotlin.math.max

/** Photos are shrunk to this on the phone, which keeps uploads quick on mobile data. */
private const val MAX_EDGE = 2048
private const val FRESH_FIX_MS = 10 * 60 * 1000L

class AndroidPlatform(private val context: Context) : Platform {

    @Composable
    override fun rememberPhotoPicker(maxPhotos: Int, onPicked: (List<PickedPhoto>) -> Unit): () -> Unit {
        val scope = rememberCoroutineScope()
        // The system picker needs a limit of at least 2 for multiple selection.
        val launcher = rememberLauncherForActivityResult(
            ActivityResultContracts.PickMultipleVisualMedia(maxPhotos.coerceAtLeast(2)),
        ) { uris ->
            if (uris.isEmpty()) return@rememberLauncherForActivityResult
            scope.launch {
                val photos = withContext(Dispatchers.IO) {
                    uris.take(maxPhotos.coerceAtLeast(1)).mapNotNull { runCatching { shrink(it) }.getOrNull() }
                }
                onPicked(photos)
            }
        }
        return { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    }

    /**
     * Opens the phone's camera app, which saves the photo to a private file this app
     * shares with it. The camera app has its own permission, so this app needs none.
     */
    @Composable
    override fun rememberCamera(onTaken: (PickedPhoto) -> Unit): (() -> Unit)? {
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) return null
        val scope = rememberCoroutineScope()
        val latest = rememberUpdatedState(onTaken)
        val target = remember {
            val file = File(context.cacheDir, "camera/photo.jpg").apply { parentFile?.mkdirs() }
            FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        }
        val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
            if (!saved) return@rememberLauncherForActivityResult
            scope.launch {
                val photo = withContext(Dispatchers.IO) { runCatching { shrink(target) }.getOrNull() }
                photo?.let { latest.value(it) }
            }
        }
        return {
            try {
                launcher.launch(target)
            } catch (_: ActivityNotFoundException) {
                // No camera app installed after all.
            }
        }
    }

    @Composable
    override fun rememberLocationProvider(): LocationProvider {
        val pending = remember { arrayOfNulls<CompletableDeferred<Boolean>>(1) }
        val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            pending[0]?.complete(result.values.any { it })
        }
        return remember(launcher) {
            LocationProvider {
                if (!hasLocationPermission()) {
                    val answer = CompletableDeferred<Boolean>()
                    pending[0] = answer
                    launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                    if (!answer.await()) return@LocationProvider null
                }
                currentLocation()?.let { LatLng(it.latitude, it.longitude) }
            }
        }
    }

    @Composable
    override fun rememberPushTokenProvider(): suspend () -> String? {
        val pending = remember { arrayOfNulls<CompletableDeferred<Boolean>>(1) }
        val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            pending[0]?.complete(granted)
        }
        return remember(launcher) {
            suspend {
                val allowed = Build.VERSION.SDK_INT < 33 ||
                    context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED ||
                    CompletableDeferred<Boolean>().also {
                        pending[0] = it
                        launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }.await()
                // No Firebase settings in this build (no google-services.json): no push.
                if (allowed && FirebaseApp.getApps(context).isNotEmpty()) {
                    runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()
                } else {
                    null
                }
            }
        }
    }

    /** Opens the page in a Custom Tab; MainActivity passes the partynearme:// address back through [AuthRedirect]. */
    override suspend fun openSignIn(url: String, callbackScheme: String): String? {
        val result = AuthRedirect.start()
        try {
            CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(url))
        } catch (_: ActivityNotFoundException) {
            AuthRedirect.abandoned()
        }
        return result.await()
    }

    override fun share(text: String, url: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "$text $url")
        val chooser = Intent.createChooser(send, null)
        if (context !is Activity) chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
    }

    override val pushPlatform = "android"

    private fun hasLocationPermission() = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        .any { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

    @SuppressLint("MissingPermission") // Checked by hasLocationPermission before this runs.
    private suspend fun currentLocation(): Location? {
        val manager = context.getSystemService(LocationManager::class.java) ?: return null
        val providers = manager.getProviders(true)
        val recent = providers.mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }
            .filter { System.currentTimeMillis() - it.time < FRESH_FIX_MS }
            .minByOrNull { it.accuracy }
        if (recent != null) return recent

        val provider = listOf("fused", LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            .firstOrNull { it in providers } ?: return null
        val fresh = withTimeoutOrNull(15_000) {
            suspendCancellableCoroutine { cont ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    val signal = android.os.CancellationSignal()
                    cont.invokeOnCancellation { signal.cancel() }
                    manager.getCurrentLocation(provider, signal, context.mainExecutor) { cont.resume(it) }
                } else {
                    val listener = object : LocationListener {
                        override fun onLocationChanged(location: Location) {
                            manager.removeUpdates(this)
                            if (cont.isActive) cont.resume(location)
                        }
                    }
                    cont.invokeOnCancellation { manager.removeUpdates(listener) }
                    manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
                }
            }
        }
        // Any older fix beats none.
        return fresh ?: providers.mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }
    }

    /** Decodes, scales down and re-encodes as JPEG (which also drops the photo's GPS metadata). */
    private fun shrink(uri: Uri): PickedPhoto {
        val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
                val scale = MAX_EDGE.toFloat() / max(info.size.width, info.size.height)
                if (scale < 1f) decoder.setTargetSize((info.size.width * scale).toInt(), (info.size.height * scale).toInt())
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE) sample *= 2
            val decoded = context.contentResolver.openInputStream(uri).use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            } ?: error("Could not read the photo")
            val scale = MAX_EDGE.toFloat() / max(decoded.width, decoded.height)
            val scaled = if (scale < 1f) {
                Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true)
            } else {
                decoded
            }
            // ImageDecoder turns photos upright by itself; BitmapFactory needs the camera's EXIF hint.
            val degrees = context.contentResolver.openInputStream(uri).use { stream ->
                when (stream?.let { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, 0) }) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            }
            if (degrees == 0) {
                scaled
            } else {
                Bitmap.createBitmap(scaled, 0, 0, scaled.width, scaled.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)
            }
        }
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
        return PickedPhoto(out.toByteArray(), "image/jpeg")
    }
}
