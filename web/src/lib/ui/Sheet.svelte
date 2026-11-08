<script lang="ts">
	import type { Snippet } from 'svelte';

	// A dialog that slides up on phones and sits centred on wide screens. Escape
	// and a click outside close it; focus stays inside while it's open.
	let { open = $bindable(false), title, children }: { open?: boolean; title: string; children: Snippet } = $props();
	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-label={title}
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	{#if open}
		<div class="sheet">
			<h2>{title}</h2>
			{@render children()}
		</div>
	{/if}
</dialog>

<style>
	dialog {
		width: min(100%, 440px);
		max-height: 85dvh;
		margin: auto auto 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-xl) var(--radius-xl) 0 0;
		background: var(--surface-high);
		color: var(--on-background);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.55);
	}
	@media (min-width: 640px) {
		dialog {
			margin: auto;
			border-radius: var(--radius-xl);
		}
	}
	.sheet {
		display: grid;
		gap: 12px;
		padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
	}
</style>
