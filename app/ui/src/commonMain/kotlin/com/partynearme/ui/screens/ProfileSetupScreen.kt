package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partynearme.ui.Wordmark
import com.partynearme.core.PartyNearMe
import com.partynearme.core.model.OwnProfile
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

val USERNAME = Regex("^[a-z0-9_.]{3,30}$")

/** New accounts pick a username before anything else, so posts and chats have a name on them. */
@Composable
fun ProfileSetupScreen(app: PartyNearMe, profile: OwnProfile, onDone: (OwnProfile) -> Unit) {
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf(profile.displayName.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val valid = USERNAME.matches(username)

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        Wordmark(size = 30.sp)
        Text("Pick a username", style = MaterialTheme.typography.headlineMedium)
        Text("It's how people find you and see who posted.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        PartyField(
            value = username,
            onValueChange = { username = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '_' || c == '.' }.take(30) },
            label = "Username",
            prefix = "@",
            supportingText = "3 to 30 letters, numbers, _ or .",
            isError = username.isNotEmpty() && !valid,
        )
        PartyField(
            value = displayName,
            onValueChange = { displayName = it.take(60) },
            label = "Your name (optional)",
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        PrimaryButton(
            "Continue",
            enabled = valid || busy,
            busy = busy,
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                busy = true
                error = null
                scope.launch {
                    attempt { app.api.updateMe(username = username, displayName = displayName.trim().ifEmpty { null }) }
                        .onSuccess(onDone)
                        .onFailure { error = it.userMessage }
                    busy = false
                }
            },
        )
        TextButton(onClick = { scope.launch { app.signOut() } }) { Text("Sign out") }
    }
}
