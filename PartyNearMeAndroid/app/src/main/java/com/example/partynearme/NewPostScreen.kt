package com.example.partynearme

import android.content.pm.PackageManager
import android.location.Geocoder
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.navigation.NavController
import com.skydoves.landscapist.glide.GlideImage
import java.util.UUID
import android.Manifest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.skydoves.landscapist.glide.GlideImage
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewPostScreen(navController: NavController, userId: String) {
    var imageUri by remember { mutableStateOf<Uri?>(null) }
    var description by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("Unknown Location")}
    val context = LocalContext.current
    val fusedLocationClient: FusedLocationProviderClient = LocationServices.getFusedLocationProviderClient(context)

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        imageUri = uri
    }
    LaunchedEffect(Unit) {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            fusedLocationClient.lastLocation.addOnSuccessListener { locationResult ->
                locationResult?.let {
                    val geocoder = Geocoder(context, Locale.getDefault())
                    val addresses = geocoder.getFromLocation(it.latitude, it.longitude, 1)
                    if (addresses?.isNotEmpty() == true) {
                        val address = addresses[0]
                        location = address.postalCode ?: "Unknown Location"
                    }
                }
            }
        }
    }
    fun createPost() {
        val newPost = Post(
            id = UUID.randomUUID().toString(),
            imageUrl = imageUri.toString(),
            description = description,
            userId = userId
        )
        // Save the post to the backend or local storage
        // For simplicity, we'll just navigate back to the profile
        navController.navigate("profile")
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New Post") },
                actions = {
                    IconButton(onClick = { createPost() }) {
                        Icon(painter = painterResource(id = R.drawable.ic_send), contentDescription = "Post")
                    }
                }
            )
        },
        content = { paddingValues: PaddingValues ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Button(onClick = { imagePickerLauncher.launch("image/*") }) {
                    Text("Select Image")
                }
                Spacer(modifier = Modifier.height(16.dp))
                imageUri?.let {
                    GlideImage(
                        imageModel = it,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(300.dp)
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
                TextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Description") },
                    modifier = Modifier.fillMaxWidth().padding(8.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = { createPost() },
                    modifier = Modifier.align(Alignment.CenterHorizontally).padding(8.dp)
                ) {
                    Text("Create Post")
                }
            }
        }
    )
}

@Preview(showBackground = true)
@Composable
fun PreviewNewPostScreen() {
    NewPostScreen(navController = NavController(LocalContext.current), userId = "1")
}