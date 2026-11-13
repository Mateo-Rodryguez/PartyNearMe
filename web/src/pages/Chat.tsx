import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '#lib/api/client.js';
import type { Conversation, Message } from '#lib/api/types.js';
import { clockTime, nameOf } from '#lib/format.js';
import { listen } from '#lib/realtime.js';
import { session } from '#lib/session.js';
import { toast } from '#lib/toast.js';
import { unread } from '#lib/unread.js';
import { Icon } from '#lib/ui/Icon.js';
import { ReportSheet } from '#lib/ui/ReportSheet.js';
import { PageHeader } from './PageHeader.js';
import s from './Chat.module.css';

const byId = (a: Message, b: Message) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

/** One chat, live: a direct message or a party's group chat. Remounted per chat. */
export default function Chat() {
	const id = useParams().id ?? '';
	const [conversation, setConversation] = useState<Conversation | null>(null);
	/** Oldest first, for reading top to bottom. */
	const [messages, setMessages] = useState<Message[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [sending, setSending] = useState(false);
	const [reportId, setReportId] = useState<string | null>(null);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const list = useRef<HTMLDivElement>(null);
	// The latest messages and hidden senders, for merges from timers and the live feed.
	const known = useRef<Message[]>([]);
	const hidden = useRef(new Set<string>());

	const toBottom = () => requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight }));

	function show(next: Message[]) {
		known.current = next;
		setMessages(next);
	}

	/** Adds messages not seen yet; true if any were new. */
	function merge(fresh: Message[]) {
		const ids = new Set(known.current.map((m) => m.id));
		const added = fresh.filter((m) => !ids.has(m.id) && !hidden.current.has(m.sender_id));
		if (!added.length) return false;
		const el = list.current;
		const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
		show([...known.current, ...added].sort(byId));
		if (atBottom) toBottom();
		return true;
	}

	useEffect(() => {
		api.conversation(id).then((c) => {
			hidden.current = new Set(c.hidden_sender_ids ?? []);
			setConversation(c);
		}, () => undefined);
		let first = true;
		// New messages arrive live; a slow check also catches anything missed while offline.
		const poll = async () => {
			try {
				const page = await api.messages(id);
				const changed = merge(page.messages);
				if (first) setHasMore(page.has_more);
				if (first || changed) {
					await api.markRead(id).catch(() => undefined);
					void unread.check();
				}
				first = false;
			} catch (e) {
				if (first) setError(e instanceof Error ? e.message : 'Something went wrong');
			}
		};
		void poll();
		const timer = setInterval(poll, 30_000);
		const stop = listen(id, (m) => {
			merge([m]);
			if (m.sender_id !== session.userId) void api.markRead(id).catch(() => undefined);
		});
		return () => {
			clearInterval(timer);
			stop();
		};
		// merge reads refs only.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	async function older() {
		const el = list.current;
		if (!hasMore || loadingOlder || !known.current.length || !el) return;
		setLoadingOlder(true);
		const height = el.scrollHeight;
		try {
			const page = await api.messages(id, known.current[0].id);
			const ids = new Set(known.current.map((m) => m.id));
			show([...page.messages.filter((m) => !ids.has(m.id)), ...known.current].sort(byId));
			setHasMore(page.has_more);
			// Keep the same messages in view.
			requestAnimationFrame(() => (el.scrollTop += el.scrollHeight - height));
		} finally {
			setLoadingOlder(false);
		}
	}

	async function send(e: FormEvent) {
		e.preventDefault();
		const body = draft.trim();
		if (!body) return;
		setSending(true);
		try {
			const sent = await api.send(id, body);
			setDraft('');
			merge([sent]);
			toBottom();
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't send that");
		} finally {
			setSending(false);
		}
	}

	const title = conversation?.party?.title ?? (conversation?.other ? nameOf(conversation.other) : 'Chat');
	const titleHref = conversation?.party ? `/e/${conversation.party.id}` : conversation?.other ? `/u/${conversation.other.id}` : null;
	const senderName = (senderId: string) => nameOf(conversation?.members?.find((m) => m.id === senderId) ?? {});

	return (
		<>
			<title>{`${title} · PartyNearMe`}</title>
			<div className={s.chat}>
				<PageHeader
					title={title}
					back
					actions={
						titleHref && (
							<Link className={s.open} to={titleHref}>
								{conversation?.party ? 'Party' : 'Profile'}
							</Link>
						)
					}
				/>
				<div
					className={s.messages}
					ref={list}
					onScroll={() => list.current && list.current.scrollTop < 120 && void older()}
					role="log"
					aria-live="polite"
				>
					{error && !messages.length && <p className={`error ${s.center}`}>{error}</p>}
					{messages.map((m, i) => {
						const mine = m.sender_id === session.userId;
						const runStart = messages[i - 1]?.sender_id !== m.sender_id;
						return (
							<Fragment key={m.id}>
								{conversation?.party && !mine && runStart && <p className={s.sender}>{senderName(m.sender_id)}</p>}
								<div className={mine ? `${s.row} ${s.mine}` : s.row}>
									{m.event_id ? (
										<Link className={`${s.bubble} ${s.invite}`} to={`/e/${m.event_id}`}>
											<span className="overline">Party invite</span>
											<span>{m.body}</span>
											<span className={s.hint}>Tap to see the party</span>
										</Link>
									) : (
										<p className={s.bubble} title={clockTime(m.created_at)}>
											{m.body}
										</p>
									)}
									{!mine && (
										<button className={s.report} aria-label="Report message" title="Report message" onClick={() => setReportId(m.id)}>
											<Icon name="more" size={16} />
										</button>
									)}
								</div>
							</Fragment>
						);
					})}
				</div>
				<form className={s.compose} onSubmit={send}>
					<label className="visually-hidden" htmlFor="message">
						Message
					</label>
					<textarea
						id="message"
						className="field"
						rows={1}
						maxLength={4000}
						placeholder="Message…"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								e.currentTarget.form?.requestSubmit();
							}
						}}
					/>
					<button className={s.send} aria-label="Send" disabled={sending || !draft.trim()}>
						<Icon name="send" size={20} />
					</button>
				</form>
			</div>
			<ReportSheet open={reportId !== null} onClose={() => setReportId(null)} target="message" targetId={reportId ?? ''} />
		</>
	);
}
