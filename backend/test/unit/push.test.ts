import { exportPKCS8, generateKeyPair, decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { apnsPusher, fcmPusher, memoryPusher, parseServiceAccount, platformPusher, type ApnsRequest } from "../../src/worker/push.js";

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

describe("apnsPusher", () => {
  async function apnsKey() {
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    return { key: await exportPKCS8(privateKey), keyId: "ABC123DEFG", teamId: "TEAM123456", bundleId: "com.partynearme.app" };
  }

  it("signs one provider token and sends an alert to the device", async () => {
    const calls: { origin: string; path: string; headers: Record<string, string>; body: string }[] = [];
    const request: ApnsRequest = async (origin, path, headers, body) => {
      calls.push({ origin, path, headers, body });
      return { status: 200, body: "" };
    };
    const pusher = apnsPusher(await apnsKey(), request);
    expect(await pusher.send("aa11", message)).toBe(true);
    expect(await pusher.send("bb22", message)).toBe(true);

    expect(calls[0]?.origin).toBe("https://api.push.apple.com");
    expect(calls[0]?.path).toBe("/3/device/aa11");
    expect(calls[0]?.headers).toMatchObject({ "apns-topic": "com.partynearme.app", "apns-push-type": "alert" });
    const jwt = (calls[0]?.headers.authorization ?? "").replace("bearer ", "");
    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: "ES256", kid: "ABC123DEFG" });
    expect(decodeJwt(jwt).iss).toBe("TEAM123456");
    expect(calls[1]?.headers.authorization).toBe(calls[0]?.headers.authorization);
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      aps: { alert: { title: "Alice", body: "hi" }, sound: "default" },
      type: "message",
      conversation_id: "c1",
    });
  });

  it("uses the sandbox when asked and accepts a key pasted with \\n", async () => {
    const origins: string[] = [];
    const key = await apnsKey();
    const pusher = apnsPusher({ ...key, key: key.key.replace(/\n/g, "\\n"), sandbox: true }, async (origin) => {
      origins.push(origin);
      return { status: 200, body: "" };
    });
    expect(await pusher.send("aa", message)).toBe(true);
    expect(origins).toEqual(["https://api.sandbox.push.apple.com"]);
  });

  it("reports dead tokens and throws on other errors", async () => {
    let answer = { status: 410, body: JSON.stringify({ reason: "Unregistered" }) };
    const pusher = apnsPusher(await apnsKey(), async () => answer);
    expect(await pusher.send("gone", message)).toBe(false);
    answer = { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) };
    expect(await pusher.send("bad", message)).toBe(false);
    answer = { status: 500, body: JSON.stringify({ reason: "InternalServerError" }) };
    await expect(pusher.send("x", message)).rejects.toThrow(/500 InternalServerError/);
  });
});

describe("platformPusher", () => {
  it("sends iPhones through APNs and the rest through Firebase", async () => {
    const fcm = memoryPusher();
    const apns = memoryPusher();
    const pusher = platformPusher(fcm.pusher, apns.pusher);
    await pusher?.send("phone", message, "android");
    await pusher?.send("iphone", message, "ios");
    expect(fcm.sent.map((s) => s.token)).toEqual(["phone"]);
    expect(apns.sent.map((s) => s.token)).toEqual(["iphone"]);
  });

  it("falls back to Firebase for iPhones without an APNs key, and is null with neither", async () => {
    const fcm = memoryPusher();
    await platformPusher(fcm.pusher, null)?.send("iphone", message, "ios");
    expect(fcm.sent.map((s) => s.token)).toEqual(["iphone"]);
    expect(platformPusher(null, null)).toBeNull();
    const apns = memoryPusher();
    expect(await platformPusher(null, apns.pusher)?.send("phone", message, "android")).toBe(true);
    expect(apns.sent).toEqual([]);
  });
});
