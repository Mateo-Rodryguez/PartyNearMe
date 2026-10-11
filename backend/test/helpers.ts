import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from "jose";
import { buildApp } from "../src/app.js";
import { createTokenVerifier } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import type { Db } from "../src/db.js";
import { r2Storage, type MediaStorage } from "../src/storage.js";

export const SUPABASE_URL = "https://test-project.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;

export const testConfig = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgres://unused@localhost/unused",
  SUPABASE_URL,
  RATE_LIMIT_PER_MINUTE: "1000",
  MEDIA_BASE_URL: "https://media.test",
});

export const testStorage = r2Storage({ accountId: "0".repeat(32), bucket: "test", accessKeyId: "AK", secretAccessKey: "SK" });

/** A signing key pair standing in for the Supabase project's keys. */
export async function createTestKeys() {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "ES256" };
  const verifyToken = createTokenVerifier(createLocalJWKSet({ keys: [jwk] }), {
    issuer: ISSUER,
    audience: "authenticated",
  });

  async function sign(
    sub: string,
    overrides: { role?: string; issuer?: string; expiresIn?: string; key?: CryptoKey } = {},
  ) {
    return new SignJWT({ role: overrides.role ?? "authenticated" })
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .setSubject(sub)
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime(overrides.expiresIn ?? "1h")
      .sign(overrides.key ?? privateKey);
  }

  return { verifyToken, sign };
}

export async function createTestApp(db: Db, storage: MediaStorage | null = testStorage) {
  const keys = await createTestKeys();
  const app = await buildApp({ config: testConfig, db, verifyToken: keys.verifyToken, storage });
  return { app, sign: keys.sign };
}
