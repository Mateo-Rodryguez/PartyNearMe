package com.partynearme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partynearme.core.model.AccountSettings
import com.partynearme.core.model.Interest
import com.partynearme.core.model.OwnProfile
import com.partynearme.core.model.RelationshipStatus
import com.partynearme.core.prefs.LocalPrefs
import com.partynearme.core.prefs.ThemeMode
import com.partynearme.ui.Overline
import com.partynearme.ui.Route
import com.partynearme.ui.Ui
import com.partynearme.ui.Wordmark
import com.partynearme.ui.attempt
import com.partynearme.ui.radiusLabel
import com.partynearme.ui.userMessage
import kotlinx.coroutines.launch

private enum class Sheet { Relationship, Interests, Messages }

/**
 * Everything you can change, grouped like iOS settings: your account, privacy,
 * notifications, how the app looks and how Nearby searches. Choices about the
 * phone (theme, units) stay on it; the rest is saved to your account.
 */
@Composable
fun SettingsScreen(ui: Ui, relationshipPicker: Boolean = false) {
    val scope = rememberCoroutineScope()
    var me by remember { mutableStateOf<OwnProfile?>(null) }
    var account by remember { mutableStateOf<AccountSettings?>(null) }
    val interests = remember { mutableStateListOf<Interest>() }
    val prefs by ui.prefs.state.collectAsState()
    var sheet by remember { mutableStateOf(if (relationshipPicker) Sheet.Relationship else null) }
    var editing by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val legal = rememberLegalLinks(ui.app)
    val pickAvatar = rememberAvatarPicker(ui) { me = it }
    LaunchedEffect(Unit) {
        attempt { ui.api.me() }.onSuccess { me = it }
        attempt { ui.api.settings() }.onSuccess { account = it }
        attempt { ui.api.interests() }.onSuccess { interests.addAll(it) }
    }

    /** Shows the change at once and puts it back if the server says no. */
    fun changeAccount(transform: (AccountSettings) -> AccountSettings) {
        val before = account ?: return
        val after = transform(before)
        account = after
        scope.launch {
            attempt { ui.api.updateSettings(after) }
                .onSuccess { account = it }
                .onFailure { account = before; ui.toast(it.userMessage) }
        }
    }

    val relationship = RelationshipStatus.of(me?.relationshipStatus)
    val current = me

    Column(Modifier.fillMaxSize()) {
        BackBar(ui, "Settings")
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            ProfileCard(current, onClick = { editing = true }, onAvatar = pickAvatar)

            Group("Account") {
                InfoRow(Icons.Filled.Edit, "Edit profile", detail = "Name, username and bio", onClick = { editing = true },
                    trailing = { Chevron() })
                Divider()
                InfoRow(
                    Icons.Filled.Face,
                    "Profile picture",
                    detail = if (current?.avatarUrl != null) "Tap to change" else "Add one so friends recognise you",
                    onClick = pickAvatar,
                    trailing = {
                        if (current?.avatarUrl != null) {
                            Text(
                                "Remove",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.clip(CircleShape).clickable {
                                    scope.launch {
                                        attempt { ui.api.removeAvatar() }
                                            .onSuccess { me = me?.copy(avatarUrl = null) }
                                            .onFailure { ui.toast(it.userMessage) }
                                    }
                                }.padding(horizontal = 10.dp, vertical = 6.dp),
                            )
                        } else {
                            Chevron()
                        }
                    },
                )
                Divider()
                InfoRow(
                    Icons.Filled.Favorite,
                    "Relationship status",
                    detail = relationship.meaning,
                    onClick = { sheet = Sheet.Relationship },
                    trailing = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RelationshipHeart(relationship, 20.dp)
                            Chevron()
                        }
                    },
                )
                Divider()
                InfoRow(
                    Icons.Filled.Star,
                    "Interests",
                    detail = interests.filter { it.id in current?.interestIds.orEmpty() }.joinToString { it.name }
                        .ifEmpty { "Pick a few to tune your feed" },
                    onClick = { sheet = Sheet.Interests },
                    trailing = { Chevron() },
                )
            }

            Group("Privacy and safety") {
                InfoRow(
                    Icons.Filled.Email,
                    "Who can message you",
                    detail = if (account?.messagesFrom == "following") "Only people you follow" else "Everyone",
                    onClick = { if (account != null) sheet = Sheet.Messages },
                    trailing = { Chevron() },
                )
                Divider()
                InfoRow(PartyIcons.Block, "Blocked accounts", detail = "See and unblock people",
                    onClick = { ui.nav.open(Route.Blocked) }, trailing = { Chevron() })
                if (ui.app.config.posthogKey != null) {
                    Divider()
                    // Kept on this phone, like the other display choices.
                    ToggleRow(PartyIcons.Description, "Share usage stats", "Which features get used, never what you post or say",
                        prefs.shareUsage) { on -> ui.prefs.update { it.copy(shareUsage = on) } }
                }
            }

            Group("Notifications") {
                ToggleRow(Icons.Filled.Email, "Messages", "When someone sends you a message", account?.pushMessages) { on ->
                    changeAccount { it.copy(pushMessages = on) }
                }
                Divider()
                ToggleRow(PartyIcons.ChatBubbleOutline, "Comments and tags", "When someone comments on or tags you in a photo",
                    account?.pushComments) { on -> changeAccount { it.copy(pushComments = on) } }
                Divider()
                ToggleRow(Icons.Filled.Notifications, "Guests for your parties", "When someone says they're going",
                    account?.pushRsvps) { on -> changeAccount { it.copy(pushRsvps = on) } }
                Divider()
                ToggleRow(Icons.Filled.DateRange, "Party reminders", "Before parties you're going to, or if one is cancelled",
                    account?.pushReminders) { on -> changeAccount { it.copy(pushReminders = on) } }
            }

            Group("Appearance") {
                ChoiceRow(PartyIcons.DarkMode, "Theme") {
                    listOf(ThemeMode.System to "Automatic", ThemeMode.Light to "Day", ThemeMode.Dark to "Night").forEach { (mode, label) ->
                        ChoiceChip(label, prefs.theme == mode, { ui.prefs.update { it.copy(theme = mode) } })
                    }
                }
                Divider()
                ToggleRow(Icons.Filled.ThumbUp, "Hide like counts", "On other people's posts", prefs.hideLikeCounts) { on ->
                    ui.prefs.update { it.copy(hideLikeCounts = on) }
                }
            }

            Group("Nearby") {
                ChoiceRow(Icons.Filled.LocationOn, "Search distance") {
                    LocalPrefs.RADIUS_CHOICES.forEach { km ->
                        ChoiceChip(radiusLabel(km, prefs.miles), prefs.radiusKm == km, { ui.prefs.update { it.copy(radiusKm = km) } })
                    }
                }
                Divider()
                ChoiceRow(PartyIcons.Straighten, "Distances in") {
                    ChoiceChip("Kilometres", !prefs.miles, { ui.prefs.update { it.copy(miles = false) } })
                    ChoiceChip("Miles", prefs.miles, { ui.prefs.update { it.copy(miles = true) } })
                }
            }

            if (current?.isModerator == true) {
                Group("Moderation") {
                    InfoRow(PartyIcons.Shield, "Reports to review", onClick = { ui.nav.open(Route.Moderation) },
                        trailing = { Chevron() })
                }
            }

            Group("About") {
                InfoRow(Icons.Filled.Lock, "Privacy policy", onClick = legal.privacy, trailing = { Chevron() })
                Divider()
                InfoRow(PartyIcons.Description, "Terms", onClick = legal.terms, trailing = { Chevron() })
            }

            Group(null) {
                InfoRow(Icons.AutoMirrored.Filled.ExitToApp, "Sign out", onClick = {
                    scope.launch { ui.app.interactions.flush(); ui.app.signOut() }
                })
                Divider()
                InfoRow(
                    Icons.Filled.Delete,
                    "Delete account",
                    detail = "Permanently removes everything you posted",
                    onClick = { confirmDelete = true },
                )
            }

            Column(
                Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 32.dp).navigationBarsPadding(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Wordmark(size = 18.sp)
                Text("Made for nights out", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    if (editing && current != null) {
        EditProfileDialog(ui, current, onDismiss = { editing = false }) { me = it; editing = false }
    }
    if (confirmDelete) DeleteAccountDialog(ui) { confirmDelete = false }
    when (sheet) {
        Sheet.Relationship -> RelationshipSheet(relationship, onDismiss = { sheet = null }) { picked ->
            sheet = null
            val before = me
            me = me?.copy(relationshipStatus = picked?.wire)
            scope.launch {
                attempt { ui.api.setRelationshipStatus(picked) }
                    .onSuccess { me = it }
                    .onFailure { me = before; ui.toast(it.userMessage) }
            }
        }
        Sheet.Interests -> if (current != null) {
            InterestsSheet(interests, current.interestIds.toSet(), onDismiss = { sheet = null }) { ids ->
                sheet = null
                scope.launch {
                    attempt { ui.api.setInterests(ids.sorted()) }
                        .onSuccess { me = it }
                        .onFailure { ui.toast(it.userMessage) }
                }
            }
        }
        Sheet.Messages -> account?.let { settings ->
            MessagesSheet(settings.messagesFrom, onDismiss = { sheet = null }) { picked ->
                sheet = null
                changeAccount { it.copy(messagesFrom = picked) }
            }
        }
        null -> Unit
    }
}

/** You at the top of settings, like the account card in iOS settings. */
@Composable
private fun ProfileCard(me: OwnProfile?, onClick: () -> Unit, onAvatar: () -> Unit) {
    val name = me?.displayName ?: me?.username ?: "Your profile"
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(me?.avatarUrl, name, 60.dp, Modifier.clip(CircleShape).clickable(onClick = onAvatar), ring = true)
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(name, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false))
                RelationshipHeart(RelationshipStatus.of(me?.relationshipStatus), 20.dp)
            }
            me?.username?.let {
                Text("@$it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Chevron()
    }
}

