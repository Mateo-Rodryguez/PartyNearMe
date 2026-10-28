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
`map_picker`, `post`, `inbox`, `chat`, `profile`, `user`, `moderation`, `settings`, `relationship`,
`search`, `followers`, `saved`, `comments` and `edit-party`. Release builds ignore this.

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

## Signing in

Email and password, plus **Forgot password?**, which emails a link to a page where
people choose a new password, and **Continue with Google** once Google is switched
on in Supabase (see docs/deploy.md). Google sign-in opens in a Custom Tab on
Android and Apple's sign-in sheet on iPhone, then comes back to the app on a
`partynearme://auth-callback` link. The same `partynearme://` scheme opens shared
parties and posts (`partynearme://party/<id>`, `partynearme://post/<id>`).

## Feed loading

The app saves the feed's first page (up to 20 posts) on the phone and shows it at
once on the next start, then swaps in the fresh feed when it arrives; the free
server can take up to a minute to wake. Offline, the saved posts stay with a short
note above them. The saved copy is only shown to the account that saved it and is
removed on sign-out and account deletion. While scrolling, the next page loads six
posts before the end and the photos of the next three posts download early.

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

Tap your picture on the Profile tab, or use **Profile picture** in settings.
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

The ⋮ menus let people report a post, party or person and block or unblock someone,
and holding down on a message in a chat reports it;
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

## Profile

The numbers under a name read **Parties**, **Followers**, **Following**. Parties
counts the published parties someone hosted plus the ones they said they're going
to, each once. Tapping Followers or Following opens the list, with a switch between
the two and a Follow button on each person.

## Finding people

The magnifier on Home (or **Find people** on your profile) searches as you type:
usernames that start with the text come first, then names containing it, then the
people with most followers. People blocked either way never show.

## Saving

The bookmark under a post, and on a party's cover, saves it. **Saved** (the bookmark
at the top right of your profile) lists saved posts as a grid and saved parties as
cards. Only you can see what you saved; posts hidden by moderation drop out.

## Settings

The gear at the top left of your profile. On your account (synced to the server):
edit profile, profile picture, relationship status, interests, who can message you
(everyone, or only people you follow; existing chats carry on), blocked accounts,
and which push notifications you get (messages, comments, guests for your parties,
party reminders and cancellations). On this phone only: theme (automatic, day or night), hiding like counts
on other people's posts, the Nearby search distance (5 to 50 km) and kilometres or
miles. Also privacy policy, terms, sign out and delete account; moderators get
**Reports to review** here.

## Comments

The speech bubble under a post, or "View all comments" below the caption, opens its
comments, newest first, with a box at the bottom to add one (up to 1,000
characters). Comments show straight away; the server then checks the words with
moderation and hides any that break the rules, which only their author still sees,
marked as hidden. Holding a comment down deletes it (yours, or any on your own
post) or reports it. The post's author gets a notification and a push, which can be
turned off under Comments in settings. Nobody can comment across a block.

## Editing posts and parties

Your post's ⋮ menu has **Edit caption** (or **Add caption**). The new words are
checked by moderation again, and a post whose caption fails is hidden.

Your party's ⋮ menu has **Edit party**, which opens the party form filled in, plus
**Cancel party** (it leaves the map, its page says cancelled, and everyone who
RSVP'd gets a push), **Put the party back on**, and **Delete party**, which removes
it and its RSVPs for good. Photos posted at a deleted party stay on profiles.

## Friends going

Party cards and pages show who you follow that's going, with up to three faces:
"Sam and 2 others you follow are going". People you blocked are left out.

## Relationship hearts

People can show a small heart next to their name: full red for in a relationship,
half filled in a softer red for talking to someone, an empty outline for single
and looking. The default is nothing. Profiles and people lists show only the heart;
what each one means is written only in the picker in settings. The outline is black
in the day theme and white at night, where black wouldn't show.
