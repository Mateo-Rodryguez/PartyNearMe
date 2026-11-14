/** Choices kept in this browser only, like the apps keep theirs on the phone. */
export type Theme = 'system' | 'day' | 'night';

const KEY = 'pnm.theme';
const DISPLAY_KEY = 'pnm.display';

/** The same display choices as the apps' LocalPrefs, kept in this browser. */
export interface Display {
	/** Distances in miles instead of kilometres. */
	miles: boolean;
	/** How far Parties and the row on Home look. */
	radiusKm: number;
	/** Hides like counts on other people's posts, as Instagram allows. */
	hideLikeCounts: boolean;
}

import { Store } from '#lib/store.js';

export const RADIUS_CHOICES = [5, 10, 25, 50];

class Prefs extends Store {
	theme: Theme = 'system';
	display: Display = { miles: false, radiusKm: 25, hideLikeCounts: false };

	start() {
		try {
			const saved = localStorage.getItem(KEY);
			if (saved === 'day' || saved === 'night') this.theme = saved;
			const display = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? '{}') as Partial<Display>;
			this.display = { ...this.display, ...display };
			if (!RADIUS_CHOICES.includes(this.display.radiusKm)) this.display.radiusKm = 25;
		} catch {
			// Default.
		}
		this.apply();
		this.changed();
	}

	setDisplay(change: Partial<Display>) {
		this.display = { ...this.display, ...change };
		this.changed();
		try {
			localStorage.setItem(DISPLAY_KEY, JSON.stringify(this.display));
		} catch {
			// Lasts for this visit.
		}
	}

	setTheme(theme: Theme) {
		this.theme = theme;
		this.changed();
		try {
			if (theme === 'system') localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, theme);
		} catch {
			// Lasts for this visit.
		}
		this.apply();
	}

	/** Whether the night theme is showing, for the few things beyond colours (the map style). */
	get night(): boolean {
		if (this.theme !== 'system') return this.theme === 'night';
		return !matchMedia('(prefers-color-scheme: light)').matches;
	}

	/** tokens.css switches on data-theme; without it the system setting decides. */
	private apply() {
		if (this.theme === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = this.theme;
	}
}

export const prefs = new Prefs();
