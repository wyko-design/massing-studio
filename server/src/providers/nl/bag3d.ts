import type { ContextBuilding, ContextProvider, RdPoint, Ring } from "@massing/shared";
import type { JsonFetcher } from "../../cache/diskCache";

const BASE = "https://api.3dbag.nl/collections/pand/items";
const PAGE_LIMIT = 100;
/** Safety stop per box: ~250 m radius in dense Delft is under 2000 buildings. */
const MAX_PAGES = 60;
/** Boxes up to this half side are one request chain (as they always were, so cached answers still match). */
const SINGLE_BOX_M = 300;
/** Larger boxes are split into tiles about this wide, at most TILES_MAX per side, fetched TILE_CONCURRENCY at a time. */
const TILE_M = 600;
const TILES_MAX = 8;
const TILE_CONCURRENCY = 6;

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
  const next = page.links?.find((l) => l.rel === "next")?.href ?? null;
  // a box with no buildings (open land, water) comes back without metadata
  if (!page.features?.length) return { buildings: [], skipped: 0, next };
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
  return { buildings, skipped, next };
}

export function bag3dUrl(point: RdPoint, radiusM: number): string {
  return boxUrl(point.x - radiusM, point.y - radiusM, point.x + radiusM, point.y + radiusM);
}

const boxUrl = (x0: number, y0: number, x1: number, y1: number) => `${BASE}?bbox=${[x0, y0, x1, y1].join(",")}&limit=${PAGE_LIMIT}`;

/**
 * The first-page URLs for a box of half side `radiusM`: one box when small, else a grid of tiles. The API pages in its own
 * order, so a page cap on one big box would drop whole areas at random; per tile the cap is local and coverage stays even.
 */
export function bag3dTileUrls(point: RdPoint, radiusM: number): string[] {
  if (radiusM <= SINGLE_BOX_M) return [bag3dUrl(point, radiusM)];
  const n = Math.min(TILES_MAX, Math.ceil((2 * radiusM) / TILE_M));
  const size = (2 * radiusM) / n;
  const x0 = point.x - radiusM;
  const y0 = point.y - radiusM;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const urls: string[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) urls.push(boxUrl(r2(x0 + i * size), r2(y0 + j * size), r2(x0 + (i + 1) * size), r2(y0 + (j + 1) * size)));
  return urls;
}

/** 3DBAG API `pand` collection, bbox in RD, following `next` links. */
export class Bag3dContextProvider implements ContextProvider {
  /** Buildings dropped in the last call (no usable height or footprint). */
  lastSkipped = 0;

  constructor(private readonly fetchJson: JsonFetcher) {}

  async buildingsNear(point: RdPoint, radiusM: number): Promise<ContextBuilding[]> {
    // a building on a tile edge comes back from both tiles: kept once, by id
    const all = new Map<string, ContextBuilding>();
    let skipped = 0;
    const chain = async (first: string) => {
      let url: string | null = first;
      for (let pages = 0; url && pages < MAX_PAGES; pages++) {
        const parsed = parseBag3dPage(await this.fetchJson("3dbag", url));
        skipped += parsed.skipped;
        for (const b of parsed.buildings) all.set(b.id, b);
        url = parsed.next;
      }
    };
    const queue = bag3dTileUrls(point, radiusM);
    await Promise.all(
      Array.from({ length: Math.min(TILE_CONCURRENCY, queue.length) }, async () => {
        for (let u = queue.shift(); u; u = queue.shift()) await chain(u);
      }),
    );
    this.lastSkipped = skipped;
    return [...all.values()];
  }
}
