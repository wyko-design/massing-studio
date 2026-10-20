import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { easeCubicInOut, easeCubicOut } from "d3-ease";
import type { Envelope } from "@massing/shared";
import type { BoxStyle } from "../grid";
import { localFrame, plotView, toLocal, type PlotData } from "../globe/plotLayer";
import { perfCall, timed } from "../perf";
import { buildingGeometries, edgePoints, prism, shapeOf, type BuildingArrays } from "./buildingGeometry";
import { envelopeRings, type ModelData, type Poly, type XY } from "./modelData";
import { modelGraph, prepareModelAsync } from "./modelJobs";
import { DIRECTIONS_HASH } from "../../routes";
import type { PreparedModel } from "./modelWork";
import { moverPose, spawnMover, stepMover, type Graph, type Mover } from "./movers";
import { LOOKS, modelStyle as S, sequence, viewLimits, type Look } from "./modelStyle";

/**
 * The site model (after the rules): a three.js copy of the 2D plot view that starts as its exact top view (same centre,
 * same px per metre, same layers), then turns to an isometric view while the buildings rise to their 3DBAG heights, the
 * buildable envelope rises as a ghost and people start to walk. The surroundings fill the window and can be panned a
 * little; zoom and pan stop before the end of the data could show.
 *
 * Local metres x east, y north become world (x, height, −y).
 */
export type SiteModelProps = {
  /** The plot with its wider surroundings (a box of half side `radiusM` around `plot.centre`, else the address point). */
  plot: PlotData;
  radiusM: number;
  /** Canvas rectangle (CSS px), animated with the window. */
  box: BoxStyle;
  dpr: number;
  /** Pixels per metre of the 2D plot view at the hand-over, and the lattice level its dots were at. */
  startPxPerM: number;
  dotLevel: number;
  dotFade: number;
  /** Size of the canvas at the end (CSS px): the square window's inside. */
  finalSize: { w: number; h: number };
  envelope: Envelope | null;
  /** Scene origin (parcel centroid) the envelope is relative to. */
  origin: { lat: number; lon: number } | null;
  /** performance.now() of the hand-over; null while the model is being built (it then holds the top view). */
  start: number | null;
  reducedMotion: boolean;
  /** The first frame is on screen: the hand-over can start. */
  onReady: () => void;
};

type Clock = { elapsed: () => number };

/** Per-viewer memory of the chosen lighting look. */
const LOOK_KEY = "massing.siteLook";

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const at = (e: number, delay: number, ms: number) => clamp01((e - delay) / ms);
const RAD = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/** Closed rings as line-segment pairs at height `y`. */
function ringSegments(rings: XY[][], y: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      out.push([a[0], y, -a[1]], [b[0], y, -b[1]]);
    }
  return out;
}

