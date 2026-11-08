import { api } from '#lib/api/client.js';

/** The bell's and the chat tab's counts, checked when the app opens and when the tab comes back. */
class Unread {
	notifications = $state(0);
	messages = $state(0);

	async check() {
		const [notifications, messages] = await Promise.allSettled([api.unreadNotifications(), api.unreadMessages()]);
		// On failure, keep the last count.
		if (notifications.status === 'fulfilled') this.notifications = notifications.value;
		if (messages.status === 'fulfilled') this.messages = messages.value;
	}
}

export const unread = new Unread();
