import { config } from '#lib/config.js';

/**
 * Product analytics: what people use, skip and get stuck on, sent to PostHog
 * (EU) in batches. The same contract as the apps (docs/analytics.md): the same
 * event names and properties, with platform "web", so one dashboard covers all
 * three.
 *
 * Privacy: signed-in use is counted under the account's id and nothing else
 * that identifies anyone: no names, emails, locations, or anything people post
 * or write, no person profiles, no cookies. Before sign-in, events carry a
 * random id made fresh each visit and never stored. Off when the person turned
 * "Share usage stats" off in Settings.
 */

type Value = string | number | boolean | null | undefined;
type Properties = Record<string, Value>;

/** Quiet this long and the next event starts a new session (PostHog's own default). */
const SESSION_GAP_MS = 30 * 60 * 1000;
const SHARE_KEY = 'pnm.shareUsage';
/** Waiting events go out at most this long after the first one. */
const FLUSH_AFTER_MS = 10_000;

/**
 * Actions counted straight from a successful API call, so every page that does
 * them is covered. Keep in step with docs/analytics.md and the apps' lists.
 */
export const ACTIONS: Record<string, string> = {
	'PUT /posts/:id/like': 'post_liked',
	'DELETE /posts/:id/like': 'post_unliked',
	'PUT /posts/:id/save': 'post_saved',
	'DELETE /posts/:id/save': 'post_unsaved',
	'PATCH /posts/:id': 'caption_edited',
	'DELETE /posts/:id': 'post_deleted',
	'PUT /posts/:id/tags': 'people_tagged',
	'DELETE /posts/:id/tags/me': 'tag_removed',
	'DELETE /comments/:id': 'comment_deleted',
	'PUT /events/:id/save': 'party_saved',
	'DELETE /events/:id/save': 'party_unsaved',
	'PATCH /events/:id': 'party_edited',
	'DELETE /events/:id': 'party_deleted',
	'PUT /events/:id/cover': 'party_cover_set',
	'POST /events/:id/guests/:id/approve': 'guest_approved',
	'DELETE /events/:id/guests/:id': 'guest_removed',
	'PUT /users/:id/follow': 'user_followed',
	'DELETE /users/:id/follow': 'user_unfollowed',
	'PUT /users/:id/block': 'user_blocked',
	'DELETE /users/:id/block': 'user_unblocked',
	'POST /reports': 'report_sent',
	'POST /conversations': 'chat_started',
	'POST /conversations/:id/messages': 'message_sent',
	'PATCH /me': 'profile_edited',
	'PUT /me/avatar': 'avatar_set',
	'PUT /me/interests': 'interests_set',
	'PATCH /me/settings': 'account_setting_changed',
	'DELETE /me': 'account_deleted'
};

/** "PUT /posts/:id/like" for a call to /posts/0b9e.../like?x=1: ids become ":id", so calls group by what they do, never by whom. */
export function endpointOf(method: string, path: string): string {
	const segments = path
		.split('?')[0]
		.split('/')
		.map((s) => (s.length >= 16 || /^\d+$/.test(s) ? ':id' : s));
	return `${method.toUpperCase()} ${segments.join('/')}`;
}

