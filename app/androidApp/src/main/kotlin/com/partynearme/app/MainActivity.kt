package com.partynearme.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.partynearme.ui.App
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val app get() = application as PartyApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val platform = AndroidPlatform(this)
        setContent {
            val nav = app.navigator
            BackHandler(enabled = nav.canGoBack) { nav.back() }
            App(app.core, platform, nav)
        }
    }

    override fun onStop() {
        super.onStop()
        // Send what the user looked at before the app goes to the background.
        app.scope.launch { app.core.interactions.flush() }
    }
}
