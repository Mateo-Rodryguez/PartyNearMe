<script lang="ts">
	// Grey shapes in the layout of what's loading, with a soft light sweeping across,
	// as Instagram and Facebook use instead of a spinner. Same shapes as the apps.
	// Still when the person asks for reduced motion.
	let { kind = 'row', count = 1 }: { kind?: 'post' | 'party' | 'row' | 'profile'; count?: number } = $props();
</script>

<div class="skeleton {kind}" role="status" aria-label="Loading">
	{#if kind === 'profile'}
		<span class="bone round" style:width="88px" style:height="88px"></span>
		<span class="bone" style:width="150px" style:height="18px"></span>
		<div class="counts">
			{#each [0, 1, 2] as i (i)}
				<div><span class="bone" style:width="28px" style:height="16px"></span><span class="bone" style:width="56px" style:height="10px"></span></div>
			{/each}
		</div>
		<div class="grid">
			{#each Array(9) as _, i (i)}<span class="bone tile"></span>{/each}
		</div>
	{:else}
		{#each Array(count) as _, i (i)}
			{#if kind === 'post'}
				<div class="post">
					<div class="head"><span class="bone round" style:width="38px" style:height="38px"></span><div class="lines"><span class="bone" style:width="120px"></span><span class="bone" style:width="80px" style:height="10px"></span></div></div>
					<span class="bone photo"></span>
					<div class="lines"><span class="bone" style:width="220px"></span><span class="bone" style:width="160px"></span></div>
				</div>
			{:else if kind === 'party'}
				<div class="party">
					<span class="bone cover"></span>
					<span class="bone" style:width="200px" style:height="14px"></span>
					<span class="bone" style:width="140px"></span>
				</div>
			{:else}
				<div class="row">
					<span class="bone round" style:width="52px" style:height="52px"></span>
					<div class="lines"><span class="bone" style:width="170px"></span><span class="bone" style:width="110px" style:height="10px"></span></div>
				</div>
			{/if}
		{/each}
	{/if}
</div>

<style>
	.skeleton {
		display: grid;
		gap: 16px;
		padding: 8px 0;
	}
	.bone {
		display: block;
		height: 12px;
		max-width: 100%;
		border-radius: 6px;
		background: var(--surface-high);
		background-image: linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.14) 50%, transparent 100%);
		background-size: 200% 100%;
		background-repeat: no-repeat;
		animation: sweep 1.3s linear infinite;
	}
	.round {
		border-radius: 50%;
		flex: none;
	}
	@keyframes sweep {
		from {
			background-position: 150% 0;
		}
		to {
			background-position: -50% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bone {
			animation: none;
			background-image: none;
		}
	}
	.lines {
		display: grid;
		gap: 8px;
	}
	.post,
	.party {
		display: grid;
		gap: 12px;
	}
	.head,
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.photo {
		height: auto;
		aspect-ratio: 4 / 5;
		border-radius: 24px;
	}
	.cover {
		height: 190px;
		border-radius: 22px;
	}
	.profile {
		justify-items: center;
		gap: 14px;
	}
	.counts {
		display: flex;
		gap: 36px;
	}
	.counts div {
		display: grid;
		justify-items: center;
		gap: 6px;
	}
	.grid {
		width: 100%;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 3px;
		margin-top: 10px;
	}
	.tile {
		height: auto;
		aspect-ratio: 4 / 5;
		border-radius: 0;
	}
</style>
