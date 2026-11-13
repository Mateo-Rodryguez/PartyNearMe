import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { analytics, isSharingUsage, setShareUsage } from '#lib/analytics.js';
import { api } from '#lib/api/client.js';
import type { AccountSettings, Interest, ListedPerson, OwnProfile } from '#lib/api/types.js';
import { config } from '#lib/config.js';
import { nameOf } from '#lib/format.js';
import { me as own } from '#lib/me.js';
import { shrink } from '#lib/photos.js';
import { prefs, type Theme } from '#lib/prefs.js';
import { session } from '#lib/session.js';
import { useStore } from '#lib/store.js';
import { toast } from '#lib/toast.js';
import { Avatar } from '#lib/ui/Avatar.js';
import { HEART_MEANING, RelationshipHeart } from '#lib/ui/RelationshipHeart.js';
import { Sheet } from '#lib/ui/Sheet.js';
import { Spinner } from '#lib/ui/Spinner.js';
import { PageHeader } from './PageHeader.js';
import s from './Settings.module.css';

// Same order and wording as the apps; only here do people see what each heart means.
const hearts = [
	{ id: null, label: "Don't show", look: 'Nothing next to your name' },
	{ id: 'taken', label: HEART_MEANING.taken, look: 'Full red heart' },
	{ id: 'talking', label: HEART_MEANING.talking, look: 'Half-filled heart' },
	{ id: 'single', label: HEART_MEANING.single, look: 'Outlined heart' }
] as const;
const themes: { id: Theme; label: string }[] = [
	{ id: 'system', label: 'Same as device' },
	{ id: 'night', label: 'Night' },
	{ id: 'day', label: 'Day' }
];

