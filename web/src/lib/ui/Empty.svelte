<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div class="empty">
	<h2>{title}</h2>
	{#if children}<div class="muted">{@render children()}</div>{/if}
</div>

<style>
	.empty {
		display: grid;
		gap: 8px;
		justify-items: center;
		text-align: center;
		padding: 48px 24px;
	}
</style>
