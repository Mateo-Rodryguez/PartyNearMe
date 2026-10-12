plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.compose")
}

// The iPhone side of the app: the screens from :ui plus the iOS photo picker,
// location and settings, packed as one framework that the Xcode project links.
kotlin {
    listOf(iosArm64(), iosSimulatorArm64()).forEach {
        it.binaries.framework {
            baseName = "PartyNearMeKit"
            isStatic = true
        }
    }

    applyDefaultHierarchyTemplate()

    sourceSets {
        iosMain.dependencies {
            implementation(project(":ui"))
            implementation(project(":demo"))
            implementation(libs.compose.runtime)
            implementation(libs.compose.ui)
            implementation(libs.ktor.client.darwin)
        }
    }
}
