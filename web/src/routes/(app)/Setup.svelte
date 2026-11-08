<script lang="ts">
	import { analytics, screenOf } from '#lib/analytics.js';
	import { api } from '#lib/api/client.js';
	import type { Interest, OwnProfile } from '#lib/api/types.js';
	import { currentLocation } from '#lib/location.js';
	import Icon from '#lib/ui/Icon.svelte';

	// A new account's first minute, the same steps as the apps: pick a username
	// (so posts and chats have a name on them), then what you're into, how you
	// heard about us, and location with a reason before the browser asks. Only
	// the username is required.
	let { profile, ondone }: { profile: OwnProfile; ondone: (profile: OwnProfile) => void } = $props();

	const USERNAME = /^[a-z0-9_.]{3,30}$/;
	// The wire values match the backend's HEARD_FROM.
	const heardFrom = [
		['friend', 'A friend told me'],
		['shared_link', 'Someone shared a party or post'],
		['social_media', 'Social media'],
		['venue_or_event', 'At a venue or party'],
		['app_store', 'Browsing the app store'],
		['other', 'Somewhere else']
	] as const;

	let step = $state(0);
	let saved = $state<OwnProfile | null>(null);
	let username = $state('');
	let displayName = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let interests = $state<Interest[]>([]);
	let picked = $state<number[]>([]);
	let source = $state<string | null>(null);

	$effect(() => {
		displayName = profile.display_name ?? '';
		api.interests().then((list) => (interests = list), () => undefined);
	});

	const valid = $derived(USERNAME.test(username));
	// Each step is its own screen, so the funnel shows where people give up.
	$effect(() => analytics.screenView(['profile_setup', 'onboarding_interests', 'onboarding_heard_from', 'onboarding_location'][step]));

	async function saveName(e: SubmitEvent) {
		e.preventDefault();
		if (!valid) return;
		busy = true;
		error = null;
		try {
			saved = await api.updateMe({ username, ...(displayName.trim() ? { display_name: displayName.trim() } : {}) });
			analytics.capture('account_created');
			step = 1;
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't save that";
		} finally {
			busy = false;
		}
	}

	async function saveInterests() {
		if (picked.length) {
			busy = true;
			error = null;
			try {
				saved = await api.setInterests(picked);
			} catch (err) {
				error = err instanceof Error ? err.message : "Couldn't save that";
				busy = false;
				return;
			}
			busy = false;
		}
		step = 2;
	}

	function saveSource() {
		// Never holds up setup: sent in the background, and a failure is dropped.
		if (source) analytics.capture('heard_about_us', { source });
		if (source) void api.sendFeedback('heard_from', { body: source, screen: 'onboarding_heard_from' }).catch(() => undefined);
		step = 3;
	}

	async function finish(askLocation: boolean) {
		let allowed = false;
		if (askLocation) {
			busy = true;
			allowed = (await currentLocation()) != null;
			busy = false;
		}
		analytics.capture('onboarding_completed', { interests: picked.length, location: allowed });
		analytics.screenView(screenOf(location.pathname, profile.id));
		if (saved) ondone(saved);
	}

	function toggle(id: number) {
		picked = picked.includes(id) ? picked.filter((i) => i !== id) : picked.length < 10 ? [...picked, id] : picked;
	}
</script>

