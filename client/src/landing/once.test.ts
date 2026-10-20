import { describe, expect, it } from "vitest";
import { once } from "./geoApi";

describe("once (shared geo requests)", () => {
  it("shares one request per key", async () => {
    let calls = 0;
    const load = () => Promise.resolve(++calls);
    const [a, b] = await Promise.all([once("k1", load), once("k1", load)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    expect(await once("k1", load)).toBe(1);
  });

  it("forgets a failure, so the next call tries again", async () => {
    let calls = 0;
    const load = () => (++calls === 1 ? Promise.reject(new Error("down")) : Promise.resolve("ok"));
    await expect(once("k2", load)).rejects.toThrow("down");
    await Promise.resolve();
    expect(await once("k2", load)).toBe("ok");
    expect(calls).toBe(2);
  });

  it("drops the oldest answers beyond its size", async () => {
    let calls = 0;
    const load = () => Promise.resolve(++calls);
    await once("first", load);
    for (let i = 0; i < 40; i++) await once(`fill-${i}`, load);
    const before = calls;
    await once("first", load);
    expect(calls).toBe(before + 1);
  });
});
