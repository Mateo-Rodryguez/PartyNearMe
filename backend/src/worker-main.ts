import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { openAiModerator } from "./worker/moderation.js";
import { r2ObjectStore } from "./worker/objectStore.js";
import { startWorker } from "./worker/worker.js";

// Background worker: processes outbox events (photo processing, moderation,
// storage cleanup). Run alongside the API: `npm run worker`.
const config = loadConfig();
const missing = (["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "OPENAI_API_KEY"] as const).filter(
  (k) => !config[k],
);
if (missing.length > 0) throw new Error(`Worker needs: ${missing.join(", ")}`);

const log = {
  info: (obj: object, msg: string) => console.log(JSON.stringify({ level: "info", msg, ...obj })),
  error: (obj: object, msg: string) => console.error(JSON.stringify({ level: "error", msg, ...obj })),
};

const db = createDb(config.DATABASE_URL);
const worker = startWorker({
  db,
  log,
  store: r2ObjectStore({
    accountId: config.R2_ACCOUNT_ID as string,
    bucket: config.R2_BUCKET,
    accessKeyId: config.R2_ACCESS_KEY_ID as string,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY as string,
  }),
  moderator: openAiModerator(config.OPENAI_API_KEY as string),
});
log.info({}, "worker started");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void worker
      .stop()
      .then(() => db.end())
      .then(() => process.exit(0));
  });
}
