<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { Event, Post } from '#lib/api/types.js';
	import { Paged } from '#lib/paged.svelte.js';
	import Empty from '#lib/ui/Empty.svelte';
	import EventCard from '#lib/ui/EventCard.svelte';
	import LoadMore from '#lib/ui/LoadMore.svelte';
	import Photo from '#lib/ui/Photo.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PageHeader from '../PageHeader.svelte';

	let tab = $state<'posts' | 'parties'>('posts');
	let parties = $state<Event[] | null>(null);
	const posts = new Paged<Post>(async (cursor) => {
		const page = await api.savedPosts(cursor);
		return { items: page.posts, next: page.next_cursor ?? null };
	});

	$effect(() => {
		void posts.refresh();
		api.savedEvents().then((list) => (parties = list), () => (parties = []));
	});
</script>

<svelte:head><title>Saved · PartyNearMe</title></svelte:head>

<PageHeader title="Saved" back />

<div class="tabs" role="tablist">
	<button role="tab" aria-selected={tab === 'posts'} onclick={() => (tab = 'posts')}>Posts</button>
	<button role="tab" aria-selected={tab === 'parties'} onclick={() => (tab = 'parties')}>Parties</button>
</div>

{#if tab === 'posts'}
	<div class="grid">
		{#each posts.items as post (post.id)}
			{#if post.media[0]}<a href="/p/{post.id}" aria-label={post.caption ?? 'Photo'}><Photo media={post.media[0]} sizes="210px" /></a>{/if}
		{/each}
	</div>
	{#if posts.loadedOnce && !posts.items.length}
		<Empty title="No saved posts">Tap the bookmark on a post to keep it here.</Empty>
	{:else}
		<LoadMore list={posts} />
	{/if}
{:else if !parties}
	<Spinner />
{:else if !parties.length}
	<Empty title="No saved parties">Tap the bookmark on a party to keep it here.</Empty>
{:else}
	<div class="list">
		{#each parties as event (event.id)}<EventCard {event} />{/each}
	</div>
{/if}

<style>
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--outline-variant);
	}
	.tabs button {
		flex: 1;
		min-height: 44px;
		border: 0;
		background: none;
		font-weight: 600;
		color: var(--on-surface-variant);
		border-bottom: 2px solid transparent;
	}
	.tabs button[aria-selected='true'] {
		color: var(--on-background);
		border-bottom-color: var(--primary);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 3px;
		margin-top: 3px;
	}
	.grid :global(.photo) {
		aspect-ratio: 1 !important;
	}
	.list {
		display: grid;
		gap: 16px;
		padding: 16px 12px;
	}
</style>
