import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '#lib/location.js';
import { searchPlaces, type Place } from '#lib/places.js';
import { Icon } from './Icon.js';
import s from './MapPicker.module.css';

/**
 * A map with a pin fixed in the middle, Uber-style: move the map to put the
 * pin on the party, or search for a place to jump there. The map library
 * (about 200 KB) loads only when this shows.
 */
export function MapPicker({
	value,
	onChange,
	night = true,
	zoom = 15,
	onPlace
}: {
	value: LatLng;
	onChange: (spot: LatLng) => void;
	night?: boolean;
	zoom?: number;
	onPlace?: (place: Place) => void;
}) {
	const container = useRef<HTMLDivElement>(null);
	const map = useRef<import('maplibre-gl').Map | null>(null);
	const [failed, setFailed] = useState(false);
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<Place[]>([]);
	const [searching, setSearching] = useState(false);
	const [searchFailed, setSearchFailed] = useState(false);
	const [chosen, setChosen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const latest = useRef(0);
	// The newest props, for the map's listeners and the search, without rebuilding the map.
	const current = useRef({ value, onChange });
	current.current = { value, onChange };
	// Read once: moving the map writes the value back, and that must not rebuild the map.
	const [start] = useState(() => ({ ...value, zoom, night }));

	useEffect(() => {
		let cancelled = false;
		Promise.all([
			import('maplibre-gl'),
			import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
			import('maplibre-gl/dist/maplibre-gl.css')
		])
			.then(([{ Map, NavigationControl, setWorkerUrl }, worker]) => {
				if (cancelled || !container.current) return;
				// The bundled worker file, served from this site (the CSP allows only that).
				setWorkerUrl(worker.default);
				const m = new Map({
					container: container.current,
					style: `https://tiles.openfreemap.org/styles/${start.night ? 'dark' : 'positron'}`,
					center: [start.lng, start.lat],
					zoom: start.zoom,
					minZoom: 2,
					attributionControl: { compact: true }
				});
				// Plus and minus for a mouse or trackpad; pinch and scroll work too.
				m.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
				m.on('moveend', () => {
					const c = m.getCenter();
					current.current.onChange({ lat: c.lat, lng: c.lng });
				});
				map.current = m;
			})
			.catch(() => setFailed(true));
		return () => {
			cancelled = true;
			clearTimeout(timer.current);
			map.current?.remove();
			map.current = null;
		};
	}, [start]);

	function search(text: string) {
		setQuery(text);
		setChosen(false);
		clearTimeout(timer.current);
		setSearchFailed(false);
		if (text.trim().length < 3) {
			setResults([]);
			setSearching(false);
			return;
		}
		setSearching(true);
		// Wait for a pause in typing, so the free search service gets one request, not ten.
		timer.current = setTimeout(async () => {
			const asked = ++latest.current;
			try {
				const found = await searchPlaces(text, current.current.value);
				if (asked === latest.current) setResults(found);
			} catch {
				if (asked === latest.current) setSearchFailed(true);
			} finally {
				if (asked === latest.current) setSearching(false);
			}
		}, 350);
	}

	function pick(place: Place) {
		onChange({ lat: place.lat, lng: place.lng });
		map.current?.jumpTo({ center: [place.lng, place.lat], zoom: 16 });
		setQuery(place.name);
		setChosen(true);
		setResults([]);
		onPlace?.(place);
	}

	return (
		<div className={s.picker}>
			{!failed && (
				<>
					<div className={s.search}>
						<span className={s.icon}>
							<Icon name="search" size={20} />
						</span>
						<input
							className="field"
							type="search"
							enterKeyHint="search"
							autoComplete="off"
							placeholder="Search a place or address"
							aria-label="Search a place or address"
							value={query}
							onChange={(e) => search(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									if (results[0]) pick(results[0]);
								}
							}}
						/>
					</div>
					{results.length ? (
						<ul className={s.results} role="listbox" aria-label="Places">
							{results.map((place) => (
								<li key={place.id}>
									<button type="button" role="option" aria-selected="false" onClick={() => pick(place)}>
										<Icon name="place" size={20} />
										<span>
											<strong>{place.name}</strong>
											{place.detail && <span className="muted">{place.detail}</span>}
										</span>
									</button>
								</li>
							))}
						</ul>
					) : searchFailed ? (
						<p className={`muted ${s.note}`}>Search isn't working right now. You can still move the map.</p>
					) : (
						!searching &&
						!chosen &&
						query.trim().length >= 3 && <p className={`muted ${s.note}`}>No places found. Try a street or a town.</p>
					)}
				</>
			)}
			<div className={s.wrap}>
				{failed ? (
					<p className="muted">The map couldn't load. The party uses where you are now.</p>
				) : (
					<>
						<div className={s.map} ref={container} role="application" aria-label="Map: move it to put the pin on the party" />
						<svg className={s.pin} width="40" height="48" viewBox="0 0 40 48" aria-hidden="true">
							<defs>
								<linearGradient id="pin" x1="0" y1="0" x2="1" y2="1">
									<stop offset="0" stopColor="var(--brand-pink)" />
									<stop offset="1" stopColor="var(--brand-violet)" />
								</linearGradient>
							</defs>
							<path
								d="M20 2C10.6 2 3 9.6 3 19c0 12.7 17 27 17 27s17-14.3 17-27C37 9.6 29.4 2 20 2z"
								fill="url(#pin)"
								stroke="#fff"
								strokeWidth="2.5"
							/>
							<circle cx="20" cy="19" r="6" fill="#fff" />
						</svg>
					</>
				)}
			</div>
		</div>
	);
}
