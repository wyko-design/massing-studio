import type { FormEvent } from "react";
import { useSiteStore } from "../state/siteStore";
import { panel } from "./panel";

/** Screen 1: address search and parcel facts (SPEC §9). */
export function SiteScreen() {
  const { scene, error, loading, address, setAddress, load } = useSiteStore();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (address.trim()) void load(address.trim());
  };

  return (
    <>
      <form onSubmit={submit} style={{ ...panel, left: 12, top: 48, display: "flex", gap: 6 }}>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Address, e.g. Hendrik Casimirstraat 8, Delft"
          aria-label="Address"
          style={{ width: 320 }}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Loading…" : "Load"}
        </button>
      </form>
      {error && <div style={{ ...panel, left: 12, top: 84, color: "#b00020" }}>{error}</div>}
      {scene && (
        <div style={{ ...panel, left: 12, bottom: 12, lineHeight: 1.5 }}>
          <div>
            Parcel {scene.parcel.id} · {Math.round(scene.parcel.areaM2)} m² · indicative boundary
          </div>
          {scene.meta && (
            <>
              <div>
                {scene.meta.contextCount} context buildings
                {scene.meta.skippedContext > 0 && ` (${scene.meta.skippedContext} skipped: no height)`}
              </div>
              <div style={{ opacity: 0.7 }}>Sources: {scene.meta.sources.join(" · ")}</div>
            </>
          )}
        </div>
      )}
    </>
  );
}
