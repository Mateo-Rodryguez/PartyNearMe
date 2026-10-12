import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Networking, models and session logic shared by Android and iOS. Also built
// for the plain JVM, so its tests run anywhere without the Android SDK.
val noAndroid = providers.gradleProperty("pnm.noAndroid").isPresent
if (!noAndroid) apply(from = "android.gradle")

kotlin {
    jvm {
        compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
    }
    iosArm64()
    iosSimulatorArm64()

    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain.dependencies {
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.contentNegotiation)
            implementation(libs.ktor.serialization.json)
            implementation(libs.kotlinx.coroutines.core)
            api(libs.kotlinx.serialization.json)
            api(libs.multiplatform.settings)
        }
        jvmMain.dependencies { implementation(libs.ktor.client.okhttp) }
        if (!noAndroid) {
            androidMain.dependencies { implementation(libs.ktor.client.okhttp) }
        }
        iosMain.dependencies { implementation(libs.ktor.client.darwin) }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.ktor.client.mock)
            implementation(libs.kotlinx.coroutines.test)
        }
    }
}
