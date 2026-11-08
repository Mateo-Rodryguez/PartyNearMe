/**
 * Which browser origins may call the API. Entries are exact origins, or
 * "https://*.host" for any subdomain of host (Cloudflare Pages previews).
 */
export function originMatcher(allowed: string[]): (origin: string) => boolean {
  const exact = new Set(allowed.filter((entry) => !entry.includes("*")));
  const wildcards = allowed
    .filter((entry) => entry.includes("*"))
    .map((entry) => {
      const match = /^(https?):\/\/\*\.(.+)$/.exec(entry);
      if (!match) throw new Error(`WEB_ORIGINS: "${entry}" must look like https://*.example.com`);
      const [, scheme, host] = match;
      return { prefix: `${scheme}://`, suffix: `.${host}` };
    });
  return (origin) => {
    if (exact.has(origin)) return true;
    return wildcards.some(({ prefix, suffix }) => {
      if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false;
      const sub = origin.slice(prefix.length, origin.length - suffix.length);
      // One label only: letters, digits and dashes, so "evil.com/x.partynearme.pages.dev" can't sneak in.
      return /^[a-z0-9-]+$/i.test(sub);
    });
  };
}
