package com.example.partynearme

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.example.partynearme.ui.theme.PartyNearMeTheme
import kotlinx.coroutines.launch
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PartyNearMeTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    MainContent()
                }
            }
        }
    }

    @Composable
    fun MainContent() {
        var userId by remember { mutableStateOf<String?>(null) }
        val coroutineScope = rememberCoroutineScope()

        LaunchedEffect(Unit) {
            coroutineScope.launch {
                userId = fetchUserIdFromBackend()
            }
        }

        userId?.let {
            appNavigator(userId = it)
        }
    }

    private suspend fun fetchUserIdFromBackend(): String {
        return withContext(Dispatchers.IO) {
            val apiService = RetrofitInstance.getAuthService(this@MainActivity)
            val response = apiService.getuserId().execute()
            response.body()?.id ?:"defaultUserId"
        }
    }
}

@Composable
fun appNavigator(userId: String) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = "forYou") {
        composable("loginSignup") {
            LoginSignupScreen(navController)
        }
        composable("forYou") {
            forYouScreen(navController)
        }
        composable("profile") {
            ProfileScreen(navController)
        }
        composable("newPost") {
            NewPostScreen(navController, userId)
        }
        composable("conversations") {
            ConversationsScreen(navController, userId)
        }
        composable("nearby/{userId}") { backStackEntry ->
            val userId = backStackEntry.arguments?.getString("userId") ?: return@composable
            NearbyScreen(navController, userId)
        }
        composable("messages/{userId}/{otherUserId}") { backStackEntry ->
            val userId = backStackEntry.arguments?.getString("userId") ?: return@composable
            val otherUserId = backStackEntry.arguments?.getString("otherUserId") ?: return@composable
            MessagesScreen(navController, userId, otherUserId)
        }

    }
}