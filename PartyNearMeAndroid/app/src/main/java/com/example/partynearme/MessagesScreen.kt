package com.example.partynearme

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collectLatest
import org.json.JSONObject

data class UIMessage(val id: Int, val userAvatar: Int, val userName: String, val lastMessage: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessagesScreen(navController: NavController, otherUserId: Int) {
    val context = LocalContext.current
    val userId = remember { getUserIdFromPrefs(context) } // Load from SharedPreferences
    val messages = remember { mutableStateListOf<UIMessage>() }
    val coroutineScope = rememberCoroutineScope()
    var newMessageText by remember { mutableStateOf("") }
    var conversationId by remember { mutableIntStateOf(-1) }
    val focusManager = LocalFocusManager.current

    val socket = remember { IO.socket("http://10.0.2.2:3000") } // Replace with actual server IP
    val newMessagesFlow = remember { MutableStateFlow<List<UIMessage>>(emptyList()) }
    val listState = rememberLazyListState()
    val apiService = RetrofitInstance.getApiService(context)

    // Function to find or create a conversation
    suspend fun findOrCreateConversation(): Int? {
        return withContext(Dispatchers.IO) {
            val request = ConversationRequest(userId, otherUserId)
            val response = apiService.findOrCreateConversation(request).execute()

            if (response.isSuccessful) {
                val responseBody = response.body()
                Log.i("findOrCreateConversation", "Response body: $responseBody")
                val conversationId = responseBody?.conversationId?.toInt()
                Log.i("findOrCreateConversation", "Successfully created or found conversation with ID: $conversationId")
                conversationId
            } else {
                Log.e("findOrCreateConversation", "API request failed: ${response.errorBody()?.string()}")
                null
            }
        }
    }

    // Connect WebSocket & Join Conversation

    DisposableEffect(otherUserId) {
        socket.connect()

        socket.on(Socket.EVENT_CONNECT) {
            Log.i("SocketIO", "Connected to the server")
        }

        socket.on(Socket.EVENT_DISCONNECT) {
            Log.i("SocketIO", "Disconnected from the server")
        }

        socket.on("conversationJoined") { args ->
            val convoId = (args[0] as String).toInt()
            conversationId = convoId

            // Emit join only after receiving the conversationId
            socket.emit("joinConversation", convoId)
        }

        socket.on("receiveMessage") { args ->
            val newMessage = args[0] as JSONObject
            println("Received message: $newMessage")
            val message = UIMessage(
                id = newMessage.getInt("id"),
                userAvatar = R.drawable.ic_profile,
                userName = newMessage.getInt("senderId").toString(),
                lastMessage = newMessage.getString("message_body")
            )
            coroutineScope.launch {
                messages.add(message)
            }
        }

        onDispose {
            socket.disconnect()
            socket.off("conversationJoined")
            socket.off("receiveMessage")
            socket.off(Socket.EVENT_CONNECT)
            socket.off(Socket.EVENT_DISCONNECT)
        }
    }

    // Update UI when new messages arrive
    LaunchedEffect(newMessagesFlow) {
        newMessagesFlow.collectLatest { updatedMessages ->
            messages.clear()
            messages.addAll(updatedMessages)
        }
    }


    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Messages") },
                actions = {
                    IconButton(onClick = { /* Add new message action */ }) {
                        Icon(painter = painterResource(id = R.drawable.ic_add), contentDescription = "New Message")
                    }
                }
            )
        },
        content = { paddingValues: PaddingValues ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
            ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f)
                ) {
                    items(messages) { message ->
                        MessageItem(message, isSentByCurrentUser = message.userName == "You")
                    }
                }
                LaunchedEffect(messages.size) {
                    if (messages.isNotEmpty()) {
                        listState.animateScrollToItem(messages.lastIndex)
                    }
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp)
                ) {
                    TextField(
                        value = newMessageText,
                        onValueChange = { newMessageText = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("Type a message") }
                    )
                    IconButton(
                        onClick = {
                            println("userId: $userId, otherUserId: $otherUserId")
                            if (newMessageText.isNotBlank()) {
                                coroutineScope.launch {
                                    if (conversationId == -1) {
                                        conversationId = findOrCreateConversation() ?: -1
                                    }

                                    if (conversationId != -1) {
                                        val message = UIMessage(
                                            id = System.currentTimeMillis().toInt(),
                                            userAvatar = R.drawable.ic_profile,
                                            userName = "You",
                                            lastMessage = newMessageText
                                        )
                                        messages.add(message)

                                        val messageJson = JSONObject().apply {
                                            put("conversationId", conversationId)
                                            put("senderId", userId) // ✅ Now an integer
                                            put("receiverId", otherUserId) // ✅ Now an integer
                                            put("message_body", newMessageText)
                                        }
                                        println("Sending message: $messageJson")
                                        socket.emit("sendMessage", messageJson)

                                        newMessageText = ""
                                        focusManager.clearFocus()
                                    } else {
                                        Log.e("MessagesScreen", "Failed to create or find conversation")
                                    }
                                }
                            }
                        }
                    ) {
                        Icon(painter = painterResource(id = R.drawable.ic_send), contentDescription = "Send")
                    }
                }
            }
        }
    )
}

@Composable
fun MessageItem(message: UIMessage, isSentByCurrentUser: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        horizontalArrangement = if (isSentByCurrentUser) Arrangement.End else Arrangement.Start
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = if (isSentByCurrentUser) Color(0xFF2196F3) else Color(0xFFEEEEEE)
            ),
            modifier = Modifier.padding(4.dp)
        ) {
            Text(
                text = message.lastMessage,
                modifier = Modifier.padding(8.dp),
                color = if (isSentByCurrentUser) Color.White else Color.Black
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
fun PreviewMessagesScreen() {
    MessagesScreen(navController = NavController(LocalContext.current), otherUserId = 2)
}