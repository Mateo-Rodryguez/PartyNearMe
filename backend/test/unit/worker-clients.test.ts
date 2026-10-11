import { describe, expect, it } from "vitest";
import { openAiModerator } from "../../src/worker/moderation.js";
import { r2ObjectStore } from "../../src/worker/objectStore.js";

describe("openAiModerator", () => {
  it("sends text and image together and collects flagged categories", async () => {
    let sent: { url: string; body: { model: string; input: { type: string }[] }; auth: string | null } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(init.body as string), auth: new Headers(init.headers).get("authorization") };
      return new Response(JSON.stringify({
        results: [{ flagged: true, categories: { violence: true, sexual: false, "violence/graphic": true } }],
      }));
    }) as unknown as typeof fetch;

    const result = await openAiModerator("sk-test", fakeFetch).check({
      text: "caption",
      image: { body: Buffer.from("img"), contentType: "image/webp" },
    });
    expect(result).toEqual({ flagged: true, categories: ["violence", "violence/graphic"] });
    expect(sent?.url).toBe("https://api.openai.com/v1/moderations");
    expect(sent?.auth).toBe("Bearer sk-test");
    expect(sent?.body.model).toBe("omni-moderation-latest");
    expect(sent?.body.input.map((i) => i.type)).toEqual(["text", "image_url"]);
  });

  it("skips the call when there's nothing to check", async () => {
    const fakeFetch = (async () => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    expect(await openAiModerator("k", fakeFetch).check({ text: null })).toEqual({ flagged: false, categories: [] });
  });

  it("fails loudly on API errors so the worker retries", async () => {
    const fakeFetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(openAiModerator("k", fakeFetch).check({ text: "x" })).rejects.toThrow(/500/);
  });
});

describe("r2ObjectStore", () => {
  it("signs requests for the right bucket and key, and maps 404 to null", async () => {
    const calls: { url: URL; method: string }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: new URL(url), method: init?.method ?? "GET" });
      return new Response(null, { status: init?.method === "PUT" ? 200 : 404 });
    }) as unknown as typeof fetch;
    const store = r2ObjectStore({ accountId: "acct", bucket: "media", accessKeyId: "AK", secretAccessKey: "SK", fetch: fakeFetch });

    expect(await store.get("a/b.jpg")).toBeNull();
    await store.put("a/c.webp", Buffer.from("x"), "image/webp");
    await store.delete("a/b.jpg");

    expect(calls.map((c) => `${c.method} ${c.url.host}${c.url.pathname}`)).toEqual([
      "GET acct.r2.cloudflarestorage.com/media/a/b.jpg",
      "PUT acct.r2.cloudflarestorage.com/media/a/c.webp",
      "DELETE acct.r2.cloudflarestorage.com/media/a/b.jpg",
    ]);
    expect(calls[1]?.url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    for (const c of calls) expect(c.url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});
