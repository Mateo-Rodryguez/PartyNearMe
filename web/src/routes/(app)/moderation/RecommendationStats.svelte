<script lang="ts">
	import { api } from '#lib/api/client.js';
	import type { RecommendationStats } from '#lib/api/types.js';

	// How well For you works (docs/recommendations.md): of what people were
	// shown in each list, how much they opened, RSVP'd to or liked within a day.
	// Counts only; nobody's activity.
	type Row = { label: string; impressions: number; opens: number; rsvps: number; likes: number; users?: number };

	let stats = $state<RecommendationStats | null>(null);
	let error = $state<string | null>(null);
	let days = $state(14);

	$effect(() => {
		const range = days;
		error = null;
		api.recommendationStats(range).then(
			(s) => (stats = s),
			(e: unknown) => (error = e instanceof Error ? e.message : 'Something went wrong')
		);
	});

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

	/** The daily rows added up per list, so For you and Soonest sit side by side. */
	const bySurface = $derived.by((): Row[] => {
		const totals = new Map<string, Row>();
		for (const d of stats?.by_day ?? []) {
			const row = totals.get(d.surface) ?? { label: surfaceName[d.surface] ?? d.surface, impressions: 0, opens: 0, rsvps: 0, likes: 0, users: 0 };
			row.impressions += d.impressions;
			row.opens += d.opens;
			row.rsvps += d.rsvps;
			row.likes += d.likes;
			row.users = (row.users ?? 0) + d.users; // person-days
			totals.set(d.surface, row);
		}
		return [...totals.values()].sort((a, b) => b.impressions - a.impressions);
	});
	const byReason = $derived((stats?.by_reason ?? []).map((r) => ({ ...r, label: reasonName[r.reason] ?? r.reason })));
	const byPosition = $derived((stats?.by_position ?? []).map((r) => ({ ...r, label: `Places ${r.positions}` })));

	const pct = (part: number, whole: number) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : '–');
</script>

{#snippet table(title: string, rows: Row[], showLikes: boolean)}
	<h3>{title}</h3>
	{#if rows.length}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col"></th>
						<th scope="col">Seen</th>
						<th scope="col">Opened</th>
						<th scope="col">RSVP'd</th>
						{#if showLikes}<th scope="col">Liked</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.label)}
						<tr>
							<th scope="row">{row.label}</th>
							<td>{row.impressions}</td>
							<td>{pct(row.opens, row.impressions)}</td>
							<td>{pct(row.rsvps, row.impressions)}</td>
							{#if showLikes}<td>{pct(row.likes, row.impressions)}</td>{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="muted small">Nothing yet.</p>
	{/if}
{/snippet}

<section class="stats">
	<div class="head">
		<h2>Recommendations</h2>
		<select class="field" bind:value={days} aria-label="Period">
			<option value={7}>Last 7 days</option>
			<option value={14}>Last 14 days</option>
			<option value={30}>Last 30 days</option>
			<option value={90}>Last 90 days</option>
		</select>
	</div>
	<p class="muted small">
		Of what people saw in each list, the share they opened, RSVP'd to or liked within a day. For you should beat Soonest;
		reasons that convert well deserve more weight.
	</p>
	{#if error && !stats}
		<p class="muted small">{error}</p>
	{:else if stats}
		{@render table('By list', bySurface, true)}
		{@render table('For you, by reason shown', byReason, false)}
		{@render table('For you, by place in the list', byPosition, false)}
	{/if}
</section>

<style>
	.stats {
		display: grid;
		gap: 8px;
		padding: 8px 12px 32px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h2,
	h3,
	p {
		margin: 0;
	}
	h3 {
		margin-top: 8px;
		font-size: 15px;
	}
	.head select {
		width: auto;
	}
	.small {
		font-size: 13px;
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		padding: 6px 8px;
		text-align: right;
		border-bottom: 1px solid var(--outline-variant);
		white-space: nowrap;
	}
	th[scope='row'],
	thead th:first-child {
		text-align: left;
		font-weight: 600;
	}
	thead th {
		font-weight: 600;
		color: var(--on-surface-variant);
	}
</style>
