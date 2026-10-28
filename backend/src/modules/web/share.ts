import { escapeHtml } from "../legal/pages.js";

/**
 * Public pages behind share links (/e/<party>, /p/<post>): what a link preview
 * in WhatsApp, iMessage or Instagram shows, plus a button that opens the app.
 * They only show what the app already shows any signed-in user, and nothing
 * for hidden posts or removed parties.
 */

export interface SharedParty {
  id: string;
  title: string;
  starts_at: Date;
  venue_name: string | null;
  status: string;
  is_private: boolean;
  going_count: number;
  cover_url: string | null;
}

export interface SharedPost {
  id: string;
  author_name: string;
  caption: string | null;
  like_count: number;
  photo_url: string | null;
}

/** Shown in UK time: the app is launching in London and previews can't know the reader's zone. */
const when = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function sharePage(o: {
  title: string;
  description: string;
  image: string | null;
  url: string;
  appLink: string;
  body: string;
}): string {
  const t = escapeHtml(o.title);
  const d = escapeHtml(o.description);
  const meta = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="PartyNearMe">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${escapeHtml(o.url)}">`,
    `<meta name="description" content="${d}">`,
    o.image ? `<meta property="og:image" content="${escapeHtml(o.image)}">` : "",
    `<meta name="twitter:card" content="${o.image ? "summary_large_image" : "summary"}">`,
  ].filter(Boolean).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t} · PartyNearMe</title>
${meta}
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, sans-serif; background: #0d0b14; color: #f4f0fa; }
  main { max-width: 30rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  .brand { font-weight: 800; letter-spacing: .02em; background: linear-gradient(90deg, #ff3d8b, #8b5cf6);
           -webkit-background-clip: text; background-clip: text; color: transparent; }
  img { width: 100%; border-radius: 1.25rem; margin: 1rem 0; display: block; }
  h1 { font-size: 1.6rem; line-height: 1.2; margin: .5rem 0; }
  .muted { color: #b3a9c6; }
  .pill { display: inline-block; padding: .2rem .7rem; border-radius: 99px; background: #2a2238; font-size: .85rem; }
  .open { display: block; text-align: center; margin-top: 1.5rem; padding: .9rem; border-radius: 99px; color: #fff;
          font-weight: 700; text-decoration: none; background: linear-gradient(90deg, #ff3d8b, #8b5cf6); }
</style>
</head>
<body>
<main>
<div class="brand">PartyNearMe</div>
${o.image ? `<img src="${escapeHtml(o.image)}" alt="">` : ""}
${o.body}
<a class="open" href="${escapeHtml(o.appLink)}">Open in PartyNearMe</a>
<p class="muted">Don't have the app yet? PartyNearMe is coming soon to Android and iPhone.</p>
</main>
</body>
</html>`;
}

export function partyPage(p: SharedParty, url: string): string {
  const cancelled = p.status === "cancelled";
  const details = [when(p.starts_at), p.is_private ? "Private party" : p.venue_name].filter(Boolean).join(" · ");
  const going = p.going_count === 1 ? "1 person going" : `${p.going_count} people going`;
  return sharePage({
    title: p.title,
    description: cancelled ? `Cancelled · ${details}` : `${details} · ${going}`,
    image: p.cover_url,
    url,
    appLink: `partynearme://party/${p.id}`,
    body: `${cancelled ? `<span class="pill">Cancelled</span>` : ""}
<h1>${escapeHtml(p.title)}</h1>
<p>${escapeHtml(details)}</p>
<p class="muted">${escapeHtml(going)} (UK time)</p>`,
  });
}

export function postPage(p: SharedPost, url: string): string {
  const caption = p.caption ? shorten(p.caption, 200) : null;
  return sharePage({
    title: `${p.author_name} on PartyNearMe`,
    description: caption ?? "A photo from a night out",
    image: p.photo_url,
    url,
    appLink: `partynearme://post/${p.id}`,
    body: `<h1>${escapeHtml(p.author_name)}</h1>
${caption ? `<p>${escapeHtml(caption)}</p>` : ""}
<p class="muted">${p.like_count === 1 ? "1 like" : `${p.like_count} likes`}</p>`,
  });
}

export const notFoundPage = (what: string) =>
  sharePage({
    title: `This ${what} isn't available`,
    description: "It may have been deleted, or the link is wrong.",
    image: null,
    url: "",
    appLink: "partynearme://",
    body: `<h1>This ${escapeHtml(what)} isn't available</h1><p class="muted">It may have been deleted, or the link is wrong.</p>`,
  });

/** Images come only from the photo bucket; no scripts at all. */
export const shareCsp = (mediaBaseUrl: string | undefined) =>
  `default-src 'none'; img-src ${mediaBaseUrl ?? "'none'"}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
