<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';

	let { title, back = false, actions }: { title: string; back?: boolean; actions?: Snippet } = $props();
</script>

<header>
	{#if back}
		<button class="back" aria-label="Back" onclick={() => (history.length > 1 ? history.back() : (location.href = '/feed'))}>
			<Icon name="back" />
		</button>
	{/if}
	<h1>{title}</h1>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 56px;
		padding: 8px 12px;
		background: color-mix(in srgb, var(--background) 88%, transparent);
		backdrop-filter: blur(16px);
	}
	h1 {
		flex: 1;
		font-size: 22px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.back {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 50%;
		background: none;
	}
	.actions {
		display: flex;
		gap: 4px;
	}
</style>
