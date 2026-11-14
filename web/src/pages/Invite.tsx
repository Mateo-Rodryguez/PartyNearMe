import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { Event, Person } from '#lib/api/types.js';
import { inviteResultText } from '#lib/format.js';
import { toast } from '#lib/toast.js';
import { PeoplePicker } from '#lib/ui/PeoplePicker.js';
import { PageHeader } from './PageHeader.js';

/** Invites people to a party: each one gets a message in their chat with you that opens it. */
export default function Invite() {
	const id = useParams().id ?? '';
	const navigate = useNavigate();
	const [event, setEvent] = useState<Event | null>(null);
	const [sending, setSending] = useState(false);

	useEffect(() => {
		api.event(id).then(setEvent, () => undefined);
	}, [id]);

	async function send(people: Person[]) {
		setSending(true);
		try {
			const { sent, skipped } = await api.invite(
				id,
				people.map((p) => p.id)
			);
			analytics.capture('invites_sent', { sent, skipped });
			toast.show(inviteResultText(sent, skipped));
			if (sent > 0) await navigate(`/e/${id}`, { replace: true });
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't send the invites");
		} finally {
			setSending(false);
		}
	}

	return (
		<>
			<title>Invite friends · PartyNearMe</title>
			<PageHeader title={event ? `Invite to ${event.title}` : 'Invite friends'} back />
			<div style={{ padding: '0 16px 24px' }}>
				<PeoplePicker button="Send invites" busy={sending} onDone={send} />
			</div>
		</>
	);
}
