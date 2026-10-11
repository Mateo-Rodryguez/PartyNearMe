import { importPKCS8, SignJWT } from "jose";

export interface PushMessage {
  title: string;
  body: string;
  /** Lets the app open the right screen when the notification is tapped. */
  data: Record<string, string>;
}

export interface Pusher {
  /** Sends to one device; resolves false when the token is no longer valid. */
  send(token: string, message: PushMessage): Promise<boolean>;
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
