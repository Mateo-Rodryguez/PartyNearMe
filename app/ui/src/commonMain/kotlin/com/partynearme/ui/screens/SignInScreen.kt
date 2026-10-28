package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partynearme.core.PartyNearMe
import com.partynearme.ui.Brand
import com.partynearme.ui.Platform
import com.partynearme.ui.Wordmark
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(app: PartyNearMe, platform: Platform) {
    val scope = rememberCoroutineScope()
    var creating by remember { mutableStateOf(false) }
    // "Forgot password?": the same screen asks only for the email and sends a reset link.
    var resetting by remember { mutableStateOf(false) }
    var resetSent by remember { mutableStateOf(false) }
    // Google sign-in shows once it's switched on in Supabase.
    var google by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { attempt { app.auth.providers() }.onSuccess { google = "google" in it } }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var checkEmail by remember { mutableStateOf(false) }
    var showPassword by remember { mutableStateOf(false) }
    val ready = !busy && email.contains('@') && (resetting || password.length >= (if (creating) 8 else 1))

    fun submit() {
        busy = true
        error = null
        scope.launch {
            attempt {
                if (resetting) {
                    app.sendPasswordReset(email.trim())
                    resetSent = true
                } else if (creating) {
                    if (!app.sessions.signUp(email.trim(), password)) checkEmail = true
                } else {
                    app.sessions.signIn(email.trim(), password)
                }
            }.onFailure { error = it.userMessage }
            busy = false
        }
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Glow()
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
        ) {
            Spacer(Modifier.height(48.dp))
            Wordmark(size = 40.sp)
            if (checkEmail || resetSent) {
                Text("Check your inbox", style = MaterialTheme.typography.headlineSmall)
                Text(
                    if (resetSent) {
                        "If $email has an account, we sent it a link to choose a new password. Open it on this phone, " +
                            "then come back and sign in."
                    } else {
                        "We sent a link to $email. Tap it, then come back and sign in."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                PrimaryButton("Back to sign in", {
                    checkEmail = false; resetSent = false; resetting = false; creating = false; password = ""
                }, Modifier.fillMaxWidth())
                return@Column
            }
            Text(
                when {
                    resetting -> "Forgot your password?"
                    creating -> "Join the party."
                    else -> "Find the party.\nShare the night."
                },
                style = MaterialTheme.typography.headlineMedium,
            )
            Text(
                when {
                    resetting -> "Enter your email and we'll send you a link to choose a new one."
                    creating -> "Create your account to see what's on near you."
                    else -> "Sign in to see what's on near you tonight."
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            PartyField(
                value = email,
                onValueChange = { email = it },
                label = "Email",
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = if (resetting) ImeAction.Go else ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(onGo = { if (ready) submit() }),
            )
            if (!resetting) PartyField(
                value = password,
                onValueChange = { password = it },
                label = "Password",
                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { if (ready) submit() }),
                supportingText = if (creating) "At least 8 characters" else null,
                trailing = {
                    TextButton(onClick = { showPassword = !showPassword }) { Text(if (showPassword) "Hide" else "Show") }
                },
            )
            if (!creating && !resetting) {
                TextButton(onClick = { resetting = true; error = null }, Modifier.align(Alignment.End)) { Text("Forgot password?") }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            PrimaryButton(
                when {
                    resetting -> "Send reset link"
                    creating -> "Create account"
                    else -> "Sign in"
                },
                ::submit,
                Modifier.fillMaxWidth().padding(top = 4.dp),
                enabled = ready || busy,
                busy = busy,
            )
            if (google && !resetting) {
                SecondaryButton(
                    "Continue with Google",
                    {
                        busy = true
                        error = null
                        scope.launch {
                            attempt { app.signInWith("google") { url -> platform.openSignIn(url, app.config.appScheme) } }
                                .onFailure { error = it.userMessage }
                            busy = false
                        }
                    },
                    Modifier.fillMaxWidth().height(52.dp),
                    enabled = !busy,
                )
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                if (resetting) {
                    TextButton(onClick = { resetting = false; error = null }) { Text("Back to sign in", fontWeight = FontWeight.Bold) }
                } else {
                    Text(if (creating) "Already have an account?" else "New here?", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { creating = !creating; error = null }) {
                        Text(if (creating) "Sign in" else "Create an account", fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
            val legal = rememberLegalLinks(app)
            Text(
                "PartyNearMe is for people aged 18 and over. By continuing you agree to our Terms and Privacy policy.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                TextButton(onClick = legal.terms) { Text("Terms") }
                TextButton(onClick = legal.privacy) { Text("Privacy policy") }
            }
        }
    }
}

/** Soft coloured light behind the sign-in screen, like stage lights at night or a sunset by day. */
@Composable
private fun BoxScope.Glow() {
    val (first, second) = Brand.glow
    Box(
        Modifier.align(Alignment.TopStart).offset(x = (-120).dp, y = (-80).dp).size(380.dp)
            .background(Brush.radialGradient(listOf(first, Color.Transparent))),
    )
    Box(
        Modifier.align(Alignment.TopEnd).offset(x = 140.dp, y = 60.dp).size(360.dp)
            .background(Brush.radialGradient(listOf(second, Color.Transparent))),
    )
}
