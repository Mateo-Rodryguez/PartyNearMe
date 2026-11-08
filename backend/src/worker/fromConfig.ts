import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { openAiModerator } from "./moderation.js";
import { apnsPusher, fcmPusher, parseServiceAccount, platformPusher } from "./push.js";
import { r2ObjectStore } from "./objectStore.js";
import { startWorker, type WorkerDeps } from "./worker.js";

/** Starts the outbox worker with R2 and OpenAI from config; throws if any setting is missing. */
export function startWorkerFromConfig(config: Config, db: Db, log: WorkerDeps["log"]) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, OPENAI_API_KEY } = config;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !OPENAI_API_KEY) {
    const missing = Object.entries({ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, OPENAI_API_KEY })
      .filter(([, v]) => !v)
      .map(([k]) => k);
    throw new Error(`Worker needs: ${missing.join(", ")}`);
  }
  return startWorker({
    db,
    log,
    store: r2ObjectStore({
      accountId: R2_ACCOUNT_ID,
      bucket: config.R2_BUCKET,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    }),
    moderator: openAiModerator(OPENAI_API_KEY),
    pusher: platformPusher(
      config.FIREBASE_SERVICE_ACCOUNT ? fcmPusher(parseServiceAccount(config.FIREBASE_SERVICE_ACCOUNT)) : null,
      config.APNS_KEY && config.APNS_KEY_ID && config.APNS_TEAM_ID
        ? apnsPusher({
          key: config.APNS_KEY,
          keyId: config.APNS_KEY_ID,
          teamId: config.APNS_TEAM_ID,
          bundleId: config.APNS_BUNDLE_ID,
          sandbox: config.APNS_SANDBOX,
        })
        : null,
    ),
  });
}
