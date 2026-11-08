// Checks that the Android and iPhone themes still carry design/tokens.json's
// colours, so a brand change can't land on one platform only. Run by the web CI.
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").toUpperCase();
const tokens = JSON.parse(readFileSync(new URL("tokens.json", import.meta.url), "utf8"));
const kotlin = read("app/ui/src/commonMain/kotlin/com/partynearme/ui/Theme.kt");
const swift = read("ios/PartyNearMe/Design/Theme.swift");

const hex = (value) => value.replace("#", "").toUpperCase();
// White is Color.White on Android, so only the brand colours are checked.
const solid = (value) => /^#[0-9a-f]{6}$/i.test(value) && value.toUpperCase() !== "#FFFFFF";
const palettes = ["night", "day"].flatMap((mode) =>
  Object.entries(tokens[mode]).flatMap(([role, value]) =>
    (Array.isArray(value) ? value : [value]).filter(solid).map((color) => ({ name: `${mode}.${role}`, color })),
  ),
);
const all = [
  ...Object.entries(tokens.brand).map(([name, color]) => ({ name: `brand.${name}`, color })),
  ...palettes,
  ...tokens.covers.flat().map((color) => ({ name: "covers", color })),
];
// The iPhone theme names fewer roles than Material does on Android.
const swiftRoles = /^(brand\.|(night|day)\.(gradient|sunset|primary|background|onBackground|surface|surfaceHigh|onSurfaceVariant|outlineVariant|error)$)/;

const missing = [
  ...all.filter(({ color }) => !kotlin.includes(`0XFF${hex(color)}`)).map(({ name, color }) => `Theme.kt lacks ${name} ${color}`),
  ...all
    .filter(({ name }) => swiftRoles.test(name))
    .filter(({ color }) => !swift.includes(`0X${hex(color)}`))
    .map(({ name, color }) => `Theme.swift lacks ${name} ${color}`),
];
if (missing.length) {
  console.error(`design/tokens.json and the app themes disagree:\n${missing.join("\n")}`);
  process.exit(1);
}
console.log(`Theme.kt and Theme.swift match design/tokens.json (${all.length} colours).`);
