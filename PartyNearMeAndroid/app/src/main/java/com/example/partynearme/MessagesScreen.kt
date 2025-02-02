package com.example.partynearme

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

data class UIMessage(val id: String, val userAvatar: Int, val userName: String, val lastMessage: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessagesScreen(navController: NavController, userId: String, otherUserId: String) {
    val messages = remember { mutableStateListOf<UIMessage>() }
    val coroutineScope = rememberCoroutineScope()
    var newMessageText by remember { mutableStateOf("") }
    var conversationId by remember { mutableStateOf<String?>(null) }
    val focusManager = LocalFocusManager.current

    val socket = remember { IO.socket("https://10.0.2.2:5000") } // Replace with actual server IP
    val newMessagesFlow = remember { MutableStateFlow<List<UIMessage>>(emptyList()) }
    val listState = rememberLazyListState()


    // Connect WebSocket & Join Conversation
    LaunchedEffect(otherUserId) {
        socket.connect()

        socket.on("conversationJoined") { args ->
            val convoId = args[0] as String
            conversationId = convoId

            // ✅ Emit join only after receiving the conversationId
            socket.emit("joinConversation", convoId)
        }

        socket.on("receiveMessage") { args ->
            val newMessage = args[0] as JSONObject
            val message = UIMessage(
                id = newMessage.getString("id"),
                userAvatar = R.drawable.ic_profile,
                userName = newMessage.getString("senderId"),
                lastMessage = newMessage.getString("content")
            )
            coroutineScope.launch {
                messages.add(message)
            }
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
                                // ✅ Ensure UI updates by creating a new list instance
                                messages.add(
                                    UIMessage(
                                        id = System.currentTimeMillis().toString(),
                                        userAvatar = R.drawable.ic_profile,
                                        userName = "You",
                                        lastMessage = newMessageText
                                    )
                                )

                                // ✅ Clear text box & remove focus
                                newMessageText = ""
                                focusManager.clearFocus()

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
    MessagesScreen(navController = NavController(LocalContext.current), userId = "1", otherUserId = "2")
}
