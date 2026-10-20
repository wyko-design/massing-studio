import type { Geocoder, GeocodeResult } from "@massing/shared";
import type { JsonFetcher } from "../../cache/diskCache";

const BASE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

/** "POINT(84270.399 447423)" → RD metres. */
export function parseWktPoint(wkt: string): { x: number; y: number } | null {
  const m = /^POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/.exec(wkt.trim());
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

type LocatieserverDoc = {
  weergavenaam?: string;
  centroide_rd?: string;
  nummeraanduiding_id?: string;
  gemeentenaam?: string;
};

export function parseGeocode(json: unknown): GeocodeResult | null {
  const doc = (json as { response?: { docs?: LocatieserverDoc[] } }).response?.docs?.[0];
  if (!doc?.centroide_rd || !doc.weergavenaam) return null;
  const point = parseWktPoint(doc.centroide_rd);
  if (!point) return null;
  return { label: doc.weergavenaam, point, addressId: doc.nummeraanduiding_id, ...(doc.gemeentenaam ? { municipality: doc.gemeentenaam } : {}) };
}

export function geocodeUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    rows: "1",
    fq: "type:adres",
    fl: "weergavenaam,centroide_rd,nummeraanduiding_id,gemeentenaam",
  });
  return `${BASE}?${params}`;
}

/** PDOK Locatieserver v3.1 `free` search, address type only. */
export class LocatieserverGeocoder implements Geocoder {
  constructor(private readonly fetchJson: JsonFetcher) {}

  async geocode(query: string): Promise<GeocodeResult | null> {
    return parseGeocode(await this.fetchJson("locatieserver", geocodeUrl(query)));
  }
}
