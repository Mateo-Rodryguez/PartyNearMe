// Every app page must boot the app shell on Cloudflare Pages (public/_redirects),
// or opening its address directly gives a 404. Fails when a route is missing there.
import { readFileSync } from 'node:fs';

const lines = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
	.split('\n')
	.filter((line) => line.trim() && !line.startsWith('#'))
	.map((line) => line.trim().split(/\s+/));
const rules = lines.map(([from]) => from);

// Pages turns a rewrite to "/x.html" into a redirect to "/x", which changes the
// address the app sees; the shell must be addressed as /200.
const wrong = lines.filter(([, to, status]) => to !== '/200' || status !== '200');
if (wrong.length) {
	console.error(`Each rule must rewrite to "/200 200":\n${wrong.map((l) => l.join(' ')).join('\n')}`);
	process.exit(1);
}

// The addresses in src/routes.tsx, with :params as *.
const routes = readFileSync(new URL('../src/routes.tsx', import.meta.url), 'utf8');
const missing = [...routes.matchAll(/path: '([^']+)'/g)]
	.map(([, path]) => path.replace(/:[^/]+/g, '*'))
	.filter((path) => path !== '/' && path !== '*') // / is index.html; * is the not-found page.
	.filter((path) => !rules.some((rule) => rule === path || (rule.endsWith('/*') && path.startsWith(rule.slice(0, -1)))));

if (missing.length) {
	console.error(`Add these to public/_redirects:\n${missing.join('\n')}`);
	process.exit(1);
}
console.log('Every app page boots the app shell.');
