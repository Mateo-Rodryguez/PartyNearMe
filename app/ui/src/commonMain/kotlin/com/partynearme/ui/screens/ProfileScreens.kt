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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.partynearme.core.api.ReportTarget
import com.partynearme.core.model.OwnProfile
import com.partynearme.core.model.Post
import com.partynearme.core.model.PublicProfile
import com.partynearme.core.model.RelationshipStatus
import com.partynearme.ui.Paged
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.attempt
import com.partynearme.ui.userMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Your own profile: details and your posts, with settings behind the gear and saved things behind the bookmark. */
@Composable
fun MeScreen(ui: Ui) {
    val scope = rememberCoroutineScope()
    var me by remember { mutableStateOf<OwnProfile?>(null) }
    var stats by remember { mutableStateOf<PublicProfile?>(null) }
    var editing by remember { mutableStateOf(false) }
    val posts = remember { Paged<Post>(scope) { c -> ui.api.userPosts(ui.myId, c).let { it.posts to it.nextCursor } } }
    val pickAvatar = rememberAvatarPicker(ui) { me = it }
    LaunchedEffect(Unit) {
        attempt { ui.api.me() }.onSuccess { me = it }
        attempt { ui.api.user(ui.myId) }.onSuccess { stats = it }
        posts.refresh()
    }

    Column {
        TitleBar(
            me?.username?.let { "@$it" } ?: "Profile",
            leading = { RoundIconButton(Icons.Filled.Settings, "Settings") { ui.nav.open(Route.Settings()) } },
        ) {
            RoundIconButton(PartyIcons.BookmarkBorder, "Saved") { ui.nav.open(Route.Saved) }
        }
        PostGrid(ui, posts) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Header(
                    ui,
                    ui.myId,
                    me?.displayName ?: me?.username,
                    me?.bio,
                    stats,
                    me?.avatarUrl,
                    RelationshipStatus.of(me?.relationshipStatus),
                    onAvatar = pickAvatar,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SecondaryButton("Edit profile", { editing = true }, Modifier.weight(1f), icon = Icons.Filled.Edit)
                        SecondaryButton("Find people", { ui.nav.open(Route.Search()) }, Modifier.weight(1f), icon = Icons.Filled.Search)
                    }
                }
            }
        }
    }

    val current = me
    if (editing && current != null) {
        EditProfileDialog(ui, current, onDismiss = { editing = false }) { me = it; editing = false }
    }
}

/** Opens the photo picker and sets the picked photo as the profile picture; [onUpdated] gets the profile once it's checked. */
@Composable
fun rememberAvatarPicker(ui: Ui, onUpdated: (OwnProfile) -> Unit): () -> Unit {
    val scope = rememberCoroutineScope()
    return ui.platform.rememberPhotoPicker(1) { picked ->
        val photo = picked.firstOrNull() ?: return@rememberPhotoPicker
        scope.launch {
            attempt { ui.api.setAvatar(ui.api.uploadPhoto(photo.contentType, photo.bytes)) }
                .onSuccess {
                    ui.toast("Your new picture shows once it's been checked")
                    delay(PICTURE_CHECK_DELAY)
                    attempt { ui.api.me() }.onSuccess(onUpdated)
                }
                .onFailure { ui.toast(it.userMessage) }
        }
    }
}

/** Account deletion, which app stores require inside the app. It can't be undone, so it asks first. */
@Composable
fun DeleteAccountDialog(ui: Ui, onDismiss: () -> Unit) {
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
                    Header(ui, id, p.displayName ?: p.username, p.bio, p, p.avatarUrl, RelationshipStatus.of(p.relationshipStatus)) {
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
                                    SecondaryButton("Following", follow, Modifier.weight(1f).height(52.dp), icon = Icons.Filled.Check)
                                } else {
                                    PrimaryButton("Follow", follow, Modifier.weight(1f), icon = Icons.Filled.Add)
                                }
                                SecondaryButton("Message", {
                                    scope.launch {
                                        attempt { ui.api.startConversation(id) }
                                            .onSuccess { ui.nav.open(Route.Chat(it.id, title)) }
                                            .onFailure { ui.toast(it.userMessage) }
                                    }
                                }, Modifier.weight(1f).height(52.dp), icon = Icons.Filled.Email)
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
private fun Header(
    ui: Ui,
    userId: String,
    name: String?,
    bio: String?,
    stats: PublicProfile?,
    avatarUrl: String?,
    relationship: RelationshipStatus?,
    onAvatar: (() -> Unit)? = null,
    actions: @Composable () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Avatar(avatarUrl, name ?: "?", 104.dp, if (onAvatar != null) Modifier.clip(CircleShape).clickable(onClick = onAvatar) else Modifier,
            ring = true)
        name?.let {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(it, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
                RelationshipHeart(relationship, 24.dp)
            }
        }
        stats?.let {
            val handle = it.username?.let { u -> "@$u" } ?: "Profile"
            // Parties first: the thing this app is about, read before the social numbers.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Stat(it.parties, "Parties")
                StatDivider()
                Stat(it.followers, "Followers") { ui.nav.open(Route.People(userId, followers = true, title = handle)) }
                StatDivider()
                Stat(it.following, "Following") { ui.nav.open(Route.People(userId, followers = false, title = handle)) }
            }
        }
        bio?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center)
        }
        Box(Modifier.fillMaxWidth().padding(top = 4.dp)) { actions() }
    }
}

@Composable
private fun StatDivider() {
    Box(Modifier.padding(horizontal = 8.dp).size(width = 1.dp, height = 28.dp).background(MaterialTheme.colorScheme.outlineVariant))
}

@Composable
private fun Stat(count: Int, label: String, onClick: (() -> Unit)? = null) {
    Column(
        Modifier.clip(RoundedCornerShape(12.dp))
            .then(if (onClick != null) Modifier.clickable(onClickLabel = "Show $label", onClick = onClick) else Modifier)
            .padding(horizontal = 14.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(compactCount(count), style = MaterialTheme.typography.titleLarge)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** 1890 -> "1,890", 12500 -> "12.5K": how social apps show big numbers. */
fun compactCount(n: Int): String = when {
    n >= 1_000_000 -> "${(n / 100_000) / 10.0}M".replace(".0M", "M")
    n >= 10_000 -> "${(n / 100) / 10.0}K".replace(".0K", "K")
    n >= 1_000 -> "${n / 1000},${(n % 1000).toString().padStart(3, '0')}"
    else -> n.toString()
}

/** Posts as a three-column grid of square photos, loading more near the end. [empty] shows when there are none. */
@Composable
fun PostGrid(
    ui: Ui,
    posts: Paged<Post>,
    empty: @Composable () -> Unit = {
        EmptyState(Icons.Filled.Face, "No posts yet", body = "Photos from nights out show up here.")
    },
    header: LazyGridScope.() -> Unit,
) {
    val grid = rememberLazyGridState()
    val nearEnd by remember {
        derivedStateOf { (grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= grid.layoutInfo.totalItemsCount - 6 }
    }
    LaunchedEffect(nearEnd) { if (nearEnd && posts.loadedOnce) posts.loadMore() }
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        state = grid,
        modifier = Modifier.fillMaxSize(),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        header()
        if (posts.loadedOnce && posts.items.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                if (posts.error != null) {
                    Message(posts.error!!, null)
                } else {
                    empty()
                }
            }
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
fun EditProfileDialog(ui: Ui, profile: OwnProfile, onDismiss: () -> Unit, onSaved: (OwnProfile) -> Unit) {
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

