import { api } from '#lib/api/client.js';

/** The bell's count, checked when the app opens and when the tab comes back. */
class Unread {
	notifications = $state(0);

	async check() {
		try {
			this.notifications = await api.unreadNotifications();
		} catch {
			// Keep the last count.
		}
	}
}

export const unread = new Unread();
