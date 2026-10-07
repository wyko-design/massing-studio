# Massing Studio — Prototype Spec

TU Delft · Generative AI Design course · group prototype
Hand this file to Claude Code as the source of truth. Build milestone by milestone (M0–M6 = milestones, not time units); do not start a milestone before the previous one runs. §14 is the prompt playbook for building it.

---

## 1. Product in one paragraph

The user enters an address. The tool retrieves the plot (parcel geometry, area, orientation), the surrounding buildings (3D, with heights) and the local planning constraints, translates those constraints into explicit design rules, and generates 2–3 contrasting, rule-compliant building massing options. Options are shown in a 3D viewer the user can orbit, pan and zoom but **not edit**; all changes come from adjusting inputs (programme, priorities, style, constraint overrides). The user can set up a presentation camera and basic render settings, then export a PNG and a PDF report in the visual language of the reference images (white context model, one saturated proposal volume, soft shadows, leader-line labels).

Design question it answers: *how can generative AI turn a plot address into inspectable, explained early massing directions without making opaque decisions for the architect?*

---

## 2. Scope

### In scope (prototype)
- Netherlands data, **Delft only**, **one site**. Until the group picks it, use parcel DEL00 K 2410 (from the board) as a stand-in; swapping sites is a fixture + address change, not a code change.
- Residential multi-unit programme (roughly 5–25 apartments) as the only building function.
- Live open data for geocoding, parcel geometry and context buildings.
- Zoning constraints from **curated per-site fixtures** (hand-collected from Regels op de kaart / omgevingsplan), with the source text stored so the AI can cite it.
- Deterministic parametric massing generator; AI decides *which* parameters, code decides *geometry and numbers*.
- Read-only 3D viewer, option comparison, presentation/export mode, PDF report.

### Out of scope (say so explicitly in the demo)
- Plot finding / alerts (scrapped).
- Live zoning retrieval from the DSO APIs (needs an API key from the Omgevingswet developer portal; treat as "future work").
- Any municipality other than Delft; any function other than residential.
- Direct 3D manipulation of the massing.
- Floor plans, unit layouts, structure, facades beyond colour/roof form.
- Claims of permit compliance or financial viability. Everything is "indicative".

### Architecture must stay jurisdiction-agnostic
Wrap every data source behind a provider interface (`Geocoder`, `ParcelProvider`, `ContextProvider`, `ZoningProvider`, `CodeRules`). NL/Delft is the first implementation. This keeps the "generalisable" claim cheap and honest.

---

## 3. Decisions to lock before coding

| Decision | Recommended default |
|---|---|
| Site | One site; stand-in DEL00 K 2410 with a placeholder fixture until real rules are collected |
| Programme | Residential, target unit count + average unit size as inputs |
| Typologies | Slab, L-block, courtyard/perimeter, tower-on-podium, stepped (start with 3) |
| Rendering | In-browser three.js, no AI image generation |
| LLM | Claude API, structured JSON output validated with zod |
| Stack | TypeScript end to end (see §6) |

---

## 4. Data pipeline (NL implementation)

All geometry is handled in **RD New (EPSG:28992), metres**, then shifted to a local origin at the parcel centroid before going into three.js (avoids float precision jitter).

