import React from "react";
import { Video } from "@remotion/media";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { MONO, T, gridBackground } from "./theme";

/** Camera key: at `at` seconds into the segment, centre footage point (x, y) (0–1) at zoom `s`. */
export type Key = { at: number; x: number; y: number; s: number };
/** A piece of a recording (public/demo.mp4 unless `src`), in footage seconds, optionally sped up. */
export type Clip = { from: number; to: number; rate?: number; src?: string };
export type Segment = {
  id: string;
  vo: string;
  voAt?: number;
  caption: string;
  clips: Clip[];
  keys: Key[];
  pdf?: boolean;
};

export const clipLen = (c: Clip) => (c.to - c.from) / (c.rate ?? 1);
export const segmentLen = (s: Segment) => s.clips.reduce((a, c) => a + clipLen(c), 0);

const ease = Easing.bezier(0.45, 0, 0.25, 1);
const W = 1920;
const H = 1080;

/** Interpolates the camera keys and returns a transform for a 1920×1080 layer. */
const useCamera = (keys: Key[]) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let k = keys[0];
  if (keys.length > 1) {
    const i = keys.findIndex((key) => key.at > t);
    if (i === -1) k = keys[keys.length - 1];
    else if (i > 0) {
      const a = keys[i - 1];
      const b = keys[i];
      const p = interpolate(t, [a.at, b.at], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
      k = { at: t, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, s: a.s + (b.s - a.s) * p };
    }
  }
  const tx = Math.min(0, Math.max(W - W * k.s, W / 2 - k.x * W * k.s));
  const ty = Math.min(0, Math.max(H - H * k.s, H / 2 - k.y * H * k.s));
  return { translate: `${tx}px ${ty}px`, scale: String(k.s), transformOrigin: "0 0" };
};

/** Plays the clips back to back; the last one runs on to fill the segment (frames = segment length). */
const Footage: React.FC<{ clips: Clip[]; keys: Key[]; frames: number }> = ({ clips, keys, frames }) => {
  const { fps } = useVideoConfig();
  const cam = useCamera(keys);
  let from = 0;
  return (
    <AbsoluteFill style={cam}>
      {clips.map((c, i) => {
        const len = i === clips.length - 1 ? frames - from : Math.round(clipLen(c) * fps);
        const start = from;
        from += len;
        return (
          <Sequence key={i} name={`Clip ${i + 1}`} from={start} durationInFrames={len} premountFor={fps}>
            <Video src={staticFile(c.src ?? "demo.mp4")} trimBefore={Math.round(c.from * fps)} playbackRate={c.rate ?? 1} muted style={{ width: W, height: H, objectFit: "cover" }} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** The exported PDF's pages (rendered from the real file), laid out on the app's grid. */
const PdfPages: React.FC<{ pages: number }> = ({ pages }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ ...gridBackground, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 40 }}>
      {Array.from({ length: pages }, (_, i) => (
        <Img
          key={i}
          src={staticFile(`pdf/page-${i + 1}.png`)}
          style={{
            height: 860,
            boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
            border: `1px solid ${T.stroke}`,
            opacity: interpolate(frame, [(0.3 + i * 0.9) * fps, (0.9 + i * 0.9) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            translate: interpolate(frame, [(0.3 + i * 0.9) * fps, (0.9 + i * 0.9) * fps], ["0px 40px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: ease,
            }),
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ n: number; text: string }> = ({ n, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: 48,
        display: "flex",
        fontFamily: MONO,
        fontSize: 34,
        boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
        opacity: interpolate(frame, [0.2 * fps, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        translate: interpolate(frame, [0.2 * fps, 0.7 * fps], ["0px 16px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }),
      }}
    >
      <div style={{ background: T.white, color: T.blue, fontWeight: 600, padding: "14px 20px", border: `2px solid ${T.blue}` }}>
        {String(n).padStart(2, "0")}
      </div>
      <div style={{ background: T.blue, color: T.white, padding: "14px 24px", border: `2px solid ${T.blue}` }}>{text}</div>
    </div>
  );
};

export const DemoSegment: React.FC<{ seg: Segment; n: number; pdfPages: number; frames: number }> = ({ seg, n, pdfPages, frames }) => (
  <AbsoluteFill style={{ background: T.background, overflow: "hidden" }}>
    {seg.pdf ? <PdfPages pages={pdfPages} /> : <Footage clips={seg.clips} keys={seg.keys} frames={frames} />}
    <Caption n={n} text={seg.caption} />
  </AbsoluteFill>
);
