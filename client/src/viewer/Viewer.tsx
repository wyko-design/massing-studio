import { useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { orbitView } from "../present/camera";
import type { Overlay } from "../present/labels";
import { SceneContents, type SceneProps } from "./SceneContents";
import { CameraRig, LabelOverlay } from "./CameraRig";

type ViewerProps = SceneProps & {
  /** Label layer (Present mode); drawn on a 2D canvas over the render. */
  overlay?: Overlay | null;
  dpr?: number | [number, number];
};

export function Viewer({ overlay, dpr = [1, 2], ...scene }: ViewerProps) {
  const labelCanvas = useRef<HTMLCanvasElement>(null);
  const { elevation, azimuth, zoom } = scene.style.camera;
  const initial = useMemo(() => orbitView([0, 0, 0], azimuth, elevation, zoom), [azimuth, elevation, zoom]);

  return (
    <>
      {/* flat = no tone mapping, so white stays white; "percentage" = PCF shadows with radius.
          offsetSize: measure the layout size, so a CSS-scaled design frame keeps its CSS size. */}
      <Canvas flat shadows="percentage" dpr={dpr} resize={{ offsetSize: true }}>
        <CameraRig initial={initial} />
        <SceneContents {...scene} />
        {overlay && <LabelOverlay canvas={labelCanvas} overlay={overlay} style={scene.style.labels} />}
      </Canvas>
      {overlay && <canvas ref={labelCanvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />}
    </>
  );
}
