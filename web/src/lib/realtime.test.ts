import { describe, expect, it } from 'vitest';
import { isoUtc, parseInsert } from './realtime.js';

describe('parseInsert', () => {
	it('reads a new message from a postgres_changes frame', () => {
		const frame = {
			event: 'postgres_changes',
			payload: { data: { type: 'INSERT', record: { id: 42, conversation_id: 'c', sender_id: 's', body: 'hi', created_at: '2026-10-12 19:00:00.123+00', event_id: null } } }
		};
		expect(parseInsert(JSON.stringify(frame))).toEqual({
			id: '42', conversation_id: 'c', sender_id: 's', body: 'hi', created_at: '2026-10-12T19:00:00.123Z', event_id: null
		});
	});
	it('ignores everything else', () => {
		expect(parseInsert('{"event":"phx_reply"}')).toBeNull();
		expect(parseInsert('not json')).toBeNull();
	});
	it('makes Postgres times ISO', () => expect(isoUtc('2026-10-12 19:00:00+02')).toBe('2026-10-12T19:00:00+02:00'));
});
