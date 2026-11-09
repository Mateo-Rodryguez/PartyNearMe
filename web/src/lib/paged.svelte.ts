import { untrack } from 'svelte';
import { readSaved, writeSaved } from '#lib/saved.js';

/** A list loaded a page at a time: the feed, a profile's photos, nearby parties. */
export class Paged<T> {
	items = $state<T[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);
	ended = $state(false);
	loadedOnce = $state(false);
	#cursor: string | null = null;
	#generation = 0;

	/**
	 * With [saved], the first page is kept in this browser under the key it
	 * returns (null for nothing), and shown at once on the next visit while the
	 * fresh one loads. The key should name everything that changes the list,
	 * such as filters.
	 */
	constructor(
		private load: (cursor: string | null) => Promise<{ items: T[]; next: string | null }>,
		private saved?: () => string | null
	) {}

	/** Starts again from the top, keeping what's shown until the new page arrives. */
	refresh(): Promise<void> {
		this.#cursor = null;
		this.ended = false;
		untrack(() => {
			const key = this.saved?.();
			if (!key) return;
			const copy = readSaved<T[]>(key);
			// A saved copy for this exact list replaces whatever another filter showed.
			if (copy) this.items = copy;
		});
		return this.more(true);
	}

	/**
	 * Loads the next page. Pages call this from effects, so it reads its own
	 * state untracked: otherwise each load would re-run the effect that started it.
	 */
	more(replace = false): Promise<void> {
		return untrack(() => this.#more(replace));
	}

	async #more(replace: boolean) {
		if ((this.loading && !replace) || (this.ended && !replace)) return;
		const generation = ++this.#generation;
		this.loading = true;
		this.error = null;
		try {
			const { items, next } = await this.load(replace ? null : this.#cursor);
			if (generation !== this.#generation) return;
			this.items = replace ? items : [...this.items, ...items];
			if (replace) {
				const key = untrack(() => this.saved?.());
				if (key) writeSaved(key, items.slice(0, 20));
			}
			this.#cursor = next;
			this.ended = next == null;
		} catch (e) {
			if (generation !== this.#generation) return;
			this.error = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			if (generation === this.#generation) {
				this.loading = false;
				this.loadedOnce = true;
			}
		}
	}
}
