import { buildApp } from "./app.js";
import { supabaseTokenVerifier } from "./auth.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { sentryReporter } from "./monitoring.js";
import { r2Storage } from "./storage.js";
import { startWorkerFromConfig } from "./worker/fromConfig.js";

const config = loadConfig();
const reportError = sentryReporter(config.SENTRY_DSN, config.NODE_ENV, "api");
const db = createDb(config.DATABASE_URL);
const storage =
  config.R2_ACCOUNT_ID && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY
    ? r2Storage({
        accountId: config.R2_ACCOUNT_ID,
        bucket: config.R2_BUCKET,
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      })
    : null;
const app = await buildApp({ config, db, verifyToken: supabaseTokenVerifier(config.SUPABASE_URL), storage, reportError });
if (!storage) app.log.warn("R2 is not configured: photo uploads are disabled");
const worker = config.RUN_WORKER
  ? startWorkerFromConfig(config, db, {
      info: (obj, msg) => app.log.info(obj, msg),
      error: (obj, msg) => {
        app.log.error(obj, msg);
        reportError(new Error(msg), { ...obj });
      },
    })
  : null;
if (worker) app.log.info("photo worker running in this process");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void Promise.all([app.close(), worker?.stop()])
      .then(() => db.end())
      .then(() => process.exit(0));
  });
}

await app.listen({ host: "0.0.0.0", port: config.PORT });
