import { useMemo } from "react";
import * as THREE from "three";
import { Edges, Line } from "@react-three/drei";
import { openRing, type Envelope } from "@massing/shared";
import type { RenderStyle } from "./renderStyle";
import { PLAN_TO_WORLD, shapeOf } from "./geometry";

/** Lift the ground outline just above the parcel tint so it does not z-fight. */
const OUTLINE_LIFT = 0.08;

/**
 * Buildable envelope as a ghost: footprint extruded to the max height with a faint fill and
 * dashed edges. With an unknown height only the footprint outline is drawn on the ground, visible
 * through buildings.
 * Transparent, no depth write and no shadows, so it never darkens the white model or the AO.
 */
export function EnvelopeGhost({ envelope, style }: { envelope: Envelope; style: RenderStyle["envelope"] }) {
  const rings = useMemo(() => envelope.footprint.coordinates.map(openRing), [envelope]);
  const geometry = useMemo(() => {
    if (!rings.length || envelope.maxHeight === null || envelope.maxHeight <= 0) return null;
    return new THREE.ExtrudeGeometry(shapeOf(rings[0]!, rings.slice(1)), { depth: envelope.maxHeight, bevelEnabled: false });
  }, [rings, envelope.maxHeight]);

  if (!rings.length) return null;
  const dash = { dashed: style.dashed, dashSize: 0.6, gapSize: 0.4 };

  if (!geometry) {
    return (
      <group>
        {rings.map((ring, i) => (
          <Line
            key={i}
            points={[...ring, ring[0]!].map(([x, y]) => [x, OUTLINE_LIFT, -y] as [number, number, number])}
            color={style.lineColour}
            lineWidth={style.lineWidth * 1.5}
            // drawn through buildings: the plot's own house usually stands on it
            depthTest={false}
            renderOrder={10}
            {...dash}
          />
        ))}
      </group>
    );
  }

  return (
    <mesh geometry={geometry} rotation={PLAN_TO_WORLD} renderOrder={10}>
      <meshBasicMaterial color={style.fillColour} transparent opacity={style.fillOpacity} depthWrite={false} side={THREE.DoubleSide} />
      <Edges threshold={15} color={style.lineColour} lineWidth={style.lineWidth} {...dash} />
    </mesh>
  );
}
