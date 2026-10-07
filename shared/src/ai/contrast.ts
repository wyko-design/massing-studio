import type { MassingMetrics, MassingParams } from "../schemas/massing";
import { fmtM, fmtM2 } from "../massing/format";

type Labelled<T> = { id: string; value: T };

/** Limits below which two options read as the same direction. */
export const CONTRAST = { floors: 1, coverage: 0.1, depth: 2, area: 0.05, height: 1 } as const;

function pairs<T>(items: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) out.push([items[i]!, items[j]!]);
  return out;
}

/**
 * Pairs of requested params that are near-identical: same typology and alignment, and floors,
 * coverage and depth all within the CONTRAST limits.
 */
export function contrastIssues(options: Labelled<MassingParams>[]): string[] {
  return pairs(options)
    .filter(([a, b]) => {
      const p = a.value;
      const q = b.value;
      return (
        p.typology === q.typology &&
        p.alignment === q.alignment &&
        Math.abs(p.floors - q.floors) <= CONTRAST.floors &&
        Math.abs(p.coverageTarget - q.coverageTarget) <= CONTRAST.coverage + 1e-9 &&
        Math.abs(p.depth - q.depth) <= CONTRAST.depth + 1e-9
      );
    })
    .map(
      ([a, b]) =>
        `Options ${a.id} and ${b.id} are near-identical (both ${a.value.typology}, ${a.value.alignment}-aligned, ` +
        `${a.value.floors} vs ${b.value.floors} floors, coverage ${a.value.coverageTarget} vs ${b.value.coverageTarget}, ` +
        `depth ${a.value.depth} vs ${b.value.depth} m). Make them differ in typology, alignment, height or coverage.`,
    );
}

const relClose = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1);

/** Pairs whose realised massing (after clamping) is almost the same: footprint, GFA and height all close. */
export function realisedIssues(results: Labelled<MassingMetrics>[]): string[] {
  return pairs(results)
    .filter(
      ([a, b]) =>
        relClose(a.value.footprint, b.value.footprint, CONTRAST.area) &&
        relClose(a.value.gfa, b.value.gfa, CONTRAST.area) &&
        Math.abs(a.value.height - b.value.height) <= CONTRAST.height,
    )
    .map(
      ([a, b]) =>
        `Options ${a.id} and ${b.id} realise almost the same massing after clamping: footprint ${fmtM2(a.value.footprint)} vs ${fmtM2(b.value.footprint)}, ` +
        `GFA ${fmtM2(a.value.gfa)} vs ${fmtM2(b.value.gfa)}, height ${fmtM(a.value.height)} vs ${fmtM(b.value.height)}.`,
    );
}
