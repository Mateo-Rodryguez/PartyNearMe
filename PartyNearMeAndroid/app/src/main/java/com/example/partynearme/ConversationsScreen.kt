package com.example.partynearme

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.res.painterResource
import androidx.navigation.NavController
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.Icon
import androidx.compose.material3.TextField
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.Button
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn (ExperimentalMaterial3Api::class)
@Composable
fun ConversationsScreen(navController: NavController, userId: String) {
    val conversations = remember { mutableStateListOf<Conversation>()}
    val coroutineScope = rememberCoroutineScope()
    var searchText by remember { mutableStateOf("")}

    //Get ApiService instance
    val context = LocalContext.current
    val apiService = RetrofitInstance.getApiService(context)

    //Fetch conversations from API
    LaunchedEffect(userId) {
        coroutineScope.launch {
            val response = withContext(Dispatchers.IO) {
                apiService.getUserConversations(userId).execute()
            }
            if (response.isSuccessful) {
                response.body()?.let { apiConversations ->
                    conversations.addAll(apiConversations)
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("Inbox")
                },
                actions = {
                    IconButton(onClick = { navController.navigate("nearby/$userId") }) {
                        Icon(painter = painterResource(id = R.drawable.ic_add), contentDescription = "New Conversation")
                    }
                }
            )
        },
        content = { paddingValues: PaddingValues ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
            ){
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ){
                    Button(
                        onClick = { navController.navigate("nearby/$userId") }){
                        Text("Nearby")
                    }
                    Button(onClick = { /* */}) {
                        Text("Requests")
                    }
                }
                TextField(
                    value = searchText,
                    onValueChange = {
                        searchText = it
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    placeholder = { Text("Search")}
                )
                LazyColumn(
                    modifier = Modifier.weight(1f)
                ){
                    items(conversations) { conversation ->
                        ConversationItem(conversation, navController)
                    }
                }

            }
        }
    )
}
@Composable
fun ConversationItem(conversation: Conversation, navController: NavController) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                navController.navigate("messages/${conversation.id}")
            }
            .padding(8.dp)
    ){
        Image(
            painter = painterResource(id = R.drawable.ic_profile),
            contentDescription = "Use Avatar",
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(48.dp)
                .padding(end = 8.dp)
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(end = 8.dp)
        ){
            Text(
                text = conversation.name,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )
            Text(
                text = conversation.lastMessage,
                color = Color.Gray,
                fontSize = 14.sp
            )
        }
    }
}
@Preview(showBackground = true)
@Composable
fun PreviewConversationsScreen() {
    ConversationsScreen(navController = NavController(LocalContext.current), userId = "1")
}
