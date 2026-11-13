import { useEffect, useState } from 'react';
import { api } from '#lib/api/client.js';
import type { RecommendationStats as Stats } from '#lib/api/types.js';
import s from './RecommendationStats.module.css';

/**
 * How well For you works (docs/recommendations.md): of what people were
 * shown in each list, how much they opened, RSVP'd to or liked within a day.
 * Counts only; nobody's activity.
 */
type Row = { label: string; impressions: number; opens: number; rsvps: number; likes: number; users?: number };

const surfaceName: Record<string, string> = {
	for_you_parties: 'Parties: For you',
	nearby: 'Parties: Soonest',
	feed: 'Home feed',
	profile: 'Profiles',
	saved: 'Saved',
	search: 'Search',
	other: 'Other'
};
const reasonName: Record<string, string> = {
	friends_going: 'Friends going',
	interest: 'Kind they like',
	following_host: 'Host they follow',
	liked_host: 'Host they liked',
	starting_soon: 'Starting soon',
	popular: 'Popular',
	nearby: 'Close by',
	none: 'No reason shown'
};

const pct = (part: number, whole: number) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : '–');

/** The daily rows added up per list, so For you and Soonest sit side by side. */
function bySurface(stats: Stats): Row[] {
	const totals = new Map<string, Row>();
	for (const d of stats.by_day) {
		const row = totals.get(d.surface) ?? { label: surfaceName[d.surface] ?? d.surface, impressions: 0, opens: 0, rsvps: 0, likes: 0, users: 0 };
		row.impressions += d.impressions;
		row.opens += d.opens;
		row.rsvps += d.rsvps;
		row.likes += d.likes;
		row.users = (row.users ?? 0) + d.users; // person-days
		totals.set(d.surface, row);
	}
	return [...totals.values()].sort((a, b) => b.impressions - a.impressions);
}

function Table({ title, rows, showLikes }: { title: string; rows: Row[]; showLikes: boolean }) {
	return (
		<>
			<h3>{title}</h3>
			{rows.length ? (
				<div className={s.scroll}>
					<table>
						<thead>
							<tr>
								<th scope="col"></th>
								<th scope="col">Seen</th>
								<th scope="col">Opened</th>
								<th scope="col">RSVP'd</th>
								{showLikes && <th scope="col">Liked</th>}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.label}>
									<th scope="row">{row.label}</th>
									<td>{row.impressions}</td>
									<td>{pct(row.opens, row.impressions)}</td>
									<td>{pct(row.rsvps, row.impressions)}</td>
									{showLikes && <td>{pct(row.likes, row.impressions)}</td>}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className={`muted ${s.small}`}>Nothing yet.</p>
			)}
		</>
	);
}

export function RecommendationStats() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [days, setDays] = useState(14);

	useEffect(() => {
		setError(null);
		api.recommendationStats(days).then(setStats, (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
	}, [days]);

	return (
		<section className={s.stats}>
			<div className={s.head}>
				<h2>Recommendations</h2>
				<select className="field" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
					<option value={7}>Last 7 days</option>
					<option value={14}>Last 14 days</option>
					<option value={30}>Last 30 days</option>
					<option value={90}>Last 90 days</option>
				</select>
			</div>
			<p className={`muted ${s.small}`}>
				Of what people saw in each list, the share they opened, RSVP'd to or liked within a day. For you should beat Soonest; reasons that
				convert well deserve more weight.
			</p>
			{error && !stats ? (
				<p className={`muted ${s.small}`}>{error}</p>
			) : (
				stats && (
					<>
						<Table title="By list" rows={bySurface(stats)} showLikes />
						<Table
							title="For you, by reason shown"
							rows={stats.by_reason.map((r) => ({ ...r, label: reasonName[r.reason] ?? r.reason }))}
							showLikes={false}
						/>
						<Table
							title="For you, by place in the list"
							rows={stats.by_position.map((r) => ({ ...r, label: `Places ${r.positions}` }))}
							showLikes={false}
						/>
					</>
				)
			)}
		</section>
	);
}
