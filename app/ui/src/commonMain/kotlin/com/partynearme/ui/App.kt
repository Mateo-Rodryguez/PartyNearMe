package com.partynearme.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partynearme.core.PartyNearMe
import com.partynearme.core.model.OwnProfile
import com.partynearme.core.prefs.LocalPrefs
import com.partynearme.core.prefs.ThemeMode
import com.partynearme.ui.screens.BlockedScreen
import com.partynearme.ui.screens.ChatScreen
import com.partynearme.ui.screens.CommentsScreen
import com.partynearme.ui.screens.EditEventScreen
import com.partynearme.ui.screens.EmptyState
import com.partynearme.ui.screens.EventScreen
import com.partynearme.ui.screens.FeedScreen
import com.partynearme.ui.screens.FeedState
import com.partynearme.ui.screens.GuestListScreen
import com.partynearme.ui.screens.InboxScreen
import com.partynearme.ui.screens.InboxState
import com.partynearme.ui.screens.InviteScreen
import com.partynearme.ui.screens.MeScreen
import com.partynearme.ui.screens.ModerationScreen
import com.partynearme.ui.screens.NearbyScreen
import com.partynearme.ui.screens.NearbyState
import com.partynearme.ui.screens.NewEventScreen
import com.partynearme.ui.screens.NewPostScreen
import com.partynearme.ui.screens.NotificationsScreen
import com.partynearme.ui.screens.OnboardingScreen
import com.partynearme.ui.screens.PeopleScreen
import com.partynearme.ui.screens.PartyRef
import com.partynearme.ui.screens.PostScreen
import com.partynearme.ui.screens.ProfileSetupScreen
import com.partynearme.ui.screens.SavedScreen
import com.partynearme.ui.screens.SearchScreen
import com.partynearme.ui.screens.SettingsScreen
import com.partynearme.ui.screens.SignInScreen
import com.partynearme.ui.screens.UserScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Everything a screen needs from the app, passed down as one object. */
class Ui(
    val app: PartyNearMe,
    val nav: Navigator,
    val myId: String,
    val location: LocationProvider,
    val platform: Platform,
    private val scope: CoroutineScope,
    val toast: (String) -> Unit,
) {
    val api get() = app.api

    /** Counts a feature being used (see Analytics); does nothing when usage stats are off. */
    fun track(event: String, vararg properties: Pair<String, Any?>) {
        scope.launch { app.analytics.capture(event, properties.toMap()) }
    }
    /** Choices kept on this phone: theme, units, radius, like counts. */
    val prefs get() = app.preferences

    /** New notifications, for the bell on Home; cleared when they are opened. */
    var unreadNotifications by mutableIntStateOf(0)
}

/** The phone-only choices, for screens that draw differently because of them (units, like counts). */
val LocalAppPrefs = compositionLocalOf { LocalPrefs() }

@Composable
fun App(app: PartyNearMe, platform: Platform, navigator: Navigator) {
    val prefs by app.preferences.state.collectAsState()
    CompositionLocalProvider(LocalAppPrefs provides prefs) {
        PartyTheme(night = isAppNight(app)) { AppContent(app, platform, navigator) }
    }
}

/** True when the app draws its dark theme: the phone's setting unless one was picked in settings. */
@Composable
fun isAppNight(app: PartyNearMe): Boolean {
    val prefs by app.preferences.state.collectAsState()
    return when (prefs.theme) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
}

@Composable
private fun AppContent(app: PartyNearMe, platform: Platform, navigator: Navigator) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        val session by app.sessions.session.collectAsState()
        val userId = session?.userId
        if (userId == null) {
            LaunchedEffect(Unit) { navigator.reset() }
            SignInScreen(app, platform)
        } else {
            key(userId) { SignedIn(app, platform, navigator, userId) }
        }
    }
}

