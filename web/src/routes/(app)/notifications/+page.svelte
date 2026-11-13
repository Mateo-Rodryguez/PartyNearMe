<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { Notification } from '#lib/api/types.js';
	import { coverFor, nameOf, timeAgo } from '#lib/format.js';
	import { unread } from '#lib/unread.svelte.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Empty from '#lib/ui/Empty.svelte';
	import Skeleton from '#lib/ui/Skeleton.svelte';
	import PageHeader from '../PageHeader.svelte';

	const known = new Set(['like', 'comment', 'tag', 'follow', 'rsvp', 'request', 'reminder']);
	let items = $state<Notification[] | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		api.notifications().then(
			(page) => {
				items = page.notifications.filter((n) => known.has(n.type));
				if (page.unread_count) void api.markNotificationsSeen().then(() => (unread.notifications = 0), () => undefined);
			},
			(e: unknown) => (error = e instanceof Error ? e.message : 'Something went wrong')
		);
	});

	function href(n: Notification): string {
		if ((n.type === 'like' || n.type === 'tag' || n.type === 'comment') && n.post_id) return `/p/${n.post_id}${n.type === 'comment' ? '#comments' : ''}`;
		if (n.type === 'follow' && n.actor) return `/u/${n.actor.id}`;
		if (n.event_id) return `/e/${n.event_id}`;
		return '/notifications';
	}
</script>

<svelte:head><title>Notifications · PartyNearMe</title></svelte:head>

<PageHeader title="Notifications" back />

{#if error}
	<Empty title="Couldn't load notifications">{error}</Empty>
{:else if !items}
	<Skeleton count={8} />
{:else if !items.length}
	<Empty title="Nothing yet">Likes, comments, new followers and party reminders show up here.</Empty>
{:else}
	<ul>
		{#each items as n (n.id)}
			{@const who = n.actor ? nameOf(n.actor) : 'Someone'}
			{@const party = n.event_title ?? 'a party'}
			<li class:unread={n.unread}>
				<a href={href(n)}>
					{#if n.actor}<Avatar person={n.actor} size={44} />{:else}<span class="cover" style:background={coverFor(n.event_id ?? n.id)}></span>{/if}
					<p>
						{#if n.type === 'like'}<strong>{who}</strong> liked your photo.
						{:else if n.type === 'comment'}<strong>{who}</strong> commented: {n.comment_text}
						{:else if n.type === 'tag'}<strong>{who}</strong> tagged you in a photo.
						{:else if n.type === 'follow'}<strong>{who}</strong> started following you.
						{:else if n.type === 'request'}<strong>{who}</strong> asked to come to <strong>{party}</strong>.
						{:else if n.type === 'rsvp'}<strong>{who}</strong> is going to <strong>{party}</strong>.
						{:else}<strong>{party}</strong> is coming up soon. Get ready!{/if}
						<span class="muted"> {timeAgo(n.created_at)}</span>
					</p>
					{#if n.post_thumbnail_url}
						<img src={n.post_thumbnail_url} alt="" width="48" height="48" loading="lazy" />
					{:else if n.event_cover_url}
						<img src={n.event_cover_url} alt="" width="48" height="48" loading="lazy" />
					{/if}
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li.unread {
		background: color-mix(in srgb, var(--primary-container) 35%, transparent);
	}
	a {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
	}
	p {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	img,
	.cover {
		flex: none;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-xs);
		object-fit: cover;
	}
	.cover {
		border-radius: 50%;
		width: 44px;
		height: 44px;
	}
</style>
