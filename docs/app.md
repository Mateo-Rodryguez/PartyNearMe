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

## Seeing it without a phone

CI also starts the app on an Android emulator, opens every screen and takes a
screenshot. They are on the `app-screenshots` branch (open its README on GitHub)
and in the `partynearme-screenshots` download on each run.

Most screens use sample data built into debug builds, so no server or account is
needed: `adb shell am start -n com.partynearme.app/.MainActivity --es demo feed`
opens the feed. The other screens are `sign_in`, `nearby`, `event`, `new_event`,
`map_picker`, `post`, `inbox`, `chat`, `profile` and `user`. Release builds ignore this.

## Building

GitHub Actions builds the app on every change (`.github/workflows/app.yml`).
Locally, with the Android SDK installed, run `./gradlew :androidApp:assembleDebug` in `app/`.
Without the Android SDK, `./gradlew -Ppnm.noAndroid :core:jvmTest` still runs the shared tests.

## Settings in the app

The API address, Supabase URL and Supabase publishable key are in
`androidApp/src/main/kotlin/com/partynearme/app/PartyApp.kt`. All three are public;
no secret keys belong in the app.
