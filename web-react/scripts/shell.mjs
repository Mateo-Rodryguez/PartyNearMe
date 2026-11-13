// Cloudflare Pages rewrites every app address to /200 (public/_redirects), so the
// built index.html is copied there: the landing page and the app share one shell.
import { copyFileSync } from 'node:fs';

copyFileSync(new URL('../build/index.html', import.meta.url), new URL('../build/200.html', import.meta.url));
