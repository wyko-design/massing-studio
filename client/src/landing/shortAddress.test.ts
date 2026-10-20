import { describe, expect, it } from "vitest";
import { shortAddress } from "./geoApi";

describe("shortAddress", () => {
  it("drops the place name after the postcode, or the whole place when there is no postcode", () => {
    expect(shortAddress("Hendrik Casimirstraat 8, 2628KJ Delft")).toBe("Hendrik Casimirstraat 8, 2628KJ");
    expect(shortAddress("Hendrik Tollensstraat 4, Delft")).toBe("Hendrik Tollensstraat 4");
    expect(shortAddress("Prinsegracht 1A, 2512 EW 's-Gravenhage")).toBe("Prinsegracht 1A, 2512 EW");
    expect(shortAddress("Nowhere")).toBe("Nowhere");
  });
});
