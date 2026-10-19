package com.partynearme.core.prefs

import com.russhwolf.settings.Settings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ThemeMode { System, Light, Dark }

/** Choices that only change how this phone shows things, so they stay on the phone. */
data class LocalPrefs(
    val theme: ThemeMode = ThemeMode.System,
    /** Distances in miles instead of kilometres. */
    val miles: Boolean = false,
    /** How far Nearby and the party row on Home look for parties. */
    val radiusKm: Int = 25,
    /** Hides like counts on other people's posts, as Instagram allows. */
    val hideLikeCounts: Boolean = false,
) {
    companion object {
        val RADIUS_CHOICES = listOf(5, 10, 25, 50)
    }
}

/** Keeps [LocalPrefs] in the phone's app settings; with no settings (tests, the demo) they live in memory. */
class Preferences(private val settings: Settings? = null) {
    private val _state = MutableStateFlow(load())
    val state: StateFlow<LocalPrefs> = _state.asStateFlow()
    val current: LocalPrefs get() = _state.value

    fun update(transform: (LocalPrefs) -> LocalPrefs) {
        val next = transform(_state.value)
        _state.value = next
        settings?.run {
            putString(THEME, next.theme.name)
            putBoolean(MILES, next.miles)
            putInt(RADIUS, next.radiusKm)
            putBoolean(HIDE_LIKES, next.hideLikeCounts)
        }
    }

    private fun load(): LocalPrefs {
        val s = settings ?: return LocalPrefs()
        val defaults = LocalPrefs()
        return LocalPrefs(
            theme = ThemeMode.entries.firstOrNull { it.name == s.getStringOrNull(THEME) } ?: defaults.theme,
            miles = s.getBoolean(MILES, defaults.miles),
            radiusKm = s.getInt(RADIUS, defaults.radiusKm).takeIf { it in LocalPrefs.RADIUS_CHOICES } ?: defaults.radiusKm,
            hideLikeCounts = s.getBoolean(HIDE_LIKES, defaults.hideLikeCounts),
        )
    }

    private companion object {
        const val THEME = "pref_theme"
        const val MILES = "pref_miles"
        const val RADIUS = "pref_radius_km"
        const val HIDE_LIKES = "pref_hide_like_counts"
    }
}
