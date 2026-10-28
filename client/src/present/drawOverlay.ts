import type { RenderStyle } from "../viewer/renderStyle";
import type { P3 } from "./camera";
import type { FrameSize } from "./frame";
import type { LeaderLabel, Overlay, StreetLabel } from "./labels";

/** World point → frame px (origin top-left). `visible` is false behind the camera or outside depth range. */
export type Project = (p: P3) => { x: number; y: number; visible: boolean };

type LabelStyle = RenderStyle["labels"];

const LEADER = 46;
const ELBOW = 64;
const MARGIN = 16;
const LINE_GAP = 1.35;
const DOT = 2.6;
const TAG_PAD_X = 6;
const TAG_PAD_Y = 4;

const font = (s: LabelStyle, size: number, weight = 400, italic = false) => `${italic ? "italic " : ""}${weight} ${size}px ${s.font}`;

function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: LabelStyle) {
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = s.haloColour;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = s.colour;
  ctx.fillText(text, x, y);
}

/** Pick the anchor furthest towards a screen direction, among the ones inside the frame. */
function pickAnchor(label: LeaderLabel, project: Project, frame: FrameSize) {
  let best: { x: number; y: number } | null = null;
  const score = (p: { x: number; y: number }) =>
    label.pick === "top" ? -p.y : label.pick === "bottom" ? p.y : label.pick === "left" ? -p.x : p.x;
  for (const a of label.anchors) {
    const p = project(a);
    if (!p.visible || p.x < 0 || p.y < 0 || p.x > frame.width || p.y > frame.height) continue;
    if (!best || score(p) > score(best)) best = p;
  }
  return best;
}

type Rect = { x: number; y: number; w: number; h: number };
const PAD = 4;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + PAD && b.x < a.x + a.w + PAD && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;
/** Leaders grow in these steps (px) until their text clears the labels placed before them. */
const STEP = 16;
const MAX_STEPS = 10;

/**
 * Leader from the picked anchor, text block at its end. The leader is lengthened step by step
 * until the block overlaps no label placed earlier (`placed`, which it then joins).
 */
