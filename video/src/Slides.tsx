import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CELL, MONO, T, gridBackground } from "./theme";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

/** Fades and lifts its children in, starting `at` seconds into the scene. */
const Reveal: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(frame, [at * fps, (at + 0.7) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }),
        translate: interpolate(frame, [at * fps, (at + 0.7) * fps], ["0px 24px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        }),
      }}
    >
      {children}
    </div>
  );
};

const Logo: React.FC<{ size?: number }> = ({ size = 1 }) => (
  <div
    style={{
      background: T.blue,
      color: T.white,
      fontFamily: MONO,
      fontWeight: 600,
      fontSize: 34 * size,
      lineHeight: 1.15,
      padding: `${18 * size}px ${26 * size}px`,
      letterSpacing: 1,
      display: "inline-block",
    }}
  >
    MASSING
    <br />
    STUDIO
  </div>
);

const Window: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: T.white, border: `2px solid ${T.stroke}`, ...style }}>{children}</div>
);

const Label: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = T.blue }) => (
  <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color, letterSpacing: 2, textTransform: "uppercase" }}>{children}</div>
);

export const TitleSlide: React.FC<{ members: string[] }> = ({ members }) => (
  <AbsoluteFill style={{ ...gridBackground, fontFamily: MONO }}>
    <Reveal at={0.1} style={{ position: "absolute", left: CELL * 3, top: CELL * 3 }}>
      <Logo size={2.2} />
    </Reveal>
    <Reveal at={0.6} style={{ position: "absolute", left: CELL * 3, top: CELL * 9, width: CELL * 30 }}>
      <div style={{ fontSize: 56, color: T.ink, lineHeight: 1.25 }}>
        From a plot address to
        <br />
        <span style={{ color: T.blue }}>explained massing directions</span>
      </div>
    </Reveal>
    <Reveal at={1.2} style={{ position: "absolute", left: CELL * 3, top: CELL * 15 }}>
      <Window style={{ padding: "28px 36px", display: "flex", flexDirection: "column", gap: 10 }}>
        {members.map((m) => (
          <div key={m} style={{ fontSize: 34, color: T.ink }}>
            {m}
          </div>
        ))}
      </Window>
    </Reveal>
    <Reveal at={1.6} style={{ position: "absolute", right: CELL * 3, bottom: CELL * 2, textAlign: "right" }}>
      <div style={{ fontSize: 26, color: T.black }}>IDEM307 Generative AI and Design · TU Delft</div>
    </Reveal>
  </AbsoluteFill>
);

const Point: React.FC<{ at: number; tag: string; children: React.ReactNode }> = ({ at, tag, children }) => (
  <Reveal at={at}>
    <Window style={{ display: "flex", alignItems: "stretch" }}>
      <div
        style={{
          width: CELL * 7,
          background: T.blue,
          color: T.white,
          fontSize: 28,
          fontWeight: 600,
          padding: "26px 28px",
          letterSpacing: 2,
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {tag}
      </div>
      <div style={{ padding: "22px 32px", fontSize: 38, color: T.ink, lineHeight: 1.35 }}>{children}</div>
    </Window>
  </Reveal>
);

/** Motivation: activity, difficulty, goal. `at` times are seconds into the voiceover. */
export const MotivationSlide: React.FC<{ beats: [number, number, number] }> = ({ beats }) => (
  <AbsoluteFill style={{ ...gridBackground, fontFamily: MONO }}>
    <Reveal at={0} style={{ position: "absolute", left: CELL * 3, top: CELL * 2 }}>
      <Label>Motivation and goal</Label>
    </Reveal>
    <div style={{ position: "absolute", left: CELL * 3, top: CELL * 4, width: CELL * 34, display: "flex", flexDirection: "column", gap: CELL }}>
      <Point at={beats[0]} tag="Activity">
        Early massing: <b>what can this plot hold?</b>
      </Point>
      <Point at={beats[1]} tag="Difficulty">
        Cadastre, 3D city data and zoning plans are scattered. Sketching by hand is slow, and the rules behind each sketch stay hidden.
      </Point>
      <Point at={beats[2]} tag="Goal">
        From one address: the plot, its rules with sources, and massing directions to <b>inspect, adjust and export</b>.
      </Point>
    </div>
  </AbsoluteFill>
);

const Item: React.FC<{ at: number; color: string; children: React.ReactNode }> = ({ at, color, children }) => (
  <Reveal at={at} style={{ display: "flex", gap: 18, alignItems: "baseline" }}>
    <div style={{ width: 16, height: 16, background: color, flexShrink: 0, translate: "0px -4px" }} />
    <div style={{ fontSize: 33, color: T.ink, lineHeight: 1.35 }}>{children}</div>
  </Reveal>
);

/** Reflection: strengths and limitations side by side; `at` = when the limitations start. */
export const ReflectionSlide: React.FC<{ limitsAt: number; nextAt: number }> = ({ limitsAt, nextAt }) => (
  <AbsoluteFill style={{ ...gridBackground, fontFamily: MONO }}>
    <Reveal at={0} style={{ position: "absolute", left: CELL * 3, top: CELL * 2 }}>
      <Label>Reflection</Label>
    </Reveal>
    <div style={{ position: "absolute", left: CELL * 3, top: CELL * 4, display: "flex", gap: CELL }}>
      <Reveal at={0.3}>
        <Window style={{ width: CELL * 16, padding: 36, display: "flex", flexDirection: "column", gap: 26, minHeight: CELL * 13 }}>
          <Label>Strengths</Label>
          <Item at={0.8} color={T.blue}>Address to explained options within minutes</Item>
          <Item at={4.3} color={T.blue}>Every number computed by code</Item>
          <Item at={6.2} color={T.blue}>Every rule traced to a source</Item>
        </Window>
      </Reveal>
      <Reveal at={limitsAt - 0.4}>
        <Window style={{ width: CELL * 18, padding: 36, display: "flex", flexDirection: "column", gap: 26, minHeight: CELL * 13 }}>
          <Label color={T.black}>Limitations</Label>
          <Item at={limitsAt + 0.4} color={T.black}>Zoning only partly read from the plan; gaps are suggestions</Item>
          <Item at={limitsAt + 7.8} color={T.black}>Housing only: a mixed-use plan shows as a rule not met</Item>
          <Item at={limitsAt + 14} color={T.black}>Parcel geometry indicative; no permit check</Item>
          <Item at={nextAt} color={T.blue}>Next: fuller zoning data, more building types</Item>
        </Window>
      </Reveal>
    </div>
  </AbsoluteFill>
);
