import * as THREE from "three";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";

type LineLike = THREE.Object3D & {
  isLineSegments2?: boolean;
  isLine2?: boolean;
  isLine?: boolean;
  isLineSegments?: boolean;
  geometry: THREE.BufferGeometry;
  material: THREE.Material & { color?: THREE.Color; linewidth?: number; dashed?: boolean; dashSize?: number; gapSize?: number };
};

/** SVGRenderer fills only these; anything else (shaders, points, instanced people) is left out of the drawing. */
const MESH_MATERIALS = ["MeshBasicMaterial", "MeshLambertMaterial", "MeshPhongMaterial"];
/** Depth map size, × the view's CSS px: one sample per half px. */
const DEPTH_SCALE = 2;
/** An edge point is visible when nothing is nearer than this (m): edges lie on their own faces. */
const DEPTH_BIAS_M = 0.25;
/** Spacing of the visibility samples along an edge, in view px. */
const STEP_PX = 1.5;

/** The faces, depth-sorted by three's SVGRenderer (painter's order); lines are drawn separately, hidden parts removed. */
function facesSvg(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, background: string): SVGElement {
  const out = new THREE.Scene();
  scene.traverseVisible((o) => {
    let copy: THREE.Object3D | null = null;
    if ((o as THREE.InstancedMesh).isInstancedMesh || (o as LineLike).isLineSegments2 || (o as LineLike).isLine2) return;
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh;
      if (!Array.isArray(m.material) && MESH_MATERIALS.includes(m.material.type)) copy = new THREE.Mesh(m.geometry, m.material);
    } else if ((o as THREE.AmbientLight).isAmbientLight) copy = new THREE.AmbientLight((o as THREE.Light).color);
    else if ((o as THREE.DirectionalLight).isDirectionalLight) copy = new THREE.DirectionalLight((o as THREE.Light).color);
    if (!copy) return;
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(o.matrixWorld);
    out.add(copy);
  });
  const renderer = new SVGRenderer();
  renderer.setSize(width, height);
  renderer.setClearColor(new THREE.Color(background), 1);
  renderer.render(out, camera);
  return renderer.domElement;
}

/** Depth of every pixel of the view (gl_FragCoord.z, 0 near … 1 far), opaque meshes only. Row 0 is the bottom. */
function depthMap(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number): Float32Array {
  const material = new THREE.ShaderMaterial({
    vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }",
    side: THREE.DoubleSide,
  });
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: true });
  // only opaque, plain meshes occlude: lines, points, people and see-through ghosts stay out of the pass
  const hidden: THREE.Object3D[] = [];
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    const ghost = m.isMesh && !Array.isArray(m.material) && m.material.transparent && m.material.opacity < 0.5;
    if ((o as THREE.Points).isPoints || (o as THREE.InstancedMesh).isInstancedMesh || (o as LineLike).isLineSegments2 || (o as LineLike).isLine2 || (o as THREE.Line).isLine || ghost) hidden.push(o);
  });
  const background = scene.background;
  const override = scene.overrideMaterial;
  const clear = gl.getClearColor(new THREE.Color());
  const clearAlpha = gl.getClearAlpha();
  const before = gl.getRenderTarget();
  const buf = new Float32Array(w * h * 4);
  try {
    for (const o of hidden) o.visible = false;
    scene.background = null;
    scene.overrideMaterial = material;
    gl.setRenderTarget(target);
    gl.setClearColor(0xffffff, 1);
    gl.clear();
    gl.render(scene, camera);
    gl.readRenderTargetPixels(target, 0, 0, w, h, buf);
  } finally {
    for (const o of hidden) o.visible = true;
    scene.background = background;
    scene.overrideMaterial = override;
    gl.setRenderTarget(before);
    gl.setClearColor(clear, clearAlpha);
    target.dispose();
    material.dispose();
  }
  const depth = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) depth[i] = buf[i * 4]!;
  return depth;
}

/** World-space segments of a line object: fat lines (instanced start/end) or plain Line / LineSegments. */
function segmentsOf(o: LineLike): THREE.Vector3[] {
  const g = o.geometry;
  const pts: THREE.Vector3[] = [];
  const start = g.getAttribute("instanceStart");
  const end = g.getAttribute("instanceEnd");
  if (start && end) {
    for (let i = 0; i < start.count; i++) {
      pts.push(new THREE.Vector3(start.getX(i), start.getY(i), start.getZ(i)), new THREE.Vector3(end.getX(i), end.getY(i), end.getZ(i)));
    }
  } else {
    const p = g.getAttribute("position");
    if (!p) return [];
    const at = (i: number) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const order = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i);
    if (o.isLineSegments) for (const i of order) pts.push(at(i));
    else for (let k = 0; k + 1 < order.length; k++) pts.push(at(order[k]!), at(order[k + 1]!));
  }
  for (const v of pts) v.applyMatrix4(o.matrixWorld);
  return pts;
}

