import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { Event, Placement } from '#lib/api/types.js';
import { calendarTile, clockTime, count, coverFor, dayLabel, distance, nameOf } from '#lib/format.js';
import { interactions } from '#lib/interactions.js';
import { prefs } from '#lib/prefs.js';
import { useStore } from '#lib/store.js';
import { Avatar } from './Avatar.js';
import s from './EventCard.module.css';

/** A party in a list: cover with the date, title, place and who's going. */
export function EventCard({
	event,
	eager = false,
	placement
}: {
	event: Event;
	eager?: boolean;
	/** Which list the party is in, and where: impressions and opens are logged to measure For you. */
	placement?: Placement;
}) {
	useStore(prefs);
	const card = useRef<HTMLAnchorElement>(null);
	const where = useRef(placement);
	where.current = placement;

	// An impression once half the card is on screen.
	useEffect(() => {
		const el = card.current;
		if (!el || !where.current) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && where.current) interactions.eventImpression(event.id, where.current);
			},
			{ threshold: 0.5 }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [event.id, !!placement]);

	const [month, day] = calendarTile(event.starts_at);
	const friends = event.friends_going ?? [];
	return (
		<Link className={s.card} to={`/e/${event.id}`} ref={card} onClick={() => placement && interactions.openEvent(event.id, placement)}>
			<div className={s.cover} style={{ background: event.cover_url ? undefined : coverFor(event.title) }}>
				{event.cover_url && <img src={event.cover_url} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" />}
				<span className={s.tile} aria-hidden="true">
					<small>{month}</small>
					{day}
				</span>
				{event.status === 'cancelled' && <span className={s.badge}>Cancelled</span>}
			</div>
			<div className={s.body}>
				<p className="overline">
					{dayLabel(event.starts_at)} · {clockTime(event.starts_at)}
				</p>
				{event.reason && (event.reason.kind !== 'friends_going' || !friends.length) && <p className={s.reason}>{event.reason.text}</p>}
				<h3>{event.title}</h3>
				<p className={`muted ${s.line}`}>
					{event.details_hidden ? 'Venue shared with guests' : (event.venue_name ?? 'Venue on the map')}
					{event.distance_m != null && ` · ${distance(event.distance_m, prefs.display.miles)}`}
				</p>
				<div className={s.foot}>
					{friends.length ? (
						<>
							<span className={s.faces}>
								{friends.slice(0, 3).map((friend) => (
									<Avatar key={friend.id} person={friend} size={22} />
								))}
							</span>
							<span className={`muted ${s.small}`}>
								{nameOf(friends[0])}
								{(event.friends_going_count ?? 0) > 1 ? ` and ${(event.friends_going_count ?? 0) - 1} more` : ''} going
							</span>
						</>
					) : (
						<span className={`muted ${s.small}`}>{count(event.going_count, 'person', 'people')} going</span>
					)}
					{event.my_rsvp && <span className={s.mine}>{event.my_rsvp === 'requested' ? 'Asked' : event.my_rsvp === 'going' ? 'Going' : 'Interested'}</span>}
				</div>
			</div>
		</Link>
	);
}
