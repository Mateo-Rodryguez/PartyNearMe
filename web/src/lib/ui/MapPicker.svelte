<script lang="ts">
	import { untrack } from 'svelte';
	import { searchPlaces, type Place } from '#lib/places.js';
	import type { LatLng } from '#lib/location.js';
	import Icon from '#lib/ui/Icon.svelte';

	// A map with a pin fixed in the middle, Uber-style: move the map to put the
	// pin on the party, or search for a place to jump there. The map library
	// (about 200 KB) loads only when this shows.
	let {
		value = $bindable(),
		night = true,
		zoom = 15,
		onplace
	}: { value: LatLng; night?: boolean; zoom?: number; onplace?: (place: Place) => void } = $props();
	let container = $state<HTMLElement>();
	let failed = $state(false);
	let map: import('maplibre-gl').Map | null = null;

	let query = $state('');
	let results = $state<Place[]>([]);
	let searching = $state(false);
	let searchFailed = $state(false);
	let chosen = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let latest = 0;

	$effect(() => {
		if (!container) return;
		let cancelled = false;
		// Read once: moving the map writes value back, and that must not rebuild
		// the map (it used to, which snapped the zoom back every time).
		const start = untrack(() => ({ ...value, zoom }));
		Promise.all([
			import('maplibre-gl'),
			import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
			import('maplibre-gl/dist/maplibre-gl.css')
		])
			.then(([{ Map, NavigationControl, setWorkerUrl }, worker]) => {
				if (cancelled || !container) return;
				// The bundled worker file, served from this site (the CSP allows only that).
				setWorkerUrl(worker.default);
				const m = new Map({
					container,
					style: `https://tiles.openfreemap.org/styles/${night ? 'dark' : 'positron'}`,
					center: [start.lng, start.lat],
					zoom: start.zoom,
					minZoom: 2,
					attributionControl: { compact: true }
				});
				// Plus and minus for a mouse or trackpad; pinch and scroll work too.
				m.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
				m.on('moveend', () => {
					const c = m.getCenter();
					value = { lat: c.lat, lng: c.lng };
				});
				map = m;
			})
			.catch(() => (failed = true));
		return () => {
			cancelled = true;
			map?.remove();
			map = null;
		};
	});

	function search(text: string) {
		query = text;
		chosen = false;
		clearTimeout(timer);
		searchFailed = false;
		if (text.trim().length < 3) {
			results = [];
			searching = false;
			return;
		}
		searching = true;
		// Wait for a pause in typing, so the free search service gets one request, not ten.
		timer = setTimeout(async () => {
			const asked = ++latest;
			try {
				const found = await searchPlaces(text, value);
				if (asked === latest) results = found;
			} catch {
				if (asked === latest) searchFailed = true;
			} finally {
				if (asked === latest) searching = false;
			}
		}, 350);
	}

	function pick(place: Place) {
		value = { lat: place.lat, lng: place.lng };
		map?.jumpTo({ center: [place.lng, place.lat], zoom: 16 });
		query = place.name;
		chosen = true;
		results = [];
		onplace?.(place);
	}
</script>

<div class="picker">
	{#if !failed}
		<div class="search">
			<span class="icon"><Icon name="search" size={20} /></span>
			<input
				class="field"
				type="search"
				enterkeyhint="search"
				autocomplete="off"
				placeholder="Search a place or address"
				aria-label="Search a place or address"
				value={query}
				oninput={(e) => search(e.currentTarget.value)}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						if (results[0]) pick(results[0]);
					}
				}}
			/>
		</div>
		{#if results.length}
			<ul class="results" role="listbox" aria-label="Places">
				{#each results as place (place.id)}
					<li>
						<button type="button" role="option" aria-selected="false" onclick={() => pick(place)}>
							<Icon name="place" size={20} />
							<span><strong>{place.name}</strong>{#if place.detail}<span class="muted">{place.detail}</span>{/if}</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if searchFailed}
			<p class="muted note">Search isn't working right now. You can still move the map.</p>
		{:else if !searching && !chosen && query.trim().length >= 3}
			<p class="muted note">No places found. Try a street or a town.</p>
		{/if}
	{/if}
	<div class="wrap">
		{#if failed}
			<p class="muted">The map couldn't load. The party uses where you are now.</p>
		{:else}
			<div class="map" bind:this={container} role="application" aria-label="Map: move it to put the pin on the party"></div>
			<svg class="pin" width="40" height="48" viewBox="0 0 40 48" aria-hidden="true">
				<defs><linearGradient id="pin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--brand-pink)" /><stop offset="1" stop-color="var(--brand-violet)" /></linearGradient></defs>
				<path d="M20 2C10.6 2 3 9.6 3 19c0 12.7 17 27 17 27s17-14.3 17-27C37 9.6 29.4 2 20 2z" fill="url(#pin)" stroke="#fff" stroke-width="2.5" />
				<circle cx="20" cy="19" r="6" fill="#fff" />
			</svg>
		{/if}
	</div>
</div>

<style>
	.picker {
		display: grid;
		gap: 8px;
	}
	.search {
		position: relative;
	}
	.search .icon {
		position: absolute;
		left: 14px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		color: var(--on-surface-variant);
		pointer-events: none;
	}
	.search .field {
		padding-left: 44px;
	}
	.results {
		margin: 0;
		padding: 4px 0;
		list-style: none;
		border: 1px solid var(--outline-variant);
		border-radius: var(--radius-sm);
		background: var(--surface);
	}
	.results button {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 48px;
		padding: 8px 14px;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.results button:hover,
	.results button:focus-visible {
		background: var(--surface-high);
	}
	.results button > span {
		display: grid;
		min-width: 0;
	}
	.results strong,
	.results .muted {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.results .muted {
		font-size: 13px;
	}
	.note {
		margin: 0;
		font-size: 14px;
	}
	.wrap {
		position: relative;
		height: 320px;
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--surface);
	}
	.map {
		position: absolute;
		inset: 0;
	}
	.pin {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -100%);
		pointer-events: none;
		filter: drop-shadow(0 4px 8px rgb(0 0 0 / 0.35));
	}
	.wrap > .muted {
		padding: 16px;
	}
</style>
