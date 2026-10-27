import {
  centroid,
  edgeRoles,
  fmtM,
  fmtM2,
  openRing,
  statusLabel,
  toCcw,
  type Envelope,
  type MassingResult,
  type Ring,
  type SiteScene,
} from "@massing/shared";
import { toWorld, type P3 } from "./camera";

/**
 * Annotations in the reference style: a dot on the model, a leader line, monospace text, and
 * optionally a black tag box. `anchors` are candidate points in world space; the one furthest
 * towards `pick` on screen is used, so the leader starts at a visible corner from any view.
 */
export type LeaderLabel = {
  kind: "leader";
  anchors: P3[];
  pick: "top" | "bottom" | "left" | "right";
  lines: string[];
  /** First line in a black tag box. */
  tag: boolean;
};
/** Street name written along the street, centred on `anchor`, rotated towards `along`. */
export type StreetLabel = { kind: "street"; anchor: P3; along: P3; text: string };
export type Label = LeaderLabel | StreetLabel;

export type Overlay = {
  labels: Label[];
  /** Lines in the bottom-left corner of the frame. */
  caption: string[];
  /** Placeholder data watermark. */
  watermark: boolean;
  /** Corners of the proposal (base and top): street names slide along the street to keep clear of it. */
  obstacles: P3[];
};

/** Street labels sit this far (m) outside the street boundary. */
const STREET_OFFSET = 6;

/** Street name from a Dutch geocoder label: "Hendrik Casimirstraat 8, 2628KJ Delft" → "Hendrik Casimirstraat". */
export function streetName(address: string): string {
  const first = address.split(",")[0]!.trim();
  const m = /^(.+?)\s+\d+[a-zA-Z]?(?:[\s-]+[\w]+)?$/.exec(first);
  return (m ? m[1]! : first).trim();
}

/**
 * Street label outside the longest street edge of the parcel (edge roles from the street side
 * bearing). Null when the street side is unknown or no edge faces the street.
 */
export function streetLabel(parcelRing: Ring, streetSide: number | null, name: string): StreetLabel | null {
  if (streetSide === null || !name) return null;
  const ring = toCcw(openRing(parcelRing));
  const roles = edgeRoles(ring, streetSide);
  let best = -1;
  let bestLen = 0;
  roles.forEach((role, i) => {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (role === "street" && l > bestLen) [best, bestLen] = [i, l];
  });
  if (best < 0) return null;
  const a = ring[best]!;
  const b = ring[(best + 1) % ring.length]!;
  const [ux, uy] = [(b[0] - a[0]) / bestLen, (b[1] - a[1]) / bestLen];
  // right-hand normal = outside of a CCW ring
  const mid: [number, number] = [(a[0] + b[0]) / 2 + uy * STREET_OFFSET, (a[1] + b[1]) / 2 - ux * STREET_OFFSET];
  return { kind: "street", anchor: toWorld(mid), along: toWorld([mid[0] + ux * 10, mid[1] + uy * 10]), text: name };
}

export type LabelInput = {
  scene: SiteScene;
  envelope: Envelope | null;
  showEnvelope: boolean;
  result: MassingResult | null;
  optionId: string;
  /** The option's name: the preset's, or the strategy generator's words for the custom one. */
  optionName?: string;
  streetSide: number | null;
  annotations: boolean;
  streetLabels: boolean;
  placeholder: boolean;
};

/** Every number in a label is formatted from computed values here; nothing comes from model text. */
export function buildOverlay(input: LabelInput): Overlay {
  const { scene, envelope, result } = input;
  const labels: Label[] = [];

  if (input.streetLabels && scene.meta?.address) {
    const street = streetLabel(scene.parcel.ring, input.streetSide, streetName(scene.meta.address));
    if (street) labels.push(street);
  }

  if (input.annotations) {
    const tallest = result?.volumes.reduce<MassingResult["volumes"][number] | null>(
      (best, v) => (!best || v.zBase + v.height > best.zBase + best.height ? v : best),
      null,
    );
    if (result && tallest) {
      const top = tallest.zBase + tallest.height;
      const outer = openRing(tallest.footprint.coordinates[0]!);
      const anchors = outer.map((p) => toWorld(p, top));
      if (tallest.roof) anchors.push(toWorld(centroid(outer), top + tallest.roof.ridgeHeight));
      const m = result.metrics;
      labels.push({
        kind: "leader",
        anchors,
        pick: "top",
        tag: true,
        lines: [
          input.optionName ?? `Option ${input.optionId}`,
          `${m.floors} ${m.floors === 1 ? "floor" : "floors"} · ${fmtM(m.height)} · GFA ${fmtM2(m.gfa)}`,
        ],
      });
    }

    labels.push({
      kind: "leader",
      anchors: openRing(scene.parcel.ring).map((p) => toWorld(p)),
      pick: "bottom",
      tag: false,
      lines: [`Parcel ${scene.parcel.id} · ${fmtM2(scene.parcel.areaM2)}`, "indicative boundary"],
    });

    const envRing = envelope?.footprint.coordinates[0];
    if (envelope && input.showEnvelope && envRing && envelope.maxHeight !== null) {
      labels.push({
        kind: "leader",
        anchors: openRing(envRing).map((p) => toWorld(p, envelope.maxHeight!)),
        pick: "left",
        tag: false,
        lines: [`Envelope · max ${fmtM(envelope.maxHeight)}`, `${envelope.source}, ${statusLabel(envelope.prov)}`],
      });
    }
  }

  const caption = input.annotations
    ? [scene.meta?.address ?? `Parcel ${scene.parcel.id}`, "Indicative early study · not a permit check"]
    : [];
  const obstacles = (result?.volumes ?? []).flatMap((v) =>
    openRing(v.footprint.coordinates[0]!).flatMap((p) => [toWorld(p, v.zBase), toWorld(p, v.zBase + v.height + (v.roof?.ridgeHeight ?? 0))]),
  );
  return { labels, caption, watermark: input.placeholder, obstacles };
}
