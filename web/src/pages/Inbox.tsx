import { useEffect } from 'react';
import { Link } from 'react-router';
import { api } from '#lib/api/client.js';
import type { Conversation } from '#lib/api/types.js';
import { coverFor, nameOf, timeAgo } from '#lib/format.js';
import { usePaged } from '#lib/paged.js';
import { listen } from '#lib/realtime.js';
import { session } from '#lib/session.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { Empty } from '#lib/ui/Empty.js';
import { LoadMore } from '#lib/ui/LoadMore.js';
import { Skeleton } from '#lib/ui/Skeleton.js';
import { PageHeader } from './PageHeader.js';
import s from './Inbox.module.css';

const title = (c: Conversation) => c.party?.title ?? (c.other ? nameOf(c.other) : 'Deleted account');

/** "You: ", or the sender's name in a party chat, before the last message. */
function prefix(c: Conversation, senderId: string) {
	if (senderId === session.userId) return 'You: ';
	if (c.party) return `${nameOf(c.members?.find((m) => m.id === senderId) ?? {})}: `;
	return '';
}

/** Your chats, newest first. */
export default function Inbox() {
	const inbox = usePaged<Conversation>(
		async (cursor) => {
			const page = await api.inbox(cursor);
			return { items: page.conversations, next: page.next_cursor ?? null };
		},
		() => 'inbox'
	);

	// Fresh when opened, and again whenever a message arrives in any chat.
	useEffect(() => {
		void inbox.refresh();
		return listen(null, () => void inbox.refresh());
	}, [inbox]);

	return (
		<>
			<title>Messages · PartyNearMe</title>
			<PageHeader title="Messages" />
			{!inbox.loadedOnce && !inbox.items.length ? (
				<Skeleton count={8} />
			) : inbox.loadedOnce && !inbox.items.length && !inbox.error ? (
				<Empty title="No messages yet">Open someone's profile and tap Message to plan your next night out.</Empty>
			) : (
				<>
					<ul className={s.list}>
						{inbox.items.map((c) => (
							<li key={c.id}>
								<Link to={`/chat/${c.id}`} className={c.unread_count > 0 ? s.unread : undefined}>
									{c.party ? (
										<span
											className={s.cover}
											style={{ background: c.party.cover_url ? `center / cover url(${c.party.cover_url})` : coverFor(c.party.id) }}
										/>
									) : (
										<Avatar person={c.other ?? { id: c.id, display_name: 'Deleted account' }} size={56} ring={c.unread_count > 0} />
									)}
									<span className={s.text}>
										<strong>{title(c)}</strong>
										{c.last_message && (
											<span className={s.last}>
												{prefix(c, c.last_message.sender_id)}
												{c.last_message.body}
												{c.last_message_at ? ` · ${timeAgo(c.last_message_at)}` : ''}
											</span>
										)}
									</span>
									{c.unread_count > 0 && <span className={s.dot} aria-label="Unread" />}
								</Link>
							</li>
						))}
					</ul>
					<LoadMore list={inbox} />
				</>
			)}
		</>
	);
}
