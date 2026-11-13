import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { Comment, Post } from '#lib/api/types.js';
import { nameOf, timeAgo } from '#lib/format.js';
import { interactions } from '#lib/interactions.js';
import { usePaged } from '#lib/paged.js';
import { toast } from '#lib/toast.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { Empty } from '#lib/ui/Empty.js';
import { Icon } from '#lib/ui/Icon.js';
import { LoadMore } from '#lib/ui/LoadMore.js';
import { PostCard } from '#lib/ui/PostCard.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import s from './PostPage.module.css';

/** One post with its comments. The route remounts it for each post id. */
export default function PostPage() {
	const id = useParams().id ?? '';
	const [post, setPost] = useState<Post | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [sending, setSending] = useState(false);
	const comments = usePaged<Comment>(async (cursor) => {
		const p = await api.comments(id, cursor);
		return { items: p.comments, next: p.next_cursor ?? null };
	});

	useEffect(() => {
		api.post(id).then(
			(p) => {
				setPost(p);
				interactions.open(p.id);
			},
			(e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong')
		);
		void comments.refresh();
	}, [id, comments]);

	async function send(e: React.FormEvent) {
		e.preventDefault();
		const body = draft.trim();
		if (!body || !post) return;
		setSending(true);
		try {
			const added = await api.addComment(post.id, body);
			comments.setItems([added, ...comments.items]);
			analytics.capture('comment_posted');
			setPost((p) => p && { ...p, comment_count: p.comment_count + 1 });
			setDraft('');
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't post that");
		} finally {
			setSending(false);
		}
	}

	async function remove(comment: Comment) {
		if (!confirm('Delete this comment?')) return;
		try {
			await api.deleteComment(comment.id);
			comments.setItems(comments.items.filter((c) => c.id !== comment.id));
			setPost((p) => p && { ...p, comment_count: Math.max(0, p.comment_count - 1) });
		} catch {
			toast.show("Couldn't delete that");
		}
	}

	return (
		<>
			<title>{post ? `${nameOf(post.author)} on PartyNearMe` : 'Post · PartyNearMe'}</title>
			<PageHeader title="Post" back />
			{error ? (
				<Empty title="Couldn't open this post">{error}</Empty>
			) : !post ? (
				<Spinner />
			) : (
				<>
					<PostCard post={post} onChange={setPost} eager detail onGone={() => history.back()} />
					<section id="comments" className={s.section} aria-label="Comments">
						<form className={s.compose} onSubmit={send}>
							<label className="visually-hidden" htmlFor="comment">
								Add a comment
							</label>
							<input id="comment" className="field" placeholder="Add a comment…" maxLength={500} value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
							<button className={s.send} aria-label="Post comment" disabled={sending || !draft.trim()}>
								<Icon name="send" />
							</button>
						</form>
						<ul>
							{comments.items.map((comment) => (
								<li key={comment.id}>
									<Link to={`/u/${comment.author.id}`}>
										<Avatar person={comment.author} size={32} />
									</Link>
									<div className={s.bubble}>
										<p>
											<Link to={`/u/${comment.author.id}`}>
												<strong>{nameOf(comment.author)}</strong>
											</Link>
											<span className={`muted ${s.small}`}>{timeAgo(comment.created_at)}</span>
										</p>
										<p className={s.body}>{comment.body}</p>
										{comment.status === 'hidden' && <p className={`muted ${s.small}`}>Hidden: only you can see this.</p>}
									</div>
									{comment.can_delete && (
										<button className={`${s.delete} muted`} onClick={() => remove(comment)}>
											Delete
										</button>
									)}
								</li>
							))}
						</ul>
						{comments.loadedOnce && !comments.items.length && <p className={`muted ${s.none}`}>No comments yet. Say something nice.</p>}
						<LoadMore list={comments} />
					</section>
				</>
			)}
		</>
	);
}
