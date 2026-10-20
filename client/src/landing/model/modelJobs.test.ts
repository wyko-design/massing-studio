import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlotData } from "../globe/plotLayer";
import { localFrame, toLonLat } from "../globe/plotLayer";
import { buildingArrays, buildingGeometries } from "./buildingGeometry";
import { buildModel } from "./modelData";
import { blockedOf, prepareModel, runModelJob, walkJob, type PreparedModel, type StreetLonLat } from "./modelWork";

const O: [number, number] = [4.37, 52.0];
const L = localFrame(O);
const ll = (ring: [number, number][]) => ring.map(([x, y]) => toLonLat(L, x, y));
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

// a terrace that merges, a building cut by the square, an unknown height, the plot's own building, road and water
const plot: PlotData = {
  id: "adr-x",
  label: "Test",
  point: O,
  parcel: { id: "K 1", areaM2: 400, polygons: [[ll(rect(-10, -10, 10, 10))]] },
  frameM: 90,
  buildings: [
    { id: "own", ring: ll(rect(-5, -5, 5, 5)), height: 9 },
    { id: "t1", ring: ll(rect(15, 15, 21, 25)), height: 9 },
    { id: "t2", ring: ll(rect(21.05, 15, 27, 25)), height: 9.6 },
    { id: "edge", ring: ll(rect(40, -5, 80, 5)), height: 12 },
    { id: "unknown", ring: ll(rect(-30, 20, -20, 30)) },
  ],
  ground: { road: [[ll(rect(-100, -20, 100, -14))]], water: [[ll(rect(-45, -45, -30, -30))]] },
};
const streets: StreetLonLat[] = [
  { h: "residential", p: ll([[-60, -17], [60, -17]]) },
  { h: "footway", p: ll([[0, -60], [0, 60]]) },
];
const args = [plot, 50, 0, 120] as const;

/**
 * A stand-in for the browser's Worker that runs the real modelWorker.ts in this thread: messages cross as structured
 * clones both ways, as they would between threads. `fail` makes the worker answer with an error instead.
 */
async function withFakeWorker(fail = false) {
  vi.resetModules();
  const scope: { onmessage?: (e: { data: unknown }) => void; postMessage?: (m: unknown, transfer?: ArrayBuffer[]) => void } = {};
  vi.stubGlobal("self", scope);
  await import("./modelWorker");
  const posted: unknown[] = [];
  const transferred: ArrayBuffer[][] = [];
  class FakeWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    postMessage(msg: { id: number }) {
      posted.push(msg);
      scope.postMessage = (out, transfer = []) => {
        transferred.push(transfer);
        const data = structuredClone(out, { transfer });
        setTimeout(() => this.onmessage?.({ data }));
      };
      if (fail) scope.postMessage({ id: msg.id, error: "boom" });
      else scope.onmessage!({ data: structuredClone(msg) });
    }
  }
  vi.stubGlobal("Worker", FakeWorker);
  return { jobs: await import("./modelJobs"), posted, transferred };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("model jobs", () => {
  it("gives the same model, geometry and graph without a worker (tests, old browsers)", async () => {
    const { prepareModelAsync, walkGraphAsync } = await import("./modelJobs");
    const prepared = await prepareModelAsync(...args);
    expect(prepared).toEqual(prepareModel(...args));
    expect(prepared.model).toEqual(buildModel(...args));
    const { model } = prepared;
    expect(await walkGraphAsync(model, streets)).toEqual(walkJob(streets, model.local, model.half, blockedOf(model)));
  });

  it("gives the same model, geometry and graph through the worker as the direct call", async () => {
    const { jobs, posted, transferred } = await withFakeWorker();
    const direct = buildModel(...args);
    const prepared = await jobs.prepareModelAsync(...args);
    expect(posted).toHaveLength(1);
    expect(prepared.model).toEqual(direct);
    expect(prepared.model.buildings.some((b) => b.id === "t1+t2")).toBe(true); // the terrace merged (polygon-clipping ran)
    expect(prepared.buildings).toEqual(buildingArrays(direct.buildings));
    expect(transferred[0]!.length).toBeGreaterThan(2); // the geometry's buffers were handed over, not copied
    const graph = await jobs.walkGraphAsync(prepared.model, streets);
    expect(posted).toHaveLength(2);
    expect(graph).toEqual(walkJob(streets, direct.local, direct.half, blockedOf(direct)));
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it("asks the worker once for the same inputs", async () => {
    const { jobs, posted } = await withFakeWorker();
    const [a, b] = await Promise.all([jobs.prepareModelAsync(...args), jobs.prepareModelAsync(...args)]);
    expect(a).toBe(b);
    expect(posted).toHaveLength(1);
    await jobs.prepareModelAsync(plot, 50, 1, 120);
    expect(posted).toHaveLength(2);
  });

  it("falls back to the main thread when the worker answers with an error", async () => {
    const { jobs } = await withFakeWorker(true);
    expect(await jobs.prepareModelAsync(...args)).toEqual(prepareModel(...args));
  });

  it("runModelJob dispatches on the job kind", () => {
    const { model } = runModelJob({ kind: "model", plot, half: 50, dotLevel: 0, rippleM: 120 }) as PreparedModel;
    expect(model).toEqual(buildModel(...args));
    expect(runModelJob({ kind: "walk", streets, local: model.local, half: model.half, blocked: blockedOf(model) })).toHaveProperty("edges");
  });
});

describe("building geometry", () => {
  it("wraps the arrays as the face and edge geometries the model draws", () => {
    const a = buildingArrays(buildModel(...args).buildings);
    const { faceGeo, lineGeo } = buildingGeometries(a);
    expect(Object.keys(faceGeo!.attributes).sort()).toEqual(["aRise", "normal", "position", "uv"]);
    expect(faceGeo!.getAttribute("aRise").count).toBe(faceGeo!.getAttribute("position").count);
    expect(faceGeo!.getAttribute("position").array).toBe(a.faces!.position!.array); // no copy
    // one edge per pair of points, each with its building's ripple order and height
    expect(lineGeo!.getAttribute("instanceRise").count).toBe(a.edgePos.length / 6);
    expect(lineGeo!.boundingSphere).not.toBeNull();
    // the heights are the buildings' own: the tallest edge is the 12 m one
    expect(Math.max(...Array.from(a.edgeRise).filter((_, i) => i % 2 === 1))).toBe(12);
  });

  it("gives nothing to draw without buildings", () => {
    expect(buildingGeometries(buildingArrays([]))).toEqual({ faceGeo: null, lineGeo: null });
  });
});