/** A flat ground layer: filled polygons with an optional outline, drawn before (and under) everything standing. */
function Flat({ polys, fill, line, order, onTop = false }: { polys: Poly[]; fill: string; line?: string; order: number; onTop?: boolean }) {
  const geometry = useMemo(() => {
    if (!polys.length) return null;
    const g = new THREE.ShapeGeometry(polys.map(shapeOf));
    g.rotateX(-Math.PI / 2);
    return g;
  }, [polys]);
  const segments = useMemo(() => (line ? ringSegments(polys.flat(), 0) : []), [polys, line]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return (
    <>
      {geometry && (
        <mesh geometry={geometry} renderOrder={order}>
          <meshBasicMaterial color={fill} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {line && segments.length > 0 && <Line points={segments} segments color={line} lineWidth={1} depthWrite={false} transparent={onTop} renderOrder={onTop ? 15 : order + 1} />}
    </>
  );
}

/** The parcel's blue dots, on the ground, hidden behind the buildings that stand in front of them. The finer lattice (half-faded in the 2D view) fades out as the camera turns. */
function Dots({ dots, fade, clock }: { dots: ModelData["dots"]; fade: number; clock: Clock }) {
  const [coarse, fine] = useMemo(
    () =>
      [dots.coarse, dots.fine].map((d) => {
        const g = new THREE.BufferGeometry();
        const pos = new Float32Array((d.length / 2) * 3);
        for (let i = 0; i < d.length / 2; i++) pos.set([d[2 * i]!, 0, -d[2 * i + 1]!], 3 * i);
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        return g;
      }),
    [dots],
  );
  const fineMat = useRef<THREE.PointsMaterial>(null);
  useFrame(() => {
    if (fineMat.current) fineMat.current.opacity = fade * (1 - at(clock.elapsed(), S.camera.delayMs, S.camera.ms * 0.5));
  });
  return (
    <>
      <points geometry={coarse} renderOrder={16}>
        <pointsMaterial color={S.colours.plot} size={1.5} sizeAttenuation={false} depthWrite={false} transparent />
      </points>
      <points geometry={fine} renderOrder={16}>
        <pointsMaterial ref={fineMat} color={S.colours.plot} size={1.5} sizeAttenuation={false} depthWrite={false} transparent opacity={fade} />
      </points>
    </>
  );
}

/**
 * The rise, in the vertex shader: every vertex carries its building's (ripple order, height); the geometry is built at
 * full height and its y is scaled by the eased rise of that building (never below the flat start thickness).
 */
const RISE_GLSL = /* glsl */ `
uniform float uRiseTime;
uniform vec3 uRise;
uniform float uFlat;
float riseK(float order) {
  float x = clamp((uRiseTime - uRise.x - order * uRise.y) / uRise.z, 0.0, 1.0);
  float y = 1.0 - x;
  return 1.0 - y * y * y;
}
vec3 riseP(vec3 p, vec2 r) { return vec3(p.x, p.y * max(riseK(r.x), uFlat / r.y), p.z); }
`;

type RiseUniforms = { uRiseTime: { value: number }; uRise: { value: THREE.Vector3 }; uFlat: { value: number } };

/** Adds the rise to a material's vertex shader (`transformed` = the vertex in object space). */
function withRise<M extends THREE.Material>(m: M, uniforms: RiseUniforms, key: string): M {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      "attribute vec2 aRise;\n" + RISE_GLSL + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = riseP(transformed, aRise);");
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/**
 * Context buildings: one mesh and one set of edges for all of them, rising from the plot outwards. Flat white for the
 * line look; lit (and casting / receiving shadows) for the others. The shadow pass uses a depth material with the same
 * rise, so the shadows grow with the buildings.
 */
function Buildings({ arrays, clock, look, delayMs }: { arrays: BuildingArrays; clock: Clock; look: Look; delayMs: number }) {
  const size = useThree((s) => s.size);
  const uniforms = useMemo<RiseUniforms>(
    () => ({ uRiseTime: { value: 0 }, uRise: { value: new THREE.Vector3(delayMs, S.rise.spreadMs, S.rise.ms) }, uFlat: { value: S.flatM } }),
    [delayMs],
  );
  // extruded and edged in the worker (buildingGeometry.ts): only wrapped here
  const { faceGeo, lineGeo } = useMemo(() => timed("buildingGeometry", () => buildingGeometries(arrays)), [arrays]);
  useEffect(
    () => () => {
      faceGeo?.dispose();
      lineGeo?.dispose();
    },
    [faceGeo, lineGeo],
  );

  const lit = look.light !== null;
  const { faceMat, depthMat } = useMemo(() => {
    const common = { color: S.colours.building, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
    return {
      faceMat: lit ? withRise(new THREE.MeshLambertMaterial(common), uniforms, "site-rise-lit") : withRise(new THREE.MeshBasicMaterial(common), uniforms, "site-rise"),
      depthMat: withRise(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms, "site-rise-depth"),
    };
  }, [lit, uniforms]);
  const lines = useMemo(() => {
    if (!lineGeo || !look.lines) return null;
    const mat = new LineMaterial({ color: look.lines, linewidth: 1 });
    Object.assign(mat.uniforms, uniforms);
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "attribute vec2 instanceRise;\n" + RISE_GLSL + "void main() {")
        .replace("vec4( instanceStart, 1.0 )", "vec4( riseP( instanceStart, instanceRise ), 1.0 )")
        .replace("vec4( instanceEnd, 1.0 )", "vec4( riseP( instanceEnd, instanceRise ), 1.0 )");
    };
    mat.customProgramCacheKey = () => "site-rise-line";
    const l = new LineSegments2(lineGeo, mat);
    l.frustumCulled = false;
    return l;
  }, [lineGeo, look.lines, uniforms]);
  useEffect(
    () => () => {
      faceMat.dispose();
      depthMat.dispose();
    },
    [faceMat, depthMat],
  );
  useEffect(() => () => lines?.material.dispose(), [lines]);
  useFrame(() => {
    uniforms.uRiseTime.value = clock.elapsed();
    lines?.material.resolution.set(size.width, size.height);
  });
  return (
    <>
      {faceGeo && <mesh geometry={faceGeo} material={faceMat} customDepthMaterial={depthMat} castShadow={lit} receiveShadow={lit} frustumCulled={false} />}
      {lines && <primitive object={lines} />}
    </>
  );
}

/** Sun and sky for a lit look: an ambient light and a shadow-casting sun whose shadow camera covers the model. Intensities ×π: three's Lambert divides by π. */
function Sun({ light, half }: { light: NonNullable<Look["light"]>; half: number }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const gl = useThree((s) => s.gl);
  const el = light.elevationDeg * RAD;
  const az = light.azimuthDeg * RAD;
  const D = 1500;
  const position: [number, number, number] = [Math.sin(az) * Math.cos(el) * D, Math.sin(el) * D, -Math.cos(az) * Math.cos(el) * D];
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    const c = l.shadow.camera;
    // the shadow box is the model square seen from the sun; low suns stretch it along the ground
    const r = half * 1.05;
    c.left = -r;
    c.right = r;
    c.top = r;
    c.bottom = -r;
    c.near = 1;
    c.far = 3 * D;
    c.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
    gl.shadowMap.needsUpdate = true; // the map is frozen once the buildings stand (ShadowSettle)
  }, [half, light, gl]);
  return (
    <>
      <ambientLight intensity={light.ambient * Math.PI} />
      <directionalLight
        ref={sun}
        position={position}
        intensity={light.sun * Math.PI}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.15}
        shadow-radius={light.softness}
      />
    </>
  );
}

