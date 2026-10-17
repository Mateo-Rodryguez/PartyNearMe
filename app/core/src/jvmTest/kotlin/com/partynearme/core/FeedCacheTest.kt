package com.partynearme.core

import com.partynearme.core.cache.SettingsFeedCache
import com.partynearme.core.model.Person
import com.partynearme.core.model.Post
import com.russhwolf.settings.PreferencesSettings
import java.util.prefs.Preferences
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals

class FeedCacheTest {
    private val node = Preferences.userRoot().node("partynearme-test-${System.nanoTime()}")
    private val cache = SettingsFeedCache(PreferencesSettings(node))

    @AfterTest
    fun cleanUp() = node.removeNode()

    private fun post(id: String) =
        Post(id = id, author = Person("u2"), status = "visible", likeCount = 0, likedByMe = false, createdAt = "2026-10-17T20:00:00Z")

    @Test
    fun keepsTheFirstPageForTheSameUserOnly() {
        cache.save("u1", (1..30).map { post("p$it") })
        assertEquals((1..SettingsFeedCache.MAX_POSTS).map { "p$it" }, cache.load("u1").map { it.id })
        assertEquals(emptyList(), cache.load("someone-else"))

        cache.clear()
        assertEquals(emptyList(), cache.load("u1"))
    }
}
