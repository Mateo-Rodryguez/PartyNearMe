export interface LatLng {
	lat: number;
	lng: number;
}

const KEY = 'pnm.location';
const FRESH_MS = 10 * 60 * 1000;
// The rough area last seen, kept between visits so lists can show at once
// while the browser finds a fresh fix. Rounded to about a kilometre.
const AREA_KEY = 'pnm.area';

/** Where the browser was last time, roughly, however long ago. Only for showing saved lists early. */
export function lastArea(): LatLng | null {
	try {
		return JSON.parse(localStorage.getItem(AREA_KEY) ?? 'null') as LatLng | null;
	} catch {
		return null;
	}
}

function keepArea({ lat, lng }: LatLng) {
	try {
		localStorage.setItem(AREA_KEY, JSON.stringify({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }));
	} catch {
		// Fine without it.
	}
}

/** Roughly how far apart two points are, in metres. */
export function metresBetween(a: LatLng, b: LatLng): number {
	const dLat = (b.lat - a.lat) * 111_320;
	const dLng = (b.lng - a.lng) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
	return Math.hypot(dLat, dLng);
}

/** The last fix, if it's recent enough to reuse without asking the browser again. */
export function lastLocation(): LatLng | null {
	try {
		const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as (LatLng & { at: number }) | null;
		return saved && Date.now() - saved.at < FRESH_MS ? { lat: saved.lat, lng: saved.lng } : null;
	} catch {
		return null;
	}
}

/** Asks the browser where we are (it asks the user the first time). Null when they say no or there's no fix. */
export function currentLocation(): Promise<LatLng | null> {
	const cached = lastLocation();
	if (cached) return Promise.resolve(cached);
	if (!('geolocation' in navigator)) return Promise.resolve(null);
	return new Promise((resolve) => {
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				const fix = { lat: coords.latitude, lng: coords.longitude };
				keepArea(fix);
				try {
					sessionStorage.setItem(KEY, JSON.stringify({ ...fix, at: Date.now() }));
				} catch {
					// Fine without it.
				}
				resolve(fix);
			},
			() => resolve(null),
			{ enableHighAccuracy: false, timeout: 15_000, maximumAge: FRESH_MS }
		);
	});
}

/** Whether the user already said yes, so the page can fetch without a prompt out of nowhere. */
export async function locationAllowed(): Promise<boolean> {
	try {
		return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted';
	} catch {
		return false;
	}
}
