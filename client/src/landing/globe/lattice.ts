/**
 * Dot lattice fixed to the sphere, in nested levels: level k has rows every Δ0 / 2^k degrees of
 * latitude and contains every dot of level k − 1, so zooming in only adds dots between existing ones.
 *
 * - "even": dots spaced evenly on the ground. Each row gets round(360·cos φ / Δ) dots, chosen at the
 *   coarsest level the row exists on and doubled per finer level; rows that are odd at their own
 *   level are shifted half a step (staggered).
 * - "latlon": one dot every Δ degrees of longitude and latitude; columns follow the meridians.
 *
 * Pole rows are left out (every dot of a pole row is the same point).
 */

export type LatticeMode = "even" | "latlon";

export type LatticeSpec = {
  mode: LatticeMode;
  /** Row spacing of level 0 (deg). */
  baseDeg: number;
};

export type LatticeDot = {
  lon: number;
  lat: number;
  /** Same number for the same point at every level (canonical level, row, index). */
  key: number;
  /** Coarsest level the dot exists on. */
  level: number;
};

const RAD = Math.PI / 180;

/** Number of rows of a level, pole to pole (rows 0 and `rows` are the poles). */
const rowsAt = (spec: LatticeSpec, level: number) => Math.round(180 / spec.baseDeg) * 2 ** level;

const trailingTwos = (j: number, max: number) => {
  let t = 0;
  while (t < max && j % 2 === 0) {
    j /= 2;
    t++;
  }
  return t;
};

type Row = { lat: number; n: number; base: number; native: number };

/** Row j of `level`: latitude, dots in the row, longitude of dot 0, and the coarsest level it exists on. */
export function rowAt(spec: LatticeSpec, level: number, j: number): Row {
  const step = 180 / rowsAt(spec, level);
  const lat = -90 + j * step;
  const native = level - trailingTwos(j, level);
  const jNative = j / 2 ** (level - native);
  const nativeStep = 180 / rowsAt(spec, native);
  const nNative =
    spec.mode === "latlon" ? Math.round(360 / nativeStep) : Math.max(1, Math.round((360 * Math.cos(lat * RAD)) / nativeStep));
  const shift = spec.mode === "even" && jNative % 2 === 1 ? 0.5 : 0;
  return { lat, n: nNative * 2 ** (level - native), base: -180 + (shift * 360) / nNative, native };
}

/** Canonical key: the dot expressed on the coarsest level that has it. */
export function dotKey(level: number, j: number, i: number): { key: number; level: number } {
  while (level > 0 && j % 2 === 0 && i % 2 === 0) {
    level--;
    j /= 2;
    i /= 2;
  }
  // 4 + 21 + 22 bits = 47 bits (exact in a double): level ≤ 15, rows ≤ 2 097 151, dots per row ≤ 4 194 303.
  // At level 13 with 138 rows per base step there are 1.1 M rows and ≤ 2.3 M dots in the longest row.
  return { key: (level * 2097152 + j) * 4194304 + i, level };
}

/** Callback of forEachDotRaw: degrees, canonical key and level of the dot, and the cos / sin of its latitude (once per row). */
export type RawVisit = (lon: number, lat: number, key: number, level: number, cosLat: number, sinLat: number) => void;

/** Same as forEachDot without an object per dot (a zoomed-in frame visits tens of thousands). */
export function forEachDot(
  spec: LatticeSpec,
  level: number,
  centre: [number, number],
  radiusDeg: number,
  visit: (dot: LatticeDot) => void,
) {
  forEachDotRaw(spec, level, centre, radiusDeg, (lon, lat, key, lv) => visit({ lon, lat, key, level: lv }));
}

/**
 * Calls `visit` for every dot of `level` inside the spherical cap around `centre` (lon/lat) with
 * angular radius `radiusDeg`.
 */
export function forEachDotRaw(spec: LatticeSpec, level: number, centre: [number, number], radiusDeg: number, visit: RawVisit) {
  const rows = rowsAt(spec, level);
  const step = 180 / rows;
  const [lc, pc] = centre;
  const alpha = radiusDeg * RAD;
  const sinPc = Math.sin(pc * RAD);
  const cosPc = Math.cos(pc * RAD);
  const cosA = Math.cos(alpha);
  const j0 = Math.max(1, Math.ceil((pc - radiusDeg + 90) / step));
  const j1 = Math.min(rows - 1, Math.floor((pc + radiusDeg + 90) / step));
  for (let j = j0; j <= j1; j++) {
    const row = rowAt(spec, level, j);
    const phi = row.lat * RAD;
    const denom = Math.cos(phi) * cosPc;
    const cosD = denom < 1e-12 ? -2 : (cosA - Math.sin(phi) * sinPc) / denom;
    if (cosD > 1) continue;
    const dLon = 360 / row.n;
    const cosLat = Math.cos(phi);
    const sinLat = Math.sin(phi);
    let i0 = 0;
    let i1 = row.n - 1;
    if (cosD > -1) {
      const half = Math.acos(cosD) / RAD;
      i0 = Math.ceil((lc - half - row.base) / dLon);
      i1 = Math.floor((lc + half - row.base) / dLon);
      if (i1 - i0 + 1 > row.n) i1 = i0 + row.n - 1;
    }
    for (let ii = i0; ii <= i1; ii++) {
      const i = ((ii % row.n) + row.n) % row.n;
      // canonical key and level, inline (see dotKey): the dot on the coarsest level that has it
      let lv = level;
      let jj = j;
      let ik = i;
      while (lv > 0 && jj % 2 === 0 && ik % 2 === 0) {
        lv--;
        jj /= 2;
        ik /= 2;
      }
      let lon = row.base + i * dLon;
      if (lon >= 180) lon -= 360;
      visit(lon, row.lat, (lv * 2097152 + jj) * 4194304 + ik, lv, cosLat, sinLat);
    }
  }
}
