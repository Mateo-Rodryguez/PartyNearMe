plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.compose")
}

// Sample data for screenshots, linked only into debug builds.
apply(from = "android.gradle")

kotlin {
    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain.dependencies {
            implementation(project(":ui"))
            implementation(libs.compose.runtime)
            implementation(libs.ktor.client.mock)
        }
    }
}
