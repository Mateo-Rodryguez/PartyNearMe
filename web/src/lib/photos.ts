/** Photos are shrunk in the browser to this, which keeps uploads quick on mobile data. */
const MAX_EDGE = 2048;

/**
 * Decodes, turns upright, scales down and re-encodes as JPEG. Re-encoding through
 * a canvas also drops the photo's metadata, including where it was taken.
 */
export async function shrink(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => decodeWithImage(file));
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not read the photo');
	ctx.drawImage(bitmap, 0, 0, width, height);
	if ('close' in bitmap) bitmap.close();
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
	if (!blob) throw new Error('Could not read the photo');
	return blob;
}

/** Some formats (HEIC on Safari) only decode through an <img>. */
function decodeWithImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("That file isn't a photo we can read"));
		};
		img.src = url;
	});
}
