import { describe, expect, it } from "vitest";
import { DIRECTIONS_HASH, PRESENT_HASH, RULES_HASH, SCREEN_HASH, isStudioHash, screenOfHash } from "./routes";

describe("routes", () => {
  it("knows the studio's hashes and nothing else", () => {
    for (const h of ["#studio", RULES_HASH, DIRECTIONS_HASH, PRESENT_HASH]) expect(isStudioHash(h)).toBe(true);
    for (const h of ["", "#", "#studios", "#land"]) expect(isStudioHash(h)).toBe(false);
  });

  it("maps every screen to its hash and back; plain #studio is Directions", () => {
    for (const [screen, hash] of Object.entries(SCREEN_HASH)) expect(screenOfHash(hash)).toBe(screen);
    expect(screenOfHash("#studio")).toBe("directions");
    expect(screenOfHash("#studio/unknown")).toBe("directions");
  });
});
