import { useEffect, useState } from 'react';
import { analytics, screenOf } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { Interest, OwnProfile } from '#lib/api/types.js';
import { currentLocation } from '#lib/location.js';
import { Icon } from '#lib/ui/Icon.js';
import s from './Setup.module.css';

const USERNAME = /^[a-z0-9_.]{3,30}$/;
// The wire values match the backend's HEARD_FROM.
const heardFrom = [
	['friend', 'A friend told me'],
	['shared_link', 'Someone shared a party or post'],
	['social_media', 'Social media'],
	['venue_or_event', 'At a venue or party'],
	['app_store', 'Browsing the app store'],
	['other', 'Somewhere else']
] as const;

/**
 * A new account's first minute, the same steps as the apps: pick a username
 * (so posts and chats have a name on them), then what you're into, how you
 * heard about us, and location with a reason before the browser asks. Only
 * the username is required.
 */
export function Setup({ profile, onDone }: { profile: OwnProfile; onDone: (profile: OwnProfile) => void }) {
	const [step, setStep] = useState(0);
	const [saved, setSaved] = useState<OwnProfile | null>(null);
	const [username, setUsername] = useState('');
	const [displayName, setDisplayName] = useState(profile.display_name ?? '');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [interests, setInterests] = useState<Interest[]>([]);
	const [picked, setPicked] = useState<number[]>([]);
	const [source, setSource] = useState<string | null>(null);

	useEffect(() => {
		api.interests().then(setInterests, () => undefined);
	}, []);

	const valid = USERNAME.test(username);
	// Each step is its own screen, so the funnel shows where people give up.
	useEffect(() => analytics.screenView(['profile_setup', 'onboarding_interests', 'onboarding_heard_from', 'onboarding_location'][step]), [step]);

	async function saveName(e: React.FormEvent) {
		e.preventDefault();
		if (!valid) return;
		setBusy(true);
		setError(null);
		try {
			setSaved(await api.updateMe({ username, ...(displayName.trim() ? { display_name: displayName.trim() } : {}) }));
			analytics.capture('account_created');
			setStep(1);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't save that");
		} finally {
			setBusy(false);
		}
	}

	async function saveInterests() {
		if (picked.length) {
			setBusy(true);
			setError(null);
			try {
				setSaved(await api.setInterests(picked));
			} catch (err) {
				setError(err instanceof Error ? err.message : "Couldn't save that");
				setBusy(false);
				return;
			}
			setBusy(false);
		}
		setStep(2);
	}

	function saveSource() {
		// Never holds up setup: sent in the background, and a failure is dropped.
		if (source) analytics.capture('heard_about_us', { source });
		if (source) void api.sendFeedback('heard_from', { body: source, screen: 'onboarding_heard_from' }).catch(() => undefined);
		setStep(3);
	}

	async function finish(askLocation: boolean) {
		let allowed = false;
		if (askLocation) {
			setBusy(true);
			allowed = (await currentLocation()) != null;
			setBusy(false);
		}
		analytics.capture('onboarding_completed', { interests: picked.length, location: allowed });
		analytics.screenView(screenOf(location.pathname, profile.id));
		if (saved) onDone(saved);
	}

	function toggle(id: number) {
		setPicked(picked.includes(id) ? picked.filter((i) => i !== id) : picked.length < 10 ? [...picked, id] : picked);
	}

	return (
		<main className={s.setup}>
			<div className={s.dots} aria-hidden="true">
				{[0, 1, 2, 3].map((i) => (
					<span key={i} className={`${i <= step ? s.on : ''} ${i === step ? s.current : ''}`} />
				))}
			</div>

			{step === 0 ? (
				<form className={s.step} onSubmit={saveName}>
					<div className={s.grow}>
						<p className={s.wordmark}>PartyNearMe</p>
						<h1>Pick a username</h1>
						<p className="muted">It's how people find you and see who posted.</p>
						<label>
							<span className="overline">Username</span>
							<input
								className="field"
								autoCapitalize="off"
								autoComplete="username"
								spellCheck={false}
								maxLength={30}
								placeholder="yourname"
								value={username}
								onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30))}
							/>
						</label>
						<p className={`muted ${s.small}`}>3 to 30 letters, numbers, dots or underscores.</p>
						<label>
							<span className="overline">Name (optional)</span>
							<input className="field" maxLength={50} autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
						</label>
						{error && (
							<p className="error" role="alert">
								{error}
							</p>
						)}
					</div>
					<button className="btn primary block" disabled={!valid || busy}>
						{busy ? 'Saving…' : 'Continue'}
					</button>
				</form>
			) : step === 1 ? (
				<div className={s.step}>
					<div className={s.grow}>
						<h1>What are you into?</h1>
						<p className="muted">Pick a few. Your feed and Parties show more of it, and you can change it in settings.</p>
						<div className={s.chips}>
							{interests.map((interest) => (
								<button key={interest.id} className="chip" aria-pressed={picked.includes(interest.id)} onClick={() => toggle(interest.id)}>
									{interest.name}
								</button>
							))}
						</div>
						{error && (
							<p className="error" role="alert">
								{error}
							</p>
						)}
					</div>
					<button className="btn primary block" disabled={busy} onClick={saveInterests}>
						{picked.length ? 'Continue' : 'Skip'}
					</button>
				</div>
			) : step === 2 ? (
				<div className={s.step}>
					<div className={s.grow}>
						<h1>How did you hear about PartyNearMe?</h1>
						<p className="muted">It helps us know what's working.</p>
						<div className={s.choices} role="radiogroup" aria-label="How you heard about us">
							{heardFrom.map(([wire, label]) => (
								<button key={wire} className="chip" role="radio" aria-checked={source === wire} onClick={() => setSource(wire)}>
									{label}
								</button>
							))}
						</div>
					</div>
					<button className="btn primary block" onClick={saveSource}>
						{source ? 'Continue' : 'Skip'}
					</button>
				</div>
			) : (
				<div className={`${s.step} ${s.center}`}>
					<div className={s.grow}>
						<span className={s.pin}>
							<Icon name="place" size={48} />
						</span>
						<h1>Find parties near you</h1>
						<p className="muted">PartyNearMe uses your location only while you use it, to show what's on nearby. It never keeps a history of where you go.</p>
					</div>
					<button className="btn primary block" disabled={busy} onClick={() => finish(true)}>
						{busy ? 'Asking…' : 'Allow location'}
					</button>
					<button className={`btn block ${s.link}`} disabled={busy} onClick={() => finish(false)}>
						Not now
					</button>
				</div>
			)}
		</main>
	);
}
