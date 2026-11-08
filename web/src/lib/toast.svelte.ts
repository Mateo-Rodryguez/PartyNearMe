/** One short message at the bottom of the screen, e.g. "Link copied". */
class Toast {
	message = $state<string | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(message: string) {
		this.message = message;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.message = null), 2500);
	}
}

export const toast = new Toast();
