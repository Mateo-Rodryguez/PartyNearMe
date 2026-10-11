# The app

`app/` is the phone app, written once in Kotlin Multiplatform:

- `core`: talking to the API and Supabase sign-in, shared by Android and iOS.
- `ui`: every screen, in Compose Multiplatform.
- `androidApp`: the Android wrapper (photo picker, location, app icon).

The iOS wrapper comes with the iOS milestone.

## Trying it on an Android phone

1. Open the latest **App** run under the repository's Actions tab.
2. Download `partynearme-debug-apk` at the bottom of the run and unzip it.
3. Copy the `.apk` to the phone, open it, and allow installing from that source when asked.

The free server sleeps when nobody uses it, so the first screen can take up to a minute.

## Building

GitHub Actions builds the app on every change (`.github/workflows/app.yml`).
Locally, with the Android SDK installed, run `./gradlew :androidApp:assembleDebug` in `app/`.
Without the Android SDK, `./gradlew -Ppnm.noAndroid :core:jvmTest` still runs the shared tests.

## Settings in the app

The API address, Supabase URL and Supabase publishable key are in
`androidApp/src/main/kotlin/com/partynearme/app/PartyApp.kt`. All three are public;
no secret keys belong in the app.
