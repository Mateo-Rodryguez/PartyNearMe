<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { Event } from '#lib/api/types.js';
	import { coverFor } from '#lib/format.js';
	import { currentLocation, lastLocation, locationAllowed } from '#lib/location.js';
	import { prefs } from '#lib/prefs.svelte.js';
	import { readSaved, writeSaved } from '#lib/saved.js';
	import Icon from './Icon.svelte';

	// Parties coming up near you as a row of rings above the feed, like Instagram
	// stories and the apps' Home. Only when the browser already shares location:
	// Home never asks for it.
	// Last visit's rail shows at once; the fresh one replaces it when it arrives.
	let events = $state<Event[]>(readSaved<Event[]>('rail') ?? []);

	$effect(() => {
		let gone = false;
		(async () => {
			const here = lastLocation() ?? ((await locationAllowed()) ? await currentLocation() : null);
			if (!here || gone) return;
			const page = await api.nearbyEvents({ lat: here.lat, lng: here.lng, radiusKm: prefs.display.radiusKm });
			if (gone) return;
			events = page.events;
			writeSaved('rail', page.events.slice(0, 20));
		})().catch(() => undefined);
		return () => (gone = true);
	});
</script>

{#if events.length}
	<section aria-label="Happening near you">
		<p class="overline">Happening near you</p>
		<div class="rail">
			<a class="item" href="/host">
				<span class="ring plain"><span class="new"><Icon name="add" size={28} /></span></span>
				<span class="label">Start one</span>
			</a>
			{#each events as event (event.id)}
				<a class="item" href="/e/{event.id}">
					<span class="ring">
						<span class="cover" style:background={event.cover_url ? undefined : coverFor(event.title)}>
							{#if event.cover_url}<img src={event.cover_url} alt="" loading="lazy" decoding="async" />{/if}
						</span>
					</span>
					<span class="label">{event.title}</span>
				</a>
			{/each}
		</div>
	</section>
{/if}

<style>
	section {
		padding: 4px 0 12px;
	}
	.overline {
		margin: 0 0 10px;
		padding: 0 20px;
		color: var(--on-surface-variant);
	}
	.rail {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding: 0 14px;
		scrollbar-width: none;
	}
	.item {
		flex: none;
		display: grid;
		justify-items: center;
		width: 78px;
		padding: 4px 0;
		border-radius: 12px;
	}
	.ring {
		display: grid;
		width: 70px;
		height: 70px;
		padding: 3px;
		border-radius: 50%;
		background: var(--sunset);
	}
	.ring.plain {
		background: none;
	}
	.cover,
	.new {
		display: grid;
		place-items: center;
		overflow: hidden;
		border-radius: 50%;
		border: 2px solid var(--background);
	}
	.new {
		background: var(--surface-high);
		border: 0;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.label {
		max-width: 74px;
		margin-top: 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		font-weight: 600;
	}
</style>
