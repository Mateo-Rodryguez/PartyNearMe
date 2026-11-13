import { useState } from 'react';
import { readSaved, writeSaved } from '#lib/saved.js';
import { Store, useStore } from '#lib/store.js';

type Load<T> = (cursor: string | null) => Promise<{ items: T[]; next: string | null }>;

/** A list loaded a page at a time: the feed, a profile's photos, nearby parties. */
export class Paged<T> extends Store {
	items: T[] = [];
	loading = false;
	error: string | null = null;
	ended = false;
	loadedOnce = false;
	#cursor: string | null = null;
	#generation = 0;

	/**
	 * With [saved], the first page is kept in this browser under the key it
	 * returns (null for nothing), and shown at once on the next visit while the
	 * fresh one loads. The key should name everything that changes the list,
	 * such as filters.
	 */
	constructor(
		public load: Load<T>,
		public saved?: () => string | null
	) {
		super();
	}

	/** Replaces the items, for edits made on screen (a like, a removed post). */
	setItems(items: T[]) {
		this.items = items;
		this.changed();
	}

	/** Changes one item in place. */
	update(match: (item: T) => boolean, change: (item: T) => T) {
		this.setItems(this.items.map((item) => (match(item) ? change(item) : item)));
	}

	/** Starts again from the top, keeping what's shown until the new page arrives. */
	refresh(): Promise<void> {
		this.#cursor = null;
		this.ended = false;
		const key = this.saved?.();
		// A saved copy for this exact list replaces whatever another filter showed.
		const copy = key ? readSaved<T[]>(key) : null;
		if (copy) this.items = copy;
		this.changed();
		return this.more(true);
	}

	/** Loads the next page. */
	async more(replace = false): Promise<void> {
		if ((this.loading && !replace) || (this.ended && !replace)) return;
		const generation = ++this.#generation;
		this.loading = true;
		this.error = null;
		this.changed();
		try {
			const { items, next } = await this.load(replace ? null : this.#cursor);
			if (generation !== this.#generation) return;
			this.items = replace ? items : [...this.items, ...items];
			if (replace) {
				const key = this.saved?.();
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
				this.changed();
			}
		}
	}
}

/**
 * A paged list that belongs to one component. [load] and [saved] are read
 * fresh on each call, so they can use the component's latest props and state.
 */
export function usePaged<T>(load: Load<T>, saved?: () => string | null): Paged<T> {
	const [paged] = useState(() => new Paged<T>(load, saved));
	paged.load = load;
	paged.saved = saved;
	return useStore(paged);
}
