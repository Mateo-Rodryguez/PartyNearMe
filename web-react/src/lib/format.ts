import type { Media, Person } from '#lib/api/types.js';
import { covers } from '#lib/tokens.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const parse = (iso: string) => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d;
};

export const nameOf = (p: Pick<Person, 'display_name' | 'username'>) =>
	p.display_name || (p.username ? `@${p.username}` : 'Someone');

/** "now", "5m", "3h", "2d", then a date: the same style as the phone apps. */
export function timeAgo(iso: string, now = new Date()): string {
	const then = parse(iso);
	if (!then) return '';
	const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
	if (minutes < 1) return 'now';
	if (minutes < 60) return `${minutes}m`;
	if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
	if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
	return `${then.getDate()} ${MONTHS[then.getMonth()]}`;
}

/** "Sat 14 Oct, 21:00" in the viewer's time zone. */
export function eventTime(iso: string): string {
	const t = parse(iso);
	return t ? `${DAYS[t.getDay()]} ${t.getDate()} ${MONTHS[t.getMonth()]}, ${pad(t.getHours())}:${pad(t.getMinutes())}` : '';
}

export function clockTime(iso: string): string {
	const t = parse(iso);
	return t ? `${pad(t.getHours())}:${pad(t.getMinutes())}` : '';
}

/** "Tonight", "Tomorrow", or "Wed 21 Oct". */
export function dayLabel(iso: string, now = new Date()): string {
	const t = parse(iso);
	if (!t) return '';
	const day = (d: Date) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
	const diff = day(t) - day(now);
	if (diff === 0) return 'Tonight';
	if (diff === 1) return 'Tomorrow';
	return `${DAYS[t.getDay()]} ${t.getDate()} ${MONTHS[t.getMonth()]}`;
}

/** The two lines of a calendar tile: "OCT" and "19". */
export function calendarTile(iso: string): [string, string] {
	const t = parse(iso);
	return t ? [MONTHS[t.getMonth()].toUpperCase(), String(t.getDate())] : ['', ''];
}

/** "650 m away" or "2.3 km away". */
export function distance(meters: number | null | undefined, miles = false): string {
	if (meters == null) return '';
	if (miles) return `${(Math.max(1, Math.round(meters / 160.934)) / 10).toString()} mi away`;
	if (meters < 1000) return `${(Math.floor(meters / 50) + 1) * 50} m away`;
	return `${(Math.round(meters / 100) / 10).toString()} km away`;
}

/** A search radius as people say it: "25 km", or "16 mi" in miles. */
export function radiusLabel(km: number, miles: boolean): string {
	return miles ? `${Math.round(km / 1.609)} mi` : `${km} km`;
}

/** From now until 6 the next morning: what people mean by "tonight". */
export function tonightWindow(now = new Date()): [Date, Date] {
	const end = new Date(now);
	if (now.getHours() >= 6) end.setDate(end.getDate() + 1);
	end.setHours(6, 0, 0, 0);
	return [now, end];
}

/** Friday 17:00 to Monday 6:00 of this weekend, or the next one; from now if it has started. */
export function weekendWindow(now = new Date()): [Date, Date] {
	const sinceFriday = (now.getDay() - 5 + 7) % 7;
	const stillOn = sinceFriday <= 2 || (sinceFriday === 3 && now.getHours() < 6);
	const friday = new Date(now);
	friday.setDate(now.getDate() + (stillOn ? -sinceFriday : 7 - sinceFriday));
	friday.setHours(17, 0, 0, 0);
	const end = new Date(friday);
	end.setDate(friday.getDate() + 3);
	end.setHours(6, 0, 0, 0);
	return [friday < now ? now : friday, end];
}

/** Fallback cover for a party without a photo: one gradient per party, picked from its name. */
export function coverFor(key: string): string {
	let hash = 0;
	for (const c of key) hash = (Math.imul(31, hash) + c.charCodeAt(0)) | 0;
	const [a, b] = covers[(hash & 0x7fffffff) % covers.length];
	return `linear-gradient(135deg, ${a}, ${b})`;
}

/** srcset from the photo's sizes, so the browser fetches the smallest one that looks sharp. */
export function srcset(media: Media): string {
	return Object.entries(media.thumbnails)
		.map(([width, url]) => [Number(width), url] as const)
		.filter(([width]) => Number.isFinite(width))
		.sort((a, b) => a[0] - b[0])
		.map(([width, url]) => `${url} ${width}w`)
		.join(', ');
}

/** The smallest version at least [minWidth] wide, else the full photo. */
export function photoUrl(media: Media, minWidth: number): string | null {
	const sizes = Object.entries(media.thumbnails)
		.map(([width, url]) => [Number(width), url] as const)
		.sort((a, b) => a[0] - b[0]);
	return sizes.find(([width]) => width >= minWidth)?.[1] ?? media.url ?? sizes.at(-1)?.[1] ?? null;
}

export function count(n: number, one: string, many = `${one}s`) {
	return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** What happened to a batch of party invites; the same words as the apps. */
export function inviteResultText(sent: number, skipped: number): string {
	const done = sent === 0 ? 'No invites sent' : sent === 1 ? 'Invite sent' : `${sent} invites sent`;
	if (skipped === 0) return done;
	return skipped === 1 ? `${done}. 1 person can't get messages from you.` : `${done}. ${skipped} people can't get messages from you.`;
}
