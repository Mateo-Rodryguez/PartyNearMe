// Turns ../design/tokens.json (shared with the Android and iPhone apps) into
// src/lib/tokens.css and src/lib/tokens.ts. Runs before dev and build.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const tokens = JSON.parse(readFileSync(new URL("../design/tokens.json", root), "utf8"));
const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function palette({ gradient, sunset, glow, ...colors }) {
  return [
    ...Object.entries(colors).map(([name, value]) => `--${kebab(name)}: ${value};`),
    `--gradient: linear-gradient(135deg, ${gradient.join(", ")});`,
    `--sunset: linear-gradient(135deg, ${sunset.join(", ")});`,
    `--glow-a: ${glow[0]};`,
    `--glow-b: ${glow[1]};`,
  ].map((line) => `\t${line}`).join("\n");
}

const brand = Object.entries(tokens.brand).map(([name, value]) => `\t--brand-${name}: ${value};`).join("\n");
const radius = Object.entries(tokens.radius).map(([name, value]) => `\t--radius-${name}: ${value}px;`).join("\n");

const css = `/* Generated from design/tokens.json by scripts/tokens.mjs. Don't edit by hand. */
:root {
${brand}
${radius}
	color-scheme: dark;
${palette(tokens.night)}
}
@media (prefers-color-scheme: light) {
	:root:not([data-theme="night"]) {
		color-scheme: light;
${palette(tokens.day).replaceAll("\t", "\t\t")}
	}
}
:root[data-theme="day"] {
	color-scheme: light;
${palette(tokens.day)}
}
`;

const ts = `// Generated from design/tokens.json by scripts/tokens.mjs. Don't edit by hand.
export const covers: ReadonlyArray<readonly [string, string]> = ${JSON.stringify(tokens.covers)};
`;

writeFileSync(new URL("src/lib/tokens.css", root), css);
writeFileSync(new URL("src/lib/tokens.ts", root), ts);
