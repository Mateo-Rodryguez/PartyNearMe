/**
 * When to ask "How likely are you to recommend PartyNearMe to a friend?", the
 * same rule as the apps (LocalPrefs.recommendDue): only once someone knows the
 * app (used on 3+ different days over at least a week), then at most every 90
 * days, so it never nags. Kept in this browser.
 */
export interface Activity {
	/** Days since 1970 (local time); 0 for never. */
	firstDay: number;
	lastDay: number;
	days: number;
	askedDay: number;
}

const KEY = 'pnm.activity';
const EMPTY: Activity = { firstDay: 0, lastDay: 0, days: 0, askedDay: 0 };

export const dayNumber = (date = new Date()) =>
	Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);

/** Counts [today] as a day the app was used. */
export function activeOn(a: Activity, today: number): Activity {
	if (a.lastDay === today) return a;
	return { ...a, firstDay: a.firstDay || today, lastDay: today, days: a.days + 1 };
}

export function recommendDue(a: Activity, today: number): boolean {
	return a.days >= 3 && a.firstDay > 0 && today - a.firstDay >= 7 && (a.askedDay === 0 || today - a.askedDay >= 90);
}

function load(): Activity {
	try {
		return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Activity>) };
	} catch {
		return EMPTY;
	}
}

function save(a: Activity) {
	try {
		localStorage.setItem(KEY, JSON.stringify(a));
	} catch {
		// No storage: the card just never shows.
	}
}

/**
 * Notes today's visit and says whether to show the card now. Asking counts as
 * asked: answering, closing or ignoring it all wait another 90 days.
 */
export function visitAndCheck(today = dayNumber()): boolean {
	const a = activeOn(load(), today);
	const due = recommendDue(a, today);
	save(due ? { ...a, askedDay: today } : a);
	return due;
}
