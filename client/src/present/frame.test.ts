import { describe, expect, it } from "vitest";
import { MULTIPLIERS, SQUARE_PX, exportSide } from "./frame";

describe("frame", () => {
  it("is a square whose side the resolution multiplies", () => {
    expect(exportSide(1)).toBe(SQUARE_PX);
    expect(MULTIPLIERS.map(exportSide)).toEqual([SQUARE_PX, 2 * SQUARE_PX, 4 * SQUARE_PX]);
  });
});
