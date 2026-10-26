import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { openRing, pointInRing, type Ring } from "@massing/shared";
import { PLAN_TO_WORLD, ringBounds, shapeOf } from "./geometry";

const GROUND_SIZE = 20000;

/** Spacing (m) of the blue dots that fill the plot in the line look, like the landing's plot view. */
const DOT_SPACING = 1.5;

/**
 * Unlit ground in exactly the background colour, so it has no visible edge or horizon,
 * with a shadow-only layer on top that receives the sun's shadows (sun look only).
 */
export function Ground({ colour, shadowOpacity, shadows }: { colour: string; shadowOpacity: number; shadows: boolean }) {
  return (
    <group rotation={PLAN_TO_WORLD}>
      <mesh>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshBasicMaterial color={colour} />
      </mesh>
      {shadows && (
        <mesh receiveShadow position={[0, 0, 0.01]}>
          <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
          <shadowMaterial opacity={shadowOpacity} />
        </mesh>
      )}
    </group>
  );
}

/** Points of a square lattice (plan metres) inside a ring. */
export function latticeIn(ring: Ring, spacing: number): [number, number][] {
  const open = openRing(ring);
  const b = ringBounds([open]);
  const out: [number, number][] = [];
  for (let x = Math.ceil(b.minX / spacing) * spacing; x <= b.maxX; x += spacing)
    for (let y = Math.ceil(b.minY / spacing) * spacing; y <= b.maxY; y += spacing) if (pointInRing([x, y], open)) out.push([x, y]);
  return out;
}

/**
 * The parcel just above the ground. Sun look: a tint that receives shadows. Line look: white with the blue outline and
 * blue dots of the landing's plot, both hidden behind whatever stands in front of them (as the site model does).
 */
export function Parcel({ ring, colour, line, shadowOpacity, look }: { ring: Ring; colour: string; line: string; shadowOpacity: number; look: "lines" | "sun" }) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(shapeOf(ring)), [ring]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const outline = useMemo(() => {
    const open = openRing(ring);
    return [...open, open[0]!].map(([x, y]) => [x, 0.05, -y] as [number, number, number]);
  }, [ring]);
  const dots = useMemo(() => {
    const pts = latticeIn(ring, DOT_SPACING);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap(([x, y]) => [x, 0.05, -y]), 3));
    return g;
  }, [ring]);
  useEffect(() => () => dots.dispose(), [dots]);
  // point sizes are in device pixels: keep them 1.5 CSS px at any pixel ratio (exports render at 2× and 4×)
  const dpr = useThree((s) => s.viewport.dpr);

  if (look === "sun") {
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
  return (
    <>
      <group rotation={PLAN_TO_WORLD} position={[0, 0.03, 0]}>
        <mesh geometry={geometry}>
          <meshBasicMaterial color={colour} />
        </mesh>
      </group>
      <points geometry={dots}>
        <pointsMaterial color={line} size={1.5 * dpr} sizeAttenuation={false} />
      </points>
      <Line points={outline} color={line} lineWidth={1} transparent depthWrite={false} renderOrder={15} />
    </>
  );
}
