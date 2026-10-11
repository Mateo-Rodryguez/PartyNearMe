// Plugins go on the root classpath once, so every module shares the same
// Kotlin and Android plugin classes.
buildscript {
    val noAndroid = providers.gradleProperty("pnm.noAndroid").isPresent
    repositories {
        if (!noAndroid) google()
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        classpath(libs.kotlin.gradlePlugin)
        classpath(libs.kotlin.serializationPlugin)
        classpath(libs.kotlin.composeCompilerPlugin)
        classpath(libs.compose.gradlePlugin)
        if (!noAndroid) classpath(libs.android.gradlePlugin)
    }
}
