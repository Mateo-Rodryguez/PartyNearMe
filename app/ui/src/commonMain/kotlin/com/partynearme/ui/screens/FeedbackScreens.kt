package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partynearme.core.FeedbackKind
import com.partynearme.core.PartyNearMe
import com.partynearme.ui.Brand
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Settings > Send feedback: what people love, what got in their way, or what
 * they wish the app did. Goes to the feedback table, which only we can read.
 */
@Composable
fun FeedbackScreen(ui: Ui) {
    val scope = rememberCoroutineScope()
    var kind by remember { mutableStateOf(FeedbackKind.Love) }
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().imePadding()) {
        BackBar(ui, "Send feedback")
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "We read every message. Tell us what you love, what got in your way, or what you wish " +
                    "PartyNearMe did, and we'll keep making it better.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ChoiceChip("I love something", kind == FeedbackKind.Love, { kind = FeedbackKind.Love })
                ChoiceChip("Something's wrong", kind == FeedbackKind.Problem, { kind = FeedbackKind.Problem })
                ChoiceChip("I have an idea", kind == FeedbackKind.Idea, { kind = FeedbackKind.Idea })
            }
            PartyField(
                text,
                { text = it.take(2000) },
                when (kind) {
                    FeedbackKind.Problem -> "What happened, and what were you trying to do?"
                    FeedbackKind.Idea -> "What should PartyNearMe do?"
                    else -> "What do you love?"
                },
                singleLine = false,
                minLines = 5,
            )
        }
        PrimaryButton(
            "Send",
            {
                busy = true
                scope.launch {
                    attempt { ui.app.sendFeedback(kind, text) }
                        .onSuccess { ui.toast("Thanks! We read every one."); ui.nav.back() }
                        .onFailure { ui.toast(it.userMessage) }
                    busy = false
                }
            },
            Modifier.fillMaxWidth().padding(20.dp),
            enabled = text.isNotBlank() && !busy,
            busy = busy,
        )
    }
}

/**
 * "Would you recommend PartyNearMe to a friend?" (0-10), the Net Promoter
 * Score, shown at the top of Home at most every 90 days once someone knows the
 * app (LocalPrefs.recommendDue). The app grows by word of mouth, so this is the
 * number that matters most. A score can come with an optional reason.
 */
@Composable
fun RecommendCard(ui: Ui, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var score by remember { mutableStateOf<Int?>(null) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { ui.track("recommend_shown") }

    fun send() {
        val picked = score ?: return
        busy = true
        scope.launch {
            attempt { ui.app.sendFeedback(FeedbackKind.Recommend, reason, score = picked) }
                .onSuccess {
                    ui.toast(if (picked >= 9) "Thank you! Tell a friend tonight" else "Thanks, this helps us improve")
                    onDone()
                }
                .onFailure { ui.toast(it.userMessage) }
            busy = false
        }
    }

    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                "How likely are you to recommend PartyNearMe to a friend?",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f).padding(top = 4.dp),
            )
            IconButton(onClick = { ui.track("recommend_dismissed"); onDone() }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.Close, "Not now", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            (0..10).forEach { n ->
                val selected = n == score
                Box(
                    Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(8.dp))
                        .background(if (selected) Brand.gradient else SolidBrush(MaterialTheme.colorScheme.surfaceContainerHigh))
                        .clickable(role = Role.RadioButton) { score = n },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "$n",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
        Row {
            Text("Not likely", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.weight(1f))
            Text("Very likely", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (score != null) {
            PartyField(
                reason,
                { reason = it.take(2000) },
                if ((score ?: 0) >= 9) "What do you love most? (optional)" else "What would make it a 10? (optional)",
                singleLine = false,
                minLines = 2,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(1f))
                TextButton(onClick = ::send, enabled = !busy) { Text(if (busy) "Sending…" else "Send", fontWeight = FontWeight.Bold) }
            }
        }
    }
}

/** The answers to "How did you hear about PartyNearMe?"; the wire values match the backend's HEARD_FROM. */
val HEARD_FROM = listOf(
    "friend" to "A friend told me",
    "shared_link" to "Someone shared a party or post",
    "social_media" to "Social media",
    "venue_or_event" to "At a venue or party",
    "app_store" to "Browsing the app store",
    "other" to "Somewhere else",
)

/** A step in onboarding: how did you find us? Word of mouth is how this app means to grow, so we measure it. */
@Composable
fun HeardFromStep(app: PartyNearMe, scope: CoroutineScope, onNext: () -> Unit) {
    var picked by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("How did you hear about PartyNearMe?", style = MaterialTheme.typography.headlineMedium)
            Text("It helps us know what's working.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HEARD_FROM.forEach { (wire, label) ->
                    ChoiceChip(label, picked == wire, { picked = wire }, Modifier.fillMaxWidth())
                }
            }
        }
        PrimaryButton(
            if (picked == null) "Skip" else "Continue",
            {
                val answer = picked
                if (answer != null) {
                    // Never holds up onboarding: sent in the background, and a failure is dropped.
                    scope.launch {
                        app.analytics.track("heard_about_us", mapOf("source" to answer))
                        runCatching { app.sendFeedback(FeedbackKind.HeardFrom, answer) }
                    }
                }
                onNext()
            },
            Modifier.fillMaxWidth(),
        )
    }
}
