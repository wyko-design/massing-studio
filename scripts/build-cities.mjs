// Builds data/cities/<CC>.json from GeoNames cities15000 (CC BY 4.0, https://www.geonames.org/).
// One-off: `node scripts/build-cities.mjs` (needs network, and `tar` or `unzip`). The output is committed.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const URL = "https://download.geonames.org/export/dump/cities15000.zip";
const OUT = path.resolve(import.meta.dirname, "..", "data", "cities");
const tmp = mkdtempSync(path.join(tmpdir(), "cities-"));
const zip = path.join(tmp, "cities15000.zip");

const res = await fetch(URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
try {
  execFileSync("tar", ["-xf", zip, "-C", tmp]);
} catch {
  execFileSync("unzip", ["-o", zip, "-d", tmp]);
}

const norm = (s) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
const latin = (s) => /^[\p{Script=Latin}0-9 .'’\-]+$/u.test(s) && s.length <= 32;

/** GeoNames columns: 0 id, 1 name, 2 asciiname, 3 alternatenames, 4 lat, 5 lon, 8 country, 14 population. */
const byCountry = new Map();
for (const line of readFileSync(path.join(tmp, "cities15000.txt"), "utf8").split("\n")) {
  const c = line.split("\t");
  if (c.length < 15) continue;
  const [, name, ascii, alts] = c;
  const seen = new Set([norm(name), norm(ascii)]);
  const alternates = [];
  for (const a of alts.split(",")) {
    if (!latin(a) || seen.has(norm(a))) continue;
    seen.add(norm(a));
    alternates.push(a);
    if (alternates.length >= 60) break;
  }
  const row = { n: name, a: alternates, y: +Number(c[4]).toFixed(4), x: +Number(c[5]).toFixed(4), p: Number(c[14]) };
  if (norm(ascii) !== norm(name)) row.a.unshift(ascii);
  (byCountry.get(c[8]) ?? byCountry.set(c[8], []).get(c[8])).push(row);
}

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [cc, rows] of byCountry) {
  rows.sort((a, b) => b.p - a.p);
  writeFileSync(path.join(OUT, `${cc}.json`), JSON.stringify(rows));
  total += rows.length;
}
writeFileSync(
  path.join(OUT, "README.md"),
  "# Cities\n\nOne file per ISO 3166-1 alpha-2 country: cities with 15 000+ inhabitants, largest first.\n`n` name, `a` alternate Latin names, `y`/`x` latitude/longitude, `p` population.\n\nSource: GeoNames cities15000 (https://www.geonames.org/), licensed CC BY 4.0. Rebuild with `node scripts/build-cities.mjs`.\n",
);
rmSync(tmp, { recursive: true, force: true });
console.log(`${total} cities in ${byCountry.size} countries → ${OUT}`);
