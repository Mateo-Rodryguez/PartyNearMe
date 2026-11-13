import { api } from '#lib/api/client.js';
import { Store } from '#lib/store.js';

/** The bell's and the chat tab's counts, checked when the app opens and when the tab comes back. */
class Unread extends Store {
	notifications = 0;
	messages = 0;

	async check() {
		const [notifications, messages] = await Promise.allSettled([api.unreadNotifications(), api.unreadMessages()]);
		// On failure, keep the last count.
		if (notifications.status === 'fulfilled') this.notifications = notifications.value;
		if (messages.status === 'fulfilled') this.messages = messages.value;
		this.changed();
	}

	/** After the notifications page marks them seen. */
	clearNotifications() {
		this.notifications = 0;
		this.changed();
	}
}

export const unread = new Unread();
