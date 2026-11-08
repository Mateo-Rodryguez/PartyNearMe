<script lang="ts">
	import type { LatLng } from '#lib/location.js';

	// A map with a pin fixed in the middle, Uber-style: move the map to put the
	// pin on the party. The map library (about 200 KB) loads only when this shows.
	let { value = $bindable(), night = true }: { value: LatLng; night?: boolean } = $props();
	let container = $state<HTMLElement>();
	let failed = $state(false);

	$effect(() => {
		if (!container) return;
		let map: { remove(): void } | null = null;
		let cancelled = false;
		const start = { ...value };
		Promise.all([
			import('maplibre-gl'),
			import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
			import('maplibre-gl/dist/maplibre-gl.css')
		])
			.then(([{ Map, setWorkerUrl }, worker]) => {
				if (cancelled || !container) return;
				// The bundled worker file, served from this site (the CSP allows only that).
				setWorkerUrl(worker.default);
				const m = new Map({
					container,
					style: `https://tiles.openfreemap.org/styles/${night ? 'dark' : 'positron'}`,
					center: [start.lng, start.lat],
					zoom: 15,
					attributionControl: { compact: true }
				});
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
		};
	});
</script>

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

<style>
	.wrap {
		position: relative;
		height: 280px;
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
	.muted {
		padding: 16px;
	}
</style>
