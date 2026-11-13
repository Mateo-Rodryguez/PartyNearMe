# Releasing to Google Play and the App Store

How the store builds are made and the one-time steps only the account owner can do.
Secrets go into GitHub at **Settings > Secrets and variables > Actions > New repository
secret**. Never commit them or paste them into chat.

## Google Play

The workflow `.github/workflows/android-release.yml` builds the bundle (`.aab`) that
Play takes. It runs on every merge to `PartyApp` and can be run by hand from
**Actions > Android release > Run workflow**. Each run's bundle is under the run's
**Artifacts** as `partynearme-release-aab`.

### 1. Make the upload key (once, all in the browser)

Play signs the app for phones itself (Play App Signing); uploads are signed with an
*upload key*. The **Make Play upload key** workflow creates it on a GitHub runner and
saves it straight into this repo's secrets. Nobody sees the key or its password.

1. Make a token that may write this repo's secrets: github.com > Settings > Developer
   settings > **Fine-grained tokens > Generate new token**
   (https://github.com/settings/personal-access-tokens/new). Name it "secrets", expiry
   7 days, **Only select repositories**: PartyNearMe, and under **Repository
   permissions** set **Secrets** to **Read and write**. Generate and copy it.
2. Repo > Settings > Secrets and variables > Actions > **New repository secret**: name
   `SECRETS_TOKEN`, paste the token.
3. Actions > **Make Play upload key** > **Run workflow**. When it's green, the secrets
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` exist.
4. Delete the `SECRETS_TOKEN` secret and the token.

If the key is ever lost, Play support can reset the upload key; the app's own signing
key stays with Google. (With Java installed, `keytool` can make the key by hand instead:
then add the three secrets yourself, with the key file base64-encoded.)

### 2. Push notifications in store builds

Add one more secret, `GOOGLE_SERVICES_JSON`: the whole `google-services.json` from the
Firebase console (Project settings > Your apps > the Android app > download), opened in
a text editor and pasted.

### 3. Create the app in Play Console

1. **Create app**: name PartyNearMe, app, free, accept the declarations.
2. Fill in **App content** (privacy policy URL
   `https://partynearme-api.onrender.com/privacy`, app access with the reviewer demo
   account, ads: none, content rating, target audience 18+, data safety, account
   deletion URL `https://partynearme-api.onrender.com/privacy#delete`) using the
   answers in the "PartyNearMe store forms" doc.
3. **Store listing**: text from the same doc, icon, feature graphic and screenshots
   (made by CI, see below).
4. **Testing > Closed testing > Create track**. Add the countries the testers are in,
   then upload the `.aab` from the latest **Android release** run by hand (the first
   upload must be manual). Share the opt-in link with the tester service.

### 4. Optional: upload from GitHub

After the first manual upload, Play can take uploads from CI:

1. In Google Cloud (the same free project as Google sign-in), **IAM > Service accounts >
   Create**, then **Keys > Add key > JSON**.
2. In Play Console, **Users and permissions > Invite new users**, add the service
   account's email and give it **Release apps to testing tracks** (and production later).
3. Save the JSON as the `PLAY_SERVICE_ACCOUNT_JSON` secret.

Then **Run workflow** with a track (internal, alpha = closed testing, beta, production).
Leave status on `draft` until the app has passed its first review.

## App Store (no Mac needed)

The workflow `.github/workflows/ios-release.yml` archives the iPhone app on a cloud
Mac, signs it and uploads it to App Store Connect, where it appears in TestFlight. It
runs on every merge to `PartyApp` that touches `ios/`, and by hand from **Actions > iOS
release > Run workflow** (with the version to show in the store). Until the secrets
below exist it only checks that the Release build compiles.

### 1. Register the app (developer.apple.com, once)

1. **Certificates, Identifiers & Profiles > Identifiers > +**, App IDs, App. Bundle ID
   **explicit** `com.partynearme.app`, description PartyNearMe. Tick
   **Push Notifications** and **Sign in with Apple** (enable as a primary App ID).
2. In App Store Connect: **Apps > + > New App**, iOS, name PartyNearMe, primary
   language, bundle ID `com.partynearme.app`, SKU `partynearme`.

### 2. App Store Connect API key (lets GitHub sign and upload)

1. App Store Connect > **Users and Access > Integrations > App Store Connect API >
   Team Keys > +**. Name it GitHub, access **Admin** (needed so Xcode can create the
   distribution certificate in the cloud).
2. Download the `.p8` file (only possible once). Note the **Key ID** and the
   **Issuer ID** shown above the table.
3. Your **Team ID** is under developer.apple.com > Account > Membership details.

| GitHub secret | Value |
|---|---|
| `APP_STORE_CONNECT_KEY_P8` | the whole `.p8` file, opened in a text editor |
| `APP_STORE_CONNECT_KEY_ID` | the Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | the Issuer ID |
| `APPLE_TEAM_ID` | the Team ID |

Then **Run workflow**. About 20 minutes later the build is in TestFlight.

### 3. Push notifications (APNs key)

The server sends to iPhones straight through Apple, so this key goes into Render, not
Firebase.

1. developer.apple.com > **Keys > +**, name PartyNearMe push, tick **Apple Push
   Notifications service (APNs)**, environment **Sandbox & Production**. Download the
   `.p8` (only possible once) and note its **Key ID**.
2. In Render (partynearme-api > Environment) add:
   - `APNS_KEY`: the whole `.p8` file contents
   - `APNS_KEY_ID`: its Key ID
   - `APNS_TEAM_ID`: the Team ID

### 4. Sign in with Apple

The iPhone uses Apple's native sign-in, so Supabase only needs to know the app.
Supabase dashboard > **Authentication > Sign In / Providers > Apple**: turn it on and
put `com.partynearme.app` in **Client IDs**. The secret key fields can stay empty for
the native flow. The button appears in the app as soon as the provider is on, and it
must be on before the app is sent for review.

### 5. TestFlight and review

1. In TestFlight, add yourself under **Internal Testing**, install the TestFlight app on
   the iPhone and accept the invite.
2. When it works, fill in the App Store page (text, screenshots, privacy label and age
   rating from the "PartyNearMe store forms" doc; privacy policy URL
   `https://partynearme-api.onrender.com/privacy`, support URL the same site).
3. Under **App Review Information**, give the reviewer demo account (see below) and a
   note: "Party listings near you. Users can report posts, parties, comments and people
   from the ⋮ menus and block people; reports are reviewed within 24 hours. Account
   deletion is in Settings."
4. Pick the build and **Submit for Review**.

## Reviewer demo account (both stores)

Both reviewers need to sign in. Create a normal account in the app, for example
`review@` plus your domain or a spare Gmail address, finish onboarding, follow a couple
of accounts and RSVP to a party so the screens aren't empty. Give its email and
password in Play Console (**App content > App access**) and App Store Connect
(**App Review Information**). Don't use your own account.

## Store images

`store/make-store-images.py` turns the CI screenshots into store images: five
screenshots per store with a headline on the brand gradient (1320 x 2868 for the
6.9-inch iPhone slot, which App Store Connect scales down for other iPhones;
1080 x 1920 for Play), plus Play's 512 x 512 icon and 1024 x 500 feature graphic.

```
git fetch origin ios-native-screenshots app-screenshots
python3 store/make-store-images.py store-images
```

The screens come from the demo data, so rerun it after a redesign. Change the
headlines or the screens in `SCREENS` at the top of the script.
