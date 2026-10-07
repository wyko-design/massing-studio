import type { MassingMetrics, Programme, Volume } from "../schemas/massing";
import { openRing, polygonWithHolesArea } from "../geo/planar";
import { outwardBearing } from "../envelope/edges";

const DEG = Math.PI / 180;

/** Orientation weight of a facade facing `bearing`: S 1, SE/SW 0.73, E/W 0.25, NE/NW 0.02, N 0. */
export const sunWeight = (bearing: number) => ((1 + Math.cos((bearing - 180) * DEG)) / 2) ** 2;

/**
 * facadeSunScore v1, 0–1: wall area weighted by orientation (`sunWeight`), averaged over all walls.
 * Every outer and court edge counts as facade; party walls and shading by context are ignored.
 *
 * On a closed footprint the walls' outward normals cancel (Σ length · normal = 0), so a weight
 * linear in cos(angle from south) would give every footprint the same score. With the squared
 * weight the average lies between 0.25 (all walls face east/west) and 0.5 (all face south/north),
 * and is rescaled to 0–1: 1 = long facades face south (and north), 0 = they face east and west.
 */
export function facadeSunScore(volumes: Volume[]): number {
  let weighted = 0;
  let total = 0;
  for (const v of volumes) {
    for (const ring of v.footprint.coordinates) {
      const r = openRing(ring);
      for (let i = 0; i < r.length; i++) {
        const a = r[i]!;
        const b = r[(i + 1) % r.length]!;
        const area = Math.hypot(b[0] - a[0], b[1] - a[1]) * v.height;
        weighted += area * sunWeight(outwardBearing(a, b));
        total += area;
      }
    }
  }
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (weighted / total - 0.25) / 0.25));
}

const topOf = (v: Volume) => v.zBase + v.height + (v.roof?.ridgeHeight ?? 0);

/** SPEC §8 metrics. Footprint counts volumes standing on the ground; GFA counts every floor. */
export function computeMetrics(volumes: Volume[], parcelArea: number, programme: Programme): MassingMetrics {
  const areaOf = (v: Volume) => polygonWithHolesArea(v.footprint.coordinates);
  const footprint = volumes.filter((v) => v.zBase === 0).reduce((s, v) => s + areaOf(v), 0);
  const gfa = volumes.reduce((s, v) => s + areaOf(v) * (v.floors ?? 0), 0);
  return {
    footprint,
    gfa,
    far: parcelArea > 0 ? gfa / parcelArea : 0,
    coverage: parcelArea > 0 ? footprint / parcelArea : 0,
    height: volumes.reduce((h, v) => Math.max(h, topOf(v)), 0),
    floors: volumes.reduce((n, v) => Math.max(n, v.floors ?? 0), 0),
    estUnits: Math.floor((gfa * programme.netToGross) / programme.avgUnitSize + 1e-9),
    facadeSunScore: facadeSunScore(volumes),
  };
}
