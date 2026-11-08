<script lang="ts">
	import { analytics } from '#lib/analytics.js';
	import { api } from '#lib/api/client.js';
	import type { ListedPerson } from '#lib/api/types.js';
	import { nameOf } from '#lib/format.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PageHeader from '../PageHeader.svelte';

	let query = $state('');
	let results = $state<ListedPerson[]>([]);
	let loading = $state(false);
	let searched = $state(false);

	// Searches a moment after typing stops, and only shows the latest answer.
	$effect(() => {
		const q = query.trim();
		if (q.length < 2) {
			results = [];
			searched = false;
			return;
		}
		let stale = false;
		const timer = setTimeout(async () => {
			loading = true;
			try {
				const page = await api.searchUsers(q);
				if (!stale) results = page.users;
				if (!stale && !page.users.length && q.length >= 3) analytics.capture('search_no_results', { length: q.length });
			} catch {
				if (!stale) results = [];
			} finally {
				if (!stale) {
					loading = false;
					searched = true;
				}
			}
		}, 250);
		return () => {
			stale = true;
			clearTimeout(timer);
		};
	});
</script>

<svelte:head><title>Search · PartyNearMe</title></svelte:head>

<PageHeader title="Search" />

<div class="box">
	<label class="visually-hidden" for="q">Search people</label>
	<input id="q" class="field" type="search" placeholder="Search people" autocomplete="off" bind:value={query} />
</div>

{#if loading && !results.length}
	<Spinner />
{:else if searched && !results.length}
	<p class="muted none">No one found.</p>
{/if}

<ul>
	{#each results as person (person.id)}
		<li>
			<a href="/u/{person.id}">
				<Avatar {person} size={44} />
				<span>
					<strong>{nameOf(person)}</strong>
					{#if person.username && person.display_name}<span class="muted">@{person.username}</span>{/if}
				</span>
			</a>
		</li>
	{/each}
</ul>

<style>
	.box {
		padding: 0 12px 12px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0 12px;
	}
	li a {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
	}
	li span {
		display: grid;
	}
	.none {
		text-align: center;
		padding: 24px;
	}
</style>
