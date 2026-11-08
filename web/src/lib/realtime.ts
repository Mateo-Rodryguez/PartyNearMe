import { config } from '#lib/config.js';
import type { Message } from '#lib/api/types.js';
import { session, SignedOutError } from '#lib/session.svelte.js';

// Live chat through Supabase Realtime (the Phoenix channel protocol), as the
// apps do. The socket signs in with the user's own token, so row-level security
// decides which messages arrive, exactly as for the API.

const HEARTBEAT_MS = 25_000;

/** Postgres sends "2026-10-12 19:00:00.123456+00"; the app expects ISO-8601. */
export function isoUtc(value: string): string {
	let s = value.replace(' ', 'T');
	if (/[+-]\d{2}$/.test(s)) s += ':00';
	return s.replace('+00:00', 'Z');
}

/** The new message from a postgres_changes INSERT frame, or null for anything else. */
export function parseInsert(text: string): Message | null {
	let frame: { event?: string; payload?: { data?: Record<string, unknown> } };
	try {
		frame = JSON.parse(text);
	} catch {
		return null;
	}
	if (frame.event !== 'postgres_changes') return null;
	const data = frame.payload?.data;
	if (!data || (data.type !== 'INSERT' && data.eventType !== 'INSERT')) return null;
	const row = (data.record ?? data.new) as Record<string, unknown> | undefined;
	const str = (v: unknown) => (v == null ? null : String(v));
	const id = str(row?.id);
	const conversationId = str(row?.conversation_id);
	const senderId = str(row?.sender_id);
	const body = str(row?.body);
	const createdAt = str(row?.created_at);
	if (!id || !conversationId || !senderId || body == null || !createdAt) return null;
	return { id, conversation_id: conversationId, sender_id: senderId, body, created_at: isoUtc(createdAt), event_id: str(row?.event_id) };
}

/**
 * Calls [onMessage] with new messages in one conversation, or in all the user's
 * chats when [conversationId] is null. Reconnects by itself; returns a stop function.
 */
export function listen(conversationId: string | null, onMessage: (m: Message) => void): () => void {
	const topic = `realtime:messages:${conversationId ?? 'all'}`;
	const url = `${config.supabaseUrl.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${config.supabaseKey}&vsn=1.0.0`;
	let socket: WebSocket | null = null;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let failures = 0;
	let stopped = false;

	const connect = async () => {
		let token: string;
		try {
			token = await session.accessToken();
		} catch (e) {
			if (e instanceof SignedOutError) return;
			schedule();
			return;
		}
		if (stopped) return;
		const ws = new WebSocket(url);
		socket = ws;
		let ref = 1;
		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					topic,
					event: 'phx_join',
					ref: '1',
					join_ref: '1',
					payload: {
						config: {
							broadcast: { self: false },
							presence: { key: '' },
							postgres_changes: [
								{ event: 'INSERT', schema: 'public', table: 'messages', ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}) }
							]
						},
						access_token: token
					}
				})
			);
			heartbeat = setInterval(async () => {
				ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }));
				// Realtime drops the channel when the token expires, so hand it fresh ones.
				const fresh = await session.accessToken().catch(() => token);
				if (fresh !== token) {
					token = fresh;
					ws.send(JSON.stringify({ topic, event: 'access_token', payload: { access_token: fresh } }));
				}
			}, HEARTBEAT_MS);
		};
		ws.onmessage = (e) => {
			failures = 0;
			const message = parseInsert(String(e.data));
			if (message) onMessage(message);
		};
		ws.onclose = () => {
			clearInterval(heartbeat);
			if (!stopped) schedule();
		};
	};

	const schedule = () => {
		clearTimeout(retry);
		retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)));
	};

	void connect();
	return () => {
		stopped = true;
		clearTimeout(retry);
		clearInterval(heartbeat);
		socket?.close();
	};
}
