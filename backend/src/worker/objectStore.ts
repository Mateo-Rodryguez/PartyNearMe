import { presignUrl } from "../storage.js";

/** The few storage operations the worker needs. */
export interface ObjectStore {
  get(key: string): Promise<{ body: Buffer; contentType: string | null } | null>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** R2 over its S3 API, with requests signed by our own SigV4 presigner. */
export function r2ObjectStore(opts: {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetch?: typeof fetch;
}): ObjectStore {
  const host = `${opts.accountId}.r2.cloudflarestorage.com`;
  const doFetch = opts.fetch ?? fetch;
  const url = (method: string, key: string, headers: Record<string, string> = {}) =>
    presignUrl({
      method,
      host,
      path: `/${opts.bucket}/${key}`,
      headers,
      expiresSeconds: 300,
      now: new Date(),
      region: "auto",
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    });

  return {
    async get(key) {
      const res = await doFetch(url("GET", key));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 GET ${key} failed: ${res.status}`);
      return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
    },
    async put(key, body, contentType) {
      const headers = { "content-type": contentType };
      const res = await doFetch(url("PUT", key, headers), { method: "PUT", headers, body });
      if (!res.ok) throw new Error(`R2 PUT ${key} failed: ${res.status}`);
    },
    async delete(key) {
      const res = await doFetch(url("DELETE", key), { method: "DELETE" });
      // S3 returns 204 whether or not the object existed.
      if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key} failed: ${res.status}`);
    },
  };
}

/** In-memory store for tests and local development. */
export function memoryObjectStore(): ObjectStore & { objects: Map<string, { body: Buffer; contentType: string }> } {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    objects,
    async get(key) {
      return objects.get(key) ?? null;
    },
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
