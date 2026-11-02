# PartyNearMe for iPhone (native)

The iPhone app, written in Swift and SwiftUI. It talks to the same API and
Supabase project as the Android app, with the same JSON, and shares its look:
the colours, gradients and components in `PartyNearMe/Design` match the
Android theme in `app/ui`.

This replaces the shared Compose screens on iPhone (`app/iosApp` and
`app/iosKit`), which stay until every screen here matches them. Android keeps
using `app/`.

| Folder | What's in it |
| --- | --- |
| `PartyNearMe/App` | The app's entry point, `AppModel` (wires everything once) and the signed-in/out switch |
| `PartyNearMe/Core` | Networking, sign-in (Supabase Auth with PKCE), the session in the Keychain, models |
| `PartyNearMe/Design` | Theme and shared components: new screens should reuse them |
| `PartyNearMe/Screens` | The screens |
| `PartyNearMe/Platform` | Location and other phone features |
| `PartyNearMe/Demo` | Debug builds only: sample data for screenshots |
| `PartyNearMeTests` | Unit tests |

## Building

There's no Mac needed day to day: the `iOS` workflow builds the app on a cloud
Mac, runs the tests and screenshots every screen on an iPhone simulator. The
screenshots land on the `ios-native-screenshots` branch.

On a Mac with Xcode 26 and [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```sh
cd ios
xcodegen generate        # writes PartyNearMe.xcodeproj from project.yml
open PartyNearMe.xcodeproj
```

To open a screen on sample data, launch with `-demo <screen>`, for example
`xcrun simctl launch booted com.partynearme.app -demo sign_in`. The screens are
listed in `PartyNearMe/Demo/Demo.swift`.

## Rebuild plan

1. Foundation: theme, components, sign-in, onboarding, username, tab bar, CI (done)
2. Feed, posts, photo upload, comments, profiles, follow (done)
3. Parties: Apple Maps nearby, party page, RSVP, create and edit, guest lists (done)
4. Chats, notifications, party invites and share links (this), then search, saved, settings and safety
5. Remove the Compose iPhone app once everything matches
