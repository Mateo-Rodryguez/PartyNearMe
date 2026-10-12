plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.compose")
}

// Sample data for screenshots, linked only into debug builds (Android) and
// switched on only in debug binaries (iOS).
apply(from = "android.gradle")

kotlin {
    iosArm64()
    iosSimulatorArm64()

    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain.dependencies {
            implementation(project(":ui"))
            implementation(libs.compose.runtime)
            implementation(libs.ktor.client.mock)
        }
    }
}
