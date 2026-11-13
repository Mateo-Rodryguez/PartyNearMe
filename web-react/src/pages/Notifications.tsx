import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '#lib/api/client.js';
import type { Notification } from '#lib/api/types.js';
import { coverFor, nameOf, timeAgo } from '#lib/format.js';
import { unread } from '#lib/unread.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { Empty } from '#lib/ui/Empty.js';
import { Skeleton } from '#lib/ui/Skeleton.js';
import { PageHeader } from './PageHeader.js';
import s from './Notifications.module.css';

const known = new Set(['like', 'comment', 'tag', 'follow', 'rsvp', 'request', 'reminder']);

function href(n: Notification): string {
	if ((n.type === 'like' || n.type === 'tag' || n.type === 'comment') && n.post_id)
		return `/p/${n.post_id}${n.type === 'comment' ? '#comments' : ''}`;
	if (n.type === 'follow' && n.actor) return `/u/${n.actor.id}`;
	if (n.event_id) return `/e/${n.event_id}`;
	return '/notifications';
}

function Text({ n }: { n: Notification }) {
	const who = <strong>{n.actor ? nameOf(n.actor) : 'Someone'}</strong>;
	const party = <strong>{n.event_title ?? 'a party'}</strong>;
	switch (n.type) {
		case 'like':
			return <>{who} liked your photo.</>;
		case 'comment':
			return (
				<>
					{who} commented: {n.comment_text}
				</>
			);
		case 'tag':
			return <>{who} tagged you in a photo.</>;
		case 'follow':
			return <>{who} started following you.</>;
		case 'request':
			return (
				<>
					{who} asked to come to {party}.
				</>
			);
		case 'rsvp':
			return (
				<>
					{who} is going to {party}.
				</>
			);
		default:
			return <>{party} is coming up soon. Get ready!</>;
	}
}

/** Likes, comments, follows, RSVPs and party reminders. */
export default function Notifications() {
	const [items, setItems] = useState<Notification[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api.notifications().then(
			(page) => {
				setItems(page.notifications.filter((n) => known.has(n.type)));
				if (page.unread_count)
					void api.markNotificationsSeen().then(() => unread.clearNotifications(), () => undefined);
			},
			(e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong')
		);
	}, []);

	return (
		<>
			<title>Notifications · PartyNearMe</title>
			<PageHeader title="Notifications" back />
			{error ? (
				<Empty title="Couldn't load notifications">{error}</Empty>
			) : !items ? (
				<Skeleton count={8} />
			) : !items.length ? (
				<Empty title="Nothing yet">Likes, comments, new followers and party reminders show up here.</Empty>
			) : (
				<ul className={s.list}>
					{items.map((n) => (
						<li key={n.id} className={n.unread ? s.unread : undefined}>
							<Link to={href(n)}>
								{n.actor ? <Avatar person={n.actor} size={44} /> : <span className={s.cover} style={{ background: coverFor(n.event_id ?? n.id) }} />}
								<p>
									<Text n={n} />
									<span className="muted"> {timeAgo(n.created_at)}</span>
								</p>
								{n.post_thumbnail_url ? (
									<img src={n.post_thumbnail_url} alt="" width={48} height={48} loading="lazy" />
								) : (
									n.event_cover_url && <img src={n.event_cover_url} alt="" width={48} height={48} loading="lazy" />
								)}
							</Link>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
