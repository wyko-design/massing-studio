import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

/**
 * The hard edges of a mesh (faces meeting at more than `threshold` degrees) as one set of fat lines, `width` CSS px wide at
 * any device pixel ratio (so an export at 2× or 4× keeps the on-screen weight), as the landing's site model draws them.
 */
export function EdgeLines({ geometry, colour, width = 1, threshold = 15, renderOrder }: { geometry: THREE.BufferGeometry; colour: string; width?: number; threshold?: number; renderOrder?: number }) {
  const size = useThree((s) => s.size);
  const lines = useMemo(() => {
    const edges = new THREE.EdgesGeometry(geometry, threshold);
    const g = new LineSegmentsGeometry().setPositions(edges.getAttribute("position").array as Float32Array);
    edges.dispose();
    const l = new LineSegments2(g, new LineMaterial({ color: colour, linewidth: width }));
    l.frustumCulled = false;
    if (renderOrder !== undefined) l.renderOrder = renderOrder;
    return l;
  }, [geometry, colour, width, threshold, renderOrder]);
  useEffect(
    () => () => {
      lines.geometry.dispose();
      lines.material.dispose();
    },
    [lines],
  );
  useFrame(() => lines.material.resolution.set(size.width, size.height));
  return <primitive object={lines} />;
}
