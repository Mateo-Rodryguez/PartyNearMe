import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const api = 'https://partynearme-api.onrender.com';
const supabase = 'https://vvkckzrhzgdrazhjitse.supabase.co';

export default defineConfig({
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
					'connect-src': ['self', api, supabase],
					'base-uri': ['self'],
					'form-action': ['self'],
					'object-src': ['none']
				}
			}
		})
	]
});