| Need | Source | Notes |
|---|---|---|
| Address → coordinate | PDOK Locatieserver (free, no key) | Return RD coordinates + BAG address id |
| Parcel polygon, area, ID | PDOK Kadastrale Kaart OGC API Features, collection `perceel` (`https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1`) | No auth. Query by small bbox around the point, then point-in-polygon. Geometry is **indicative**, not legally measured: label it as such and allow a manual dimension/setback override (the board's fallback idea). |
| Surrounding buildings with heights | 3DBAG API (`https://api.3dbag.nl`), `collections/pand/items` with bbox | Returns CityJSONFeatures, paginated beyond 10 buildings. v1: extrude 2D footprint to a roof-height attribute (verify attribute names against the API docs). v2: parse LoD1.2/1.3 geometry. Blocky LoD1.x matches the reference aesthetic better than LoD2.2. |
| Roads / street names | BGT `wegdeel` via PDOK, or OSM Overpass | P1. Needed for the dark road surfaces and street labels in the references. |
| Sun position | `suncalc` (client-side) | Drives directional light and sunlight scoring |
| Zoning (omgevingsplan) | **Fixture JSON per site** | See §5. Collected manually from Regels op de kaart. |
| Building code (Bbl) | Small hard-coded rule set | Only rules that bite at massing level, each with an article reference. Most of Bbl is not massing-level; don't pretend otherwise. |

Cache every external response to disk (`/data/cache/<site>/…`) so the demo runs offline.

Claude Code: verify every endpoint and parameter against the provider's OpenAPI spec before writing the client; don't guess field names.

---

## 5. Constraint model

Every constraint is a value **plus provenance**. This is the core of the trust story.

```ts
type Provenance = {
  source: string;          // URL or document name
  quote?: string;          // exact rule text the value came from
  status: "verified" | "extracted" | "assumed" | "user_override";
};

type Constrained<T> = { value: T | null; unit?: string; prov: Provenance };

type SiteConstraints = {
  allowedFunctions: Constrained<string[]>; // from the plan's "bestemming", e.g. Wonen
  bouwvlak?: Constrained<GeoJSON.Polygon>; // drawn buildable area from the plan map (traced by hand for the prototype)
  maxHeight: Constrained<number>;          // m
  maxGutterHeight?: Constrained<number>;   // m, if plan distinguishes
  buildingLine?: Constrained<GeoJSON.LineString>;
  setbacks: { street: Constrained<number>; side: Constrained<number>; rear: Constrained<number> };
  maxCoverage?: Constrained<number>;       // 0–1
  maxFAR?: Constrained<number>;
  parkingNorm?: Constrained<number>;       // spaces per unit
  notes: Constrained<string>[];            // anything the generator can't use but the user must see
};
```

Site fixture (`/data/sites/<id>.json`): address, parcel id, the raw omgevingsplan excerpts (pasted text + URL), and any values the group has verified by hand. The AI constraint interpreter (§7) fills `extracted` values from the excerpts; hand-checked values are `verified`; anything missing becomes an explicit `null` and shows as an **unknown** in the UI, never a silent default.

Derived: **buildable envelope**. In Dutch plans the *bouwvlak* usually replaces setbacks, so the envelope footprint is resolved in this order:

1. `bouwvlak` polygon (clipped to the parcel), if present
2. parcel polygon offset inward per edge using `setbacks`, if setbacks are known
3. the parcel polygon itself, flagged `assumed`

```ts
type Envelope = {
  footprint: GeoJSON.Polygon;
  maxHeight: number;
  source: "bouwvlak" | "setbacks" | "parcel";
  prov: Provenance;
};
```

The massing generator takes an `Envelope` and must not know where it came from. Adding the real bouwvlak later changes no generator code. Render the envelope as a ghost wireframe volume in the viewer; it is the most legible single image of "what the rules allow".

**Placeholder fixture.** Development starts before real rules are collected. `/data/sites/placeholder.json` holds plausible values (e.g. use *Wonen*, max height 15 m, coverage 0.6, no bouwvlak) all with `status: "assumed"`. While any value is `assumed`, the UI shows an "assumed" badge on it and every export carries a visible "PLACEHOLDER DATA" watermark. Replacing the fixture with real values is a data task, not a code task.

Dutch terms the fixture will contain: *bestemming* (designated use), *bouwvlak* (buildable area), *bouwhoogte* (max building height), *goothoogte* (gutter/eaves height), *bebouwingspercentage* (max coverage), *maatvoering* (dimension labels on the plan map), *aanduiding* (special designation with extra rules), *afwijken* (permitted deviation).

---

## 6. Stack

- **Frontend:** Vite + React + TypeScript, `@react-three/fiber`, `@react-three/drei` (OrbitControls, OrthographicCamera, Edges, Text), `@react-three/postprocessing` + N8AO for ambient occlusion, zustand for state.
- **Geometry:** `@turf/turf`, `clipper-lib` or `polygon-clipping` for per-edge offsets and booleans, `proj4` for CRS.
- **Backend:** small Node server (Hono or Express) for LLM calls (keeps the API key off the client), data fetching, caching. Vite proxy in dev.
- **In-app LLM:** model name from env (`LLM_MODEL`), default `claude-sonnet-5-5` for speed; Opus only if output quality demands it.
- **Validation:** zod schemas shared between server and client; every LLM response is parsed against a schema or rejected.
- **Export:** offscreen render at target resolution → PNG; `pdf-lib` or `jsPDF` for the report.
- **Tests:** vitest for geometry and metrics (envelope, offsets, GFA, compliance checks).

---

## 7. AI responsibilities (and what AI must not do)

Rule: **numbers come from code; words and choices come from the model.** The LLM never outputs geometry or computed metrics.

| Agent / call | Input | Output (structured JSON) |
|---|---|---|
| Constraint interpreter | Omgevingsplan excerpts for the site | `SiteConstraints` fields with `quote` + `status:"extracted"`, plus `notes` for rules it can't map |
| Brief interpreter | Free-text brief ("starter apartments, lots of daylight, keep it low towards the canal") | Programme + priority weights + typology hints |
| Strategy generator | Constraints, envelope metrics, programme, priorities | 3 **contrasting** `MassingParams` sets, each with name, intent, trade-offs |
| Reviewer ("jury", optional, from the IDEAS board) | Each option's metrics + compliance | Short critiques from 3 perspectives: feasibility, viability, liveability/design quality |
| Report writer | All of the above, computed numbers injected | Narrative sections; must reference provided numbers only |

After the strategy generator returns, the deterministic generator realises each option, **clamps** anything that violates constraints, and records what was clamped. Clamps are shown to the user ("Option B asked for 7 floors; max height allows 6").

Sliders never call the LLM. Only "Generate directions", "Interpret brief" and "Write report" do.

---

## 8. Massing generator

Pure function, fast enough to run on every slider change (target < 50 ms):

```ts
generateMassing(envelope: Envelope, rules: SiteConstraints, p: MassingParams): MassingResult

type MassingParams = {
  typology: "slab" | "l_block" | "courtyard" | "tower_podium" | "stepped";
  floors: number;                 // clamped by maxHeight / floorHeight
  groundFloorHeight: number;      // m
  floorHeight: number;            // m
  depth: number;                  // m, building depth for slab/L/courtyard
  alignment: "street" | "sun";    // align to street edge or rotate toward south
  coverageTarget: number;         // 0–1, clamped
  stepDirection?: "north" | "south" | "street" | "rear";
  roof: "flat" | "pitched";
  colour: string;
};

type MassingResult = {
  volumes: Volume[];              // extruded polygons per height band
  metrics: { footprint; gfa; far; coverage; height; floors; estUnits; facadeSunScore };
  compliance: { rule: string; status: "pass" | "fail" | "unknown"; detail: string }[];
  clamps: string[];
};
```

- `estUnits = gfa × netToGross ÷ avgUnitSize`, with `netToGross` an editable assumption.
- `facadeSunScore` v1: facade area weighted by orientation (S > SE/SW > E/W > N). v2: sampled sun-hours via raycasting against context on equinox and solstice.
- Each typology is a template fitted into the buildable envelope polygon.

---

## 9. Screens

1. **Site** — address search, parcel confirmation on a 2D map, parcel facts (area, ID, orientation), "indicative boundary" badge, manual override.
2. **Constraints** — table of rules with value, source, quote, status badge (verified / extracted / assumed / unknown), editable override. Envelope shown in 3D.
3. **Directions** (main workspace) — left: inputs (programme, priorities, style, brief text, "Generate directions"). Centre: 3D viewer. Right: metrics, compliance, clamps, assumptions for the active option. Option tabs A/B/C + a side-by-side compare view with synced cameras.
4. **Present & export** — camera presets (4 axonometric corners, top, eye-level), saved custom camera, render settings, export PNG / PDF.

Viewer interaction: orbit, pan, zoom only. No selection, no gizmos.

---

## 10. Presentation rendering (reference look)

Target the attached references: white matte context, light grey ground, dark asphalt roads with dashed centrelines, one saturated proposal colour, crisp black outline on the proposal only, long soft shadows, strong ambient occlusion, black scale figures, leader-line labels in a monospace font with optional black tag boxes.

Settings exposed to the user:
- Projection: orthographic axonometric (default) / perspective
- Sun: date + time (suncalc), shadow softness
- AO on/off, outline weight, proposal colour, context style (white / grey / hatched)
- Toggles: street labels, annotations, envelope ghost, scale figures, trees
- Output: aspect ratio (4:5, 1:1, A3 landscape), resolution multiplier (1×/2×/4×)

**Export gotcha:** HTML/CSS2D labels are not part of the WebGL canvas and will be missing from `toDataURL`. Either render labels in-scene (drei `Text`) or project label anchors to screen space and draw them onto a 2D export canvas composited over the render.

Export: render at full target resolution into an offscreen renderer (don't screenshot the on-screen canvas).

---

## 11. PDF report contents

1. Cover: render + address + date + "indicative early study" disclaimer
2. Site: parcel ID, area, orientation, context summary, data sources
3. Constraints: table with values, sources, status; open questions / unknowns
4. Each option: render, intent, metrics, compliance, clamps, trade-offs, (jury critique)
5. Comparison table across options
6. Indicative finance (if built): land price, build cost/m², sellable area, residual — all inputs user-editable, labelled as assumptions
7. Assumptions & limitations

---

## 12. Milestones (each must be demoable)

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold + one site fixture | App runs; hard-coded parcel and extruded context render in viewer with the white-model look |
| M1 | Live site data | Address → Locatieserver → parcel polygon → 3DBAG context, cached |
| M2 | Constraints + envelope | Placeholder fixture loads, provenance table shows status badges, envelope resolves via bouwvlak → setbacks → parcel, ghost renders |
| M3 | Massing generator | 3 typologies, live sliders, metrics + compliance panel, unit tests pass |
| M4 | AI layer | Brief interpreter + strategy generator produce 3 contrasting options; clamps shown; constraint interpreter fills extracted values |
| M5 | Present & export | Camera presets, render settings, PNG + PDF export including labels |
| M6 | Polish (pick by time) | Roads + street labels, scale figures, trees, compare view, jury review, finance block |
| M7 | Real site swap-in | Real fixture (rules, quotes, traced bouwvlak) replaces placeholder; watermark disappears once nothing is `assumed` |

**Cut first if short on time:** live roads, trees, hatched context, eye-level camera, raycast sun-hours, finance.

### One-day demo cut line

If the prototype must be presentable within one working day:

| Priority | Prompts | Result in the demo |
|---|---|---|
| Must | P0 → P6 (M0–M3) | Real address → real parcel + 3DBAG context in the white-model look, envelope ghost with provenance table, live massing sliders with metrics and compliance |
| Should | P7 → P8 (M4) | AI interprets a brief and generates 3 contrasting options with rationale and clamps. This is the "generative AI" part of the course, so prioritise it over any visual polish |
| Could | Quick PNG export | On-screen canvas to PNG (`preserveDrawingBuffer`), no labels, no offscreen render. Replaces P9 for the demo only |
| Roadmap only | P9–P12 (M5–M7) | Present from SPEC.md as next steps: presentation mode, PDF report, polish, real site rules |

One-day rules:
- Run the review prompt (R) once, after M3, not after every milestone.
- Stop feature work at least 2 hours before the presentation for the Mac handover and rehearsal (§15).
- If a prompt is still failing after two bug-fix rounds, cut it and move on; a working smaller demo beats a broken bigger one.

---

## 13. Working rules for Claude Code

- Start each milestone in plan mode; keep diffs small; commit per milestone.
- Geometry and metrics get unit tests before UI work depends on them.
- No silent defaults for planning values: missing = `null` = shown as unknown.
- Secrets in `.env` (`ANTHROPIC_API_KEY`); never in client code.
- Reference images live in `/docs/references/`; compare renders against them at M0 and M5.
- `PROGRESS.md` is the handoff log between sessions. Every session ends by appending: what was built, decisions taken, deviations from SPEC.md, open issues, next prompt to run. Every new session starts by reading `CLAUDE.md`, `SPEC.md` and `PROGRESS.md`.

### Cross-platform rules (developed on Windows, presented on macOS)
- Pin the Node version in `.nvmrc` and `"engines"` in package.json.
- `.gitattributes` with `* text=auto eol=lf`.
- Build file paths with `path.join` / `path.resolve`; never hard-code `\` or `/` separators. Treat file names as case-sensitive.
- npm scripts must be plain cross-platform commands (no PowerShell/cmd syntax, no `rm -rf`, no `set VAR=`). Use `cross-env` / `rimraf` if needed.
- Avoid packages with native binaries (`canvas`, `sharp`, `node-gyp` builds) unless there is no alternative.
- `.env` stays out of git; `.env.example` lists every variable.
- Commit `data/cache/<site>/` for the demo site so the app runs without network or API calls.
- Target Chrome for development and the demo.

---

## 15. Demo-day handover (PC → Mac)

1. On the PC: commit everything including `data/cache/`, push to a private GitHub repo.
2. On the Mac: install the Node version from `.nvmrc` (nvm or nodejs.org), clone, `npm install` (never copy `node_modules`), copy `.env` across manually.
3. Run the app and click through the full demo flow in Chrome: address → site → constraints → directions → (AI options) → export.
4. Disconnect from Wi-Fi and run the flow again to confirm the cache works offline. AI calls will fail offline; know which steps need network and have their result already on screen or cached.
5. Record a 1–2 minute screen capture of the full flow as a backup.
6. Budget at least 30 minutes for steps 2–5.

---

## 14. Prompt playbook

How to use it:
- **Model** = what to select with `/model` in Claude Code. Opus 5.5 for planning, architecture, geometry, rendering and anything with many interacting decisions; Sonnet 5.5 for well-specified implementation. Fable 5.1, if available on your plan, can replace Opus on P5 and P9, the hardest prompts.
- **Session** = *New* means `/clear` (or a fresh session) so context starts clean from the docs; *Continue* means stay in the previous prompt's session because the context is useful.
- **Plan mode** = start in plan mode, review the plan, then let it implement.
- Every prompt implicitly includes: *"Follow CLAUDE.md. Finish by running tests/build and updating PROGRESS.md."*
- After each milestone, run the review prompt (R) before moving on.

| # | Milestone | Prompt | Model | Session | Plan mode |
|---|---|---|---|---|---|
| P0 | Setup | Repo plan + CLAUDE.md | Opus 5.5 | New | Yes |
| P1 | M0 | Scaffold | Sonnet 5.5 | Continue P0 | No |
| P2 | M0 | White-model look | Opus 5.5 | New | Yes |
| P3 | M1 | Live site data | Sonnet 5.5 | New | Yes |
| P4 | M2 | Constraints + envelope | Opus 5.5 | New | Yes |
| P5 | M3 | Massing generator core | Opus 5.5 | New | Yes |
| P6 | M3 | Inputs + metrics UI | Sonnet 5.5 | Continue P5 | No |
| P7 | M4 | AI layer (server) | Opus 5.5 | New | Yes |
| P8 | M4 | AI layer (UI) | Sonnet 5.5 | Continue P7 | No |
| P9 | M5 | Present + PNG export | Opus 5.5 | New | Yes |
| P10 | M5 | PDF report | Sonnet 5.5 | Continue P9 | No |
| P11 | M6 | One polish item per run | Sonnet 5.5 | New each | Optional |
| P12 | M7 | Real site swap-in | Sonnet 5.5 | New | No |
| R | After each milestone | Review | Opus 5.5 | New | No |
| B | Any time | Bug fix | Sonnet 5.5 (Opus if stuck twice) | Continue current | No |

### P0 — Repo plan + CLAUDE.md
```
Read SPEC.md in full. Do not write application code yet.
1. Create CLAUDE.md: a short file with the working rules from SPEC.md §13 (including the cross-platform rules: I develop on Windows and present on macOS), the stack from §6, the "numbers come from code, words from the model" rule from §7, and pointers to SPEC.md and PROGRESS.md.
2. Create an empty PROGRESS.md with a template (date, prompt id, built, decisions, deviations, open issues, next).
3. Create .gitattributes, .nvmrc and .env.example per §13 cross-platform rules.
4. Propose the folder structure (client, server, shared types, data/sites, data/cache, docs/references) and the exact package list for M0–M1. Flag any package with native binaries. Explain any choice that differs from §6.
Stop after the plan and these files.
```

### P1 — Scaffold (M0)
```
Implement the approved structure from P0.
- Vite + React + TS client, Node (Hono) server, shared types package, Vite proxy to the server.
- zod schemas for Provenance, Constrained<T>, SiteConstraints, Envelope, MassingParams, MassingResult exactly as in SPEC.md §5 and §8.
- A hard-coded sample parcel polygon and 10–20 hard-coded box buildings around it (local metres) so the viewer has something to show.
- Basic R3F viewer: orthographic axonometric camera, OrbitControls (orbit/pan/zoom only, no selection).
- .env.example with ANTHROPIC_API_KEY and LLM_MODEL.
Done when: `npm run dev` shows the parcel and boxes; tests run (even if trivial).
```

### P2 — White-model look (M0)
```
The reference images are in /docs/references/. Look at them first and list the visual traits you will reproduce.
Make the viewer match that look using the hard-coded scene: white matte context, light grey ground, one saturated proposal-colour test volume with a crisp black outline (outline on the proposal only), long soft directional shadows driven by suncalc for Delft, ambient occlusion via N8AO, no visible horizon.
Put all look parameters in one renderStyle config object (colours, AO, shadow softness, outline weight) — M5 will expose them to the user.
Take screenshots and compare to the references; iterate until close. Report what still differs.
```

### P3 — Live site data (M1)
```
Implement the NL data providers behind interfaces (Geocoder, ParcelProvider, ContextProvider) per SPEC.md §2 and §4.
- Before writing each client, fetch the provider's OpenAPI/docs and confirm endpoints, params and field names. Do not guess.
- PDOK Locatieserver: address → RD New coordinate.
- PDOK Kadastrale Kaart OGC API, collection perceel: small bbox around the point → point-in-polygon → parcel polygon, ID, area. Mark the geometry "indicative".
- 3DBAG API: buildings in a ~250 m bbox, handle pagination, extrude footprints to roof height (v1).
- proj4 for CRS; shift everything to a local origin at the parcel centroid.
- Disk cache under /data/cache/<site>/ so the app runs offline after first load.
Wire to an address input. Test with the stand-in parcel DEL00 K 2410 (look up its address via the API).
Done when: typing the address renders the real parcel and context in the white-model look.
```

### P4 — Constraints + envelope (M2)
```
Implement SPEC.md §5.
- ZoningProvider that reads /data/sites/<id>.json. Create placeholder.json with plausible values, all status "assumed", and a fixture template documenting every field (including the Dutch terms).
- resolveEnvelope(): bouwvlak → setbacks → parcel, returning Envelope with source + provenance. Unit-test all three paths, including a bouwvlak that extends past the parcel (clip it).
- Constraints screen: table with value, unit, source, quote, status badge (verified / extracted / assumed / unknown), and user override (override sets status "user_override").
- Envelope ghost wireframe in the viewer.
- Global "placeholder data" state: true while any value is "assumed"; expose it for the export watermark later.
```

### P5 — Massing generator core (M3)
```
Implement generateMassing(envelope, rules, params) per SPEC.md §8 as a pure, side-effect-free module in the shared package.
- Start with three typologies: slab, l_block, courtyard. Structure the code so tower_podium and stepped can be added as new templates without touching the others.
- Clamp params to constraints and record every clamp as a human-readable string.
- Metrics and compliance exactly as specified; compliance returns "unknown" when the rule value is null.
- facadeSunScore v1 (orientation-weighted facade area).
- Performance target < 50 ms on the stand-in site; add a benchmark test.
- Unit tests: metrics on a known rectangle, clamping, each typology stays inside the envelope, null-rule handling.
Plan the template-fitting approach first and explain how each typology fits an irregular envelope polygon.
```

### P6 — Inputs + metrics UI (M3)
```
Build the Directions workspace (SPEC.md §9, screen 3) without AI yet.
- Left: programme inputs (target units, average unit size, net-to-gross), typology, floors, depth, alignment, coverage, roof, colour. Sliders regenerate live.
- Centre: viewer showing the massing inside the envelope ghost.
- Right: metrics, compliance list, clamps, assumptions.
- Option tabs A/B/C, each holding its own MassingParams (manually set for now).
```

### P7 — AI layer, server (M4)
```
Implement the server-side AI calls from SPEC.md §7 using the Anthropic SDK, model from LLM_MODEL.
- One module per call: constraintInterpreter, briefInterpreter, strategyGenerator, report writer stub. Optional: reviewer (jury).
- Every call returns JSON validated by a zod schema; on validation failure retry once with the error, then return a typed error.
- strategyGenerator must return 3 contrasting MassingParams with name, intent, trade-offs. Contrast is a requirement: add a check that rejects three near-identical options.
- The model never outputs metrics or geometry. Numbers in prompts come from code.
- constraintInterpreter: input = plan excerpts from the fixture; output = Constrained values with exact quotes and status "extracted". Test it on any Dutch zoning text for now.
- Keep prompts in separate versioned files under server/prompts/.
- Fixture-based tests with recorded responses so tests don't hit the API.
```

### P8 — AI layer, UI (M4)
```
Wire P7 into the UI.
- Brief text box + "Interpret brief" (fills programme and priorities, user can edit after).
- "Generate directions" fills options A/B/C; each shows its intent, trade-offs and any clamps the generator applied ("asked for 7 floors, max height allows 6").
- Loading and error states; sliders keep working while AI calls are pending.
- "Extract rules" button on the Constraints screen runs constraintInterpreter and shows a diff before applying.
```

### P9 — Present + PNG export (M5)
```
Implement SPEC.md §10.
- Present mode: camera presets (4 axonometric corners, top, eye-level), save custom camera, settings panel bound to the renderStyle config from P2 plus sun date/time, toggles, aspect ratio, resolution multiplier.
- Labels (street names, leader-line annotations in a monospace font, optional black tag boxes): render them so they appear in the export. Either in-scene text or screen-projected anchors drawn onto a 2D canvas composited over the render — choose and justify.
- PNG export from an offscreen renderer at full target resolution (not a screenshot of the on-screen canvas).
- Placeholder watermark when placeholder state is true.
Compare an exported PNG with /docs/references/ and report differences.
```

### P10 — PDF report (M5)
```
Build the PDF export per SPEC.md §11 with pdf-lib or jsPDF.
- Uses the P9 render and the report writer from P7; every number comes from computed metrics, not from model text.
- Sections in the order of §11; constraints table shows source and status; assumptions and limitations always included.
- Placeholder watermark on every page when applicable.
```

### P11 — Polish item (M6), one per run
```
Implement only: <ITEM> (choose one: roads + street labels from BGT or OSM / scale figures / trees / side-by-side compare with synced cameras / jury reviewer in UI and report / indicative finance block / tower_podium and stepped typologies / hatched context style).
Keep it behind a toggle where it is visual. Don't refactor unrelated code.
```

### P12 — Real site swap-in (M7)
```
Here are the real site details: <address>, <parcel id>, plan excerpts in Dutch with URLs: <paste>, bouwvlak traced as coordinates or a description: <paste>.
1. Create /data/sites/<id>.json from the template; values I verified by hand get status "verified".
2. Run constraintInterpreter on the excerpts for the remaining fields; show me the extracted values with quotes before saving.
3. Switch the app to this site, clear its cache, re-run, and confirm the watermark is gone only if nothing is "assumed".
4. List any rule from the excerpts the generator cannot use; put it in notes.
```

### R — Milestone review (fresh session, fresh eyes)
```
Read CLAUDE.md, SPEC.md and PROGRESS.md. Review the code for milestone <Mx> against its "done when" criteria in SPEC.md §12 and the rules in §7 and §13.
Run the tests and the app. Report: criteria met / not met, deviations from the spec, places where the model could output numbers or geometry, missing provenance, untested geometry. Do not fix anything; list issues by severity.
```

### B — Bug fix
```
Bug: <what you did> → <what happened> → <what you expected>. <Error text / screenshot>.
Find the root cause before changing code. Explain it, fix it, add a test that would have caught it.
```
