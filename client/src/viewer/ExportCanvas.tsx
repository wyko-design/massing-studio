import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import type { ExportJob, ExportState } from "../state/presentStore";
import { ASPECTS, exportSize } from "../present/frame";
import { drawOverlay, overlayFonts } from "../present/drawOverlay";
import type { Overlay } from "../present/labels";
import type { View } from "../present/camera";
import { SceneContents, type SceneProps } from "./SceneContents";
import { makeProject } from "./project";

/** Fixed camera copied from the on-screen view. No controls. */
function ExportCamera({ view }: { view: View }) {
  const ref = useRef<THREE.OrthographicCamera & THREE.PerspectiveCamera>(null);
  useLayoutEffect(() => {
    const cam = ref.current;
    if (!cam) return;
    cam.position.set(...view.position);
    cam.lookAt(...view.target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }, [view]);
  return view.projection === "ortho" ? (
    <OrthographicCamera ref={ref} makeDefault zoom={view.zoom} near={-1000} far={3000} />
  ) : (
    <PerspectiveCamera ref={ref} makeDefault fov={view.fov} near={0.5} far={5000} />
  );
}

/** Let React and R3F finish mounting. Not requestAnimationFrame: it never fires in a hidden tab, and the export renders by hand. */
const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function download(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
}

type RunnerProps = { job: ExportJob; overlay: Overlay | null; labels: SceneProps["style"]["labels"]; onDone: (state: ExportState) => void };

/** Renders the scene twice (compile + shadow map, then the frame), composites the labels, encodes the PNG. */
function ExportRunner({ job, ...rest }: RunnerProps) {
  const get = useThree((s) => s.get);
  // read at start only: a re-render while the job runs must not restart it
  const latest = useRef(rest);
  latest.current = rest;
  useEffect(() => {
    const { overlay, labels, onDone } = latest.current;
    let cancelled = false;
    void (async () => {
      const t0 = performance.now();
      try {
        await Promise.all(overlayFonts(labels).map((f) => document.fonts.load(f)));
        await nextTick();
        if (cancelled) return;
        const state = get();
        const { width, height } = exportSize(job.aspect, job.multiplier);
        const ctx = state.gl.getContext();
        if (ctx.drawingBufferWidth !== width || ctx.drawingBufferHeight !== height) {
          throw new Error(
            `This browser limits the render to ${ctx.drawingBufferWidth}×${ctx.drawingBufferHeight} px (asked ${width}×${height}). Use a smaller resolution.`,
          );
        }
        state.advance(performance.now());
        state.advance(performance.now());

        const out = document.createElement("canvas");
        [out.width, out.height] = [width, height];
        const c2d = out.getContext("2d");
        if (!c2d) throw new Error("No 2D canvas available for the label layer.");
        c2d.drawImage(state.gl.domElement, 0, 0, width, height);
        if (overlay) {
          const { width: w, height: h } = state.size;
          drawOverlay(c2d, overlay, makeProject(state.camera, w, h), { width: w, height: h }, job.multiplier, labels);
        }
        const mime = job.deliver === "report" ? "image/jpeg" : "image/png";
        const blob = await new Promise<Blob>((resolve, reject) =>
          out.toBlob((b) => (b ? resolve(b) : reject(new Error("Image encoding failed (image too large?)."))), mime, 0.9),
        );
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (job.deliver === "download") download(url, job.fileName);
        onDone({ status: "done", url, fileName: job.fileName, width, height, bytes: blob.size, ms: Math.round(performance.now() - t0), blob });
      } catch (e) {
        if (!cancelled) onDone({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job, get]);
  return null;
}

type Props = SceneProps & { job: ExportJob; overlay: Overlay | null; onDone: (state: ExportState) => void };

/**
 * Offscreen export renderer: a second, hidden Canvas laid out at the design frame's CSS size and
 * rendered at `dpr = multiplier`, so the PNG has the full target resolution and the same framing,
 * lighting, AO and outline weights as the Present preview. Unmounting it frees the WebGL context.
 */
export function ExportCanvas({ job, overlay, onDone, ...scene }: Props) {
  const base = ASPECTS[job.aspect];
  return (
    <div aria-hidden style={{ position: "fixed", left: -100000, top: 0, width: base.width, height: base.height, pointerEvents: "none" }}>
      <Canvas
        flat
        shadows="percentage"
        frameloop="never"
        dpr={job.multiplier}
        resize={{ offsetSize: true }}
        gl={{ preserveDrawingBuffer: true }}
      >
        <ExportCamera view={job.view} />
        <SceneContents {...scene} />
        <ExportRunner job={job} overlay={overlay} labels={scene.style.labels} onDone={onDone} />
      </Canvas>
    </div>
  );
}
