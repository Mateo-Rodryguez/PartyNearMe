import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { Person, Placement, Post } from '#lib/api/types.js';
import { count, nameOf, timeAgo } from '#lib/format.js';
import { interactions } from '#lib/interactions.js';
import { prefs } from '#lib/prefs.js';
import { session } from '#lib/session.js';
import { postLink, share } from '#lib/share.js';
import { useStore } from '#lib/store.js';
import { toast } from '#lib/toast.js';
import { Avatar } from './Avatar.js';
import { Icon } from './Icon.js';
import { PeoplePicker } from './PeoplePicker.js';
import { Photo } from './Photo.js';
import { ReportSheet } from './ReportSheet.js';
import { Sheet } from './Sheet.js';
import s from './PostCard.module.css';

/**
 * One post: author, swipeable photos, likes, saves and the menu. Changes show at
 * once and go back if the server refuses; [onChange] gets the new copy.
 */
export function PostCard({
	post,
	onChange,
	eager = false,
	detail = false,
	placement,
	onGone
}: {
	post: Post;
	onChange: (post: Post) => void;
	eager?: boolean;
	detail?: boolean;
	/** Which list the post is in, and where, for measuring the ranking. */
	placement?: Placement;
	onGone?: () => void;
}) {
	useStore(prefs);
	const own = post.author.id === session.userId;
	const taggedMe = post.tags.some((t) => t.id === session.userId);
	const [menu, setMenu] = useState(false);
	const [reporting, setReporting] = useState(false);
	const [editing, setEditing] = useState(false);
	const [caption, setCaption] = useState('');
	const [tagging, setTagging] = useState(false);
	const [savingTags, setSavingTags] = useState(false);
	const [index, setIndex] = useState(0);
	const [burst, setBurst] = useState(false);
	const card = useRef<HTMLElement>(null);
	const strip = useRef<HTMLDivElement>(null);
	// The latest copy, for handlers that finish after a re-render.
	const latest = useRef(post);
	latest.current = post;

	// An impression once half the post is on screen, and how long it stays there.
	useEffect(() => {
		const el = card.current;
		if (!el || detail) return;
		let since = 0;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					interactions.impression(post.id, placement);
					since = performance.now();
				} else if (since) {
					interactions.dwell(post.id, performance.now() - since, placement);
					since = 0;
				}
			},
			{ threshold: 0.5 }
		);
		observer.observe(el);
		return () => {
			if (since) interactions.dwell(post.id, performance.now() - since, placement);
			observer.disconnect();
		};
	}, [post.id, detail]);

	async function toggleLike(on = !post.liked_by_me) {
		const before = latest.current;
		if (on === before.liked_by_me) return;
		onChange({ ...before, liked_by_me: on, like_count: before.like_count + (on ? 1 : -1) });
		try {
			await api.like(before.id, on);
		} catch {
			onChange(before);
			toast.show("Couldn't save that. Try again.");
		}
	}

	async function toggleSave() {
		const before = latest.current;
		const on = !before.saved_by_me;
		onChange({ ...before, saved_by_me: on });
		try {
			await api.savePost(before.id, on);
			toast.show(on ? 'Saved' : 'Removed from saved');
		} catch {
			onChange({ ...latest.current, saved_by_me: !on });
			toast.show("Couldn't save that. Try again.");
		}
	}

	function doubleTap() {
		setBurst(true);
		setTimeout(() => setBurst(false), 700);
		void toggleLike(true);
	}

	async function sharePost() {
		const result = await share(`${nameOf(post.author)} on PartyNearMe`, postLink(post.id), { postId: post.id });
		if (result) analytics.capture('link_shared', { kind: 'post' });
		if (result === 'copied') toast.show('Link copied');
	}

	async function act(what: 'delete' | 'untag' | 'block') {
		setMenu(false);
		const ask = {
			delete: 'Delete this post? This cannot be undone.',
			untag: 'Take yourself off this post?',
			block: `Block ${nameOf(post.author)}? You won't see each other's posts or parties, and they can't message you.`
		}[what];
		if (!confirm(ask)) return;
		try {
			if (what === 'delete') await api.deletePost(post.id);
			if (what === 'untag') {
				await api.untagMe(post.id);
				onChange({ ...latest.current, tags: latest.current.tags.filter((t) => t.id !== session.userId) });
				return;
			}
			if (what === 'block') await api.block(post.author.id, true);
			toast.show(what === 'delete' ? 'Post deleted' : 'Blocked');
			onGone?.();
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't do that");
		}
	}

	async function saveCaption(e: React.FormEvent) {
		e.preventDefault();
		try {
			onChange(await api.updateCaption(post.id, caption.trim()));
			setEditing(false);
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		}
	}

	async function saveTags(people: Person[]) {
		setSavingTags(true);
		try {
			onChange(await api.setTags(post.id, people.map((p) => p.id)));
			setTagging(false);
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		} finally {
			setSavingTags(false);
		}
	}

	function onScroll() {
		const el = strip.current;
		if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
	}

	return (
		<>
			<article className={s.post} ref={card} aria-label={`Post by ${nameOf(post.author)}`}>
				<header>
					<Link to={`/u/${post.author.id}`} className={s.who}>
						<Avatar person={post.author} size={36} />
						<span className={s.names}>
							<strong>{nameOf(post.author)}</strong>
							{(post.event_title || post.place_name) && <span className={`${s.where} muted`}>{post.event_title ?? post.place_name}</span>}
						</span>
					</Link>
					{post.event_id && (
						<Link className={s['party-link']} to={`/e/${post.event_id}`} aria-label="Open the party">
							<Icon name="event" size={20} />
						</Link>
					)}
					<time className="muted" dateTime={post.created_at}>
						{timeAgo(post.created_at)}
					</time>
					<button className={`${s.icon} ${s.small}`} aria-label="More options" onClick={() => setMenu(true)}>
						<Icon name="more" size={20} />
					</button>
				</header>

				{post.media.length > 0 && (
					<div className={s.media} role="presentation" onDoubleClick={doubleTap}>
						<div className={s.strip} ref={strip} onScroll={onScroll}>
							{post.media.map((media, i) => (
								<div className={s.slide} key={media.position}>
									<Photo media={media} eager={eager && i === 0} alt={post.caption ? `Photo: ${post.caption}` : `Photo by ${nameOf(post.author)}`} />
								</div>
							))}
						</div>
						{post.media.length > 1 && (
							<div className={s.dots} aria-hidden="true">
								{post.media.map((media, i) => (
									<span key={media.position} className={i === index ? s.on : undefined} />
								))}
							</div>
						)}
						{burst && (
							<span className={s.burst} aria-hidden="true">
								<Icon name="heart" size={96} />
							</span>
						)}
					</div>
				)}

				<div className={s.actions}>
					<button className={`${s.icon} ${post.liked_by_me ? s.liked : ''}`} aria-pressed={post.liked_by_me} aria-label="Like" onClick={() => toggleLike()}>
						<Icon name={post.liked_by_me ? 'heart' : 'heartOutline'} />
					</button>
					<Link className={s.icon} to={`/p/${post.id}#comments`} aria-label="Comments">
						<Icon name="comment" />
					</Link>
					<button className={s.icon} aria-label="Share" onClick={sharePost}>
						<Icon name="share" />
					</button>
					<span className={s.spacer} />
					<button className={s.icon} aria-pressed={post.saved_by_me} aria-label="Save" onClick={toggleSave}>
						<Icon name={post.saved_by_me ? 'bookmark' : 'bookmarkOutline'} />
					</button>
				</div>

				<div className={s.text}>
					{post.like_count > 0 && (own || !prefs.display.hideLikeCounts) && <strong>{count(post.like_count, 'like')}</strong>}
					{post.caption && (
						<p>
							<Link to={`/u/${post.author.id}`}>
								<strong>{nameOf(post.author)}</strong>
							</Link>{' '}
							{post.caption}
						</p>
					)}
					{post.tags.length > 0 && (
						<p className="muted">
							With{' '}
							{post.tags.map((tag, i) => (
								<span key={tag.id}>
									{i > 0 ? ', ' : ''}
									<Link to={`/u/${tag.id}`}>{nameOf(tag)}</Link>
								</span>
							))}
						</p>
					)}
					{!detail && post.comment_count > 0 && (
						<Link className="muted" to={`/p/${post.id}#comments`}>
							View {count(post.comment_count, 'comment')}
						</Link>
					)}
					{editing && (
						<form className={s.edit} onSubmit={saveCaption}>
							<textarea className="field" rows={3} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" />
							<div className={s.row}>
								<button type="button" className="btn" onClick={() => setEditing(false)}>
									Cancel
								</button>
								<button className="btn primary">Save</button>
							</div>
						</form>
					)}
					{post.status !== 'visible' && <p className="muted">Only you can see this while we check it.</p>}
				</div>
			</article>

			<Sheet open={menu} onClose={() => setMenu(false)} title="Post">
				<div className={s.menu}>
					{own ? (
						<>
							<button
								className="btn block"
								onClick={() => {
									setMenu(false);
									setCaption(post.caption ?? '');
									setEditing(true);
								}}
							>
								Edit caption
							</button>
							<button
								className="btn block"
								onClick={() => {
									setMenu(false);
									setTagging(true);
								}}
							>
								Tag people
							</button>
							<button className="btn block danger" onClick={() => act('delete')}>
								Delete post
							</button>
						</>
					) : (
						<>
							<button
								className="btn block"
								onClick={() => {
									setMenu(false);
									setReporting(true);
								}}
							>
								Report post
							</button>
							{taggedMe && (
								<button className="btn block" onClick={() => act('untag')}>
									Remove me from this post
								</button>
							)}
							<button className="btn block danger" onClick={() => act('block')}>
								Block {nameOf(post.author)}
							</button>
						</>
					)}
					<button className="btn block outline" onClick={() => setMenu(false)}>
						Cancel
					</button>
				</div>
			</Sheet>
			<ReportSheet open={reporting} onClose={() => setReporting(false)} target="post" targetId={post.id} />
			{own && (
				<Sheet open={tagging} onClose={() => setTagging(false)} title="Tag people">
					<PeoplePicker button="Save" initial={post.tags} busy={savingTags} onDone={saveTags} />
				</Sheet>
			)}
		</>
	);
}
