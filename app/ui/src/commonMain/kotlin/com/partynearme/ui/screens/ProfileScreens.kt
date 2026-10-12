package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.api.ReportTarget
import com.partynearme.core.model.OwnProfile
import com.partynearme.core.model.Post
import com.partynearme.core.model.PublicProfile
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

/** Your own profile: details, your posts, editing and signing out. */
@Composable
fun MeScreen(ui: Ui) {
    val scope = rememberCoroutineScope()
    var me by remember { mutableStateOf<OwnProfile?>(null) }
    var stats by remember { mutableStateOf<PublicProfile?>(null) }
    var editing by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val legal = rememberLegalLinks(ui.app)
    val posts = remember { Paged<Post>(scope) { c -> ui.api.userPosts(ui.myId, c).let { it.posts to it.nextCursor } } }
    LaunchedEffect(Unit) {
        attempt { ui.api.me() }.onSuccess { me = it }
        attempt { ui.api.user(ui.myId) }.onSuccess { stats = it }
        posts.refresh()
    }

    Column {
        TitleBar(me?.username?.let { "@$it" } ?: "Profile") {
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "More") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Edit profile") }, onClick = { menu = false; editing = true })
                    DropdownMenuItem(text = { Text("Sign out") }, onClick = {
                        menu = false
                        scope.launch { ui.app.interactions.flush(); ui.app.signOut() }
                    })
                    DropdownMenuItem(text = { Text("Privacy policy") }, onClick = { menu = false; legal.privacy() })
                    DropdownMenuItem(text = { Text("Terms") }, onClick = { menu = false; legal.terms() })
                    DropdownMenuItem(
                        text = { Text("Delete account", color = MaterialTheme.colorScheme.error) },
                        onClick = { menu = false; confirmDelete = true },
                    )
                }
            }
        }
        PostGrid(ui, posts) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Header(me?.displayName, me?.bio, stats) {
                    OutlinedButton(onClick = { editing = true }, modifier = Modifier.fillMaxWidth()) { Text("Edit profile") }
                }
            }
        }
    }

    val current = me
    if (editing && current != null) {
        EditProfileDialog(ui, current, onDismiss = { editing = false }) { me = it; editing = false }
    }
    if (confirmDelete) DeleteAccountDialog(ui) { confirmDelete = false }
}

/** Account deletion, which app stores require inside the app. It can't be undone, so it asks first. */
@Composable
private fun DeleteAccountDialog(ui: Ui, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("Delete your account?") },
        text = {
            Text(
                "This permanently deletes your profile, posts, photos, parties, messages and follows. " +
                    "It can't be undone."
            )
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                busy = true
                scope.launch {
                    // On success the session ends and the app returns to sign-in by itself.
                    attempt { ui.app.deleteAccount() }.onFailure { ui.toast(it.userMessage); busy = false }
                }
            }) { Text(if (busy) "Deleting…" else "Delete", color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Someone else's profile. */
@Composable
fun UserScreen(ui: Ui, id: String) {
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf<PublicProfile?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }
    var confirmBlock by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf(false) }
    val posts = remember { Paged<Post>(scope) { c -> ui.api.userPosts(id, c).let { it.posts to it.nextCursor } } }
    LaunchedEffect(id) {
        attempt { ui.api.user(id) }.onSuccess { profile = it }.onFailure { error = it.userMessage }
        posts.refresh()
    }
    val p = profile
    val title = p?.username?.let { "@$it" } ?: "Profile"

    Column {
        BackBar(ui, title) {
            if (id != ui.myId) {
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "More") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("Report") }, onClick = { menu = false; reporting = true })
                        if (p?.isBlocked == true) {
                            DropdownMenuItem(text = { Text("Unblock") }, onClick = {
                                menu = false
                                scope.launch {
                                    attempt { ui.api.unblock(id) }
                                        .onSuccess { profile = profile?.copy(isBlocked = false); ui.toast("Unblocked") }
                                        .onFailure { ui.toast(it.userMessage) }
                                }
                            })
                        } else {
                            DropdownMenuItem(text = { Text("Block") }, onClick = { menu = false; confirmBlock = true })
                        }
                    }
                }
            }
        }
        when {
            p != null -> PostGrid(ui, posts) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Header(p.displayName ?: p.username, p.bio, p) {
                        if (id != ui.myId) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                val follow = {
                                    val now = !p.isFollowing
                                    profile = p.copy(isFollowing = now, followers = p.followers + if (now) 1 else -1)
                                    scope.launch {
                                        attempt { if (now) ui.api.follow(id) else ui.api.unfollow(id) }
                                            .onFailure { profile = p; ui.toast(it.userMessage) }
                                    }
                                    Unit
                                }
                                if (p.isFollowing) {
                                    OutlinedButton(onClick = follow, modifier = Modifier.weight(1f)) { Text("Following") }
                                } else {
                                    Button(onClick = follow, modifier = Modifier.weight(1f)) { Text("Follow") }
                                }
                                OutlinedButton(modifier = Modifier.weight(1f), onClick = {
                                    scope.launch {
                                        attempt { ui.api.startConversation(id) }
                                            .onSuccess { ui.nav.open(Route.Chat(it.id, title)) }
                                            .onFailure { ui.toast(it.userMessage) }
                                    }
                                }) { Text("Message") }
                            }
                        }
                    }
                }
            }
            error != null -> Message(error!!, null)
            else -> Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
        }
    }

    if (confirmBlock) {
        AlertDialog(
            onDismissRequest = { confirmBlock = false },
            title = { Text("Block $title?") },
            text = { Text("They won't be able to see your posts or message you, and you won't see theirs.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmBlock = false
                    scope.launch {
                        attempt { ui.api.block(id) }
                            .onSuccess { profile = profile?.copy(isBlocked = true); ui.toast("Blocked"); ui.nav.back() }
                            .onFailure { ui.toast(it.userMessage) }
                    }
                }) { Text("Block") }
            },
            dismissButton = { TextButton(onClick = { confirmBlock = false }) { Text("Cancel") } },
        )
    }
    if (reporting) ReportDialog(ui, ReportTarget.User, id) { reporting = false }
}

