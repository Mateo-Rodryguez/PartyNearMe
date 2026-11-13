import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { analytics, screenOf } from '#lib/analytics.js';
import { session } from '#lib/session.js';
import { useStore } from '#lib/store.js';
import { toast } from '#lib/toast.js';
import s from './Root.module.css';

/** Around every page: usage stats and the toast. */
export default function Root() {
	useStore(session);
	useStore(toast);
	const { pathname } = useLocation();
	const userId = session.userId;

	// Counted under the account while signed in; every page change is a screen view.
	useEffect(() => analytics.identify(userId), [userId]);
	useEffect(() => analytics.screenView(screenOf(pathname, userId)), [pathname, userId]);

	return (
		<>
			<Outlet />
			{toast.message && (
				<div className={s.toast} role="status">
					{toast.message}
				</div>
			)}
		</>
	);
}
