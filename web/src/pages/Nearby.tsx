import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { Event, Interest } from '#lib/api/types.js';
import { radiusLabel, tonightWindow, weekendWindow } from '#lib/format.js';
import { currentLocation, lastArea, lastLocation, locationAllowed, metresBetween, type LatLng } from '#lib/location.js';
import { usePaged } from '#lib/paged.js';
import { prefs, RADIUS_CHOICES } from '#lib/prefs.js';
import { useStore } from '#lib/store.js';
import { Empty } from '#lib/ui/Empty.js';
import { EventCard } from '#lib/ui/EventCard.js';
import { Icon } from '#lib/ui/Icon.js';
import { LoadMore } from '#lib/ui/LoadMore.js';
import { Skeleton } from '#lib/ui/Skeleton.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import s from './Nearby.module.css';

type When = 'tonight' | 'weekend' | 'soon';
const whens: { id: When; label: string }[] = [
	{ id: 'tonight', label: 'Tonight' },
	{ id: 'weekend', label: 'This weekend' },
	{ id: 'soon', label: 'Next 2 weeks' }
];

// For you ranks parties by what this person likes; Soonest is by date. Remembered in this browser.
const SORT = 'pnm.partiesSort';
function readSort() {
	try {
		return localStorage.getItem(SORT) !== 'soonest';
	} catch {
		return true;
	}
}

export default function Nearby() {
	useStore(prefs);
	// A fresh fix if there is one; otherwise last visit's area, so saved parties show at
	// once while the browser finds where we are (only if it's allowed to).
	const [fresh] = useState(lastLocation);
	const [here, setHere] = useState<LatLng | null>(fresh);
	const [asking, setAsking] = useState(false);
	const [denied, setDenied] = useState(false);
	const [when, setWhen] = useState<When>('soon');
	// Remembered in this browser, like the apps remember it on the phone.
	const radiusKm = prefs.display.radiusKm;
	const [interestId, setInterestId] = useState<number | null>(null);
	const [interests, setInterests] = useState<Interest[]>([]);
	const [forYou, setForYou] = useState(readSort);
	/** The ranked list on screen (For you only), sent with impressions and opens so it can be measured. */
	const [serveId, setServeId] = useState<string | null>(null);

	function sortBy(ranked: boolean) {
		setForYou(ranked);
		try {
			localStorage.setItem(SORT, ranked ? 'for_you' : 'soonest');
		} catch {
			// Lasts for this visit.
		}
	}

	const parties = usePaged<Event>(
		async (cursor) => {
			if (!here) return { items: [], next: null };
			const window = when === 'tonight' ? tonightWindow() : when === 'weekend' ? weekendWindow() : null;
			if (forYou) {
				// One ranked page: there are rarely more parties in range than that.
				const ranked = await api.forYouEvents({ lat: here.lat, lng: here.lng, radiusKm, from: window?.[0].toISOString(), to: window?.[1].toISOString(), interestId });
				setServeId(ranked.serve_id);
				return { items: ranked.events, next: null };
			}
			setServeId(null);
			const page = await api.nearbyEvents({ lat: here.lat, lng: here.lng, radiusKm, cursor, from: window?.[0].toISOString(), to: window?.[1].toISOString(), interestId });
			if (!cursor && !page.events.length) analytics.capture('nearby_empty', { radius_km: radiusKm, time: when, kind_filter: interestId != null });
			return { items: page.events, next: page.next_cursor ?? null };
		},
		() => (here ? `parties.${forYou ? 'for_you' : 'soonest'}.${when}.${radiusKm}.${interestId ?? 'all'}.${here.lat.toFixed(2)},${here.lng.toFixed(2)}` : null)
	);

	async function locate() {
		setAsking(true);
		const fix = await currentLocation();
		setHere(fix);
		setDenied(!fix);
		if (!fix) analytics.capture('nearby_no_location');
		setAsking(false);
	}

	// Only ask for location straight away if the user already said yes before.
	useEffect(() => {
		if (!fresh)
			void locationAllowed().then(async (ok) => {
				if (!ok) return;
				const area = lastArea();
				// Show last visit's parties straight away, then move only if we've really moved.
				if (area) setHere((h) => h ?? area);
				const fix = await currentLocation();
				if (fix) setHere((h) => (!h || metresBetween(h, fix) > 500 ? fix : h));
			});
		api.interests().then(setInterests, () => undefined);
	}, [fresh]);

	// Reload when the place or a filter changes.
	useEffect(() => {
		if (here) void parties.refresh();
	}, [here, when, radiusKm, interestId, forYou, parties]);

	return (
		<>
			<title>Parties near you · PartyNearMe</title>
			<PageHeader
				title="Parties near you"
				actions={
					<Link className={`btn primary ${s.host}`} to="/host">
						<Icon name="add" size={18} /> Host
					</Link>
				}
			/>
			{!here ? (
				<div className={s.ask}>
					{asking ? (
						<Spinner label="Finding where you are" />
					) : (
						<>
							<Empty title="Where are you?">
								{denied
									? "Your browser didn't share your location. Allow it for this site in the browser's settings, then try again."
									: "PartyNearMe uses your location to show parties around you. It isn't saved or shown to anyone."}
							</Empty>
							<button className="btn primary" onClick={locate}>
								Use my location
							</button>
						</>
					)}
				</div>
			) : (
				<>
					<div className={s.filters} role="group" aria-label="Sort">
						<button className="chip" aria-pressed={forYou} onClick={() => sortBy(true)}>
							For you
						</button>
						<button className="chip" aria-pressed={!forYou} onClick={() => sortBy(false)}>
							Soonest
						</button>
					</div>
					<div className={s.filters} role="group" aria-label="When">
						{whens.map((w) => (
							<button key={w.id} className="chip" aria-pressed={when === w.id} onClick={() => setWhen(w.id)}>
								{w.label}
							</button>
						))}
						<label className={`chip ${s.radius}`}>
							<span className="visually-hidden">Distance</span>
							<select value={radiusKm} onChange={(e) => prefs.setDisplay({ radiusKm: Number(e.target.value) })}>
								{RADIUS_CHOICES.map((r) => (
									<option key={r} value={r}>
										Within {radiusLabel(r, prefs.display.miles)}
									</option>
								))}
							</select>
						</label>
					</div>
					{interests.length > 0 && (
						<div className={s.filters} role="group" aria-label="Kind of party">
							<button className="chip" aria-pressed={interestId === null} onClick={() => setInterestId(null)}>
								All
							</button>
							{interests.map((interest) => (
								<button key={interest.id} className="chip" aria-pressed={interestId === interest.id} onClick={() => setInterestId(interest.id)}>
									{interest.name}
								</button>
							))}
						</div>
					)}
					<div className={s.list}>
						{parties.items.map((event, i) => (
							<EventCard key={event.id} event={event} eager={i < 2} placement={{ surface: forYou ? 'for_you_parties' : 'nearby', serve_id: serveId, position: i }} />
						))}
					</div>
					{!parties.loadedOnce && !parties.items.length ? (
						<Skeleton kind="party" count={3} />
					) : parties.loadedOnce && !parties.items.length && !parties.error && !parties.loading ? (
						<Empty title="No parties here yet">Try a wider distance or another night, or check back later.</Empty>
					) : (
						<LoadMore list={parties} />
					)}
				</>
			)}
		</>
	);
}
