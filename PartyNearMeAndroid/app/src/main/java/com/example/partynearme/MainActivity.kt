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
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainContent()
                }
            }
        }
    }

    @Composable
    fun MainContent() {
        val context = this@MainActivity
        val userId = remember { getUserIdFromPrefs(context) } // Load from SharedPreferences

        appNavigator(userId)
    }
}

@Composable
fun appNavigator(userId: Int) {
    val navController = rememberNavController()
    val startDestination = if (userId > 0) "forYou" else "loginSignup" // If logged in, go to "forYou"

    NavHost(navController = navController, startDestination = startDestination) {
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
            NewPostScreen(navController)
        }
        composable("conversations") {
            ConversationsScreen(navController, userId)
        }
        composable("nearby") { backStackEntry ->
            NearbyScreen(navController)
        }
        composable("messages/{otherUserId}") { backStackEntry ->
            val otherUserId = backStackEntry.arguments?.getString("otherUserId")?.toIntOrNull() ?: return@composable
            MessagesScreen(navController, otherUserId)
        }
    }
}