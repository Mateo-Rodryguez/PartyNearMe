rootProject.name = "partynearme"

// `-Ppnm.noAndroid` leaves out Android, building the shared code for the plain
// JVM only: handy where Google's Maven repository isn't reachable.
val noAndroid = providers.gradleProperty("pnm.noAndroid").isPresent

dependencyResolutionManagement {
    repositories {
        if (!noAndroid) google()
        mavenCentral()
    }
}

include(":core")
// Compose Multiplatform needs Google's Maven repository even for its JVM parts.
if (!noAndroid) include(":ui", ":demo", ":androidApp", ":iosKit")
