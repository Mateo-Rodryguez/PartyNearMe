// Every app page must boot the app shell on Cloudflare Pages (static/_redirects),
// or opening its address directly gives a 404. Fails when a route is missing there.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const routes = new URL('../src/routes/', import.meta.url).pathname;
const rules = readFileSync(new URL('../static/_redirects', import.meta.url), 'utf8')
	.split('\n')
	.filter((line) => line.trim() && !line.startsWith('#'))
	.map((line) => line.trim().split(/\s+/)[0]);

function pages(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return pages(path);
		return name === '+page.svelte' ? [dir] : [];
	});
}

const missing = pages(routes)
	.map((dir) =>
		('/' + relative(routes, dir).split(sep).filter((part) => !/^\(.*\)$/.test(part)).join('/')).replace(/\[[^\]]+\]/g, '*')
	)
	.filter((path) => path !== '/') // Prerendered as index.html.
	.filter((path) => !rules.some((rule) => rule === path || (rule.endsWith('/*') && path.startsWith(rule.slice(0, -1)))));

if (missing.length) {
	console.error(`Add these to static/_redirects:\n${missing.join('\n')}`);
	process.exit(1);
}
console.log('Every app page boots the app shell.');
