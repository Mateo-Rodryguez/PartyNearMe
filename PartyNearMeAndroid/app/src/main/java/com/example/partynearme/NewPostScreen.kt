package com.example.partynearme

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview as CameraPreview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.tooling.preview.Preview as UiPreview
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavController
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import coil.compose.rememberAsyncImagePainter
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import android.location.Geocoder
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewPostScreen(navController: NavController) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var selectedMedia by remember { mutableStateOf<List<Uri>>(emptyList()) }
    var lastGalleryImage by remember { mutableStateOf<Uri?>(null) }
    var caption by remember { mutableStateOf("") }
    var location by remember { mutableStateOf<String?>(null) }
    var showLocationDialog by remember { mutableStateOf(false) }

    // Fetch last image from gallery
    LaunchedEffect(Unit) {
        lastGalleryImage = getLastImageFromGallery(context)
    }

    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        selectedMedia = uris.take(10)
    }

    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    val previewView = remember { PreviewView(context) }

    LaunchedEffect(cameraProviderFuture) {
        val cameraProvider = cameraProviderFuture.get()
        val preview = CameraPreview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }
        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
        try {
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(lifecycleOwner, cameraSelector, preview)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    val takePictureLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) {
            val newImageUri = getLastImageFromGallery(context)
            if (newImageUri != null) {
                selectedMedia = selectedMedia + newImageUri
            }
        }
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.BottomCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Camera Preview
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(250.dp)
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                AndroidView(factory = { previewView })
            }

            Spacer(modifier = Modifier.height(30.dp))

            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                FloatingActionButton(
                    onClick = {
                        val photoUri = createImageUri(context)
                        takePictureLauncher.launch(photoUri)
                    },
                    containerColor = Color.White,
                    modifier = Modifier.size(64.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.CameraAlt,
                        contentDescription = "Take Picture",
                        tint = Color.Black
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Row for Gallery Button and Image Carousel
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // **Gallery Button (Shows last gallery image if available)**
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { galleryLauncher.launch("image/*") },
                    contentAlignment = Alignment.Center
                ) {
                    val galleryImage = selectedMedia.lastOrNull() ?: lastGalleryImage

                    if (galleryImage != null) {
                        Image(
                            painter = rememberAsyncImagePainter(galleryImage),
                            contentDescription = "Gallery",
                            modifier = Modifier.fillMaxSize()
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color.Gray),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("📷", color = Color.White, style = MaterialTheme.typography.headlineMedium)
                        }
                    }
                }

                Spacer(modifier = Modifier.width(8.dp))

                // Image Carousel
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(70.dp)
                ) {
                    if (selectedMedia.isEmpty()) {
                        item {
                            Text(
                                "No media selected",
                                modifier = Modifier.padding(16.dp),
                                color = Color.Gray
                            )
                        }
                    } else {
                        items(selectedMedia) { uri ->
                            Image(
                                painter = rememberAsyncImagePainter(uri),
                                contentDescription = "Selected Media",
                                modifier = Modifier
                                    .size(70.dp)
                                    .padding(4.dp)
                                    .clip(RoundedCornerShape(8.dp))
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Add a caption
            TextField(
                value = caption,
                onValueChange = { caption = it },
                placeholder = { Text("Add a caption...") },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Add location button
            Button(
                onClick = { showLocationDialog = true },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Add location")
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Display selected location
            location?.let {
                Text("Location: $it", style = MaterialTheme.typography.bodyLarge)
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Next Button
            Button(
                onClick = { navController.navigate("forYou") },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Post")
            }
        }
    }

    if (showLocationDialog) {
        LocationDialog(
            onDismiss = { showLocationDialog = false },
            onLocationSelected = { selectedLocation ->
                location = selectedLocation
                showLocationDialog = false
            }
        )
    }
}



/**
 * Helper function to get the last image from the gallery.
 */
fun getLastImageFromGallery(context: Context): Uri? {
    val projection = arrayOf(MediaStore.Images.Media._ID)
    val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

    context.contentResolver.query(
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        projection, null, null, sortOrder
    )?.use { cursor ->
        if (cursor.moveToFirst()) {
            val columnIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val imageId = cursor.getLong(columnIndex)
            return ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, imageId)
        }
    }
    return null
}

/**
 * Helper function to create a new image URI.
 */
fun createImageUri(context: Context): Uri {
    val contentValues = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "new_image_${System.currentTimeMillis()}.jpg")
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
    }
    return context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)!!
}



/**
    * Dialog composable function
 */
@Composable
fun LocationDialog(
    onDismiss: () -> Unit,
    onLocationSelected: (String) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var currentLocation by remember { mutableStateOf("Current Location") }
    val context = LocalContext.current
    val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }
    var locationPermissionGranted by remember { mutableStateOf(false) }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { isGranted: Boolean ->
            locationPermissionGranted = isGranted
        }
    )

    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        } else {
            locationPermissionGranted = true
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(text = "Select Location") },
        text = {
            Column {
                TextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search for a location...") }
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = {
                    if (locationPermissionGranted) {
                        fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                            location?.let {
                                val geocoder = Geocoder(context, Locale.getDefault())
                                val addresses = geocoder.getFromLocation(it.latitude, it.longitude, 1)
                                if (!addresses.isNullOrEmpty()) {
                                    val address = addresses[0]
                                    currentLocation = listOfNotNull(
                                        address.locality,
                                        address.adminArea,
                                        address.countryName
                                    ).joinToString(", ")
                                    onLocationSelected(currentLocation)
                                    onDismiss()
                                }
                            }
                        }
                    }
                }) {
                    Text("Use Current Location")
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                onLocationSelected(searchQuery)
                onDismiss()
            }) {
                Text("Select")
            }
        },
        dismissButton = {
            Button(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}




@UiPreview(showBackground = true)
@Composable
fun PreviewNewPostScreen() {
    NewPostScreen(navController = NavController(LocalContext.current))
}