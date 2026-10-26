import polygonClipping, { type MultiPolygon as ClipMulti, type Polygon as ClipPolygon } from "polygon-clipping";
import { openRing, rdToWgs84, wgs84ToRd, type Envelope } from "@massing/shared";
import type { LonLat } from "../globe/geo";
import { insideParcel, localFrame, localParcel, plotDots, plotView, toLocal, type Local, type PlotData } from "../globe/plotLayer";

/** Local metres: x east, y north, origin at the plot view's centre (the parcel's bbox centre, as in the 2D plot view). */
export type XY = [number, number];
/** One polygon: open outer ring, then open holes. */
export type Poly = XY[][];

export type ModelBuilding = {
  id: string;
  /** The footprint cut to the model square (a building on the edge can fall apart in pieces). */
  polys: Poly[];
  /** 3DBAG height (m); null = unknown, drawn flat. */
  height: number | null;
  /** 0 at the plot's centre, 1 at `rippleM` and beyond: the order the buildings rise in. */
  order: number;
};

/** How the context is simplified: touching buildings within `heightTolM` of each other become one block, outlines lose
 *  jogs under `toleranceM`, slivers and tiny courtyards go. */
export const SIMPLIFY = { heightTolM: 1.5, touchM: 0.3, toleranceM: 0.6, minHoleM2: 9, minPieceM2: 2 };

/** Everything the site model draws, in local metres, cut to a square of half side `half` around the origin. */
export type ModelData = {
  local: Local;
  centre: LonLat;
  half: number;
  parcel: Poly[];
  /** Blue dot lattice of the parcel as x, y pairs: the level the 2D view showed, and the next finer one. */
  dots: { coarse: number[]; fine: number[] };
  buildings: ModelBuilding[];
  road: Poly[];
  water: Poly[];
};

const square = (half: number): ClipPolygon => [
  [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
    [-half, -half],
  ],
];

/** polygon-clipping closes its rings; three's shapes want them open. */
const open = (ring: XY[]): XY[] => {
  const a = ring[0]!;
  const b = ring[ring.length - 1]!;
  return ring.length > 1 && a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring;
};

const fromClip = (m: ClipMulti): Poly[] => m.map((poly) => poly.map((ring) => open(ring as XY[]))).filter((p) => p[0]!.length >= 3);

/** Polygons (lon/lat rings) in local metres, cut to the square. */
function clipped(polys: [number, number][][][], local: Local, half: number): Poly[] {
  if (!polys.length) return [];
  const inLocal: ClipMulti = polys.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => toLocal(local, lon, lat))));
  try {
    return fromClip(polygonClipping.intersection(inLocal, square(half)));
  } catch {
    return []; // a broken ring from upstream: leave that layer out rather than the model
  }
}

function centroid(polys: Poly[]): XY {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const p of polys)
    for (const [x, y] of p[0]!) {
      sx += x;
      sy += y;
      n++;
    }
  return n ? [sx / n, sy / n] : [0, 0];
}

/**
 * The plot data in local metres around the 2D view's centre, every layer cut to the model square.
 * `dotLevel` is the lattice level the 2D plot view was drawing, so the dots match it at the hand-over.
 */
export function buildModel(plot: PlotData, half: number, dotLevel: number, rippleM = half * Math.SQRT2): ModelData {
  const centre = plotView(plot, { x: 0, y: 0, w: 1, h: 1 }).centre;
  const local = localFrame(centre);
  const parcelPolys = plot.parcel?.polygons ?? [];
  const lp = parcelPolys.length ? localParcel(parcelPolys, centre) : null;
  const raw: Footprint[] = [];
  for (const b of plot.buildings) {
    const polys = clipped([[b.ring]], local, half);
    if (!polys.length) continue;
    const height = typeof b.height === "number" && b.height > 0 ? b.height : null;
    const [cx, cy] = centroid(polys);
    // a building on the plot stays on its own: it is what a design would replace
    raw.push({ id: b.id, polys, height, own: !!lp && insideParcel(lp, cx, cy) });
  }
  const buildings: ModelBuilding[] = mergeBlocks(raw).map((b) => {
    const [cx, cy] = centroid(b.polys);
    return { ...b, order: Math.min(1, Math.hypot(cx, cy) / rippleM) };
  });
  return {
    local,
    centre,
    half,
    parcel: lp ? (lp.polygons as Poly[]).map((p) => p.map(open)) : [],
    dots: lp ? plotDots(lp, dotLevel, true) : { coarse: [], fine: [] },
    buildings,
    road: clipped(plot.ground.road, local, half),
    water: clipped(plot.ground.water, local, half),
  };
}

