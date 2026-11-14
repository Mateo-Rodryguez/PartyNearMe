import { useEffect, useState } from 'react';
import { api } from '#lib/api/client.js';
import type { ListedPerson, Person } from '#lib/api/types.js';
import { nameOf } from '#lib/format.js';
import { session } from '#lib/session.js';
import { Avatar } from './Avatar.js';
import { Icon } from './Icon.js';
import { Spinner } from './Spinner.js';
import s from './PeoplePicker.module.css';

/**
 * Picks people, as in the apps: the ones you follow first, or anyone by
 * searching. Used to invite people to a party and to tag them in photos.
 */
export function PeoplePicker({
	button,
	initial = [],
	max = 20,
	busy = false,
	onDone
}: {
	button: string;
	initial?: Person[];
	max?: number;
	busy?: boolean;
	onDone: (people: Person[]) => void;
}) {
	const [query, setQuery] = useState('');
	const [following, setFollowing] = useState<ListedPerson[]>([]);
	const [results, setResults] = useState<ListedPerson[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [picked, setPicked] = useState<Person[]>(initial);

	useEffect(() => {
		const me = session.userId;
		if (!me) return;
		api.following(me)
			.then((page) => setFollowing(page.users), () => undefined)
			.finally(() => setLoaded(true));
	}, []);

	// Searches a moment after typing stops, and only keeps the latest answer.
	useEffect(() => {
		const q = query.trim();
		if (!q) {
			setResults([]);
			return;
		}
		let stale = false;
		const timer = setTimeout(() => {
			api.searchUsers(q).then((page) => !stale && setResults(page.users), () => undefined);
		}, 250);
		return () => {
			stale = true;
			clearTimeout(timer);
		};
	}, [query]);

	const shown = (query.trim() ? results : following).filter((p) => p.id !== session.userId);
	const isPicked = (id: string) => picked.some((p) => p.id === id);

	function toggle(person: Person) {
		if (isPicked(person.id)) setPicked(picked.filter((p) => p.id !== person.id));
		else if (picked.length < max) setPicked([...picked, person]);
	}

	return (
		<div className={s.picker}>
			<input className="field" type="search" placeholder="Search people" aria-label="Search people" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
			<div className={s.list}>
				{!loaded ? (
					<Spinner />
				) : !shown.length && !query.trim() ? (
					<p className={`muted ${s.none}`}>Follow people to see them here, or search by name or username.</p>
				) : !shown.length ? (
					<p className={`muted ${s.none}`}>Nobody matches "{query.trim()}".</p>
				) : (
					shown.map((person) => (
						<button key={person.id} className={s.row} aria-pressed={isPicked(person.id)} onClick={() => toggle(person)}>
							<Avatar person={person} size={44} />
							<span className={s.name}>
								<strong>{nameOf(person)}</strong>
								{person.username && <span className="muted">@{person.username}</span>}
							</span>
							<span className={s.tick} aria-hidden="true">
								{isPicked(person.id) && <Icon name="check" size={18} />}
							</span>
						</button>
					))
				)}
			</div>
			<button className="btn primary block" disabled={(!picked.length && !initial.length) || busy} onClick={() => onDone(picked)}>
				{busy ? 'Sending…' : picked.length ? `${button} (${picked.length})` : button}
			</button>
		</div>
	);
}
