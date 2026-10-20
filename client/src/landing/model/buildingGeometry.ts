import { BufferAttribute, BufferGeometry, EdgesGeometry, ExtrudeGeometry, Float32BufferAttribute, InstancedBufferAttribute, Path, Shape, Vector2 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { ModelBuilding, Poly } from "./modelData";
import { modelStyle as S } from "./modelStyle";

/**
 * Three.js geometry of the site model that needs no renderer, so the heavy part (extruding and edging every context
 * building, ~30 ms) can run in the worker: it comes back as plain typed arrays and only gets wrapped on the main thread.
 */

export function shapeOf(poly: Poly): Shape {
  const shape = new Shape(poly[0]!.map(([x, y]) => new Vector2(x, y)));
  for (const hole of poly.slice(1)) shape.holes.push(new Path(hole.map(([x, y]) => new Vector2(x, y))));
  return shape;
}

/** The edges of a geometry (creases over 20°) as line-segment pairs. */
export function edgePoints(g: BufferGeometry, creaseDeg = 20): [number, number, number][] {
  const edges = new EdgesGeometry(g, creaseDeg);
  const pos = edges.getAttribute("position");
  const out: [number, number, number][] = [];
  for (let i = 0; i < pos.count; i++) out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  edges.dispose();
  return out;
}

/** Polygons extruded `depth` metres up (world y). */
export function prism(polys: Poly[], depth: number): ExtrudeGeometry {
  const g = new ExtrudeGeometry(polys.map(shapeOf), { depth, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

type Attr = { array: Float32Array; itemSize: number; normalized: boolean };

/** The context buildings as arrays: one merged face geometry (with each vertex's ripple order and height, `aRise`) and the edges. */
export type BuildingArrays = {
  faces: Record<string, Attr> | null;
  edgePos: Float32Array;
  /** Per edge: ripple order and height. */
  edgeRise: Float32Array;
};

export function buildingArrays(buildings: ModelBuilding[]): BuildingArrays {
  const faces: BufferGeometry[] = [];
  const edgePos: number[] = [];
  const edgeRise: number[] = [];
  for (const b of buildings) {
    const h = b.height ?? S.unknownHeightM;
    const g = prism(b.polys, h);
    g.setAttribute("aRise", new Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2).map((_, i) => (i % 2 ? h : b.order)), 2));
    faces.push(g);
    // every change of the outline gets its edge, however slight; only the coplanar triangulation diagonals (0°) stay out
    const e = edgePoints(g, 1);
    for (const p of e) edgePos.push(...p);
    for (let i = 0; i < e.length / 2; i++) edgeRise.push(b.order, h);
  }
  const merged = faces.length ? mergeGeometries(faces) : null;
  faces.forEach((g) => g.dispose());
  const attrs: Record<string, Attr> | null = merged ? {} : null;
  if (merged)
    for (const [name, a] of Object.entries(merged.attributes)) attrs![name] = { array: a.array as Float32Array, itemSize: a.itemSize, normalized: a.normalized };
  return { faces: attrs, edgePos: new Float32Array(edgePos), edgeRise: new Float32Array(edgeRise) };
}

/** The buffers to hand over (not copy) when the arrays cross between threads. */
export const buildingBuffers = (a: BuildingArrays): ArrayBuffer[] => [
  ...new Set([...Object.values(a.faces ?? {}).map((x) => x.array.buffer), a.edgePos.buffer, a.edgeRise.buffer] as ArrayBuffer[]),
];

/** The arrays wrapped as the geometries the model draws (no copying). */
export function buildingGeometries(a: BuildingArrays): { faceGeo: BufferGeometry | null; lineGeo: LineSegmentsGeometry | null } {
  let faceGeo: BufferGeometry | null = null;
  if (a.faces) {
    faceGeo = new BufferGeometry();
    for (const [name, x] of Object.entries(a.faces)) faceGeo.setAttribute(name, new BufferAttribute(x.array, x.itemSize, x.normalized));
  }
  if (!a.edgePos.length) return { faceGeo, lineGeo: null };
  const lineGeo = new LineSegmentsGeometry();
  lineGeo.setPositions(a.edgePos);
  lineGeo.setAttribute("instanceRise", new InstancedBufferAttribute(a.edgeRise, 2));
  return { faceGeo, lineGeo };
}