/** Shadows on the ground layers: a shadow-only plane just above them, so the roads and the ground keep their exact colours in the sun. */
function GroundShadow({ half, opacity }: { half: number; opacity: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow renderOrder={-11}>
      <planeGeometry args={[half * 2.2, half * 2.2]} />
      <shadowMaterial transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** The buildable envelope from the rules: faint blue fill, dashed blue edges (hidden behind buildings in front), rising last. */
function Ghost({ rings, height, dash, clock, delayMs }: { rings: XY[][]; height: number | null; dash: number; clock: Clock; delayMs: number }) {
  const h = height && height > 0 ? height : S.flatM;
  const { geometry, edges } = useMemo(() => {
    const g = prism([rings], h);
    return { geometry: g, edges: edgePoints(g) };
  }, [rings, h]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const e = clock.elapsed();
    g.visible = e >= delayMs;
    g.scale.y = Math.max(0.001, easeCubicInOut(at(e, delayMs, S.ghost.ms)));
  });
  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} renderOrder={20}>
        <meshBasicMaterial color={S.colours.plot} transparent opacity={S.ghost.fillOpacity} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Line
        points={edges}
        segments
        dashed
        dashSize={dash * S.ghost.dashPx}
        gapSize={dash * S.ghost.gapPx}
        color={S.colours.plot}
        lineWidth={1}
        transparent
        renderOrder={21}
      />
    </group>
  );
}

