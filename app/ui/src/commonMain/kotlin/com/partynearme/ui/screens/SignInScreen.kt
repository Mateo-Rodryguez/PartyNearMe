package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.partynearme.core.PartyNearMe
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(app: PartyNearMe) {
    val scope = rememberCoroutineScope()
    var creating by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var checkEmail by remember { mutableStateOf(false) }

    fun submit() {
        busy = true
        error = null
        scope.launch {
            attempt {
                if (creating) {
                    if (!app.sessions.signUp(email.trim(), password)) checkEmail = true
                } else {
                    app.sessions.signIn(email.trim(), password)
                }
            }.onFailure { error = it.userMessage }
            busy = false
        }
    }

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("PartyNearMe", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary)
        if (checkEmail) {
            Text("We sent a link to $email. Tap it, then come back and sign in.")
            Button(onClick = { checkEmail = false; creating = false }) { Text("Back to sign in") }
            return@Column
        }
        Text(if (creating) "Create your account" else "Sign in to see what's on near you")
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            supportingText = if (creating) ({ Text("At least 8 characters") }) else null,
            modifier = Modifier.fillMaxWidth(),
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = ::submit,
            enabled = !busy && email.contains('@') && password.length >= (if (creating) 8 else 1),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (busy) "Please wait…" else if (creating) "Create account" else "Sign in") }
        TextButton(onClick = { creating = !creating; error = null }) {
            Text(if (creating) "I already have an account" else "New here? Create an account")
        }
    }
}
