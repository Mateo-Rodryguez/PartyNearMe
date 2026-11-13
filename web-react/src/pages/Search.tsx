import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { ListedPerson } from '#lib/api/types.js';
import { nameOf } from '#lib/format.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import s from './Search.module.css';

/** People search. */
export default function Search() {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<ListedPerson[]>([]);
	const [loading, setLoading] = useState(false);
	const [searched, setSearched] = useState(false);

	// Searches a moment after typing stops, and only shows the latest answer.
	useEffect(() => {
		const q = query.trim();
		if (q.length < 2) {
			setResults([]);
			setSearched(false);
			return;
		}
		let stale = false;
		const timer = setTimeout(async () => {
			setLoading(true);
			try {
				const page = await api.searchUsers(q);
				if (stale) return;
				setResults(page.users);
				if (!page.users.length && q.length >= 3) analytics.capture('search_no_results', { length: q.length });
			} catch {
				if (!stale) setResults([]);
			} finally {
				if (!stale) {
					setLoading(false);
					setSearched(true);
				}
			}
		}, 250);
		return () => {
			stale = true;
			clearTimeout(timer);
		};
	}, [query]);

	return (
		<>
			<title>Search · PartyNearMe</title>
			<PageHeader title="Search" />
			<div className={s.box}>
				<label className="visually-hidden" htmlFor="q">
					Search people
				</label>
				<input
					id="q"
					className="field"
					type="search"
					placeholder="Search people"
					autoComplete="off"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>
			{loading && !results.length ? <Spinner /> : searched && !results.length && <p className={`muted ${s.none}`}>No one found.</p>}
			<ul className={s.list}>
				{results.map((person) => (
					<li key={person.id}>
						<Link to={`/u/${person.id}`}>
							<Avatar person={person} size={44} />
							<span>
								<strong>{nameOf(person)}</strong>
								{person.username && person.display_name && <span className="muted">@{person.username}</span>}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</>
	);
}
