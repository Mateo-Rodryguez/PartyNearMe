package com.partynearme.app

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import com.partynearme.ui.App
import com.partynearme.ui.isAppNight
import com.partynearme.ui.Route
import com.partynearme.ui.Tab
import com.partynearme.ui.openLink
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val app get() = application as PartyApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The app follows the system's light or dark setting, and so do the bar icons.
        enableEdgeToEdge()
        val demo = Demo.setUp(intent)
        val core = demo?.core ?: app.core
        val platform = demo?.platform ?: AndroidPlatform(this)
        val nav = demo?.navigator ?: app.navigator
        if (demo == null && savedInstanceState == null) {
            openFromNotification(intent)
            openLink(intent)
        }
        setContent {
            // A theme picked in settings can differ from the phone's, so the bar icons follow the app's.
            val dark = isAppNight(core)
            LaunchedEffect(dark) {
                val style = if (dark) {
                    SystemBarStyle.dark(Color.TRANSPARENT)
                } else {
                    SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                }
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
            }
            BackHandler(enabled = nav.canGoBack) { nav.back() }
            App(core, platform, nav)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openFromNotification(intent)
        openLink(intent)
    }

    override fun onResume() {
        super.onResume()
        // Back from the sign-in browser without its address (onNewIntent comes first): the user closed it.
        if (AuthRedirect.isWaiting) window.decorView.postDelayed({ AuthRedirect.abandoned() }, 1_500)
    }

    /** partynearme:// links: Google sign-in coming back, or a shared party or post to open. */
    private fun openLink(intent: Intent) {
        val url = intent.dataString ?: return
        if (url.startsWith("partynearme://auth-callback")) AuthRedirect.arrived(url) else app.navigator.openLink(url)
        intent.data = null
    }

    /** A tapped notification carries what it was about; open that screen. */
    private fun openFromNotification(intent: Intent) {
        val nav = app.navigator
        when (intent.getStringExtra("type")) {
            "message" -> intent.getStringExtra("conversation_id")?.let {
                nav.select(Tab.Chat)
                nav.open(Route.Chat(it, "Chat"))
            }
            "comment" -> intent.getStringExtra("post_id")?.let {
                nav.select(Tab.Feed)
                nav.open(Route.Comments(it))
            }
            "rsvp", "event_reminder", "event_cancelled" -> intent.getStringExtra("event_id")?.let {
                nav.select(Tab.Nearby)
                nav.open(Route.Event(it))
            }
        }
        intent.removeExtra("type")
    }

    override fun onStop() {
        super.onStop()
        // Send what the user looked at before the app goes to the background.
        app.scope.launch { app.core.interactions.flush() }
    }
}