/** A titled card of rows. */
@Composable
private fun Group(title: String?, content: @Composable ColumnScope.() -> Unit) {
    Column {
        if (title != null) {
            Text(
                title.uppercase(),
                style = Overline,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 8.dp, bottom = 8.dp),
            )
        }
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainer)
                .padding(horizontal = 12.dp, vertical = 4.dp),
            content = content,
        )
    }
}

@Composable
private fun Divider() {
    HorizontalDivider(Modifier.padding(start = 56.dp), color = MaterialTheme.colorScheme.outlineVariant, thickness = 0.5.dp)
}

@Composable
private fun Chevron() {
    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** A row with an on/off switch. [checked] is null while the setting loads. */
@Composable
private fun ToggleRow(icon: ImageVector, title: String, detail: String, checked: Boolean?, onChange: (Boolean) -> Unit) {
    InfoRow(
        icon,
        title,
        detail = detail,
        onClick = if (checked != null) ({ onChange(!checked) }) else null,
        trailing = {
            Switch(
                checked = checked == true,
                onCheckedChange = if (checked != null) onChange else null,
                enabled = checked != null,
                colors = SwitchDefaults.colors(checkedTrackColor = MaterialTheme.colorScheme.primary),
            )
        },
    )
}

/** A row whose choices sit under its title as chips. */
@Composable
private fun ChoiceRow(icon: ImageVector, title: String, chips: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconTile(icon)
            Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 12.dp))
        }
        FlowRow(
            Modifier.padding(start = 56.dp, top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) { chips() }
    }
}

