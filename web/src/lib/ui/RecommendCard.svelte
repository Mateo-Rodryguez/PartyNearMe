<script lang="ts">
	import { analytics } from '#lib/analytics.js';
	import { api } from '#lib/api/client.js';
	import { toast } from '#lib/toast.svelte.js';
	import Icon from './Icon.svelte';

	// "How likely are you to recommend PartyNearMe to a friend?" (0-10), the Net
	// Promoter Score, at the top of Home when lib/recommend.ts says it's time. The
	// app grows by word of mouth, so this is the number that matters most.
	let { ondone }: { ondone: () => void } = $props();
	let score = $state<number | null>(null);
	let reason = $state('');
	let busy = $state(false);
	analytics.capture('recommend_shown');

	async function send() {
		if (score === null) return;
		busy = true;
		try {
			await api.sendFeedback('nps', { score, body: reason, screen: 'home' });
			toast.show(score >= 9 ? 'Thank you! Tell a friend tonight' : 'Thanks, this helps us improve');
			ondone();
		} catch (err) {
			toast.show(err instanceof Error ? err.message : "Couldn't send that");
		} finally {
			busy = false;
		}
	}
</script>

<section class="card" aria-label="Would you recommend PartyNearMe?">
	<div class="top">
		<h2>How likely are you to recommend PartyNearMe to a friend?</h2>
		<button class="close" aria-label="Not now" onclick={() => {
				analytics.capture('recommend_dismissed');
				ondone();
			}}><Icon name="close" size={18} /></button>
	</div>
	<div class="scale" role="radiogroup" aria-label="Score from 0 to 10">
		{#each Array.from({ length: 11 }, (_, n) => n) as n (n)}
			<button role="radio" aria-checked={score === n} onclick={() => (score = n)}>{n}</button>
		{/each}
	</div>
	<div class="ends muted"><span>Not likely</span><span>Very likely</span></div>
	{#if score !== null}
		<textarea
			class="field"
			rows="2"
			maxlength="2000"
			aria-label="Why"
			placeholder={score >= 9 ? 'What do you love most? (optional)' : 'What would make it a 10? (optional)'}
			bind:value={reason}
		></textarea>
		<button class="btn primary send" disabled={busy} onclick={send}>{busy ? 'Sending…' : 'Send'}</button>
	{/if}
</section>

<style>
	.card {
		display: grid;
		gap: 10px;
		margin: 8px 16px;
		padding: 16px;
		border-radius: 20px;
		background: var(--surface);
	}
	.top {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	h2 {
		flex: 1;
		margin: 4px 0 0;
		font-size: 15px;
	}
	.close {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--on-surface-variant);
		cursor: pointer;
	}
	.scale {
		display: grid;
		grid-template-columns: repeat(11, minmax(0, 1fr));
		gap: 4px;
	}
	.scale button {
		height: 36px;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: var(--surface-high);
		color: var(--on-background);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.scale button[aria-checked='true'] {
		background: var(--gradient);
		color: #fff;
		font-weight: 700;
	}
	.ends {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
	}
	.send {
		justify-self: end;
	}
</style>
