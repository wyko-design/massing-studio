import { useEffect, useMemo } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ContextBuilding } from "@massing/shared";
import { PLAN_TO_WORLD, extrude } from "./geometry";
import { EdgeLines } from "./EdgeLines";
import type { LookId } from "./renderStyle";

/**
 * The context as one merged mesh. Line look: flat (unlit) faces with grey edges, like the landing's site model. Sun look:
 * matte, lit, casting and receiving shadows, without outlines (the outline is reserved for the proposal, SPEC §10).
 */
export function ContextModel({ buildings, colour, edges, look }: { buildings: ContextBuilding[]; colour: string; edges: string; look: LookId }) {
  const geometry = useMemo(() => {
    // extrusions are non-indexed with the same attributes: they merge into one mesh, one material
    const parts = buildings.filter((b) => b.ring.length >= 3 && b.height > 0).map((b) => extrude(b.ring, b.height));
    if (!parts.length) return null;
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    merged?.rotateX(PLAN_TO_WORLD[0]);
    return merged;
  }, [buildings]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  if (look === "lines") {
    return (
      <>
        <mesh geometry={geometry}>
          <meshBasicMaterial color={colour} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        </mesh>
        <EdgeLines geometry={geometry} colour={edges} />
      </>
    );
  }
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshLambertMaterial color={colour} />
    </mesh>
  );
}
