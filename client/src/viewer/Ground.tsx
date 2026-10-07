import { useMemo } from "react";
import * as THREE from "three";
import type { Ring } from "@massing/shared";
import { PLAN_TO_WORLD, shapeOf } from "./geometry";

const GROUND_SIZE = 20000;

/**
 * Unlit ground in exactly the background colour, so it has no visible edge or horizon,
 * with a shadow-only layer on top that receives the sun's shadows.
 */
export function Ground({ colour, shadowOpacity }: { colour: string; shadowOpacity: number }) {
  return (
    <group rotation={PLAN_TO_WORLD}>
      <mesh>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshBasicMaterial color={colour} />
      </mesh>
      <mesh receiveShadow position={[0, 0, 0.01]}>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <shadowMaterial opacity={shadowOpacity} />
      </mesh>
    </group>
  );
}

/** Parcel as a slightly darker tint just above the ground. Also receives shadows. */
export function Parcel({ ring, colour, shadowOpacity }: { ring: Ring; colour: string; shadowOpacity: number }) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(shapeOf(ring)), [ring]);
  return (
    <group rotation={PLAN_TO_WORLD} position={[0, 0.03, 0]}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={colour} />
      </mesh>
      <mesh geometry={geometry} receiveShadow position={[0, 0, 0.01]}>
        <shadowMaterial opacity={shadowOpacity} />
      </mesh>
    </group>
  );
}
