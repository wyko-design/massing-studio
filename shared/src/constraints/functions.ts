/** Dutch plan designations (enkelbestemmingen) and their English equivalents, matched by keyword in this order. */
const FUNCTIONS: [RegExp, string][] = [
  [/wonen|woon/i, "Residential"],
  [/gemengd/i, "Mixed-use"],
  [/centrum/i, "Town centre"],
  [/kantoor/i, "Office"],
  [/detailhandel|winkel/i, "Retail"],
  [/horeca/i, "Hospitality"],
  [/dienstverlening/i, "Services"],
  [/maatschappelijk/i, "Social"],
  [/onderwijs/i, "Education"],
  [/gezondheidszorg/i, "Healthcare"],
  [/bedrijventerrein/i, "Business park"],
  [/bedrijf/i, "Industrial"],
  [/railverkeer/i, "Rail"],
  [/verkeer/i, "Traffic"],
  [/groen/i, "Green space"],
  [/tuin/i, "Garden"],
  [/water/i, "Water"],
  [/sport/i, "Sports"],
  [/recreatie/i, "Recreation"],
  [/cultuur/i, "Culture"],
  [/agrarisch/i, "Agricultural"],
  [/natuur/i, "Nature"],
  [/bos\b/i, "Forest"],
  [/leiding/i, "Pipeline"],
];

/** English name of a Dutch plan designation ("Wonen" → "Residential"). Anything not recognised, English included, is returned unchanged. */
export function translateFunction(name: string): string {
  const hit = FUNCTIONS.find(([re]) => re.test(name));
  return hit ? hit[1] : name;
}

/** The translated names without duplicates, in their order. */
export const translateFunctions = (names: readonly string[]): string[] => [...new Set(names.map(translateFunction))];

/** The uses offered in the allowed-functions list (the ones a building can have), in display order. */
export const FUNCTION_OPTIONS: readonly string[] = [
  "Residential",
  "Mixed-use",
  "Town centre",
  "Office",
  "Retail",
  "Hospitality",
  "Services",
  "Social",
  "Education",
  "Healthcare",
  "Business park",
  "Industrial",
  "Culture",
  "Sports",
  "Recreation",
];
