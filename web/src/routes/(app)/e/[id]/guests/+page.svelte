<script lang="ts">
	import { page } from '$app/state';
	import { api } from '#lib/api/client.js';
	import type { GuestList, Person } from '#lib/api/types.js';
	import { nameOf } from '#lib/format.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Empty from '#lib/ui/Empty.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PageHeader from '../../../PageHeader.svelte';

	const id = $derived(page.params.id ?? '');
	let list = $state<GuestList | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		api.guests(id).then(
			(g) => (list = g),
			(e: unknown) => (error = e instanceof Error ? e.message : 'Something went wrong')
		);
	});

	async function approve(person: Person) {
		if (!list) return;
		try {
			await api.approveGuest(id, person.id);
			list = { requested: list.requested.filter((p) => p.id !== person.id), going: [person, ...list.going] };
		} catch {
			toast.show("Couldn't approve them");
		}
	}

	async function remove(person: Person, request: boolean) {
		if (!list || (!request && !confirm(`Take ${nameOf(person)} off the guest list?`))) return;
		try {
			await api.removeGuest(id, person.id);
			list = { requested: list.requested.filter((p) => p.id !== person.id), going: list.going.filter((p) => p.id !== person.id) };
		} catch {
			toast.show("Couldn't do that");
		}
	}
</script>

<svelte:head><title>Guest list · PartyNearMe</title></svelte:head>

<PageHeader title="Guest list" back />

{#if error}
	<Empty title="Couldn't load the guest list">{error}</Empty>
{:else if !list}
	<Spinner />
{:else}
	<section>
		<h2>Asked to come ({list.requested.length})</h2>
		{#each list.requested as person (person.id)}
			<div class="row">
				<a href="/u/{person.id}"><Avatar {person} size={40} /> <span>{nameOf(person)}</span></a>
				<button class="btn" onclick={() => remove(person, true)}>Decline</button>
				<button class="btn primary" onclick={() => approve(person)}>Approve</button>
			</div>
		{:else}
			<p class="muted">No one's waiting.</p>
		{/each}
	</section>
	<section>
		<h2>Going ({list.going.length})</h2>
		{#each list.going as person (person.id)}
			<div class="row">
				<a href="/u/{person.id}"><Avatar {person} size={40} /> <span>{nameOf(person)}</span></a>
				<button class="btn outline" onclick={() => remove(person, false)}>Remove</button>
			</div>
		{:else}
			<p class="muted">No guests yet.</p>
		{/each}
	</section>
{/if}

<style>
	section {
		display: grid;
		gap: 8px;
		padding: 8px 16px 20px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.row a {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.row .btn {
		min-height: 36px;
		padding: 0 14px;
	}
</style>
