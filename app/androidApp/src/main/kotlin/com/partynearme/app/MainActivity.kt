package com.partynearme.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.partynearme.ui.App
import com.partynearme.ui.Route
import com.partynearme.ui.Tab
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val app get() = application as PartyApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val demo = Demo.setUp(intent)
        val core = demo?.core ?: app.core
        val platform = demo?.platform ?: AndroidPlatform(this)
        val nav = demo?.navigator ?: app.navigator
        if (demo == null && savedInstanceState == null) openFromNotification(intent)
        setContent {
            BackHandler(enabled = nav.canGoBack) { nav.back() }
            App(core, platform, nav)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openFromNotification(intent)
    }

    /** A tapped notification carries what it was about; open that screen. */
    private fun openFromNotification(intent: Intent) {
        val nav = app.navigator
        when (intent.getStringExtra("type")) {
            "message" -> intent.getStringExtra("conversation_id")?.let {
                nav.select(Tab.Chat)
                nav.open(Route.Chat(it, "Chat"))
            }
            "rsvp", "event_reminder" -> intent.getStringExtra("event_id")?.let {
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
