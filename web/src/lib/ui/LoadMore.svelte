<script lang="ts">
	import Spinner from './Spinner.svelte';

	// Loads the next page as this comes near the screen.
	let { list }: { list: { error: string | null; ended: boolean; more: () => Promise<void> } } = $props();
	let sentinel = $state<HTMLElement>();

	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting) && !list.error) void list.more();
			},
			{ rootMargin: '800px 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

{#if list.error}
	<div class="retry">
		<p class="error">{list.error}</p>
		<button class="btn" onclick={() => list.more()}>Try again</button>
	</div>
{:else if !list.ended}
	<div bind:this={sentinel}><Spinner /></div>
{/if}

<style>
	.retry {
		display: grid;
		gap: 12px;
		justify-items: center;
		padding: 24px;
		text-align: center;
	}
</style>
