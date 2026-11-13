<script lang="ts">
	import { api, FeedExpiredError } from '#lib/api/client.js';
	import type { Post } from '#lib/api/types.js';
	import { lastLocation } from '#lib/location.js';
	import { Paged } from '#lib/paged.svelte.js';
	import { session } from '#lib/session.svelte.js';
	import { unread } from '#lib/unread.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';
	import Empty from '#lib/ui/Empty.svelte';
	import Skeleton from '#lib/ui/Skeleton.svelte';
	import LoadMore from '#lib/ui/LoadMore.svelte';
	import PartyRail from '#lib/ui/PartyRail.svelte';
	import PostCard from '#lib/ui/PostCard.svelte';
	import RecommendCard from '#lib/ui/RecommendCard.svelte';
	import { visitAndCheck } from '#lib/recommend.js';
	import PageHeader from '../PageHeader.svelte';

	// The last feed shows at once while the free server wakes up, as on the phones.
	const CACHE = `pnm.feed.${session.userId}`;
	let slow = $state(false);
	// Once someone knows the app, ask if they'd recommend it (see lib/recommend.ts).
	let askRecommend = $state(visitAndCheck());

	/** The ranked list on screen, sent with impressions so the ranking can be measured. */
	let serveId = $state<string | null>(null);
	const feed = new Paged<Post>(async (cursor) => {
		const here = lastLocation();
		try {
			const page = await api.feed(here?.lat ?? null, here?.lng ?? null, cursor);
			if (!cursor) {
				serveId = page.serve_id ?? null;
				try {
					localStorage.setItem(CACHE, JSON.stringify(page.posts.slice(0, 10)));
				} catch {
					// Storage full or off: no saved copy.
				}
			}
			return { items: page.posts, next: page.next_cursor ?? null };
		} catch (e) {
			if (e instanceof FeedExpiredError && cursor) {
				void feed.refresh();
				return { items: [], next: null };
			}
			throw e;
		}
	});

	try {
		feed.items = JSON.parse(localStorage.getItem(CACHE) ?? '[]') as Post[];
	} catch {
		// Nothing saved.
	}

	$effect(() => {
		const timer = setTimeout(() => (slow = feed.loading), 4000);
		void feed.refresh().finally(() => {
			clearTimeout(timer);
			slow = false;
		});
		return () => clearTimeout(timer);
	});
</script>

<svelte:head><title>PartyNearMe</title></svelte:head>

<PageHeader title="PartyNearMe">
	{#snippet actions()}
		<a class="bell search" href="/search" aria-label="Search people"><Icon name="search" /></a>
		<a class="bell" href="/notifications" aria-label={unread.notifications ? `Notifications, ${unread.notifications} new` : 'Notifications'}>
			<Icon name="bell" />
			{#if unread.notifications}<span class="badge">{unread.notifications > 9 ? '9+' : unread.notifications}</span>{/if}
		</a>
	{/snippet}
</PageHeader>

{#if slow}
	<p class="waking muted" role="status">Waking the server up, this can take a moment…</p>
{/if}

{#if askRecommend}
	<RecommendCard ondone={() => (askRecommend = false)} />
{/if}

<PartyRail />

<div class="feed">
	{#each feed.items as post, i (post.id)}
		<PostCard bind:post={feed.items[i]} eager={i === 0} placement={{ surface: 'feed', serve_id: serveId, position: i }} ongone={() => (feed.items = feed.items.filter((p) => p.id !== post.id))} />
	{/each}
</div>

{#if !feed.loadedOnce && !feed.items.length}
	<Skeleton kind="post" count={2} />
{:else if feed.loadedOnce && !feed.items.length && !feed.error}
	<Empty title="Nothing here yet">
		Follow people and say you're going to parties, and their photos show up here.
		<p><a class="btn primary" href="/nearby">Find parties</a></p>
	</Empty>
{:else}
	<LoadMore list={feed} />
{/if}

<style>
	.feed {
		display: grid;
		gap: 8px;
	}
	.bell {
		position: relative;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
	}
	@media (min-width: 900px) {
		.search {
			display: none;
		}
	}
	.badge {
		position: absolute;
		top: 2px;
		right: 0;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: var(--gradient);
		color: var(--on-primary);
		font-size: 11px;
		font-weight: 700;
		line-height: 18px;
		text-align: center;
	}
	.waking {
		text-align: center;
		padding: 8px 16px;
		font-size: 14px;
	}
	:global(.empty .btn) {
		margin-top: 12px;
	}
</style>
