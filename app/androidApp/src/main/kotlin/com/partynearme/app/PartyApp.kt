package com.partynearme.app

import android.app.Application
import android.content.Context
import com.partynearme.core.AppConfig
import com.partynearme.core.PartyNearMe
import com.partynearme.core.auth.SettingsSessionStore
import com.partynearme.ui.Navigator
import com.russhwolf.settings.SharedPreferencesSettings
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.MainScope

/** Public values only: the anon key is meant to ship in apps, and RLS protects the data. */
private val CONFIG = AppConfig(
    apiBaseUrl = "https://partynearme-api.onrender.com",
    supabaseUrl = "https://vvkckzrhzgdrazhjitse.supabase.co",
    supabaseKey = "sb_publishable_lU8CqYjRgUy5kr9Y8QbBNQ_NiPtoCil",
)

class PartyApp : Application() {
    lateinit var core: PartyNearMe
        private set
    val navigator = Navigator()
    val scope = MainScope()

    override fun onCreate() {
        super.onCreate()
        val prefs = getSharedPreferences("partynearme", Context.MODE_PRIVATE)
        core = PartyNearMe(CONFIG, SettingsSessionStore(SharedPreferencesSettings(prefs)), OkHttp.create())
        createPushChannel(this)
    }
}