@Composable
private fun Header(name: String?, bio: String?, stats: PublicProfile?, actions: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        name?.let { Text(it, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold) }
        stats?.let { Text("${it.followers} followers · ${it.following} following") }
        bio?.takeIf { it.isNotBlank() }?.let { Text(it) }
        actions()
    }
}

@Composable
private fun PostGrid(ui: Ui, posts: Paged<Post>, header: LazyGridScope.() -> Unit) {
    val grid = rememberLazyGridState()
    val nearEnd by remember {
        derivedStateOf { (grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= grid.layoutInfo.totalItemsCount - 6 }
    }
    LaunchedEffect(nearEnd) { if (nearEnd && posts.loadedOnce) posts.loadMore() }
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        state = grid,
        modifier = Modifier.fillMaxSize(),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        header()
        if (posts.loadedOnce && posts.items.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) { Message(posts.error ?: "No posts yet.", null) }
        }
        items(posts.items, key = { it.id }) { post ->
            Box(
                Modifier.aspectRatio(1f).background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { ui.nav.open(Route.Post(post.id)) },
            ) {
                val thumb = post.media.firstOrNull()?.urlFor(320)
                if (thumb != null) {
                    AsyncImage(thumb, contentDescription = post.caption, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Text("Checking…", Modifier.align(Alignment.Center), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun EditProfileDialog(ui: Ui, profile: OwnProfile, onDismiss: () -> Unit, onSaved: (OwnProfile) -> Unit) {
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf(profile.username.orEmpty()) }
    var displayName by remember { mutableStateOf(profile.displayName.orEmpty()) }
    var bio by remember { mutableStateOf(profile.bio.orEmpty()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit profile") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(username, { username = it.lowercase().take(30) }, label = { Text("Username") },
                    singleLine = true, isError = !USERNAME.matches(username))
                OutlinedTextField(displayName, { displayName = it.take(60) }, label = { Text("Name") }, singleLine = true)
                OutlinedTextField(bio, { bio = it.take(300) }, label = { Text("Bio") }, minLines = 2)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = USERNAME.matches(username) && !busy, onClick = {
                busy = true
                scope.launch {
                    attempt { ui.api.updateMe(username, displayName.trim(), bio.trim()) }
                        .onSuccess(onSaved)
                        .onFailure { error = it.userMessage }
                    busy = false
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

