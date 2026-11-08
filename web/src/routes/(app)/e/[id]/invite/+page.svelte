<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api/client.js';
	import type { Event, Person } from '#lib/api/types.js';
	import { inviteResultText } from '#lib/format.js';
	import { toast } from '#lib/toast.svelte.js';
	import PeoplePicker from '#lib/ui/PeoplePicker.svelte';
	import PageHeader from '../../../PageHeader.svelte';

	// Invites people to a party: each one gets a message in their chat with you that opens it.
	const id = $derived(page.params.id ?? '');
	let event = $state<Event | null>(null);
	let sending = $state(false);

	$effect(() => {
		api.event(id).then((e) => (event = e), () => undefined);
	});

	async function send(people: Person[]) {
		sending = true;
		try {
			const { sent, skipped } = await api.invite(id, people.map((p) => p.id));
			toast.show(inviteResultText(sent, skipped));
			if (sent > 0) await goto(`/e/${id}`, { replaceState: true });
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't send the invites");
		} finally {
			sending = false;
		}
	}
</script>

<svelte:head><title>Invite friends · PartyNearMe</title></svelte:head>

<PageHeader title={event ? `Invite to ${event.title}` : 'Invite friends'} back />

<div class="page">
	<PeoplePicker button="Send invites" busy={sending} ondone={send} />
</div>

<style>
	.page {
		padding: 0 16px 24px;
	}
</style>
