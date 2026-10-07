import * as THREE from "three";
import type { Ring } from "@massing/shared";

/**
 * Local frame is x east, y north, height up. three.js is y-up, so a plan point (x, y)
 * becomes world (x, z = -y). Shapes are built in XY, extruded along +z, then rotated
 * -90° about X (see PLAN_TO_WORLD), which maps shape y to world -z and extrusion to world +y.
 */
export const PLAN_TO_WORLD: [number, number, number] = [-Math.PI / 2, 0, 0];

export function shapeOf(ring: Ring, holes: Ring[] = []): THREE.Shape {
  const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

export function extrude(ring: Ring, height: number): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shapeOf(ring), { depth: height, bevelEnabled: false });
}

/** Plan-frame bounding box of a set of rings. */
export function ringBounds(rings: Ring[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Extrusion of an outer ring with optional holes (courtyards). */
export function extrudeWithHoles(rings: Ring[], height: number): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shapeOf(rings[0] ?? [], rings.slice(1)), { depth: height, bevelEnabled: false });
}

type P3 = [number, number, number];

/** Part of a convex polygon on one side of the plane v = mid (side +1: v ≥ mid, -1: v ≤ mid). */
function clipSide(poly: [number, number][], vOf: (p: [number, number]) => number, mid: number, side: 1 | -1): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = side * (vOf(a) - mid);
    const db = side * (vOf(b) - mid);
    if (da >= 0) out.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/**
 * Gable roof over a footprint: the footprint is triangulated, every triangle is split along the
 * ridge line, and each vertex is lifted to baseZ + ridgeHeight × (1 − |distance from ridge| / half
 * width). The surface is exact piecewise linear, whatever the footprint (holes included).
 * `ridgeAngle` is the ridge direction in the plan frame (radians from +x).
 */
export function roofGeometry(rings: Ring[], baseZ: number, ridgeAngle: number, ridgeHeight: number): THREE.BufferGeometry {
  const outer = rings[0] ?? [];
  const sin = Math.sin(ridgeAngle);
  const cos = Math.cos(ridgeAngle);
  const vOf = (p: [number, number]) => -p[0] * sin + p[1] * cos;
  const vs = outer.map(vOf);
  const [vMin, vMax] = [Math.min(...vs), Math.max(...vs)];
  const mid = (vMin + vMax) / 2;
  const half = Math.max((vMax - vMin) / 2, 1e-6);

  const shape = new THREE.ShapeGeometry(shapeOf(outer, rings.slice(1)));
  const pos = shape.getAttribute("position");
  const index = shape.getIndex();
  const positions: number[] = [];
  const lift = (p: [number, number]): P3 => [p[0], p[1], baseZ + ridgeHeight * (1 - Math.abs(vOf(p) - mid) / half)];
  const triCount = index ? index.count / 3 : pos.count / 3;
  for (let t = 0; t < triCount; t++) {
    const tri = [0, 1, 2].map((k) => {
      const i = index ? index.getX(t * 3 + k) : t * 3 + k;
      return [pos.getX(i), pos.getY(i)] as [number, number];
    });
    for (const side of [1, -1] as const) {
      const poly = clipSide(tri, vOf, mid, side);
      for (let k = 1; k + 1 < poly.length; k++) positions.push(...lift(poly[0]!), ...lift(poly[k]!), ...lift(poly[k + 1]!));
    }
  }
  shape.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
