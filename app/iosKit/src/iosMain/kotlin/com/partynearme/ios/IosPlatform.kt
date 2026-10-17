package com.partynearme.ios

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import com.partynearme.core.model.LatLng
import com.partynearme.ui.LocationProvider
import com.partynearme.ui.PickedPhoto
import com.partynearme.ui.Platform
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.useContents
import kotlinx.cinterop.usePinned
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import platform.CoreGraphics.CGRectMake
import platform.CoreGraphics.CGSizeMake
import platform.CoreLocation.CLLocation
import platform.CoreLocation.CLLocationManager
import platform.CoreLocation.CLLocationManagerDelegateProtocol
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedAlways
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedWhenInUse
import platform.CoreLocation.kCLAuthorizationStatusNotDetermined
import platform.CoreLocation.kCLLocationAccuracyHundredMeters
import platform.Foundation.NSData
import platform.Foundation.NSDate
import platform.Foundation.timeIntervalSinceDate
import platform.Foundation.NSError
import platform.PhotosUI.PHPickerConfiguration
import platform.PhotosUI.PHPickerFilter
import platform.PhotosUI.PHPickerResult
import platform.PhotosUI.PHPickerViewController
import platform.PhotosUI.PHPickerViewControllerDelegateProtocol
import platform.UIKit.UIApplication
import platform.UIKit.UIGraphicsImageRenderer
import platform.UIKit.UIGraphicsImageRendererFormat
import platform.UIKit.UIImage
import platform.UIKit.UIImageJPEGRepresentation
import platform.UIKit.UIImagePickerController
import platform.UIKit.UIImagePickerControllerDelegateProtocol
import platform.UIKit.UIImagePickerControllerOriginalImage
import platform.UIKit.UIImagePickerControllerSourceType
import platform.UIKit.UINavigationControllerDelegateProtocol
import platform.UIKit.UIViewController
import platform.darwin.NSObject
import platform.posix.memcpy
import kotlin.coroutines.resume
import kotlin.math.max

/** Photos are shrunk to this on the phone, which keeps uploads quick on mobile data. */
private const val MAX_EDGE = 2048.0
private const val FRESH_FIX_SECONDS = 10 * 60.0

class IosPlatform : Platform {

    @Composable
    override fun rememberPhotoPicker(maxPhotos: Int, onPicked: (List<PickedPhoto>) -> Unit): () -> Unit {
        val scope = rememberCoroutineScope()
        val latest = rememberUpdatedState(onPicked)
        // The picker holds its delegate weakly, so the composition keeps it alive.
        val delegate = remember {
            PhotoPickerDelegate { results ->
                scope.launch {
                    val photos = results.take(maxPhotos.coerceAtLeast(1)).mapNotNull { load(it) }
                    if (photos.isNotEmpty()) latest.value(photos)
                }
            }
        }
        return {
            val config = PHPickerConfiguration().apply {
                selectionLimit = maxPhotos.coerceAtLeast(1).toLong()
                filter = PHPickerFilter.imagesFilter
            }
            val picker = PHPickerViewController(config)
            picker.delegate = delegate
            topViewController()?.presentViewController(picker, animated = true, completion = null)
        }
    }

    @Composable
    override fun rememberCamera(onTaken: (PickedPhoto) -> Unit): (() -> Unit)? {
        if (!UIImagePickerController.isSourceTypeAvailable(UIImagePickerControllerSourceType.UIImagePickerControllerSourceTypeCamera)) {
            return null
        }
        val scope = rememberCoroutineScope()
        val latest = rememberUpdatedState(onTaken)
        // Like the photo picker, the camera holds its delegate weakly.
        val delegate = remember {
            CameraDelegate { image ->
                scope.launch {
                    withContext(Dispatchers.Default) { runCatching { shrink(image) }.getOrNull() }?.let { latest.value(it) }
                }
            }
        }
        return {
            val camera = UIImagePickerController().apply {
                sourceType = UIImagePickerControllerSourceType.UIImagePickerControllerSourceTypeCamera
                this.delegate = delegate
            }
            topViewController()?.presentViewController(camera, animated = true, completion = null)
        }
    }

    @Composable
    override fun rememberLocationProvider(): LocationProvider = remember { LocationProvider { LocationRequest().run() } }

    // iPhone push needs an APNs key from the paid Apple Developer account; until then, none.
    @Composable
    override fun rememberPushTokenProvider(): suspend () -> String? = { null }

    override val pushPlatform = "ios"
}

private class PhotoPickerDelegate(private val onResults: (List<PHPickerResult>) -> Unit) :
    NSObject(), PHPickerViewControllerDelegateProtocol {
    override fun picker(picker: PHPickerViewController, didFinishPicking: List<*>) {
        picker.dismissViewControllerAnimated(true, completion = null)
        val results = didFinishPicking.filterIsInstance<PHPickerResult>()
        if (results.isNotEmpty()) onResults(results)
    }
}

