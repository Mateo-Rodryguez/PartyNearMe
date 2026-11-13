import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '#lib/api/client.js';
import type { Event } from '#lib/api/types.js';
import { toast } from '#lib/toast.js';
import { Empty } from '#lib/ui/Empty.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import { PartyForm } from './PartyForm.js';

/** Editing a party you host, with cancel and delete below the form. */
export default function EditEvent() {
	const id = useParams().id ?? '';
	const navigate = useNavigate();
	const [event, setEvent] = useState<Event | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api.event(id).then(setEvent, (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
	}, [id]);

	async function cancelParty() {
		if (!event || !confirm('Cancel this party? Everyone going gets a notification.')) return;
		try {
			await api.updateEvent(event.id, { status: 'cancelled' });
			toast.show('Party cancelled');
			await navigate(`/e/${event.id}`, { replace: true });
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't cancel it");
		}
	}

	async function deleteParty() {
		if (!event || !confirm('Delete this party for good? Its photos stay on their posts.')) return;
		try {
			await api.deleteEvent(event.id);
			toast.show('Party deleted');
			await navigate('/me', { replace: true });
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't delete it");
		}
	}

	return (
		<>
			<title>Edit party · PartyNearMe</title>
			<PageHeader title="Edit party" back />
			{error ? (
				<Empty title="Couldn't open this party">{error}</Empty>
			) : !event ? (
				<Spinner />
			) : (
				<>
					<PartyForm editing={event} />
					<div style={{ display: 'grid', gap: 10, padding: '0 16px 32px' }}>
						{event.status === 'published' && (
							<button className="btn block outline" onClick={cancelParty}>
								Cancel party
							</button>
						)}
						<button className="btn block danger outline" onClick={deleteParty}>
							Delete party
						</button>
					</div>
				</>
			)}
		</>
	);
}
