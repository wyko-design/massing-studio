/** A point in world coordinates (three.js: x east, y up, z = −north), in metres. */
export type P3 = [number, number, number];

/** Plan point (x east, y north) and a height → world. */
export const toWorld = (p: readonly [number, number], h = 0): P3 => [p[0], h, -p[1]];
