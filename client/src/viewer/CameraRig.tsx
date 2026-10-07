import { useEffect, useRef, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { usePresentStore } from "../state/presentStore";
import { DEFAULT_FOV, type View } from "../present/camera";
import { drawOverlay } from "../present/drawOverlay";
import type { Overlay } from "../present/labels";
import type { RenderStyle } from "./renderStyle";
import { registerCamera } from "./cameraHandle";
import { makeProject } from "./project";

/** Ortho stays above the horizon; perspective may look up a little (eye level). */
const MAX_POLAR = { ortho: Math.PI / 2 - 0.05, perspective: Math.PI / 2 + 0.2 } as const;

const tuple = (v: THREE.Vector3): View["position"] => [v.x, v.y, v.z];

/**
 * Orthographic and perspective cameras (the store's projection picks the default one) with orbit,
 * pan and zoom only. Views are applied on the next frame, once the matching camera is the one the
 * controls drive, so a preset can switch projection and move the camera in one call.
 */
export function CameraRig({ initial }: { initial: View }) {
  const projection = usePresentStore((s) => s.projection);
  const ortho = useRef<THREE.OrthographicCamera>(null);
  const persp = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const pending = useRef<View | null>(initial);
  const get = useThree((s) => s.get);

  useFrame(() => {
    const view = pending.current;
    const c = controls.current;
    const cam = view?.projection === "ortho" ? ortho.current : persp.current;
    if (!view || !c || !cam || c.object !== cam) return;
    cam.position.set(...view.position);
    if (cam instanceof THREE.OrthographicCamera) cam.zoom = view.zoom;
    else cam.fov = view.fov;
    cam.updateProjectionMatrix();
    c.target.set(...view.target);
    c.update();
    pending.current = null;
  }, -2);

  useEffect(() => {
    registerCamera({
      capture: () => {
        const camera = get().camera;
        const target = controls.current?.target ?? new THREE.Vector3();
        return {
          projection: camera instanceof THREE.OrthographicCamera ? "ortho" : "perspective",
          position: tuple(camera.position),
          target: tuple(target),
          zoom: ortho.current?.zoom ?? 1,
          fov: persp.current?.fov ?? DEFAULT_FOV,
        };
      },
      apply: (view) => {
        pending.current = view;
        if (usePresentStore.getState().projection !== view.projection) usePresentStore.getState().setProjectionState(view.projection);
      },
      size: () => ({ width: get().size.width, height: get().size.height }),
    });
    return () => registerCamera(null);
  }, [get]);

  return (
    <>
      <OrthographicCamera ref={ortho} makeDefault={projection === "ortho"} near={-1000} far={3000} />
      <PerspectiveCamera ref={persp} makeDefault={projection === "perspective"} near={0.5} far={5000} fov={DEFAULT_FOV} />
      {/* orbit, pan and zoom only: no selection, no gizmos */}
      <OrbitControls ref={controls} makeDefault enableDamping={false} maxPolarAngle={MAX_POLAR[projection]} />
    </>
  );
}

/** Draws the label layer onto a 2D canvas laid over the WebGL canvas, every frame, so it never lags the camera. */
export function LabelOverlay({ canvas, overlay, style }: { canvas: RefObject<HTMLCanvasElement | null>; overlay: Overlay; style: RenderStyle["labels"] }) {
  useFrame((state) => {
    const el = canvas.current;
    if (!el) return;
    const { width, height } = state.size;
    const dpr = state.viewport.dpr;
    const [w, h] = [Math.round(width * dpr), Math.round(height * dpr)];
    if (el.width !== w || el.height !== h) [el.width, el.height] = [w, h];
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    drawOverlay(ctx, overlay, makeProject(state.camera, width, height), { width, height }, dpr, style);
  }, 2);
  return null;
}
