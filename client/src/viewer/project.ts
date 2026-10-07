import * as THREE from "three";
import type { Project } from "../present/drawOverlay";

/** World → frame px for a camera and a frame of `width` × `height` CSS px. */
export function makeProject(camera: THREE.Camera, width: number, height: number): Project {
  const v = new THREE.Vector3();
  return (p) => {
    v.set(p[0], p[1], p[2]).project(camera);
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: v.z > -1 && v.z < 1 };
  };
}
