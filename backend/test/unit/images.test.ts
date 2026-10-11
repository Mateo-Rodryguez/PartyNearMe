import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processImage } from "../../src/worker/images.js";

/** A 2000x1000 JPEG with an EXIF rotation and GPS-ish metadata attached. */
async function photo() {
  return sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 40, b: 90 } } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Make: "TestCam" } } })
    .toBuffer();
}

describe("processImage", () => {
  it("makes three WebP sizes, applying the EXIF rotation", async () => {
    const out = await processImage(await photo());
    // Orientation 6 = rotate 90°, so the 2000x1000 photo becomes portrait.
    expect(out.width).toBe(540);
    expect(out.height).toBe(1080);
    for (const [size, buf] of Object.entries(out.variants)) {
      const meta = await sharp(buf).metadata();
      expect(meta.format).toBe("webp");
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(Number(size));
    }
    expect(out.blurhash).toMatch(/^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]{6,}$/);
  });

  it("strips all metadata from the outputs", async () => {
    const out = await processImage(await photo());
    const meta = await sharp(out.variants[1080]).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("never enlarges small photos", async () => {
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } }).png().toBuffer();
    const out = await processImage(small);
    expect([out.width, out.height]).toEqual([300, 200]);
  });

  it("rejects files that aren't images", async () => {
    await expect(processImage(Buffer.from("not an image"))).rejects.toThrow();
  });
});
