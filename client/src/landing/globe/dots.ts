import type { View } from "./geo";
import type { CountryIndex } from "./countryIndex";
import { forEachDot, forEachDotRaw, type LatticeSpec } from "./lattice";
import { basisFor, batcher, visibleAngle } from "./pieces";

const RAD = Math.PI / 180;
/** First-time country lookups per frame (~2 µs each); the rest wait for the next frame. */
/** More dots than this in one colour are drawn as squares. */
const SQUARE_ABOVE = 12000;
const LOOKUPS_PER_FRAME = 1500;

export type DotStyle = {
  lattice: LatticeSpec;
  /** On-screen spacing of the dots at the start of each level (px); it grows to 2× until the next level fades in. */
  spacingPx: number;
  /** Dot radius on screen where the surface faces the viewer (px). */
  radiusPx: number;
  /** Finest lattice level. */
  maxLevel: number;
  colour: string;
  selectedColour: string;
};

const smoothstep = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** Continuous zoom level: 0 where the level-0 lattice is `spacingPx` apart on screen, +1 per doubling of scale. */
export function zoomLevel(view: View, style: DotStyle): number {
  return Math.max(0, Math.log2((view.scale * style.lattice.baseDeg * RAD) / style.spacingPx));
}

/** Lattice level a frame at zoom level `ell` draws (k, or k + 1 once the finer dots start to fade in) and the fade of its new dots. */
function drawLevel(ell: number, style: DotStyle): { k: number; level: number; fade: number } {
  const k = Math.min(style.maxLevel, Math.floor(ell));
  // dots new at level k + 1 (4× as many) fade in over the last 40 % of each level, so that the costly fine level is
  // only drawn for a short part of each doubling; spacing stays between 1× and about 1.5× the nominal one
  const fade = k < style.maxLevel ? smoothstep((ell - k - 0.5) / 0.4) : 0;
  return { k, level: fade > 0.01 ? k + 1 : k, fade };
}

export type DrawOptions = {
  /** Opacity of the dots of every country but the selected one (they give way to a fill). */
  otherAlpha?: number;
  /** How blue the selected country's dots are, 0–1. */
  blue?: number;
  /** Selected city: dots of the selected country inside it are always blue. */
  inside?: (lon: number, lat: number) => boolean;
  /** Opacity of the selected country's dots outside the selected city (they give way to a fill). */
  outsideAlpha?: number;
  /** Share of the dots shown, 0–1: a fixed random subset that grows (the dots pop in after load). */
  reveal?: number;
  /** Opacity of all dots (they fade out when the map details take over). */
  alpha?: number;
};

/**
 * Land dots fixed to the sphere. Each lattice point is looked up once (whole dots: in or out by
 * its centre) and cached with its country. A dot is drawn as the orthographic image of a small
 * disc on the surface: an ellipse squashed by cos θ towards the limb.
 */
export class DotLayer {
  private cache = new Map<number, number>();
  private override: { box: { s: number; w: number; n: number; e: number }; fn: (lon: number, lat: number, country: number) => number } | null = null;
  private overrideCache = new Map<number, number>();
  private lattice: LatticeSpec | null = null;
  /** Dots drawn in the last frame. */
  drawn = 0;
  /** True when the last frame left lattice points unlooked-up (draw again to complete it). */
  pending = false;

  constructor(private index: CountryIndex) {}

  /**
   * Looks up (and caches) every dot a frame at `view` can ask for, yielding every `chunk` lookups so
   * the caller can spread the work over several slices. Used before a flight, so the zoom does not
   * pop dots in.
   */
  *warm(view: View, style: DotStyle, chunk = 1500): Generator<void> {
    this.useLattice(style);
    const level = drawLevel(zoomLevel(view, style), style).level;
    let n = 0;
    const radius = visibleAngle(view) / RAD;
    const dots: { key: number; lon: number; lat: number }[] = [];
    // collect first (cheap), then look up what is missing
    forEachDot(style.lattice, level, view.centre, radius, (d) => {
      if (!this.cache.has(d.key) || this.missingOverride(d.key, d.lon, d.lat)) dots.push(d);
    });
    yield;
    for (const d of dots) {
      const known = this.cache.get(d.key);
      const base = known ?? this.index.lookup(d.lon, d.lat);
      if (known === undefined) this.cache.set(d.key, base);
      this.overridden(d.key, d.lon, d.lat, base);
      if (++n % chunk === 0) yield;
    }
  }

  /** Inside `box` the lookup's answer goes through `fn` (land/water from the city's map tiles); results are cached per dot. */
  setOverride(box: { s: number; w: number; n: number; e: number }, fn: (lon: number, lat: number, country: number) => number) {
    this.override = { box, fn };
    this.overrideCache.clear();
  }

  clearOverride() {
    this.override = null;
    this.overrideCache.clear();
  }

  private missingOverride(key: number, lon: number, lat: number) {
    const o = this.override;
    return !!o && lon >= o.box.w && lon <= o.box.e && lat >= o.box.s && lat <= o.box.n && !this.overrideCache.has(key);
  }

