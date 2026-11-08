import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

const send = (userId: string, payload: Record<string, unknown>) =>
  ctx.as(userId, { method: "POST", url: "/feedback", payload: { platform: "android", ...payload } });

describe("POST /feedback", () => {
  it("keeps what people tell us, under their account", async () => {
    const alice = await ctx.createUser();
    expect((await send(alice, { kind: "love", body: "The party map is great", screen: "nearby", app_version: "1.0" })).statusCode).toBe(204);
    expect((await send(alice, { kind: "nps", score: 9 })).statusCode).toBe(204);
    expect((await send(alice, { kind: "nps", score: 3, body: "Not many parties near me" })).statusCode).toBe(204);
    expect((await send(alice, { kind: "heard_from", body: "friend" })).statusCode).toBe(204);

    const rows = await ctx.db<{ kind: string; score: number | null; body: string | null; screen: string | null }[]>`
      select kind, score, body, screen from public.feedback where user_id = ${alice} order by created_at, kind
    `;
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.kind === "love")).toMatchObject({ body: "The party map is great", screen: "nearby" });
    expect(rows.filter((r) => r.kind === "nps").map((r) => r.score).sort()).toEqual([3, 9]);
  });

  it("turns away incomplete or unknown answers", async () => {
    const alice = await ctx.createUser();
    expect((await send(alice, { kind: "nps" })).statusCode).toBe(400);
    expect((await send(alice, { kind: "nps", score: 11 })).statusCode).toBe(400);
    expect((await send(alice, { kind: "idea" })).statusCode).toBe(400);
    expect((await send(alice, { kind: "idea", body: "x", score: 5 })).statusCode).toBe(400);
    expect((await send(alice, { kind: "heard_from", body: "a billboard" })).statusCode).toBe(400);
    expect((await send(alice, { kind: "love", body: "hi", platform: "web" })).statusCode).toBe(400);
    expect((await send(alice, { kind: "love", body: "hi", user_id: alice })).statusCode).toBe(400);
  });

  it("is private: nobody can read feedback back through the Data API", async () => {
    const alice = await ctx.createUser();
    await send(alice, { kind: "problem", body: "Upload failed" });
    const read = ctx.db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${alice}, true), set_config('role', 'authenticated', true)`;
      return tx`select 1 from public.feedback`;
    });
    await expect(read).rejects.toThrow(/permission denied/);
  });

  it("limits how much one person can send in a day", async () => {
    const alice = await ctx.createUser();
    for (let i = 0; i < 20; i++) expect((await send(alice, { kind: "idea", body: `idea ${i}` })).statusCode).toBe(204);
    expect((await send(alice, { kind: "idea", body: "one more" })).statusCode).toBe(429);
  });

  it("outlives the account, no longer linked to it", async () => {
    const alice = await ctx.createUser();
    await send(alice, { kind: "leaving", body: "No parties in my town" });
    await ctx.db`delete from auth.users where id = ${alice}`;
    const rows = await ctx.db<{ user_id: string | null; kind: string }[]>`
      select user_id, kind from public.feedback where body = 'No parties in my town'
    `;
    expect(rows).toEqual([{ user_id: null, kind: "leaving" }]);
  });
});
