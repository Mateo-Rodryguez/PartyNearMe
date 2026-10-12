package com.partynearme.app

import android.content.Intent
import com.partynearme.ui.DemoSetup

/**
 * Debug builds only: `adb shell am start -n com.partynearme.app/.MainActivity --es demo feed`
 * opens the app on sample data at the named screen (see the demo module).
 */
object Demo {
    fun setUp(intent: Intent): DemoSetup? = intent.getStringExtra("demo")?.let { com.partynearme.demo.Demo.setUp(it) }
}
