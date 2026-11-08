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
    /** Sends anonymous usage counts (see Analytics); people can turn it off in settings. */
    val shareUsage: Boolean = true,
    /** Days (since 1970) for the "would you recommend us?" card: first and latest day the app was used. */
    val firstActiveDay: Long = 0,
    val lastActiveDay: Long = 0,
    /** How many different days the app has been used on. */
    val activeDays: Int = 0,
    /** When the recommend card was last answered or closed; 0 for never. */
    val recommendAskedDay: Long = 0,
    /** Parties sorted by date instead of For you (ranked by what this person likes). */
    val partiesSoonest: Boolean = false,
) {
    /** Counts [today] as a day the app was used. */
    fun activeOn(today: Long): LocalPrefs = when {
        today == lastActiveDay -> this
        else -> copy(
            firstActiveDay = if (firstActiveDay == 0L) today else firstActiveDay,
            lastActiveDay = today,
            activeDays = activeDays + 1,
        )
    }

    /**
     * True when it's time to ask "would you recommend PartyNearMe to a friend?":
     * only once someone knows the app (used on 3+ days over at least a week), and
     * then at most every 90 days, so it never nags.
     */
    fun recommendDue(today: Long): Boolean =
        activeDays >= 3 && firstActiveDay > 0 && today - firstActiveDay >= 7 &&
            (recommendAskedDay == 0L || today - recommendAskedDay >= 90)

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
            putBoolean(SHARE_USAGE, next.shareUsage)
            putLong(FIRST_ACTIVE, next.firstActiveDay)
            putLong(LAST_ACTIVE, next.lastActiveDay)
            putInt(ACTIVE_DAYS, next.activeDays)
            putLong(RECOMMEND_ASKED, next.recommendAskedDay)
            putBoolean(PARTIES_SOONEST, next.partiesSoonest)
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
            shareUsage = s.getBoolean(SHARE_USAGE, defaults.shareUsage),
            firstActiveDay = s.getLong(FIRST_ACTIVE, 0),
            lastActiveDay = s.getLong(LAST_ACTIVE, 0),
            activeDays = s.getInt(ACTIVE_DAYS, 0),
            recommendAskedDay = s.getLong(RECOMMEND_ASKED, 0),
            partiesSoonest = s.getBoolean(PARTIES_SOONEST, false),
        )
    }

    private companion object {
        const val THEME = "pref_theme"
        const val MILES = "pref_miles"
        const val RADIUS = "pref_radius_km"
        const val HIDE_LIKES = "pref_hide_like_counts"
        const val SHARE_USAGE = "pref_share_usage"
        const val FIRST_ACTIVE = "pref_first_active_day"
        const val LAST_ACTIVE = "pref_last_active_day"
        const val ACTIVE_DAYS = "pref_active_days"
        const val RECOMMEND_ASKED = "pref_recommend_asked_day"
        const val PARTIES_SOONEST = "pref_parties_soonest"
    }
}
