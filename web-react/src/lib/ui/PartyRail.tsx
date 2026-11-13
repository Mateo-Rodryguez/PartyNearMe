import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '#lib/api/client.js';
import type { Event } from '#lib/api/types.js';
import { coverFor } from '#lib/format.js';
import { currentLocation, lastLocation, locationAllowed } from '#lib/location.js';
import { prefs } from '#lib/prefs.js';
import { readSaved, writeSaved } from '#lib/saved.js';
import { useStore } from '#lib/store.js';
import { Icon } from './Icon.js';
import s from './PartyRail.module.css';

/**
 * Parties coming up near you as a row of rings above the feed, like Instagram
 * stories and the apps' Home. Only when the browser already shares location:
 * Home never asks for it. Last visit's rail shows at once; the fresh one
 * replaces it when it arrives.
 */
export function PartyRail() {
	useStore(prefs);
	const radiusKm = prefs.display.radiusKm;
	const [events, setEvents] = useState<Event[]>(() => readSaved<Event[]>('rail') ?? []);

	useEffect(() => {
		let gone = false;
		(async () => {
			const here = lastLocation() ?? ((await locationAllowed()) ? await currentLocation() : null);
			if (!here || gone) return;
			const page = await api.nearbyEvents({ lat: here.lat, lng: here.lng, radiusKm });
			if (gone) return;
			setEvents(page.events);
			writeSaved('rail', page.events.slice(0, 20));
		})().catch(() => undefined);
		return () => {
			gone = true;
		};
	}, [radiusKm]);

	if (!events.length) return null;
	return (
		<section className={s.section} aria-label="Happening near you">
			<p className="overline">Happening near you</p>
			<div className={s.rail}>
				<Link className={s.item} to="/host">
					<span className={`${s.ring} ${s.plain}`}>
						<span className={s.new}>
							<Icon name="add" size={28} />
						</span>
					</span>
					<span className={s.label}>Start one</span>
				</Link>
				{events.map((event) => (
					<Link key={event.id} className={s.item} to={`/e/${event.id}`}>
						<span className={s.ring}>
							<span className={s.cover} style={{ background: event.cover_url ? undefined : coverFor(event.title) }}>
								{event.cover_url && <img src={event.cover_url} alt="" loading="lazy" decoding="async" />}
							</span>
						</span>
						<span className={s.label}>{event.title}</span>
					</Link>
				))}
			</div>
		</section>
	);
}