<main class="setup">
	<div class="dots" aria-hidden="true">
		{#each [0, 1, 2, 3] as i (i)}<span class:on={i <= step} class:current={i === step}></span>{/each}
	</div>

	{#if step === 0}
		<form class="step" onsubmit={saveName}>
			<div class="grow">
				<p class="wordmark">PartyNearMe</p>
				<h1>Pick a username</h1>
				<p class="muted">It's how people find you and see who posted.</p>
				<label>
					<span class="overline">Username</span>
					<input
						class="field"
						autocapitalize="off"
						autocomplete="username"
						spellcheck="false"
						maxlength="30"
						placeholder="yourname"
						value={username}
						oninput={(e) => {
							username = e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30);
							e.currentTarget.value = username;
						}}
					/>
				</label>
				<p class="muted small">3 to 30 letters, numbers, dots or underscores.</p>
				<label>
					<span class="overline">Name (optional)</span>
					<input class="field" maxlength="50" autocomplete="name" bind:value={displayName} />
				</label>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
			</div>
			<button class="btn primary block" disabled={!valid || busy}>{busy ? 'Saving…' : 'Continue'}</button>
		</form>
	{:else if step === 1}
		<div class="step">
			<div class="grow">
				<h1>What are you into?</h1>
				<p class="muted">Pick a few. Your feed and Parties show more of it, and you can change it in settings.</p>
				<div class="chips">
					{#each interests as interest (interest.id)}
						<button class="chip" aria-pressed={picked.includes(interest.id)} onclick={() => toggle(interest.id)}>{interest.name}</button>
					{/each}
				</div>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
			</div>
			<button class="btn primary block" disabled={busy} onclick={saveInterests}>{picked.length ? 'Continue' : 'Skip'}</button>
		</div>
	{:else if step === 2}
		<div class="step">
			<div class="grow">
				<h1>How did you hear about PartyNearMe?</h1>
				<p class="muted">It helps us know what's working.</p>
				<div class="choices" role="radiogroup" aria-label="How you heard about us">
					{#each heardFrom as [wire, label] (wire)}
						<button class="chip" role="radio" aria-checked={source === wire} onclick={() => (source = wire)}>{label}</button>
					{/each}
				</div>
			</div>
			<button class="btn primary block" onclick={saveSource}>{source ? 'Continue' : 'Skip'}</button>
		</div>
	{:else}
		<div class="step center">
			<div class="grow">
				<span class="pin"><Icon name="place" size={48} /></span>
				<h1>Find parties near you</h1>
				<p class="muted">
					PartyNearMe uses your location only while you use it, to show what's on nearby. It never keeps a history of where you go.
				</p>
			</div>
			<button class="btn primary block" disabled={busy} onclick={() => finish(true)}>{busy ? 'Asking…' : 'Allow location'}</button>
			<button class="btn block link" disabled={busy} onclick={() => finish(false)}>Not now</button>
		</div>
	{/if}
</main>

<style>
	.setup {
		display: grid;
		grid-template-rows: auto 1fr;
		gap: 24px;
		width: min(100%, 480px);
		min-height: 100dvh;
		margin: 0 auto;
		padding: 24px 24px calc(24px + env(safe-area-inset-bottom));
	}
	.dots {
		display: flex;
		gap: 6px;
	}
	.dots span {
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: var(--surface-high);
		transition: width 0.2s;
	}
	.dots .on {
		background: var(--gradient);
	}
	.dots .current {
		width: 24px;
	}
	.step {
		display: grid;
		grid-template-rows: 1fr auto;
		gap: 10px;
	}
	.grow {
		display: grid;
		align-content: start;
		gap: 12px;
	}
	.center .grow {
		align-content: center;
		justify-items: center;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		line-height: 1.2;
	}
	.wordmark {
		margin: 0 0 12px;
		font-weight: 800;
		font-size: 26px;
		background: var(--gradient);
		background-clip: text;
		color: transparent;
	}
	label {
		display: grid;
		gap: 6px;
		margin-top: 4px;
	}
	.small {
		font-size: 13px;
		margin: -4px 0 0;
	}
	.error {
		color: var(--error);
		margin: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 8px;
	}
	.choices {
		display: grid;
		gap: 8px;
		margin-top: 8px;
	}
	.choices .chip {
		justify-content: flex-start;
		min-height: 48px;
		text-align: left;
	}
	.pin {
		display: grid;
		place-items: center;
		width: 96px;
		height: 96px;
		margin-bottom: 12px;
		border-radius: 50%;
		background: var(--gradient);
		color: #fff;
	}
	.link {
		background: none;
		color: var(--on-surface-variant);
	}
</style>
