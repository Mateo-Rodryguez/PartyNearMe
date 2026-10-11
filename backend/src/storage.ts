import { createHash, createHmac, randomUUID } from "node:crypto";

/**
 * Minimal AWS Signature V4 query-string presigning, enough for direct uploads
 * to Cloudflare R2 (S3-compatible). Kept dependency-free; tested against
 * AWS's published example.
 */
export interface PresignInput {
  method: string;
  host: string;
  /** Path with a leading slash, unencoded (e.g. /bucket/uploads/a.jpg). */
  path: string;
  /** Extra headers the client must send exactly; host is added automatically. */
  headers?: Record<string, string>;
  expiresSeconds: number;
  now: Date;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const encode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s).digest();

export function presignUrl(input: PresignInput): string {
  const amzDate = input.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/s3/aws4_request`;

  const headers: Record<string, string> = { host: input.host };
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = v.trim();
  const headerNames = Object.keys(headers).sort();
  const signedHeaders = headerNames.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encode(k)}=${encode(query[k] as string)}`)
    .join("&");
  const canonicalPath = input.path.split("/").map(encode).join("/");

  const canonicalRequest = [
    input.method,
    canonicalPath,
    canonicalQuery,
    headerNames.map((h) => `${h}:${headers[h]}\n`).join(""),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return `https://${input.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
// HEIC isn't accepted: the image library can't decode it, so the app converts
// iPhone photos to JPEG before uploading.
export type ImageType = keyof typeof IMAGE_TYPES;

export interface SignedUpload {
  storageKey: string;
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface MediaStorage {
  signUpload(userId: string, contentType: ImageType, sizeBytes: number): SignedUpload;
}

const UPLOAD_URL_TTL_SECONDS = 10 * 60;

/** Signs direct uploads to an R2 bucket. */
export function r2Storage(opts: {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): MediaStorage {
  const host = `${opts.accountId}.r2.cloudflarestorage.com`;
  return {
    signUpload(userId, contentType, sizeBytes) {
      const now = new Date();
      const storageKey = `uploads/${userId}/${randomUUID()}.${IMAGE_TYPES[contentType]}`;
      // The phone must send exactly this type and size, or R2 rejects the upload.
      const headers = { "content-type": contentType, "content-length": String(sizeBytes) };
      const url = presignUrl({
        method: "PUT",
        host,
        path: `/${opts.bucket}/${storageKey}`,
        headers,
        expiresSeconds: UPLOAD_URL_TTL_SECONDS,
        now,
        region: "auto",
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      });
      return { storageKey, url, headers, expiresAt: new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000) };
    },
  };
}
