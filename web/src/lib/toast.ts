/** One short message at the bottom of the screen, e.g. "Link copied". */
import { Store } from '#lib/store.js';

class Toast extends Store {
	message: string | null = null;
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(message: string) {
		this.message = message;
		this.changed();
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.message = null;
			this.changed();
		}, 2500);
	}
}

export const toast = new Toast();
