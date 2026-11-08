package com.partynearme.ui

import kotlin.time.Clock

/**
 * The name each screen is counted under in analytics. These are part of the
 * event contract shared with the iPhone app (docs/analytics.md), so renaming
 * one splits its history in two: add new names rather than changing old ones.
 */
fun screenName(route: Route?, tab: Tab): String = when (route) {
    null -> when (tab) {
        Tab.Feed -> "home"
        Tab.Nearby -> "nearby"
        Tab.Post -> "new_post"
        Tab.Chat -> "inbox"
        Tab.Me -> "my_profile"
    }
    is Route.Event -> "party"
    is Route.NewEvent -> "new_party"
    is Route.EditEvent -> "edit_party"
    is Route.User -> "profile"
    is Route.Chat -> "chat"
    is Route.Post -> "post"
    is Route.Comments -> "comments"
    is Route.NewPost -> "new_post"
    Route.Notifications -> "notifications"
    Route.Moderation -> "moderation"
    is Route.Settings -> "settings"
    is Route.Search -> "search"
    is Route.People -> if (route.followers) "followers" else "following"
    Route.Saved -> "saved"
    Route.Blocked -> "blocked"
    is Route.Invite -> "invite"
    is Route.Guests -> "guest_list"
    Route.Feedback -> "feedback"
}

/** Today as a day number (days since 1970, UTC), for the once-a-day counters in LocalPrefs. */
fun today(): Long = Clock.System.now().epochSeconds / 86_400
