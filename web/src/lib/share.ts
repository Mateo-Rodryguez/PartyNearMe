import { config } from '#lib/config.js';
import { interactions } from '#lib/interactions.js';

// Share links are the API's public pages (a preview, and a button into the
// app), the same links the phone apps share.
export const partyLink = (id: string) => `${config.apiBaseUrl}/e/${id}`;
export const postLink = (id: string) => `${config.apiBaseUrl}/p/${id}`;

/** The system share sheet where there is one, else copies the link. Returns what happened. */
export async function share(text: string, url: string, ids: { postId?: string; eventId?: string }): Promise<'shared' | 'copied' | null> {
	interactions.share(ids);
	if (navigator.share) {
		try {
			await navigator.share({ text, url });
			return 'shared';
		} catch {
			return null;
		}
	}
	try {
		await navigator.clipboard.writeText(url);
		return 'copied';
	} catch {
		return null;
	}
}
