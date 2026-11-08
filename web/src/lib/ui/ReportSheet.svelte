<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { ReportTarget } from '#lib/api/types.js';
	import { toast } from '#lib/toast.svelte.js';
	import Sheet from './Sheet.svelte';

	// The same reasons as the apps, so moderators see one list.
	const reasons = ['Spam', 'Nudity or sexual content', 'Harassment or hate', 'Violence or dangerous behaviour', 'Illegal (e.g. drugs)', 'Something else'];

	let { open = $bindable(false), target, targetId }: { open?: boolean; target: ReportTarget; targetId: string } = $props();
	let reason = $state(reasons[0]);
	let busy = $state(false);

	async function send() {
		busy = true;
		try {
			await api.report(target, targetId, reason);
			toast.show("Thanks, we'll review it");
			open = false;
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't send that");
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open title="Report this {target}?">
	<p class="muted">Why are you reporting it? We review every report.</p>
	<div class="reasons" role="radiogroup">
		{#each reasons as r (r)}
			<label><input type="radio" name="reason" value={r} bind:group={reason} /> {r}</label>
		{/each}
	</div>
	<div class="row">
		<button class="btn" onclick={() => (open = false)}>Cancel</button>
		<button class="btn primary" disabled={busy} onclick={send}>Report</button>
	</div>
</Sheet>

<style>
	.reasons {
		display: grid;
	}
	label {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
	}
	input {
		accent-color: var(--primary);
		width: 18px;
		height: 18px;
	}
	.row {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
