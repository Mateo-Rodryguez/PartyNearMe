import type { Db } from "./db.js";
import { HttpError } from "./errors.js";

/**
 * How often one person may do each thing. Counted from their own recent rows,
 * so limits hold across restarts and server instances without Redis. Generous
 * for real use; they exist to stop scripts and spam floods.
 */
export const LIMITS = {
  upload: { table: "uploads", column: "user_id", windows: [{ max: 60, interval: "1 hour" }, { max: 300, interval: "1 day" }] },
  post: { table: "posts", column: "author_id", windows: [{ max: 20, interval: "1 hour" }, { max: 60, interval: "1 day" }] },
  event: { table: "events", column: "organiser_id", windows: [{ max: 10, interval: "1 day" }] },
  message: { table: "messages", column: "sender_id", windows: [{ max: 20, interval: "1 minute" }, { max: 1000, interval: "1 day" }] },
  report: { table: "reports", column: "reporter_id", windows: [{ max: 30, interval: "1 day" }] },
} as const;

export type LimitedAction = keyof typeof LIMITS;

const MESSAGES: Record<LimitedAction, string> = {
  upload: "You've uploaded a lot of photos. Try again later.",
  post: "You've posted a lot recently. Try again later.",
  event: "You've created a lot of parties today. Try again tomorrow.",
  message: "You're sending messages too fast. Wait a moment and try again.",
  report: "You've sent a lot of reports today. Try again tomorrow.",
};

/** Throws 429 when the user has already used up a limit. Runs as the owner. */
export async function checkLimit(db: Db, userId: string, action: LimitedAction): Promise<void> {
  const { table, column, windows } = LIMITS[action];
  for (const { max, interval } of windows) {
    const [row] = await db<{ n: number }[]>`
      select count(*)::int as n from (
        select 1 from ${db(`public.${table}`)}
        where ${db(column)} = ${userId} and created_at > now() - ${interval}::interval
        limit ${max}
      ) recent
    `;
    if ((row?.n ?? 0) >= max) throw new HttpError(429, MESSAGES[action]);
  }
}
