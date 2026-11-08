# Releasing to Google Play and the App Store

How the store builds are made and the one-time steps only the account owner can do.
Secrets go into GitHub at **Settings > Secrets and variables > Actions > New repository
secret**. Never commit them or paste them into chat.

## Google Play

The workflow `.github/workflows/android-release.yml` builds the bundle (`.aab`) that
Play takes. It runs on every merge to `PartyApp` and can be run by hand from
**Actions > Android release > Run workflow**. Each run's bundle is under the run's
**Artifacts** as `partynearme-release-aab`.

### 1. Make the upload key (once)

Play signs the app for phones itself (Play App Signing); you sign uploads with your own
*upload key*. On any computer with Java (Android Studio includes it), run:

```
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

Pick a strong password and answer the name questions (any values work). Keep
`upload.jks` and the password somewhere safe, such as a password manager. If it is lost,
Play support can reset it, but it takes days.

Then turn the file into text for GitHub. On Windows PowerShell:

```
[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.jks")) | Set-Clipboard
```

On macOS or Linux: `base64 -i upload.jks | pbcopy` (or `base64 -w0 upload.jks`).

### 2. Add the GitHub secrets

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the text copied above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password (only if different from the keystore one) |
| `GOOGLE_SERVICES_JSON` | the whole `google-services.json` from Firebase, for push |

The next merge, or a manual run, then makes a signed bundle.

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
