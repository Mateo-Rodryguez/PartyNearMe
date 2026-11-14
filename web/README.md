# PartyNearMe web

The web app in React 19 + Vite + TypeScript, with React Router for pages.
Cloudflare Pages builds this folder (see `docs/web.md`). The landing page is
drawn into `index.html` at build time; every other page boots from `200.html`.

- `src/lib/` holds the code that isn't UI (API client, sign-in, formatting, usage
  stats, live chat), plus `store.ts`: plain objects
  that tell React when they change (session, prefs, unread counts, paged lists).
- `src/lib/ui/` and `src/pages/` are the components, each with a CSS module
  next to it. Shared classes (`btn`, `field`, `chip`, `muted`…) live in `src/app.css`.
- Colours come from `design/tokens.json` (shared with Android and iPhone) via
  `npm run tokens`.

```
npm install
npm run dev        # http://localhost:5173
npm run check      # types
npm test           # unit tests
node scripts/check-redirects.mjs   # every page opens when visited directly
npm run build && node scripts/smoke.mjs   # every page in Chromium
```
