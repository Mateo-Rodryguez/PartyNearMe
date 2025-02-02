package com.example.partynearme

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class NearbyUser(val id: String, val email: String, val username: String, val distance: Double?)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyScreen(navController: NavController, userId: String) {
    val nearbyUsers = remember { mutableStateListOf<NearbyUser>() }
    val coroutineScope = rememberCoroutineScope()

    // Get ApiService instance
    val context = LocalContext.current
    val apiService = RetrofitInstance.getAuthService(context)

    // Fetch nearby users from API
    LaunchedEffect(Unit) {
        coroutineScope.launch {
            val response = withContext(Dispatchers.IO) {
                apiService.getAllUsers().execute()
            }
            if (response.isSuccessful) {
                response.body()?.let { apiUsers ->
                    val sortedUsers = apiUsers.map { user ->
                        NearbyUser(
                            id = user.id,
                            email = user.email,
                            username = user.username ?: "Unknown",  // Prevents null crash
                            distance = user.distance ?: Double.MAX_VALUE
                        )
                    }.sortedBy { it.distance }
                    nearbyUsers.clear()  // Clear existing users before adding new ones
                    nearbyUsers.addAll(sortedUsers)
                }
            }

        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Nearby Users") }
            )
        },
        content = { paddingValues: PaddingValues ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
            ) {
                items(nearbyUsers) { user ->
                    Text(
                        text = user.email,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                navController.navigate("messages/$userId/${user.id}")
                            }
                            .padding(16.dp)
                    )
                }
            }
        }
    )
}
@Preview(showBackground = true)
@Composable
fun NearbyScreenPreview() {
    val navController = rememberNavController()
    NearbyScreen(navController, "sampleUserId")
}
