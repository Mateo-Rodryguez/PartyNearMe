import { useEffect, useState } from 'react';
import { analytics } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import { toast } from '#lib/toast.js';
import { Icon } from './Icon.js';
import s from './RecommendCard.module.css';

/**
 * "How likely are you to recommend PartyNearMe to a friend?" (0-10), the Net
 * Promoter Score, at the top of Home when lib/recommend.ts says it's time. The
 * app grows by word of mouth, so this is the number that matters most.
 */
export function RecommendCard({ onDone }: { onDone: () => void }) {
	const [score, setScore] = useState<number | null>(null);
	const [reason, setReason] = useState('');
	const [busy, setBusy] = useState(false);
	useEffect(() => analytics.capture('recommend_shown'), []);

	async function send() {
		if (score === null) return;
		setBusy(true);
		try {
			await api.sendFeedback('nps', { score, body: reason, screen: 'home' });
			toast.show(score >= 9 ? 'Thank you! Tell a friend tonight' : 'Thanks, this helps us improve');
			onDone();
		} catch (err) {
			toast.show(err instanceof Error ? err.message : "Couldn't send that");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className={s.card} aria-label="Would you recommend PartyNearMe?">
			<div className={s.top}>
				<h2>How likely are you to recommend PartyNearMe to a friend?</h2>
				<button
					className={s.close}
					aria-label="Not now"
					onClick={() => {
						analytics.capture('recommend_dismissed');
						onDone();
					}}
				>
					<Icon name="close" size={18} />
				</button>
			</div>
			<div className={s.scale} role="radiogroup" aria-label="Score from 0 to 10">
				{Array.from({ length: 11 }, (_, n) => (
					<button key={n} role="radio" aria-checked={score === n} onClick={() => setScore(n)}>
						{n}
					</button>
				))}
			</div>
			<div className={`${s.ends} muted`}>
				<span>Not likely</span>
				<span>Very likely</span>
			</div>
			{score !== null && (
				<>
					<textarea
						className="field"
						rows={2}
						maxLength={2000}
						aria-label="Why"
						placeholder={score >= 9 ? 'What do you love most? (optional)' : 'What would make it a 10? (optional)'}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
					<button className={`btn primary ${s.send}`} disabled={busy} onClick={send}>
						{busy ? 'Sending…' : 'Send'}
					</button>
				</>
			)}
		</section>
	);
}
