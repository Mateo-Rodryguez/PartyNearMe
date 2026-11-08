/** Choices kept in this browser only, like the apps keep theirs on the phone. */
export type Theme = 'system' | 'day' | 'night';

const KEY = 'pnm.theme';

class Prefs {
	theme = $state<Theme>('system');

	start() {
		try {
			const saved = localStorage.getItem(KEY);
			if (saved === 'day' || saved === 'night') this.theme = saved;
		} catch {
			// Default.
		}
		this.apply();
	}

	setTheme(theme: Theme) {
		this.theme = theme;
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
