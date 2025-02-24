package com.example.partynearme

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.rememberImagePainter
import com.example.partynearme.RetrofitInstance.getApiService
import kotlinx.coroutines.launch
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import com.example.partynearme.Post
import com.example.partynearme.RecommendationRequest
import com.example.partynearme.RecommendationResponse
import android.util.Log
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response
import com.google.accompanist.pager.HorizontalPager
import com.google.accompanist.pager.rememberPagerState
import androidx.compose.ui.layout.ContentScale
import coil.ImageLoader
import com.google.accompanist.pager.ExperimentalPagerApi


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun forYouScreen(navController: NavController) {
    val context = LocalContext.current
    var posts by remember { mutableStateOf<List<Post>>(emptyList()) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val userId: Int = getUserIdFromPrefs(context)

    LaunchedEffect(Unit) {
        getApiService(context).getRecommendations(RecommendationRequest(userId)).enqueue(object : Callback<List<Post>> {
            override fun onResponse(call: Call<List<Post>>, response: Response<List<Post>>) {
                if (response.isSuccessful) {
                    posts = response.body() ?: emptyList()
                    errorMessage = null
                } else {
                    errorMessage = "Error loading recommendations"
                    Log.e("forYouScreen", "Error loading recommendations: ${response.errorBody()?.string()}")
                }
            }

            override fun onFailure(call: Call<List<Post>>, t: Throwable) {
                errorMessage = "Error loading recommendations"
                Log.e("forYouScreen", "Exception loading recommendations", t)
            }
        })
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("For You")
                    }
                },
                actions = {
                    IconButton(onClick = { /* Handle notifications click */ }) {
                        Icon(painter = painterResource(id = R.drawable.ic_notification), contentDescription = "Notifications")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
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
                    .padding(paddingValues),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (errorMessage != null) {
                    Text(text = errorMessage!!, color = Color.Red)
                    Button(onClick = {
                        getApiService(context).getRecommendations(RecommendationRequest(userId)).enqueue(object : Callback<List<Post>> {
                            override fun onResponse(call: Call<List<Post>>, response: Response<List<Post>>) {
                                if (response.isSuccessful) {
                                    posts = response.body() ?: emptyList()
                                    errorMessage = null
                                } else {
                                    errorMessage = "Error loading recommendations"
                                    Log.e("forYouScreen", "Error loading recommendations: ${response.errorBody()?.string()}")
                                }
                            }

                            override fun onFailure(call: Call<List<Post>>, t: Throwable) {
                                errorMessage = "Error loading recommendations"
                                Log.e("forYouScreen", "Exception loading recommendations", t)
                            }
                        })
                    }) {
                        Text("Retry")
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(posts) { post ->
                            PostItem(post)
                        }
                    }
                }
            }
        }
    )
}

@OptIn(ExperimentalPagerApi::class)
@Composable
fun PostItem(post: Post) {
    val context = LocalContext.current

    // Create an ImageLoader with your custom OkHttpClient
    val imageLoader = ImageLoader.Builder(context)
        .okHttpClient {
            CustomOkHttpClient.getClient(context)
        }
        .build()

    Column(modifier = Modifier.padding(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(
                painter = rememberImagePainter(
                    data = post.profilePicture ?: R.drawable.pfp2,
                    imageLoader = imageLoader,
                    builder = {
                        placeholder(R.drawable.pfp2)
                        error(R.drawable.pfp2)
                    }
                ),
                contentDescription = "Profile Picture",
                modifier = Modifier.size(40.dp).clip(CircleShape)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(text = post.username, style = MaterialTheme.typography.bodyLarge)
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = post.caption, style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = "Location: ${post.location}", style = MaterialTheme.typography.bodyMedium)
        Spacer(modifier = Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = "${post.likeCount} likes", style = MaterialTheme.typography.bodyMedium)
            Spacer(modifier = Modifier.width(8.dp))
            IconButton(onClick = { /* handle like */ }) {
                Icon(
                    painter = painterResource(
                        id = if (post.isLiked) R.drawable.heart else R.drawable.heart_outline
                    ),
                    contentDescription = "Like/Unlike"
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))

        if (post.media.isNotEmpty()) {
            HorizontalPager(
                count = post.media.size,
                state = rememberPagerState(),
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
            ) { page ->
                Image(
                    painter = rememberImagePainter(
                        data = post.media[page],
                        imageLoader = imageLoader,
                        builder = {
                            crossfade(true)
                            placeholder(R.drawable.ic_placeholder)
                            error(R.drawable.ic_error)
                        }
                    ),
                    contentDescription = post.caption,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}



@Preview(showBackground = true)
@Composable
fun PreviewForYouScreen() {
    forYouScreen(navController = NavController(LocalContext.current))
}