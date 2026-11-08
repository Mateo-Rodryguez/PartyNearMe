<script lang="ts">
	import { goto } from '$app/navigation';
	import { analytics } from '#lib/analytics.js';
	import { finishBrowserSignIn } from '#lib/api/auth.js';
	import { session } from '#lib/session.svelte.js';
	import Spinner from '#lib/ui/Spinner.svelte';

	// Google sends the browser back here with a code to swap for a session.
	let error = $state<string | null>(null);

	$effect(() => {
		let method = 'google';
		try {
			method = sessionStorage.getItem('pnm.method') ?? method;
		} catch {
			// Google, the usual one.
		}
		finishBrowserSignIn(location.href).then(
			(signedIn) => {
				analytics.capture('auth_succeeded', { method, action: 'sign_in' });
				session.set(signedIn);
				let next = '/feed';
				try {
					next = sessionStorage.getItem('pnm.next') ?? next;
					sessionStorage.removeItem('pnm.next');
				} catch {
					// Feed it is.
				}
				void goto(next.startsWith('/') && !next.startsWith('//') ? next : '/feed', { replaceState: true });
			},
			(e: unknown) => {
				error = e instanceof Error ? e.message : 'Sign-in failed';
				// Closing the provider's page comes back without a code: that's a change of mind, not a failure.
				if (/access_denied|cancel/i.test(location.href)) analytics.capture('auth_cancelled', { method });
				else analytics.capture('auth_failed', { method, action: 'sign_in', reason: error });
			}
		);
	});
</script>

<svelte:head><title>Signing in · PartyNearMe</title></svelte:head>

<main>
	{#if error}
		<h1>That didn't work</h1>
		<p class="error">{error}</p>
		<a class="btn primary" href="/signin">Back to sign in</a>
	{:else}
		<Spinner label="Signing you in" />
	{/if}
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 16px;
		padding: 16px;
		text-align: center;
	}
</style>
