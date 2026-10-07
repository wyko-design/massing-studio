import { describe, expect, it } from "vitest";
import { ORTHO_DISTANCE, convertView, focusOf, lookFrom, presetView, type View } from "./camera";

const square: [number, number][] = [
  [-5, -5],
  [5, -5],
  [5, 5],
  [-5, 5],
];
const frame = { width: 1000, height: 800 };

describe("camera presets", () => {
  const focus = focusOf(square, [{ footprint: { type: "Polygon", coordinates: [square] }, zBase: 0, height: 12 }]);

  it("focuses on the parcel with a minimum radius", () => {
    expect(focus.centre).toEqual([0, 0]);
    expect(focus.parcelRadius).toBeCloseTo(Math.SQRT2 * 5);
    expect(focus.radius).toBe(40);
    expect(focus.height).toBe(12);
  });

  it("looks from the named corner", () => {
    const se = presetView("se", focus, frame, "ortho", null);
    // south-east of the target: x east > 0, world z = −north > 0, above the ground
    expect(se.position[0]).toBeGreaterThan(0);
    expect(se.position[2]).toBeGreaterThan(0);
    expect(se.position[1]).toBeGreaterThan(0);
    const nw = presetView("nw", focus, frame, "ortho", null);
    expect(nw.position[0]).toBeLessThan(0);
    expect(nw.position[2]).toBeLessThan(0);
  });

  it("fits the focus radius in the shorter frame side", () => {
    expect(presetView("ne", focus, frame, "ortho", null).zoom).toBeCloseTo(800 / 80);
  });

  it("returns the preset in the requested projection", () => {
    const p = presetView("sw", focus, frame, "perspective", null);
    expect(p.projection).toBe("perspective");
    expect(Math.hypot(...p.position)).toBeLessThan(ORTHO_DISTANCE);
  });

  it("top view is straight down with north up (camera a hair to the south)", () => {
    const top = presetView("top", focus, frame, "ortho", null);
    expect(top.position[0]).toBeCloseTo(0);
    expect(top.position[1]).toBeCloseTo(ORTHO_DISTANCE);
    expect(top.position[2]).toBeGreaterThan(0);
    expect(top.position[2]).toBeLessThan(0.1);
  });

  it("eye level stands across the street at eye height, in perspective", () => {
    const eye = presetView("eye", focus, frame, "ortho", 90); // street to the east
    expect(eye.projection).toBe("perspective");
    expect(eye.position[1]).toBeCloseTo(1.6);
    expect(eye.position[0]).toBeGreaterThan(focus.parcelRadius);
    expect(Math.abs(eye.position[2])).toBeLessThan(1e-9);
    const south = presetView("eye", focus, frame, "ortho", null);
    expect(south.position[2]).toBeGreaterThan(focus.parcelRadius); // world z > 0 = south
  });
});

describe("convertView", () => {
  const ortho: View = {
    projection: "ortho",
    position: lookFrom(210, 40).map((c) => c * ORTHO_DISTANCE) as View["position"],
    target: [0, 0, 0],
    zoom: 8,
    fov: 45,
  };

  it("keeps the visible height when switching to perspective", () => {
    const p = convertView(ortho, "perspective", frame);
    const d = Math.hypot(...p.position);
    expect(2 * d * Math.tan((45 * Math.PI) / 360)).toBeCloseTo(frame.height / 8);
  });

  it("round-trips", () => {
    const back = convertView(convertView(ortho, "perspective", frame), "ortho", frame);
    expect(back.zoom).toBeCloseTo(8);
    back.position.forEach((c, i) => expect(c).toBeCloseTo(ortho.position[i]!));
  });

  it("keeps the viewing direction", () => {
    const p = convertView(ortho, "perspective", frame);
    const d = Math.hypot(...p.position);
    p.position.forEach((c, i) => expect(c / d).toBeCloseTo(ortho.position[i]! / ORTHO_DISTANCE));
  });
});
