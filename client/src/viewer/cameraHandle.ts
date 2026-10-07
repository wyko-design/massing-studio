import type { FrameSize } from "../present/frame";
import type { View } from "../present/camera";

/** What the on-screen camera rig exposes to code outside the Canvas (presets, saved views, export). */
export type CameraHandle = {
  /** Current camera and orbit target. */
  capture: () => View;
  /** Move the camera; switches projection when the view asks for it. */
  apply: (view: View) => void;
  /** CSS size of the on-screen canvas (the design frame in Present mode). */
  size: () => FrameSize;
};

let handle: CameraHandle | null = null;

export const registerCamera = (h: CameraHandle | null) => {
  handle = h;
};
export const cameraHandle = () => handle;
