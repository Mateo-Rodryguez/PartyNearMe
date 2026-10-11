import { exportPKCS8, generateKeyPair, decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { fcmPusher, parseServiceAccount } from "../../src/worker/push.js";

async function account() {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  return { project_id: "pnm-test", client_email: "push@pnm-test.iam.gserviceaccount.com", private_key: await exportPKCS8(privateKey) };
}

const message = { title: "Alice", body: "hi", data: { type: "message", conversation_id: "c1" } };

describe("fcmPusher", () => {
  it("gets an access token once, then sends with it", async () => {
    const calls: { url: string; body: string; auth: string | null }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), auth: new Headers(init.headers).get("authorization") });
      if (url.includes("oauth2")) return Response.json({ access_token: "ya29.test", expires_in: 3600 });
      return Response.json({ name: "projects/pnm-test/messages/1" });
    }) as unknown as typeof fetch;

    const pusher = fcmPusher(await account(), fakeFetch);
    expect(await pusher.send("token-a", message)).toBe(true);
    expect(await pusher.send("token-b", message)).toBe(true);

    expect(calls.map((c) => new URL(c.url).host)).toEqual(["oauth2.googleapis.com", "fcm.googleapis.com", "fcm.googleapis.com"]);
    const assertion = new URLSearchParams(calls[0]?.body).get("assertion") ?? "";
    expect(decodeProtectedHeader(assertion).alg).toBe("RS256");
    expect(decodeJwt(assertion)).toMatchObject({
      iss: "push@pnm-test.iam.gserviceaccount.com",
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    });
    expect(calls[1]?.url).toBe("https://fcm.googleapis.com/v1/projects/pnm-test/messages:send");
    expect(calls[1]?.auth).toBe("Bearer ya29.test");
    expect(JSON.parse(calls[1]?.body ?? "{}").message).toMatchObject({
      token: "token-a",
      notification: { title: "Alice", body: "hi" },
      data: { type: "message", conversation_id: "c1" },
    });
  });

  it("reports dead tokens and throws on other errors", async () => {
    let status = 404;
    const fakeFetch = (async (url: string) => {
      if (url.includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 });
      return status === 404
        ? Response.json({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, { status })
        : Response.json({ error: { status: "INTERNAL" } }, { status });
    }) as unknown as typeof fetch;
    const pusher = fcmPusher(await account(), fakeFetch);
    expect(await pusher.send("gone", message)).toBe(false);
    status = 500;
    await expect(pusher.send("x", message)).rejects.toThrow(/500/);
  });
});

describe("parseServiceAccount", () => {
  it("explains what's wrong without echoing the key", () => {
    expect(() => parseServiceAccount("not json")).toThrow(/not valid JSON/);
    expect(() => parseServiceAccount(JSON.stringify({ project_id: "p", private_key: "SECRET" }))).toThrow(/client_email/);
    try {
      parseServiceAccount(JSON.stringify({ private_key: "SECRET" }));
    } catch (err) {
      expect(String(err)).not.toContain("SECRET");
    }
  });
});
