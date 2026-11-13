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

/**
 * Release signing with the Play upload key, read from the environment so the key never
 * touches the repo. CI writes the key file from GitHub secrets (see
 * .github/workflows/android-release.yml). Without them a release build is unsigned,
 * which is enough to check that it builds.
 */
val uploadKeystore: String? = System.getenv("ANDROID_KEYSTORE_FILE")?.takeIf { file(it).exists() }

android {
    namespace = "com.partynearme.app"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        // Permanent once the app is on Google Play.
        applicationId = "com.partynearme.app"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        // Every upload to Play needs a higher versionCode; CI passes its run number.
        versionCode = System.getenv("VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = System.getenv("VERSION_NAME") ?: "0.1.0"
        // The same string resources Google's plugin would generate; Firebase starts from them.
        firebase.forEach { (name, value) -> resValue("string", name, value) }
        manifestPlaceholders["sentryEnvironment"] = "production"
    }
    signingConfigs {
        if (uploadKeystore != null) {
            create("upload") {
                storeFile = file(uploadKeystore)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                // An unset GitHub secret arrives as an empty string, not as no variable.
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")?.takeIf { it.isNotEmpty() }
                    ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("release") {
            if (uploadKeystore != null) signingConfig = signingConfigs.getByName("upload")
        }
        // Crashes from debug builds (CI, the emulator, test APKs) are kept apart in Sentry.
        getByName("debug") { manifestPlaceholders["sentryEnvironment"] = "debug" }
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
    implementation(libs.androidx.browser)
    implementation(libs.ktor.client.okhttp)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.sentry.android)
    // Demo mode (debug builds only): sample data for screenshots on an emulator.
    debugImplementation(project(":demo"))
}
