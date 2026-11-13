import { defineConfig } from 'vitest/config';

// Unit tests for src/lib, outside the browser.
export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify('test') },
	resolve: { alias: [{ find: /^#lib\/(.*)$/, replacement: `${new URL('./src/lib/', import.meta.url).pathname}$1` }] },
	test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
