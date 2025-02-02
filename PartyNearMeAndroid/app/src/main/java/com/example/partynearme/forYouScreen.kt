package com.example.partynearme

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun forYouScreen(navController: NavController) {
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("For You") },
                actions = {
                    IconButton(onClick = { /* Handle notifications click */ }) {
                        Icon(painter = painterResource(id = R.drawable.ic_notification), contentDescription = "Notifications")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {  // Use NavigationBar instead of BottomNavigation
                NavigationBarItem(
                    icon = { Icon(painter = painterResource(id = R.drawable.ic_messages), contentDescription = "Messages") },
                    selected = false,
                    onClick = { navController.navigate("conversations") }
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

        },
        content = { paddingValues: PaddingValues ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
            ) {
                val dummyPosts = listOf(
                    PartyListing("1", "https://example.com/image1.jpg", "Party 1"),
                    PartyListing("2", "https://example.com/image2.jpg", "Party 2"),
                    PartyListing("3", "https://example.com/image3.jpg", "Party 3")
                )
                LazyColumn(
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(dummyPosts) { post ->
                        Text(
                            text = "user: ${post.title}",
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(8.dp)
                        )
                    }
                }
            }
        }
    )
}

@Preview(showBackground = true)
@Composable
fun PreviewForYouScreen() {
    forYouScreen(navController = NavController(LocalContext.current))
}