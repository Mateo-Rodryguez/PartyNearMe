import { describe, expect, it } from 'vitest';
import { coverFor, distance, inviteResultText, nameOf, photoUrl, srcset, timeAgo, tonightWindow, weekendWindow } from './format.js';

describe('timeAgo', () => {
	const now = new Date('2026-11-08T20:00:00Z');
	it('reads like the apps', () => {
		expect(timeAgo('2026-11-08T19:59:40Z', now)).toBe('now');
		expect(timeAgo('2026-11-08T19:55:00Z', now)).toBe('5m');
		expect(timeAgo('2026-11-08T17:00:00Z', now)).toBe('3h');
		expect(timeAgo('2026-11-06T20:00:00Z', now)).toBe('2d');
		expect(timeAgo('not a date', now)).toBe('');
	});
});

describe('names and distances', () => {
	it('prefers the display name, then @username', () => {
		expect(nameOf({ display_name: 'Ana', username: 'ana' })).toBe('Ana');
		expect(nameOf({ username: 'ana' })).toBe('@ana');
		expect(nameOf({})).toBe('Someone');
	});
	it('rounds distances like the apps', () => {
		expect(distance(620)).toBe('650 m away');
		expect(distance(2340)).toBe('2.3 km away');
		expect(distance(5000)).toBe('5 km away');
		expect(distance(null)).toBe('');
	});
});

describe('photos', () => {
	const media = { position: 0, url: 'full', thumbnails: { '1080': 'l', '150': 's', '640': 'm' } };
	it('lists sizes smallest first', () => expect(srcset(media)).toBe('s 150w, m 640w, l 1080w'));
	it('picks the smallest sharp size', () => {
		expect(photoUrl(media, 600)).toBe('m');
		expect(photoUrl(media, 2000)).toBe('full');
	});
});

describe('windows', () => {
	it('tonight runs to 6 the next morning', () => {
		const [, end] = tonightWindow(new Date(2026, 10, 8, 21, 0));
		expect(end).toEqual(new Date(2026, 10, 9, 6, 0));
		const [, early] = tonightWindow(new Date(2026, 10, 9, 2, 0));
		expect(early).toEqual(new Date(2026, 10, 9, 6, 0));
	});
	it('the weekend is Friday 17:00 to Monday 6:00', () => {
		// Wednesday 11 Nov 2026.
		const [start, end] = weekendWindow(new Date(2026, 10, 11, 12, 0));
		expect(start).toEqual(new Date(2026, 10, 13, 17, 0));
		expect(end).toEqual(new Date(2026, 10, 16, 6, 0));
		// Saturday night: from now.
		const now = new Date(2026, 10, 14, 23, 0);
		expect(weekendWindow(now)[0]).toEqual(now);
	});
});

describe('coverFor', () => {
	it('is stable per name', () => expect(coverFor('Warehouse rave')).toBe(coverFor('Warehouse rave')));
});

describe('inviteResultText', () => {
	it('says how many went and how many could not get messages', () => {
		expect(inviteResultText(0, 0)).toBe('No invites sent');
		expect(inviteResultText(1, 0)).toBe('Invite sent');
		expect(inviteResultText(3, 1)).toBe("3 invites sent. 1 person can't get messages from you.");
		expect(inviteResultText(2, 2)).toBe("2 invites sent. 2 people can't get messages from you.");
	});
});
