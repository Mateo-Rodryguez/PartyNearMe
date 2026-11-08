<script lang="ts">
	import { page } from '$app/state';
	import { api } from '#lib/api/client.js';
	import type { Event, Post } from '#lib/api/types.js';
	import { count, coverFor, eventTime, nameOf } from '#lib/format.js';
	import { Paged } from '#lib/paged.svelte.js';
	import { session } from '#lib/session.svelte.js';
	import { partyLink, share } from '#lib/share.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from '#lib/ui/Avatar.svelte';
	import Empty from '#lib/ui/Empty.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import LoadMore from '#lib/ui/LoadMore.svelte';
	import Photo from '#lib/ui/Photo.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PageHeader from '../../PageHeader.svelte';

	const id = $derived(page.params.id ?? '');
	let event = $state<Event | null>(null);
	let error = $state<string | null>(null);
	let busy = $state(false);
	let photos = $state<Paged<Post> | null>(null);

	$effect(() => {
		const eventId = id;
		event = null;
		error = null;
		api.event(eventId).then(
			(e) => (event = e),
			(e: unknown) => (error = e instanceof Error ? e.message : 'Something went wrong')
		);
		const list = new Paged<Post>(async (cursor) => {
			const p = await api.eventPosts(eventId, cursor);
			return { items: p.posts, next: p.next_cursor ?? null };
		});
		photos = list;
		void list.refresh();
	});

	async function rsvp(status: 'going' | 'interested' | null) {
		if (!event) return;
		busy = true;
		try {
			event = await api.rsvp(event.id, status);
			if (event.my_rsvp === 'requested') toast.show('Asked the host');
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		} finally {
			busy = false;
		}
	}

	async function toggleSave() {
		if (!event) return;
		const on = !event.saved_by_me;
		event = { ...event, saved_by_me: on };
		try {
			await api.saveEvent(event.id, on);
			toast.show(on ? 'Saved' : 'Removed from saved');
		} catch {
			event = { ...event, saved_by_me: !on };
		}
	}

	async function shareParty() {
		if (!event) return;
		if ((await share(`${event.title} on PartyNearMe`, partyLink(event.id), { eventId: event.id })) === 'copied') toast.show('Link copied');
	}

	const directions = $derived(event ? `https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}` : '');
	const isHost = $derived(event?.organiser.id === session.userId);
</script>

<svelte:head><title>{event?.title ?? 'Party'} · PartyNearMe</title></svelte:head>

