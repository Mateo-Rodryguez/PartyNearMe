<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { ListedPerson, Person } from '#lib/api/types.js';
	import { nameOf } from '#lib/format.js';
	import { session } from '#lib/session.svelte.js';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import Spinner from './Spinner.svelte';

	// Picks people, as in the apps: the ones you follow first, or anyone by
	// searching. Used to invite people to a party and to tag them in photos.
	let {
		button,
		initial = [],
		max = 20,
		busy = false,
		ondone
	}: { button: string; initial?: Person[]; max?: number; busy?: boolean; ondone: (people: Person[]) => void } = $props();

	let query = $state('');
	let following = $state<ListedPerson[]>([]);
	let results = $state<ListedPerson[]>([]);
	let loaded = $state(false);
	let picked = $state<Person[]>([]);

	$effect(() => {
		picked = [...initial];
		const me = session.userId;
		if (!me) return;
		api.following(me).then(
			(page) => (following = page.users),
			() => undefined
		).finally(() => (loaded = true));
	});

	// Searches a moment after typing stops, and only keeps the latest answer.
	$effect(() => {
		const q = query.trim();
		if (!q) {
			results = [];
			return;
		}
		let stale = false;
		const timer = setTimeout(() => {
			api.searchUsers(q).then((page) => !stale && (results = page.users), () => undefined);
		}, 250);
		return () => {
			stale = true;
			clearTimeout(timer);
		};
	});

	const shown = $derived((query.trim() ? results : following).filter((p) => p.id !== session.userId));
	const isPicked = (id: string) => picked.some((p) => p.id === id);

	function toggle(person: Person) {
		if (isPicked(person.id)) picked = picked.filter((p) => p.id !== person.id);
		else if (picked.length < max) picked = [...picked, person];
	}
</script>

<div class="picker">
	<input class="field" type="search" placeholder="Search people" aria-label="Search people" autocomplete="off" bind:value={query} />
	<div class="list">
		{#if !loaded}
			<Spinner />
		{:else if !shown.length && !query.trim()}
			<p class="muted none">Follow people to see them here, or search by name or username.</p>
		{:else if !shown.length}
			<p class="muted none">Nobody matches "{query.trim()}".</p>
		{:else}
			{#each shown as person (person.id)}
				<button class="row" aria-pressed={isPicked(person.id)} onclick={() => toggle(person)}>
					<Avatar {person} size={44} />
					<span class="name">
						<strong>{nameOf(person)}</strong>
						{#if person.username}<span class="muted">@{person.username}</span>{/if}
					</span>
					<span class="tick" aria-hidden="true">{#if isPicked(person.id)}<Icon name="check" size={18} />{/if}</span>
				</button>
			{/each}
		{/if}
	</div>
	<button class="btn primary block" disabled={(!picked.length && !initial.length) || busy} onclick={() => ondone(picked)}>
		{busy ? 'Sending…' : picked.length ? `${button} (${picked.length})` : button}
	</button>
</div>

<style>
	.picker {
		display: grid;
		gap: 12px;
	}
	.list {
		display: grid;
		align-content: start;
		gap: 2px;
		min-height: 120px;
		max-height: 55dvh;
		overflow-y: auto;
	}
	.none {
		text-align: center;
		padding: 24px 8px;
		margin: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 6px 4px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.row:hover {
		background: var(--surface);
	}
	.name {
		flex: 1;
		display: grid;
		min-width: 0;
	}
	.name > * {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tick {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--surface-high);
		color: #fff;
	}
	.row[aria-pressed='true'] .tick {
		background: var(--gradient);
	}
</style>