type Footprint = { id: string; polys: Poly[]; height: number | null; own?: boolean };

/** Shoelace area of a ring (m², positive for counter-clockwise). */
const ringArea = (r: XY[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0] - r[i]![0]) * (r[j]![1] + r[i]![1]);
  return a / 2;
};

function segDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Douglas–Peucker on a closed ring: corners that stand out less than `tol` from the line between their neighbours go. */
export function simplifyRing(ring: XY[], tol: number): XY[] {
  if (ring.length <= 4) return ring;
  // split at the vertex farthest from the first one, simplify both halves as open lines
  let far = 0;
  let best = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i]![0] - ring[0]![0], ring[i]![1] - ring[0]![1]);
    if (d > best) [best, far] = [d, i];
  }
  const dp = (pts: XY[]): XY[] => {
    if (pts.length < 3) return pts;
    let idx = 0;
    let max = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = segDist(pts[i]!, pts[0]!, pts[pts.length - 1]!);
      if (d > max) [max, idx] = [d, i];
    }
    if (max <= tol) return [pts[0]!, pts[pts.length - 1]!];
    return [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))];
  };
  const a = dp(ring.slice(0, far + 1));
  const b = dp([...ring.slice(far), ring[0]!]);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : ring;
}

/** True when some corner of one footprint lies within `d` of an edge of the other (shared party walls). */
function touching(a: Poly[], b: Poly[], d: number): boolean {
  const near = (p: Poly[], q: Poly[]) =>
    p.some((poly) =>
      poly[0]!.some((pt) =>
        q.some((qp) => {
          const r = qp[0]!;
          for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (segDist(pt, r[j]!, r[i]!) < d) return true;
          return false;
        }),
      ),
    );
  return near(a, b) || near(b, a);
}

const bbox = (polys: Poly[]) => {
  const pts = polys.flatMap((p) => p[0]!);
  return { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) };
};

/**
 * Party walls are often drawn a few centimetres apart: every corner within `touchM` of another footprint's edge moves
 * onto that edge, so the union closes up instead of leaving a gap (and its two wall lines).
 */
function snapTogether(groups: Poly[][]): Poly[][] {
  const d = SIMPLIFY.touchM;
  return groups.map((polys, gi) =>
    polys.map((poly) =>
      poly.map((ring) =>
        ring.map((pt) => {
          let best: XY = pt;
          let bestD = d;
          groups.forEach((other, oi) => {
            if (oi === gi) return;
            for (const op of other)
              for (const r of op)
                for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
                  const a = r[j]!;
                  const b = r[i]!;
                  const dx = b[0] - a[0];
                  const dy = b[1] - a[1];
                  const l2 = dx * dx + dy * dy;
                  const t = l2 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2)) : 0;
                  const q: XY = [a[0] + t * dx, a[1] + t * dy];
                  const dist = Math.hypot(pt[0] - q[0], pt[1] - q[1]);
                  if (dist < bestD) [bestD, best] = [dist, q];
                }
          });
          return best;
        }),
      ),
    ),
  );
}

/** Simplified polygons: rings through `simplifyRing`, small holes and slivers dropped. */
function tidy(polys: Poly[]): Poly[] {
  const s = SIMPLIFY;
  return polys
    .map((p) => [simplifyRing(p[0]!, s.toleranceM), ...p.slice(1).filter((h) => Math.abs(ringArea(h)) >= s.minHoleM2).map((h) => simplifyRing(h, s.toleranceM))])
    .filter((p) => p[0]!.length >= 3 && Math.abs(ringArea(p[0]!)) >= s.minPieceM2);
}

/**
 * Context buildings as blocks: footprints that touch and have about the same height (within `heightTolM`) are joined
 * (height = their area-weighted mean), so a terrace reads as one volume instead of a row of party-wall lines; then every
 * outline is simplified. Unknown heights and the plot's own buildings are kept apart.
 */