/** Where people pick their heart. This is the only place the meanings are written down. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RelationshipSheet(current: RelationshipStatus?, onDismiss: () -> Unit, onPick: (RelationshipStatus?) -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        SheetBody(
            "Relationship status",
            "A small heart shows next to your name on your profile. People see the heart, never the words.",
        ) {
            (listOf<RelationshipStatus?>(null) + RelationshipStatus.entries).forEach { status ->
                OptionRow(status == current, { onPick(status) }) {
                    Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
                        if (status == null) {
                            Text("—", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            RelationshipHeart(status, 26.dp)
                        }
                    }
                    Column(Modifier.padding(start = 14.dp)) {
                        Text(status.meaning, style = MaterialTheme.typography.titleSmall)
                        Text(
                            when (status) {
                                RelationshipStatus.Taken -> "Full red heart"
                                RelationshipStatus.Talking -> "Half-filled heart"
                                RelationshipStatus.Single -> "Outlined heart"
                                null -> "Nothing next to your name"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessagesSheet(current: String, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        SheetBody("Who can message you", "Chats you already have carry on either way.") {
            listOf(
                "everyone" to ("Everyone" to "Anyone on PartyNearMe can start a chat"),
                "following" to ("People you follow" to "Others can't start a new chat with you"),
            ).forEach { (value, text) ->
                OptionRow(current == value, { onPick(value) }) {
                    Column {
                        Text(text.first, style = MaterialTheme.typography.titleSmall)
                        Text(text.second, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/** Up to 10 interests; the feed ranks parties and posts that match them higher. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InterestsSheet(all: List<Interest>, chosen: Set<Int>, onDismiss: () -> Unit, onSave: (Set<Int>) -> Unit) {
    var picked by remember { mutableStateOf(chosen) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        SheetBody("Interests", "Pick what you're into. Your feed shows more of it.") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                all.forEach { interest ->
                    ChoiceChip(interest.name, interest.id in picked, {
                        picked = if (interest.id in picked) picked - interest.id else (picked + interest.id).take(10).toSet()
                    })
                }
            }
            Spacer(Modifier.height(20.dp))
            PrimaryButton("Save", { onSave(picked) }, Modifier.fillMaxWidth(), enabled = picked != chosen)
        }
    }
}

@Composable
private fun SheetBody(title: String, body: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 32.dp).navigationBarsPadding()) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 6.dp, bottom = 16.dp))
        content()
    }
}

@Composable
private fun OptionRow(selected: Boolean, onClick: () -> Unit, content: @Composable () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(18.dp))
            .background(if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh)
            .clickable(role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) { content() }
        if (selected) Icon(Icons.Filled.Check, "Selected", tint = MaterialTheme.colorScheme.primary)
    }
}
