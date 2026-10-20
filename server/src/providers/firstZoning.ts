import type { Parcel, ZoningProvider, ZoningResult } from "@massing/shared";

/**
 * Asks each provider in order and returns the first answer. Hand-checked fixtures go first, live sources after.
 * A live source that fails (offline, service changed, cache miss) counts as "no answer" so the scene still loads.
 */
export class FirstZoningProvider implements ZoningProvider {
  constructor(
    private readonly providers: ZoningProvider[],
    private readonly onError: (e: unknown) => void = (e) => console.warn("Zoning provider failed:", e instanceof Error ? e.message : e),
  ) {}

  async constraintsFor(parcel: Parcel): Promise<ZoningResult | null> {
    for (const p of this.providers) {
      try {
        const r = await p.constraintsFor(parcel);
        if (r) return r;
      } catch (e) {
        this.onError(e);
      }
    }
    return null;
  }
}
