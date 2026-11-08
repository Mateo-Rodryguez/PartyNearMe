// Opens every page of the built site in Chromium with a fake API and a signed-in
// session, fails on any console error, and saves screenshots (light and dark).
// Usage: npm run build && node scripts/smoke.mjs [screenshot dir]
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const build = new URL('../build/', import.meta.url).pathname;
const out = process.argv[2] ?? 'screenshots';
mkdirSync(out, { recursive: true });

// Serves build/ the way Cloudflare Pages does with static/_redirects: files as
// they are, the landing page at /, and the app shell for everything else.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	let file = join(build, path === '/' ? 'index.html' : path);
	if (!existsSync(file) || statSync(file).isDirectory()) file = join(build, '200.html');
	res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
	createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));
const site = `http://localhost:${server.address().port}`;

// Fixtures: a tiny world with one person, one party and one post.
const me = { id: '11111111-1111-4111-8111-111111111111', username: 'mateo', display_name: 'Mateo' };
const ana = { id: '22222222-2222-4222-8222-222222222222', username: 'ana', display_name: 'Ana' };
const photo = (color) =>
	`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><rect width="100%" height="100%" fill="${color}"/></svg>`)}`;
const soon = new Date(Date.now() + 3 * 3600_000).toISOString();
const party = {
	id: '33333333-3333-4333-8333-333333333333', organiser: ana, title: 'Rooftop Sunset Session', description: 'House music on the roof until late.\nBring friends.',
	starts_at: soon, venue_name: 'Skyline Bar', lat: 51.5, lng: -0.12, cover_url: photo('#7c3aed'), status: 'published', going_count: 42, interested_count: 12,
	my_rsvp: null, saved_by_me: false, friends_going: [ana], friends_going_count: 3, created_at: soon, distance_m: 1240
};
const post = {
	id: '44444444-4444-4444-8444-444444444444', author: ana, event_id: party.id, event_title: party.title, caption: 'What a night 🌇', status: 'visible',
	like_count: 17, comment_count: 1, liked_by_me: false, saved_by_me: false, tags: [me], created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
	media: [{ position: 0, url: photo('#ff3d7f'), thumbnails: { '640': photo('#ff3d7f') }, width: 640, height: 800, blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }, { position: 1, url: photo('#ff8a3d'), thumbnails: {}, width: 640, height: 800 }]
};
const routes = [
	[/\/feed/, { posts: [post, { ...post, id: '55555555-5555-4555-8555-555555555555', caption: 'Second one', media: [post.media[1]] }], next_cursor: null }],
	[/\/events\/nearby/, { events: [party, { ...party, id: '66666666-6666-4666-8666-666666666666', title: 'Warehouse Techno', cover_url: null, my_rsvp: 'going', friends_going: [] }], next_cursor: null }],
	[/\/events\/[^/]+\/posts/, { posts: [post], next_cursor: null }],
	[/\/events\/[^/]+\/rsvp/, { ...party, my_rsvp: 'going', going_count: 43 }],
	[/\/events\/[^/]+\/guests$/, { requested: [ana], going: [me] }],
	[/^\/events$/, { ...party, organiser: me }],
	[/\/events\/[^/]+$/, party],
	[/\/posts\/[^/]+\/comments/, { comments: [{ id: 'c1', post_id: post.id, author: me, body: 'See you there!', can_delete: true, created_at: soon }], next_cursor: null }],
	[/\/posts\/[^/]+$/, post],
	[/\/users\/search/, { users: [{ ...ana, is_following: true }] }],
	[/\/users\/[^/]+\/posts/, { posts: [post, post].map((p, i) => ({ ...p, id: `${p.id.slice(0, -1)}${i}` })), next_cursor: null }],
	[/\/users\/[^/]+$/, { ...ana, bio: 'Out every weekend', relationship_status: 'single', parties: 9, followers: 120, following: 80, is_following: false }],
	[/\/me\/events/, [party]],
	[/\/me\/saved\/posts/, { posts: [post], next_cursor: null }],
	[/\/me\/saved\/events/, { events: [party] }],
	[/\/me\/settings/, { messages_from: 'everyone', push_messages: true, push_rsvps: true, push_reminders: true, push_comments: true }],
	[/\/me\/blocks/, { users: [] }],
	[/^\/me$/, { ...me, bio: 'Hi', created_at: soon, interest_ids: [1] }],
	[/\/notifications\/unread/, { unread_count: 3 }],
	[/\/notifications\/seen/, null],
	[/\/notifications$/, { unread_count: 1, notifications: [
		{ id: 'n1', type: 'like', actor: ana, post_id: post.id, post_thumbnail_url: photo('#ff3d7f'), created_at: soon, unread: true },
		{ id: 'n2', type: 'comment', actor: ana, post_id: post.id, comment_text: 'Amazing!', created_at: soon },
		{ id: 'n3', type: 'reminder', event_id: party.id, event_title: party.title, event_cover_url: party.cover_url, created_at: soon }
	] }],
	[/\/uploads$/, { upload_id: 'u1', upload_url: 'https://630c8ac9872f11e09ffed9fe3cb05b0c.r2.cloudflarestorage.com/partynearme-media/uploads/x.jpg', headers: { 'content-type': 'image/jpeg' } }],
	[/\/partynearme-media\//, null],
	[/^\/posts$/, post],
	[/\/conversations\/unread/, { unread_count: 2 }],
	[/\/conversations\/[^/]+\/messages/, { has_more: false, messages: [
		{ id: '3', conversation_id: 'chat1', sender_id: me.id, body: 'On my way!', created_at: soon },
		{ id: '2', conversation_id: 'chat1', sender_id: ana.id, body: 'Come to this', created_at: soon, event_id: party.id },
		{ id: '1', conversation_id: 'chat1', sender_id: ana.id, body: 'Hey! Are you coming tonight?', created_at: soon }
	] }],
	[/\/conversations\/[^/]+\/read/, null],
	[/\/conversations\/[^/]+$/, { id: 'chat1', other: ana, unread_count: 0 }],
	[/\/conversations$/, { next_cursor: null, conversations: [
		{ id: 'chat1', other: ana, unread_count: 1, last_message: { id: '2', conversation_id: 'chat1', sender_id: ana.id, body: 'Hey! Are you coming tonight?', created_at: soon }, last_message_at: soon },
		{ id: 'chat2', party: { id: party.id, title: party.title, cover_url: party.cover_url }, members: [ana, me], unread_count: 0, last_message: { id: '9', conversation_id: 'chat2', sender_id: me.id, body: 'See you all there', created_at: soon }, last_message_at: soon }
	] }],
	[/\/me\/interests/, { ...me, created_at: soon, interest_ids: [1] }],
	[/\/feedback$/, null],
	[/\/interests/, [{ id: 1, slug: 'house', name: 'House' }, { id: 2, slug: 'techno', name: 'Techno' }]],
	[/\/interactions|\/like|\/save|\/follow|\/approve|\/cover/, null]
];

// A brand-new account has no username until setup saves one.
let newAccount = false;

const browser = await chromium.launch();
const errors = [];
for (const scheme of ['dark', 'light']) {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme,
		geolocation: { latitude: 51.5, longitude: -0.12 }, permissions: ['geolocation']
	});
	const calls = new Map();
	await context.route(/onrender\.com|supabase\.co|r2\.cloudflarestorage\.com/, (route) => {
		const url = route.request().url();
		// A page that keeps fetching the same thing is stuck in a loop.
		const key = `${route.request().method()} ${new URL(url).pathname}`;
		calls.set(key, (calls.get(key) ?? 0) + 1);
		if (calls.get(key) === 8) errors.push(`${scheme}: ${key} was requested 8 times`);
		if (url.includes('supabase.co/auth/v1/settings')) return route.fulfill({ json: { external: { google: true, email: true } } });
		if (route.request().method() === 'POST' && /\/messages$/.test(url)) {
			const { body } = route.request().postDataJSON();
			return route.fulfill({ json: { id: '5', conversation_id: 'chat1', sender_id: me.id, body, created_at: new Date().toISOString() } });
		}
		if (newAccount && new URL(url).pathname === '/me') {
			if (route.request().method() === 'PATCH') newAccount = false;
			else return route.fulfill({ json: { id: me.id, username: null, display_name: null, created_at: soon, interest_ids: [] } });
		}
		const match = routes.find(([pattern]) => pattern.test(new URL(url).pathname));
		if (!match) return route.fulfill({ status: 404, json: { message: `No fixture for ${url}` } });
		return match[1] === null ? route.fulfill({ status: 204 }) : route.fulfill({ json: match[1] });
	});
	// Live chat: a fake Realtime socket that delivers one new message after joining.
	await context.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
		ws.onMessage((text) => {
			const frame = JSON.parse(String(text));
			if (frame.event !== 'phx_join' || !frame.topic.endsWith('chat1')) return;
			const record = { id: 4, conversation_id: 'chat1', sender_id: ana.id, body: 'Live message arrived', created_at: '2026-11-08 21:00:00+00' };
			setTimeout(() => ws.send(JSON.stringify({ topic: frame.topic, event: 'postgres_changes', payload: { data: { type: 'INSERT', record } } })), 200);
		});
	});
	// The map's style: a plain background, so no tiles are fetched.
	await context.route(/tiles\.openfreemap\.org/, (route) =>
		route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#2a2633' } }] } })
	);
	const page = await context.newPage();
	page.on('console', (m) => m.type() === 'error' && errors.push(`${scheme} ${page.url()}: ${m.text()}`));
	page.on('pageerror', (e) => errors.push(`${scheme} ${page.url()}: ${e.message}`));

	const shot = async (name, path, waitFor) => {
		calls.clear(); // Counts are per page load.
		await page.goto(site + path);
		await page.getByText(waitFor).first().waitFor({ timeout: 10_000 });
		await page.waitForTimeout(300);
		await page.screenshot({ path: `${out}/${name}-${scheme}.png` });
	};
	await shot('landing', '/', 'PartyNearMe');
	await shot('signin', '/signin', 'Continue with Google');

	// Signed in from here on.
	await page.evaluate((userId) => localStorage.setItem('pnm.session', JSON.stringify({ accessToken: 't', refreshToken: 'r', expiresAt: Date.now() / 1000 + 3600, userId })), me.id);
	// A new account goes through setup first.
	newAccount = true;
	await shot('setup-username', '/feed', 'Pick a username');
	await page.getByLabel('Username').fill('New Name!');
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByText('What are you into?').waitFor();
	await page.getByRole('button', { name: 'House' }).click();
	await page.screenshot({ path: `${out}/setup-interests-${scheme}.png` });
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('radio', { name: 'A friend told me' }).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByText('Find parties near you').waitFor();
	await page.screenshot({ path: `${out}/setup-location-${scheme}.png` });
	await page.getByRole('button', { name: 'Not now' }).click();
	await page.getByText('What a night').first().waitFor();

	// Someone who knows the app gets asked if they'd recommend it.
	await page.evaluate(() => localStorage.setItem('pnm.activity', JSON.stringify({ firstDay: 1, lastDay: 1, days: 5, askedDay: 0 })));
	await shot('feed', '/feed', 'What a night');
	await page.getByRole('radio', { name: '9' }).click();
	await page.getByPlaceholder('What do you love most? (optional)').fill('The party map');
	await page.screenshot({ path: `${out}/recommend-${scheme}.png` });
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await page.getByText('Thank you! Tell a friend tonight').waitFor();
	await page.getByRole('button', { name: 'Like' }).first().click();
	await page.getByText('18 likes').waitFor();
	await shot('nearby', '/nearby', 'Rooftop Sunset Session');
	await shot('party', `/e/${party.id}`, 'House music on the roof');
	await page.getByRole('button', { name: 'Going' }).click();
	await page.getByText('43 people going').waitFor();
	await shot('post', `/p/${post.id}`, 'See you there!');
	await shot('profile', `/u/${ana.id}`, 'Out every weekend');
	await shot('me', '/me', 'Your parties');
	await shot('inbox', '/chat', 'See you all there');
	await shot('chat', '/chat/chat1', 'Live message arrived');
	await page.getByPlaceholder('Message…').fill('Be there at 10');
	await page.keyboard.press('Enter');
	await page.getByText('Be there at 10').waitFor();
	await shot('host', '/host', 'Publish party');
	await page.getByLabel("What's the party?").fill('Garden Disco');
	await page.getByRole('button', { name: 'Tap to pick the spot on the map' }).click();
	await page.locator('.maplibregl-canvas').waitFor({ timeout: 15_000 });
	await page.screenshot({ path: `${out}/host-map-${scheme}.png` });
	await page.getByRole('button', { name: 'Done' }).click();
	await page.getByRole('button', { name: 'Publish party' }).click();
	await page.waitForURL(/\/e\/33333333/);
	await shot('guests', `/e/${party.id}/guests`, 'Asked to come');
	await page.getByRole('button', { name: 'Approve' }).click();
	await page.getByText('Going (2)').waitFor();
	await shot('notifications', '/notifications', 'Amazing!');
	await shot('settings', '/settings', 'Who can message you');
	await page.getByRole('button', { name: 'Delete account' }).click();
	await page.getByText('Why are you leaving?').waitFor();
	await page.screenshot({ path: `${out}/delete-account-${scheme}.png` });
	await page.getByRole('button', { name: 'Keep my account' }).click();
	await page.getByRole('link', { name: 'Send feedback' }).click();
	await page.getByText('We read every message').waitFor();
	await page.screenshot({ path: `${out}/feedback-${scheme}.png` });
	await page.getByRole('radio', { name: 'I have an idea' }).click();
	await page.getByLabel('Your feedback').fill('A dark map');
	await page.getByRole('button', { name: 'Send' }).click();
	await page.getByText('Thanks! We read every one.').waitFor();
	await shot('saved', '/saved', 'Parties');
	await shot('new-post', '/new', 'Choose photos');
	await page.locator('input[type=file]').first().setInputFiles({
		name: 'night.png', mimeType: 'image/png',
		buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
	});
	await page.getByAltText('Photo 1').waitFor();
	await page.getByPlaceholder('Say something').fill('Testing');
	await page.getByRole('checkbox').uncheck();
	await page.getByRole('button', { name: 'Share' }).click();
	await page.waitForURL(/\/p\//);
	await page.goto(`${site}/search`);
	await page.getByPlaceholder('Search people').fill('an');
	await page.getByText('@ana').waitFor();
	await page.screenshot({ path: `${out}/search-${scheme}.png` });

	// Desktop layout.
	await page.setViewportSize({ width: 1280, height: 860 });
	await shot('feed-desktop', '/feed', 'What a night');
	await context.close();
}
await browser.close();
server.close();

if (errors.length) {
	console.error(`Console errors:\n${errors.join('\n')}`);
	process.exit(1);
}
console.log(`All pages opened without errors; screenshots in ${out}/`);
