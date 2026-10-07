import type { ContextBuilding, ContextProvider, RdPoint, Ring } from "@massing/shared";
import type { JsonFetcher } from "../../cache/diskCache";

const BASE = "https://api.3dbag.nl/collections/pand/items";
const PAGE_LIMIT = 100;
/** Safety stop: ~250 m radius in dense Delft is under 2000 buildings. */
const MAX_PAGES = 60;

type Bag3dBuilding = {
  type: string;
  attributes?: {
    identificatie?: string;
    status?: string;
    eindgeldigheid?: string | null;
    b3_h_dak_70p?: number | null;
    b3_h_maaiveld?: number | null;
  };
  geometry?: { type: string; lod: string; boundaries: number[][][] }[];
};

type Bag3dFeature = {
  id?: string;
  vertices?: [number, number, number][];
  CityObjects?: Record<string, Bag3dBuilding>;
};

type Bag3dPage = {
  metadata?: { transform?: { scale: number[]; translate: number[] } };
  features?: Bag3dFeature[];
  links?: { rel: string; href: string }[];
};

/** BAG statuses that are not (yet / any longer) a standing building. */
const NOT_STANDING = /gesloopt|niet gerealiseerd|ten onrechte|bouwvergunning verleend/i;

export type ParsedPage = { buildings: ContextBuilding[]; skipped: number; next: string | null };

/**
 * Footprint = LoD 0 outer ring, vertices decoded with the page transform (RD metres).
 * v1 height = LoD1.2 roof height: 70th-percentile roof height minus ground level (both NAP-based).
 */
export function parseBag3dPage(json: unknown): ParsedPage {
  const page = json as Bag3dPage;
  const transform = page.metadata?.transform;
  if (!transform) throw new Error("3DBAG page has no metadata.transform");
  const { scale, translate } = transform;

  const buildings: ContextBuilding[] = [];
  let skipped = 0;
  for (const feature of page.features ?? []) {
    const vertices = feature.vertices ?? [];
    for (const [id, obj] of Object.entries(feature.CityObjects ?? {})) {
      if (obj.type !== "Building") continue;
      const a = obj.attributes ?? {};
      const roof = a.b3_h_dak_70p;
      const ground = a.b3_h_maaiveld;
      const footprint = obj.geometry?.find((g) => g.lod === "0")?.boundaries[0]?.[0];
      const height = roof != null && ground != null ? roof - ground : null;
      if (
        !footprint ||
        height === null ||
        !(height > 0) ||
        a.eindgeldigheid ||
        NOT_STANDING.test(a.status ?? "")
      ) {
        skipped++;
        continue;
      }
      const ring: Ring = footprint.map((i) => {
        const v = vertices[i]!;
        return [v[0] * scale[0]! + translate[0]!, v[1] * scale[1]! + translate[1]!] as [number, number];
      });
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) ring.pop();
      if (ring.length < 3) {
        skipped++;
        continue;
      }
      buildings.push({ id: a.identificatie ?? id, ring, height });
    }
  }
  const next = page.links?.find((l) => l.rel === "next")?.href ?? null;
  return { buildings, skipped, next };
}

export function bag3dUrl(point: RdPoint, radiusM: number): string {
  const bbox = [point.x - radiusM, point.y - radiusM, point.x + radiusM, point.y + radiusM].join(",");
  return `${BASE}?bbox=${bbox}&limit=${PAGE_LIMIT}`;
}

/** 3DBAG API `pand` collection, bbox in RD, following `next` links. */
export class Bag3dContextProvider implements ContextProvider {
  /** Buildings dropped in the last call (no usable height or footprint). */
  lastSkipped = 0;

  constructor(private readonly fetchJson: JsonFetcher) {}

  async buildingsNear(point: RdPoint, radiusM: number): Promise<ContextBuilding[]> {
    const all = new Map<string, ContextBuilding>();
    let skipped = 0;
    let url: string | null = bag3dUrl(point, radiusM);
    for (let pages = 0; url && pages < MAX_PAGES; pages++) {
      const parsed = parseBag3dPage(await this.fetchJson("3dbag", url));
      skipped += parsed.skipped;
      for (const b of parsed.buildings) all.set(b.id, b);
      url = parsed.next;
    }
    this.lastSkipped = skipped;
    return [...all.values()];
  }
}
