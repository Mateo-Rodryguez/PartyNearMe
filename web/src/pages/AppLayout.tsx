import { useEffect, useRef } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { analytics } from '#lib/analytics.js';
import { flush } from '#lib/interactions.js';
import { me } from '#lib/me.js';
import { session } from '#lib/session.js';
import { useStore } from '#lib/store.js';
import { unread } from '#lib/unread.js';
import { Icon, type IconName } from '#lib/ui/Icon.js';
import { Setup } from './Setup.js';
import s from './AppLayout.module.css';

// The same tabs as the apps; Search sits in the feed's header on phones.
const tabs: { href: string; label: string; icon: IconName; wideOnly?: boolean }[] = [
	{ href: '/feed', label: 'Home', icon: 'home' },
	{ href: '/nearby', label: 'Parties', icon: 'place' },
	{ href: '/search', label: 'Search', icon: 'search', wideOnly: true },
	{ href: '/new', label: 'Post', icon: 'add' },
	{ href: '/chat', label: 'Chat', icon: 'comment' },
	{ href: '/me', label: 'Profile', icon: 'person' }
];

/** Every signed-in page: the tab bar (a rail on wide screens) around the page. */
export default function AppLayout() {
	useStore(session);
	useStore(me);
	useStore(unread);
	const { pathname, search } = useLocation();
	const userId = session.userId;

	// A new account picks a username before anything else, as on the phones.
	useEffect(() => {
		if (userId) void me.load(userId);
	}, [userId]);

	// Counted once per visit, once the account is set up; first_run right after setup.
	const opened = useRef(false);
	const firstRun = useRef(false);
	useEffect(() => {
		const profile = me.current;
		if (!profile || opened.current) return;
		if (!profile.username) firstRun.current = true;
		else {
			opened.current = true;
			analytics.capture('app_opened', { first_run: firstRun.current });
		}
	}, [me.current]);

	// Send what the user looked at when they leave or switch tabs.
	useEffect(() => {
		void unread.check();
		const onHide = () => {
			if (document.visibilityState === 'hidden') void flush();
			else void unread.check();
		};
		document.addEventListener('visibilitychange', onHide);
		return () => document.removeEventListener('visibilitychange', onHide);
	}, []);

	// Signed out (or the session ran out): to sign in, then back here.
	if (!session.current) return <Navigate to={`/signin?next=${encodeURIComponent(pathname + search)}`} replace />;
	if (me.current && !me.current.username) return <Setup profile={me.current} onDone={(profile) => me.set(profile)} />;

	const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
	return (
		<div className={s.shell}>
			<nav className={s.nav} aria-label="Main">
				<Link to="/feed" className={s.brand} aria-label="PartyNearMe home">
					<img src="/icon.svg" alt="" width="32" height="32" />
					<span>PartyNearMe</span>
				</Link>
				{tabs.map((tab) => (
					<Link key={tab.href} to={tab.href} className={`${s.tab} ${tab.wideOnly ? s['wide-only'] : ''}`} aria-current={current(tab.href) ? 'page' : undefined}>
						<span className={s.glyph}>
							<Icon name={tab.icon} size={26} />
							{tab.href === '/chat' && unread.messages > 0 && <span className={s.dot} aria-label={`${unread.messages} unread`} />}
						</span>
						<span>{tab.label}</span>
					</Link>
				))}
			</nav>
			<main className={s.main}>
				<Outlet />
			</main>
		</div>
	);
}