export function mergeBlocks(items: Footprint[]): Omit<ModelBuilding, "order">[] {
  const s = SIMPLIFY;
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const boxes = items.map((b) => bbox(b.polys));
  const sorted = items.map((_, i) => i).sort((a, b) => boxes[a]!.x0 - boxes[b]!.x0);
  for (let k = 0; k < sorted.length; k++) {
    const i = sorted[k]!;
    const a = items[i]!;
    if (a.height === null || a.own) continue;
    for (let m = k + 1; m < sorted.length; m++) {
      const j = sorted[m]!;
      if (boxes[j]!.x0 > boxes[i]!.x1 + s.touchM) break;
      const b = items[j]!;
      if (b.height === null || b.own || Math.abs(a.height - b.height) > s.heightTolM) continue;
      if (boxes[j]!.y0 > boxes[i]!.y1 + s.touchM || boxes[i]!.y0 > boxes[j]!.y1 + s.touchM) continue;
      if (find(i) !== find(j) && touching(a.polys, b.polys, s.touchM)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Footprint[]>();
  items.forEach((b, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), b]));
  const out: Omit<ModelBuilding, "order">[] = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      const m = members[0]!;
      const polys = tidy(m.polys);
      if (polys.length) out.push({ id: m.id, polys, height: m.height });
      continue;
    }
    const area = (b: Footprint) => b.polys.reduce((t, p) => t + Math.abs(ringArea(p[0]!)), 0);
    const total = members.reduce((t, b) => t + area(b), 0);
    const height = members.reduce((t, b) => t + area(b) * b.height!, 0) / (total || 1);
    let polys: Poly[];
    try {
      const merged = polygonClipping.union(...(snapTogether(members.map((b) => b.polys)).flat().map((p) => p.map((r) => [...r, r[0]!])) as [ClipPolygon, ...ClipPolygon[]]));
      polys = tidy(fromClip(merged));
    } catch {
      polys = tidy(members.flatMap((b) => b.polys)); // the union failed on odd input: keep the pieces
    }
    if (polys.length) out.push({ id: members.map((b) => b.id).join("+"), polys, height });
  }
  return out;
}

/**
 * The envelope (scene frame: RD metres around the parcel centroid `origin`) in the model's local frame.
 * RD's grid north is a little off true north; going through lon/lat keeps the ghost on the parcel the 2D view showed.
 */
export function envelopeRings(envelope: Envelope, origin: { lat: number; lon: number }, local: Local): XY[][] {
  const [ox, oy] = wgs84ToRd(origin.lon, origin.lat);
  return envelope.footprint.coordinates.map((ring) =>
    openRing(ring).map(([x, y]) => {
      const [lon, lat] = rdToWgs84(x + ox, y + oy);
      return toLocal(local, lon, lat);
    }),
  );
}

/**
 * The scene frame (RD metres around the parcel centroid `origin`) as an affine map onto the model's local frame: plan
 * x' = a·x + b·y + e, y' = c·x + d·y + f. Over a site's few hundred metres RD and the local frame differ by a rotation and
 * a scale that do not change measurably, so solids (the proposal, its roofs) can be built in the scene frame and placed
 * with one matrix; points match `envelopeRings` to well under a centimetre.
 */
export function sceneToModel(origin: { lat: number; lon: number }, local: Local): { a: number; b: number; c: number; d: number; e: number; f: number } {
  const [ox, oy] = wgs84ToRd(origin.lon, origin.lat);
  const map = (x: number, y: number) => {
    const [lon, lat] = rdToWgs84(x + ox, y + oy);
    return toLocal(local, lon, lat);
  };
  const S = 100;
  const [e, f] = map(0, 0);
  const [px, py] = map(S, 0);
  const [qx, qy] = map(0, S);
  return { a: (px - e) / S, c: (py - f) / S, b: (qx - e) / S, d: (qy - f) / S, e, f };
}

/** A point-in-footprint test over many polygons, with a bounding box per polygon to skip most of them. */
export function blockedTest(polys: Poly[]): (x: number, y: number) => boolean {
  const boxes = polys.map((p) => {
    const xs = p[0]!.map((q) => q[0]);
    const ys = p[0]!.map((q) => q[1]);
    return { p, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  return (x, y) => {
    for (const b of boxes) {
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      let inside = false;
      for (const ring of b.p)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]!;
          const [xj, yj] = ring[j]!;
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
      if (inside) return true;
    }
    return false;
  };
}
