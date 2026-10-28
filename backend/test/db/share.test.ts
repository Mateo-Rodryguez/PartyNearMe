import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

const get = (url: string) => ctx.app.inject({ method: "GET", url });

async function party(organiser: string, status = "published", title = "Rooftop <Sunset>") {
  const [row] = await ctx.db<{ id: string }[]>`
    insert into public.events (organiser_id, title, starts_at, venue_name, location, status)
    values (${organiser}, ${title}, '2026-11-07 21:00+00', 'Skyline Bar',
            extensions.st_point(-0.1, 51.5)::extensions.geography, ${status})
    returning id
  `;
  return row?.id ?? "";
}

describe("share link pages", () => {
  it("shows a party's preview to anyone, without signing in", async () => {
    const alice = await ctx.createUser();
    const id = await party(alice);
    const res = await get(`/e/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/html/);
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.body).toContain(`<meta property="og:title" content="Rooftop &lt;Sunset&gt;">`);
    expect(res.body).toContain("Sat 7 Nov, 21:00 · Skyline Bar");
    expect(res.body).toContain(`href="partynearme://party/${id}"`);
    expect(res.body).not.toContain("<Sunset>");
  });

  it("says cancelled, and hides drafts and removed parties", async () => {
    const alice = await ctx.createUser();
    expect((await get(`/e/${await party(alice, "cancelled")}`)).body).toContain("Cancelled");
    expect((await get(`/e/${await party(alice, "draft")}`)).statusCode).toBe(404);
    expect((await get(`/e/${await party(alice, "removed")}`)).statusCode).toBe(404);
    expect((await get("/e/not-an-id")).statusCode).toBe(404);
  });

  it("shows a visible post with its first photo, and nothing for hidden ones", async () => {
    const alice = await ctx.createUser();
    await ctx.db`update public.profiles set display_name = 'Alice' where id = ${alice}`;
    const [post] = await ctx.db<{ id: string }[]>`
      insert into public.posts (author_id, status, caption) values (${alice}, 'visible', 'What a night') returning id
    `;
    const id = post?.id ?? "";
    await ctx.db`insert into public.post_media (post_id, position, storage_key) values (${id}, 0, ${`media/${id}/0-1080.webp`})`;
    const res = await get(`/p/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(`content="Alice on PartyNearMe"`);
    expect(res.body).toContain(`<meta property="og:image" content="https://media.test/media/${id}/0-1080.webp">`);
    expect(res.body).toContain("What a night");

    await ctx.db`update public.posts set status = 'hidden' where id = ${id}`;
    expect((await get(`/p/${id}`)).statusCode).toBe(404);
  });
});
