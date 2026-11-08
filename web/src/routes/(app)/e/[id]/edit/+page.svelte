<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api/client.js';
	import type { Event } from '#lib/api/types.js';
	import { toast } from '#lib/toast.svelte.js';
	import Empty from '#lib/ui/Empty.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PageHeader from '../../../PageHeader.svelte';
	import PartyForm from '../../../PartyForm.svelte';

	let event = $state<Event | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		api.event(page.params.id ?? '').then(
			(e) => (event = e),
			(e: unknown) => (error = e instanceof Error ? e.message : 'Something went wrong')
		);
	});

	async function cancelParty() {
		if (!event || !confirm('Cancel this party? Everyone going gets a notification.')) return;
		try {
			event = await api.updateEvent(event.id, { status: 'cancelled' });
			toast.show('Party cancelled');
			await goto(`/e/${event.id}`, { replaceState: true });
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't cancel it");
		}
	}

	async function deleteParty() {
		if (!event || !confirm('Delete this party for good? Its photos stay on their posts.')) return;
		try {
			await api.deleteEvent(event.id);
			toast.show('Party deleted');
			await goto('/me', { replaceState: true });
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't delete it");
		}
	}
</script>

<svelte:head><title>Edit party · PartyNearMe</title></svelte:head>

<PageHeader title="Edit party" back />

{#if error}
	<Empty title="Couldn't open this party">{error}</Empty>
{:else if !event}
	<Spinner />
{:else}
	<PartyForm editing={event} />
	<div class="danger-zone">
		{#if event.status === 'published'}
			<button class="btn block outline" onclick={cancelParty}>Cancel party</button>
		{/if}
		<button class="btn block danger outline" onclick={deleteParty}>Delete party</button>
	</div>
{/if}

<style>
	.danger-zone {
		display: grid;
		gap: 10px;
		padding: 0 16px 32px;
	}
</style>
