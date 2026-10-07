import { useMemo } from "react";
import type { ContextBuilding } from "@massing/shared";
import { PLAN_TO_WORLD, extrude } from "./geometry";

function ContextBuildingMesh({ building, colour }: { building: ContextBuilding; colour: string }) {
  const geometry = useMemo(() => extrude(building.ring, building.height), [building]);
  return (
    <mesh geometry={geometry} rotation={PLAN_TO_WORLD} castShadow receiveShadow>
      <meshLambertMaterial color={colour} />
    </mesh>
  );
}

/** White matte context model. No outlines: the outline is reserved for the proposal (SPEC §10). */
export function ContextModel({ buildings, colour }: { buildings: ContextBuilding[]; colour: string }) {
  return (
    <group>
      {buildings.map((b) => (
        <ContextBuildingMesh key={b.id} building={b} colour={colour} />
      ))}
    </group>
  );
}
