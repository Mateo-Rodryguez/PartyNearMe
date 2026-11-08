import http2 from "node:http2";
import { importPKCS8, SignJWT } from "jose";

export interface PushMessage {
  title: string;
  body: string;
  /** Lets the app open the right screen when the notification is tapped. */
  data: Record<string, string>;
}

export type Platform = "android" | "ios";

export interface Pusher {
  /** Sends to one device; resolves false when the token is no longer valid. */
  send(token: string, message: PushMessage, platform?: Platform): Promise<boolean>;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Parses the Firebase service account JSON; throws with a useful message. */
export function parseServiceAccount(json: string): ServiceAccount {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  }
  const sa = value as Partial<ServiceAccount>;
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT needs project_id, client_email and private_key");
  }
  return sa as ServiceAccount;
}

/**
 * Firebase Cloud Messaging (HTTP v1). One sender covers Android and iOS: FCM
 * forwards to Apple once the APNs key is added in the Firebase console.
 */
export function fcmPusher(account: ServiceAccount, doFetch: typeof fetch = fetch): Pusher {
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  let cached: { token: string; expiresAt: number } | null = null;

  const accessToken = async () => {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const key = await importPKCS8(account.private_key, "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(account.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const res = await doFetch(tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) throw new Error(`Google token request failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return cached.token;
  };

  return {
    async send(token, message) {
      const res = await doFetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: { priority: "high" },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
      });
      if (res.ok) return true;
      const error = (await res.json().catch(() => null)) as {
        error?: { status?: string; details?: { errorCode?: string }[] };
      } | null;
      const code = error?.error?.details?.find((d) => d.errorCode)?.errorCode ?? error?.error?.status;
      // The app was uninstalled or the token rotated: forget it.
      if (res.status === 404 || code === "UNREGISTERED") return false;
      throw new Error(`FCM send failed: ${res.status} ${code ?? ""}`.trim());
    },
  };
}

export interface ApnsKey {
  /** The .p8 file's contents (BEGIN PRIVATE KEY ... END PRIVATE KEY). */
  key: string;
  keyId: string;
  teamId: string;
  /** The app's bundle id, which APNs calls the topic. */
  bundleId: string;
  /** Development builds from Xcode use the sandbox; TestFlight and the App Store don't. */
  sandbox?: boolean;
}

/** One HTTP/2 request to APNs; swapped out in tests. */
export type ApnsRequest = (
  origin: string,
  path: string,
  headers: Record<string, string>,
  body: string,
) => Promise<{ status: number; body: string }>;

/** Keeps one HTTP/2 connection to APNs open and reuses it, as Apple asks. */
export function http2ApnsRequest(): ApnsRequest {
  let session: http2.ClientHttp2Session | null = null;
  let sessionOrigin = "";
  const connect = (origin: string) => {
    if (session && !session.closed && !session.destroyed && sessionOrigin === origin) return session;
    session?.close();
    const opened = http2.connect(origin);
    opened.on("error", () => opened.destroy());
    opened.on("goaway", () => opened.close());
    // Don't keep the process alive just for an idle push connection.
    opened.unref();
    session = opened;
    sessionOrigin = origin;
    return opened;
  };
  return (origin, path, headers, body) =>
    new Promise((resolve, reject) => {
      const stream = connect(origin).request({ ":method": "POST", ":path": path, ...headers });
      let status = 0;
      let text = "";
      stream.setEncoding("utf8");
      stream.setTimeout(10_000, () => stream.close(http2.constants.NGHTTP2_CANCEL));
      stream.on("response", (h) => { status = Number(h[":status"]); });
      stream.on("data", (chunk: string) => { text += chunk; });
      stream.on("end", () => resolve({ status, body: text }));
      stream.on("error", reject);
      stream.on("close", () => { if (status === 0) reject(new Error("APNs request closed without a response")); });
      stream.end(body);
    });
}

/**
 * Apple Push Notification service, sent straight from the server with a token-based
 * (.p8) key, so the iPhone app needs no Firebase SDK. Tokens are refreshed every 50
 * minutes; Apple rejects ones older than an hour and too-frequent new ones.
 */
export function apnsPusher(config: ApnsKey, request: ApnsRequest = http2ApnsRequest()): Pusher {
  const origin = config.sandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  let cached: { token: string; madeAt: number } | null = null;

  const providerToken = async () => {
    if (cached && Date.now() - cached.madeAt < 50 * 60_000) return cached.token;
    const key = await importPKCS8(config.key.replace(/\\n/g, "\n"), "ES256");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: config.keyId })
      .setIssuer(config.teamId)
      .setIssuedAt()
      .sign(key);
    cached = { token, madeAt: Date.now() };
    return token;
  };

  return {
    async send(token, message) {
      const payload = { aps: { alert: { title: message.title, body: message.body }, sound: "default" }, ...message.data };
      const res = await request(origin, `/3/device/${encodeURIComponent(token)}`, {
        authorization: `bearer ${await providerToken()}`,
        "apns-topic": config.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      }, JSON.stringify(payload));
      if (res.status === 200) return true;
      const reason = (() => {
        try {
          return (JSON.parse(res.body) as { reason?: string }).reason ?? "";
        } catch {
          return "";
        }
      })();
      // Uninstalled, or a token from the other (sandbox/production) environment: forget it.
      if (res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic") {
        return false;
      }
      if (reason === "ExpiredProviderToken") cached = null;
      throw new Error(`APNs send failed: ${res.status} ${reason}`.trim());
    },
  };
}

/**
 * Sends each device through the service for its platform: iPhones through APNs when
 * an APNs key is set, everything else through Firebase. Returns null when neither is set.
 */
export function platformPusher(fcm: Pusher | null, apns: Pusher | null): Pusher | null {
  if (!fcm && !apns) return null;
  return {
    async send(token, message, platform) {
      const via = platform === "ios" && apns ? apns : fcm;
      // No sender for this platform yet: keep the token for when one is set up.
      if (!via) return true;
      return via.send(token, message, platform);
    },
  };
}

/** Records what would have been sent; used in tests and until Firebase is set up. */
export function memoryPusher(invalid: Set<string> = new Set()) {
  const sent: { token: string; message: PushMessage }[] = [];
  const pusher: Pusher = {
    async send(token, message) {
      if (invalid.has(token)) return false;
      sent.push({ token, message });
      return true;
    },
  };
  return { pusher, sent };
}
