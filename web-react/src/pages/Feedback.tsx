import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '#lib/api/client.js';
import type { FeedbackKind } from '#lib/api/types.js';
import { toast } from '#lib/toast.js';
import { PageHeader } from './PageHeader.js';
import s from './Feedback.module.css';

type Kind = Extract<FeedbackKind, 'love' | 'problem' | 'idea'>;
const kinds: { id: Kind; label: string; hint: string }[] = [
	{ id: 'love', label: 'I love something', hint: 'What do you love?' },
	{ id: 'problem', label: "Something's wrong", hint: 'What happened, and what were you trying to do?' },
	{ id: 'idea', label: 'I have an idea', hint: 'What should PartyNearMe do?' }
];

/**
 * Settings > Send feedback, as in the apps: what people love, what got in
 * their way, or what they wish PartyNearMe did. Only we can read it.
 */
export default function Feedback() {
	const navigate = useNavigate();
	const [kind, setKind] = useState<Kind>('love');
	const [text, setText] = useState('');
	const [busy, setBusy] = useState(false);

	async function send(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		try {
			await api.sendFeedback(kind, { body: text, screen: 'feedback' });
			toast.show('Thanks! We read every one.');
			await navigate(-1);
		} catch (err) {
			toast.show(err instanceof Error ? err.message : "Couldn't send that");
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<title>Send feedback · PartyNearMe</title>
			<PageHeader title="Send feedback" back />
			<form className={s.page} onSubmit={send}>
				<p className="muted">
					We read every message. Tell us what you love, what got in your way, or what you wish PartyNearMe did, and we'll keep making it
					better.
				</p>
				<div className={s.chips} role="radiogroup" aria-label="Kind of feedback">
					{kinds.map((k) => (
						<button key={k.id} type="button" className="chip" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}>
							{k.label}
						</button>
					))}
				</div>
				<textarea
					className="field"
					rows={6}
					maxLength={2000}
					aria-label="Your feedback"
					placeholder={kinds.find((k) => k.id === kind)?.hint}
					value={text}
					onChange={(e) => setText(e.target.value)}
				/>
				<button className="btn primary block" disabled={!text.trim() || busy}>
					{busy ? 'Sending…' : 'Send'}
				</button>
			</form>
		</>
	);
}
