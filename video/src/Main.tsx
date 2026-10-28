import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Sequence, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { DemoSegment, segmentLen } from "./Demo";
import { EDIT, MEMBERS, PDF_PAGES, SLIDES } from "./edit";
import { MotivationSlide, ReflectionSlide, TitleSlide } from "./Slides";
import vo from "./voDurations.json";

const FPS = 30;
const f = (s: number) => Math.round(s * FPS);

/** Scene list with frame lengths, shared by the composition and its total duration. */
export const scenes = () => [
  { id: "title", len: f(vo.title + SLIDES.titleTail) },
  { id: "motivation", len: f(vo.motivation + SLIDES.slideTail) },
  ...EDIT.map((s) => ({ id: s.id, len: f(Math.max(segmentLen(s), (s.voAt ?? 0.3) + vo[s.vo as keyof typeof vo] + 0.4)) })),
  { id: "reflection", len: f(vo.reflection + SLIDES.endTail) },
];
export const totalFrames = () => scenes().reduce((a, s) => a + s.len, 0);

const Voice: React.FC<{ id: string; at?: number }> = ({ id, at = 0.3 }) => (
  <Sequence name={`VO ${id}`} from={f(at)} layout="none">
    <Audio src={staticFile(`vo/${id}.mp3`)} />
  </Sequence>
);

/** Short dip through the page colour at every cut, so scene changes read calmly. */
const CutFade: React.FC<{ len: number }> = ({ len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        background: "#F8F8F8",
        pointerEvents: "none",
        opacity: interpolate(frame, [0, 0.25 * fps, len - 0.25 * fps, len], [1, 0, 0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.quad),
        }),
      }}
    />
  );
};

export const Main: React.FC = () => {
  const list = scenes();
  const len = (id: string) => list.find((s) => s.id === id)!.len;
  return (
    <AbsoluteFill style={{ background: "#F8F8F8" }}>
      <Series>
        <Series.Sequence name="Title" durationInFrames={len("title")}>
          <TitleSlide members={MEMBERS} />
          <Voice id="title" at={0.5} />
        </Series.Sequence>
        <Series.Sequence name="Motivation" durationInFrames={len("motivation")}>
          <MotivationSlide beats={SLIDES.motivationBeats} />
          <Voice id="motivation" />
          <CutFade len={len("motivation")} />
        </Series.Sequence>
        {EDIT.map((seg, i) => (
          <Series.Sequence key={seg.id} name={`Demo ${seg.id}`} durationInFrames={len(seg.id)}>
            <DemoSegment seg={seg} n={i + 1} pdfPages={PDF_PAGES} frames={len(seg.id)} />
            <Voice id={seg.vo} at={seg.voAt} />
          </Series.Sequence>
        ))}
        <Series.Sequence name="Reflection" durationInFrames={len("reflection")}>
          <ReflectionSlide limitsAt={SLIDES.reflectionLimitsAt} nextAt={SLIDES.reflectionNextAt} />
          <Voice id="reflection" />
          <CutFade len={len("reflection") + 60} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
