<script lang="ts">
	import { goto } from '$app/navigation';
	import { finishBrowserSignIn } from '#lib/api/auth.js';
	import { session } from '#lib/session.svelte.js';
	import Spinner from '#lib/ui/Spinner.svelte';

	// Google sends the browser back here with a code to swap for a session.
	let error = $state<string | null>(null);

	$effect(() => {
		finishBrowserSignIn(location.href).then(
			(signedIn) => {
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
			(e: unknown) => (error = e instanceof Error ? e.message : 'Sign-in failed')
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