  private overridden(key: number, lon: number, lat: number, country: number): number {
    const o = this.override;
    if (!o || lon < o.box.w || lon > o.box.e || lat < o.box.s || lat > o.box.n) return country;
    let c = this.overrideCache.get(key);
    if (c === undefined) {
      c = o.fn(lon, lat, country);
      this.overrideCache.set(key, c);
    }
    return c;
  }

  /** Drops the cache when the lattice changed (its points are different ones). */
  private useLattice(style: DotStyle) {
    if (style.lattice.mode !== this.lattice?.mode || style.lattice.baseDeg !== this.lattice.baseDeg) {
      this.cache.clear();
      this.lattice = style.lattice;
    }
  }

  /** Index of a country id in the lookup (−1 if unknown). */
  countryNumber(id: string) {
    return this.index.ids.indexOf(id);
  }

  draw(ctx: CanvasRenderingContext2D, view: View, style: DotStyle, selected: number, o: DrawOptions = {}) {
    const { otherAlpha = 1, blue = 1, inside, alpha = 1, outsideAlpha = 1, reveal = 1 } = o;
    this.useLattice(style);
    const ell = zoomLevel(view, style);
    const { k, level, fade } = drawLevel(ell, style);

    const b = basisFor(view);
    const { cx, cy, s, c, e, n } = b;
    const { clip } = view;
    const r = style.radiusPx;
    // [x, y, radial radius, angle] per dot, in six groups: other land / selected country / inside the
    // selected city, each settled and fading in (the finer level)
    const groups: number[][] = [[], [], [], [], [], []];
    let lookups = 0;
    this.pending = false;
    forEachDotRaw(style.lattice, level, view.centre, b.visible / RAD, (lon, lat, key, dotLevel, cp, sp) => {
      let country = this.cache.get(key);
      if (country === undefined) {
        // over budget: leave the dot for a later frame
        if (++lookups > LOOKUPS_PER_FRAME) {
          this.pending = true;
          return;
        }
        country = this.index.lookup(lon, lat);
        this.cache.set(key, country);
      }
      country = this.overridden(key, lon, lat, country);
      if (country < 0) return;
      if (reveal < 1 && ((key % 1e9) * 0.6180339887) % 1 >= reveal) return;
      const l = lon * RAD;
      const x = cp * Math.cos(l);
      const y = cp * Math.sin(l);
      const z = sp;
      const cos = c[0] * x + c[1] * y + c[2] * z;
      if (cos <= 0) return;
      const ex = e[0] * x + e[1] * y + e[2] * z;
      const ny = n[0] * x + n[1] * y + n[2] * z;
      const sx = cx + s * ex;
      const sy = cy - s * ny;
      if (sx < clip.x - r || sx > clip.x + clip.w + r || sy < clip.y - r || sy > clip.y + clip.h + r) return;
      const g = (country === selected ? (inside?.(lon, lat) ? 4 : 2) : 0) + (dotLevel > k ? 1 : 0);
      groups[g]!.push(sx, sy, r * cos, Math.atan2(-ny, ex));
    });

    const alphas = [otherAlpha, fade * otherAlpha, outsideAlpha, fade * outsideAlpha, 1, fade].map((a) => a * alpha);
    this.drawn = 0;
    const paint = (dots: number[], colour: string, alpha: number) => {
      if (alpha <= 0) return;
      ctx.fillStyle = colour;
      ctx.globalAlpha = alpha;
      const batch = batcher(ctx, () => ctx.fill(), 64);
      // many dots (a zoomed-in view is full of them): squares of the dot's size, 2× cheaper than circles and
      // indistinguishable at a diameter of 1.5 px
      const square = dots.length > 4 * SQUARE_ABOVE;
      for (let i = 0; i < dots.length; i += 4) {
        const [x, y, rr, a] = [dots[i]!, dots[i + 1]!, dots[i + 2]!, dots[i + 3]!];
        // a squash under 10 % is invisible at this size, and arcs are ~3× cheaper than ellipses
        if (square && rr > 0.9 * r) {
          ctx.rect(x - r, y - r, 2 * r, 2 * r);
        } else if (rr > 0.9 * r) {
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, 2 * Math.PI);
        } else {
          ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
          ctx.ellipse(x, y, rr, r, a, 0, 2 * Math.PI);
        }
        batch.next();
      }
      batch.end();
    };
    groups.forEach((dots, g) => {
      if (!dots.length) return;
      if (g < 2) paint(dots, style.colour, alphas[g]!);
      else if (g >= 4) paint(dots, style.selectedColour, alphas[g]!); // the city is blue as long as it is selected
      else {
        // the selected country turns from the dot colour to blue
        if (blue < 1) paint(dots, style.colour, alphas[g]!);
        paint(dots, style.selectedColour, alphas[g]! * blue);
      }
      this.drawn += dots.length / 4;
    });
    ctx.globalAlpha = 1;
  }
}
