import { decode } from 'blurhash';

const cache = new Map<string, string>();

/** A tiny blurred preview (as a data: URL) shown while the photo loads. */
export function blurhashUrl(hash: string | null | undefined): string | null {
	if (!hash) return null;
	const cached = cache.get(hash);
	if (cached) return cached;
	try {
		const size = 32;
		const pixels = decode(hash, size, size);
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		const image = ctx.createImageData(size, size);
		image.data.set(pixels);
		ctx.putImageData(image, 0, 0);
		const url = canvas.toDataURL();
		cache.set(hash, url);
		return url;
	} catch {
		return null;
	}
}
