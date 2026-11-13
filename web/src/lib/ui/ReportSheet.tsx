import { useState } from 'react';
import { api } from '#lib/api/client.js';
import type { ReportTarget } from '#lib/api/types.js';
import { toast } from '#lib/toast.js';
import { Sheet } from './Sheet.js';
import s from './ReportSheet.module.css';

// The same reasons as the apps, so moderators see one list.
const reasons = ['Spam', 'Nudity or sexual content', 'Harassment or hate', 'Violence or dangerous behaviour', 'Illegal (e.g. drugs)', 'Something else'];

export function ReportSheet({ open, onClose, target, targetId }: { open: boolean; onClose: () => void; target: ReportTarget; targetId: string }) {
	const [reason, setReason] = useState(reasons[0]);
	const [busy, setBusy] = useState(false);

	async function send() {
		setBusy(true);
		try {
			await api.report(target, targetId, reason);
			toast.show("Thanks, we'll review it");
			onClose();
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't send that");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Sheet open={open} onClose={onClose} title={`Report this ${target}?`}>
			<p className="muted">Why are you reporting it? We review every report.</p>
			<div className={s.reasons} role="radiogroup">
				{reasons.map((r) => (
					<label key={r}>
						<input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> {r}
					</label>
				))}
			</div>
			<div className={s.row}>
				<button className="btn" onClick={onClose}>
					Cancel
				</button>
				<button className="btn primary" disabled={busy} onClick={send}>
					Report
				</button>
			</div>
		</Sheet>
	);
}
