import { api } from '#lib/api/client.js';
import type { OwnProfile } from '#lib/api/types.js';
import { Store } from '#lib/store.js';

/**
 * The signed-in user's own profile, loaded once per sign-in. The app layout
 * uses it to send a brand-new account through setup (username first, like the
 * apps) and to show moderator tools.
 */
class MeState extends Store {
	current: OwnProfile | null = null;
	#for: string | null = null;

	/** Loads the profile for [userId] unless it's already here; failures are retried on the next call. */
	async load(userId: string): Promise<void> {
		if (this.#for === userId && this.current) return;
		if (this.#for !== userId) {
			this.current = null;
			this.changed();
		}
		this.#for = userId;
		try {
			const profile = await api.me();
			if (this.#for === userId) {
				this.current = profile;
				this.changed();
			}
		} catch {
			// Offline or the server is waking up: screens load what they need themselves.
		}
	}

	set(profile: OwnProfile) {
		this.current = profile;
		this.changed();
	}
}

export const me = new MeState();
