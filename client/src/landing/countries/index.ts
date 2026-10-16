import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { MultiPolygon, Polygon, Position } from "geojson";
import isoCountries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import nl from "i18n-iso-countries/langs/nl.json";
import pl from "i18n-iso-countries/langs/pl.json";
import { ALIASES, UNCODED } from "./aliases";
import type { CountryEntry } from "./matcher";

isoCountries.registerLocale(en);
isoCountries.registerLocale(nl);
isoCountries.registerLocale(pl);

const LANGS = ["en", "nl", "pl"] as const;

/** world-atlas topology (countries-50m / -110m): objects.countries and objects.land. */
export type WorldTopology = Topology<{
  countries: GeometryCollection<{ name: string }>;
  land: GeometryCollection;
}>;

/** One country: every world-atlas geometry with its id, merged into a MultiPolygon. */
export type CountryShape = { id: string; name: string; geometry: MultiPolygon };

export type CountryData = { entries: CountryEntry[]; shapes: Map<string, CountryShape> };

const allNames = (alpha2: string, lang: string): string[] => {
  const n = isoCountries.getName(alpha2, lang, { select: "all" });
  return Array.isArray(n) ? n : n ? [n] : [];
};

function polygons(g: Polygon | MultiPolygon | null): Position[][][] {
  if (!g) return [];
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

/** Country entries (for the matcher) and merged shapes (for the globe), keyed by world-atlas id. */
export function buildCountries(topology: WorldTopology): CountryData {
  const collection = feature(topology, topology.objects.countries);
  const shapes = new Map<string, CountryShape>();
  const entries = new Map<string, CountryEntry>();

  for (const f of collection.features) {
    const atlasName = f.properties?.name ?? "";
    const id = f.id !== undefined ? String(f.id) : `name:${atlasName}`;
    const geom = f.geometry as Polygon | MultiPolygon | null;
    const shape = shapes.get(id);
    if (shape) {
      shape.geometry.coordinates.push(...polygons(geom));
      continue;
    }

    const uncoded = f.id === undefined ? UNCODED[atlasName] : undefined;
    const alpha2 = f.id !== undefined ? (isoCountries.numericToAlpha2(String(f.id)) ?? null) : (uncoded?.alpha2 ?? null);
    const iso = alpha2 ? LANGS.flatMap((l) => allNames(alpha2, l)) : [];
    const names = [...new Set([...iso, ...(uncoded?.names ?? []), atlasName].filter(Boolean))];
    const name = names[0] ?? atlasName;
    shapes.set(id, { id, name, geometry: { type: "MultiPolygon", coordinates: polygons(geom) } });
    entries.set(id, { id, name, alpha2, names, aliases: alpha2 ? (ALIASES[alpha2] ?? []) : [] });
  }
  return { entries: [...entries.values()], shapes };
}
