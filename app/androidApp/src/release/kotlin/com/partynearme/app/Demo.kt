package com.partynearme.app

import android.content.Intent
import com.partynearme.ui.DemoSetup

/** Release builds never run the demo. */
object Demo {
    @Suppress("UNUSED_PARAMETER")
    fun setUp(intent: Intent): DemoSetup? = null
}
