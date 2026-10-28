package com.partynearme.app

import kotlinx.coroutines.CompletableDeferred

/**
 * Hands the partynearme://auth-callback address from the activity to the sign-in
 * that is waiting for it. Only one browser sign-in runs at a time.
 */
object AuthRedirect {
    private var waiting: CompletableDeferred<String?>? = null

    fun start(): CompletableDeferred<String?> {
        waiting?.complete(null)
        return CompletableDeferred<String?>().also { waiting = it }
    }

    /** The browser came back with this address. */
    fun arrived(url: String) {
        waiting?.complete(url)
        waiting = null
    }

    /** The app is in front again without an address: the user closed the browser. */
    fun abandoned() {
        waiting?.complete(null)
        waiting = null
    }

    val isWaiting: Boolean get() = waiting != null
}
