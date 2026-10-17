package com.partynearme.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.partynearme.core.PartyNearMe
import com.partynearme.core.model.OwnProfile
import com.partynearme.ui.screens.ChatScreen
import com.partynearme.ui.screens.EventScreen
import com.partynearme.ui.screens.FeedScreen
import com.partynearme.ui.screens.FeedState
import com.partynearme.ui.screens.InboxScreen
import com.partynearme.ui.screens.InboxState
import com.partynearme.ui.screens.MeScreen
import com.partynearme.ui.screens.NearbyScreen
import com.partynearme.ui.screens.NearbyState
import com.partynearme.ui.screens.NewEventScreen
import com.partynearme.ui.screens.NewPostScreen
import com.partynearme.ui.screens.PartyRef
import com.partynearme.ui.screens.PostScreen
import com.partynearme.ui.screens.ProfileSetupScreen
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
    val toast: (String) -> Unit,
) {
    val api get() = app.api
}

@Composable
fun App(app: PartyNearMe, platform: Platform, navigator: Navigator) {
    PartyTheme {
        Surface(Modifier.fillMaxSize()) {
            val session by app.sessions.session.collectAsState()
            val userId = session?.userId
            if (userId == null) {
                LaunchedEffect(Unit) { navigator.reset() }
                SignInScreen(app)
            } else {
                key(userId) { SignedIn(app, platform, navigator, userId) }
            }
        }
    }
}

@Composable
private fun SignedIn(app: PartyNearMe, platform: Platform, nav: Navigator, userId: String) {
    var me by remember { mutableStateOf<OwnProfile?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attemptNo by remember { mutableIntStateOf(0) }
    LaunchedEffect(attemptNo) {
        error = null
        attempt { app.api.me() }.onSuccess { me = it }.onFailure { error = it.userMessage }
    }
    val profile = me
    when {
        profile == null && error != null -> Centered {
            Text(error!!)
            Button(onClick = { attemptNo++ }) { Text("Try again") }
        }
        profile == null -> Centered {
            CircularProgressIndicator()
            Text("Connecting…")
        }
        profile.username == null -> ProfileSetupScreen(app, profile) { me = it }
        else -> Main(app, platform, nav, userId)
    }
}

@Composable
private fun Main(app: PartyNearMe, platform: Platform, nav: Navigator, userId: String) {
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val location = platform.rememberLocationProvider()
    val pushToken = platform.rememberPushTokenProvider()
    // Ask for notifications once the account is set up, then tell the server where to send them.
    LaunchedEffect(userId) {
        pushToken()?.let { token -> attempt { app.registerForPush(token, platform.pushPlatform) } }
    }
    val ui = remember(location) {
        Ui(app, nav, userId, location, platform) { text -> scope.launch { snackbar.showSnackbar(text) } }
    }
    // Lists keep their place while you open something on top of them.
    val feed = remember { FeedState(ui, scope) }
    val nearby = remember { NearbyState(ui, scope) }
    val inbox = remember { InboxState(ui, scope) }

    var unread by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            attempt { app.api.unreadCount() }.onSuccess { unread = it }
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
        bottomBar = {
            NavigationBar {
                TabItem(nav, Tab.Feed, Icons.Filled.Home, "Feed")
                TabItem(nav, Tab.Nearby, Icons.Filled.Place, "Nearby")
                TabItem(nav, Tab.Post, Icons.Filled.AddCircle, "Post")
                TabItem(nav, Tab.Chat, Icons.Filled.Email, "Chat", badge = unread)
                TabItem(nav, Tab.Me, Icons.Filled.AccountCircle, "Profile")
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).consumeWindowInsets(padding)) {
            when (val route = nav.top) {
                is Route.Event -> EventScreen(ui, route.id)
                is Route.NewEvent -> NewEventScreen(ui, route.pickOnMap) { nearby.paged.refresh() }
                is Route.User -> UserScreen(ui, route.id)
                is Route.Chat -> ChatScreen(ui, route.conversationId, route.title) { inbox.paged.refresh() }
                is Route.Post -> PostScreen(ui, route.id)
                is Route.NewPost -> NewPostScreen(ui, PartyRef(route.eventId, route.eventTitle)) { feed.paged.refresh() }
                null -> when (nav.tab) {
                    Tab.Feed -> FeedScreen(ui, feed)
                    Tab.Nearby -> NearbyScreen(ui, nearby)
                    Tab.Post -> NewPostScreen(ui) { feed.paged.refresh() }
                    Tab.Chat -> InboxScreen(ui, inbox)
                    Tab.Me -> MeScreen(ui)
                }
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TabItem(
    nav: Navigator,
    tab: Tab,
    icon: ImageVector,
    label: String,
    badge: Int = 0,
) {
    NavigationBarItem(
        selected = nav.tab == tab,
        onClick = { nav.select(tab) },
        icon = {
            if (badge > 0) {
                BadgedBox(badge = { Badge { Text(if (badge > 99) "99+" else badge.toString()) } }) { Icon(icon, label) }
            } else {
                Icon(icon, label)
            }
        },
        label = { Text(label) },
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
