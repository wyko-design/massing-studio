/**
 * How much of the planning rules can the live plan source fill? `npx tsx scripts/probe-zoning.ts "<address>" ...`
 * Runs address → parcel → RuimtelijkePlannenZoningProvider for each address (default: a spread over Delft) and prints what it found.
 * Responses are cached in a temp folder, not in data/cache.
 */
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CONSTRAINT_FIELDS, getField } from "@massing/shared";
import { createJsonFetcher } from "../src/cache/diskCache";
import { KadasterParcelProvider } from "../src/providers/nl/kadasterParcel";
import { LocatieserverGeocoder } from "../src/providers/nl/locatieserver";
import { RP_HEADERS, RP_PROVIDER, RuimtelijkePlannenZoningProvider, pointInside } from "../src/providers/nl/ruimtelijkePlannen";
import { restrictionNotes } from "../src/providers/nl/restrictions";
import { streetSideFor } from "../src/providers/nl/streetSide";

const DEFAULT = [
  "Hendrik Casimirstraat 8, Delft",
  "Markt 1, Delft",
  "Oude Delft 100, Delft",
  "Mekelweg 5, Delft",
  "Kanaalweg 2, Delft",
  "Westlandseweg 1, Delft",
  "Sint Sebastiaansweg 10, Delft",
  "Buitenhof 10, Delft",
  "Voorhofdreef 20, Delft",
  "Papsouwselaan 100, Delft",
  "Abtswoudseweg 40, Delft",
  "Schieweg 20, Delft",
  "Phoenixstraat 10, Delft",
  "Rotterdamseweg 100, Delft",
  "Delfgauw Dorpsstraat 10, Delfgauw",
  "Kruithuisweg 10, Delft",
];

const addresses = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const dir = await mkdtemp(path.join(os.tmpdir(), "zoning-probe-"));
const fetchJson = createJsonFetcher({ cacheRoot: dir, dir: "probe", mode: "readwrite", headers: { [RP_PROVIDER]: RP_HEADERS } });
const geocoder = new LocatieserverGeocoder(fetchJson);
const parcels = new KadasterParcelProvider(fetchJson);
const zoning = new RuimtelijkePlannenZoningProvider(fetchJson);

const tally: Record<string, number> = {};
let withStreet = 0;
let withRestrictions = 0;
let withPlan = 0;
for (const q of addresses) {
  try {
    const hit = await geocoder.geocode(q);
    const parcel = hit && (await parcels.parcelAt(hit.point));
    if (!hit || !parcel) {
      console.log(`${q}: no address or parcel`);
      continue;
    }
    const street = await streetSideFor(fetchJson, parcel).catch(() => null);
    const inside = pointInside(parcel.ring);
    const restr = inside ? await restrictionNotes(fetchJson, inside) : [];
    if (street) withStreet++;
    if (restr.length) withRestrictions++;
    const extra = `street=${street ? street.bearing + "°" : "?"} restrictions=${restr.length}`;
    const r = await zoning.constraintsFor(parcel);
    if (!r) {
      console.log(`${hit.label} [${parcel.id}]: no structured plan data | ${extra}`);
      continue;
    }
    withPlan++;
    const filled = CONSTRAINT_FIELDS.filter((f) => getField(r.constraints, f.path)?.value != null);
    for (const f of filled) tally[f.path] = (tally[f.path] ?? 0) + 1;
    const c = r.constraints;
    console.log(
      `${hit.label} [${parcel.id}]: ${r.fixtureId.replace("ruimtelijkeplannen:", "")} | use=${c.allowedFunctions.value?.join("/") ?? "?"} height=${c.maxHeight.value ?? "?"} gutter=${c.maxGutterHeight?.value ?? "?"} cover=${c.maxCoverage?.value ?? "?"} bouwvlak=${c.bouwvlak?.value ? "yes" : "no"} notes=${c.notes.length} | ${extra}`,
    );
  } catch (e) {
    console.log(`${q}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\n${withPlan}/${addresses.length} addresses had structured plan data. Fields filled:`, tally);
console.log(`Street side derived: ${withStreet}/${addresses.length}. At least one restriction note: ${withRestrictions}/${addresses.length}.`);
