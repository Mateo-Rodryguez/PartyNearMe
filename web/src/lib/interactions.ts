import { api } from '#lib/api/client.js';
import type { Interaction } from '#lib/api/types.js';

// What the user sees and does, sent in batches for ranking (as the phone apps
// do): each post's impression counts once per visit, and short glances aren't sent.

const BATCH = 20;
const MIN_DWELL_MS = 800;
const MAX_DWELL_MS = 10 * 60 * 1000;
let pending: Interaction[] = [];
const seen = new Set<string>();

function add(event: Interaction, now = false) {
	pending.push(event);
	if (now || pending.length >= BATCH) void flush();
}

export const interactions = {
	impression(postId: string) {
		if (seen.has(postId)) return;
		seen.add(postId);
		add({ kind: 'impression', post_id: postId });
	},
	dwell(postId: string, ms: number) {
		if (ms >= MIN_DWELL_MS) add({ kind: 'dwell', post_id: postId, dwell_ms: Math.min(Math.round(ms), MAX_DWELL_MS) });
	},
	open: (postId: string) => add({ kind: 'open', post_id: postId }),
	share: (ids: { postId?: string; eventId?: string }) => add({ kind: 'share', post_id: ids.postId, event_id: ids.eventId })
};

/** Sends what is waiting. Failures are dropped: this data is never worth an error. */
export async function flush() {
	const batch = pending;
	pending = [];
	for (let i = 0; i < batch.length; i += 50) {
		await api.logInteractions(batch.slice(i, i + 50)).catch(() => undefined);
	}
}
