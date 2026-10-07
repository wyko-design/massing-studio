import {
  centroid,
  constraintsToLocal,
  rdToWgs84,
  toLocal,
  type ContextProvider,
  type Geocoder,
  type ParcelProvider,
  type SiteScene,
  type ZoningProvider,
  unknownConstraints,
} from "@massing/shared";

export const CONTEXT_RADIUS_M = 250;

export const SOURCES = [
  "PDOK Locatieserver",
  "PDOK Kadastrale Kaart (indicative parcel boundary)",
  "3DBAG (TU Delft / 3DGI), LoD1.2 roof heights",
];

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

  return {
    origin: { lat, lon },
    parcel: { ...parcel, ring: toLocal(parcel.ring, origin) },
    context: buildings.map((b) => ({ ...b, ring: toLocal(b.ring, origin) })),
    zoning: zoning
      ? { fixtureId: zoning.fixtureId, constraints: constraintsToLocal(zoning.constraints, origin) }
      : { fixtureId: null, constraints: unknownConstraints(`No site fixture for parcel ${parcel.id}`) },
    meta: {
      address: hit.label,
      sources: zoning ? [...SOURCES, `Site fixture data/sites/${zoning.fixtureId}.json`] : SOURCES,
      contextCount: buildings.length,
      skippedContext: providers.skippedContext(),
    },
  };
}
