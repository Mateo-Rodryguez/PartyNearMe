import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { Event as Party, Post } from '#lib/api/types.js';
import { count, coverFor, eventTime, nameOf } from '#lib/format.js';
import { usePaged } from '#lib/paged.js';
import { session } from '#lib/session.js';
import { partyLink, share } from '#lib/share.js';
import { toast } from '#lib/toast.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { Empty } from '#lib/ui/Empty.js';
import { Icon } from '#lib/ui/Icon.js';
import { LoadMore } from '#lib/ui/LoadMore.js';
import { Photo } from '#lib/ui/Photo.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import s from './Event.module.css';

/** A party's page: details, RSVP, host tools and photos from the night. */
export default function EventPage() {
	const id = useParams().id ?? '';
	const [event, setEvent] = useState<Party | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const photos = usePaged<Post>(async (cursor) => {
		const p = await api.eventPosts(id, cursor);
		return { items: p.posts, next: p.next_cursor ?? null };
	});

	useEffect(() => {
		api.event(id).then(setEvent, (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
		void photos.refresh();
	}, [id, photos]);

	async function rsvp(status: 'going' | 'interested' | null) {
		if (!event) return;
		setBusy(true);
		try {
			const updated = await api.rsvp(event.id, status);
			setEvent(updated);
			analytics.capture('rsvp_changed', { status: updated.my_rsvp ?? 'none' });
			if (updated.my_rsvp === 'requested') toast.show('Asked the host');
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		} finally {
			setBusy(false);
		}
	}

	async function toggleSave() {
		if (!event) return;
		const on = !event.saved_by_me;
		setEvent({ ...event, saved_by_me: on });
		try {
			await api.saveEvent(event.id, on);
			toast.show(on ? 'Saved' : 'Removed from saved');
		} catch {
			setEvent((e) => e && { ...e, saved_by_me: !on });
		}
	}

	async function shareParty() {
		if (!event) return;
		const result = await share(`${event.title} on PartyNearMe`, partyLink(event.id), { eventId: event.id });
		if (result) analytics.capture('link_shared', { kind: 'party' });
		if (result === 'copied') toast.show('Link copied');
	}

	const directions = event ? `https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}` : '';
	const isHost = event?.organiser.id === session.userId;

	return (
		<>
			<title>{`${event?.title ?? 'Party'} · PartyNearMe`}</title>
			<PageHeader
				title={event?.title ?? 'Party'}
				back
				actions={
					event && (
						<>
							<button className={s.icon} aria-label="Save" aria-pressed={event.saved_by_me} onClick={toggleSave}>
								<Icon name={event.saved_by_me ? 'bookmark' : 'bookmarkOutline'} />
							</button>
							<button className={s.icon} aria-label="Share" onClick={shareParty}>
								<Icon name="share" />
							</button>
						</>
					)
				}
			/>
			{error ? (
				<Empty title="Couldn't open this party">{error}</Empty>
			) : !event ? (
				<Spinner />
			) : (
				<article>
					<div className={s.cover} style={{ background: event.cover_url ? undefined : coverFor(event.title) }}>
						{event.cover_url && <img src={event.cover_url} alt="" fetchPriority="high" />}
					</div>
					<div className={s.content}>
						{event.status === 'cancelled' && <p className={s.cancelled}>This party was cancelled.</p>}
						<p className="overline">
							{eventTime(event.starts_at)}
							{event.ends_at ? ` – ${eventTime(event.ends_at).split(', ')[1]}` : ''}
						</p>
						<h1>{event.title}</h1>

						<Link className={s.host} to={`/u/${event.organiser.id}`}>
							<Avatar person={event.organiser} size={32} />
							<span>
								Hosted by <strong>{nameOf(event.organiser)}</strong>
							</span>
						</Link>

						<div className={s.facts}>
							<div className={s.fact}>
								<Icon name="place" />
								<div>
									{event.details_hidden ? (
										<>
											<strong>Venue shared with guests</strong>
											<p className="muted">The host shares where it is once you're on the guest list.</p>
										</>
									) : (
										<>
											<strong>{event.venue_name ?? 'On the map'}</strong>
											<p>
												<a href={directions} target="_blank" rel="noopener">
													Directions <Icon name="openNew" size={14} />
												</a>
											</p>
										</>
									)}
								</div>
							</div>
							<div className={s.fact}>
								<Icon name="people" />
								<div>
									<strong>{count(event.going_count, 'person', 'people')} going</strong>
									{event.interested_count > 0 && <p className="muted">{event.interested_count} interested</p>}
									{event.friends_going && event.friends_going.length > 0 && (
										<p className={s.friends}>
											{event.friends_going.map((friend) => (
												<Avatar key={friend.id} person={friend} size={22} />
											))}
											<span className="muted">
												{nameOf(event.friends_going[0])}
												{(event.friends_going_count ?? 0) > 1 ? ` and ${(event.friends_going_count ?? 0) - 1} more you follow` : ''}
											</span>
										</p>
									)}
								</div>
							</div>
						</div>

						{event.status === 'published' && !isHost && (
							<div className={s.rsvp} role="group" aria-label="Your RSVP">
								{event.my_rsvp === 'requested' ? (
									<button className="btn block" disabled={busy} onClick={() => rsvp(null)}>
										Asked · Cancel request
									</button>
								) : event.is_private && !event.my_rsvp ? (
									<button className="btn primary block" disabled={busy} onClick={() => rsvp('going')}>
										Ask to join
									</button>
								) : (
									<>
										<button
											className={`btn block ${event.my_rsvp === 'going' ? 'primary' : ''}`}
											aria-pressed={event.my_rsvp === 'going'}
											disabled={busy}
											onClick={() => rsvp(event.my_rsvp === 'going' ? null : 'going')}
										>
											{event.my_rsvp === 'going' && <Icon name="check" size={20} />} Going
										</button>
										<button
											className={`btn block ${event.my_rsvp === 'interested' ? 'primary' : ''}`}
											aria-pressed={event.my_rsvp === 'interested'}
											disabled={busy}
											onClick={() => rsvp(event.my_rsvp === 'interested' ? null : 'interested')}
										>
											<Icon name={event.my_rsvp === 'interested' ? 'star' : 'starOutline'} size={20} /> Interested
										</button>
									</>
								)}
							</div>
						)}

						{(event.status === 'published' || event.chat_id) && (
							<div className={s['host-actions']}>
								{event.status === 'published' && (
									<Link className="btn outline" to={`/e/${event.id}/invite`}>
										<Icon name="send" size={18} /> Invite friends
									</Link>
								)}
								{event.chat_id && (
									<Link className="btn outline" to={`/chat/${event.chat_id}`}>
										<Icon name="comment" size={18} /> Party chat
									</Link>
								)}
							</div>
						)}

						{isHost && (
							<div className={s['host-actions']}>
								<Link className="btn" to={`/e/${event.id}/edit`}>
									Edit party
								</Link>
								{event.is_private && (
									<Link className="btn" to={`/e/${event.id}/guests`}>
										Guest list{event.requested_count ? ` (${event.requested_count} waiting)` : ''}
									</Link>
								)}
							</div>
						)}
						{event.status === 'published' && (isHost || event.my_rsvp === 'going') && (
							<Link className="btn outline block" to={`/new?party=${event.id}`}>
								<Icon name="photo" size={18} /> Post photos from the party
							</Link>
						)}

						{event.ticket_url && (
							<a className="btn outline block" href={event.ticket_url} target="_blank" rel="noopener nofollow">
								Get tickets <Icon name="openNew" size={16} />
							</a>
						)}

						{event.description && (
							<section>
								<h2>About</h2>
								<p className={s.description}>{event.description}</p>
							</section>
						)}

						{photos.items.length > 0 && (
							<section>
								<h2>Photos from the party</h2>
								<div className={s.grid}>
									{photos.items.map(
										(post) =>
											post.media[0] && (
												<Link key={post.id} to={`/p/${post.id}`} aria-label={`Photo by ${nameOf(post.author)}`}>
													<Photo media={post.media[0]} sizes="200px" square />
												</Link>
											)
									)}
								</div>
								<LoadMore list={photos} />
							</section>
						)}
					</div>
				</article>
			)}
		</>
	);
}
