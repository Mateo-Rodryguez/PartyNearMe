import { describe, expect, it } from "vitest";
import { LIMITS } from "../../src/limits.js";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

describe("per-person limits", () => {
  it("stops a flood of messages, for that sender only", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const chat = (await ctx.as(alice, { method: "POST", url: "/conversations", payload: { user_id: bob } })).json().id as string;
    const send = (userId: string) =>
      ctx.as(userId, { method: "POST", url: `/conversations/${chat}/messages`, payload: { body: "hi" } });

    const perMinute = LIMITS.message.windows[0].max;
    for (let i = 0; i < perMinute; i++) expect((await send(alice)).statusCode).toBe(201);
    const blocked = await send(alice);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().message).toMatch(/too fast/);
    expect((await send(bob)).statusCode).toBe(201);

    // Older messages stop counting once they leave the window.
    await ctx.db`update public.messages set created_at = now() - interval '2 minutes' where sender_id = ${alice}`;
    expect((await send(alice)).statusCode).toBe(201);
  });

  it("limits posts, uploads, parties and reports", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();

    await ctx.db`
      insert into public.uploads (user_id, storage_key, content_type, size_bytes)
      select ${alice}, 'uploads/' || ${alice} || '/' || g || '.jpg', 'image/jpeg', 1000
      from generate_series(1, ${LIMITS.upload.windows[0].max}) g
    `;
    const upload = await ctx.as(alice, { method: "POST", url: "/uploads", payload: { content_type: "image/jpeg", size_bytes: 1000 } });
    expect(upload.statusCode).toBe(429);

    await ctx.db`
      insert into public.posts (author_id, caption)
      select ${alice}, 'spam' from generate_series(1, ${LIMITS.post.windows[0].max})
    `;
    const post = await ctx.as(alice, { method: "POST", url: "/posts", payload: { upload_ids: ["00000000-0000-4000-8000-000000000000"] } });
    expect(post.statusCode).toBe(429);

    await ctx.db`
      insert into public.events (organiser_id, title, starts_at, location)
      select ${alice}, 'Party', now() + interval '1 day', 'SRID=4326;POINT(0 0)'::extensions.geography
      from generate_series(1, ${LIMITS.event.windows[0].max})
    `;
    const event = await ctx.as(alice, {
      method: "POST",
      url: "/events",
      payload: { title: "One more", starts_at: new Date(Date.now() + 86400000).toISOString(), lat: 0, lng: 0 },
    });
    expect(event.statusCode).toBe(429);

    await ctx.db`
      insert into public.reports (reporter_id, target_type, target_id, reason)
      select ${alice}, 'user', ${bob}, 'Spam' from generate_series(1, ${LIMITS.report.windows[0].max})
    `;
    const report = await ctx.as(alice, { method: "POST", url: "/reports", payload: { target_type: "user", target_id: bob, reason: "Spam" } });
    expect(report.statusCode).toBe(429);

    // Bob is unaffected.
    expect((await ctx.as(bob, { method: "POST", url: "/reports", payload: { target_type: "user", target_id: alice, reason: "Spam" } })).statusCode).toBe(204);
  });
});
