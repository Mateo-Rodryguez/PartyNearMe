package com.example.partynearme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.painterResource
import androidx.navigation.NavController

@Composable
fun BottomNavigationBar(navController: NavController) {
    NavigationBar {
        NavigationBarItem(
            icon = { Icon(painter = painterResource(id = R.drawable.ic_messages), contentDescription = "Messages") },
            selected = false,
            onClick = { navController.navigate("conversations") }
        )
        NavigationBarItem(
            icon = { Icon(painter = painterResource(id = R.drawable.ic_home_foreground), contentDescription = "Home") },
            selected = false,
            onClick = { navController.navigate("forYou") }
        )
        NavigationBarItem(
            icon = { Icon(painter = painterResource(id = R.drawable.ic_add), contentDescription = "New Post") },
            selected = false,
            onClick = { navController.navigate("newPost") }
        )
        NavigationBarItem(
            icon = { Icon(painter = painterResource(id = R.drawable.ic_profile), contentDescription = "Profile") },
            selected = false,
            onClick = { navController.navigate("profile") }
        )
    }
}