package com.partynearme.core

import com.partynearme.core.prefs.LocalPrefs
import com.partynearme.core.prefs.Preferences
import com.partynearme.core.prefs.ThemeMode
import com.russhwolf.settings.PreferencesSettings
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals

class PreferencesTest {
    private val node = java.util.prefs.Preferences.userRoot().node("partynearme-prefs-test-${System.nanoTime()}")

    @AfterTest
    fun cleanUp() = node.removeNode()

    @Test
    fun startsWithTheDefaultsAndRemembersChanges() {
        val first = Preferences(PreferencesSettings(node))
        assertEquals(LocalPrefs(), first.current)

        first.update { it.copy(theme = ThemeMode.Dark, miles = true, radiusKm = 10, hideLikeCounts = true) }
        assertEquals(ThemeMode.Dark, first.state.value.theme)

        val reopened = Preferences(PreferencesSettings(node))
        assertEquals(LocalPrefs(ThemeMode.Dark, miles = true, radiusKm = 10, hideLikeCounts = true), reopened.current)
    }

    @Test
    fun ignoresValuesItDoesNotKnow() {
        val settings = PreferencesSettings(node)
        settings.putString("pref_theme", "Purple")
        settings.putInt("pref_radius_km", 7)
        assertEquals(LocalPrefs(), Preferences(settings).current)
    }
}
