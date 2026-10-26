import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { openRing, type Volume } from "@massing/shared";
import type { LookId, RenderStyle } from "./renderStyle";
import { PLAN_TO_WORLD, extrudeWithHoles, roofGeometry } from "./geometry";
import { EdgeLines } from "./EdgeLines";

function VolumeMesh({ volume, style, look }: { volume: Volume; style: RenderStyle["proposal"]; look: LookId }) {
  const rings = useMemo(() => volume.footprint.coordinates.map(openRing), [volume]);
  const walls = useMemo(() => extrudeWithHoles(rings, volume.height), [rings, volume.height]);
  const roof = useMemo(
    () => (volume.roof ? roofGeometry(rings, volume.height, volume.roof.ridgeAngle, volume.roof.ridgeHeight) : null),
    [rings, volume.height, volume.roof],
  );
  useEffect(() => () => walls.dispose(), [walls]);
  useEffect(() => () => roof?.dispose(), [roof]);
  const lit = look === "sun";
  return (
    <group rotation={PLAN_TO_WORLD} position={[0, volume.zBase, 0]}>
      <mesh geometry={walls} castShadow={lit} receiveShadow={lit}>
        <meshLambertMaterial color={style.colour} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>
      {style.outlineWidth > 0 && <EdgeLines geometry={walls} colour={style.outlineColour} width={style.outlineWidth} />}
      {roof && (
        <>
          <mesh geometry={roof} castShadow={lit} receiveShadow={lit}>
            <meshLambertMaterial color={style.colour} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
          </mesh>
          {style.outlineWidth > 0 && <EdgeLines geometry={roof} colour={style.outlineColour} width={style.outlineWidth} />}
        </>
      )}
    </group>
  );
}

/**
 * The proposal: one saturated mass (the blue token) with crisp edges. In the line look it is the only shaded thing on
 * screen: a fixed light from above the camera's shoulder (`ProposalLight`) gives its roof and walls distinct tones.
 */
export function ProposalVolume({ volumes, style, look }: { volumes: Volume[]; style: RenderStyle["proposal"]; look: LookId }) {
  return (
    <group>
      {volumes.map((v, i) => (
        <VolumeMesh key={i} volume={v} style={style} look={look} />
      ))}
    </group>
  );
}

/**
 * Light for the line look, where nothing else is lit: roofs in the full blue token, walls facing south a step darker, walls
 * facing west darker again, so the mass reads as a volume from the default south-west view.
 */
export function ProposalLight() {
  return (
    <>
      <ambientLight intensity={0.6 * Math.PI} />
      <directionalLight position={[-100, 500, 300]} intensity={0.45 * Math.PI} />
    </>
  );
}
