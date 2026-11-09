<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { analytics } from '#lib/analytics.js';
	import * as auth from '#lib/api/auth.js';
	import { config } from '#lib/config.js';
	import { session } from '#lib/session.svelte.js';

	type Mode = 'signin' | 'signup' | 'reset';
	let mode = $state<Mode>(page.url.searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let google = $state(false);
	let apple = $state(false);

	/** Only paths on this site, so a link can't send people elsewhere after signing in. */
	const next = $derived.by(() => {
		const value = page.url.searchParams.get('next') ?? '/feed';
		return value.startsWith('/') && !value.startsWith('//') ? value : '/feed';
	});

	$effect(() => {
		if (session.current) void goto(next, { replaceState: true });
	});
	$effect(() => {
		auth.providers().then(
			(list) => {
				google = list.includes('google');
				// People who joined on iPhone with Apple have no password, so they sign in here the same way.
				apple = config.appleOnWeb && list.includes('apple');
			},
			() => undefined
		);
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = notice = null;
		const action = mode === 'reset' ? 'reset_password' : mode === 'signup' ? 'sign_up' : 'sign_in';
		try {
			if (mode === 'reset') {
				await auth.recover(email.trim());
				notice = 'If that email has an account, a link to choose a new password is on its way.';
				analytics.capture('auth_succeeded', { method: 'email', action, check_email: true });
			} else if (mode === 'signup') {
				const created = await auth.signUp(email.trim(), password);
				analytics.capture('auth_succeeded', { method: 'email', action, check_email: !created });
				if (created) session.set(created);
				else notice = 'Check your email and tap the link to finish signing up.';
			} else {
				const signedIn = await auth.signIn(email.trim(), password);
				analytics.capture('auth_succeeded', { method: 'email', action });
				session.set(signedIn);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong';
			// The message shown, never what was typed.
			analytics.capture('auth_failed', { method: 'email', action, reason: error });
		} finally {
			busy = false;
		}
	}

	async function withProvider(provider: 'google' | 'apple') {
		try {
			sessionStorage.setItem('pnm.next', next);
			sessionStorage.setItem('pnm.method', provider);
		} catch {
			// The callback falls back to the feed.
		}
		analytics.flush(); // The page is about to go to the provider.
		location.href = await auth.authorizeUrl(provider, `${location.origin}/auth/callback`);
	}

	const titles: Record<Mode, string> = { signin: 'Welcome back', signup: 'Join the party', reset: 'Forgot your password?' };
</script>

<svelte:head><title>{titles[mode]} · PartyNearMe</title></svelte:head>

<main>
	<div class="glow" aria-hidden="true"></div>
	<form onsubmit={submit} class="card">
		<a href="/" class="brand"><img src="/icon.svg" alt="" width="48" height="48" /><span>PartyNearMe</span></a>
		<h1>{titles[mode]}</h1>

		{#if apple && mode !== 'reset'}
			<button type="button" class="btn block apple" onclick={() => withProvider('apple')}>
				<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"
					><path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.76-.96 2.79 1.02.08 2.05-.52 2.68-1.27z" /></svg
				>
				Continue with Apple
			</button>
		{/if}
		{#if google && mode !== 'reset'}
			<button type="button" class="btn block google" onclick={() => withProvider('google')}>
				<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"
					><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg
				>
				Continue with Google
			</button>
			<p class="or muted"><span>or with email</span></p>
		{/if}

		<label>
			<span class="visually-hidden">Email</span>
			<input class="field" type="email" autocomplete="email" placeholder="Email" required bind:value={email} />
		</label>
		{#if mode !== 'reset'}
			<label>
				<span class="visually-hidden">Password</span>
				<input
					class="field"
					type="password"
					autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
					placeholder="Password"
					minlength={mode === 'signup' ? 8 : undefined}
					required
					bind:value={password}
				/>
			</label>
		{/if}

		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if notice}<p role="status">{notice}</p>{/if}

		<button class="btn primary block" disabled={busy}>
			{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send link'}
		</button>

		<div class="switch muted">
			{#if mode === 'signin'}
				<button type="button" class="link" onclick={() => (mode = 'reset')}>Forgot password?</button>
				<button type="button" class="link" onclick={() => (mode = 'signup')}>New here? <strong>Create an account</strong></button>
			{:else}
				<button type="button" class="link" onclick={() => (mode = 'signin')}>Have an account? <strong>Sign in</strong></button>
			{/if}
		</div>
		{#if mode === 'signup'}
			<p class="small muted">
				By signing up you agree to the <a href="https://partynearme-api.onrender.com/terms">terms</a> and
				<a href="https://partynearme-api.onrender.com/privacy">privacy policy</a>. You must be 18 or older.
			</p>
		{/if}
	</form>
</main>

<style>
	main {
		position: relative;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		overflow: hidden;
	}
	.glow {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(closest-side at 25% 25%, var(--glow-a), transparent),
			radial-gradient(closest-side at 80% 75%, var(--glow-b), transparent);
		filter: blur(30px);
		z-index: -1;
	}
	.card {
		width: 100%;
		max-width: 400px;
		display: grid;
		gap: 14px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 800;
		font-size: 20px;
	}
	.brand img {
		border-radius: 14px;
	}
	h1 {
		margin: 8px 0;
	}
	.apple {
		background: #000;
		color: #fff;
		border: 1px solid #000;
	}
	.google {
		background: #fff;
		color: #1f1f1f;
		border: 1px solid var(--outline-variant);
	}
	.or {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 13px;
	}
	.or::before,
	.or::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--outline-variant);
	}
	.switch {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 8px;
	}
	.link {
		border: 0;
		background: none;
		padding: 8px 0;
		color: inherit;
	}
	.link strong {
		color: var(--primary);
	}
	.small {
		font-size: 13px;
	}
	.small a {
		text-decoration: underline;
	}
</style>
