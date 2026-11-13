import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { finishBrowserSignIn } from '#lib/api/auth.js';
import { session } from '#lib/session.js';
import { Spinner } from '#lib/ui/Spinner.js';
import s from './Callback.module.css';

/** Google sends the browser back here with a code to swap for a session. */
export default function Callback() {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	// The code works once; never swap it twice.
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		let method = 'google';
		try {
			method = sessionStorage.getItem('pnm.method') ?? method;
		} catch {
			// Google, the usual one.
		}
		finishBrowserSignIn(location.href).then(
			(signedIn) => {
				analytics.capture('auth_succeeded', { method, action: 'sign_in' });
				session.set(signedIn);
				let next = '/feed';
				try {
					next = sessionStorage.getItem('pnm.next') ?? next;
					sessionStorage.removeItem('pnm.next');
				} catch {
					// Feed it is.
				}
				navigate(next.startsWith('/') && !next.startsWith('//') ? next : '/feed', { replace: true });
			},
			(e: unknown) => {
				const message = e instanceof Error ? e.message : 'Sign-in failed';
				setError(message);
				// Closing the provider's page comes back without a code: that's a change of mind, not a failure.
				if (/access_denied|cancel/i.test(location.href)) analytics.capture('auth_cancelled', { method });
				else analytics.capture('auth_failed', { method, action: 'sign_in', reason: message });
			}
		);
	}, [navigate]);

	return (
		<main className={s.main}>
			<title>Signing in · PartyNearMe</title>
			{error ? (
				<>
					<h1>That didn't work</h1>
					<p className="error">{error}</p>
					<Link className="btn primary" to="/signin">
						Back to sign in
					</Link>
				</>
			) : (
				<Spinner label="Signing you in" />
			)}
		</main>
	);
}
