# The app

`app/` is the phone app, written once in Kotlin Multiplatform:

- `core`: talking to the API and Supabase sign-in, shared by Android and iOS.
- `ui`: every screen, in Compose Multiplatform.
- `androidApp`: the Android wrapper (photo picker, camera, location, app icon).
- `iosKit` and `iosApp`: the iPhone wrapper (photo picker, camera, location) and its Xcode project.
- `demo`: sample data for screenshots, only in debug builds.

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

## iPhone

There is no Mac needed: CI builds the iPhone app on a cloud Mac (free for public
repositories), opens every screen on an iPhone simulator and puts the screenshots
on the `ios-screenshots` branch. On a simulator,
`xcrun simctl launch booted com.partynearme.app -demo feed` opens a sample screen.

Installing on a real iPhone without a Mac goes through TestFlight, which needs the
Apple Developer Program ($99 a year); that comes with the store milestone.

With a Mac: install XcodeGen (`brew install xcodegen`), run `xcodegen generate` in
`app/iosApp`, open `PartyNearMe.xcodeproj` and press Run. The Xcode build runs Gradle
to compile the Kotlin code first.

## Building

GitHub Actions builds the app on every change (`.github/workflows/app.yml`).
Locally, with the Android SDK installed, run `./gradlew :androidApp:assembleDebug` in `app/`.
Without the Android SDK, `./gradlew -Ppnm.noAndroid :core:jvmTest` still runs the shared tests.

## Taking photos

New post has **Take a photo** next to **Choose photos** on phones with a camera. Android
hands over to the phone's camera app, so the app needs no camera permission of its
own; iPhone asks for camera access the first time. Photos are shrunk and stripped of
location data on the phone like picked ones.

## Party photos

A party's page shows the photos people posted there, newest first, with **Add photos**
once the party is published. The New post tab can also attach a photo to a party you
host or said you're going to, from the last three days onwards. Posts from a party
say "At <party>" and open it. The server lists them at `GET /events/:id/posts`.

## Profile pictures and party covers

Tap your picture on the Profile tab, or use **Change profile picture** in its ⋮ menu.
Hosts set a party's cover from the party's ⋮ menu. Both are checked by moderation
on the server first, so the new picture appears a few seconds after uploading.
Pictures show on profiles, posts, the party page and the inbox; without one, the
first letter of the name shows instead.

## Push notifications

Android asks to show notifications once the account is set up, then sends the
phone's Firebase token to the server. This needs `androidApp/google-services.json`
from the Firebase console (steps in docs/deploy.md); a build without it works the
same, just without push. Tapping a notification opens the chat or party it is about.
iPhone push comes with the Apple Developer account.

## Safety and store requirements

The ⋮ menus let people report a post, party or person and block or unblock someone;
reports land in `public.reports` for review (docs/moderation.md). The profile ⋮ menu
has the privacy policy, terms and **Delete account**, which deletes the account on the
server and returns to sign-in. The sign-in screen says the app is 18+ and links the
terms and privacy policy, which the server hosts at `/privacy` and `/terms`.

## Crash reports

Both apps send crash reports to the Sentry project `partynearme-app` (organisation
PartyNearMe, EU region). Android sets it up from `AndroidManifest.xml`, iPhone in
`PartyNearMeApp.swift`; the DSN is public. Debug builds report as environment `debug`,
store builds as `production`. Screenshots, tracing and personal data are off.

## Settings in the app

The API address, Supabase URL and Supabase publishable key are in
`androidApp/src/main/kotlin/com/partynearme/app/PartyApp.kt` and
`iosKit/src/iosMain/kotlin/com/partynearme/ios/MainViewController.kt`. All three are public;
no secret keys belong in the app.
