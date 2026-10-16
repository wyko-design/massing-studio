import countries50mUrl from "world-atlas/countries-50m.json?url";
import countries110mUrl from "world-atlas/countries-110m.json?url";
import { buildCountries, type CountryData, type WorldTopology } from "./countries";
import { POPULAR } from "./countries/aliases";
import { createMatcher, type Matcher } from "./countries/matcher";

/** 50m: countries, dots and lines when zoomed in. 110m: simplified coastlines for the whole-globe view. */
export type World = CountryData & { topology: WorldTopology; coarse: WorldTopology; matcher: Matcher };

let world: Promise<World> | null = null;

const fetchTopology = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`World map failed to load (${r.status})`);
    return r.json() as Promise<WorldTopology>;
  });

/** world-atlas maps (bundled as local assets, so they work offline), country entries and matcher. Loaded once. */
export function loadWorld(): Promise<World> {
  world ??= Promise.all([fetchTopology(countries50mUrl), fetchTopology(countries110mUrl)]).then(([topology, coarse]) => {
    const data = buildCountries(topology);
    return { ...data, topology, coarse, matcher: createMatcher(data.entries, POPULAR) };
  });
  return world;
}
