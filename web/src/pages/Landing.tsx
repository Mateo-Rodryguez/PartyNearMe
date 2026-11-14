import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { session } from '#lib/session.js';
import { useStore } from '#lib/store.js';
import s from './Landing.module.css';

export default function Landing() {
	useStore(session);
	const navigate = useNavigate();
	// Signed in already: straight to the feed.
	useEffect(() => {
		if (session.current) navigate('/feed', { replace: true });
	}, [session.current, navigate]);

	return (
		<main className={s.landing}>
			<title>PartyNearMe: find parties near you tonight</title>
			<meta property="og:title" content="PartyNearMe" />
			<meta property="og:description" content="See what's on tonight, find parties near you, and share the night." />
			<meta property="og:type" content="website" />
			<div className={s.glow} aria-hidden="true" />
			<section className={s.hero}>
				<img src="/icon.svg" alt="" width="72" height="72" className={s.logo} />
				<h1 className={s.wordmark}>PartyNearMe</h1>
				<p className={s.lead}>See what's on tonight, find parties near you, and share the night with your friends.</p>
				<div className={s.cta}>
					<Link className="btn primary" to="/signin?mode=signup">
						Create an account
					</Link>
					<Link className="btn outline" to="/signin">
						Sign in
					</Link>
				</div>
			</section>
			<section className={s.points} aria-label="What you can do">
				<div>
					<h2>What's on tonight</h2>
					<p className="muted">Parties near you, tonight and this weekend, with who's going.</p>
				</div>
				<div>
					<h2>RSVP with friends</h2>
					<p className="muted">Say you're going, see which friends are in, and get the details.</p>
				</div>
				<div>
					<h2>Share the night</h2>
					<p className="muted">Post photos from the party and relive it with everyone who was there.</p>
				</div>
			</section>
			<footer className="muted">
				<a href="https://partynearme-api.onrender.com/privacy">Privacy</a> · <a href="https://partynearme-api.onrender.com/terms">Terms</a>
			</footer>
		</main>
	);
}
