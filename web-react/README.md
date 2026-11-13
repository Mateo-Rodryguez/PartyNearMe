# PartyNearMe web (React)

The web app rebuilt in React 19 + Vite + TypeScript, with React Router for pages.
Every page of the Svelte site in `web/` is here; this folder replaces `web/` in
a follow-up change, and until then it isn't deployed.

- `src/lib/` holds the code that isn't UI (API client, sign-in, formatting, usage
  stats, live chat), carried over unchanged, plus `store.ts`: plain objects
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
npm run build && node scripts/smoke.mjs   # every page in Chromium
```