const rand = (r: number[]) => r[0]! + Math.random() * (r[1]! - r[0]!);

/** Scale figure: body and head, about 1.75 m. */
function personGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.2, 0.24, 1.25, 8).translate(0, 0.625, 0);
  const head = new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.55, 0);
  const g = mergeGeometries([body, head])!;
  body.dispose();
  head.dispose();
  return g;
}

/** People on the paths and pavements; they appear once the model stands. */
function People({ graph, half, clock, delayMs }: { graph: Graph; half: number; clock: Clock; delayMs: number }) {
  const m = S.movers;
  const people = useMemo(() => {
    const n = Math.min(m.maxPeople, Math.round(graph.length * m.peoplePerM));
    const list = Array.from({ length: n }, () => spawnMover(graph, Math.random, rand(m.walk), (Math.random() - 0.5) * 1.6)).filter((x): x is Mover => !!x);
    // staggered entrance: each one grows in at its own moment
    list.forEach((p) => (p.age = -Math.random() * 1.2));
    return list;
  }, [graph, m]);
  const geometry = useMemo(personGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const crowd = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const last = useRef<number | null>(null);

  useFrame(() => {
    const mesh = crowd.current;
    if (!mesh) return;
    const now = performance.now();
    const dt = last.current === null ? 0 : Math.min(0.1, (now - last.current) / 1000);
    last.current = now;
    const live = clock.elapsed() >= delayMs;
    people.forEach((mv, i) => {
      if (live) stepMover(graph, mv, dt, Math.random, half);
      const p = moverPose(graph, mv);
      dummy.position.set(p.x, 0, -p.y);
      dummy.rotation.set(0, p.heading, 0);
      dummy.scale.setScalar(Math.max(1e-4, easeCubicOut(live ? clamp01(mv.age / m.popS) : 0)));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!people.length) return null;
  return (
    <instancedMesh ref={crowd} args={[geometry, undefined, people.length]} frustumCulled={false}>
      <meshBasicMaterial color={S.colours.person} />
    </instancedMesh>
  );
}

/** Camera: top view (north up, the 2D view's scale) → isometric from the south-west at the end view's zoom. */
function Rig({ clock, startZoom, endZoom, onDone }: { clock: Clock; startZoom: number; endZoom: number; onDone: () => void }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const done = useRef(false);
  const fh = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (done.current) return;
    const e = clock.elapsed();
    const t = easeCubicInOut(at(e, S.camera.delayMs, S.camera.ms));
    const theta = t * S.camera.polarDeg * RAD;
    const phi = t * S.camera.azimuthDeg * RAD;
    const R = 2000;
    // horizontal view direction (north turned φ towards east); screen up is it tilted up by θ, so the top view keeps north up
    fh.set(Math.sin(phi), 0, -Math.cos(phi));
    camera.position.set(-fh.x * R * Math.sin(theta), R * Math.cos(theta), -fh.z * R * Math.sin(theta));
    camera.up.copy(fh).multiplyScalar(Math.cos(theta)).addScaledVector(UP, Math.sin(theta)).normalize();
    camera.lookAt(0, 0, 0);
    camera.zoom = startZoom * Math.pow(endZoom / startZoom, t);
    camera.updateProjectionMatrix();
    if (e >= S.camera.delayMs + S.camera.ms) {
      // hand over to the orbit controls, which need world up
      camera.up.copy(UP);
      camera.lookAt(0, 0, 0);
      done.current = true;
      onDone();
    }
  });
  return null;
}

/**
 * Rhino's viewport navigation, on the canvas: right drag turns the view about its target, Shift + right drag pans,
 * Ctrl + right drag zooms, the wheel zooms. No inertia (the view stops with the mouse). The target stays within `panM` of
 * the plot, the zoom within [minZoom, maxZoom] and the tilt within the model's limits, so the end of the data never shows.
 */
function RhinoControls({ limits }: { limits: ReturnType<typeof viewLimits> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const dom = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const R = 2000;
    const target = new THREE.Vector3();
    // the turn the Rig ended on, read back from the camera
    const rel = camera.position.clone();
    let polar = Math.acos(Math.min(1, Math.max(-1, rel.y / (rel.length() || 1))));
    let azimuth = Math.atan2(-rel.x, rel.z); // camera sits at -forward·sinθ: forward = (sinφ, 0, −cosφ)
    const maxPolar = S.orbit.maxPolarDeg * RAD;
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const place = () => {
      polar = Math.min(maxPolar, Math.max(1e-3, polar));
      fwd.set(Math.sin(azimuth), 0, -Math.cos(azimuth));
      camera.position.set(target.x - fwd.x * R * Math.sin(polar), R * Math.cos(polar), target.z - fwd.z * R * Math.sin(polar));
      camera.up.copy(UP);
      camera.lookAt(target.x, 0, target.z);
      camera.zoom = Math.min(limits.maxZoom, Math.max(limits.minZoom, camera.zoom));
      camera.updateProjectionMatrix();
      invalidate();
    };
    place();
    type Drag = { mode: "rotate" | "pan" | "zoom"; x: number; y: number };
    let drag: Drag | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 2) return;
      drag = { mode: e.ctrlKey ? "zoom" : e.shiftKey ? "pan" : "rotate", x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.mode === "rotate") {
        azimuth += dx * 0.006;
        polar -= dy * 0.006;
      } else if (drag.mode === "pan") {
        // the ground point under the cursor follows it
        fwd.set(Math.sin(azimuth), 0, -Math.cos(azimuth));
        right.set(Math.cos(azimuth), 0, Math.sin(azimuth));
        const k = 1 / camera.zoom;
        const cos = Math.max(0.2, Math.cos(polar));
        target.addScaledVector(right, -dx * k).addScaledVector(fwd, (dy * k) / cos);
        const d = Math.hypot(target.x, target.z);
        if (d > limits.panM) target.multiplyScalar(limits.panM / d);
      } else {
        camera.zoom *= Math.exp(-dy * 0.006);
      }
      place();
    };
    const up = (e: PointerEvent) => {
      if (!drag) return;
      drag = null;
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.zoom *= Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      place();
    };
    const menu = (e: Event) => e.preventDefault();
    dom.addEventListener("pointerdown", down);
    dom.addEventListener("pointermove", move);
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    dom.addEventListener("wheel", wheel, { passive: false });
    dom.addEventListener("contextmenu", menu);
    return () => {
      dom.removeEventListener("pointerdown", down);
      dom.removeEventListener("pointermove", move);
      dom.removeEventListener("pointerup", up);
      dom.removeEventListener("pointercancel", up);
      dom.removeEventListener("wheel", wheel);
      dom.removeEventListener("contextmenu", menu);
    };
  }, [camera, dom, invalidate, limits]);
  return null;
}

