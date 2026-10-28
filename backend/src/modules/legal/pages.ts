/**
 * The privacy policy and terms, served as plain web pages because both app stores
 * want a public link to them. Written for this app as built; not legal advice, so
 * have them checked before launch. The contact address comes from CONTACT_EMAIL.
 */

export const LAST_UPDATED = "28 October 2026";
export const MINIMUM_AGE = 18;

export const page = (title: string, body: string, head = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · PartyNearMe</title>
<style>
  :root { color-scheme: light dark; --accent: #d6246e; }
  body { font: 16px/1.6 system-ui, -apple-system, sans-serif; max-width: 42rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
  h1 { color: var(--accent); line-height: 1.2; }
  h2 { margin-top: 2rem; font-size: 1.15rem; }
  a { color: var(--accent); }
  .updated { opacity: .7; }
</style>
${head}
</head>
<body>
<h1>${title}</h1>
${body}
</body>
</html>`;

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const updated = `<p class="updated">Last updated ${LAST_UPDATED}</p>`;

const contactLine = (email: string | undefined) =>
  email
    ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
    : "the contact address in the app's store listing";

export function privacyPage(contactEmail?: string): string {
  const contact = contactLine(contactEmail);
  return page("Privacy policy", `${updated}
<p>PartyNearMe helps people find parties and events near them, share photos from them and chat.
This page explains what the app collects, why, who else handles it, and how to delete it.
Questions: ${contact}.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Account:</strong> your email address and a password (stored hashed by our sign-in provider, never readable by us),
    or, if you sign in with Google, the email address and name Google shares with us.</li>
  <li><strong>Profile:</strong> username, display name, bio and the interests you pick. Your profile is visible to other users.</li>
  <li><strong>Photos and captions</strong> you post. Photos are shrunk on your phone and re-encoded, which removes their
    location and camera metadata. Posts are public to other users.</li>
  <li><strong>Shared links:</strong> when someone shares a party or post, the link opens a public web page showing its
    title, time and venue (for a party) or the first photo, caption and author's name (for a post), so link previews
    work. Hidden posts and removed parties show nothing.</li>
  <li><strong>Location:</strong> only when you use it, to show parties near you or to place a party or post on the map.
    We store the location of the parties and posts you publish, not a history of where you go.</li>
  <li><strong>Events and RSVPs</strong> you create or answer, which other users can see.</li>
  <li><strong>Messages</strong> you send. They are stored on our servers so they reach the other person; they are not
    end-to-end encrypted.</li>
  <li><strong>Activity in the app</strong>, such as which posts you viewed or liked, used only to order your feed.</li>
  <li><strong>A push notification token</strong> for your phone, if you allow notifications.</li>
  <li><strong>Reports</strong> you file about content or users, which only moderators see.</li>
</ul>
<p>We don't sell your data, show ads, or use advertising or analytics trackers.</p>

<h2>Why we use it</h2>
<p>To run the service you asked for (your account, feed, map, chat and notifications), to keep it safe
(checking photos and captions for harmful content, handling reports, preventing abuse), and to fix problems.
Under GDPR the legal basis is performing our agreement with you, and our legitimate interest in keeping the
community safe.</p>

<h2>Who else handles it</h2>
<ul>
  <li>Supabase (database and sign-in), hosted in Ireland, EU.</li>
  <li>Render (our server), hosted in Frankfurt, EU.</li>
  <li>Cloudflare R2 (photo storage and delivery).</li>
  <li>OpenAI (automatic moderation of photos and captions; not used to train their models through this API).</li>
  <li>Google Firebase Cloud Messaging (delivering notifications), and Google sign-in if you choose it.</li>
  <li>Sentry (crash and error reports, stored in the EU; these hold technical details and your account ID, not your posts or messages).</li>
</ul>
<p>They process data only on our behalf. Some may process it outside the EU under standard contractual clauses.</p>

<h2>How long we keep it</h2>
<p>As long as your account exists. Deleting a post deletes its photos. Deleting your account deletes your profile,
posts, photos, events, RSVPs, messages, likes, follows and reports straight away, and the photo files shortly after.
Server logs are kept for a short time to fix problems.</p>

<h2>Deleting your account</h2>
<p>In the app: Profile, the ⋮ menu, <em>Delete account</em>. You can also email ${contact} and we'll do it for you.</p>

<h2>Your rights</h2>
<p>You can see and correct most of your data in the app. You can ask us for a copy of your data, its deletion,
or to stop or limit processing, and you can complain to your data protection authority.</p>

<h2>Age</h2>
<p>PartyNearMe is for people aged ${MINIMUM_AGE} and over. We delete accounts we learn belong to anyone younger.</p>

<h2>Changes</h2>
<p>If this policy changes in a way that matters, we'll say so in the app before it takes effect.</p>
`);
}

export function termsPage(contactEmail?: string): string {
  const contact = contactLine(contactEmail);
  return page("Terms of use", `${updated}
<p>By using PartyNearMe you agree to these terms. Questions: ${contact}.</p>

<h2>Who can use it</h2>
<p>You must be at least ${MINIMUM_AGE}. One account per person; keep your password to yourself.</p>

<h2>No tolerance for objectionable content or abusive users</h2>
<p>Don't post or send anything that is illegal, hateful, harassing, threatening, sexually explicit, violent,
shows or promotes drug use or dangerous behaviour, invades someone's privacy (including photos of people who
didn't agree to them), or is spam or a scam. Don't use the app to stalk, bully or impersonate anyone.</p>
<p>Photos and captions are checked automatically, and anyone can report a post, party, message or user from
inside the app. You can block any user, which stops them messaging you and removes their posts from your feed.
We review reports within 24 hours, remove content that breaks these terms, and suspend or delete the accounts
that posted it.</p>

<h2>Your content</h2>
<p>You keep the rights to what you post. You let us store, show and send it to other users so the app works, until
you delete it. Only post what you have the right to share.</p>

<h2>Parties and meetups</h2>
<p>Events are organised by users, not by us. We don't check them and aren't responsible for what happens at them.
Look after yourself and others, and follow local laws, including on alcohol.</p>

<h2>Ending</h2>
<p>You can delete your account at any time from the app. We may suspend or end accounts that break these terms.</p>

<h2>The service</h2>
<p>The app is provided as is, without warranties, and may change or stop. As far as the law allows, we aren't
liable for indirect losses or for content posted by users. Nothing here limits rights you have by law as a consumer.</p>

<p>See also the <a href="/privacy">privacy policy</a>.</p>
`);
}
