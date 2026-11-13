import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '#lib/api/client.js';
import type { GuestList, Person } from '#lib/api/types.js';
import { nameOf } from '#lib/format.js';
import { toast } from '#lib/toast.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { Empty } from '#lib/ui/Empty.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import s from './Guests.module.css';

/** A private party's guest list: approve or decline requests, remove guests. */
export default function Guests() {
	const id = useParams().id ?? '';
	const [list, setList] = useState<GuestList | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api.guests(id).then(setList, (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
	}, [id]);

	async function approve(person: Person) {
		try {
			await api.approveGuest(id, person.id);
			setList((l) => l && { requested: l.requested.filter((p) => p.id !== person.id), going: [person, ...l.going] });
		} catch {
			toast.show("Couldn't approve them");
		}
	}

	async function remove(person: Person, request: boolean) {
		if (!list || (!request && !confirm(`Take ${nameOf(person)} off the guest list?`))) return;
		try {
			await api.removeGuest(id, person.id);
			setList(
				(l) => l && { requested: l.requested.filter((p) => p.id !== person.id), going: l.going.filter((p) => p.id !== person.id) }
			);
		} catch {
			toast.show("Couldn't do that");
		}
	}

	const who = (person: Person) => (
		<Link to={`/u/${person.id}`}>
			<Avatar person={person} size={40} /> <span>{nameOf(person)}</span>
		</Link>
	);

	return (
		<>
			<title>Guest list · PartyNearMe</title>
			<PageHeader title="Guest list" back />
			{error ? (
				<Empty title="Couldn't load the guest list">{error}</Empty>
			) : !list ? (
				<Spinner />
			) : (
				<>
					<section className={s.section}>
						<h2>Asked to come ({list.requested.length})</h2>
						{list.requested.length ? (
							list.requested.map((person) => (
								<div key={person.id} className={s.row}>
									{who(person)}
									<button className="btn" onClick={() => remove(person, true)}>
										Decline
									</button>
									<button className="btn primary" onClick={() => approve(person)}>
										Approve
									</button>
								</div>
							))
						) : (
							<p className="muted">No one's waiting.</p>
						)}
					</section>
					<section className={s.section}>
						<h2>Going ({list.going.length})</h2>
						{list.going.length ? (
							list.going.map((person) => (
								<div key={person.id} className={s.row}>
									{who(person)}
									<button className="btn outline" onClick={() => remove(person, false)}>
										Remove
									</button>
								</div>
							))
						) : (
							<p className="muted">No guests yet.</p>
						)}
					</section>
				</>
			)}
		</>
	);
}
