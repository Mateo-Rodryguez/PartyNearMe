import { useSyncExternalStore } from 'react';

/**
 * A plain object that tells React when it changed. The app's shared state
 * (session, prefs, unread counts) and each paged list extend it, and
 * components read it through useStore, so state lives outside the components
 * and survives page changes, like the apps' view models.
 */
export class Store {
	#listeners = new Set<() => void>();
	#version = 0;

	subscribe = (listener: () => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	version = () => this.#version;

	/** Call after changing any field that's shown. */
	protected changed() {
		this.#version++;
		for (const listener of this.#listeners) listener();
	}
}

/** Re-renders the component whenever [store] changes, and returns it. */
export function useStore<T extends Store>(store: T): T {
	useSyncExternalStore(store.subscribe, store.version, store.version);
	return store;
}
