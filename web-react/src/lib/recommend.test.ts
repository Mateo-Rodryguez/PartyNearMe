import { describe, expect, it } from 'vitest';
import { activeOn, recommendDue, type Activity } from './recommend.js';

const fresh: Activity = { firstDay: 0, lastDay: 0, days: 0, askedDay: 0 };

describe('recommend card timing', () => {
	it('counts each day once', () => {
		let a = activeOn(fresh, 100);
		a = activeOn(a, 100);
		a = activeOn(a, 101);
		expect(a).toEqual({ firstDay: 100, lastDay: 101, days: 2, askedDay: 0 });
	});

	it('waits for 3 days of use over at least a week', () => {
		let a = [100, 101, 102].reduce(activeOn, fresh);
		expect(recommendDue(a, 102)).toBe(false);
		a = activeOn(a, 107);
		expect(recommendDue(a, 107)).toBe(true);
	});

	it('asks again only after 90 days', () => {
		const a: Activity = { firstDay: 100, lastDay: 120, days: 9, askedDay: 120 };
		expect(recommendDue(a, 150)).toBe(false);
		expect(recommendDue(a, 210)).toBe(true);
	});
});
