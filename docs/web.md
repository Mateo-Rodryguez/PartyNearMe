# Web app

`web/` is PartyNearMe for the browser: its own code (SvelteKit and Svelte 5), not
the Android app run on the web, so it loads fast and feels like a website. It
talks to the same API and Supabase project as the phone apps.

## What's shared, and what isn't

Each platform has its own screens, built the way that platform does best.
A new feature means a small change in each, because these are shared:

| Shared | Where | Kept in step by |
|---|---|---|
| The API (routes and JSON) | `backend/` | The API's zod schemas; `web/src/lib/api/types.ts` mirrors them like `Models.kt` and the Swift models |
| Brand colours, gradients, party cover colours, corner radii | `design/tokens.json` | CI: `design/check.mjs` fails if `Theme.kt` or `Theme.swift` drift; the web generates its CSS from the file |
| Sign-in | Supabase Auth | Same flows: email and password, and Google with PKCE |

## How it's built

- **Plain files on Cloudflare Pages (free).** No server: the landing page is
  built ahead as HTML for search engines; every app page boots from
  `200.html` (see `static/_redirects`) and draws in the browser.
- **Small:** about 70 KB of JavaScript in total, split per page.
- **Photos** use the server's sizes (`srcset`), lazy loading and the blurred
  BlurHash preview, like the apps.
- **The last feed shows at once** while the free server wakes up.
- **Ranking:** impressions, dwell time and opens go to `/interactions` like the apps.
- **Security:** a Content Security Policy that only allows our API and
  Supabase; the session is a bearer token, never a cookie.

## Running it

```sh
cd web
npm install
npm run dev        # http://localhost:5173 (already allowed by the API's CORS)
npm run check      # types
npm test           # unit tests
npm run build && node scripts/smoke.mjs   # every page in Chromium with a fake API
```

## Putting it online (one-time, Mateo)

1. **Cloudflare Pages:** Cloudflare dashboard > Workers & Pages > Create >
   Pages > Connect to Git > pick `PartyNearMe`.
   - Project name: `partynearme` (gives https://partynearme.pages.dev)
   - Production branch: `PartyApp`
   - Framework preset: None
   - Root directory: `web`
   - Build command: `npm run build`
   - Build output directory: `build`
   - Environment variable: `NODE_VERSION` = `22`
   - Settings > Builds > Build watch paths: include `web/*` and `design/*`,
     so phone-only changes don't rebuild the site.
   Every pull request then gets its own preview address too.
2. **Supabase:** Authentication > URL Configuration > Redirect URLs: add
   `https://partynearme.pages.dev/auth/callback` and
   `https://*.partynearme.pages.dev/auth/callback` (previews). Needed for
   "Continue with Google"; email sign-in works without it.
3. **R2 (for posting photos from the web):** Cloudflare dashboard > R2 >
   `partynearme-media` > Settings > CORS policy > Add, and paste:
   ```json
   [{ "AllowedOrigins": ["https://partynearme.pages.dev", "http://localhost:5173"],
      "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 86400 }]
   ```
   The browser sends photos straight to the bucket with a signed address, like
   the apps; without this rule the browser blocks the upload.
4. If the name `partynearme` was taken and Pages gave another address, set
   `WEB_ORIGINS` on Render to that address (see `backend/src/config.ts`) and
   use it in step 2.

A custom domain comes last; Pages adds one for free once there is a domain.
