import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { analytics } from '#lib/analytics.js';
import * as auth from '#lib/api/auth.js';
import { config } from '#lib/config.js';
import { session } from '#lib/session.js';
import { useStore } from '#lib/store.js';
import s from './SignIn.module.css';

type Mode = 'signin' | 'signup' | 'reset';
const titles: Record<Mode, string> = { signin: 'Welcome back', signup: 'Join the party', reset: 'Forgot your password?' };

export default function SignIn() {
	useStore(session);
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [google, setGoogle] = useState(false);
	const [apple, setApple] = useState(false);

	/** Only paths on this site, so a link can't send people elsewhere after signing in. */
	const raw = params.get('next') ?? '/feed';
	const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/feed';

	useEffect(() => {
		if (session.current) navigate(next, { replace: true });
	}, [session.current, next, navigate]);

	useEffect(() => {
		auth.providers().then(
			(list) => {
				setGoogle(list.includes('google'));
				// People who joined on iPhone with Apple have no password, so they sign in here the same way.
				setApple(config.appleOnWeb && list.includes('apple'));
			},
			() => undefined
		);
	}, []);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		setNotice(null);
		const action = mode === 'reset' ? 'reset_password' : mode === 'signup' ? 'sign_up' : 'sign_in';
		try {
			if (mode === 'reset') {
				await auth.recover(email.trim());
				setNotice('If that email has an account, a link to choose a new password is on its way.');
				analytics.capture('auth_succeeded', { method: 'email', action, check_email: true });
			} else if (mode === 'signup') {
				const created = await auth.signUp(email.trim(), password);
				analytics.capture('auth_succeeded', { method: 'email', action, check_email: !created });
				if (created) session.set(created);
				else setNotice('Check your email and tap the link to finish signing up.');
			} else {
				const signedIn = await auth.signIn(email.trim(), password);
				analytics.capture('auth_succeeded', { method: 'email', action });
				session.set(signedIn);
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Something went wrong';
			setError(message);
			// The message shown, never what was typed.
			analytics.capture('auth_failed', { method: 'email', action, reason: message });
		} finally {
			setBusy(false);
		}
	}

	async function withProvider(provider: 'google' | 'apple') {
		try {
			sessionStorage.setItem('pnm.next', next);
			sessionStorage.setItem('pnm.method', provider);
		} catch {
			// The callback falls back to the feed.
		}
		analytics.flush(); // The page is about to go to the provider.
		location.href = await auth.authorizeUrl(provider, `${location.origin}/auth/callback`);
	}

	return (
		<main className={s.main}>
			<title>{`${titles[mode]} · PartyNearMe`}</title>
			<div className={s.glow} aria-hidden="true" />
			<form onSubmit={submit} className={s.card}>
				<Link to="/" className={s.brand}>
					<img src="/icon.svg" alt="" width="48" height="48" />
					<span>PartyNearMe</span>
				</Link>
				<h1>{titles[mode]}</h1>

				{apple && mode !== 'reset' && (
					<button type="button" className={`btn block ${s.apple}`} onClick={() => withProvider('apple')}>
						<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
							<path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.76-.96 2.79 1.02.08 2.05-.52 2.68-1.27z" />
						</svg>
						Continue with Apple
					</button>
				)}
				{google && mode !== 'reset' && (
					<>
						<button type="button" className={`btn block ${s.google}`} onClick={() => withProvider('google')}>
							<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
								<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
								<path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
								<path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
								<path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
							</svg>
							Continue with Google
						</button>
						<p className={`${s.or} muted`}>
							<span>or with email</span>
						</p>
					</>
				)}

				<label>
					<span className="visually-hidden">Email</span>
					<input className="field" type="email" autoComplete="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
				</label>
				{mode !== 'reset' && (
					<label>
						<span className="visually-hidden">Password</span>
						<input
							className="field"
							type="password"
							autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
							placeholder="Password"
							minLength={mode === 'signup' ? 8 : undefined}
							required
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</label>
				)}

				{error && (
					<p className="error" role="alert">
						{error}
					</p>
				)}
				{notice && <p role="status">{notice}</p>}

				<button className="btn primary block" disabled={busy}>
					{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send link'}
				</button>

				<div className={`${s.switch} muted`}>
					{mode === 'signin' ? (
						<>
							<button type="button" className={s.link} onClick={() => setMode('reset')}>
								Forgot password?
							</button>
							<button type="button" className={s.link} onClick={() => setMode('signup')}>
								New here? <strong>Create an account</strong>
							</button>
						</>
					) : (
						<button type="button" className={s.link} onClick={() => setMode('signin')}>
							Have an account? <strong>Sign in</strong>
						</button>
					)}
				</div>
				{mode === 'signup' && (
					<p className={`${s.small} muted`}>
						By signing up you agree to the <a href="https://partynearme-api.onrender.com/terms">terms</a> and{' '}
						<a href="https://partynearme-api.onrender.com/privacy">privacy policy</a>. You must be 18 or older.
					</p>
				)}
			</form>
		</main>
	);
}
