<script lang="ts">
	import { onMount } from 'svelte';
	import { analytics } from '#lib/analytics.js';
	import { api } from '#lib/api/client.js';
	import type { Event, Interest } from '#lib/api/types.js';
	import { tonightWindow, weekendWindow } from '#lib/format.js';
	import { currentLocation, lastLocation, locationAllowed, type LatLng } from '#lib/location.js';
	import { Paged } from '#lib/paged.svelte.js';
	import Empty from '#lib/ui/Empty.svelte';
	import EventCard from '#lib/ui/EventCard.svelte';
	import LoadMore from '#lib/ui/LoadMore.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';
	import PageHeader from '../PageHeader.svelte';

	type When = 'tonight' | 'weekend' | 'soon';
	const whens: { id: When; label: string }[] = [
		{ id: 'tonight', label: 'Tonight' },
		{ id: 'weekend', label: 'This weekend' },
		{ id: 'soon', label: 'Next 2 weeks' }
	];
	const radii = [5, 10, 25, 50];

	let here = $state<LatLng | null>(lastLocation());
	let asking = $state(false);
	let denied = $state(false);
	let when = $state<When>('soon');
	let radiusKm = $state(10);
	let interestId = $state<number | null>(null);
	let interests = $state<Interest[]>([]);
	// For you ranks parties by what this person likes; Soonest is by date. Remembered in this browser.
	const SORT = 'pnm.partiesSort';
	let forYou = $state(readSort());
	/** The ranked list on screen (For you only), sent with impressions and opens so it can be measured. */
	let serveId = $state<string | null>(null);

	function readSort() {
		try {
			return localStorage.getItem(SORT) !== 'soonest';
		} catch {
			return true;
		}
	}

	function sortBy(ranked: boolean) {
		forYou = ranked;
		try {
			localStorage.setItem(SORT, ranked ? 'for_you' : 'soonest');
		} catch {
			// Lasts for this visit.
		}
	}

	const parties = new Paged<Event>(async (cursor) => {
		if (!here) return { items: [], next: null };
		const window = when === 'tonight' ? tonightWindow() : when === 'weekend' ? weekendWindow() : null;
		if (forYou) {
			// One ranked page: there are rarely more parties in range than that.
			const ranked = await api.forYouEvents({
				lat: here.lat,
				lng: here.lng,
				radiusKm,
				from: window?.[0].toISOString(),
				to: window?.[1].toISOString(),
				interestId
			});
			serveId = ranked.serve_id;
			return { items: ranked.events, next: null };
		}
		serveId = null;
		const page = await api.nearbyEvents({
			lat: here.lat,
			lng: here.lng,
			radiusKm,
			cursor,
			from: window?.[0].toISOString(),
			to: window?.[1].toISOString(),
			interestId
		});
		if (!cursor && !page.events.length) analytics.capture('nearby_empty', { radius_km: radiusKm, time: when, kind_filter: interestId != null });
		return { items: page.events, next: page.next_cursor ?? null };
	});

	async function locate() {
		asking = true;
		here = await currentLocation();
		denied = !here;
		if (denied) analytics.capture('nearby_no_location');
		asking = false;
	}

	// Only ask for location straight away if the user already said yes before.
	onMount(() => {
		if (!here) void locationAllowed().then((ok) => {
			if (ok) void locate();
		});
		api.interests().then((list) => (interests = list), () => undefined);
	});

	// Reload when the place or a filter changes.
	$effect(() => {
		void [here, when, radiusKm, interestId, forYou];
		if (here) void parties.refresh();
	});
</script>

<svelte:head><title>Parties near you · PartyNearMe</title></svelte:head>

<PageHeader title="Parties near you">
	{#snippet actions()}
		<a class="btn primary host" href="/host"><Icon name="add" size={18} /> Host</a>
	{/snippet}
</PageHeader>

{#if !here}
	<div class="ask">
		{#if asking}
			<Spinner label="Finding where you are" />
		{:else}
			<Empty title="Where are you?">
				{#if denied}
					Your browser didn't share your location. Allow it for this site in the browser's settings, then try again.
				{:else}
					PartyNearMe uses your location to show parties around you. It isn't saved or shown to anyone.
				{/if}
			</Empty>
			<button class="btn primary" onclick={locate}>Use my location</button>
		{/if}
	</div>
{:else}
	<div class="filters" role="group" aria-label="Sort">
		<button class="chip" aria-pressed={forYou} onclick={() => sortBy(true)}>For you</button>
		<button class="chip" aria-pressed={!forYou} onclick={() => sortBy(false)}>Soonest</button>
	</div>
	<div class="filters" role="group" aria-label="When">
		{#each whens as w (w.id)}
			<button class="chip" aria-pressed={when === w.id} onclick={() => (when = w.id)}>{w.label}</button>
		{/each}
		<label class="chip radius">
			<span class="visually-hidden">Distance</span>
			<select bind:value={radiusKm}>
				{#each radii as r (r)}<option value={r}>Within {r} km</option>{/each}
			</select>
		</label>
	</div>
	{#if interests.length}
		<div class="filters" role="group" aria-label="Kind of party">
			<button class="chip" aria-pressed={interestId === null} onclick={() => (interestId = null)}>All</button>
			{#each interests as interest (interest.id)}
				<button class="chip" aria-pressed={interestId === interest.id} onclick={() => (interestId = interest.id)}>{interest.name}</button>
			{/each}
		</div>
	{/if}

	<div class="list">
		{#each parties.items as event, i (event.id)}
			<EventCard {event} eager={i < 2} placement={{ surface: forYou ? 'for_you_parties' : 'nearby', serve_id: serveId, position: i }} />
		{/each}
	</div>

	{#if parties.loadedOnce && !parties.items.length && !parties.error && !parties.loading}
		<Empty title="No parties here yet">Try a wider distance or another night, or check back later.</Empty>
	{:else}
		<LoadMore list={parties} />
	{/if}
{/if}

<style>
	.host {
		min-height: 36px;
		padding: 0 14px 0 10px;
		gap: 4px;
	}
	.ask {
		display: grid;
		justify-items: center;
		padding: 0 16px;
	}
	.filters {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding: 4px 12px 8px;
		scrollbar-width: none;
	}
	.radius select {
		border: 0;
		background: none;
		font-weight: 600;
		color: inherit;
	}
	.list {
		display: grid;
		gap: 16px;
		padding: 8px 12px;
	}
</style>
