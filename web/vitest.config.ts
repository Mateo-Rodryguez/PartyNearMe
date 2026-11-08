import { defineConfig } from 'vitest/config';

// Unit tests for plain TypeScript in src/lib, without the SvelteKit plugin.
export default defineConfig({
	test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