/** Once the buildings stand (nothing else casts a shadow), the shadow map is drawn one last time and then kept: no per-frame shadow pass. */
function ShadowSettle({ clock, doneMs }: { clock: Clock; doneMs: number }) {
  const gl = useThree((s) => s.gl);
  const settled = useRef(false);
  useFrame(() => {
    if (settled.current || clock.elapsed() < doneMs) return;
    settled.current = true;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  });
  return null;
}

/**
 * Compiles the scene's shaders before anything is drawn, without blocking the page where the browser can
 * (KHR_parallel_shader_compile): the first frame compiling them itself stalled the page ~50 ms while the rules were read.
 */
function Precompile({ onDone }: { onDone: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let live = true;
    // a task of its own: right after the canvas mounted, the two together went over 50 ms
    const id = setTimeout(() => {
      const t0 = performance.now();
      const ready = gl.compileAsync(scene, camera);
      perfCall("compile (main thread)", performance.now() - t0);
      void ready.then(() => {
        perfCall("compileAsync (wall time)", performance.now() - t0);
        if (live) onDone();
      });
    }, 0);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [gl, scene, camera, onDone]);
  return null;
}

/** Calls `onReady` once the first frame has been drawn. */
function FirstFrame({ onReady }: { onReady: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    setTimeout(onReady, 0);
  });
  return null;
}

