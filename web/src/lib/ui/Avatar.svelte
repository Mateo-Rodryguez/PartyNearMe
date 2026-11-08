<script lang="ts">
	import type { Person } from '#lib/api/types.js';
	import { nameOf } from '#lib/format.js';

	let { person, size = 36, ring = false }: { person: Person; size?: number; ring?: boolean } = $props();
	const initial = $derived(nameOf(person).replace('@', '').charAt(0).toUpperCase());
</script>

<span class="avatar" class:ring style:--size="{size}px">
	{#if person.avatar_url}
		<img src={person.avatar_url} alt="" width={size} height={size} loading="lazy" decoding="async" />
	{:else}
		<span class="initial" aria-hidden="true">{initial}</span>
	{/if}
</span>

<style>
	.avatar {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		overflow: hidden;
		background: var(--surface-highest);
	}
	.ring {
		padding: 2px;
		background: var(--sunset);
	}
	.ring img,
	.ring .initial {
		border: 2px solid var(--background);
	}
	img,
	.initial {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
	}
	.initial {
		display: grid;
		place-items: center;
		background: var(--surface-highest);
		font-weight: 700;
		font-size: calc(var(--size) * 0.42);
		color: var(--on-surface-variant);
	}
</style>
