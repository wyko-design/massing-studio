/** Hash routes: the landing screen is the default; the studio opens at #studio (Site screen) or #studio/directions. */
export const STUDIO_HASH = "#studio";
export const DIRECTIONS_HASH = "#studio/directions";

export const isStudioHash = (hash: string) => hash === STUDIO_HASH || hash === DIRECTIONS_HASH;