/** White inner wash along the four edges (`width` px, quadratic falloff), the same as the 2D views' vignette. */
function washBackground(width: number): string {
  const stops = Array.from({ length: 9 }, (_, i) => `rgba(255,255,255,${((1 - i / 8) ** 2).toFixed(4)}) ${((width * i) / 8).toFixed(1)}px`).join(", ");
  return ["to bottom", "to top", "to right", "to left"].map((dir) => `linear-gradient(${dir}, ${stops})`).join(", ");
}

/**
 * Builds the model data and its buildings' geometry off the main thread, then draws them. Nothing is mounted (no canvas,
 * no first frame, so no `onReady`) until the first model has arrived; when the inputs change later, the last model stays
 * up until the new one is in.
 */
export default function SiteModel(props: SiteModelProps) {
  const { plot, radiusM, dotLevel } = props;
  // the data is a box of `radiusM` around the parcel's centre (older answers: the address point); the model is centred on
  // the view's centre, which can sit a little off it. Never below the frame's half, so a model always stands.
  const half = useMemo(() => {
    const centre = plotView(plot, { x: 0, y: 0, w: 1, h: 1 }).centre;
    const dataCentre = plot.centre ?? plot.point;
    const [x, y] = toLocal(localFrame(centre), dataCentre[0], dataCentre[1]);
    return Math.max(plot.frameM / 2, (plot.radiusM ?? radiusM) - Math.max(Math.abs(x), Math.abs(y)) - 2);
  }, [plot, radiusM]);
  const [prepared, setPrepared] = useState<PreparedModel | null>(null);
  useEffect(() => {
    let live = true;
    void prepareModelAsync(plot, half, dotLevel, S.rise.rippleFrames * plot.frameM).then((p) => live && setPrepared(p));
    return () => {
      live = false;
    };
  }, [plot, half, dotLevel]);
  return prepared ? <ModelView {...props} half={prepared.model.half} model={prepared.model} buildings={prepared.buildings} /> : null;
}

