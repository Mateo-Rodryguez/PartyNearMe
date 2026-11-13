import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '#lib/api/client.js';
import type { ListedPerson, PublicProfile } from '#lib/api/types.js';
import { nameOf } from '#lib/format.js';
import { usePaged } from '#lib/paged.js';
import { session } from '#lib/session.js';
import { toast } from '#lib/toast.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { Empty } from '#lib/ui/Empty.js';
import { LoadMore } from '#lib/ui/LoadMore.js';
import { PageHeader } from './PageHeader.js';
import s from './PeopleList.module.css';

/** Someone's followers or the people they follow, a page at a time, with a Follow button on each row like the apps. */
export default function PeopleList({ userId, kind }: { userId: string; kind: 'followers' | 'following' }) {
	const [owner, setOwner] = useState<PublicProfile | null>(null);
	const list = usePaged<ListedPerson>(async (cursor) => {
		const page = await (kind === 'followers' ? api.followers(userId, cursor) : api.following(userId, cursor));
		return { items: page.users, next: page.next_cursor ?? null };
	});

	useEffect(() => {
		api.user(userId).then(setOwner, () => undefined);
	}, [userId]);
	useEffect(() => {
		void list.refresh();
	}, [userId, kind, list]);

	async function toggle(person: ListedPerson) {
		const on = !person.is_following;
		const set = (value: boolean) => list.update((p) => p.id === person.id, (p) => ({ ...p, is_following: value }));
		set(on);
		try {
			await api.follow(person.id, on);
		} catch {
			set(!on);
			toast.show("Couldn't do that");
		}
	}

	const title = kind === 'followers' ? 'Followers' : 'Following';
	return (
		<>
			<title>{`${title} · PartyNearMe`}</title>
			<PageHeader title={owner ? `${title} · ${nameOf(owner)}` : title} back />
			<nav className={s.tabs} aria-label="Followers and following">
				<Link to={`/u/${userId}/followers`} aria-current={kind === 'followers' ? 'page' : undefined}>
					Followers{owner ? ` ${owner.followers}` : ''}
				</Link>
				<Link to={`/u/${userId}/following`} aria-current={kind === 'following' ? 'page' : undefined}>
					Following{owner ? ` ${owner.following}` : ''}
				</Link>
			</nav>
			{list.loadedOnce && !list.items.length && !list.error && (
				<Empty title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
			)}
			<ul className={s.list}>
				{list.items.map((person) => (
					<li key={person.id}>
						<Link to={`/u/${person.id}`}>
							<Avatar person={person} size={44} />
							<span>
								<strong>{nameOf(person)}</strong>
								{person.username && person.display_name && <span className="muted">@{person.username}</span>}
							</span>
						</Link>
						{person.id !== session.userId && (
							<button className={`btn ${person.is_following ? '' : 'primary'}`} onClick={() => toggle(person)}>
								{person.is_following ? 'Following' : 'Follow'}
							</button>
						)}
					</li>
				))}
			</ul>
			<LoadMore list={list} />
		</>
	);
}
