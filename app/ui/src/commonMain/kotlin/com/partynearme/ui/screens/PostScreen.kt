package com.partynearme.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.partynearme.core.api.ReportTarget
import com.partynearme.core.model.Post
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

@Composable
fun PostScreen(ui: Ui, id: String) {
    val scope = rememberCoroutineScope()
    var post by remember { mutableStateOf<Post?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reporting by remember { mutableStateOf(false) }
    var tagging by remember { mutableStateOf(false) }
    LaunchedEffect(id) {
        attempt { ui.api.post(id) }.onSuccess { post = it }.onFailure { error = it.userMessage }
        ui.app.interactions.open(id)
    }
    Column(Modifier.verticalScroll(rememberScrollState())) {
        BackBar(ui, "Post")
        val current = post
        when {
            current != null -> PostCard(
                post = current,
                isMine = current.author.id == ui.myId,
                onAuthor = { ui.nav.open(Route.User(current.author.id)) },
                onLike = { liked ->
                    post = current.withLike(liked)
                    scope.launch {
                        attempt { if (liked) ui.api.like(id) else ui.api.unlike(id) }
                            .onFailure { post = current; ui.toast(it.userMessage) }
                    }
                },
                onDelete = {
                    scope.launch {
                        attempt { ui.api.deletePost(id) }
                            .onSuccess { ui.toast("Post deleted"); ui.nav.back() }
                            .onFailure { ui.toast(it.userMessage) }
                    }
                },
                onReport = { reporting = true },
                onEvent = { ui.nav.open(Route.Event(it)) },
                onSave = { saved ->
                    post = current.withSave(saved)
                    scope.launch {
                        attempt { ui.api.savePost(id, saved) }.onFailure { post = current; ui.toast(it.userMessage) }
                    }
                },
                onComments = { ui.nav.open(Route.Comments(id)) },
                onEditCaption = { caption ->
                    post = current.copy(caption = caption.ifEmpty { null })
                    scope.launch {
                        attempt { ui.api.updateCaption(id, caption) }
                            .onSuccess { post = it }
                            .onFailure { post = current; ui.toast(it.userMessage) }
                    }
                },
                me = ui.myId,
                onPerson = { ui.nav.open(Route.User(it)) },
                onEditTags = { tagging = true },
                onUntagMe = {
                    post = current.copy(tags = current.tags.filter { it.id != ui.myId })
                    scope.launch {
                        attempt { ui.api.untagMe(id) }
                            .onSuccess { ui.toast("You're no longer tagged") }
                            .onFailure { post = current; ui.toast(it.userMessage) }
                    }
                },
            )
            error != null -> Message(error!!, null)
        }
    }
    if (reporting) ReportDialog(ui, ReportTarget.Post, id) { reporting = false }
    val shown = post
    if (tagging && shown != null) {
        TagPeopleDialog(ui, shown, onDismiss = { tagging = false }) { post = it; tagging = false }
    }
}
