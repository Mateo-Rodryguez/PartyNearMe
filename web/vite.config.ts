import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const api = 'https://partynearme-api.onrender.com';
const supabase = 'https://vvkckzrhzgdrazhjitse.supabase.co';
// Photo uploads go straight to the R2 bucket with a signed address.
const realtime = 'wss://vvkckzrhzgdrazhjitse.supabase.co';
// Map tiles for picking a party's spot (free, no key).
const tiles = 'https://tiles.openfreemap.org';
// Usage stats (see docs/analytics.md).
const posthog = 'https://eu.i.posthog.com';
const uploads = 'https://630c8ac9872f11e09ffed9fe3cb05b0c.r2.cloudflarestorage.com';

// Node's environment, typed here so the config needs no @types/node.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

export default defineConfig({
	// Cloudflare Pages sets the commit; feedback carries it like the apps carry their version.
	define: { __APP_VERSION__: JSON.stringify((env.CF_PAGES_COMMIT_SHA ?? env.GITHUB_SHA ?? 'dev').slice(0, 7)) },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// Plain files on Cloudflare Pages: the landing page is built ahead, every
			// other address boots the app from 200.html (see static/_redirects).
			adapter: adapter({ fallback: '200.html' }),
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					// Photos come from the media bucket; avatars and covers too.
					'img-src': ['self', 'data:', 'blob:', 'https:'],
					// wss: for live chat through Supabase Realtime.
					'connect-src': ['self', api, supabase, realtime, uploads, tiles, posthog],
					// The map draws in a web worker it starts from a blob.
					'worker-src': ['self', 'blob:'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'object-src': ['none']
				}
			}
		})
	]
});
