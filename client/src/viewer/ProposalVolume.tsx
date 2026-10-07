import { useMemo } from "react";
import { Edges } from "@react-three/drei";
import { openRing, type Volume } from "@massing/shared";
import type { RenderStyle } from "./renderStyle";
import { PLAN_TO_WORLD, extrudeWithHoles, roofGeometry } from "./geometry";

function VolumeMesh({ volume, style }: { volume: Volume; style: RenderStyle["proposal"] }) {
  const rings = useMemo(() => volume.footprint.coordinates.map(openRing), [volume]);
  const walls = useMemo(() => extrudeWithHoles(rings, volume.height), [rings, volume.height]);
  const roof = useMemo(
    () => (volume.roof ? roofGeometry(rings, volume.height, volume.roof.ridgeAngle, volume.roof.ridgeHeight) : null),
    [rings, volume.height, volume.roof],
  );
  return (
    <group rotation={PLAN_TO_WORLD} position={[0, volume.zBase, 0]}>
      <mesh geometry={walls} castShadow receiveShadow>
        <meshLambertMaterial color={style.colour} />
        <Edges threshold={15} lineWidth={style.outlineWidth} color={style.outlineColour} />
      </mesh>
      {roof && (
        <mesh geometry={roof} castShadow receiveShadow>
          <meshLambertMaterial color={style.colour} side={2} />
          <Edges threshold={15} lineWidth={style.outlineWidth} color={style.outlineColour} />
        </mesh>
      )}
    </group>
  );
}

/** The single saturated proposal mass with a crisp black outline. */
export function ProposalVolume({ volumes, style }: { volumes: Volume[]; style: RenderStyle["proposal"] }) {
  return (
    <group>
      {volumes.map((v, i) => (
        <VolumeMesh key={i} volume={v} style={style} />
      ))}
    </group>
  );
}
