<script lang="ts">
	import '../app.css';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { analytics, screenOf } from '#lib/analytics.js';
	import { prefs } from '#lib/prefs.svelte.js';
	import { session } from '#lib/session.svelte.js';
	import { toast } from '#lib/toast.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	if (browser) {
		session.start();
		prefs.start();
		// Usage stats (lib/analytics.ts): how long the tab was used, and the last batch as it closes.
		analytics.visible();
		document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? analytics.hidden() : analytics.visible()));
		addEventListener('pagehide', () => analytics.flush());
	}

	// Counted under the account while signed in; every page change is a screen view.
	$effect(() => analytics.identify(session.userId));
	$effect(() => analytics.screenView(screenOf(page.url.pathname, session.userId)));
</script>

{@render children()}

{#if toast.message}
	<div class="toast" role="status">{toast.message}</div>
{/if}

<style>
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(88px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		z-index: 50;
		padding: 10px 18px;
		border-radius: 999px;
		background: var(--on-background);
		color: var(--background);
		font-weight: 600;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
	}
</style>
