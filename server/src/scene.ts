import {
  centroid,
  constraintsToLocal,
  rdToWgs84,
  toLocal,
  type Constrained,
  type ContextProvider,
  type Geocoder,
  type Parcel,
  type ParkingPolicy,
  type ParcelProvider,
  type SiteConstraints,
  type SiteScene,
  type ZoningProvider,
  unknownConstraints,
} from "@massing/shared";

import { pointInside } from "./providers/nl/ruimtelijkePlannen";

export const CONTEXT_RADIUS_M = 250;

export const SOURCES = [
  "PDOK Locatieserver",
  "PDOK Kadastrale Kaart (indicative parcel boundary)",
  "3DBAG (TU Delft / 3DGI), LoD1.2 roof heights",
];

/** Context that is optional: a failure here never stops the scene from loading. */
export type StreetSideFinder = (parcel: Parcel) => Promise<{ bearing: number; distanceM: number } | null>;
export type ParkingFinder = (ctx: { municipality: string; point: [number, number] }) => Promise<ParkingPolicy | null>;
export type RestrictionFinder = (point: [number, number]) => Promise<Constrained<string>[]>;

async function optional<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    console.warn(`${what} unavailable:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Adds what code can read from open data to the constraints (RD frame): the street side from the nearest BGT road, and restriction notes.
 * The street side replaces a missing or `assumed` value, never a verified, extracted or overridden one.
 */
export function enrichConstraints(
  c: SiteConstraints,
  street: { bearing: number; distanceM: number } | null,
  notes: Constrained<string>[],
): SiteConstraints {
  let out = c;
  const current = c.streetSide;
  if (street && (!current || current.value === null || current.prov.status === "assumed")) {
    out = {
      ...out,
      streetSide: {
        value: street.bearing,
        unit: "°",
        prov: {
          source: `Direction of the nearest carriageway in the BGT (PDOK), ${street.distanceM} m from the plot`,
          status: "extracted",
        },
      },
    };
  }
  return notes.length ? { ...out, notes: [...out.notes, ...notes] } : out;
}

/** A failure with a status the route can answer with. */
export class SceneError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 422,
  ) {
    super(message);
    this.name = "SceneError";
  }
}

export type SceneProviders = {
  geocoder: Geocoder;
  parcels: ParcelProvider;
  context: ContextProvider;
  zoning: ZoningProvider;
  /** Buildings dropped by the context provider in its last call. */
  skippedContext: () => number;
  /** Optional extras; without them the scene has no derived street side and no restriction notes. */
  streetSide?: StreetSideFinder;
  restrictions?: RestrictionFinder;
  /** Municipal parking policy (needs the municipality from the geocoder). */
  parking?: ParkingFinder;
};

/** Address → parcel → context, all shifted to a local origin at the parcel centroid (SPEC §4). */
export async function buildScene(providers: SceneProviders, query: string, radiusM = CONTEXT_RADIUS_M): Promise<SiteScene> {
  const hit = await providers.geocoder.geocode(query);
  if (!hit) throw new SceneError(`No address found for "${query}".`, 404);

  const parcel = await providers.parcels.parcelAt(hit.point);
  if (!parcel) throw new SceneError(`No cadastral parcel at ${hit.label}.`, 404);

  const origin = centroid(parcel.ring);
  const [lon, lat] = rdToWgs84(origin[0], origin[1]);
  const buildings = await providers.context.buildingsNear({ x: origin[0], y: origin[1] }, radiusM);
  const zoning = await providers.zoning.constraintsFor(parcel);

  // derived from open data, each optional: the street side from the nearest road, restrictions as notes
  const inside = pointInside(parcel.ring);
  const [street, restrictionNotes, parking] = await Promise.all([
    providers.streetSide ? optional("Street side", () => providers.streetSide!(parcel)) : null,
    providers.restrictions && inside ? optional("Restrictions", () => providers.restrictions!(inside)) : null,
    providers.parking && inside && hit.municipality ? optional("Parking policy", () => providers.parking!({ municipality: hit.municipality!, point: inside })) : null,
  ]);
  const rules: SiteConstraints = enrichConstraints(
    zoning?.constraints ?? unknownConstraints(`No site fixture and no readable plan data for parcel ${parcel.id}`),
    street,
    restrictionNotes ?? [],
  );

  return {
    origin: { lat, lon },
    parcel: { ...parcel, ring: toLocal(parcel.ring, origin) },
    context: buildings.map((b) => ({ ...b, ring: toLocal(b.ring, origin) })),
    zoning: zoning
      ? { fixtureId: zoning.fixtureId, ...(zoning.label ? { label: zoning.label } : {}), ...(zoning.textRefs?.length ? { textRefs: zoning.textRefs } : {}), constraints: constraintsToLocal(rules, origin) }
      : { fixtureId: null, constraints: rules },
    ...(parking ? { parking } : {}),
    meta: {
      address: hit.label,
      sources: [
        ...SOURCES,
        ...(zoning ? [zoning.label ?? `Site fixture data/sites/${zoning.fixtureId}.json`] : []),
        ...(street ? ["PDOK BGT roads (street side)"] : []),
        ...(parking ? [`Parking policy: ${parking.regulation.title} (${parking.regulation.id}, official register of local regulations)`] : []),
        ...(restrictionNotes?.length ? ["PDOK heritage, Wkpb and foundation-risk layers"] : []),
      ],
      contextCount: buildings.length,
      skippedContext: providers.skippedContext(),
    },
  };
}
