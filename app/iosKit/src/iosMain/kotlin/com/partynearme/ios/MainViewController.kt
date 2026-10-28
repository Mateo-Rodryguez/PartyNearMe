package com.partynearme.ios

import androidx.compose.ui.window.ComposeUIViewController
import com.partynearme.core.AppConfig
import com.partynearme.core.PartyNearMe
import com.partynearme.core.auth.SettingsSessionStore
import com.partynearme.core.cache.SettingsFeedCache
import com.partynearme.core.prefs.Preferences
import com.partynearme.core.prefs.ThemeMode
import com.partynearme.demo.Demo
import com.partynearme.ui.App
import com.partynearme.ui.Navigator
import com.partynearme.ui.openLink
import com.russhwolf.settings.NSUserDefaultsSettings
import io.ktor.client.engine.darwin.Darwin
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import platform.Foundation.NSNotificationCenter
import platform.Foundation.NSOperationQueue
import platform.Foundation.NSUserDefaults
import platform.UIKit.UIApplicationDidEnterBackgroundNotification
import platform.UIKit.UIUserInterfaceStyle
import platform.UIKit.UIViewController
import kotlin.experimental.ExperimentalNativeApi

/** Public values only: the publishable key is meant to ship in apps, and RLS protects the data. */
private val CONFIG = AppConfig(
    apiBaseUrl = "https://partynearme-api.onrender.com",
    supabaseUrl = "https://vvkckzrhzgdrazhjitse.supabase.co",
    supabaseKey = "sb_publishable_lU8CqYjRgUy5kr9Y8QbBNQ_NiPtoCil",
    // Usage stats stay off until the PostHog project key goes here (docs/deploy.md).
    posthogKey = null,
)

/** Called once by the Swift app to get the whole UI. */
@Suppress("FunctionName", "unused")
fun MainViewController(): UIViewController {
    val defaults = NSUserDefaults.standardUserDefaults
    val demo = demoScreen(defaults)?.let { Demo.setUp(it) }
    val core = demo?.core ?: NSUserDefaultsSettings(defaults).let { settings ->
        PartyNearMe(
            CONFIG, SettingsSessionStore(settings), Darwin.create(),
            feedCache = SettingsFeedCache(settings), preferences = Preferences(settings), platform = "ios",
        )
    }
    val platform = demo?.platform ?: IosPlatform()
    val nav = demo?.navigator ?: Navigator()
    navigator = nav

    // Send what the user looked at before the app goes to the background.
    val scope = MainScope()
    NSNotificationCenter.defaultCenter.addObserverForName(
        UIApplicationDidEnterBackgroundNotification, null, NSOperationQueue.mainQueue,
    ) { _ -> scope.launch { core.interactions.flush(); core.analytics.flush() } }

    val controller = ComposeUIViewController { App(core, platform, nav) }
    // A theme picked in settings overrides the phone's, so the status bar matches the app.
    scope.launch {
        core.preferences.state.collect { prefs ->
            controller.overrideUserInterfaceStyle = when (prefs.theme) {
                ThemeMode.System -> UIUserInterfaceStyle.UIUserInterfaceStyleUnspecified
                ThemeMode.Light -> UIUserInterfaceStyle.UIUserInterfaceStyleLight
                ThemeMode.Dark -> UIUserInterfaceStyle.UIUserInterfaceStyleDark
            }
        }
    }
    return controller
}

private var navigator: Navigator? = null

/** Called by the Swift app when a partynearme:// link opens it: a shared party or post. */
@Suppress("unused")
fun openLink(url: String) {
    navigator?.openLink(url)
}

/**
 * Debug builds only: launching with `-demo feed` (for example
 * `xcrun simctl launch booted com.partynearme.app -demo feed`) opens the app on
 * sample data at that screen. CI uses it to screenshot every screen.
 */
@OptIn(ExperimentalNativeApi::class)
private fun demoScreen(defaults: NSUserDefaults): String? =
    if (kotlin.native.Platform.isDebugBinary) defaults.stringForKey("demo") else null
