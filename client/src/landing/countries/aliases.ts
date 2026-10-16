/**
 * Informal names that i18n-iso-countries does not list (en/nl/pl), keyed by ISO alpha-2.
 * Endonyms of common neighbours are included because people type them.
 */
export const ALIASES: Record<string, string[]> = {
  NL: ["Holland", "Nederland", "The Netherlands", "Niderlandy"],
  GB: ["Britain", "Great Britain", "England", "Scotland", "Wales", "Northern Ireland", "U.K.", "Engeland", "Anglia"],
  US: ["America", "United States", "USA", "Amerika", "Ameryka", "Stany"],
  AE: ["UAE", "Emirates", "Emiraten"],
  CZ: ["Czech", "Česko", "Tsjechie"],
  CD: ["DRC", "DR Congo", "Congo-Kinshasa"],
  CG: ["Congo-Brazzaville"],
  MM: ["Burma"],
  SZ: ["Swaziland"],
  MK: ["Macedonia"],
  BA: ["Bosnia"],
  VA: ["Vatican"],
  KP: ["North Korea", "Noord-Korea"],
  DE: ["Deutschland"],
  ES: ["España", "Espana"],
  IT: ["Italia"],
  CH: ["Schweiz", "Suisse", "Svizzera"],
  AT: ["Österreich"],
  BE: ["Belgique", "België"],
  SE: ["Sverige"],
  NO: ["Norge"],
  DK: ["Danmark"],
  FI: ["Suomi"],
  PL: ["Polska"],
  PT: ["Portugal"],
  GR: ["Hellas", "Ellada"],
  HU: ["Magyarország"],
  HR: ["Hrvatska"],
  IE: ["Éire", "Eire"],
};

/** world-atlas features without an ISO numeric id → names to match (plus alpha-2 where one exists). */
export const UNCODED: Record<string, { alpha2: string | null; names: string[] }> = {
  Kosovo: { alpha2: "XK", names: ["Kosovo"] },
  "N. Cyprus": { alpha2: null, names: ["Northern Cyprus", "N. Cyprus", "Noord-Cyprus", "Cypr Północny"] },
  Somaliland: { alpha2: null, names: ["Somaliland"] },
  "Siachen Glacier": { alpha2: null, names: ["Siachen Glacier"] },
  "Indian Ocean Ter.": { alpha2: null, names: ["Indian Ocean Territories", "Indian Ocean Ter."] },
};

/**
 * Countries people most likely mean, most likely first (ISO alpha-2). Ambiguous prefixes ("u",
 * "ger", "unit") suggest the first one of these that matches.
 */
export const POPULAR = [
  "US", "GB", "DE", "FR", "ES", "IT", "NL", "PL", "CN", "IN", "JP", "BR", "CA", "AU", "RU", "MX", "TR", "SE", "NO", "DK",
  "FI", "PT", "GR", "CH", "AT", "BE", "IE", "CZ", "HU", "RO", "UA", "AR", "CL", "CO", "PE", "ZA", "EG", "MA", "NG", "KE",
  "AE", "SA", "IL", "KR", "TH", "VN", "ID", "PH", "SG", "NZ",
];
