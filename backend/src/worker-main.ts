import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { startWorkerFromConfig } from "./worker/fromConfig.js";

// Background worker: processes outbox events (photo processing, moderation,
// storage cleanup). Run alongside the API: `npm run worker`.
const config = loadConfig();

const log = {
  info: (obj: object, msg: string) => console.log(JSON.stringify({ level: "info", msg, ...obj })),
  error: (obj: object, msg: string) => console.error(JSON.stringify({ level: "error", msg, ...obj })),
};

const db = createDb(config.DATABASE_URL);
const worker = startWorkerFromConfig(config, db, log);
log.info({}, "worker started");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void worker
      .stop()
      .then(() => db.end())
      .then(() => process.exit(0));
  });
}
