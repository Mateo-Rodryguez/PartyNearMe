package com.partynearme.core

/** Where the app talks to. Both values are public; no secrets ship in the app. */
data class AppConfig(
    /** The PartyNearMe API on Render, without a trailing slash. */
    val apiBaseUrl: String,
    /** The Supabase project URL, for sign-in. */
    val supabaseUrl: String,
    /** Supabase's publishable (anon) key, which is safe to embed. */
    val supabaseKey: String,
) {
    /** Links starting with this open the app: browser sign-in coming back, and shared parties and posts. */
    val appScheme: String get() = "partynearme"

    /** Where browser sign-in (Google, later Apple) returns to. Supabase must allow it under Redirect URLs. */
    val authCallback: String get() = "$appScheme://auth-callback"

    /** The web page the password reset email leads to. */
    val resetPasswordPage: String get() = "$apiBaseUrl/reset-password"

    /** Share links: public pages with a preview and an "Open in PartyNearMe" button. */
    fun partyLink(id: String): String = "$apiBaseUrl/e/$id"
    fun postLink(id: String): String = "$apiBaseUrl/p/$id"
}
