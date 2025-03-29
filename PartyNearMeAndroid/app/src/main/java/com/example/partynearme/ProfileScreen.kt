package com.example.partynearme

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil.compose.rememberImagePainter
import androidx.navigation.NavController
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.background
import com.example.partynearme.RetrofitInstance.getApiService
import com.google.accompanist.pager.ExperimentalPagerApi
import com.google.accompanist.pager.HorizontalPager
import com.google.accompanist.pager.rememberPagerState
import kotlinx.coroutines.launch
import android.util.Log
import coil.ImageLoader
import coil.compose.rememberImagePainter
import coil.request.ImageRequest
import coil.util.CoilUtils
import okhttp3.OkHttpClient
import androidx.compose.material3.Button

@Composable
fun ProfileScreen(navController: NavController) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var posts by remember { mutableStateOf<List<Post>>(emptyList()) }
    val userId = getUserIdFromPrefs(context)

    LaunchedEffect(Unit) {
        coroutineScope.launch {
            try {
                val response = getApiService(context).getUserPosts(userId)
                Log.d("ProfileScreen", "Response: $response")
                posts = response.posts
                Log.d("ProfileScreen", "Posts loaded: ${posts.size}")
            } catch (e: Exception) {
                Log.e("ProfileScreen", "Error loading posts", e)
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        // Profile Section
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Image(
                painter = painterResource(id = R.drawable.pfp2),
                contentDescription = "Profile Image",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(Color.Gray) // Placeholder for profile image
            )
            Column {
                Text(text = "Attended: 0") // Replace with actual data
                Text(text = "Organised: 0") // Replace with actual data
            }
        }
        Spacer(modifier = Modifier.height(16.dp))

        Button(onClick = { logout(context, navController) }) {
            Text("Logout")
        }

        // Events Grid
        if (posts.isEmpty()) {
            Text(text = "No posts", modifier = Modifier.fillMaxSize(), color = Color.Gray)
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                contentPadding = PaddingValues(4.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(posts) { post ->
                    PartyItem(post)
                }
            }
        }
    }
}

@OptIn(ExperimentalPagerApi::class)
@Composable
fun PartyItem(post: Post) {
    val context = LocalContext.current
    val pagerState = rememberPagerState()
    val mediaList = post.media ?: emptyList()

    // Debug log to inspect media data
    Log.d("PartyItem", "Media list size: ${mediaList.size}, contents: $mediaList")

    if (mediaList.isEmpty()) {
        Text("No media available")
        return
    }

    HorizontalPager(
        count = mediaList.size,
        state = pagerState,
        modifier = Modifier.fillMaxWidth().aspectRatio(1f)
    ) { page ->
        Image(
            painter = rememberImagePainter(
                data = mediaList[page],
                imageLoader = ImageLoader.Builder(context)
                    .okHttpClient {
                        CustomOkHttpClient.getClient(context)
                    }
                    .build(),
                builder = {
                    crossfade(true)
                    error(R.drawable.ic_error)
                    placeholder(R.drawable.ic_placeholder)
                }
            ),
            contentDescription = post.caption,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
    }
}









@Preview(showBackground = true)
@Composable
fun PreviewProfileScreen() {
    ProfileScreen(navController = NavController(LocalContext.current))
}