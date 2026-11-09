import * as auth from '#lib/api/auth.js';
import type { Session } from '#lib/api/auth.js';

const KEY = 'pnm.session';
/** Refresh this long before the token runs out. */
const MARGIN_SECONDS = 60;

function load(): Session | null {
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? (JSON.parse(raw) as Session) : null;
	} catch {
		return null;
	}
}

/** Thrown when there's no session any more; the layout sends the user to sign in. */
export class SignedOutError extends Error {
	constructor() {
		super('Signed out');
	}
}

/**
 * The signed-in user, kept in localStorage so it survives reloads, and shared
 * between tabs: signing out in one signs out everywhere.
 */
class SessionState {
	current = $state<Session | null>(null);
	#refreshing: Promise<string> | null = null;
	#started = false;

	/** Reads the saved session; call once in the browser. */
	start() {
		if (this.#started) return;
		this.#started = true;
		this.current = load();
		addEventListener('storage', (e) => {
			if (e.key === KEY) this.current = load();
		});
	}

	get userId() {
		return this.current?.userId ?? null;
	}

	set(session: Session | null) {
		this.current = session;
		try {
			if (session) localStorage.setItem(KEY, JSON.stringify(session));
			else localStorage.removeItem(KEY);
		} catch {
			// Private mode without storage: the session lasts as long as the tab.
		}
	}

	/** A token valid for at least another minute. */
	async accessToken(): Promise<string> {
		const current = this.current;
		if (!current) throw new SignedOutError();
		if (current.expiresAt - Date.now() / 1000 > MARGIN_SECONDS) return current.accessToken;
		return this.refresh(current.accessToken);
	}

	/** One refresh at a time; [stale] is the token that just failed. */
	refresh(stale: string): Promise<string> {
		this.#refreshing ??= (async () => {
			try {
				const current = this.current;
				if (!current) throw new SignedOutError();
				if (current.accessToken !== stale && current.expiresAt - Date.now() / 1000 > MARGIN_SECONDS) {
					return current.accessToken;
				}
				const renewed = await auth.refresh(current.refreshToken);
				this.set(renewed);
				if (!renewed) throw new SignedOutError();
				return renewed.accessToken;
			} finally {
				this.#refreshing = null;
			}
		})();
		return this.#refreshing;
	}

	async signOut() {
		const current = this.current;
		this.set(null);
		// Saved copies of screens (see saved.ts and the feed) aren't left for the next person.
		try {
			for (const key of Object.keys(localStorage)) if (/^pnm\.(saved\.|feed\.|area$)/.test(key)) localStorage.removeItem(key);
		} catch {
			// Nothing to clear.
		}
		if (current) await auth.signOut(current.accessToken);
	}
}

export const session = new SessionState();
