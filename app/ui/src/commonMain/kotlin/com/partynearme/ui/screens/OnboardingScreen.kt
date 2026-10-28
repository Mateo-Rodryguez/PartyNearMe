package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.partynearme.core.PartyNearMe
import com.partynearme.core.model.Interest
import com.partynearme.ui.Brand
import com.partynearme.ui.Platform
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

/**
 * The steps after picking a username on a new account: what you're into (for the
 * feed and Nearby filters), then location, asked for with a reason before the
 * phone's own prompt, as the stores recommend. Both can be skipped.
 */
@Composable
fun OnboardingScreen(app: PartyNearMe, platform: Platform, onDone: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp)) {
        Dots(step, STEPS)
        Box(Modifier.weight(1f).padding(top = 24.dp)) {
            when (step) {
                0 -> InterestsStep(app) { step = 1 }
                else -> LocationStep(platform, onDone)
            }
        }
    }
}

private const val STEPS = 2

@Composable
private fun Dots(step: Int, count: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(count) { i ->
            Box(
                Modifier.height(6.dp).width(if (i == step) 24.dp else 6.dp).clip(CircleShape)
                    .background(if (i <= step) Brand.gradient else SolidBrush(MaterialTheme.colorScheme.surfaceContainerHigh)),
            )
        }
    }
}

@Composable
private fun InterestsStep(app: PartyNearMe, onNext: () -> Unit) {
    val scope = rememberCoroutineScope()
    var all by remember { mutableStateOf(emptyList<Interest>()) }
    var picked by remember { mutableStateOf(emptySet<Int>()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { attempt { app.api.interests() }.onSuccess { all = it } }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("What are you into?", style = MaterialTheme.typography.headlineMedium)
            Text("Pick a few. Your feed and Nearby show more of it, and you can change it in settings.",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(
                Modifier.padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                all.forEach { interest ->
                    ChoiceChip(interest.name, interest.id in picked, {
                        picked = if (interest.id in picked) picked - interest.id else (picked + interest.id).take(10).toSet()
                    })
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
        PrimaryButton(
            if (picked.isEmpty()) "Skip" else "Continue",
            {
                if (picked.isEmpty()) {
                    onNext()
                } else {
                    busy = true
                    error = null
                    scope.launch {
                        attempt { app.api.setInterests(picked.sorted()) }
                            .onSuccess { onNext() }
                            .onFailure { error = it.userMessage }
                        busy = false
                    }
                }
            },
            Modifier.fillMaxWidth(),
            busy = busy,
        )
    }
}

@Composable
private fun LocationStep(platform: Platform, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    val location = platform.rememberLocationProvider()
    var asking by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.weight(1f))
        Box(Modifier.size(96.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.LocationOn, null, Modifier.size(48.dp), tint = Color.White)
        }
        Text("Find parties near you", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 24.dp))
        Text(
            "PartyNearMe uses your location only while you use it, to show what's on nearby. " +
                "It never keeps a history of where you go.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
        Spacer(Modifier.weight(1f))
        PrimaryButton(
            "Allow location",
            {
                asking = true
                scope.launch {
                    location.current()
                    asking = false
                    onDone()
                }
            },
            Modifier.fillMaxWidth(),
            busy = asking,
        )
        TextButton(onClick = onDone, enabled = !asking, modifier = Modifier.padding(top = 4.dp)) { Text("Not now") }
    }
}
