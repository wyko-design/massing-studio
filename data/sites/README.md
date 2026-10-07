# Site fixtures

One JSON file per site: `data/sites/<SITE_ID>.json`. The server loads the file named by `SITE_ID` in `.env` and uses it only when the loaded parcel's id equals `parcelId`. Any other address gets constraints that are all **unknown**.

Start from [`_template.json`](_template.json). [`placeholder.json`](placeholder.json) is the stand-in used until the group collects the real rules (SPEC §5, milestone M7). The schema is `SiteFixtureSchema` in `shared/src/schemas/siteFixture.ts`, and a test validates every file in this folder against it.

## Top level

| Field | Meaning |
|---|---|
| `id` | Site id. Same as the file name and `SITE_ID`. |
| `address` | Human address, for reports. |
| `parcelId` | Kadaster parcel id exactly as the app shows it (`<gemeente code> <sectie> <perceelnummer>`, e.g. `DEL00 K 2410`). |
| `excerpts` | Raw omgevingsplan text: `{ title, text, url }`. Paste the Dutch text exactly. The constraint interpreter (M4) reads these and cites them. |
| `constraints` | The rules, see below. |

## Constraints

Every rule is `{ value, unit?, prov }`, with `prov = { source, quote?, status }`.

- `value: null` means **unknown**. The app never fills in a default. Leave a value `null` rather than guessing.
- `source`: URL or document name.
- `quote`: the exact rule text the value came from (Dutch, verbatim).
- `status`:
  - `verified`: checked by hand by the group.
  - `extracted`: filled by the AI constraint interpreter from `excerpts`, with a quote. Check it.
  - `assumed`: a plausible guess. While any rule is `assumed`, the app shows **PLACEHOLDER DATA** and exports get a watermark.
  - `user_override`: set in the app's Constraints screen. Never written to this file.
- If the plan has no such rule, write `value: null` with `status: "verified"` and say so in `source`. That is "not regulated", which is different from "not looked up yet" (`assumed`).

| Field | Dutch term | Unit | Notes |
|---|---|---|---|
| `allowedFunctions` | *bestemming* (designated use), e.g. `["Wonen"]` | list | |
| `bouwvlak` | *bouwvlak* (buildable area drawn on the plan map) | GeoJSON Polygon | **RD New (EPSG:28992) metres**, traced by hand. Replaces the setbacks when present. Clipped to the parcel. |
| `maxHeight` | *bouwhoogte* / *maximale bouwhoogte* | m | Often in the *maatvoering* on the map. |
| `maxGutterHeight` | *goothoogte* (gutter / eaves height) | m | Only if the plan distinguishes it. |
| `buildingLine` | *gevellijn* / *bouwgrens* | GeoJSON LineString | RD New metres. Shown, not used by the generator yet. |
| `setbacks.street` / `.side` / `.rear` | distance to the front / side / rear *perceelsgrens* | m | Used only when no bouwvlak is given, and only when all three are known. |
| `streetSide` | — | ° | Compass bearing (0 = north, clockwise) from the parcel towards the street. Tells the app which parcel edges are front, side and rear. Not needed when all three setbacks are equal. |
| `maxCoverage` | *bebouwingspercentage* | 0–1 | 60 % is `0.6`. |
| `maxFAR` | floor area ratio (*FSI*) | ratio | Rare in Dutch plans. |
| `parkingNorm` | *parkeernorm* | spaces/unit | From Delft's parking policy, not the omgevingsplan. |
| `notes` | | list of text rules | Rules the generator cannot use but the user must see: an *aanduiding* (special designation with extra rules), *afwijken* (permitted deviation), monument status, etc. |

Other terms you will meet: *maatvoering* (dimension labels on the plan map, e.g. "maximale bouwhoogte (m): 10"), *aanduiding* (special designation with its own rules), *afwijken* (permitted deviation from a rule, usually by permit).

## Buildable envelope

The app derives the envelope footprint in this order (SPEC §5):

1. `bouwvlak`, clipped to the parcel;
2. the parcel shrunk per edge by `setbacks` (edges classified by `streetSide`);
3. the parcel itself, flagged `assumed`.

Its height is `maxHeight` (unknown stays unknown).