function ModelView(props: SiteModelProps & { half: number; model: ModelData; buildings: BuildingArrays }) {
  const { plot, box, dpr, startPxPerM, dotFade, finalSize, envelope, origin, start, reducedMotion, onReady, half, model, buildings } = props;
  const ghost = useMemo(() => (envelope && origin ? envelopeRings(envelope, origin, model.local).filter((r) => r.length >= 3) : []), [envelope, origin, model]);
  const times = useMemo(() => sequence(ghost.length > 0), [ghost.length]);
  const startRef = useRef(start);
  startRef.current = start;
  const clock = useMemo<Clock>(
    () => ({ elapsed: () => (reducedMotion ? 1e9 : startRef.current === null ? 0 : performance.now() - startRef.current) }),
    [reducedMotion],
  );
  const limits = useMemo(() => viewLimits(finalSize.w, finalSize.h, plot.frameM, half), [finalSize.w, finalSize.h, plot.frameM, half]);
  const [orbit, setOrbit] = useState(false);
  // no frame (not even the hidden first one) until the shaders are compiled
  const [compiled, setCompiled] = useState(false);
  const onCompiled = useMemo(() => () => setCompiled(true), []);
  const [lookId, setLookId] = useState<string>(() => {
    try {
      return localStorage.getItem(LOOK_KEY) ?? LOOKS[0]!.id;
    } catch {
      return LOOKS[0]!.id;
    }
  });
  const look = LOOKS.find((l) => l.id === lookId) ?? LOOKS[0]!;
  // the last landing screen: hand the loaded site and rules over to the studio's Directions screen
  const openDirections = () => {
    window.location.hash = DIRECTIONS_HASH;
  };
  const pickLook = (id: string) => {
    setLookId(id);
    try {
      localStorage.setItem(LOOK_KEY, id);
    } catch {
      // private window: the choice just is not remembered
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const l = LOOKS[Number(e.key) - 1];
      if (l) pickLook(l.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the walkers' graph from the streets of the model square (built off the main thread); nobody walks when they cannot be loaded
  const [graph, setGraph] = useState<Graph | null>(null);
  useEffect(() => {
    if (reducedMotion) return setGraph(null);
    let live = true;
    modelGraph(model).then(
      (g) => live && setGraph(g),
      () => live && setGraph(null),
    );
    return () => {
      live = false;
    };
  }, [model, reducedMotion]);

  // the ground runs far past the data, so no edge of it is ever on screen
  const ground = useMemo<Poly[]>(() => {
    const g = half * 8;
    return [[[[-g, -g], [g, -g], [g, g], [-g, g]]]];
  }, [half]);
  const wash = useMemo(() => washBackground(S.washPx), []);

  return (
    <div
      className={`site-model${orbit ? " live" : ""}`}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height, opacity: start === null ? 0 : 1, pointerEvents: orbit ? "auto" : "none" }}
      aria-label="3D model of the plot and its surroundings"
      role="img"
    >
      <Canvas
        orthographic
        flat
        // built hidden ahead of time: draw on demand only until the hand-over starts
        frameloop={!compiled ? "never" : start === null ? "demand" : "always"}
        dpr={dpr}
        resize={{ debounce: 0, scroll: false }}
        gl={{ antialias: true, alpha: true }}
        shadows="percentage"
        camera={{ position: [0, 2000, 0.001], up: [0, 0, -1], zoom: startPxPerM, near: 1, far: 6000 }}
      >
        {compiled ? <FirstFrame onReady={onReady} /> : <Precompile onDone={onCompiled} />}
        <Rig clock={clock} startZoom={startPxPerM} endZoom={limits.endZoom} onDone={() => setOrbit(true)} />
        <Flat polys={ground} fill={S.colours.ground} order={-20} />
        <Flat polys={model.water} fill={S.colours.waterFill} line={S.colours.waterLine} order={-16} />
        <Flat polys={model.road} fill={S.colours.roadFill} line={S.colours.roadLine} order={-14} />
        {/* the plot: white on the ground; its blue border and dots lie on the ground, behind any building in front */}
        <Flat polys={model.parcel} fill={S.colours.building} line={S.colours.plot} order={-12} onTop />
        <Dots dots={model.dots} fade={dotFade} clock={clock} />
        <Buildings arrays={buildings} clock={clock} look={look} delayMs={times.rise} />
        {look.light && <Sun light={look.light} half={half} />}
        {look.light && <GroundShadow half={half} opacity={look.light.shadow} />}
        {look.ao && (
          <EffectComposer multisampling={4}>
            <N8AO aoRadius={look.ao.radius} distanceFalloff={1} intensity={look.ao.intensity} color="#000000" quality="high" />
          </EffectComposer>
        )}
        {ghost.length > 0 && <Ghost rings={ghost} height={envelope?.maxHeight ?? null} dash={1 / limits.endZoom} clock={clock} delayMs={times.ghost} />}
        {graph && <People graph={graph} half={half} clock={clock} delayMs={times.people} />}
        {orbit && <RhinoControls limits={limits} />}
        <ShadowSettle clock={clock} doneMs={times.people} />
      </Canvas>
      <div className="site-wash" style={{ backgroundImage: wash }} />
      {orbit && (
        <div className="site-looks t-semimono t-label" role="group" aria-label="Lighting (trial)">
          {LOOKS.map((l, i) => (
            <button key={l.id} type="button" className={l.id === look.id ? "on" : undefined} aria-pressed={l.id === look.id} onClick={() => pickLook(l.id)} title={`Key ${i + 1}`}>
              {l.label}
            </button>
          ))}
        </div>
      )}
      {orbit && (
        <button type="button" className="site-next t-semimono t-label" onClick={openDirections}>
          Directions
        </button>
      )}
    </div>
  );
}
