import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '#lib/api/client.js';
import type { ModerationAction, ReportedItem } from '#lib/api/types.js';
import { timeAgo } from '#lib/format.js';
import { toast } from '#lib/toast.js';
import { Empty } from '#lib/ui/Empty.js';
import { Sheet } from '#lib/ui/Sheet.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import { RecommendationStats } from './RecommendationStats.js';
import s from './Moderation.module.css';

type Choice = { action: ModerationAction; label: string };
const actionsFor = (type: string): Choice[] => [
	...((
		{
			post: [
				{ action: 'remove', label: 'Remove post' },
				{ action: 'restore', label: 'Put back' }
			],
			event: [
				{ action: 'remove', label: 'Remove party' },
				{ action: 'restore', label: 'Put back' }
			],
			user: [
				{ action: 'remove_picture', label: 'Remove picture' },
				{ action: 'delete_account', label: 'Delete account' }
			],
			message: [{ action: 'remove', label: 'Delete message' }],
			comment: [
				{ action: 'remove', label: 'Remove comment' },
				{ action: 'restore', label: 'Put back' }
			]
		} as Record<string, Choice[]>
	)[type] ?? []),
	{ action: 'dismiss', label: 'Nothing wrong' }
];
const kindName: Record<string, string> = { post: 'Post', event: 'Party', user: 'Person', message: 'Message', comment: 'Comment' };

/**
 * Open reports for moderators, oldest first, as in the apps; each decision
 * closes the thing's reports. The server checks who's a moderator.
 */
export default function Moderation() {
	const [items, setItems] = useState<ReportedItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<{ item: ReportedItem; choice: Choice } | null>(null);
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState('');
	const [busy, setBusy] = useState(false);

	const load = useCallback(() => {
		setError(null);
		api.moderationQueue().then(setItems, (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
	}, []);
	useEffect(load, [load]);

	function ask(item: ReportedItem, choice: Choice) {
		setConfirming({ item, choice });
		setNote('');
		setOpen(true);
	}

	async function act(e: FormEvent) {
		e.preventDefault();
		if (!confirming) return;
		const { item, choice } = confirming;
		setBusy(true);
		try {
			await api.moderate(item.target_type, item.target_id, choice.action, note.trim());
			setItems((list) => list?.filter((i) => !(i.target_type === item.target_type && i.target_id === item.target_id)) ?? null);
			setOpen(false);
		} catch (err) {
			toast.show(err instanceof Error ? err.message : "Couldn't do that");
		} finally {
			setBusy(false);
		}
	}

	const deleting = confirming?.choice.action === 'delete_account';
	return (
		<>
			<title>Reports to review · PartyNearMe</title>
			<PageHeader title="Reports to review" back />
			{error && !items ? (
				<Empty title="Couldn't load reports">
					{error}
					<p>
						<button className="btn" onClick={load}>
							Try again
						</button>
					</p>
				</Empty>
			) : !items ? (
				<Spinner />
			) : !items.length ? (
				<Empty title="Nothing to review">New reports show up here.</Empty>
			) : (
				<div className={s.list}>
					{items.map((item) => (
						<article key={`${item.target_type}/${item.target_id}`} className={s.card}>
							<p className="overline">
								{kindName[item.target_type] ?? item.target_type} · {item.report_count} report{item.report_count === 1 ? '' : 's'} ·{' '}
								{timeAgo(item.first_reported_at)}
							</p>
							{item.preview ? (
								<>
									<strong>{item.preview.title}</strong>
									{item.preview.status && <p className={s.small}>Status: {item.preview.status}</p>}
									{item.preview.image_url && <img src={item.preview.image_url} alt="" loading="lazy" />}
									{item.preview.body?.trim() && <p>{item.preview.body}</p>}
								</>
							) : (
								<p>This was deleted after it was reported.</p>
							)}
							<p className={`muted ${s.small}`}>Reasons: {[...new Set(item.reasons)].join(' · ')}</p>
							<div className={s.actions}>
								{item.preview?.user_id && (
									<Link className="btn" to={`/u/${item.preview.user_id}`}>
										View person
									</Link>
								)}
								{(item.preview ? actionsFor(item.target_type) : actionsFor(item.target_type).slice(-1)).map((choice) => (
									<button
										key={choice.label}
										className={`btn outline ${choice.action === 'delete_account' ? 'danger' : ''}`}
										onClick={() => ask(item, choice)}
									>
										{choice.label}
									</button>
								))}
							</div>
						</article>
					))}
				</div>
			)}
			<RecommendationStats />
			<Sheet open={open} onClose={() => setOpen(false)} title={confirming ? `${confirming.choice.label}?` : ''}>
				<form className={s.confirm} onSubmit={act}>
					{deleting && <p>This deletes the account and everything they posted. It can't be undone.</p>}
					<label>
						<span className="overline">Note for the log (optional)</span>
						<input className="field" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
					</label>
					<button className={`btn block primary ${deleting ? 'danger' : ''}`} disabled={busy}>
						{confirming?.choice.label}
					</button>
					<button type="button" className="btn block outline" onClick={() => setOpen(false)}>
						Cancel
					</button>
				</form>
			</Sheet>
		</>
	);
}
