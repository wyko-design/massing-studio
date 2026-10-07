import { polygonArea, pointInRing, type Parcel, type ParcelProvider, type Ring, type RdPoint } from "@massing/shared";
import type { JsonFetcher } from "../../cache/diskCache";

const BASE = "https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items";
const RD = "http://www.opengis.net/def/crs/EPSG/0/28992";

type PerceelFeature = {
  properties?: {
    sectie?: string;
    perceelnummer?: number;
    akr_kadastrale_gemeente_code_waarde?: string;
    kadastrale_grootte_waarde?: number;
  };
  geometry?: { type: string; coordinates: number[][][][] };
};

/** GeoJSON rings repeat the first vertex at the end; our rings are open. */
function openRing(coords: number[][]): Ring {
  const ring = coords.map((c) => [c[0]!, c[1]!] as [number, number]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) ring.pop();
  return ring;
}

/** Pick the parcel polygon that contains the point; outer ring only. Rings stay in RD metres. */
export function parseParcel(json: unknown, point: RdPoint): Parcel | null {
  const features = (json as { features?: PerceelFeature[] }).features ?? [];
  for (const f of features) {
    if (f.geometry?.type !== "MultiPolygon") continue;
    for (const polygon of f.geometry.coordinates) {
      const ring = openRing(polygon[0]!);
      if (ring.length < 3 || !pointInRing([point.x, point.y], ring)) continue;
      const p = f.properties ?? {};
      const id = [p.akr_kadastrale_gemeente_code_waarde, p.sectie, p.perceelnummer].filter((v) => v !== undefined).join(" ");
      return {
        id,
        areaM2: p.kadastrale_grootte_waarde ?? polygonArea(ring),
        ring,
        indicative: true,
      };
    }
  }
  return null;
}

export function parcelUrl(point: RdPoint, halfSideM = 1): string {
  const params = new URLSearchParams({
    f: "json",
    bbox: [point.x - halfSideM, point.y - halfSideM, point.x + halfSideM, point.y + halfSideM].join(","),
    "bbox-crs": RD,
    crs: RD, // default output is CRS84; ask for RD metres
    limit: "10",
  });
  return `${BASE}?${params}`;
}

/** PDOK Kadastrale Kaart OGC API, collection `perceel`. Geometry is indicative, not legally measured. */
export class KadasterParcelProvider implements ParcelProvider {
  constructor(private readonly fetchJson: JsonFetcher) {}

  async parcelAt(point: RdPoint): Promise<Parcel | null> {
    return parseParcel(await this.fetchJson("kadaster", parcelUrl(point)), point);
  }
}
