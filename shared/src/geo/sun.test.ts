import { describe, expect, it } from "vitest";
import { sunVector } from "./sun";

const close = (v: number[], expected: number[]) =>
  v.forEach((c, i) => expect(c).toBeCloseTo(expected[i]!, 9));

describe("sunVector (suncalc 2.x convention: degrees, azimuth clockwise from north)", () => {
  it("points north for azimuth 0 on the horizon", () => {
    close(sunVector(0, 0), [0, 1, 0]);
  });
  it("points east for azimuth 90", () => {
    close(sunVector(90, 0), [1, 0, 0]);
  });
  it("points south for azimuth 180", () => {
    close(sunVector(180, 0), [0, -1, 0]);
  });
  it("points west for azimuth 270", () => {
    close(sunVector(270, 0), [-1, 0, 0]);
  });
  it("points straight up at the zenith", () => {
    close(sunVector(123, 90), [0, 0, 1]);
  });
  it("is a unit vector", () => {
    const [e, n, u] = sunVector(140, 25);
    expect(Math.hypot(e, n, u)).toBeCloseTo(1, 12);
  });
});
