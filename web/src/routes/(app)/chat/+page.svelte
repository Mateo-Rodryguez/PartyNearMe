<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { Conversation } from '#lib/api/types.js';
	import { coverFor, nameOf, timeAgo } from '#lib/format.js';
	import { Paged } from '#lib/paged.svelte.js';
	import { listen } from '#lib/realtime.js';
	import { session } from '#lib/session.svelte.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Empty from '#lib/ui/Empty.svelte';
	import LoadMore from '#lib/ui/LoadMore.svelte';
	import PageHeader from '../PageHeader.svelte';

	const inbox = new Paged<Conversation>(async (cursor) => {
		const page = await api.inbox(cursor);
		return { items: page.conversations, next: page.next_cursor ?? null };
	});

	// Fresh when opened, and again whenever a message arrives in any chat.
	$effect(() => {
		void inbox.refresh();
		return listen(null, () => void inbox.refresh());
	});

	const title = (c: Conversation) => c.party?.title ?? (c.other ? nameOf(c.other) : 'Deleted account');

	/** "You: ", or the sender's name in a party chat, before the last message. */
	function prefix(c: Conversation, senderId: string) {
		if (senderId === session.userId) return 'You: ';
		if (c.party) return `${nameOf(c.members?.find((m) => m.id === senderId) ?? {})}: `;
		return '';
	}
</script>

<svelte:head><title>Messages · PartyNearMe</title></svelte:head>

<PageHeader title="Messages" />

{#if inbox.loadedOnce && !inbox.items.length && !inbox.error}
	<Empty title="No messages yet">Open someone's profile and tap Message to plan your next night out.</Empty>
{:else}
	<ul>
		{#each inbox.items as c (c.id)}
			<li>
				<a href="/chat/{c.id}" class:unread={c.unread_count > 0}>
					{#if c.party}
						<span class="cover" style:background={c.party.cover_url ? `center / cover url(${c.party.cover_url})` : coverFor(c.party.id)}></span>
					{:else}
						<Avatar person={c.other ?? { id: c.id, display_name: 'Deleted account' }} size={56} ring={c.unread_count > 0} />
					{/if}
					<span class="text">
						<strong>{title(c)}</strong>
						{#if c.last_message}
							<span class="last">{prefix(c, c.last_message.sender_id)}{c.last_message.body}{c.last_message_at ? ` · ${timeAgo(c.last_message_at)}` : ''}</span>
						{/if}
					</span>
					{#if c.unread_count > 0}<span class="dot" aria-label="Unread"></span>{/if}
				</a>
			</li>
		{/each}
	</ul>
	<LoadMore list={inbox} />
{/if}

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	a {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 16px;
	}
	a:hover {
		background: var(--surface);
	}
	.cover {
		flex: none;
		width: 56px;
		height: 56px;
		border-radius: 50%;
	}
	.text {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.last {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--on-surface-variant);
	}
	.unread .last {
		color: var(--on-background);
		font-weight: 600;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--gradient);
	}
</style>