function drawLeader(ctx: CanvasRenderingContext2D, label: LeaderLabel, project: Project, frame: FrameSize, s: LabelStyle, placed: Rect[]) {
  const a = pickAnchor(label, project, frame);
  if (!a) return;
  const size = s.fontSize;
  const lineH = size * LINE_GAP;
  ctx.font = font(s, size);
  const widths = label.lines.map((line, i) => ctx.measureText(line).width + (label.tag && i === 0 ? 2 * TAG_PAD_X : 0));
  const blockW = Math.max(...widths);
  const blockH = label.lines.length * lineH + (label.tag ? 2 * TAG_PAD_Y : 0);
  const vertical = label.pick === "top" || label.pick === "bottom";
  const sideSign = label.pick === "left" ? -1 : 1;

  const layout = (extra: number) => {
    const end = vertical
      ? { x: a.x, y: a.y + (label.pick === "bottom" ? LEADER + extra : -LEADER - extra) }
      : { x: a.x + sideSign * (ELBOW + extra / 2), y: a.y - LEADER * 0.6 - extra };
    let left = vertical ? end.x - blockW / 2 : label.pick === "left" ? end.x - blockW - 6 : end.x + 6;
    let top = vertical ? (label.pick === "bottom" ? end.y + 4 : end.y - blockH - 4) : end.y - blockH / 2;
    left = Math.min(Math.max(left, MARGIN), frame.width - MARGIN - blockW);
    top = Math.min(Math.max(top, MARGIN), frame.height - MARGIN - blockH);
    return { end, rect: { x: left, y: top, w: blockW, h: blockH } };
  };
  let chosen = layout(0);
  for (let k = 1; k <= MAX_STEPS && placed.some((r) => overlaps(r, chosen.rect)); k++) chosen = layout(k * STEP);
  const { end, rect } = chosen;
  placed.push(rect);

  ctx.strokeStyle = s.colour;
  ctx.fillStyle = s.colour;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  if (!vertical) ctx.lineTo(a.x, end.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(a.x, a.y, DOT, 0, 2 * Math.PI);
  ctx.fill();

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let y = rect.y;
  label.lines.forEach((line, i) => {
    const w = widths[i]!;
    const x = vertical ? rect.x + (blockW - w) / 2 : label.pick === "left" ? rect.x + blockW - w : rect.x;
    if (label.tag && i === 0) {
      const h = lineH + 2 * TAG_PAD_Y;
      ctx.fillStyle = s.tagBackground;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = s.tagColour;
      ctx.font = font(s, size, 600);
      ctx.fillText(line, x + TAG_PAD_X, y + h / 2);
      ctx.font = font(s, size);
      y += h;
    } else {
      haloText(ctx, line, x, y + lineH / 2, s);
      y += lineH;
    }
  });
}

/** Street names slide along the street in these steps (fractions of the 10 m `along` vector) to clear the proposal. */
const STREET_SHIFTS = [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, 3.2, -3.2];

function drawStreet(ctx: CanvasRenderingContext2D, label: StreetLabel, project: Project, frame: FrameSize, s: LabelStyle, placed: Rect[], obstacle: Rect | null) {
  const size = s.fontSize * 1.25;
  ctx.font = font(s, size, 400, true);
  const w = ctx.measureText(label.text).width;
  const d: P3 = [label.along[0] - label.anchor[0], label.along[1] - label.anchor[1], label.along[2] - label.anchor[2]];
  const at = (t: number): P3 => [label.anchor[0] + d[0] * t, label.anchor[1] + d[1] * t, label.anchor[2] + d[2] * t];

  const layout = (t: number) => {
    const p = project(at(t));
    const q = project(at(t + 1));
    if (!p.visible || !q.visible || p.x < 0 || p.y < 0 || p.x > frame.width || p.y > frame.height) return null;
    let angle = Math.atan2(q.y - p.y, q.x - p.x);
    if (Math.hypot(q.x - p.x, q.y - p.y) < 1) angle = 0; // looking along the street from above
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    // axis-aligned bounds of the rotated text
    const [c, sn] = [Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))];
    const [hw, hh] = [(c * w + sn * size) / 2, (sn * w + c * size) / 2];
    return { p, angle, rect: { x: p.x - hw, y: p.y - hh, w: 2 * hw, h: 2 * hh } };
  };
  let chosen = null;
  for (const t of STREET_SHIFTS) {
    const l = layout(t);
    if (!l) continue;
    chosen ??= l;
    if (!obstacle || !overlaps(l.rect, obstacle)) {
      chosen = l;
      break;
    }
  }
  if (!chosen) return;
  placed.push(chosen.rect);
  ctx.save();
  ctx.translate(chosen.p.x, chosen.p.y);
  ctx.rotate(chosen.angle);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  haloText(ctx, label.text, 0, 0, s);
  ctx.restore();
}

/** Screen bounds of a set of world points, or null when none is in front of the camera. */
function screenBounds(points: P3[], project: Project): Rect | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pt of points) {
    const p = project(pt);
    if (!p.visible) continue;
    [x0, y0, x1, y1] = [Math.min(x0, p.x), Math.min(y0, p.y), Math.max(x1, p.x), Math.max(y1, p.y)];
  }
  return x0 <= x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/**
 * Draws labels and caption in frame px, scaled by `scale` (device or export pixel ratio).
 * The same function draws the on-screen overlay and the export composite.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, overlay: Overlay, project: Project, frame: FrameSize, scale: number, s: LabelStyle) {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  // street names first: leader labels then keep clear of them
  const placed: Rect[] = [];
  const obstacle = screenBounds(overlay.obstacles, project);
  for (const label of overlay.labels) {
    if (label.kind === "street") drawStreet(ctx, label, project, frame, s, placed, obstacle);
  }
  for (const label of overlay.labels) {
    if (label.kind === "leader") drawLeader(ctx, label, project, frame, s, placed);
  }
  if (overlay.caption.length) {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    overlay.caption.forEach((line, i) => {
      ctx.font = font(s, i === 0 ? s.fontSize : s.fontSize * 0.85, i === 0 ? 600 : 400);
      haloText(ctx, line, MARGIN, frame.height - MARGIN - (overlay.caption.length - 1 - i) * s.fontSize * LINE_GAP, s);
    });
  }
  ctx.restore();
}

/** CSS font strings the overlay uses, for `document.fonts.load` before drawing an export. */
export const overlayFonts = (s: LabelStyle) => [font(s, s.fontSize), font(s, s.fontSize, 600), font(s, s.fontSize, 400, true)];