/** Profile, look, privacy, your stuff, and the account. */
export default function Settings() {
	useStore(prefs);
	const navigate = useNavigate();
	const [me, setMe] = useState<OwnProfile | null>(null);
	const [settings, setSettings] = useState<AccountSettings | null>(null);
	const [interests, setInterests] = useState<Interest[]>([]);
	const [blocked, setBlocked] = useState<ListedPerson[]>([]);
	const [displayName, setDisplayName] = useState('');
	const [username, setUsername] = useState('');
	const [bio, setBio] = useState('');
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [sharing, setSharing] = useState(isSharingUsage);
	const [leavingReason, setLeavingReason] = useState('');
	const [confirmText, setConfirmText] = useState('');
	const [deleteBusy, setDeleteBusy] = useState(false);
	const avatarInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		api.me().then((p) => {
			setMe(p);
			setDisplayName(p.display_name ?? '');
			setUsername(p.username ?? '');
			setBio(p.bio ?? '');
		}, () => undefined);
		api.settings().then(setSettings, () => undefined);
		api.interests().then(setInterests, () => undefined);
		api.blockedUsers().then(setBlocked, () => undefined);
	}, []);

	async function saveProfile(e: FormEvent) {
		e.preventDefault();
		setSaving(true);
		try {
			const saved = await api.updateMe({ display_name: displayName.trim(), username: username.trim().replace(/^@/, ''), bio: bio.trim() });
			setMe(saved);
			own.set(saved);
			toast.show('Saved');
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't save that");
		} finally {
			setSaving(false);
		}
	}

	async function setHeart(status: string | null) {
		try {
			setMe(await api.updateMe({ relationship_status: status }));
		} catch {
			toast.show("Couldn't save that");
		}
	}

	async function toggleInterest(id: number) {
		if (!me) return;
		const ids = me.interest_ids.includes(id) ? me.interest_ids.filter((i) => i !== id) : [...me.interest_ids, id];
		try {
			setMe(await api.setInterests(ids));
		} catch {
			toast.show("Couldn't save that");
		}
	}

	async function changeAvatar(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		try {
			await api.setAvatar(await api.uploadPhoto(await shrink(file)));
			toast.show('New picture shows once we check it');
		} catch (e) {
			toast.show(e instanceof Error ? e.message : "Couldn't upload that");
		}
	}

	async function setMessagesFrom(value: AccountSettings['messages_from']) {
		try {
			setSettings(await api.updateSettings({ messages_from: value }));
		} catch {
			toast.show("Couldn't save that");
		}
	}

	async function unblock(person: ListedPerson) {
		try {
			await api.block(person.id, false);
			setBlocked((list) => list.filter((b) => b.id !== person.id));
		} catch {
			toast.show("Couldn't unblock");
		}
	}

	async function signOut() {
		analytics.capture('signed_out');
		analytics.flush();
		await session.signOut();
		await navigate('/', { replace: true });
	}

	async function deleteAccount(e: FormEvent) {
		e.preventDefault();
		setDeleteBusy(true);
		try {
			// Why people leave is the strongest signal there is; it's optional and never blocks deleting.
			if (leavingReason.trim()) await api.sendFeedback('leaving', { body: leavingReason, screen: 'settings' }).catch(() => undefined);
			await api.deleteAccount();
			analytics.flush(); // Sends account_deleted, the strongest "didn't like it" there is.
			session.set(null);
			await navigate('/', { replace: true });
		} catch (err) {
			toast.show(err instanceof Error ? err.message : "Couldn't delete the account");
		} finally {
			setDeleteBusy(false);
		}
	}

	return (
		<>
			<title>Settings · PartyNearMe</title>
			<PageHeader title="Settings" back />
			{!me ? (
				<Spinner />
			) : (
				<div className={s.page}>
					<section>
						<h2>Profile</h2>
						<div className={s['avatar-row']}>
							<Avatar person={me} size={64} />
							<button className="btn" onClick={() => avatarInput.current?.click()}>
								Change picture
							</button>
							{me.avatar_url && (
								<button className="btn outline" onClick={() => api.removeAvatar().then(() => setMe((m) => m && { ...m, avatar_url: null }))}>
									Remove
								</button>
							)}
							<input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => changeAvatar(e.currentTarget.files)} />
						</div>
						<form onSubmit={saveProfile}>
							<label>
								<span className="overline">Name</span>
								<input className="field" maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
							</label>
							<label>
								<span className="overline">Username</span>
								<input className="field" maxLength={30} autoCapitalize="off" value={username} onChange={(e) => setUsername(e.target.value)} />
							</label>
							<label>
								<span className="overline">Bio</span>
								<textarea className="field" maxLength={300} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
							</label>
							<button className="btn primary" disabled={saving}>
								Save profile
							</button>
						</form>
					</section>

					<section>
						<h2>Heart on your profile</h2>
						<div className={s.hearts} role="radiogroup" aria-label="Relationship status">
							{hearts.map((h) => (
								<button
									key={h.label}
									className={s['heart-row']}
									role="radio"
									aria-checked={me.relationship_status === h.id || (!me.relationship_status && h.id === null)}
									onClick={() => setHeart(h.id)}
								>
									<span className={s['heart-icon']}>{h.id ? <RelationshipHeart status={h.id} size={26} /> : '—'}</span>
									<span>
										<strong>{h.label}</strong>
										<span className="muted">{h.look}</span>
									</span>
								</button>
							))}
						</div>
					</section>

					{interests.length > 0 && (
						<section>
							<h2>What you're into</h2>
							<p className="muted">Helps us show you parties you'll like.</p>
							<div className={s.chips}>
								{interests.map((interest) => (
									<button
										key={interest.id}
										className="chip"
										aria-pressed={me.interest_ids.includes(interest.id)}
										onClick={() => toggleInterest(interest.id)}
									>
										{interest.name}
									</button>
								))}
							</div>
						</section>
					)}

					<section>
						<h2>Look</h2>
						<div className={s.chips} role="radiogroup" aria-label="Theme">
							{themes.map((t) => (
								<button key={t.id} className="chip" role="radio" aria-checked={prefs.theme === t.id} onClick={() => prefs.setTheme(t.id)}>
									{t.label}
								</button>
							))}
						</div>
						<h3 className="overline">Distances in</h3>
						<div className={s.chips} role="radiogroup" aria-label="Distances in">
							<button className="chip" role="radio" aria-checked={!prefs.display.miles} onClick={() => prefs.setDisplay({ miles: false })}>
								Kilometres
							</button>
							<button className="chip" role="radio" aria-checked={prefs.display.miles} onClick={() => prefs.setDisplay({ miles: true })}>
								Miles
							</button>
						</div>
						<label className={s.toggle}>
							<span>
								<strong>Hide like counts</strong>
								<span className="muted">On other people's posts</span>
							</span>
							<input
								type="checkbox"
								role="switch"
								checked={prefs.display.hideLikeCounts}
								onChange={(e) => prefs.setDisplay({ hideLikeCounts: e.currentTarget.checked })}
							/>
						</label>
					</section>

					{settings && (
						<section>
							<h2>Who can message you</h2>
							<div className={s.chips} role="radiogroup" aria-label="Who can message you">
								<button className="chip" role="radio" aria-checked={settings.messages_from === 'everyone'} onClick={() => setMessagesFrom('everyone')}>
									Everyone
								</button>
								<button
									className="chip"
									role="radio"
									aria-checked={settings.messages_from === 'following'}
									onClick={() => setMessagesFrom('following')}
								>
									People I follow
								</button>
							</div>
						</section>
					)}

					{config.posthogKey && (
						<section>
							<h2>Privacy</h2>
							<label className={s.toggle}>
								<span>
									<strong>Share usage stats</strong>
									<span className="muted">Which pages and features get used, never what you post or say</span>
								</span>
								<input
									type="checkbox"
									role="switch"
									checked={sharing}
									onChange={(e) => {
										setSharing(e.currentTarget.checked);
										setShareUsage(e.currentTarget.checked);
									}}
								/>
							</label>
						</section>
					)}

					<section>
						<h2>Your stuff</h2>
						<Link className={s.row} to="/saved">
							Saved posts and parties
						</Link>
						{blocked.length > 0 && (
							<>
								<h3 className="overline">Blocked</h3>
								{blocked.map((person) => (
									<div key={person.id} className={`${s.row} ${s.person}`}>
										<Avatar person={person} size={32} />
										<span>{nameOf(person)}</span>
										<button className="btn outline" onClick={() => unblock(person)}>
											Unblock
										</button>
									</div>
								))}
							</>
						)}
					</section>

					{me.is_moderator && (
						<section>
							<h2>Moderation</h2>
							<Link className={s.row} to="/moderation">
								Reports to review
							</Link>
						</section>
					)}

					<section>
						<h2>Help us improve</h2>
						<Link className={s.row} to="/feedback">
							Send feedback
						</Link>
					</section>

					<section>
						<h2>About</h2>
						<a className={s.row} href={`${config.apiBaseUrl}/privacy`}>
							Privacy policy
						</a>
						<a className={s.row} href={`${config.apiBaseUrl}/terms`}>
							Terms
						</a>
					</section>

					<section className={s.account}>
						<p className="muted">Signed in as {session.current?.email ?? nameOf(me)}</p>
						<button className="btn block" onClick={signOut}>
							Sign out
						</button>
						<button className="btn block danger outline" onClick={() => setDeleting(true)}>
							Delete account
						</button>
					</section>
				</div>
			)}

			<Sheet open={deleting} onClose={() => setDeleting(false)} title="Delete your account?">
				<form className={s.delete} onSubmit={deleteAccount}>
					<p className="muted">Your profile, photos, parties and messages are deleted for good. This can't be undone.</p>
					<label>
						<span className="overline">Why are you leaving? (optional)</span>
						<textarea className="field" rows={3} maxLength={2000} value={leavingReason} onChange={(e) => setLeavingReason(e.target.value)} />
					</label>
					<label>
						<span className="overline">Type DELETE to confirm</span>
						<input className="field" autoCapitalize="characters" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
					</label>
					<button className="btn block danger" disabled={confirmText.trim() !== 'DELETE' || deleteBusy}>
						{deleteBusy ? 'Deleting…' : 'Delete for good'}
					</button>
					<button type="button" className="btn block outline" onClick={() => setDeleting(false)}>
						Keep my account
					</button>
				</form>
			</Sheet>
		</>
	);
}
