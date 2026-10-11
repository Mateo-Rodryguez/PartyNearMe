import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

describe("GET /me", () => {
  it("returns the signed-in user's own profile", async () => {
    const alice = await ctx.createUser();
    const res = await ctx.as(alice, { method: "GET", url: "/me" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: alice, username: null, interest_ids: [] });
  });

  it("never returns anything credential-like", async () => {
    const alice = await ctx.createUser();
    const body = (await ctx.as(alice, { method: "GET", url: "/me" })).body;
    expect(body).not.toMatch(/password|hash|email/i);
  });
});

describe("PATCH /me", () => {
  it("updates only the signed-in user, whatever the body says", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const res = await ctx.as(alice, {
      method: "PATCH",
      url: "/me",
      payload: { username: "alice", id: bob },
    });
    // Unknown fields such as "id" are rejected outright.
    expect(res.statusCode).toBe(400);

    const ok = await ctx.as(alice, { method: "PATCH", url: "/me", payload: { username: "alice", bio: "hi" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ id: alice, username: "alice", bio: "hi" });

    const bobProfile = await ctx.as(bob, { method: "GET", url: "/me" });
    expect(bobProfile.json()).toMatchObject({ id: bob, username: null, bio: null });
  });

  it("rejects a taken username with 409", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await ctx.as(alice, { method: "PATCH", url: "/me", payload: { username: "party" } });
    const res = await ctx.as(bob, { method: "PATCH", url: "/me", payload: { username: "party" } });
    expect(res.statusCode).toBe(409);
  });

  it("validates input", async () => {
    const alice = await ctx.createUser();
    for (const payload of [{}, { username: "A!" }, { bio: "x".repeat(301) }]) {
      const res = await ctx.as(alice, { method: "PATCH", url: "/me", payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });
});

describe("PUT /me/interests", () => {
  it("replaces the list, and an empty list clears it", async () => {
    const alice = await ctx.createUser();
    const set = await ctx.as(alice, { method: "PUT", url: "/me/interests", payload: { interest_ids: [3, 1] } });
    expect(set.json().interest_ids).toEqual([1, 3]);

    const cleared = await ctx.as(alice, { method: "PUT", url: "/me/interests", payload: { interest_ids: [] } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().interest_ids).toEqual([]);
  });

  it("rejects unknown and duplicate interests", async () => {
    const alice = await ctx.createUser();
    expect((await ctx.as(alice, { method: "PUT", url: "/me/interests", payload: { interest_ids: [999] } })).statusCode).toBe(400);
    expect((await ctx.as(alice, { method: "PUT", url: "/me/interests", payload: { interest_ids: [1, 1] } })).statusCode).toBe(400);
  });
});

describe("GET /interests", () => {
  it("lists the 10 interests", async () => {
    const alice = await ctx.createUser();
    const res = await ctx.as(alice, { method: "GET", url: "/interests" });
    expect(res.json()).toHaveLength(10);
  });
});

describe("following and blocking", () => {
  it("follows and unfollows, with counts on the public profile", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();

    expect((await ctx.as(alice, { method: "PUT", url: `/users/${bob}/follow` })).statusCode).toBe(204);
    // Idempotent
    expect((await ctx.as(alice, { method: "PUT", url: `/users/${bob}/follow` })).statusCode).toBe(204);

    const profile = await ctx.as(alice, { method: "GET", url: `/users/${bob}` });
    expect(profile.json()).toMatchObject({ id: bob, followers: 1, following: 0, is_following: true });

    expect((await ctx.as(alice, { method: "DELETE", url: `/users/${bob}/follow` })).statusCode).toBe(204);
    const after = await ctx.as(alice, { method: "GET", url: `/users/${bob}` });
    expect(after.json()).toMatchObject({ followers: 0, is_following: false });
  });

  it("cannot follow yourself or a user who doesn't exist", async () => {
    const alice = await ctx.createUser();
    expect((await ctx.as(alice, { method: "PUT", url: `/users/${alice}/follow` })).statusCode).toBe(400);
    const missing = "6f1c2a3e-5b7d-4c8e-9f00-112233445566";
    expect((await ctx.as(alice, { method: "PUT", url: `/users/${missing}/follow` })).statusCode).toBe(404);
    expect((await ctx.as(alice, { method: "GET", url: `/users/${missing}` })).statusCode).toBe(404);
    expect((await ctx.as(alice, { method: "GET", url: `/users/not-a-uuid` })).statusCode).toBe(400);
  });

  it("blocks a user", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    expect((await ctx.as(alice, { method: "PUT", url: `/users/${bob}/block` })).statusCode).toBe(204);
    const [row] = await ctx.db`select count(*)::int as n from public.blocks where blocker_id = ${alice} and blocked_id = ${bob}`;
    expect(row?.n).toBe(1);
  });
});

describe("row-level security inside the API", () => {
  it("runs queries as the signed-in user, not as an admin", async () => {
    const alice = await ctx.createUser();
    const { asUser } = await import("../../src/db.js");
    const [who] = await asUser(ctx.db, alice, (tx) => tx`select current_user as role, auth.uid() as uid`);
    expect(who).toEqual({ role: "authenticated", uid: alice });
    await expect(asUser(ctx.db, alice, (tx) => tx`select * from public.outbox`)).rejects.toThrow(/permission denied/);
  });
});
