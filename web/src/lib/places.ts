import type { LatLng } from '#lib/location.js';

/** A place found by search: where it is, and how to show it in a list. */
export interface Place {
	id: string;
	name: string;
	/** Street, town and country, whatever is known beyond the name. */
	detail: string;
	lat: number;
	lng: number;
}

// Photon: free OpenStreetMap search made for search-as-you-type, no key needed.
export const PLACES_HOST = 'https://photon.komoot.io';

interface PhotonFeature {
	geometry: { coordinates: [number, number] };
	properties: {
		osm_type?: string;
		osm_id?: number;
		name?: string;
		housenumber?: string;
		street?: string;
		district?: string;
		city?: string;
		state?: string;
		country?: string;
	};
}

/** Turns Photon's answer into places, nearest-first order kept, unnamed and duplicate ones dropped. */
export function toPlaces(features: PhotonFeature[]): Place[] {
	const seen = new Set<string>();
	const places: Place[] = [];
	for (const { geometry, properties: p } of features) {
		const street = [p.street, p.housenumber].filter(Boolean).join(' ');
		const name = p.name ?? street;
		if (!name) continue;
		const detail = [street !== name ? street : '', p.district, p.city !== name ? p.city : '', p.country]
			.filter(Boolean)
			.join(', ');
		const id = `${p.osm_type ?? ''}${p.osm_id ?? `${geometry.coordinates.join(',')}`}`;
		const key = `${name}|${detail}`;
		if (seen.has(key)) continue;
		seen.add(key);
		places.push({ id, name, detail, lat: geometry.coordinates[1], lng: geometry.coordinates[0] });
	}
	return places;
}

/** Places matching the text, closest to near first. Throws when the service can't be reached. */
export async function searchPlaces(text: string, near?: LatLng, signal?: AbortSignal): Promise<Place[]> {
	const params = new URLSearchParams({ q: text.trim(), limit: '6' });
	const lang = navigator.language?.slice(0, 2);
	// Photon names places in English, German, French or the local language.
	if (lang && ['en', 'de', 'fr'].includes(lang)) params.set('lang', lang);
	if (near) {
		params.set('lat', near.lat.toFixed(4));
		params.set('lon', near.lng.toFixed(4));
	}
	const res = await fetch(`${PLACES_HOST}/api/?${params}`, { signal });
	if (!res.ok) throw new Error(`Place search failed (${res.status})`);
	const body = (await res.json()) as { features?: PhotonFeature[] };
	return toPlaces(body.features ?? []);
}
