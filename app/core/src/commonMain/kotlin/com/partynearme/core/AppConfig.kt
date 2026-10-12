package com.partynearme.core

/** Where the app talks to. Both values are public; no secrets ship in the app. */
data class AppConfig(
    /** The PartyNearMe API on Render, without a trailing slash. */
    val apiBaseUrl: String,
    /** The Supabase project URL, for sign-in. */
    val supabaseUrl: String,
    /** Supabase's publishable (anon) key, which is safe to embed. */
    val supabaseKey: String,
)