<PageHeader title={event?.title ?? 'Party'} back>
	{#snippet actions()}
		{#if event}
			<button class="icon" aria-label="Save" aria-pressed={event.saved_by_me} onclick={toggleSave}>
				<Icon name={event.saved_by_me ? 'bookmark' : 'bookmarkOutline'} />
			</button>
			<button class="icon" aria-label="Share" onclick={shareParty}><Icon name="share" /></button>
		{/if}
	{/snippet}
</PageHeader>

{#if error}
	<Empty title="Couldn't open this party">{error}</Empty>
{:else if !event}
	<Spinner />
{:else}
	<article>
		<div class="cover" style:background={event.cover_url ? undefined : coverFor(event.title)}>
			{#if event.cover_url}<img src={event.cover_url} alt="" fetchpriority="high" />{/if}
		</div>

		<div class="content">
			{#if event.status === 'cancelled'}<p class="cancelled">This party was cancelled.</p>{/if}
			<p class="overline">{eventTime(event.starts_at)}{event.ends_at ? ` – ${eventTime(event.ends_at).split(', ')[1]}` : ''}</p>
			<h1>{event.title}</h1>

			<a class="host" href="/u/{event.organiser.id}">
				<Avatar person={event.organiser} size={32} />
				<span>Hosted by <strong>{nameOf(event.organiser)}</strong></span>
			</a>

			<div class="facts">
				<div class="fact">
					<Icon name="place" />
					<div>
						{#if event.details_hidden}
							<strong>Venue shared with guests</strong>
							<p class="muted">The host shares where it is once you're on the guest list.</p>
						{:else}
							<strong>{event.venue_name ?? 'On the map'}</strong>
							<p><a href={directions} target="_blank" rel="noopener">Directions <Icon name="openNew" size={14} /></a></p>
						{/if}
					</div>
				</div>
				<div class="fact">
					<Icon name="people" />
					<div>
						<strong>{count(event.going_count, 'person', 'people')} going</strong>
						{#if event.interested_count}<p class="muted">{event.interested_count} interested</p>{/if}
						{#if event.friends_going?.length}
							<p class="friends">
								{#each event.friends_going as friend (friend.id)}<Avatar person={friend} size={22} />{/each}
								<span class="muted">{nameOf(event.friends_going[0])}{(event.friends_going_count ?? 0) > 1 ? ` and ${(event.friends_going_count ?? 0) - 1} more you follow` : ''}</span>
							</p>
						{/if}
					</div>
				</div>
			</div>

			{#if event.status === 'published' && !isHost}
				<div class="rsvp" role="group" aria-label="Your RSVP">
					{#if event.my_rsvp === 'requested'}
						<button class="btn block" disabled={busy} onclick={() => rsvp(null)}>Asked · Cancel request</button>
					{:else if event.is_private && !event.my_rsvp}
						<button class="btn primary block" disabled={busy} onclick={() => rsvp('going')}>Ask to join</button>
					{:else}
						<button
							class="btn block"
							class:primary={event.my_rsvp === 'going'}
							aria-pressed={event.my_rsvp === 'going'}
							disabled={busy}
							onclick={() => rsvp(event?.my_rsvp === 'going' ? null : 'going')}
						>
							{#if event.my_rsvp === 'going'}<Icon name="check" size={20} />{/if} Going
						</button>
						<button
							class="btn block"
							class:primary={event.my_rsvp === 'interested'}
							aria-pressed={event.my_rsvp === 'interested'}
							disabled={busy}
							onclick={() => rsvp(event?.my_rsvp === 'interested' ? null : 'interested')}
						>
							<Icon name={event.my_rsvp === 'interested' ? 'star' : 'starOutline'} size={20} /> Interested
						</button>
					{/if}
				</div>
			{/if}

			{#if event.status === 'published' || event.chat_id}
				<div class="host-actions">
					{#if event.status === 'published'}
						<a class="btn outline" href="/e/{event.id}/invite"><Icon name="send" size={18} /> Invite friends</a>
					{/if}
					{#if event.chat_id}
						<a class="btn outline" href="/chat/{event.chat_id}"><Icon name="comment" size={18} /> Party chat</a>
					{/if}
				</div>
			{/if}

			{#if isHost}
				<div class="host-actions">
					<a class="btn" href="/e/{event.id}/edit">Edit party</a>
					{#if event.is_private}
						<a class="btn" href="/e/{event.id}/guests">Guest list{event.requested_count ? ` (${event.requested_count} waiting)` : ''}</a>
					{/if}
				</div>
			{/if}
			{#if event.status === 'published' && (isHost || event.my_rsvp === 'going')}
				<a class="btn outline block" href="/new?party={event.id}"><Icon name="photo" size={18} /> Post photos from the party</a>
			{/if}

			{#if event.ticket_url}
				<a class="btn outline block" href={event.ticket_url} target="_blank" rel="noopener nofollow">Get tickets <Icon name="openNew" size={16} /></a>
			{/if}

			{#if event.description}
				<section>
					<h2>About</h2>
					<p class="description">{event.description}</p>
				</section>
			{/if}

			{#if photos?.items.length}
				<section>
					<h2>Photos from the party</h2>
					<div class="grid">
						{#each photos.items as post (post.id)}
							{#if post.media[0]}
								<a href="/p/{post.id}" aria-label="Photo by {nameOf(post.author)}"><Photo media={post.media[0]} sizes="200px" /></a>
							{/if}
						{/each}
					</div>
					<LoadMore list={photos} />
				</section>
			{/if}
		</div>
	</article>
{/if}

<style>
	.icon {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 50%;
		background: none;
	}
	.cover {
		aspect-ratio: 16 / 9;
		background-size: cover;
	}
	.cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	@media (min-width: 640px) {
		.cover {
			border-radius: var(--radius-lg);
			overflow: hidden;
			margin: 0 12px;
		}
	}
	.content {
		display: grid;
		gap: 16px;
		padding: 16px;
	}
	.cancelled {
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--error) 18%, transparent);
		color: var(--error);
		font-weight: 600;
	}
	.host {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.facts {
		display: grid;
		gap: 12px;
		padding: 16px;
		border-radius: var(--radius-md);
		background: var(--surface);
	}
	.fact {
		display: flex;
		gap: 12px;
	}
	.fact > :global(svg) {
		flex: none;
		color: var(--primary);
	}
	.fact a {
		color: var(--primary);
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.friends {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 6px;
		font-size: 13px;
	}
	.rsvp {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 10px;
	}
	.host-actions {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 10px;
	}
	section {
		display: grid;
		gap: 10px;
	}
	.description {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 3px;
	}
	.grid :global(.photo) {
		aspect-ratio: 1 !important;
	}
</style>
