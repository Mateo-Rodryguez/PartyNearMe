import { describe, expect, it } from 'vitest';
import { Analytics, endpointOf, screenOf, uuidV7 } from './analytics.js';

function setup(enabled = true) {
	const sent: { api_key: string; batch: { event: string; distinct_id: string; properties: Record<string, unknown> }[] }[] = [];
	let now = 1_700_000_000_000;
	const a = new Analytics('phc_test', () => enabled, (body) => sent.push(JSON.parse(body)), 'abc1234', () => now, 100);
	return { a, sent, tick: (ms: number) => (now += ms) };
}

describe('Analytics', () => {
	it('sends events in a batch with the shared properties', () => {
		const { a, sent } = setup();
		a.identify('user-1');
		a.screenView('home');
		a.capture('post_created', { photos: 2, nothing: null });
		a.flush();
		expect(sent).toHaveLength(1);
		expect(sent[0].api_key).toBe('phc_test');
		const [screen, post] = sent[0].batch;
		expect(screen.event).toBe('$screen');
		expect(post).toMatchObject({ event: 'post_created', distinct_id: 'user-1' });
		expect(post.properties).toMatchObject({
			platform: 'web', signed_in: true, $app_version: 'abc1234', $screen_name: 'home', $process_person_profile: false, photos: 2
		});
		expect(post.properties).not.toHaveProperty('nothing');
	});

	it('sends nothing when usage stats are off', () => {
		const { a, sent } = setup(false);
		a.capture('app_opened');
		a.flush();
		expect(sent).toHaveLength(0);
	});

	it('times screens and starts a new session after 30 quiet minutes', () => {
		const { a, sent, tick } = setup();
		a.screenView('home');
		tick(12_000);
		a.screenView('party');
		tick(31 * 60_000);
		a.capture('rsvp_changed');
		a.flush();
		const [first, second, third] = sent[0].batch;
		expect(second.properties).toMatchObject({ from: 'home', from_seconds: 12 });
		expect(first.properties.$session_id).toBe(second.properties.$session_id);
		expect(third.properties.$session_id).not.toBe(second.properties.$session_id);
	});

	it('turns API results into actions and struggles', () => {
		const { a, sent } = setup();
		a.apiResult('PUT', '/posts/0b9e4f6a-1111-4111-8111-111111111111/like', 204);
		a.apiResult('POST', '/posts/0b9e4f6a-1111-4111-8111-111111111111/comments', 500);
		a.apiResult('GET', '/feed?cursor=x', 410);
		a.apiResult('GET', '/feed', 200);
		a.flush();
		expect(sent[0].batch.map((e) => e.event)).toEqual(['post_liked', 'api_error']);
		expect(sent[0].batch[1].properties).toMatchObject({ endpoint: 'POST /posts/:id/comments', status: 500 });
	});

	it('forgets the account on sign-out', () => {
		const { a, sent } = setup();
		a.identify('user-1');
		a.capture('liked');
		a.identify(null);
		a.capture('sign_in_shown');
		a.flush();
		expect(sent[0].batch).toHaveLength(1);
		expect(sent[0].batch[0].distinct_id).not.toBe('user-1');
		expect(sent[0].batch[0].properties.signed_in).toBe(false);
	});
});

describe('helpers', () => {
	it('groups endpoints without ids', () => {
		expect(endpointOf('put', '/events/abcdefabcdefabcdef/guests/123/approve')).toBe('PUT /events/:id/guests/:id/approve');
	});

	it('names screens like the apps', () => {
		expect(screenOf('/feed', 'me')).toBe('home');
		expect(screenOf('/u/me', 'me')).toBe('my_profile');
		expect(screenOf('/u/ana', 'me')).toBe('profile');
		expect(screenOf('/u/ana/followers', 'me')).toBe('followers');
		expect(screenOf('/e/x/invite', 'me')).toBe('invite');
		expect(screenOf('/unknown', 'me')).toBeNull();
	});

	it('makes version 7 UUIDs', () => {
		const id = uuidV7(1_700_000_000_000, new Uint8Array(16));
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(id.startsWith('018bcfe5-6800')).toBe(true);
	});
});