/** Hands back the photo the camera took; iOS asks for camera permission itself the first time. */
private class CameraDelegate(private val onTaken: (UIImage) -> Unit) :
    NSObject(), UIImagePickerControllerDelegateProtocol, UINavigationControllerDelegateProtocol {
    override fun imagePickerController(picker: UIImagePickerController, didFinishPickingMediaWithInfo: Map<Any?, *>) {
        picker.dismissViewControllerAnimated(true, completion = null)
        (didFinishPickingMediaWithInfo[UIImagePickerControllerOriginalImage] as? UIImage)?.let(onTaken)
    }

    override fun imagePickerControllerDidCancel(picker: UIImagePickerController) {
        picker.dismissViewControllerAnimated(true, completion = null)
    }
}

private suspend fun load(result: PHPickerResult): PickedPhoto? {
    val data = suspendCancellableCoroutine<NSData?> { cont ->
        result.itemProvider.loadDataRepresentationForTypeIdentifier("public.image") { data, _ -> cont.resume(data) }
    } ?: return null
    return withContext(Dispatchers.Default) { runCatching { shrink(data) }.getOrNull() }
}

/** Decodes, scales down and re-encodes as JPEG (which also drops the photo's GPS metadata). */
private fun shrink(data: NSData): PickedPhoto? = UIImage.imageWithData(data)?.let { shrink(it) }

@OptIn(ExperimentalForeignApi::class)
private fun shrink(image: UIImage): PickedPhoto? {
    val (width, height) = image.size.useContents { width to height }
    val scale = minOf(1.0, MAX_EDGE / max(width, height))
    val w = (width * scale).toInt().toDouble()
    val h = (height * scale).toInt().toDouble()
    val format = UIGraphicsImageRendererFormat.defaultFormat().apply { this.scale = 1.0 }
    // Drawing also applies the photo's orientation, so the result is upright.
    val resized = UIGraphicsImageRenderer(CGSizeMake(w, h), format).imageWithActions { _ ->
        image.drawInRect(CGRectMake(0.0, 0.0, w, h))
    }
    val jpeg = UIImageJPEGRepresentation(resized, 0.85) ?: return null
    return PickedPhoto(jpeg.toByteArray(), "image/jpeg")
}

@OptIn(ExperimentalForeignApi::class)
private fun NSData.toByteArray(): ByteArray {
    val size = length.toInt()
    val out = ByteArray(size)
    if (size > 0) out.usePinned { memcpy(it.addressOf(0), bytes, length) }
    return out
}

private fun topViewController(): UIViewController? {
    @Suppress("DEPRECATION")
    var top = UIApplication.sharedApplication.keyWindow?.rootViewController
    while (top?.presentedViewController != null) top = top.presentedViewController
    return top
}

/** One "where am I" request: asks for permission if needed, then for one location fix. */
private class LocationRequest : NSObject(), CLLocationManagerDelegateProtocol {
    private val manager = CLLocationManager()
    private var onAuthorization: (() -> Unit)? = null
    private var onLocation: ((CLLocation?) -> Unit)? = null

    @OptIn(ExperimentalForeignApi::class)
    suspend fun run(): LatLng? = withContext(Dispatchers.Main) {
        manager.delegate = this@LocationRequest
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        if (manager.authorizationStatus == kCLAuthorizationStatusNotDetermined) {
            suspendCancellableCoroutine { cont ->
                onAuthorization = {
                    if (manager.authorizationStatus != kCLAuthorizationStatusNotDetermined && cont.isActive) cont.resume(Unit)
                }
                manager.requestWhenInUseAuthorization()
            }
        }
        val status = manager.authorizationStatus
        if (status != kCLAuthorizationStatusAuthorizedWhenInUse && status != kCLAuthorizationStatusAuthorizedAlways) {
            return@withContext null
        }
        val recent = manager.location?.takeIf { NSDate().timeIntervalSinceDate(it.timestamp) < FRESH_FIX_SECONDS }
        val fix = recent ?: withTimeoutOrNull(15_000) {
            suspendCancellableCoroutine { cont ->
                onLocation = { if (cont.isActive) cont.resume(it) }
                manager.requestLocation()
            }
        } ?: manager.location // Any older fix beats none.
        fix?.coordinate?.useContents { LatLng(latitude, longitude) }
    }

    override fun locationManagerDidChangeAuthorization(manager: CLLocationManager) {
        onAuthorization?.invoke()
    }

    override fun locationManager(manager: CLLocationManager, didUpdateLocations: List<*>) {
        onLocation?.invoke(didUpdateLocations.lastOrNull() as? CLLocation)
    }

    override fun locationManager(manager: CLLocationManager, didFailWithError: NSError) {
        onLocation?.invoke(null)
    }
}