/** A random, time-ordered id (UUID version 7), the kind PostHog expects for sessions. */
export function uuidV7(ms: number, random: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): string {
	const b = random.slice(0, 16);
	for (let i = 0; i < 6; i++) b[i] = Math.floor(ms / 2 ** (40 - 8 * i)) & 0xff;
	b[6] = (b[6] & 0x0f) | 0x70;
	b[8] = (b[8] & 0x3f) | 0x80;
	const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Which screen a web address is, in the apps' screen names (docs/analytics.md). */
export function screenOf(path: string, ownId: string | null): string | null {
	const p = path.replace(/\/+$/, '') || '/';
	const rules: [RegExp, string][] = [
		[/^\/feed$/, 'home'],
		[/^\/nearby$/, 'nearby'],
		[/^\/new$/, 'new_post'],
		[/^\/host$/, 'new_party'],
		[/^\/chat$/, 'inbox'],
		[/^\/chat\/[^/]+$/, 'chat'],
		[/^\/me$/, 'my_profile'],
		[/^\/e\/[^/]+$/, 'party'],
		[/^\/e\/[^/]+\/edit$/, 'edit_party'],
		[/^\/e\/[^/]+\/guests$/, 'guest_list'],
		[/^\/e\/[^/]+\/invite$/, 'invite'],
		[/^\/p\/[^/]+$/, 'post'],
		[/^\/u\/[^/]+\/followers$/, 'followers'],
		[/^\/u\/[^/]+\/following$/, 'following'],
		[/^\/notifications$/, 'notifications'],
		[/^\/settings$/, 'settings'],
		[/^\/saved$/, 'saved'],
		[/^\/search$/, 'search'],
		[/^\/moderation$/, 'moderation'],
		[/^\/feedback$/, 'feedback'],
		[/^\/signin$/, 'sign_in']
	];
	if (/^\/u\/[^/]+$/.test(p)) return ownId && p === `/u/${ownId}` ? 'my_profile' : 'profile';
	return rules.find(([re]) => re.test(p))?.[1] ?? null;
}

export class Analytics {
	#pending: object[] = [];
	#timer: ReturnType<typeof setTimeout> | undefined;
	#userId: string | null = null;
	#anonymousId: string;
	#sessionId: string | null = null;
	#lastEventAt = 0;
	#visibleSince: number | null = null;
	#hiddenAt: number | null = null;
	/** The screen on show, sent with every event so struggles have a place. */
	screen: string | null = null;
	#screenSince: number | null = null;

	constructor(
		private key: string | null,
		private enabled: () => boolean,
		private post: (body: string) => void,
		private version = 'dev',
		private now: () => number = Date.now,
		private batchSize = 20
	) {
		this.#anonymousId = uuidV7(now());
	}

	get active() {
		return this.key != null && this.enabled();
	}

	/** Counts what follows as this account's. */
	identify(userId: string | null) {
		if (userId === this.#userId) return;
		if (!userId) this.reset();
		else this.#userId = userId;
	}

	/** On sign-out: stop counting as that account, and drop anything not sent. */
	reset() {
		this.#userId = null;
		this.#anonymousId = uuidV7(this.now());
		this.#sessionId = null;
		this.#pending = [];
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}

	/** Records [event] with a few plain properties (counts, kinds, choices); never personal data. */
	capture(event: string, properties: Properties = {}) {
		if (!this.active) return;
		const now = this.now();
		if (!this.#sessionId || now - this.#lastEventAt > SESSION_GAP_MS) this.#sessionId = uuidV7(now);
		this.#lastEventAt = now;
		const props: Record<string, Value> = {
			// Events only: no person profile is built for anyone.
			$process_person_profile: false,
			$session_id: this.#sessionId,
			platform: 'web',
			signed_in: this.#userId != null,
			$app_version: this.version
		};
		if (this.screen) props.$screen_name = this.screen;
		for (const [name, value] of Object.entries(properties)) if (value != null) props[name] = value;
		this.#pending.push({ event, distinct_id: this.#userId ?? this.#anonymousId, timestamp: new Date(now).toISOString(), properties: props });
		if (this.#pending.length >= this.batchSize) this.flush();
		// A tab can be closed or frozen without warning, so nothing waits long.
		else this.#timer ??= setTimeout(() => this.flush(), FLUSH_AFTER_MS);
	}

	/** Counts a screen being opened, with how long the one before was open. */
	screenView(name: string | null) {
		if (!name || name === this.screen) return;
		const now = this.now();
		const from = this.screen;
		const seconds = this.#screenSince != null ? Math.round((now - this.#screenSince) / 1000) : null;
		this.screen = name;
		this.#screenSince = now;
		this.capture('$screen', { from, from_seconds: seconds });
	}

	/** The tab came to the front. A return after a long break counts as opening the app again. */
	visible() {
		const now = this.now();
		const away = this.#hiddenAt != null ? now - this.#hiddenAt : null;
		this.#visibleSince = now;
		this.#hiddenAt = null;
		this.#screenSince = now;
		if (away != null && away > SESSION_GAP_MS) this.capture('app_opened', { resumed: true });
	}

	/** The tab went to the back or is closing: records how long it was used, then sends what's waiting. */
	hidden() {
		const now = this.now();
		const since = this.#visibleSince;
		this.#visibleSince = null;
		this.#hiddenAt = now;
		if (since != null) this.capture('app_backgrounded', { seconds: Math.round((now - since) / 1000) });
		this.flush();
	}

	/** Sees every API call: a failure is a struggle worth knowing about, some successes are actions. */
	apiResult(method: string, path: string, status: number) {
		const endpoint = endpointOf(method, path);
		if (status >= 200 && status < 300) {
			const action = ACTIONS[endpoint];
			if (action) this.capture(action);
		} else if (status !== 410) {
			// 410 is the feed asking to start again from the top, which is normal.
			this.capture('api_error', { endpoint, status });
		}
	}

	/** Sends what is waiting; failures are dropped, analytics is never worth an error. */
	flush() {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		const batch = this.#pending;
		this.#pending = [];
		if (!batch.length || !this.key || !this.active) return;
		try {
			this.post(JSON.stringify({ api_key: this.key, batch }));
		} catch {
			// Dropped.
		}
	}
}

function shareUsage(): boolean {
	try {
		return localStorage.getItem(SHARE_KEY) !== 'off';
	} catch {
		return true;
	}
}

/** Turns "Share usage stats" on or off for this browser. */
export function setShareUsage(on: boolean) {
	if (!on) analytics.capture('usage_stats_turned_off');
	try {
		if (on) localStorage.removeItem(SHARE_KEY);
		else localStorage.setItem(SHARE_KEY, 'off');
	} catch {
		// Lasts for this visit only.
	}
	if (on) analytics.capture('usage_stats_turned_on');
	else analytics.reset();
}

export const isSharingUsage = shareUsage;

export const analytics = new Analytics(
	config.posthogKey,
	shareUsage,
	// text/plain keeps it a simple request (no preflight), and keepalive lets the
	// last batch go out as the tab closes.
	(body) =>
		void fetch(`${config.posthogHost}/batch/`, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(
			() => undefined
		),
	config.version
);
