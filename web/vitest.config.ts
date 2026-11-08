import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Unit tests for src/lib, with Svelte compiling the .svelte.ts modules (runes)
// but without the rest of SvelteKit.
export default defineConfig({
	plugins: [svelte()],
	define: { __APP_VERSION__: JSON.stringify('test') },
	test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
