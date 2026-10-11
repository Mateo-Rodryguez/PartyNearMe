import { buildApp } from "./app.js";
import { supabaseTokenVerifier } from "./auth.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const app = await buildApp({ config, db, verifyToken: supabaseTokenVerifier(config.SUPABASE_URL) });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app
      .close()
      .then(() => db.end())
      .then(() => process.exit(0));
  });
}

await app.listen({ host: "0.0.0.0", port: config.PORT });