/**
 * The view on screen as SVG: the faces (SVGRenderer, painter's order), then every edge with its hidden parts removed
 * against a depth map of the same view, so it reads as the line drawing on screen. No wash, labels or point dots.
 */
export function sceneToSvg(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera, width: number, height: number, background = "#ffffff"): string {
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  const svg = facesSvg(scene, camera, width, height, background);

  const W = Math.round(width * DEPTH_SCALE);
  const H = Math.round(height * DEPTH_SCALE);
  const depth = depthMap(gl, scene, camera, W, H);
  const bias = DEPTH_BIAS_M / Math.max(1e-6, camera.far - camera.near);
  const ndc = new THREE.Vector3();
  /** View px (SVGRenderer's centred frame) and visibility of a world point. */
  const look = (p: THREE.Vector3): { x: number; y: number; seen: boolean } => {
    ndc.copy(p).project(camera);
    const x = (ndc.x * width) / 2;
    const y = (-ndc.y * height) / 2;
    const px = Math.floor((ndc.x * 0.5 + 0.5) * W);
    const py = Math.floor((ndc.y * 0.5 + 0.5) * H);
    const d = ndc.z * 0.5 + 0.5;
    let seen = false;
    // visible when the point is not behind the nearest surface at it or a neighbour (edges sit on silhouettes)
    for (let dy = -1; dy <= 1 && !seen; dy++)
      for (let dx = -1; dx <= 1 && !seen; dx++) {
        const qx = px + dx;
        const qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) seen = true;
        else if (d <= depth[qy * W + qx]! + bias) seen = true;
      }
    return { x, y, seen };
  };

  const paths = new Map<string, string[]>();
  const f = (n: number) => n.toFixed(2);
  scene.traverseVisible((o) => {
    const l = o as LineLike;
    if (!(l.isLineSegments2 || l.isLine2 || l.isLine) || Array.isArray(l.material)) return;
    const m = l.material;
    const colour = `#${(m.color ?? new THREE.Color(0x000000)).getHexString()}`;
    const widthPx = l.isLineSegments2 || l.isLine2 ? (m.linewidth ?? 1) : 1;
    const dash = m.type === "LineDashedMaterial" || m.dashed ? `${m.dashSize ?? 1} ${m.gapSize ?? 1}` : "";
    const key = `${colour}|${widthPx}|${dash}`;
    const throughAll = m.depthTest === false;
    const d = paths.get(key) ?? [];
    const pts = segmentsOf(l);
    const a = new THREE.Vector3();
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const p0 = pts[i]!;
      const p1 = pts[i + 1]!;
      const s0 = look(p0);
      const s1 = look(p1);
      if (Math.max(Math.abs(s0.x), Math.abs(s1.x)) > width && Math.max(Math.abs(s0.y), Math.abs(s1.y)) > height) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(s1.x - s0.x, s1.y - s0.y) / STEP_PX));
      let run: { x: number; y: number } | null = null;
      let last = s0;
      for (let k = 0; k <= n; k++) {
        const s = k === 0 ? s0 : k === n ? s1 : look(a.lerpVectors(p0, p1, k / n));
        const seen = throughAll || s.seen;
        if (seen && !run) run = s;
        if (!seen && run) {
          d.push(`M${f(run.x)} ${f(run.y)}L${f(last.x)} ${f(last.y)}`);
          run = null;
        }
        last = s;
      }
      if (run) d.push(`M${f(run.x)} ${f(run.y)}L${f(last.x)} ${f(last.y)}`);
    }
    paths.set(key, d);
  });

  const NS = "http://www.w3.org/2000/svg";
  const group = document.createElementNS(NS, "g");
  group.setAttribute("fill", "none");
  group.setAttribute("stroke-linecap", "round");
  for (const [key, d] of paths) {
    if (!d.length) continue;
    const [colour, widthPx, dash] = key.split("|");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d.join(""));
    path.setAttribute("stroke", colour!);
    path.setAttribute("stroke-width", widthPx!);
    if (dash) path.setAttribute("stroke-dasharray", dash);
    group.appendChild(path);
  }
  svg.appendChild(group);
  svg.setAttribute("xmlns", NS);
  return new XMLSerializer().serializeToString(svg);
}
