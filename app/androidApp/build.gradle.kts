import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

/**
 * Firebase settings for push notifications, from the `google-services.json` that the
 * Firebase console gives out (public IDs, not secrets). Without the file the app builds
 * and runs as before, just without push. Read here rather than with Google's plugin,
 * which keeps the build free of one more plugin to keep in step with AGP.
 */
val firebase: Map<String, String> = file("google-services.json").takeIf { it.exists() }?.let { json ->
    @Suppress("UNCHECKED_CAST")
    val root = JsonSlurper().parse(json) as Map<String, Any?>
    val project = root["project_info"] as Map<String, Any?>
    val client = (root["client"] as List<Map<String, Any?>>).first {
        val info = it["client_info"] as Map<String, Any?>
        (info["android_client_info"] as Map<String, Any?>)["package_name"] == "com.partynearme.app"
    }
    mapOf(
        "google_app_id" to (client["client_info"] as Map<String, Any?>)["mobilesdk_app_id"] as String,
        "gcm_defaultSenderId" to project["project_number"] as String,
        "project_id" to project["project_id"] as String,
        "google_api_key" to ((client["api_key"] as List<Map<String, Any?>>).first()["current_key"] as String),
    )
} ?: emptyMap()

android {
    namespace = "com.partynearme.app"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        // Permanent once the app is on Google Play.
        applicationId = "com.partynearme.app"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.1.0"
        // The same string resources Google's plugin would generate; Firebase starts from them.
        firebase.forEach { (name, value) -> resValue("string", name, value) }
    }
    buildFeatures {
        compose = true
        resValues = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(project(":ui"))
    implementation(libs.androidx.activity.compose)
    implementation(libs.ktor.client.okhttp)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.kotlinx.coroutines.play.services)
    // Demo mode (debug builds only): sample data for screenshots on an emulator.
    debugImplementation(project(":demo"))
}
