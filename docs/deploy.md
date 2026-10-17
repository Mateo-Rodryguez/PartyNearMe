# Deploying the backend

The API and the photo worker run on Render, set up from `render.yaml`. The
database is deployed separately, by the Deploy database workflow on every merge
that changes `supabase/migrations`.

## First-time setup

1. **Public photo address.** In Cloudflare: R2 > `partynearme-media` > Settings >
   Public access > R2.dev subdomain > Allow. Copy the `https://pub-….r2.dev`
   address. This is `MEDIA_BASE_URL`.
2. **Database connection string.** In Supabase: Connect (top bar) > Connection
   string > Transaction pooler (port 6543). Put your database password in place
   of `[YOUR-PASSWORD]`. This is `DATABASE_URL`.
3. **OpenAI key.** platform.openai.com > API keys > Create new secret key. The
   moderation endpoint is free, but the account still needs to exist.
4. **Render.** Sign in with GitHub at dashboard.render.com, then New > Blueprint,
   pick the PartyNearMe repo and the `PartyApp` branch. Render reads
   `render.yaml` and asks for the secret values: `DATABASE_URL`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`,
   `MEDIA_BASE_URL`. Paste them there, never into chat or the repo.
5. Check `https://partynearme-api.onrender.com/health` returns `{"status":"ok"}`.

After that, every merge into `PartyApp` that touches `backend/` redeploys.

## Push notifications (optional)

Push stays off until `FIREBASE_SERVICE_ACCOUNT` is set; messages and RSVPs
still work without it.

1. Create a project at console.firebase.google.com (Analytics can stay off).
2. Add an Android app with the package name `com.partynearme.app` and download
   its `google-services.json`. It holds public IDs only; it goes in
   `app/androidApp/` so the app can get a push token (see docs/app.md).
3. Project settings > Service accounts > Generate new private key. This
   downloads a JSON file.
4. In Render, add `FIREBASE_SERVICE_ACCOUNT` and paste the whole file contents
   as the value. It is a secret: never commit it or paste it into chat.
5. For iPhones, later: Project settings > Cloud Messaging > upload the APNs key
   from the Apple developer account.

## Privacy policy and terms

The server publishes them at `/privacy` and `/terms` (for example
https://partynearme-api.onrender.com/privacy); the store listings link there.
Set `CONTACT_EMAIL` in Render to the address people should write to; until then
the pages point to the store listing instead. Moderation is in docs/moderation.md.

## Error reports (Sentry)

Unexpected server errors (anything that returns a 500) and worker failures go to
the Sentry project `partynearme-api` (organisation PartyNearMe, EU region). The DSN is
in `render.yaml`; it is public, so it is fine in git. Only errors are sent: no tracing,
and no request headers, bodies, query strings or database data, just the route
pattern (like `/posts/:id`) and the user's id. Without `SENTRY_DSN` nothing is sent.

## Notes

- The free plan sleeps after 15 minutes without traffic and takes about a minute
  to wake. Fine for testing; switch the plan to Starter before the public beta.
- `RUN_WORKER=true` runs the photo worker inside the API process. When traffic
  grows, set it to `false` and add a Render background worker running
  `npm run worker` with the same environment.
- The r2.dev address makes the whole bucket readable. Phone uploads sit under
  random, unlisted names and are deleted once processed, so this is acceptable
  for testing. Before launch, move to a custom domain and allow only `media/`.
