import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '#lib/api/client.js';
import type { Event, Post } from '#lib/api/types.js';
import { usePaged } from '#lib/paged.js';
import { Empty } from '#lib/ui/Empty.js';
import { EventCard } from '#lib/ui/EventCard.js';
import { LoadMore } from '#lib/ui/LoadMore.js';
import { Photo } from '#lib/ui/Photo.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import s from './Saved.module.css';

/** Posts and parties this person bookmarked. */
export default function Saved() {
	const [tab, setTab] = useState<'posts' | 'parties'>('posts');
	const [parties, setParties] = useState<Event[] | null>(null);
	const posts = usePaged<Post>(
		async (cursor) => {
			const page = await api.savedPosts(cursor);
			return { items: page.posts, next: page.next_cursor ?? null };
		},
		() => 'saved'
	);

	useEffect(() => {
		void posts.refresh();
		api.savedEvents().then(setParties, () => setParties([]));
	}, [posts]);

	return (
		<>
			<title>Saved · PartyNearMe</title>
			<PageHeader title="Saved" back />
			<div className={s.tabs} role="tablist">
				<button role="tab" aria-selected={tab === 'posts'} onClick={() => setTab('posts')}>
					Posts
				</button>
				<button role="tab" aria-selected={tab === 'parties'} onClick={() => setTab('parties')}>
					Parties
				</button>
			</div>
			{tab === 'posts' ? (
				<>
					<div className={s.grid}>
						{posts.items.map(
							(post) =>
								post.media[0] && (
									<Link key={post.id} to={`/p/${post.id}`} aria-label={post.caption ?? 'Photo'}>
										<Photo media={post.media[0]} sizes="210px" square />
									</Link>
								)
						)}
					</div>
					{posts.loadedOnce && !posts.items.length ? (
						<Empty title="No saved posts">Tap the bookmark on a post to keep it here.</Empty>
					) : (
						<LoadMore list={posts} />
					)}
				</>
			) : !parties ? (
				<Spinner />
			) : !parties.length ? (
				<Empty title="No saved parties">Tap the bookmark on a party to keep it here.</Empty>
			) : (
				<div className={s.list}>
					{parties.map((event) => (
						<EventCard key={event.id} event={event} />
					))}
				</div>
			)}
		</>
	);
}
