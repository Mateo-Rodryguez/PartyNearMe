import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Node's environment, typed here so the config needs no @types/node.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

export default defineConfig({
	// Cloudflare Pages sets the commit; feedback carries it like the apps carry their version.
	define: { __APP_VERSION__: JSON.stringify((env.CF_PAGES_COMMIT_SHA ?? env.GITHUB_SHA ?? 'dev').slice(0, 7)) },
	plugins: [react()],
	resolve: { alias: [{ find: /^#lib\/(.*)$/, replacement: `${new URL('./src/lib/', import.meta.url).pathname}$1` }] },
	// Plain files for Cloudflare Pages; hashed names under /assets never change (public/_headers).
	build: { outDir: 'build', assetsDir: 'assets', target: 'es2022' }
});
