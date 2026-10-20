import { toLocal, type Local, type PlotData } from "../globe/plotLayer";
import { buildingArrays, buildingBuffers, type BuildingArrays } from "./buildingGeometry";
import { blockedTest, buildModel, type ModelData, type Poly } from "./modelData";
import { walkGraph, type Graph } from "./movers";

/**
 * The site model's heavy work as plain-data jobs, so it can run in a worker: building the model (clipping and merging
 * the context blocks), extruding its buildings and its walking graph stalled the page for 50–100 ms while the rules
 * window was open.
 */

/** Streets as fetched: OSM class and a lon/lat polyline. */
export type StreetLonLat = { h: string; p: [number, number][] };

export type ModelJob =
  | { kind: "model"; plot: PlotData; half: number; dotLevel: number; rippleM: number }
  /** `blocked`: the footprints and water people cannot walk through (a function cannot cross to a worker). */
  | { kind: "walk"; streets: StreetLonLat[]; local: Local; half: number; blocked: Poly[] };

/** The model and its buildings' geometry (as arrays). */
export type PreparedModel = { model: ModelData; buildings: BuildingArrays };

export function prepareModel(plot: PlotData, half: number, dotLevel: number, rippleM: number): PreparedModel {
  const model = buildModel(plot, half, dotLevel, rippleM);
  return { model, buildings: buildingArrays(model.buildings) };
}

/** The walking graph of the model square: the streets in local metres, around buildings and water. */
export function walkJob(streets: StreetLonLat[], local: Local, half: number, blocked: Poly[]): Graph {
  const lines = streets.map((l) => ({ h: l.h, p: l.p.map(([lon, lat]) => toLocal(local, lon, lat)) }));
  return walkGraph(lines, half, blockedTest(blocked));
}

/** What people cannot walk through in a model. */
export const blockedOf = (model: ModelData): Poly[] => [...model.buildings.flatMap((b) => b.polys), ...model.water];

export function runModelJob(job: ModelJob): PreparedModel | Graph {
  return job.kind === "model" ? prepareModel(job.plot, job.half, job.dotLevel, job.rippleM) : walkJob(job.streets, job.local, job.half, job.blocked);
}

/** What a job's answer hands over to the main thread instead of copying: the geometry's buffers. */
export const transferOf = (result: PreparedModel | Graph): ArrayBuffer[] => ("buildings" in result ? buildingBuffers(result.buildings) : []);
