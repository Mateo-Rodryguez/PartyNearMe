import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '#lib/api/client.js';
import type { Event, Post, PublicProfile } from '#lib/api/types.js';
import { nameOf } from '#lib/format.js';
import { usePaged } from '#lib/paged.js';
import { readSaved, writeSaved } from '#lib/saved.js';
import { session } from '#lib/session.js';
import { toast } from '#lib/toast.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { Empty } from '#lib/ui/Empty.js';
import { EventCard } from '#lib/ui/EventCard.js';
import { Icon } from '#lib/ui/Icon.js';
import { LoadMore } from '#lib/ui/LoadMore.js';
import { Photo } from '#lib/ui/Photo.js';
import { RelationshipHeart } from '#lib/ui/RelationshipHeart.js';
import { ReportSheet } from '#lib/ui/ReportSheet.js';
import { Sheet } from '#lib/ui/Sheet.js';
import { Skeleton } from '#lib/ui/Skeleton.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import s from './Profile.module.css';

/** Someone's profile, or your own at /me. Remounted per person, so state starts fresh. */
export default function Profile({ userId }: { userId: string }) {
	const own = userId === session.userId;
	const navigate = useNavigate();
	// Last visit's copy shows at once while the fresh one loads.
	const [profile, setProfile] = useState(() => readSaved<PublicProfile>(`profile.${userId}`));
	const [error, setError] = useState<string | null>(null);
	const [tab, setTab] = useState<'photos' | 'parties'>('photos');
	const [parties, setParties] = useState<Event[] | null>(null);
	const [menu, setMenu] = useState(false);
	const [reporting, setReporting] = useState(false);
	const posts = usePaged<Post>(
		async (cursor) => {
			const p = await api.userPosts(userId, cursor);
			return { items: p.posts, next: p.next_cursor ?? null };
		},
		() => `posts.${userId}`
	);

	useEffect(() => {
		api.user(userId).then(
			(p) => {
				setProfile(p);
				writeSaved(`profile.${userId}`, p);
			},
			(e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong')
		);
		void posts.refresh();
	}, [userId, posts]);

	async function showParties() {
		setTab('parties');
		if (parties) return;
		const [hosting, going] = await Promise.all([api.myEvents(true), api.myEvents(false)]).catch(() => [[], []] as Event[][]);
		const seen = new Set<string>();
		setParties(
			[...hosting, ...going].filter((e) => !seen.has(e.id) && seen.add(e.id)).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
		);
	}

	async function toggleFollow() {
		if (!profile) return;
		const on = !profile.is_following;
		const before = profile;
		setProfile({ ...profile, is_following: on, followers: profile.followers + (on ? 1 : -1) });
		try {
			await api.follow(profile.id, on);
		} catch (e) {
			setProfile(before);
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		}
	}

	async function message() {
		if (!profile) return;
		try {
			const chat = await api.startConversation(profile.id);
			await navigate(`/chat/${chat.id}`);
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't start a chat");
		}
	}

	async function toggleBlock() {
		if (!profile) return;
		setMenu(false);
		const on = !profile.is_blocked;
		if (on && !confirm(`Block ${nameOf(profile)}? You won't see each other's posts or parties, and they can't message you.`)) return;
		try {
			await api.block(profile.id, on);
			setProfile({ ...profile, is_blocked: on, is_following: on ? false : profile.is_following });
			toast.show(on ? 'Blocked' : 'Unblocked');
		} catch {
			toast.show("Couldn't do that");
		}
	}

	return (
		<>
			<title>{`${profile ? nameOf(profile) : 'Profile'} · PartyNearMe`}</title>
			<PageHeader
				title={profile?.username ? `@${profile.username}` : profile ? nameOf(profile) : 'Profile'}
				back={!own}
				actions={
					own ? (
						<Link className={s.icon} to="/settings" aria-label="Settings" title="Settings">
							<Icon name="settings" />
						</Link>
					) : (
						profile && (
							<button className={s.icon} aria-label="More options" onClick={() => setMenu(true)}>
								<Icon name="more" />
							</button>
						)
					)
				}
			/>

			{profile && !own && (
				<>
					<Sheet open={menu} onClose={() => setMenu(false)} title={nameOf(profile)}>
						<div className={s.menu}>
							<button
								className="btn block"
								onClick={() => {
									setMenu(false);
									setReporting(true);
								}}
							>
								Report
							</button>
							<button className="btn block danger" onClick={toggleBlock}>
								{profile.is_blocked ? 'Unblock' : 'Block'}
							</button>
							<button className="btn block outline" onClick={() => setMenu(false)}>
								Cancel
							</button>
						</div>
					</Sheet>
					<ReportSheet open={reporting} onClose={() => setReporting(false)} target="user" targetId={profile.id} />
				</>
			)}

			{error ? (
				<Empty title="Couldn't open this profile">{error}</Empty>
			) : !profile ? (
				<Skeleton kind="profile" />
			) : (
				<>
					<section className={s.top}>
						<Avatar person={profile} size={88} ring />
						<div className={s.stats}>
							<div>
								<strong>{profile.parties}</strong>
								<span>Parties</span>
							</div>
							<div>
								<strong>
									{posts.items.length}
									{!posts.ended ? '+' : ''}
								</strong>
								<span>Photos</span>
							</div>
							<Link to={`/u/${profile.id}/followers`}>
								<strong>{profile.followers}</strong>
								<span>Followers</span>
							</Link>
							<Link to={`/u/${profile.id}/following`}>
								<strong>{profile.following}</strong>
								<span>Following</span>
							</Link>
						</div>
					</section>
					<section className={s.about}>
						<h1>
							{nameOf(profile)} <RelationshipHeart status={profile.relationship_status} size={18} />
						</h1>
						{profile.bio && <p className={s.bio}>{profile.bio}</p>}
						{!own && profile.is_blocked ? (
							<button className="btn block outline" onClick={toggleBlock}>
								Unblock
							</button>
						) : (
							!own && (
								<div className={s.actions}>
									<button className={`btn ${profile.is_following ? '' : 'primary'}`} onClick={toggleFollow}>
										{profile.is_following ? 'Following' : 'Follow'}
									</button>
									<button className="btn" onClick={message}>
										Message
									</button>
								</div>
							)
						)}
					</section>

					{own && (
						<div className={s.tabs} role="tablist">
							<button role="tab" aria-selected={tab === 'photos'} onClick={() => setTab('photos')}>
								Photos
							</button>
							<button role="tab" aria-selected={tab === 'parties'} onClick={showParties}>
								Your parties
							</button>
						</div>
					)}

					{tab === 'photos' ? (
						<>
							<div className={s.grid}>
								{posts.items.map(
									(post) =>
										post.media[0] && (
											<Link key={post.id} to={`/p/${post.id}`} aria-label={post.caption ?? 'Photo'}>
												<Photo media={post.media[0]} sizes="(min-width: 640px) 210px, 33vw" square />
											</Link>
										)
								)}
							</div>
							{posts.loadedOnce && !posts.items.length ? (
								<Empty title="No photos yet">{own ? 'Photos you post from parties show up here.' : ''}</Empty>
							) : (
								<LoadMore list={posts} />
							)}
						</>
					) : !parties ? (
						<Spinner />
					) : !parties.length ? (
						<Empty title="No parties yet">Parties you host or say you're going to show up here.</Empty>
					) : (
						<div className={s.parties}>
							{parties.map((event) => (
								<EventCard key={event.id} event={event} />
							))}
						</div>
					)}
				</>
			)}
		</>
	);
}
