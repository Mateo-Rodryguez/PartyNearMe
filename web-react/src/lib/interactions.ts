import { api } from '#lib/api/client.js';
import type { Interaction, Placement } from '#lib/api/types.js';

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

/** A placement as interaction fields; no serve id unless it came from a ranked list. */
const at = (where?: Placement) =>
	where ? { surface: where.surface, serve_id: where.serve_id ?? undefined, position: where.position } : {};

export const interactions = {
	/** On screen in a list; once per item and list per visit. `where` says which list and where in it. */
	impression(postId: string, where?: Placement) {
		const key = `${where?.surface ?? ''}:${postId}`;
		if (seen.has(key)) return;
		seen.add(key);
		add({ kind: 'impression', post_id: postId, ...at(where) });
	},
	eventImpression(eventId: string, where: Placement) {
		const key = `${where.surface}:${eventId}`;
		if (seen.has(key)) return;
		seen.add(key);
		add({ kind: 'impression', event_id: eventId, ...at(where) });
	},
	dwell(postId: string, ms: number, where?: Placement) {
		if (ms >= MIN_DWELL_MS) {
			add({ kind: 'dwell', post_id: postId, dwell_ms: Math.min(Math.round(ms), MAX_DWELL_MS), ...at(where), position: undefined });
		}
	},
	open: (postId: string) => add({ kind: 'open', post_id: postId }),
	openEvent: (eventId: string, where: Placement) => add({ kind: 'open', event_id: eventId, ...at(where) }),
	share: (ids: { postId?: string; eventId?: string }) => add({ kind: 'share', post_id: ids.postId, event_id: ids.eventId })
};

/** What is waiting to be sent, for tests. */
export const waiting = () => [...pending];

/** Sends what is waiting. Failures are dropped: this data is never worth an error. */
export async function flush() {
	const batch = pending;
	pending = [];
	for (let i = 0; i < batch.length; i += 50) {
		await api.logInteractions(batch.slice(i, i + 50)).catch(() => undefined);
	}
}