@Composable
private fun SignedIn(app: PartyNearMe, platform: Platform, nav: Navigator, userId: String) {
    var me by remember { mutableStateOf<OwnProfile?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attemptNo by remember { mutableIntStateOf(0) }
    // New accounts go through interests and location once, right after the username.
    var onboarding by remember { mutableStateOf(false) }
    var firstRun by remember { mutableStateOf(false) }
    LaunchedEffect(attemptNo) {
        error = null
        attempt { app.api.me() }.onSuccess { me = it }.onFailure { error = it.userMessage }
    }
    val profile = me
    when {
        profile == null && error != null -> Centered {
            EmptyState(Icons.Filled.Refresh, "Can't connect right now", body = error, action = "Try again") { attemptNo++ }
        }
        profile == null -> Centered {
            Wordmark()
            CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
        }
        profile.username == null -> ProfileSetupScreen(app, profile) { me = it; onboarding = true }
        onboarding -> OnboardingScreen(app, platform) { onboarding = false; firstRun = true }
        else -> Main(app, platform, nav, userId, firstRun)
    }
}

@Composable
private fun Main(app: PartyNearMe, platform: Platform, nav: Navigator, userId: String, firstRun: Boolean) {
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val location = platform.rememberLocationProvider()
    val pushToken = platform.rememberPushTokenProvider()
    // Ask for notifications once the account is set up, then tell the server where to send them.
    LaunchedEffect(userId) {
        app.analytics.identify(userId)
        app.analytics.capture("app_opened", mapOf("first_run" to firstRun))
        pushToken()?.let { token -> attempt { app.registerForPush(token, platform.pushPlatform) } }
    }
    val ui = remember(location) {
        Ui(app, nav, userId, location, platform, scope) { text -> scope.launch { snackbar.showSnackbar(text) } }
    }
    // Lists keep their place while you open something on top of them.
    val feed = remember { FeedState(ui, scope) }
    val nearby = remember { NearbyState(ui, scope) }
    val inbox = remember { InboxState(ui, scope) }

    var unread by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            attempt { app.api.unreadCount() }.onSuccess { unread = it }
            attempt { app.api.unreadNotifications() }.onSuccess { ui.unreadNotifications = it }
            delay(60_000)
        }
    }
    LaunchedEffect(Unit) {
        app.realtime.messages(null).collect { message ->
            if (message.senderId != userId) {
                delay(1_500) // Lets an open chat mark it read first.
                attempt { app.api.unreadCount() }.onSuccess { unread = it }
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = { TabBar(nav, unread) },
    ) { padding ->
        Box(Modifier.padding(padding).consumeWindowInsets(padding)) {
            when (val route = nav.top) {
                is Route.Event -> EventScreen(ui, route.id)
                is Route.NewEvent -> NewEventScreen(ui, route.pickOnMap) { nearby.paged.refresh() }
                is Route.EditEvent -> EditEventScreen(ui, route.id)
                is Route.User -> UserScreen(ui, route.id)
                is Route.Chat -> ChatScreen(ui, route.conversationId, route.title) { inbox.paged.refresh() }
                is Route.Post -> PostScreen(ui, route.id)
                is Route.Comments -> CommentsScreen(ui, route.postId)
                is Route.NewPost -> NewPostScreen(ui, PartyRef(route.eventId, route.eventTitle)) { feed.paged.refresh() }
                Route.Moderation -> ModerationScreen(ui)
                Route.Notifications -> NotificationsScreen(ui)
                is Route.Settings -> SettingsScreen(ui, route.relationshipPicker)
                is Route.Search -> SearchScreen(ui, route.query)
                is Route.People -> PeopleScreen(ui, route.userId, route.followers, route.title)
                Route.Saved -> SavedScreen(ui)
                Route.Blocked -> BlockedScreen(ui)
                is Route.Invite -> InviteScreen(ui, route.eventId, route.eventTitle)
                is Route.Guests -> GuestListScreen(ui, route.eventId, route.eventTitle)
                null -> when (nav.tab) {
                    Tab.Feed -> FeedScreen(ui, feed, nearby)
                    Tab.Nearby -> NearbyScreen(ui, nearby)
                    Tab.Post -> NewPostScreen(ui) { feed.paged.refresh() }
                    Tab.Chat -> InboxScreen(ui, inbox)
                    Tab.Me -> MeScreen(ui)
                }
            }
        }
    }
}

/** The tab bar: outlined icons that fill in when chosen, and a gradient "+" in the middle, TikTok style. */
@Composable
private fun TabBar(nav: Navigator, unread: Int) {
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 0.5.dp)
        Row(
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars).height(60.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TabItem(nav, Tab.Feed, Icons.Filled.Home, Icons.Outlined.Home, "Home")
            TabItem(nav, Tab.Nearby, Icons.Filled.Place, Icons.Outlined.Place, "Nearby")
            Box(
                Modifier.weight(1f).fillMaxHeight().clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Tab,
                    onClickLabel = "New post",
                ) { nav.select(Tab.Post) },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.size(width = 48.dp, height = 34.dp).clip(RoundedCornerShape(12.dp)).background(Brand.gradient),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Add, "New post", tint = Color.White) }
            }
            TabItem(nav, Tab.Chat, Icons.Filled.Email, Icons.Outlined.Email, "Messages", badge = unread)
            TabItem(nav, Tab.Me, Icons.Filled.AccountCircle, Icons.Outlined.AccountCircle, "Profile")
        }
    }
}

@Composable
private fun RowScope.TabItem(
    nav: Navigator,
    tab: Tab,
    selectedIcon: ImageVector,
    icon: ImageVector,
    label: String,
    badge: Int = 0,
) {
    val selected = nav.tab == tab
    val color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        Modifier.weight(1f).fillMaxHeight().clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            role = Role.Tab,
        ) { nav.select(tab) },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box {
            Icon(if (selected) selectedIcon else icon, label, Modifier.size(26.dp), tint = color)
            if (badge > 0) {
                Box(
                    Modifier.align(Alignment.TopEnd).offset(x = 8.dp, y = (-4).dp)
                        .clip(CircleShape).background(MaterialTheme.colorScheme.primary)
                        .border(2.dp, MaterialTheme.colorScheme.background, CircleShape)
                        .padding(horizontal = 5.dp, vertical = 1.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (badge > 99) "99+" else badge.toString(), color = Color.White, fontSize = 10.sp,
                        fontWeight = FontWeight.Bold)
                }
            }
        }
        Text(label, fontSize = 10.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium, color = color,
            modifier = Modifier.padding(top = 2.dp))
    }
}

/** "PartyNearMe" in the brand gradient. */
@Composable
fun Wordmark(modifier: Modifier = Modifier, size: TextUnit = 34.sp) {
    Text(
        "PartyNearMe",
        modifier = modifier,
        style = MaterialTheme.typography.headlineLarge.copy(brush = Brand.sunset, fontSize = size),
        fontWeight = FontWeight.Black,
    )
}

@Composable
fun Centered(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
