import type { SiteConstraints } from "./schemas/constraints";
import type { ContextBuilding, Parcel } from "./schemas/site";

/** RD New (EPSG:28992) coordinate in metres. */
export type RdPoint = { x: number; y: number };

export type GeocodeResult = { label: string; point: RdPoint; addressId?: string; /** Municipality name, e.g. "Delft" (used to find local policy). */ municipality?: string };

export interface Geocoder {
  geocode(query: string): Promise<GeocodeResult | null>;
}

/** Rings are returned in RD metres; the caller shifts them to the local origin. */
export interface ParcelProvider {
  parcelAt(point: RdPoint): Promise<Parcel | null>;
}

export interface ContextProvider {
  buildingsNear(point: RdPoint, radiusM: number): Promise<ContextBuilding[]>;
}

/** Constraints for a parcel, geometry in RD metres. `fixtureId` names the data set they came from. */
export type ZoningResult = {
  fixtureId: string;
  constraints: SiteConstraints;
  /** Human-readable source for the UI and the scene's source list; defaults to the fixture file. */
  label?: string;
  /** Plan articles the values came from, when the source has text the AI can read. */
  textRefs?: { title: string; url: string }[];
};

export interface ZoningProvider {
  /** Null when the provider has no rules for this parcel. */
  constraintsFor(parcel: Parcel): Promise<ZoningResult | null>;
}

export type CodeRule = { id: string; article: string; text: string };

export interface CodeRules {
  rules(): CodeRule[];
}
