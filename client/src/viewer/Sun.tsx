import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import * as SunCalc from "suncalc";
import { sunVector } from "@massing/shared";
import type { RenderStyle } from "./renderStyle";

type Props = {
  style: RenderStyle["light"];
  origin: { lat: number; lon: number };
  /** Radius (m) around the origin that must receive correct shadows, before shadow length. */
  sceneRadius: number;
  maxHeight: number;
};

/** suncalc-driven directional light with a shadow frustum fitted to the scene, plus sky fill. */
export function Sun({ style, origin, sceneRadius, maxHeight }: Props) {
  const light = useRef<THREE.DirectionalLight>(null);

  const { direction, reach } = useMemo(() => {
    // suncalc 2.x: degrees, azimuth clockwise from north.
    const pos = SunCalc.getPosition(new Date(style.date), origin.lat, origin.lon);
    // Keep a minimum altitude so a night-time date still lights the model from low down.
    const altitude = Math.max(pos.altitude, 5);
    const [e, n, up] = sunVector(pos.azimuth, altitude);
    const shadowLength = Math.min(maxHeight / Math.tan(THREE.MathUtils.degToRad(altitude)), 250);
    return {
      direction: new THREE.Vector3(e, up, -n),
      reach: sceneRadius + shadowLength,
    };
  }, [style.date, origin.lat, origin.lon, sceneRadius, maxHeight]);

  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    const distance = reach + 100;
    l.position.copy(direction).multiplyScalar(distance);
    const cam = l.shadow.camera;
    cam.left = -reach;
    cam.right = reach;
    cam.top = reach;
    cam.bottom = -reach;
    cam.near = 1;
    cam.far = distance + reach;
    cam.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [direction, reach]);

  return (
    <>
      <hemisphereLight args={[style.skyColour, style.bounceColour, style.skyIntensity]} />
      <ambientLight intensity={style.ambientIntensity} />
      <directionalLight
        ref={light}
        intensity={style.sunIntensity}
        castShadow
        shadow-mapSize={[style.shadowMapSize, style.shadowMapSize]}
        shadow-radius={style.shadowSoftness}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  );
}
