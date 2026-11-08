import { untrack } from 'svelte';

/** A list loaded a page at a time: the feed, a profile's photos, nearby parties. */
export class Paged<T> {
	items = $state<T[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);
	ended = $state(false);
	loadedOnce = $state(false);
	#cursor: string | null = null;
	#generation = 0;

	constructor(private load: (cursor: string | null) => Promise<{ items: T[]; next: string | null }>) {}

	/** Starts again from the top, keeping what's shown until the new page arrives. */
	refresh(): Promise<void> {
		this.#cursor = null;
		this.ended = false;
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
