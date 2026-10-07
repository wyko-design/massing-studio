import type { SiteScene, Ring } from "../schemas/site";
import { polygonArea } from "../geo/planar";

/** Hard-coded M0 scene in local metres (origin = parcel centroid, x east, y north). */
const parcelRing: Ring = [
  [-14, -11],
  [15, -12],
  [16, 10],
  [-3, 13],
  [-15, 9],
];

const box = (id: string, cx: number, cy: number, w: number, d: number, height: number) => ({
  id,
  height,
  ring: [
    [cx - w / 2, cy - d / 2],
    [cx + w / 2, cy - d / 2],
    [cx + w / 2, cy + d / 2],
    [cx - w / 2, cy + d / 2],
  ] as Ring,
});

const rect = (x0: number, y0: number, x1: number, y1: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ] as [number, number][],
  ],
});

export const sampleScene: SiteScene = {
  // Stand-in: Delft city centre. P3 replaces it with the real parcel centroid (RD → WGS84).
  origin: { lat: 52.0116, lon: 4.3571 },
  // Test mass for the white-model look: L-shaped, a 4-storey bar plus a 6-storey head.
  proposal: [
    { footprint: rect(-11, -8, 11, 2), zBase: 0, height: 12 },
    { footprint: rect(-11, 2, -1, 9), zBase: 0, height: 18 },
  ],
  parcel: {
    id: "SAMPLE 0001",
    areaM2: Math.round(polygonArea(parcelRing) * 10) / 10,
    ring: parcelRing,
    indicative: true,
  },
  context: [
    // street-side terrace to the south
    box("c01", -30, -32, 12, 14, 9),
    box("c02", -17, -32, 12, 14, 9),
    box("c03", -4, -32, 12, 14, 12),
    box("c04", 9, -32, 12, 14, 9),
    box("c05", 22, -32, 12, 14, 9),
    // west neighbours
    box("c06", -36, -2, 14, 18, 6),
    box("c07", -36, 20, 14, 16, 9),
    // east block
    box("c08", 38, 0, 16, 26, 15),
    box("c09", 38, 28, 16, 14, 12),
    // north
    box("c10", -12, 34, 18, 14, 9),
    box("c11", 10, 36, 16, 12, 6),
    box("c12", 28, 52, 14, 12, 9),
    box("c13", -34, 44, 12, 10, 12),
    // far corners
    box("c14", 56, -30, 14, 14, 18),
    box("c15", -56, -28, 12, 12, 6),
  ],
};
