package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.platform.LocalUriHandler
import com.partynearme.core.PartyNearMe
import com.partynearme.core.api.ReportTarget
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

/** The choices people pick from; the server stores the text as given. */
val REPORT_REASONS = listOf(
    "Spam",
    "Nudity or sexual content",
    "Harassment or hate",
    "Violence or dangerous behaviour",
    "Illegal (e.g. drugs)",
    "Something else",
)

/** Asks why something is being reported and sends the report. */
@Composable
fun ReportDialog(ui: Ui, target: ReportTarget, targetId: String, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var reason by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Report this ${target.wire}?") },
        text = {
            Column {
                Text("Why are you reporting it? We review every report.")
                REPORT_REASONS.forEach { option ->
                    Row(
                        Modifier.fillMaxWidth().selectable(selected = reason == option, onClick = { reason = option }),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = reason == option, onClick = { reason = option })
                        Text(option)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = reason != null && !busy, onClick = {
                val picked = reason ?: return@TextButton
                busy = true
                scope.launch {
                    attempt { ui.api.report(target, targetId, picked) }
                        .onSuccess { ui.toast("Thanks, we'll review it"); onDismiss() }
                        .onFailure { ui.toast(it.userMessage); busy = false }
                }
            }) { Text("Report") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Opens the privacy policy or terms, which the server hosts so they can change without an app update. */
@Composable
fun rememberLegalLinks(app: PartyNearMe): LegalLinks {
    val uri = LocalUriHandler.current
    val base = app.config.apiBaseUrl.trimEnd('/')
    return remember(base, uri) {
        LegalLinks(privacy = { uri.openUri("$base/privacy") }, terms = { uri.openUri("$base/terms") })
    }
}

class LegalLinks(val privacy: () -> Unit, val terms: () -> Unit)
