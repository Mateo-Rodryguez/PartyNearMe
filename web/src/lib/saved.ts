import { session } from '#lib/session.svelte.js';

/**
 * The last copy of what a screen showed, kept in this browser so the screen
 * fills at once next time while fresh data loads (the free server can take a
 * second or more). Per account, so a shared computer never shows someone
 * else's lists; signing out clears them (session.signOut).
 */
const PREFIX = 'pnm.saved.';
const MAX_AGE_MS = 7 * 24 * 3600_000;

function full(key: string) {
	return `${PREFIX}${session.userId ?? 'anon'}.${key}`;
}

export function readSaved<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(full(key));
		if (!raw) return null;
		const { at, value } = JSON.parse(raw) as { at: number; value: T };
		return Date.now() - at < MAX_AGE_MS ? value : null;
	} catch {
		return null;
	}
}

export function writeSaved(key: string, value: unknown) {
	try {
		localStorage.setItem(full(key), JSON.stringify({ at: Date.now(), value }));
	} catch {
		// Storage full or off: the screen just loads as before.
	}
}
