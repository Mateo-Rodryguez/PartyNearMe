package com.partynearme.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

enum class Tab { Feed, Nearby, Post, Chat, Me }

/** Screens opened on top of a tab. */
sealed interface Route {
    data class Event(val id: String) : Route
    /** [pickOnMap] opens straight onto the map, for screenshots. */
    data class NewEvent(val pickOnMap: Boolean = false) : Route
    /** The party form for one of your parties. */
    data class EditEvent(val id: String) : Route
    data class User(val id: String) : Route
    data class Chat(val conversationId: String, val title: String) : Route
    data class Post(val id: String) : Route
    /** A post's comments, newest first, with a box to add yours. */
    data class Comments(val postId: String) : Route
    /** The new-post screen opened from a party, with that party already picked. */
    data class NewPost(val eventId: String, val eventTitle: String) : Route
    /** Likes, follows, RSVPs and reminders, opened from the bell on Home. */
    data object Notifications : Route
    /** Open reports, for moderators. */
    data object Moderation : Route
    /** Settings, from the gear on your profile. [relationshipPicker] opens straight onto it, for screenshots. */
    data class Settings(val relationshipPicker: Boolean = false) : Route
    /** Finding people by name, from the magnifier on Home. [query] fills the box, for screenshots. */
    data class Search(val query: String = "") : Route
    /** Someone's followers, or the people they follow. */
    data class People(val userId: String, val followers: Boolean, val title: String) : Route
    /** Saved posts and parties. */
    data object Saved : Route
    /** People you blocked, from settings. */
    data object Blocked : Route
    /** Picking people to invite to a party; each gets the invite in a chat. */
    data class Invite(val eventId: String, val eventTitle: String) : Route
}

/** A back stack per tab, like Instagram: switching tabs keeps where you were. */
class Navigator {
    var tab by mutableStateOf(Tab.Feed)
        private set
    private val stacks = Tab.entries.associateWith { mutableStateListOf<Route>() }

    val top: Route? get() = stacks.getValue(tab).lastOrNull()
    val canGoBack: Boolean get() = stacks.getValue(tab).isNotEmpty() || tab != Tab.Feed

    fun open(route: Route) {
        stacks.getValue(tab).add(route)
    }

    fun select(target: Tab) {
        // Tapping the current tab again goes back to its start.
        if (target == tab) stacks.getValue(tab).clear() else tab = target
    }

    fun back(): Boolean {
        val stack = stacks.getValue(tab)
        return when {
            stack.isNotEmpty() -> { stack.removeAt(stack.lastIndex); true }
            tab != Tab.Feed -> { tab = Tab.Feed; true }
            else -> false
        }
    }

    fun reset() {
        stacks.values.forEach { it.clear() }
        tab = Tab.Feed
    }
}
