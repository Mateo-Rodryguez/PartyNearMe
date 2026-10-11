import sharp from "sharp";
import { encode } from "blurhash";

/** Longest side, in pixels, of each size served to the app. */
export const SIZES = [150, 640, 1080] as const;
export type Size = (typeof SIZES)[number];

export interface ProcessedImage {
  width: number;
  height: number;
  blurhash: string;
  variants: Record<Size, Buffer>;
}

/**
 * Turns an uploaded photo into WebP sizes for the feed. Applies the EXIF
 * rotation, then drops all metadata (sharp's default), so camera details and
 * GPS location never reach other users.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  // Guard against decompression bombs: refuse anything over ~50 megapixels.
  const base = sharp(input, { limitInputPixels: 50_000_000, failOn: "error" }).rotate();

  const variants = {} as Record<Size, Buffer>;
  let width = 0;
  let height = 0;
  for (const size of SIZES) {
    const { data, info } = await base
      .clone()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    variants[size] = data;
    if (size === 1080) {
      width = info.width;
      height = info.height;
    }
  }

  const small = await base
    .clone()
    .resize({ width: 32, height: 32, fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash = encode(new Uint8ClampedArray(small.data), small.info.width, small.info.height, 4, 3);

  return { width, height, blurhash, variants };
}
