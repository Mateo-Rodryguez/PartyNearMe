import postgres, { type Sql, type TransactionSql } from "postgres";

export type Db = Sql;
export type Tx = TransactionSql;

export function createDb(url: string): Db {
  return postgres(url, {
    max: 10,
    // Supabase's pooler (transaction mode) does not support prepared statements.
    prepare: false,
  });
}

/**
 * Runs fn in a transaction as the given user, the same way Supabase's Data API
 * does: as the `authenticated` role with the user's id in the JWT claims. Every
 * query inside is subject to the row-level security policies, so a bug in a
 * route cannot read or change another user's rows.
 */
export async function asUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  const result = await db.begin(async (tx) => {
    await tx`
      select
        set_config('request.jwt.claims', ${claims}, true),
        set_config('request.jwt.claim.sub', ${userId}, true),
        set_config('role', 'authenticated', true)
    `;
    return fn(tx);
  });
  return result as T;
}
