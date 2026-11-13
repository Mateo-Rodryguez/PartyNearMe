// Cloudflare Pages rewrites every app address to /200 (public/_redirects), so the
// built index.html is copied there as the empty app shell. index.html itself then
// gets the landing page drawn in ahead (src/prerender.tsx), for search engines and
// a first paint before the JavaScript runs; the app replaces it as it starts.
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const build = new URL('../build/', import.meta.url);
const ssr = new URL('../build-ssr/', import.meta.url);
copyFileSync(new URL('index.html', build), new URL('200.html', build));

const { render } = await import(new URL('prerender.js', ssr).href);
let body = render();
// React leaves the page's <title> and <meta> tags where they're drawn; they belong in <head>.
const head = [];
body = body.replace(/<(title|meta)\b[^>]*>(?:[^<]*<\/title>)?/g, (tag) => (head.push(tag), ''));
const shell = readFileSync(new URL('index.html', build), 'utf8');
if (!shell.includes('<div id="root"></div>')) throw new Error('index.html has no empty #root to draw into');
writeFileSync(
	new URL('index.html', build),
	shell.replace(/<title>[^<]*<\/title>/, head.join('')).replace('<div id="root"></div>', `<div id="root">${body}</div>`)
);
rmSync(ssr, { recursive: true });
console.log('Landing page drawn into index.html; 200.html is the app shell.');
