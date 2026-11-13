import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, FeedExpiredError } from '#lib/api/client.js';
import type { Post } from '#lib/api/types.js';
import { lastLocation } from '#lib/location.js';
import { usePaged } from '#lib/paged.js';
import { visitAndCheck } from '#lib/recommend.js';
import { session } from '#lib/session.js';
import { useStore } from '#lib/store.js';
import { unread } from '#lib/unread.js';
import { Empty } from '#lib/ui/Empty.js';
import { Icon } from '#lib/ui/Icon.js';
import { LoadMore } from '#lib/ui/LoadMore.js';
import { PartyRail } from '#lib/ui/PartyRail.js';
import { PostCard } from '#lib/ui/PostCard.js';
import { RecommendCard } from '#lib/ui/RecommendCard.js';
import { Skeleton } from '#lib/ui/Skeleton.js';
import { PageHeader } from './PageHeader.js';
import s from './Feed.module.css';

/** The last feed for this account, shown at once while the free server wakes up, as on the phones. */
const cacheKey = () => `pnm.feed.${session.userId}`;

function savedFeed(): Post[] {
	try {
		return JSON.parse(localStorage.getItem(cacheKey()) ?? '[]') as Post[];
	} catch {
		return [];
	}
}

export default function Feed() {
	useStore(unread);
	const [slow, setSlow] = useState(false);
	// Once someone knows the app, ask if they'd recommend it (see lib/recommend.ts).
	const [askRecommend, setAskRecommend] = useState(visitAndCheck);
	/** The ranked list on screen, sent with impressions so the ranking can be measured. */
	const [serveId, setServeId] = useState<string | null>(null);

	const feed = usePaged<Post>(async (cursor) => {
		const here = lastLocation();
		try {
			const page = await api.feed(here?.lat ?? null, here?.lng ?? null, cursor);
			if (!cursor) {
				setServeId(page.serve_id ?? null);
				try {
					localStorage.setItem(cacheKey(), JSON.stringify(page.posts.slice(0, 10)));
				} catch {
					// Storage full or off: no saved copy.
				}
			}
			return { items: page.posts, next: page.next_cursor ?? null };
		} catch (e) {
			if (e instanceof FeedExpiredError && cursor) {
				void feed.refresh();
				return { items: [], next: null };
			}
			throw e;
		}
	});

	useEffect(() => {
		if (!feed.items.length) feed.setItems(savedFeed());
		const timer = setTimeout(() => setSlow(feed.loading), 4000);
		void feed.refresh().finally(() => {
			clearTimeout(timer);
			setSlow(false);
		});
		return () => clearTimeout(timer);
	}, [feed]);

	return (
		<>
			<title>PartyNearMe</title>
			<PageHeader
				title="PartyNearMe"
				actions={
					<>
						<Link className={`${s.bell} ${s.search}`} to="/search" aria-label="Search people">
							<Icon name="search" />
						</Link>
						<Link className={s.bell} to="/notifications" aria-label={unread.notifications ? `Notifications, ${unread.notifications} new` : 'Notifications'}>
							<Icon name="bell" />
							{unread.notifications > 0 && <span className={s.badge}>{unread.notifications > 9 ? '9+' : unread.notifications}</span>}
						</Link>
					</>
				}
			/>

			{slow && (
				<p className={`${s.waking} muted`} role="status">
					Waking the server up, this can take a moment…
				</p>
			)}

			{askRecommend && <RecommendCard onDone={() => setAskRecommend(false)} />}

			<PartyRail />

			<div className={s.feed}>
				{feed.items.map((post, i) => (
					<PostCard
						key={post.id}
						post={post}
						onChange={(changed) => feed.update((p) => p.id === post.id, () => changed)}
						eager={i === 0}
						placement={{ surface: 'feed', serve_id: serveId, position: i }}
						onGone={() => feed.setItems(feed.items.filter((p) => p.id !== post.id))}
					/>
				))}
			</div>

			{!feed.loadedOnce && !feed.items.length ? (
				<Skeleton kind="post" count={2} />
			) : feed.loadedOnce && !feed.items.length && !feed.error ? (
				<Empty title="Nothing here yet">
					Follow people and say you're going to parties, and their photos show up here.
					<p>
						<Link className="btn primary" to="/nearby">
							Find parties
						</Link>
					</p>
				</Empty>
			) : (
				<LoadMore list={feed} />
			)}
		</>
	);
}
