/** Hash routes: the landing screen is the default; the studio opens at #studio (Directions) and its screens below it. */
export const STUDIO_HASH = "#studio";
export const RULES_HASH = "#studio/rules";
export const DIRECTIONS_HASH = "#studio/directions";
export const PRESENT_HASH = "#studio/present";

export type StudioScreen = "rules" | "directions" | "present";

export const SCREEN_HASH: Record<StudioScreen, string> = { rules: RULES_HASH, directions: DIRECTIONS_HASH, present: PRESENT_HASH };

export const isStudioHash = (hash: string) => hash === STUDIO_HASH || hash.startsWith(`${STUDIO_HASH}/`);

/** The studio screen of a hash; plain #studio (and anything unknown below it) is Directions. */
export const screenOfHash = (hash: string): StudioScreen => (hash === RULES_HASH ? "rules" : hash === PRESENT_HASH ? "present" : "directions");
