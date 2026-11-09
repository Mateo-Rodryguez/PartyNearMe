<script lang="ts">
	import type { Event, Placement } from '#lib/api/types.js';
	import { calendarTile, clockTime, count, coverFor, dayLabel, distance, nameOf } from '#lib/format.js';
	import { interactions } from '#lib/interactions.js';
	import Avatar from './Avatar.svelte';

	let {
		event,
		eager = false,
		placement
	}: {
		event: Event;
		eager?: boolean;
		/** Which list the party is in, and where: impressions and opens are logged to measure For you. */
		placement?: Placement;
	} = $props();

	let card = $state<HTMLElement>();
	// An impression once half the card is on screen.
	$effect(() => {
		if (!card || !placement) return;
		const where = placement;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) interactions.eventImpression(event.id, where);
			},
			{ threshold: 0.5 }
		);
		observer.observe(card);
		return () => observer.disconnect();
	});
	const [month, day] = $derived(calendarTile(event.starts_at));
	const friends = $derived(event.friends_going ?? []);
</script>

<a class="card" href="/e/{event.id}" bind:this={card} onclick={() => placement && interactions.openEvent(event.id, placement)}>
	<div class="cover" style:background={event.cover_url ? undefined : coverFor(event.title)}>
		{#if event.cover_url}
			<img src={event.cover_url} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" />
		{/if}
		<span class="tile" aria-hidden="true"><small>{month}</small>{day}</span>
		{#if event.status === 'cancelled'}<span class="badge">Cancelled</span>{/if}
	</div>
	<div class="body">
		<p class="overline">{dayLabel(event.starts_at)} · {clockTime(event.starts_at)}</p>
		{#if event.reason && (event.reason.kind !== 'friends_going' || !friends.length)}
			<p class="reason">{event.reason.text}</p>
		{/if}
		<h3>{event.title}</h3>
		<p class="muted line">
			{#if event.details_hidden}Venue shared with guests{:else}{event.venue_name ?? 'Venue on the map'}{/if}
			{#if event.distance_m != null}· {distance(event.distance_m)}{/if}
		</p>
		<div class="foot">
			{#if friends.length}
				<span class="faces">
					{#each friends.slice(0, 3) as friend (friend.id)}<Avatar person={friend} size={22} />{/each}
				</span>
				<span class="muted small">
					{nameOf(friends[0])}{(event.friends_going_count ?? 0) > 1 ? ` and ${(event.friends_going_count ?? 0) - 1} more` : ''} going
				</span>
			{:else}
				<span class="muted small">{count(event.going_count, 'person', 'people')} going</span>
			{/if}
			{#if event.my_rsvp}<span class="mine">{event.my_rsvp === 'requested' ? 'Asked' : event.my_rsvp === 'going' ? 'Going' : 'Interested'}</span>{/if}
		</div>
	</div>
</a>

<style>
	.reason {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 650;
		color: var(--primary);
	}
	.card {
		display: grid;
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--outline-variant);
		transition: transform 0.12s ease;
	}
	.card:hover {
		transform: translateY(-2px);
	}
	.cover {
		position: relative;
		aspect-ratio: 16 / 9;
		background-size: cover;
	}
	.cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.tile {
		position: absolute;
		top: 12px;
		left: 12px;
		display: grid;
		justify-items: center;
		min-width: 48px;
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		background: rgb(0 0 0 / 0.55);
		backdrop-filter: blur(8px);
		color: #fff;
		font-size: 20px;
		font-weight: 800;
		line-height: 1;
	}
	.tile small {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin-bottom: 2px;
	}
	.badge {
		position: absolute;
		top: 12px;
		right: 12px;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--error);
		color: #fff;
		font-size: 12px;
		font-weight: 700;
	}
	.body {
		display: grid;
		gap: 4px;
		padding: 14px 16px 16px;
	}
	h3 {
		font-size: 18px;
		font-weight: 700;
	}
	.line {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
	}
	.faces {
		display: flex;
	}
	.faces :global(.avatar + .avatar) {
		margin-left: -8px;
	}
	.small {
		font-size: 13px;
		flex: 1;
	}
	.mine {
		margin-left: auto;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--primary-container);
		color: var(--on-primary-container);
		font-size: 12px;
		font-weight: 700;
	}
</style>
