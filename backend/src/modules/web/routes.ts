import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../../db.js";
import { pictureUrl } from "../media.js";
import { resetPasswordCsp, resetPasswordPage } from "./resetPassword.js";
import { notFoundPage, partyPage, postPage, shareCsp, type SharedParty, type SharedPost } from "./share.js";

const idParams = z.object({ id: z.guid() });

/** Public web pages that need no sign-in, besides the legal ones. */
export const webRoutes: FastifyPluginAsync<{
  db: Db;
  supabaseUrl: string;
  publishableKey: string | undefined;
  mediaBaseUrl: string | undefined;
}> = async (app, { db, supabaseUrl, publishableKey, mediaBaseUrl }) => {
  const reset = resetPasswordPage(supabaseUrl, publishableKey);
  app.get("/reset-password", (_request, reply) =>
    reply
      .type("text/html; charset=utf-8")
      .header("content-security-policy", resetPasswordCsp(supabaseUrl))
      .header("cache-control", "no-store")
      .send(reset),
  );

  const html = (reply: FastifyReply, status: number, body: string) =>
    reply
      .status(status)
      .type("text/html; charset=utf-8")
      .header("content-security-policy", shareCsp(mediaBaseUrl))
      .header("cache-control", status === 200 ? "public, max-age=300" : "no-store")
      .send(body);
  const selfUrl = (request: FastifyRequest) => `${request.protocol}://${request.host}${request.url.split("?")[0]}`;
  const parseId = (request: FastifyRequest) => idParams.safeParse(request.params).data?.id;

  // These run as the owner, so they check visibility themselves: only what any
  // signed-in user could see in the app.
  app.get("/e/:id", async (request, reply) => {
    const id = parseId(request);
    const [party] = id
      ? await db<SharedParty[]>`
          -- A private party's venue is only for its guest list, never on a public page.
          select e.id, e.title, e.starts_at, case when e.is_private then null else e.venue_name end as venue_name,
                 e.status, e.is_private,
                 (select count(*)::int from public.rsvps r where r.event_id = e.id and r.status = 'going') as going_count,
                 ${pictureUrl(db, mediaBaseUrl, "e.cover_variants", "1080")} as cover_url
          from public.events e
          where e.id = ${id} and e.status in ('published', 'cancelled')
        `
      : [];
    return party ? html(reply, 200, partyPage(party, selfUrl(request))) : html(reply, 404, notFoundPage("party"));
  });

  app.get("/p/:id", async (request, reply) => {
    const id = parseId(request);
    const [post] = id
      ? await db<SharedPost[]>`
          select p.id, coalesce(a.display_name, '@' || a.username, 'Someone') as author_name, p.caption, p.like_count,
                 ${mediaBaseUrl ? db`${mediaBaseUrl}::text || '/' || m.storage_key` : db`null::text`} as photo_url
          from public.posts p
          join public.profiles a on a.id = p.author_id
          left join public.post_media m on m.post_id = p.id and m.position = 0
          where p.id = ${id} and p.status = 'visible'
        `
      : [];
    return post ? html(reply, 200, postPage(post, selfUrl(request))) : html(reply, 404, notFoundPage("post"));
  });
};
