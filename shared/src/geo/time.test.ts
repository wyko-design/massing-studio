import { describe, expect, it } from "vitest";
import { isoParts, zonedIso } from "./time";

describe("zonedIso", () => {
  it("uses summer time in September", () => {
    expect(zonedIso("2026-09-21", "09:30", "Europe/Amsterdam")).toBe("2026-09-21T09:30:00+02:00");
  });
  it("uses winter time in December", () => {
    expect(zonedIso("2026-12-21", "12:00", "Europe/Amsterdam")).toBe("2026-12-21T12:00:00+01:00");
  });
  it("switches on the DST change day (29 March 2026, 02:00 → 03:00)", () => {
    expect(zonedIso("2026-03-29", "01:30", "Europe/Amsterdam")).toBe("2026-03-29T01:30:00+01:00");
    expect(zonedIso("2026-03-29", "12:00", "Europe/Amsterdam")).toBe("2026-03-29T12:00:00+02:00");
  });
  it("is the same instant as the wall clock in that zone", () => {
    const iso = zonedIso("2026-06-21", "17:45", "Europe/Amsterdam");
    const wall = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
    expect(wall).toBe("17:45");
  });
  it("round-trips the parts", () => {
    expect(isoParts("2026-09-21T09:30:00+02:00")).toEqual({ date: "2026-09-21", time: "09:30" });
  });
});
