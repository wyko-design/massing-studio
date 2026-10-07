const DEG = Math.PI / 180;

/**
 * Unit vector pointing from the scene towards the sun, in the local plan frame
 * [east, north, up]. Angles follow suncalc 2.x `getPosition`: degrees, `azimuth`
 * clockwise from north (0 = N, 90 = E, 180 = S, 270 = W), `altitude` above the horizon.
 */
export function sunVector(azimuthDeg: number, altitudeDeg: number): [number, number, number] {
  const az = azimuthDeg * DEG;
  const alt = altitudeDeg * DEG;
  const horizontal = Math.cos(alt);
  return [Math.sin(az) * horizontal, Math.cos(az) * horizontal, Math.sin(alt)];
}
