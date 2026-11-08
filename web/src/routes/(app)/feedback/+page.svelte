<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { FeedbackKind } from '#lib/api/types.js';
	import { toast } from '#lib/toast.svelte.js';
	import PageHeader from '../PageHeader.svelte';

	// Settings > Send feedback, as in the apps: what people love, what got in
	// their way, or what they wish PartyNearMe did. Only we can read it.
	const kinds: { id: Extract<FeedbackKind, 'love' | 'problem' | 'idea'>; label: string; hint: string }[] = [
		{ id: 'love', label: 'I love something', hint: 'What do you love?' },
		{ id: 'problem', label: "Something's wrong", hint: 'What happened, and what were you trying to do?' },
		{ id: 'idea', label: 'I have an idea', hint: 'What should PartyNearMe do?' }
	];
	let kind = $state<(typeof kinds)[number]['id']>('love');
	let text = $state('');
	let busy = $state(false);

	async function send(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		try {
			await api.sendFeedback(kind, { body: text, screen: 'feedback' });
			toast.show('Thanks! We read every one.');
			history.back();
		} catch (err) {
			toast.show(err instanceof Error ? err.message : "Couldn't send that");
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Send feedback · PartyNearMe</title></svelte:head>

<PageHeader title="Send feedback" back />

<form class="page" onsubmit={send}>
	<p class="muted">
		We read every message. Tell us what you love, what got in your way, or what you wish PartyNearMe did, and we'll keep making it
		better.
	</p>
	<div class="chips" role="radiogroup" aria-label="Kind of feedback">
		{#each kinds as k (k.id)}
			<button type="button" class="chip" role="radio" aria-checked={kind === k.id} onclick={() => (kind = k.id)}>{k.label}</button>
		{/each}
	</div>
	<textarea class="field" rows="6" maxlength="2000" aria-label="Your feedback" placeholder={kinds.find((k) => k.id === kind)?.hint} bind:value={text}></textarea>
	<button class="btn primary block" disabled={!text.trim() || busy}>{busy ? 'Sending…' : 'Send'}</button>
</form>

<style>
	.page {
		display: grid;
		gap: 14px;
		padding: 8px 16px 32px;
	}
	.page p {
		margin: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
