import { describe, expect, it } from 'vitest';
import { toPlaces } from './places.js';

const feature = (properties: Record<string, unknown>, lng = 2.35, lat = 48.85) => ({
	geometry: { coordinates: [lng, lat] as [number, number] },
	properties
});

describe('toPlaces', () => {
	it('names a venue and lists where it is', () => {
		const [place] = toPlaces([
			feature({ osm_type: 'N', osm_id: 1, name: 'Rex Club', street: 'Boulevard Poissonnière', housenumber: '5', city: 'Paris', country: 'France' })
		]);
		expect(place).toEqual({ id: 'N1', name: 'Rex Club', detail: 'Boulevard Poissonnière 5, Paris, France', lat: 48.85, lng: 2.35 });
	});

	it('uses the street as the name for a plain address', () => {
		const [place] = toPlaces([feature({ osm_type: 'W', osm_id: 2, street: 'Calle Mayor', housenumber: '10', city: 'Madrid', country: 'Spain' })]);
		expect(place.name).toBe('Calle Mayor 10');
		expect(place.detail).toBe('Madrid, Spain');
	});

	it("doesn't repeat a city's name in its detail", () => {
		const [place] = toPlaces([feature({ osm_type: 'R', osm_id: 3, name: 'Berlin', city: 'Berlin', country: 'Germany' })]);
		expect(place.detail).toBe('Germany');
	});

	it('drops places with no name and duplicates', () => {
		const places = toPlaces([
			feature({ osm_type: 'N', osm_id: 4 }),
			feature({ osm_type: 'N', osm_id: 5, name: 'Club', city: 'Lyon' }),
			feature({ osm_type: 'W', osm_id: 6, name: 'Club', city: 'Lyon' })
		]);
		expect(places.map((p) => p.id)).toEqual(['N5']);
	});
});
