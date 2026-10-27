# PROGRESS

Handoff log between Claude Code sessions. Append one entry per session at the bottom of the Log, using this template.

## Template
### YYYY-MM-DD · P<n> — <prompt name> (M<x>)
- **Built:**
- **Decisions:**
- **Deviations from SPEC.md:**
- **Open issues:**
- **Next:** P<n> — <prompt name>

---

## Log

### 2026-10-06 · P0 — Repo plan + CLAUDE.md (setup)
- **Built:** `CLAUDE.md`, `PROGRESS.md`, `.gitattributes`, `.nvmrc` (24.18.0), `.env.example`, `.gitignore`. No application code, no package.json, no installs.
- **Decisions:**
  - Toolchain on the dev PC: Node 24.18.0 LTS, npm 11.16.0. `.nvmrc` = `24.18.0`; root `engines.node` = `>=24.18.0 <25`.
  - Repo = npm workspaces: `client/` (@massing/client), `server/` (@massing/server), `shared/` (@massing/shared). `shared` is consumed as TS source (`"exports": "./src/index.ts"`), no build step.
  - Folder layout:
    ```
    client/src/{screens,viewer,state,api}      Vite + React + R3F; vite proxy /api → http://127.0.0.1:8787
    server/src/{routes,providers/nl,cache,prompts}   Hono on Node; loads .env via process.loadEnvFile
    shared/src/{schemas,providers.ts,geo,fixtures,massing}   pure isomorphic TS (no fs, no DOM)
    data/sites/<id>.json                       site fixtures (placeholder.json + template at M2)
    data/cache/<site>/                         committed for the demo site
    docs/references/                           reference PNGs
    ```
    Root: `package.json`, `package-lock.json` (committed), `tsconfig.base.json` (strict, forceConsistentCasingInFileNames), `vitest.config.ts` (projects: shared, server). Tests colocated as `*.test.ts`.
  - Package list M0–M1 (latest stable at install; P1 records resolved versions here):
    - root dev: `typescript` (JS compiler, not TS 7 native), `vitest`, `concurrently`, `rimraf`, `@types/node`
    - client: `react`, `react-dom`, `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `postprocessing`, `zustand`, `suncalc`, `@massing/shared`; dev: `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/three`, `@types/suncalc`
    - server: `hono`, `@hono/node-server`, `@massing/shared`; dev: `tsx`
    - shared: `zod` (v4), `proj4`, `@turf/boolean-point-in-polygon`; dev: `@types/geojson` (+ `@types/proj4` only if proj4's bundled types are missing)
    - N8AO is expected via `@react-three/postprocessing`; add `n8ao` explicitly if missing.
    - Later: `polygon-clipping` (M2), `@anthropic-ai/sdk` (M4), `pdf-lib`/`jsPDF` (M5).
  - Native binaries: only the prebuilt per-platform binaries of esbuild/rollup (or rolldown) via vite, vitest and tsx, plus macOS-only `fsevents`. Avoided on purpose: `@vitejs/plugin-react-swc`, TS 7 native preview, `canvas`, `sharp`, node-gyp packages.
- **Deviations from SPEC.md:**
  - Modular `@turf/*` (planar-safe functions only) instead of `@turf/turf`. Turf's measuring functions assume WGS84, and our geometry is in RD metres, so area, centroid and orientation are planar math in `shared/geo`.
  - `polygon-clipping` preferred over `clipper-lib` (float coords, pure JS; per-edge setbacks via half-plane intersection). Final decision at M2.
  - Screen 1 parcel confirmation uses an SVG plan instead of a map library (works offline, no tiles).
  - No `dotenv`/`cross-env`: Node 24 `process.loadEnvFile()`.
  - Server and proxy on `127.0.0.1` (macOS `localhost` → `::1` issue).
  - Added `.gitignore` (not in the P0 prompt) so `.env` stays out of git; `data/cache/` is not ignored.
  - Extra env vars `SERVER_PORT`, `SITE_ID`, `CACHE_MODE` (`readwrite` | `offline`) in `.env.example`; P1/P3 must implement them.
- **Open issues:**
  - Not a git repo yet: run `git init` in P1 before the first commit.
  - Move `ref-01/02/03*.png` from the repo root to `docs/references/` in P1.
  - Mac risk: a lockfile written on Windows may leave out macOS optional binaries (`@esbuild/darwin-arm64`, `@rollup/rollup-darwin-arm64`). Test clone + `npm install` + `npm run dev` on the Mac at the end of M1.
- **Next:** P1 — Scaffold (M0)

### 2026-10-06 · P1 — Scaffold (M0)
- **Built:**
  - `git init`; reference PNGs moved to `docs/references/`.
  - npm workspaces `shared`, `server`, `client` per the P0 layout. Root scripts: `dev`, `test`, `typecheck`, `build`, `clean`.
  - `shared`: zod schemas for Provenance, `constrained(T)`, SiteConstraints, Envelope, MassingParams, MassingResult, Volume, plus site DTOs (Ring, Parcel, ContextBuilding, SiteScene). Provider interfaces (Geocoder, ParcelProvider, ContextProvider, ZoningProvider, CodeRules). Planar geometry (area, centroid, toLocal), RD New proj4 definition, hard-coded sample scene (5-vertex parcel, 15 boxes, local metres).
  - `server`: Hono app (`/api/health`, `/api/scene` serving the sample scene), bound to 127.0.0.1, loads `.env` via `process.loadEnvFile`.
  - `client`: Vite + React + R3F viewer. Orthographic axonometric camera, OrbitControls (orbit/pan/zoom only), flat parcel, extruded context boxes. Vite proxies `/api` to the server. Scene is fetched from the server and parsed with the shared zod schema.
  - 12 vitest tests pass (geometry, CRS, schemas, server routes). Typecheck and production build pass. Dev run checked in the browser: parcel and boxes render, no console errors.
- **Resolved versions:** typescript 6.0.3, vitest 5.0.3, vite 8.3.3, react 19.3.0, three 0.186.1, @react-three/fiber 9.8.1, drei 10.7.9, postprocessing (R3F) 3.1.3, postprocessing 6.39.5, zustand 5.0.15, suncalc 2.1.1, hono 4.13.13, @hono/node-server 2.1.3, tsx 4.23.15, zod 4.6.5, proj4 2.22.0, @turf/boolean-point-in-polygon 7.4.0, @types/node 24.19.1, concurrently 10.0.5, rimraf 6.1.3.
- **Decisions:**
  - `npm install` resolved `typescript@latest` to 7.0.2 (native compiler) and `@types/node` 26. Pinned to `typescript@~6` (JS compiler) and `@types/node@24`, as P0 intended.
  - N8AO arrives through `@react-three/postprocessing` (`node_modules/n8ao` present), so no extra package.
  - `ParcelProvider`/`ContextProvider` return `Parcel`/`ContextBuilding` with rings in RD metres. The caller shifts them to the local frame with `toLocal`.
  - Plan point (x, y) maps to three.js (x, height, -y).
  - Server tests live in `server/src`; vitest projects are the `shared` and `server` directories. Client tests are not set up yet.
- **Deviations from SPEC.md:**
  - Vite resolved to 8.x (rolldown-based) instead of the esbuild/rollup pair named in P0. Still prebuilt binaries, no compilation. The `win32-x64` binaries are installed; the Mac needs its own (see open issues).
  - Context boxes use a plain `meshStandardMaterial` for now. The white-model look is P2.
- **Open issues:**
  - npm warns that `esbuild@0.28.2` has an install script it did not run (npm 11.16 allow-scripts). Nothing needed it: dev, tests and build all work. Revisit if esbuild misbehaves on the Mac.
  - Build warns about a 1.37 MB chunk (three + drei). Fine for a local demo, no splitting planned.
  - Mac check (fresh clone, `npm install`, `npm run dev`) still pending, planned for the end of M1. No remote or commit made for it yet.
  - Client has no unit tests yet.
- **Next:** P2 — White-model look (M0), Opus 5.5, new session, plan mode.

### 2026-10-06 · P2 — White-model look (M0)
- **Built:**
  - `client/src/viewer/renderStyle.ts`: one `RenderStyle` config (background/ground, parcel, context, proposal + outline, light, AO, camera) and `defaultRenderStyle`. M5 binds a settings panel to this shape.
  - Viewer split into `Viewer` (Canvas `flat` + `shadows="percentage"`, ortho camera from elevation/azimuth, orbit limited to above the horizon), `Sun` (suncalc for `scene.origin`, directional light with shadow frustum fitted to scene radius + shadow length, hemisphere + ambient fill), `Ground` (unlit plane in the background colour + shadow-only layer, so there is never a horizon or edge; parcel tint), `ContextModel` (matte Lambert, no edges), `ProposalVolume` (saturated Lambert + drei `Edges` 2 px black: outline on the proposal only), `Effects` (EffectComposer + N8AO), `geometry.ts` (shape/extrude/bounds helpers).
  - `shared/src/geo/sun.ts`: `sunVector(azimuthDeg, altitudeDeg)` → [east, north, up], with 6 tests.
  - `SiteSceneSchema` gained `origin: {lat, lon}` (WGS84 of the local origin, drives suncalc) and optional `proposal: Volume[]`. Sample scene: Delft stand-in origin (52.0116, 4.3571) and a 2-volume L test mass (12 m bar + 18 m head) inside the parcel.
  - `.claude/launch.json` (`massing-dev` = `npm run dev`, port 5173) for the browser preview.
  - 18 tests pass, typecheck and build pass. 60 fps at ~970×910 in the dev preview.
- **Final renderStyle defaults:** background `#e6e6e3`, context `#f7f7f5`, proposal `#c23350`, outline `#111111` 2 px. Sun 2026-09-21 09:30+02:00 (Delft: alt ≈ 18°, az ≈ 113°, so long shadows fall west/left of the default view), sun 2.2, sky 2.1 (`#ffffff` / bounce `#bdbdb9`), ambient 0.15, PCF radius 6, map 4096, shadow opacity 0.4. AO radius 5 m, falloff 1, intensity 6, quality high. Camera elevation 42°, azimuth 210° (from SSW), zoom 7.
- **Measured vs references** (sRGB pixel reads from the canvas vs neutral-grey histograms of the refs): ground 230 (ref-02 ≈ 230), roofs 239 (≈ 232–236), lit walls 225 (≈ 220), shaded walls 187 (≈ 190–198), ground shadow 183 (≈ 185–195). Proposal lit face 171/44/69 vs ref-01 mid red 170/56/79.
- **Decisions:**
  - suncalc resolved to **2.x**, whose API differs from the 1.x that `@types/suncalc` describes: degrees, azimuth clockwise from north. `sunVector` uses the 2.x convention, and `@types/suncalc` was removed (suncalc 2 ships its own types).
  - `flat` (NoToneMapping) so white stays white; `shadows="percentage"` because three r186 removed PCFSoftShadowMap (soft edges come from `shadow.radius`).
  - The EffectComposer stays mounted even with AO off (N8AO `enabled` prop). Rendering without it blends the shadow layer in sRGB and makes ground shadows much darker (183 → ~150), so the AO toggle would otherwise change the shadows too.
  - Shadow darkness comes from a `shadowMaterial` layer over an unlit ground, so the ground colour exactly equals the background.
  - Default sun is morning, so shadows fall to the left as in ref-02. M5 exposes date/time.
- **Deviations from SPEC.md:**
  - Context buildings have no edge lines. ref-01/02 show thin grey edges on context, but SPEC §10 says the outline is on the proposal only. The spec wins. Could become an optional `contextEdges` style in M5.
  - `SiteScene` now carries the proposal volumes for M0. P5/P6 will move the proposal to massing state (generateMassing output) and probably drop it from the scene payload.
- **Open issues / remaining differences vs references:**
  - Not in P2 scope: asphalt roads with dashed centrelines, street labels, leader-line/tag annotations, scale figures, trees, hatched context, the paper/noise texture of ref-02 (P9/P11).
  - The sample context is sparse boxes; refs are dense blocks, so the 1 m gaps between terrace boxes read as dark slits. Real 3DBAG context (P3) will look denser.
  - `scene.origin` is a Delft stand-in. P3 must fill it from the parcel centroid (RD → WGS84 via proj4).
  - The console shows a `THREE.Clock` deprecation warning from R3F internals. Harmless.
  - Build chunk is now 1.6 MB (postprocessing + n8ao). Still fine for a local demo.
  - Mac check (fresh clone, `npm install`, `npm run dev`) still pending from P1.
  - The browser preview pane pauses rendering when hidden. Keep it visible when taking screenshots.
  - No commits per milestone: the user will commit everything at the end (git identity still unset on this PC).
- **Next:** P3 — Live site data (M1), Sonnet 5.5, new session, plan mode. Run the SPEC §14 P3 prompt plus these carry-overs: fill `scene.origin` from the real parcel centroid (RD → WGS84); implement `SERVER_PORT`, `SITE_ID`, `CACHE_MODE` from `.env.example`; keep or drop the proposal test mass depending on fit; preview via `.claude/launch.json` with the pane visible; do not commit (the user commits at the end).

### 2026-10-06 · P3 — Live site data (M1)
- **Built:**
  - Server: `config.ts` (`SERVER_PORT`, `SITE_ID`, `SITE_ADDRESS`, `CACHE_MODE`), `cache/diskCache.ts` (raw JSON per URL under `data/cache/<dir>/<provider>-<sha1[:12]>.json`; `offline` + miss → `CacheMissError` → HTTP 503), `providers/nl/{locatieserver,kadasterParcel,bag3d}.ts` behind the shared `Geocoder` / `ParcelProvider` / `ContextProvider` interfaces, `scene.ts` (`buildScene`: address → parcel → origin = parcel centroid → `rdToWgs84` for `scene.origin` → `toLocal` for everything), `createApp(deps)` in `app.ts`. Routes: `GET /api/scene?q=<address>` (default `SITE_ADDRESS`), `GET /api/scene/sample` (old hard-coded scene).
  - Shared: `pointInRing` (planar), `SceneMetaSchema` + optional `meta` on `SiteScene` (address, sources, context count, skipped count).
  - Client: address input + Load, error display, facts panel (parcel id, area, "indicative boundary", context count, sources).
  - Tests: 38 pass (was 18). Recorded real fixtures in `server/src/providers/nl/__fixtures__/`. Typecheck and build pass.
  - Demo cache seeded: `data/cache/placeholder/` (18 files, 4.1 MB). Verified in `CACHE_MODE=offline` on a second server instance: seeded address → 200, unseeded address → 503 with a readable message. Browser: 773 context buildings, 61 fps, no console errors. Second address (Oude Delft 100) works and lands in `data/cache/_adhoc/` (git-ignored).
- **Endpoints verified against the live APIs (not guessed):**
  - Locatieserver `search/v3_1/free?q&rows=1&fq=type:adres&fl=weergavenaam,centroide_rd,nummeraanduiding_id`; `centroide_rd` is WKT in RD.
  - Kadastrale kaart `collections/perceel/items?f=json&bbox&bbox-crs=…/28992&crs=…/28992`. **`crs=` is required for RD output**; the default is CRS84. Geometry is `MultiPolygon`; `kadastrale_grootte_waarde` is the registered area.
  - 3DBAG `collections/pand/items?bbox=<RD>&limit=100`, pagination via the `next` link. `metadata.transform` (scale/translate) decodes the integer vertices. Footprint = `lod "0"` outer ring.
- **Decisions:**
  - Stand-in site: parcel **DEL00 K 2410** is the plot at **Hendrik Casimirstraat 8, 2628KJ Delft** (point-in-polygon confirmed; no. 6 is K 2409). Default `SITE_ADDRESS` is that address.
  - Context height = `b3_h_dak_70p − b3_h_maaiveld` (LoD1.2 roof height above ground). Checked on a fixture: 7.78 m vs 7.80 m from the LoD1.2 vertices. Buildings with no height, `eindgeldigheid` set, or status demolished / not built / permit-only are skipped and counted (`meta.skippedContext`).
  - Only the demo address writes to `data/cache/<SITE_ID>/`; every other address goes to `_adhoc`, so the committed cache stays clean.
  - Point-in-polygon is a planar ray-cast in `shared/geo` rather than `@turf/boolean-point-in-polygon` (CLAUDE.md: planar math in shared/geo).
  - The proposal test mass is dropped from the live scene (111 m² parcel). `proposal` stays optional in the schema.
  - `app.ts` no longer exports a ready-made `app`: `index.ts` loads `.env` and then calls `createApp(loadConfig())`, so config is never read before `.env`.
  - No context merging in `ContextModel`: ~870 meshes still run at 61 fps.
- **Deviations from SPEC.md:** none.
- **Open issues:**
  - The stand-in parcel is only **111 m²** (a terraced-house plot). It will constrain M3 massing; the real site swap-in is P12.
  - Locatieserver is fuzzy: a nonsense address still returns the nearest fuzzy match (a gibberish query returned a parcel in Zeist). The label of the match is shown in the input after loading, but there is no "did you mean" check.
  - The parcel tint is hidden under the terrace, so the parcel is hard to see in the default view. The envelope ghost (P4) should fix this.
  - The own building on the parcel is kept as context.
  - Holes in footprints (inner rings) are ignored.
  - Another dev server (from another chat) was holding ports 5173/8787 during this session. It picked up the changes through watch/HMR, so verification used it.
  - Mac check (fresh clone, `npm install`, `npm run dev`) still pending. The user commits everything at the end.
- **Next:** P4 — Constraints + envelope (M2), Opus 5.5, new session, plan mode.

### 2026-10-06 · P4 — Constraints + envelope (M2)
- **Built:**
  - Shared: `SiteFixtureSchema` (`schemas/siteFixture.ts`); `constraints/` (field registry `CONSTRAINT_FIELDS` with labels, Dutch terms, units and `getField`/`setField`/`formatValue`; `applyOverrides`, `unknownConstraints`, `assumedFields`, `isPlaceholder`; `constraintsToLocal`); `envelope/` (`edgeRoles`, `insetPerEdge`, `resolveEnvelope`); planar helpers `openRing`, `closeRing`, `toCcw`, `cleanRing`, `polygonWithHolesArea`, `distanceToSegment`. New dependency `polygon-clipping` 0.15.7 (pure JS).
  - Data: `data/sites/placeholder.json` (K 2410, everything `assumed`: Wonen, 15 m, setbacks street 2 / side 0 / rear 5 m, street side 65°, coverage 0.6; gutter height, FAR, parking, bouwvlak, building line `null`), `_template.json`, `README.md` (every field, units, statuses, Dutch terms).
  - Server: `FixtureZoningProvider` (`server/src/providers/fixtureZoning.ts`) reads `data/sites/<SITE_ID>.json`. `buildScene` attaches `scene.zoning = { fixtureId, constraints }` in the local frame, or all-unknown constraints when no fixture matches the parcel. `config.sitesRoot`.
  - Client: zustand `state/siteStore.ts` (scene, overrides, `useConstraints`, `useEnvelope`, `usePlaceholder` for the P9 watermark); `screens/SiteScreen.tsx` (old address form + facts), `screens/ConstraintsScreen.tsx` (table: rule + Dutch term, value, source/quote, status badge, override Set / Unknown / Reset; notes; envelope summary; "Show envelope"); tab bar Site | Constraints with a PLACEHOLDER DATA badge; `viewer/EnvelopeGhost.tsx` (faint fill + dashed edges, no depth write, no shadows; unknown height → ground outline drawn through buildings); `renderStyle.envelope`.
  - Tests: 67 pass (was 38): all three envelope paths, clipped bouwvlak, bouwvlak outside the parcel, empty and multi-part results, L-shape concave corner, the real K 2410 ring (distance from every edge checked), edge roles, overrides, placeholder flag, fixture files, scene zoning. Typecheck and build pass.
  - Browser check (port 5174): stand-in envelope = setbacks path, 71 m² × 15 m. Rear 9 m → 44 m² instantly, badge `user override`. Height Unknown → ground outline + note. Street 30 m → "no buildable area". Reset → 71 m². Oude Delft 100 → every rule unknown, parcel path, placeholder on. 60 fps, no console errors.
- **Decisions:**
  - Setbacks need edge roles. New optional constraint `streetSide` (bearing from the parcel towards the street, °). An edge is street/rear when its outward normal is within 45° of that bearing (or its opposite) **and** it lies in the front/back quarter of the plot depth **and** its outward ray does not re-enter the parcel. The last two rules were needed for K 2410, whose south side has a 1 m jog and a small bump that face front/back.
  - Setback cut = everything within `d` of the edge segment (band + circumscribed disks at both ends), i.e. the literal "distance to the boundary ≥ d". A first version with bands only left a detached sliver beside the bump.
  - The setbacks path runs only when all three setbacks are known (and the street side, unless all three are equal). Otherwise the parcel path is used and a note says what is unknown.
  - Placeholder = any constraint (or note) with status `assumed`, null or not, or an `assumed` envelope. Real fixtures should mark "plan has no such rule" as `null` + `verified`.
  - Overrides live in client state only (not persisted, not written to the fixture), reset when another parcel loads. The envelope is recomputed client-side with the shared function.
  - Override provenance puts the previous value in `source` ("User override (was 5 m, assumed)"), not in `quote`, which stays reserved for plan text.
  - Vite port can be set with `PORT`, and `.claude/launch.json` has `massing-dev-alt` (client 5174, server 8788), because another chat's dev server held 5173/8787.
- **Deviations from SPEC.md:**
  - `Envelope.maxHeight` is `number | null` (spec: `number`): unknown height must not become a default. **P5 must handle null** (no floor clamp, height compliance `unknown`).
  - `Envelope.notes: string[]` added (clip, fallback and unknown-input explanations).
  - `SiteConstraints.streetSide` added (optional, provenance like every other rule).
  - `ZoningProvider.constraintsFor(parcel)` returns `{ fixtureId, constraints } | null` (P1 had `constraintsFor(siteId)`).
  - `SiteScene.zoning` added; constraints travel with the scene, shifted to the local frame by the server.
- **Open issues:**
  - The plot's own house is context and sits inside the envelope ghost. Hiding the context building on the parcel is a P5/P6 question (the proposal replaces it).
  - Editing a shared module while `npm run dev` runs re-creates the zustand store via HMR and leaves the viewer empty until a page reload. Dev-only.
  - At ~800 px wide the Constraints panel covers most of the viewer. Fine on a laptop screen; no responsive layout yet.
  - Geometry rows (bouwvlak, building line) can only be overridden to unknown, not drawn.
  - `streetSide` 65° is a guess from the address point and open space; check it on a map when the real site is chosen (P12).
  - Mac check (fresh clone, `npm install`, `npm run dev`) still pending. The user commits everything at the end.
- **Next:** P5 — Massing generator core (M3), Opus 5.5, new session, plan mode. Carry-overs: `generateMassing` takes the `Envelope` as is (`maxHeight` may be null, `footprint.coordinates` may be `[]`); use `useConstraints()`/`useEnvelope()` from `client/src/state/siteStore.ts` when P6 wires it to the UI.

### 2026-10-06 · P5 — Massing generator core (M3)
- **Built:**
  - `shared/src/massing/`: `generateMassing` (orchestrator), `frame.ts` (building axis + rotation), `fit.ts` (clip helpers, bisection `solveExtent`), `templates/` (`slab`, `lBlock`, `courtyard`, registry `TEMPLATES` + `TYPOLOGY_LABELS`), `metrics.ts` (`computeMetrics`, `facadeSunScore`, `sunWeight`), `compliance.ts` (`checkCompliance`), `format.ts`. Exported from `@massing/shared`.
  - Planar helpers: `rotate`, `toGeoPolygon` (moved out of `resolveEnvelope.ts`), `distanceOutside`.
  - Tests: 143 pass (was 67): known-rectangle metrics, every clamp type, pitched roof, null/absent rules, empty envelope, L and courtyard shapes, slab fallback on K 2410, inside-envelope sweep (5 envelopes × 3 typologies × 2 alignments × 3 coverage targets), purity/determinism, benchmark. Typecheck and build pass.
  - Benchmark: **1.0–1.7 ms** per call (mean of 20, pitched roof) on K 2410 and a 40-vertex envelope, all typologies and alignments. Budget 50 ms.
- **Template fitting:** rotate the envelope into a building frame (u = axis, +v = front). Templates are rectangles in that frame, scaled by one extent `s ∈ [0,1]`, clipped to the envelope with polygon-clipping (this is what keeps every typology inside an irregular envelope). The variant with the most area at s = 1 wins; bisection then finds the largest s whose footprint stays ≤ the coverage target (invariant area(lo) ≤ target, so the result never exceeds target or max coverage). Axis: street alignment follows the longest envelope edge `edgeRoles` marks as street; unknown street side → long axis of the minimum-area bounding rectangle (assumption); sun alignment → east–west, front north.
  - slab: band of depth d along u, five positions front → back, grown from its centre.
  - l_block: front wing + side wing of width d at either end, both arms grow from the corner.
  - courtyard: envelope ∩ centre-scaled box, minus a court inset by d; solid when no `MIN_COURT` court fits; falls back to slab when even `MIN_DEPTH` wings leave no court.
  - tower_podium / stepped: no template yet → slab + clamp. New typology = one file + one registry line.
- **Decisions:**
  - Constants: `MIN_DEPTH` 5 m, `MIN_COURT` 8 m, `ROOF_PITCH` 40° (listed in `assumptions` when used). Clip slivers < 1 m² dropped. Coverage shortfall clamp above 2 percentage points.
  - Clamp order: typology fallback → depth (≤ envelope across the axis) → coverage (≤ max coverage) → template prepare (courtyard depth / fallback, L reads as slab) → shortfall → floors by max height (incl. ridge), max gutter height (wall top), max FAR. Each clamp names asked and allowed values plus the rule status.
  - Pitched roof: `Volume.roof = { pitchDeg, ridgeAngle, ridgeHeight }`, ridge along the building axis, ridge = min(depth, part width)/2 × tan 40°. Counts in height and max height; gutter rule uses the wall top; attic not in GFA.
  - **facadeSunScore:** on a closed footprint Σ length × outward normal = 0, so a weight linear in cos(angle from south) (the obvious "S 1, E/W 0.5, N 0") gives every footprint the same score (found by a failing test). Weight is now `((1 + cos Δ)/2)²` (S 1, SE/SW 0.73, E/W 0.25, N 0) and the area-weighted mean (always 0.25–0.5 on a closed footprint) is rescaled to 0–1: 1 = long facades face south/north, 0 = east/west. S vs N can only matter once party walls are excluded (v2).
  - Compliance rows: allowed functions, max height, max gutter height, max coverage, max FAR, parking (always `unknown`, shows demand = units × norm), inside envelope. Null or absent rule → `unknown`. Labels come from `CONSTRAINT_FIELDS`.
  - "Inside envelope" is a distance check (vertices + edge midpoints vs envelope, 1 mm), not a boolean difference: polygon-clipping threw "Unable to complete output ring" on the coincident edges left by clipping. Shapes that throw during fitting count as "does not fit", so a slider can never crash the app.
  - `estUnits` rounds down.
- **Deviations from SPEC.md:**
  - Signature is `generateMassing(envelope, rules, params, site: { parcelArea, programme })`. Coverage, FAR and units need the parcel area, net-to-gross and unit size.
  - `MassingResult.assumptions: string[]` added (P6 right panel). `Volume` gained optional `floors` and `roof`. New `ProgrammeSchema { targetUnits, avgUnitSize, netToGross }` + `DEFAULT_PROGRAMME` (12 units, 65 m², 0.75: assumptions for P6/P7 to show as editable), `TypologySchema`, `ComplianceSchema`.
  - facadeSunScore weighting as above (spec ordering kept, values rescaled).
- **Open issues:**
  - `ProposalVolume` draws outer rings only: courtyard holes and gables are not rendered yet (P6).
  - Courtyard wings follow the frame box, not slanted envelope edges, so on irregular envelopes the court can open into a C. L-block on a very irregular envelope can end up multi-part (each part is a volume).
  - On K 2410 the street frontage is ~7 m, so street-aligned slabs run front-to-back like a terraced house; L reads as a slab at depth ≥ ~11 m, courtyard always falls back. Expected for a 111 m² plot.
  - Shared tests that need Node globals reference `node` types per file (TS 6 defaults `types` to `[]`).
  - Mac check still pending. The user commits everything at the end.
- **Next:** P6 — Inputs + metrics UI (M3), Sonnet 5.5, continue this session, no plan mode. Carry-overs: call `generateMassing(envelope, constraints, params, { parcelArea: scene.parcel.areaM2, programme })` from `useEnvelope()`/`useConstraints()`; render holes and `roof` in `ProposalVolume`; hide the context building on the parcel when a proposal is shown; show `clamps` and `assumptions` panels; programme inputs bind to `ProgrammeSchema` starting from `DEFAULT_PROGRAMME`.

### 2026-10-06 · P6 — Inputs + metrics UI (M3)
- **Built:**
  - `client/src/state/massingStore.ts`: zustand store with `programme` (starts from `DEFAULT_PROGRAMME`), three options A/B/C each holding its own `MassingParams` (A slab, B L-block east–west, C courtyard), `active`, setters, `resetOption`. `useMassing(id)` runs `generateMassing(envelope, constraints, params, { parcelArea: scene.parcel.areaM2, programme })` in a `useMemo` over `useEnvelope()`/`useConstraints()`, so sliders and constraint overrides regenerate live with no server or LLM call.
  - `client/src/screens/DirectionsScreen.tsx`: option tabs, left inputs (programme sliders; typology select with the two unbuilt ones disabled; floors, depth, coverage, ground/floor height, alignment, roof, colour; reset), right panel (metrics, compliance with pass/fail/unknown badges, clamps, assumptions incl. envelope notes, "indicative" footer). New "Directions" tab in `App.tsx`.
  - Viewer: `proposal` prop replaces `scene.proposal`; the plot's own house (context building whose vertex average lies in the parcel) is hidden while a proposal shows. `ProposalVolume` renders courtyard holes and gable roofs (`roofGeometry` in `viewer/geometry.ts`: triangulated footprint split along the ridge, each vertex lifted by its distance from the ridge). Proposal colour comes from the active option.
  - Browser check (port 5174): option A slab on K 2410, pitched roof and floors slider update metrics and compliance live (10.7 m ≤ 15 m, 55 m² footprint), option C shows its colour plus the courtyard→slab and coverage clamps, no console errors. 143 tests, typecheck, build pass.
- **Decisions:**
  - Option tabs sit in the left column (they collided with the right panel at ~900 px width when centred).
  - Programme is shared by all options; massing params are per option. State is not persisted.
  - Coverage and FAR use the Kadaster registered parcel area (`scene.parcel.areaM2`, 111 m²), not the polygon area.
- **Deviations from SPEC.md:** none.
- **Open issues:**
  - No client unit tests (client has no vitest project); the roof geometry and the store are checked in the browser only.
  - Pitched roof on a courtyard uses one ridge over the whole outer width (shallower than 40°); rendering across a court hole was not inspected.
  - Panels are fixed-width overlays; the viewer is not re-centred, so at narrow widths they cover most of the plot.
  - The browser pane's emulated viewport did not resize the canvas; checked at the pane's own size.
  - Mac check still pending. The user commits everything at the end.
- **Next:** P7 — AI layer, server (M4), Opus 5.5, new session, plan mode. `initialOptions()` in `massingStore.ts` is where P8 will put the strategy generator's A/B/C params.

### 2026-10-06 · P7 — AI layer, server (M4)
- **Built:**
  - Shared: `schemas/ai.ts` (`PrioritiesSchema` + `DEFAULT_PRIORITIES`, `AiErrorSchema`, `AiMetaSchema`, `aiResponse()`, request/result DTOs for the four endpoints, `EXTRACTABLE_PATHS`, `OPTION_IDS`/`OPTION_COLOURS`); `ai/` (`PARAM_RANGES`/`PROGRAMME_RANGES`, `clampToRanges`, `fitProgramme`, `digitErrors`/`hasDigits`, `isVerbatim`, `quoteStatesValue`, `contrastIssues`, `realisedIssues`); `massing/envelopeFacts.ts` (envelope area, frame length × depth per alignment, floors under max height, max footprint by coverage, programme GFA); format helpers now exported.
  - Server: `ai/llm/` (`LlmClient` seam, `AgentSdkClient` + `agentSdkWorker.mjs`, `FakeLlmClient`), `ai/callStructured.ts` (JSON Schema from zod → model → zod + semantic checks → one retry with the errors → typed `AiError`), `ai/prompts.ts` (versioned prompt files with `{{placeholders}}`; missing or unused values throw), `ai/context.ts` (code-made summaries of rules, facts, programme, priorities, ranges), the four calls `constraintInterpreter`, `briefInterpreter`, `strategyGenerator`, `reportWriter` (stub), `ai/aiCache.ts`, `routes/ai.ts` (`GET /api/ai/status`, `POST /api/ai/{interpret-brief,generate-directions,extract-rules,report}`), prompts `server/src/prompts/*.v1.md`, `scripts/record-ai.ts` (`npm run record:ai -w server`).
  - Client: sliders read `PARAM_RANGES`/`PROGRAMME_RANGES`; `massingStore` uses the shared `OPTION_IDS`/`OPTION_COLOURS` (no behaviour change).
  - Tests: 192 pass (was 143). Real answers recorded in `server/src/ai/__fixtures__/` and replayed by `FakeLlmClient`, plus hand-edited bad variants: fabricated quote, number not in its quote, digits in prose, near-identical options, out-of-range depth, options that clamp to the same building, unknown report token. Route tests use a temp cache dir. Typecheck and build pass.
  - Live check through the dev preview (`massing-dev-alt`) on stand-in site K 2410:
    - brief → programme + priorities in 4.7 s
    - directions → 3 options (L-block street / slab sun / courtyard → slab) with generator clamps in 6.5 s
    - rule extraction from a sample Dutch excerpt in 4.5 s → height, gutter height, coverage (50% → 0.5) and function, plus a note on the roof-pitch rule, each with a verbatim quote
    - `CACHE_MODE=offline` replays the cached answer (9 ms); a miss returns 503.
- **Decisions:**
  - **Auth: the user's own Claude login via the Claude Agent SDK** (user decision), not `@anthropic-ai/sdk` + an API key.
    - The bundled Claude Code binary reads `~/.claude/.credentials.json`. `ANTHROPIC_API_KEY` in `.env` takes precedence if set. Empty values are stripped, because an empty key would shadow the login.
    - Personal use only: Anthropic does not allow claude.ai login inside products offered to others. Swapping to the API SDK = one new `LlmClient`.
  - **Each call runs in a child process** (`agentSdkWorker.mjs`, plain JS run with `node`).
    - Importing the SDK inside the server process hung forever under `concurrently` + `tsx watch`, i.e. `npm run dev`, both in the preview pane and in a clean-env terminal.
    - `tsx`, `tsx watch`, `npm run dev -w` and `concurrently` + `tsx` each worked alone. Root cause not found.
    - The worker is unaffected and also keeps the SDK out of server start-up. About 100 ms overhead per call.
  - The worker isolates the model:
    - custom system prompt, `tools: []`
    - `mcpServers: {}` + `strictMcpConfig` + `disableClaudeAiConnectors`; without these the user's claude.ai connectors were loaded
    - `settingSources: []` (no CLAUDE.md), `persistSession: false`, empty temp cwd
    - `maxTurns` 4, because structured output takes a tool round trip
    - effort: brief low, others medium
    - model from `LLM_MODEL` (default `claude-sonnet-5-5`); `meta.model` prefers the requested model, because the SDK's usage map also lists an internal Haiku helper.
  - Numbers come from code, enforced by checks:
    - Model prose (option names, intents, trade-offs, brief summary, notes) may not contain digits.
    - Extracted values must appear in their verbatim quote (percentages as value × 100).
    - Brief programme values must cite a verbatim brief quote.
    - The report writer writes `{{tokens}}` that code fills from computed metrics; digits outside tokens are rejected.
    - Every number in a prompt is injected from `envelopeFacts`, constraints or the programme.
  - Contrast checks:
    - Near-identical params (same typology + alignment, Δfloors ≤ 1, Δcoverage ≤ 0.1, Δdepth ≤ 2 m) → retry, then error.
    - Near-equal massings after clamping (footprint and GFA within 5 %, height within 1 m) → retry with the computed numbers, then returned with `warnings`, because a small plot can force it.
  - Strategy options:
    - Code assigns the colours (A/B/C palette).
    - Code clamps params to the slider ranges ("AI asked for depth 45 m; the input range allows 40 m.") before `generateMassing`. Clamps = range clamps + generator clamps.
    - `generate-directions` takes the constraints *with overrides* plus the parcel ring and area from the client, so the server stays stateless.
  - `extract-rules` returns proposals only (status `extracted`) and never writes the fixture. It reads the body's excerpts, else the active fixture's (placeholder has none → 422). Geometry and street side are never asked for.
  - AI answer cache `data/cache/<SITE_ID>/ai-<call>-<sha1>.json`; key = model + prompt version + request. Readwrite always calls the model and stores; offline only replays. The test answers were deleted from `data/cache/placeholder/`.
  - No prompt caching: the prompts are short and the SDK manages its own.
  - Costs are SDK estimates, billed against the plan, not an API account. Recording reported $0.16–0.30 per call in this Claude session's environment, but $0.01–0.02 per call from the dev server.
- **Deviations from SPEC.md:**
  - Agent SDK + Claude login instead of `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY` (user decision, see above). New dependency `@anthropic-ai/claude-agent-sdk`, which ships a prebuilt per-platform Claude binary through optionalDependencies, like esbuild; `darwin-arm64` is in the lockfile. `zod` is now also listed in the server's dependencies.
  - Prompts live in `server/src/prompts/` (P0 layout), not `server/prompts/`.
  - New `Priorities` schema (5 weights, 0–5) and `typologyHints`; option colours are set by code, not by the model.
  - Jury reviewer not built (optional; a P11 item).
- **Open issues:**
  - The SDK-import hang under `concurrently` + `tsx watch` is worked around, not understood.
  - On the 111 m² stand-in plot every option is small (estUnits 0–4) and courtyards always fall back to slabs. The prompts handle it, but contrast stays limited until P12.
  - Demo day (SPEC §15): the Mac must be logged in to Claude Code (`~/.claude/.credentials.json`) or have `ANTHROPIC_API_KEY` set. Run the AI steps once online before going offline, so the cache has them.
  - `record:ai` re-records all four fixtures and so changes the replay tests' expectations. Rerun `npm test` afterwards.
  - Mac check still pending. The user commits everything at the end.
- **Next:** P8 — AI layer, UI (M4), Sonnet 5.5, continue this session, no plan mode.
  - Parse the endpoints with `aiResponse(...ResultSchema)` from `@massing/shared`.
  - Brief box → `POST /api/ai/interpret-brief`: fills programme, priorities and hints; show `changes`, `unclear` and `clamps`.
  - "Generate directions" → `POST /api/ai/generate-directions` with `useConstraints()` (overrides applied), `scene.parcel`, programme and priorities. Put `options[i].params` into `massingStore` A/B/C (`initialOptions()`); show name, intent, trade-offs, clamps and `warnings`.
  - "Extract rules" on the Constraints screen → `POST /api/ai/extract-rules`; diff against the current values; apply as overrides with status `extracted`.
  - Calls take 5–10 s: loading and error states, sliders stay live. Errors carry `kind` (503 unavailable/offline, 502 invalid output).

### 2026-10-06 · P8 — AI layer, UI (M4)
- **Built:**
  - Shared: `applyExtracted` / `Extracted` / `NO_EXTRACTED` in `constraints/overrides.ts` (+2 tests).
  - Client: `api/ai.ts` (typed calls parsed with `aiResponse(...)`; errors become one readable line, with the server's validation details), `state/aiStore.ts` (brief, priorities, typology hints, and one status per call: interpret, directions, rules; a late answer for a replaced site is dropped), `state/siteStore.ts` (new `extracted` layer under the overrides, `effectiveConstraints()`), `screens/controls.tsx` (Slider moved out of DirectionsScreen), `screens/AiPanels.tsx`.
  - Directions screen: brief box + "Interpret brief" (fills programme, priorities, hints; shows summary, "Set from the brief" with quotes, "Unclear", clamps), priority sliders 0–5, "Generate directions" (fills options A/B/C), warnings, option tabs named after the directions, and a card per option (name, intent, trade-offs, clamps from generation, "Sliders changed since it was generated" notice).
  - Constraints screen: "Extract from plan excerpts" shows a diff (current → proposed, verbatim quote, per-row checkbox, notes) before "Apply selected"; accepted values show a blue `extracted` badge with source and quote; "Discard N extracted" undoes them. Overrides stay on top of extracted values.
  - Tests: 194 pass (was 192), typecheck and build pass.
  - Browser check (port 5174, real Claude calls): brief → 10 units / 50 m², daylight 5, low profile 4; directions A/B/C with names and cards, live compliance and clamps update; extraction → 4 fields + 1 note, applied, and the live compliance then used the extracted gutter height ("max gutter height 10.5 m (extracted) allows 3"). Sliders stayed live during calls.
- **Decisions:**
  - Extracted rules are their own layer (`extracted`), not overrides, so they keep quote and status `extracted`. A user override on the same field wins and the diff says so. Both reset when another parcel loads.
  - Option clamps shown in two places: live (generator, follows the sliders) and "When generated" (includes the range clamps, which the live view cannot see).
  - Extraction always reads the site fixture's excerpts (the UI sends no text).
- **Deviations from SPEC.md:** none.
- **Open issues:**
  - `data/sites/placeholder.json` has no `excerpts`, so "Extract rules" answers 422 ("No plan excerpts…") on the placeholder site. I tested with the fictitious sample text temporarily added, then removed it, so extracted values never make fictitious text look like real rules. Real excerpts arrive at P12. To demo it before then, paste the text from `server/src/ai/__fixtures__/samples.ts` into the fixture and delete it afterwards.
  - The watermark is driven by `assumed` only, so once real rules are extracted the PLACEHOLDER badge can disappear even for unreviewed `extracted` values (existing rule: the badge goes when nothing is `assumed`).
  - Edits to the stores during `npm run dev` crash the page until a reload (HMR), as before.
  - Extracted values and AI results are not persisted: a page reload loses them (the server replays answers from its cache only offline).
  - No client unit tests (no client vitest project); checked in the browser.
  - Mac check still pending. The user commits everything at the end.
- **Next:** P9 — Present + PNG export (M5), Opus 5.5, new session, plan mode. Before that, run the review prompt (R) for M4 per SPEC §14.

### 2026-10-06 · P9 — Present + PNG export (M5)
- **Built:**
  - Present tab (`client/src/screens/PresentScreen.tsx`) with these controls:
    - the option shown
    - camera presets NE/SE/SW/NW axo, Top (north up), Eye level
    - Save view / Restore saved view (one per parcel, kept in `localStorage`)
    - Axonometric ↔ Perspective, keeping the framing
    - sun date + local time (Europe/Amsterdam, DST-aware) and shadow softness
    - AO toggle, outline weight, proposal colour (edits the active option's colour), context white/grey
    - toggles for street labels, annotations and the envelope ghost
    - aspect 4:5 / 1:1 / A3 landscape, resolution 1×/2×/4× with the pixel size shown, Export PNG with status
  - `presentStore` holds the editable `RenderStyle`; every screen renders with it.
  - `Viewer` was split into:
    - `SceneContents`, shared by the on-screen viewer and the export
    - `CameraRig`: ortho + perspective cameras, OrbitControls, and a `cameraHandle` used by presets, saved views and export
    - `LabelOverlay`
  - Pure, tested modules in `client/src/present/`:
    - `frame.ts`: design frames, export size, fit
    - `camera.ts`: View, presets, focus, `convertView`
    - `labels.ts`: street name parse, street label placement, overlay model with every number formatted from computed metrics
  - Canvas2D modules: `drawOverlay.ts` (leaders, tag boxes, street text, caption, watermark, collision avoidance), `viewer/ExportCanvas.tsx` (offscreen export).
  - `shared/src/geo/time.ts`: `zonedIso` / `isoParts`.
  - New dependency `@fontsource/ibm-plex-mono` 5.3.0 (font files only).
  - `client` is now a vitest project.
  - Tests: 219 pass (was 194). Typecheck and build pass.
  - Browser check (`massing-dev-3`, port 5183):
    - every preset, projection switch, save → reload → restore, sun time and grey context work
    - 61 fps in Directions and in Present
    - exports: 4:5 2× = 1920×2400 px (0.4 s, 3.5–4.6 MB); A3 4× = 5656×4000 px (3.5 s, 20.2 MB)
    - the exported PNGs match the preview framing, labels and watermark
- **Decisions:**
  - **Design frame = WYSIWYG.**
    - Each aspect has a fixed CSS size: 960×1200, 1080×1080, 1414×1000.
    - In Present the same viewer element is laid out at that size and scaled with a CSS transform. Canvas `resize={{ offsetSize: true }}` measures the unscaled size.
    - The on-screen dpr is set to about screen density × scale, so preview cost stays low.
    - Export = the same CSS size at `dpr = multiplier`. Outline and label sizes (CSS px) therefore keep their relation to the frame at every resolution.
  - **Offscreen export = a second, hidden R3F Canvas.**
    - Settings: `frameloop="never"`, `dpr = m`, `preserveDrawingBuffer`.
    - It has the same `SceneContents` and a fixed camera copied from the on-screen view.
    - It renders twice via `advance()`, draws onto a 2D canvas plus the label layer, then `toBlob` → download. Unmounting frees the WebGL context.
    - Reusing the component tree keeps lighting, N8AO and outlines identical without a second, hand-built pipeline.
    - It waits with `setTimeout`, not `requestAnimationFrame`, so an export also works in a background tab.
    - If the browser silently clamps the drawing buffer, the export stops with a readable error.
  - **Labels = screen-projected anchors on a 2D canvas**, not drei `Text`.
    - troika fetches its font from a CDN (breaks offline).
    - In-scene text would get AO and shadows.
    - One `drawOverlay` draws the on-screen layer (every frame, in `useFrame`) and the export composite (× multiplier).
    - Each leader picks the most top/bottom/left anchor on screen, so it starts at a visible corner. It is lengthened until it clears earlier labels.
    - Street names slide along the street to clear the proposal's screen bounds. There is no occlusion test otherwise; the references also draw labels over the model.
  - Label content: proposal tag (option + AI name) + floors · height · GFA; parcel id · area, "indicative boundary"; envelope max height + source/status; street; caption with address + "Indicative early study · not a permit check". The model contributes only the option name.
  - Watermark: diagonal "PLACEHOLDER DATA" + a corner tag "planning values assumed", in the preview and in every export, while `usePlaceholder()` is true.
  - Eye level is always perspective, 1.6 m high, `parcelRadius + 26 m` out along the street bearing (south if unknown). Perspective allows looking up to 0.2 rad above the horizontal; ortho stays above the horizon.
  - Presets fit a radius of max(40 m, 3 × parcel radius, 1.2 × proposal height).
- **Deviations from SPEC.md:**
  - The street label covers only the plot's own street, using the address name and the `streetSide` edge. There is no road data until P11. No label when the street side is unknown (the panel says so).
  - Scale figures, trees and the hatched context are in the panel but disabled ("P11").
  - The export is a second WebGL canvas at full resolution, not a hand-made `WebGLRenderer`. It is still offscreen and at target resolution, as §10 asks.
  - `RenderStyle.context` is now `{ style: "white" | "grey" }` (colours in `CONTEXT_STYLES`). New `RenderStyle.labels`.
- **Exported PNG vs references:**
  - Matches: white matte context, soft long shadows, one saturated proposal with a crisp black outline, dashed envelope ghost, monospace leader labels with a black tag box, street name along the street (ref-02 style).
  - Differs:
    - no asphalt roads, dashed centrelines, trees, scale figures or hatching (P11)
    - shadows are softer and blurrier than the refs' crisp edges: PCF radius 6 on a 4096 map over a ~1 km frustum. Tightening the shadow frustum to the frame would sharpen them.
    - the 09:30 default sun leaves much of the ground in shadow from the SE/SW presets; 15–16 h reads closer to ref-01
    - context has no edge lines (P2 decision)
    - IBM Plex Mono is cleaner than ref-02's typewriter mono
    - the stand-in plot is a 7 m terraced lot, so the proposal is small in the frame compared with the refs
- **Open issues:**
  - Saved views are per browser (`localStorage`), not in the project files.
  - The browser pane's screenshots lag one action behind the page; take two when verifying.
  - Editing store or camera modules during `npm run dev` resets the stores (HMR, as before); reload the page.
  - Ports 5173/5174/5175–5177 were held by other processes, so `.claude/launch.json` gained `massing-dev-3` (client 5183, server 8797).
  - Label collision avoidance is greedy (in label order); with many labels (P11 roads) it may need a proper placer.
  - Mac check still pending. The user commits everything at the end.
- **Next:** P10 — PDF report (M5), Sonnet 5.5, continue this session, no plan mode.
  - Reuse the export path for renders: set a `presentStore.job` (view from `presetView` or `cameraHandle().capture()`), or factor out of `ExportCanvas` a promise API that returns the blob instead of downloading.
  - The report writer is `POST /api/ai/report` (P7). Fill its tokens from `MassingResult.metrics`.
  - Put the watermark on every page when `usePlaceholder()`.

### 2026-10-06 · P10 — PDF report (M5)
- **Built:**
  - "Export PDF report" on the Present screen, with a "Write narrative with AI" toggle (enabled once directions exist). An A4 PDF is downloaded, in this order: cover, site, constraints, one page per option, comparison, assumptions, limitations.
    - Cover: render, address, date, "indicative early study" disclaimer.
    - Site: parcel id, area, street side with compass name, context count, data sources.
    - Constraints: table of rule, value, status, source and quote, plus the envelope source and the unknowns.
    - Option page: render, intent, metrics, compliance, clamps, trade-offs.
    - Comparison table across options.
  - `client/src/report/`:
    - `model.ts`: `buildReportModel`, pure. Every number is formatted from computed metrics with the shared `fmtM`/`fmtM2`/`fmtRatio`.
    - `pdf.ts`: `buildPdf` with pdf-lib, standard fonts, and a small layout engine (wrapped text, tables with a repeated header, page breaks). Characters the fonts cannot encode are mapped to ASCII or `?`.
    - `generate.ts`: `generateReport` orchestrates renders, narrative, PDF and download.
  - The render path now has a promise API: `presentStore.renderForReport(option, view, aspect, multiplier)` returns a JPEG blob from the hidden export canvas. `App` builds the overlay and volumes for the job's option, so each option renders with its own labels and colour. `computeMassing(id)` in `massingStore` is the non-hook twin of `useMassing`.
  - `api/ai.ts` gained `writeReport`.
  - New dependency `pdf-lib` 1.17.1 (pure JS, no native binaries).
  - Tests: 227 pass (was 219): model values, unknown handling, comparison shape, PDF page count and title, unencodable characters. Typecheck and build pass.
  - Browser check (port 5183):
    - without narrative: 7 pages, 1.1 MB, 2.2 s
    - with narrative on a live Claude call (after "Generate directions"): 11 pages, 13.7 s, narrative numbers filled in by code
    - PDF pages inspected rendered with pdf.js: cover, constraints table, option page, comparison
- **Decisions:**
  - Renders are JPEG (0.9): the first PNG attempt would have made a ~15 MB PDF. Option renders are 1:1 at 1× (1080 px), the cover is 4:5 at 2×.
  - Each option is shown from the SE axonometric preset fitted to its own massing, in the current Present render style (sun, AO, context colour).
  - Narrative is optional. If it fails (offline, no login, no directions yet), the PDF is still produced and the panel says why. The narrative is the P7 report writer: tokens only, digits outside tokens rejected, so no number in the PDF comes from model text.
  - The watermark is on every page (diagonal text + footer line) while `isPlaceholder`; the renders carry their own too.
  - The report reads the current stores (overrides, extracted rules, sliders), not the cached AI-generated values, so it matches what the user sees.
- **Deviations from SPEC.md:**
  - §11 item 4 jury critique and item 6 finance block are not built (both optional, P11). Jury and finance are simply absent from the PDF.
  - Standard PDF fonts (Helvetica, Courier): no extra font files, but only Latin-1 text.
- **Open issues:**
  - Option pages show "Option A" as the name until directions are generated.
  - The watermark appears twice on pages with a render (page overlay + the image's own); both are intended, the page one is faint.
  - The report waits for the viewer to be mounted; start it from the Present tab.
  - Mac check still pending. The user commits everything at the end.
- **Next:** P11 — Polish item (M6), Sonnet 5.5, new session, one item per run. Suggested first: roads + street labels (BGT or OSM), the biggest remaining gap to the references.

### 2026-10-11 · Hosting for the team
- **Built:** production mode in the server: serves `client/dist` (SPA fallback), `HOST`/`PORT` env, optional `ACCESS_PASSWORD` (HTTP Basic, `/api/health` exempt), `AI_HOURLY_LIMIT` cap on `/api/ai` POSTs. `npm start`, `Dockerfile`, `.dockerignore`, `render.yaml`, `DEPLOY.md`, `.env.example` entries. Tests 229 pass, typecheck and build pass; smoke-tested locally with the password on.
- **Decisions:** one service (not split static + API) so there is no CORS and no client change. Hosted LLM needs `ANTHROPIC_API_KEY` (the Agent SDK's local Claude login does not exist on a host and is for personal use only).
- **Open issues:** not yet deployed (needs the user's GitHub push and Render account). Docker build not run locally. `ANTHROPIC_API_KEY` with the Agent SDK on Linux is untested; check "Generate directions" after the first deploy.
- **Next:** push, deploy via Render Blueprint, test AI buttons on the live URL.

### 2026-10-16 · UI-1 — Landing screen: grid system + dotted globe (country step)
- **Branch:** `ui/landing-globe` (local only; not pushed, not merged). Render deploys `render.yaml` as a Blueprint; the yaml has no `branch:`/`autoDeploy:`, so Render follows the branch chosen at Blueprint creation (`master`, the repo default) and redeploys on every push to it. render.yaml, Dockerfile and DEPLOY.md untouched.
- **Built:**
  - `client/src/Root.tsx`: landing by default, the existing studio at `#studio` (lazy-loaded, so the landing does not download three.js). `main.tsx` renders `Root`; `App.tsx` unchanged.
  - `client/src/landing/`:
    - `tokens.ts`: the six colour tokens (Figma variables + GRID_LINE_COLOR), written as CSS custom properties on `.landing`.
    - `landing.css`: @font-face and type styles.
    - `grid.ts`: `computeGrid`, `snapOrigin`, `lineX/lineY`, `boxStyle`, `landingLayout`. `useGrid.ts` (ResizeObserver + dpr media query). `GridLines.tsx` (background and overlay).
    - `Landing.tsx`, `CountryInput.tsx` (ghost completion, Tab / → accepts), `GridToggle.tsx` (button + "G" key), `landingStore.ts` (step machine country → city → address → plot; globe phase).
    - `countries/`: `matcher.ts` (normalise, OSA edit distance, exact → alias → unique prefix → typo ≤ 2 for inputs ≥ 4 chars), `aliases.ts`, `index.ts` (world-atlas features grouped by ISO numeric id + i18n-iso-countries en/nl/pl names).
    - `world.ts`: loads `world-atlas/countries-50m.json` as a bundled asset (`?url`, works offline).
    - `globe/`: `globeStyle.ts` (all look/motion parameters), `geo.ts` (main polygon, centroid, fit scale, view interpolation), `pieces.ts` (fast orthographic tracing), `GlobeRenderer.ts` (canvas, spin, transitions, visibility pause, reduced motion), `Globe.tsx`.
  - Assets: `landing/assets/arrow.svg` (Figma node 18:75, unchanged), `docs/references/ui/figma-1-2-page.png` (reference screenshot), `client/public/fonts/` (empty, for the font files).
  - New client deps (pure JS): `d3-geo`, `d3-ease`, `topojson-client`, `world-atlas`, `i18n-iso-countries`; dev `@types/d3-geo`, `@types/d3-ease`, `@types/topojson-client`.
  - Tests: 251 pass (was 229): grid math at 6 viewports × dpr 1/1.25/1.5/2 (every box border pixel = a grid-line pixel, shared lines, snapped targets, small-viewport rule), matcher (en/nl/pl exact, diacritics, aliases, prefix, ambiguous prefix, typos, nonsense, ghost text), France centroid on the mainland, 50 % fit. Typecheck and build pass.
  - Browser check (Chromium pane, dpr 1): 1440×928, 1920×1080, 1366×768 and 1001×600 (scrolling) with the overlay on: all six boxes on grid-line pixels, no misses. 1440×928 boxes equal the snapped targets (window 480,160 481×609; field 608,704; button 800,704). Ghost "neder" → "land", Tab, Enter → Netherlands; "Frnace" → France (mainland centre); "Atlantis" → `No match for "Atlantis"`, focus kept, spin continues; logo → reverse transition, spin resumes; reduced motion → no spin, instant transitions. `#studio` still loads the scene and viewer.
- **Font:** ABC Areal Superfamily Variable axes `MONO` 0–100, `wght` 400–700, `slnt` −12–0, `DRKM` 0–1 (read from the installed TTF's fvar with a dependency-free parser). Figma "Regular" = `"MONO" 0, "wght" 400`; "Semi Mono Regular" = `"MONO" 50, "wght" 400`. Expected files: `client/public/fonts/ABCArealSuperfamilyVariable.woff2` and/or `.ttf`. Until then `local("ABC Areal Superfamily Variable Regular")` picks up the installed copy on this PC (the family name alone does not match in Chrome; the full or PostScript name does), then the fallback stack.
- **Decisions:**
  - Fonts in `client/public/fonts/`, not `src/assets/fonts/`: a missing file under `src/assets` breaks `vite build`; under `public/` it is a 404 and the next `src` is used.
  - Grid lines are zero-width divs with a 1 px border, so Chrome snaps them exactly like the box borders on them (also at fractional dpr). The origin is nudged down ≤ 7 px to a whole device pixel when a cell is whole device pixels (dpr 1.25/1.5/1.75/2…).
  - Globe on a 2D canvas with d3-geo maths, not three.js. The first version drew through d3's projection stream and took **~130 ms a frame** with 50m data (≈ 360 ns per point in `projection(point)`, ~30 µs per polygon for spherical clipping, and Chromium path cost growing faster than linearly with subpath count). `pieces.ts` now keeps every polygon/line as unit vectors with a bounding cap: pieces out of view are culled, points are projected with a hand-written orthographic basis (same result as `geoOrthographic().rotate([−λ, −φ])`), fills pin back-side points onto the limb, strokes are cut at the horizon, polygons reaching within 20° of the antipode fall back to d3's exact clipping, and fills/strokes go in batches of 16 subpaths. Result: **4 ms median, 6 ms p95 per frame**, 60 fps on full 50m. No 110m fallback needed.
  - Halftone: two pre-rendered dot layers (Stroke, Blue) per size/origin change; per frame a land mask on an offscreen canvas is composited `source-in` with the dot layer. Dot centres at the middle of the 8 px sub-cells (`ox + ½ + 4 + 8k`, odd rows +4), page-anchored.
  - Idle view centre 10°E / 30°N, spinning westward (as seen from space). Zoom fit 50 % of the band on the main polygon's tighter axis, clamped to 1–60× the idle radius (micro-states stay below 50 %).
  - The selected country stays blue during the reverse transition and is dropped when the globe is back.
  - The input has no focus ring (caret only), to match Figma; the toggle's active state is Blue fill with a Blue border.
- **Deviations from the UI-1 prompt (snapping):**
  - Scroll threshold is **M < 23**, not M < 21: the window (row ≥ 3, 19 rows) needs line 22 plus one free row, so with M = 21 or 22 it would touch or cross the last line. Below that the page becomes `32·23 + 1` px tall and scrolls.
  - Everything else is exactly the section 5 targets; nothing re-derived from raw Figma pixels.
- **Deviations from SPEC.md:** none (landing screen is new UI ahead of SPEC §9 screen 1; the studio flow is unchanged at `#studio`).
- **Open issues:**
  - Pre-existing, not caused by this change: under `npm run dev` started from the preview pane, the server's `tsx watch` child never starts listening (proxy → ECONNREFUSED / 502). `tsx watch` alone and `tsx` alone both start fine; server code and server deps are unchanged on this branch (lockfile diff = additions for the client only). Same family as the P7 `concurrently` + `tsx watch` hang. The `#studio` check used a standalone `npx tsx src/index.ts`.
  - Fractional dpr (Windows 125 %) is covered by unit tests only; the pane runs at dpr 1.
  - The visibility pause (hidden tab) is implemented but not exercised in the pane.
  - Licence: ABC Areal is a commercial Dinamo font. Committing it to the private repo and especially serving it from Render may need a web licence. `client/public/fonts/` is not git-ignored; decide before committing font files.
  - Landing JS chunk 304 kB (i18n-iso-countries en/nl/pl), map data 756 kB (243 kB gzip) loaded after first paint.
  - Nothing committed or pushed; the user commits at the end.
- **Next:** UI-2 — city step (geocode within the selected country, zoom to the city, then address → plot), continue on `ui/landing-globe`.

### 2026-10-16 · UI-1b — Globe halftone fixed to the land, in perspective
- **Built** (user feedback on UI-1: the dots must stay on the territory and be seen in perspective, like a dotted-globe reference image; choices made from side-by-side comparisons in the browser):
  - `globe/lattice.ts`: dot lattice fixed to the sphere in nested levels (level k ⊇ level k − 1, rows every Δ0 / 2^k). Mode `even` (chosen): rows along latitudes, dots evenly spaced on the ground, staggered. Mode `latlon` (plain grid, crowds at the poles) kept as a style option. Canonical keys so a dot has the same id at every level.
  - `globe/countryIndex.ts`: point → country by planar ray cast on the 50m polygons, edges bucketed in 0.1° latitude strips (~2 µs per lookup). Antimeridian rings (Russia, Fiji, Antarctica) are unwrapped, rings around a pole are closed along it, queries test lon − 360 / lon / lon + 360.
  - `globe/dots.ts` (`DotLayer`): whole dots (in or out by their centre, each with its country, cached), drawn as the orthographic image of a small disc (an ellipse squashed by cos θ towards the limb; plain circles where the squash is under 10 %). Zoom levels cross-fade: the next level's new dots fade in over the second half of each level, so the on-screen spacing stays between 1× and 2× `spacingPx`. Lookups capped at 1 500 per frame; leftovers are drawn in following frames.
  - `GlobeRenderer`: white sphere, dots, coastlines always (110m on the whole globe, 50m from zoom level 1–2), country borders fade in with the zoom, islands/lakes under 6 px across get no outline, selected country = blue dots + blue outline. The land mask, the screen-space dot layers and `fillPieces` are gone; `pieces.ts` keeps only the line drawing.
  - `world.ts` also loads `countries-110m` (bundled, 108 kB).
  - Tests: 262 pass (was 251): country index (cities, seas, Caspian, Chukotka on both sides of 180°, Antarctica, French Guiana), lattice nesting, key uniqueness (incl. the default density at the finest level), cap filtering, even ground spacing. Typecheck and build pass.
- **Final look (user choices):** lattice `even`; density D = 4 px spacing / 0.75 px dots at the idle radius (`baseDeg` 180/138, eight dots per grid cell); dots in Stroke; sphere fill pure White (land and water; it was Background #F8F8F8); idle globe shows coastlines only, borders appear when zooming to a country.
- **Performance** (Chromium pane, dpr 1): idle spin 5 ms median / 7 ms p95 per frame; flights to France / Netherlands / Brazil / Monaco 6–11 ms median, p95 11–18 ms, every dot resolved when the 1.8 s flight ends; 7–10 k dots in a country view.
- **Decisions:**
  - The halftone is no longer anchored to the page grid (UI-1 §6 asked for page-anchored, screen-space dots): the user's new direction supersedes it. The idle spacing is still tied to the grid (4 px = 8 dots per 32 px cell at the 176 px globe radius).
  - Dots in zoomed views keep a constant screen size (0.75 px radius); only the spacing breathes between levels.
  - Coastline simplification by data level (110m vs 50m) plus a minimum loop size, not by a simplification library (no new dependency).
- **Deviations from SPEC.md:** none.
- **Open issues:**
  - Dots are whole-dot samples, so islands smaller than the dot spacing get no dots (they keep an outline once larger than 6 px).
  - The selected country's blue outline switches on at the start of the flight (not faded).
  - Long flights (e.g. Europe → Brazil) have p95 frames up to ~18 ms because of first-time lookups; acceptable, could be pre-warmed for the target view.
  - The `npm run dev` server start-up hang is being handled in a separate session (fix-api-server-hang).
  - Nothing committed or pushed; the user commits at the end.
- **Next:** UI-2 — city step.

### 2026-10-16 · UI-1c — Grid size comparison (32 / 24 / 16 px)
- **Built:** the cell size is a layout parameter. `grid.ts` now has `LAYOUTS[32 | 24 | 16]` (hand-snapped per grid), `minRowsFor(spec)`, and `computeGrid`/`snapOrigin`/`lineX`/`boxStyle` use `grid.cell`. `useGrid(minRows, cell)`. The landing picks the layout from `?grid=24` / `?grid=16` (default 32), for comparing; nothing else changes.
  - 16 px: identical px layout to 32 (every 32 px edge is on a 16 px line); logo 8×4 cells, toggle 2×2 cells.
  - 24 px: window 20×25 cells = 480×600, globe 14 cells = 336 px (3-cell inset), hook one cell under the globe, divider at 504, field 9 cells = 216×24 + 24×24 button (an odd field width keeps the pair centred in 20 columns), logo 5×3 cells = 120×72.
  - Tests: 263 pass (border-on-line checks now run for all three grids; 16 px equals the 32 px boxes; 24 px window 480 wide and field+button centred). Build passes.
- **Open issues:** no decision yet on the grid size; the `?grid=` switch is a comparison aid and can be removed once one is chosen. Nothing committed.

### 2026-10-16 · UI-1d — 24 px grid is the default
- **Built:** `CELL = 24`; `grid.ts` keeps a single `LAYOUT` (the 24 px variant from UI-1c); the 32/16 variants and the `?grid=` URL switch are removed. `LANDING_MIN_ROWS` = 4 + 25 + 1 = 30 rows (720 px; below that the page scrolls).
  - At 1440×928 (60×38 cells, 8 px top margin): logo 24,32 120×72; toggle 1392,32 24×24; window 480,152 480×600; globe 552,224 336×336 (idle radius 168 px); hook title top 584; divider 656; field 600,704 216×24; button 816,704 24×24.
  - Tests: 262 pass (grid tests rewritten for 24 px: reference boxes, centring, border pixels on lines at 6 viewports × dpr 1/1.25/1.5/2). Typecheck and build pass.
  - Browser (Chromium pane): 1440×928, 1920×1080, 1366×768 with the overlay on: every box border on a grid line, no misses. Country step works (ghost, submit, flight to Poland).
- **Deviations from the UI-1 prompt:** the prompt's 32 px cell and §5 targets are replaced by the 24 px snapping (user decision after the 32/24/16 comparison). Field and button are 24 px tall (Figma: 32), field 216 wide (Figma: 192) so field + button stay centred.
- **Open issues:** dot spacing is still 4 px at a 176 px reference radius (`baseDeg` 180/138); with the 168 px idle globe it is ~3.8 px. Nothing committed.

### 2026-10-16 · UI-1e — Back to the 32 px grid
- **Built:** `CELL = 32` and `LAYOUT` = the original UI-1 §5 snapping (window 15×19 cells = 480×608, globe 352, field 192×32 + 32 px button, logo 128×64, toggle 32×32). `LANDING_MIN_ROWS` = 23. The 24 px layout from UI-1d is removed; the single-layout structure (`LAYOUT`, `LayoutSpec`, cell on `Grid`) stays, so trying another cell size is one constant and one layout table.
- **Checks:** 262 tests pass (grid tests back to the 32 px targets); build passes; browser at 1440×928: logo 32,32 128×64, window 480,160 480×608, field 608,704, button 800,704, every border on a grid line.
- **Supersedes:** UI-1d (24 px default) and the UI-1c `?grid=` comparison switch. Dot spacing is 4 px again at the 176 px idle radius (eight dots per 32 px cell).
- **Open issues:** nothing committed.

### 2026-10-16 · UI-1f — Edge strips without their own grid lines
- **Built:** `EDGE_CELLS = 1` and `drawnLines(g)` in `grid.ts`. The outermost lines (cols 0 and N, rows 0 and M) are no longer drawn, in the background grid or in the overlay. The one-cell strips along the top, bottom, left and right edges (plus the leftover centring margin) therefore show only the extensions of the other lines running out to the page edge; the corners stay empty.
- **Checks:** layout unchanged (no box uses an outermost line: logo starts on line 1, toggle ends on line N − 1, the window stays between rows 3 and M − 1). 263 tests pass; the border-on-line test now checks against the drawn lines only, at 6 viewports × dpr 1/1.25/1.5/2. Build passes. Browser at 1440×928: lines from x 32 to 1408 and y 32 to 896, every box border on a drawn line.
- **Open issues:** nothing committed.

### 2026-10-16 · UI-1g — Two-cell edge strips
- **Built:** `EDGE_CELLS = 2`: lines 0, 1, N − 1, N (and rows 0, 1, M − 1, M) are not drawn, so the edge strips are two cells (64 px) plus the centring margin, with only line extensions in them. The logo moved from cell (1, 1) to (2, 2) and the grid toggle mirrors it (two cells in from the right), so both stay on drawn lines. Window `minRow` 3 → 4 (logo bottom line) and `LANDING_MIN_ROWS` = minRow + 19 + EDGE_CELLS = 25 (800 px; below that the page scrolls).
- **At 1440×928:** lines from x 64 to 1376 and y 64 to 864; logo 64,64 128×64; toggle 1344,64; window unchanged at 480,160 480×608; every box border on a drawn line (browser check).
- **Checks:** 263 tests pass, build passes.
- **Open issues:** nothing committed.

### 2026-10-16 · UI-1h — One-cell edges again; landing drawn at 110 %
- **Built:**
  - `EDGE_CELLS` back to 1, logo back at cell (1, 1), toggle one cell in from the right, window `minRow` 3, `LANDING_MIN_ROWS` 23 (UI-1g reverted).
  - `UI_SCALE = 1.1` in `grid.ts`: the `.landing` root has CSS `zoom: 1.1` (what browser zoom 110 % does, which the user found better proportioned). `useGrid` computes the grid for a viewport of `clientWidth / 1.1 × innerHeight / 1.1` px and `dpr × 1.1`, so the zoomed root fills the viewport exactly and the globe canvas backing store matches its on-screen pixels (1440×928: canvas 527×562 device px for 479×511 px).
  - Test: `computeGrid` on the fractional 110 % viewport (1440×928 → 1309.1×843.6 px, 40×26 cells, origin 14,5, integer box positions).
- **Checks:** 264 tests pass, build passes. Browser at 1440×928: zoom 1.1, no scrollbars, logo 142×72 on screen, every box border within half a pixel of its grid line (both are borders, snapped the same way).
- **Notes:**
  - A cell is 35.2 device px at dpr 1 (70.4 at dpr 2), never a whole number, so the grid line spacing alternates 35/36 device px, as with browser zoom 110 %. The `snapOrigin` device-pixel nudge therefore never applies.
  - With 40 columns (1440 wide) the 15-column window cannot be centred exactly (floor((N − 15)/2) rule): it sits half a cell left of centre. At 1920 wide (54 columns) it is off by half a cell as well; widths giving an odd N centre exactly.
  - The studio (`#studio`) is not zoomed.
- **Open issues:** nothing committed.

### 2026-10-16 · UI-1i — UI scale fitted to the viewport (max 110 %)
- **Why:** the fixed 110 % from UI-1h made the layout taller than the user's window, so the page scrolled. The intent was the 110 % proportions, not a bigger page.
- **Built:** `grid.ts`: `UI_SCALE_MAX = 1.1`, `UI_SCALE_MIN = 0.75`, `LANDING_MIN_COLS` (15 + 2 edge cells), `uiScale(vw, vh)` = the largest scale ≤ 1.1 at which `LANDING_MIN_ROWS` × `LANDING_MIN_COLS` cells fit the viewport, and `scaledGrid(vw, vh, dpr)` (grid in the landing's own px at that scale; `Grid.scale` added). `useGrid()` uses it; the `.landing` root's CSS zoom is `grid.scale`. Below 75 % the page scrolls as before instead of shrinking further.
- **Checks:** 266 tests pass (scale values; a sweep of heights 560–1400 px × 6 widths: page exactly the viewport, window inside the grid). Build passes. Browser: 1440×928 → 110 %, 1440×790 → 107 %, 1366×650 → 88 %, no scrollbars, every box border on its grid line.
- **Note:** with browser zoom also set to 110 %, the two multiply on screens with room for it; at 100 % browser zoom the landing now looks like the 110 % the user liked.
- **Open issues:** nothing committed.

### 2026-10-16 · UI-1j — UI zoom removed: cells are 32 px on screen again
- **Built:** removed the CSS zoom and its machinery (`UI_SCALE_MAX/MIN`, `uiScale`, `scaledGrid`, `LANDING_MIN_COLS`, `Grid.scale`); `useGrid(LANDING_MIN_ROWS)` measures the real viewport again. Supersedes UI-1h/UI-1i. Edge strips stay at one cell (UI-1f).
- **Checks:** 263 tests pass, build passes. Browser at 1440×928: zoom 1, every grid line exactly 32 px apart, logo 32,32 128×64, window 480,160 480×608, every box border on a grid line pixel, no scrollbars.
- **Open:** the user preferred the proportions at browser zoom 110 %. A version that keeps true 32 px cells would enlarge the content within the grid (type sizes, globe, window spanning more cells) instead of zooming; not built.
- Nothing committed.

### 2026-10-16 · UI-1k — Logo and grid toggle one cell further in
- **Built:** logo at cell (2, 2) → 64,64 128×64 at 1440×928; the grid toggle mirrors it two cells in from the right (1344,64 32×32). Edge strips unchanged (one cell, EDGE_CELLS = 1). Window `minRow` 3 → 4 (the logo's bottom line), so `LANDING_MIN_ROWS` = 24 (768 px; below that the page scrolls); at 1440×928 the window is unchanged at 480,160.
- **Checks:** 263 tests pass, build passes; browser at 1440×928: every box border on a grid line.
- Nothing committed.

### 2026-10-16 · UI-1l — Label 8 px above the field
- **Built:** `LABEL_GAP` 7 → 8 in `CountryInput.tsx`: the label's 12 px line box ends 8 px above the field's top border (1440×928: label 684–696, field top 704). Applies to "Where on earth?", "No match for …" and "Which city?".
- **Checks:** browser measurement gap = 8 px; 263 tests pass, build passes. Nothing committed.

### 2026-10-16 · UI-1m — Label 4 px above the field
- **Built:** `LABEL_GAP` = 4 in `CountryInput.tsx` (UI-1l had 8, briefly 2): the label's 12 px line box ends 4 px above the field's top border (1440×928: label 688–700, field top 704).
- **Checks:** browser measurement gap = 4 px; 263 tests pass, build passes. Nothing committed.

### 2026-10-16 · UI-1n — Other countries solid-filled in the country view
- **Built:** in the country view the countries other than the selected one get a solid fill (`otherFill` = Background #F8F8F8) instead of dots; the selected country keeps its blue dots on white, and the sea stays white. Fill fades in (and the other countries' dots fade out) over zoom levels `fillFade` [0.5, 2], so the idle globe is unchanged and the flight cross-fades. `pieces.ts`: `fillPieces` (culled, batched, limb-pinned; pieces within 20° of the view's antipode are skipped). `DotLayer.draw(..., otherAlpha)`. The selected country drops out of the fill, so the reverse flight keeps it blue until the globe is back.
- **Checks:** 263 tests pass, build passes. Browser: Netherlands view = grey neighbours with borders, white sea, blue dotted NL.
- **Open issues:** frame times in the Netherlands view are higher (median ~12 ms, p95 ~24 ms) because the dots of all countries are still looked up before being faded out; could skip them once fill is complete. Nothing committed.

### 2026-10-16 · UI-1o — White inner blur on the zoomed map frame
- **Built:** when zoomed into a country, the top window's map frame gets a white gradient along all four inner edges (56 px deep, quadratic falloff, fully white at the edge), fading in over zoom levels 0.5–2 with the flight (`vignetteWidth`, `vignetteFade` in `globeStyle`). Drawn last in `GlobeRenderer.vignette`; idle globe unaffected.
- **Checks:** 263 tests pass, build passes; browser: Netherlands view shows the edges softening to white. Nothing committed.

### 2026-10-16 · UI-1p — No clipping during the flight; smoother zoom
- **Built:** the map is clipped only to the whole top band (`full`), never to the globe's own square, so the globe no longer gets cut off while it grows (`idleView.clip = full`; the old frame-expansion interpolation is gone, the band was white anyway). `viewInterpolator` now takes linear time and eases rotation and zoom separately (cubic in/out each, 25 % stagger): zooming in turns first and zooms later, zooming out zooms first and turns later, so the large globe never swings sideways.
- **Checks:** 263 tests pass, build passes; browser frames at 0.45/0.7/1.0 s of the Netherlands flight show a complete globe turning, then growing past its old square. Nothing committed.

### 2026-10-16 · UI-1q — Dots prepared before the flight; slower, staggered zoom
- **Built:** `GlobeRenderer.flyTo`: before a flight (country and back) the globe holds still while `DotLayer.warm` looks up and caches every dot along the flight path (40 sampled views, at the lattice level each frame there will draw), in 8 ms time slices, capped at 900 ms (`WARM_MAX_MS`); then the flight starts, so the zoom no longer pops dots in. Flight is 2.6 s (`transitionMs`, hook fade matched) with `STAGGER` 0.4: the zoomed-out globe turns for longer before the zoom starts. `drawLevel` shared between draw and warm.
- **Measured (Chromium pane):** hold before the flight ~0.5–0.6 s on a cold cache for the Netherlands, 50–130 ms warm; Russia/Brazil 50–120 ms. Frames with dots still missing during a flight: 0 (Russia, Brazil), ~6 of ~150 (Netherlands, near the end of the zoom). Frame p95 up to ~25 ms mid-flight in the Netherlands (≈ 270 k lattice points iterated per frame at the finest levels), 8 ms for large countries.
- **Open:** the mid-zoom frames of small countries still iterate a lot of lattice points; a per-level land-dot cache (list of land dots per region) would remove it. Nothing committed.

### 2026-10-16 · UI-1r — Country sequence: pan, blue, rapid zoom
- **Built (replaces UI-1q's hold-then-fly):** `GlobeRenderer` runs staged sequences. Country chosen → (1) **pan** 1.5 s: the idle-sized globe turns to face the country, which is still grey; (2) **blue** 0.45 s: the country's dots and outline fade to blue; (3) wait (up to 0.8 s, normally 0) until all dots of the zoom are cached; (4) **rapid zoom** 0.8 s straight in (quartic ease in/out), no further turning. All dot lookups for the 40 sampled zoom views happen in 6 ms slices during the pan and blue stages, 10 ms while waiting. Back: zoom out 0.8 s → blue fades out → pan back 1.5 s → spin resumes. `viewBlend(a, b)(turn, zoom)` replaces `viewInterpolator`; `DotLayer.draw(..., blue)` draws the selected country grey then blue on top; the blue outline fades with `blue`. Timings in `globeStyle` (`panMs`, `blueMs`, `zoomMs`, `warmWaitMs`); hook fade 1.5 s. Reduced motion jumps to the end state.
- **Measured (Chromium pane):** Netherlands: pan to 1.6 s, blue 1.6–2.0 s, zoom 2.1–2.9 s; Poland the same; 0 frames with missing dots in the zoom for NL, PL and the way back; frame p95 12–18 ms in the zoom (32 ms on the zoom out of the Netherlands).
- **Open:** the zoom-out of small countries is heavy at the finest levels (p95 ~32 ms). Nothing committed.

### 2026-10-16 · UI-1s — Slower blue, pause before the zoom
- **Built:** `blueMs` 450 → 1000 (also the blue fade-out on the way back) and a new `holdMs` = 600: a pause on the blue country between the blue fade and the zoom (`globeStyle`). Measured: pan to 1.6 s, blue 1.6–2.6 s, hold until ~3.2 s, zoom 3.2–4.0 s, no frames with missing dots. Nothing committed.

### 2026-10-16 · UI-1t — Blue fade 0.6 s, hold 0.4 s
- **Built:** `blueMs` 1000 → 600, `holdMs` 600 → 400 (`globeStyle`). Sequence: pan 1.5 s, blue 0.6 s, hold 0.4 s, zoom 0.8 s. Nothing committed.

### 2026-10-16 · UI-1u — Aggressive suggestions, proper names, "Where in <country>?"
- **Built:**
  - `matcher.suggest(input)`: proposes from the first letter. Ambiguous prefixes pick the English display name first, then the most popular country (`POPULAR` list in `aliases.ts`, 50 countries), then official over alias, then shorter ("P" → Poland, "U" → United States of America, "Ger" → Germany). Misspellings (≥ 3 chars, distance ≤ 1 up to 4 chars, ≤ 2 above) propose the corrected name ("Frnace" → France). `ghost` is now the completion part of `suggest`.
  - `CountryInput`: first letter always capitalised; ghost shows the completion, or ` → Name` for a misspelling; Tab / → accepts it (a misspelling is replaced by the proper name). Enter uses the match, else the same suggestion; if the typed text differs from the proper name the field first shows the proper name for 400 ms, then the flight starts. The field keeps that name during the flight and empties (placeholder `[City]`) when the zoom ends.
  - Label: `Where in <Country>?` (country and ? in blue) once the globe is zoomed in; during the flight it stays `Where on earth?`.
- **Checks:** 266 tests pass, build passes; browser: "P" → "oland", "Polnd" → ` → Poland`, Enter shows "Poland", the label reads "Where in Poland?" with `Poland?` blue (#1447C6).
- **Note:** "No match" now only shows for text with no prefix and no close spelling. Nothing committed.

### 2026-10-16 · UI-1v — Text shuffle effect (from 2022.rauno.me)
- **Analysis of the reference** (read from the site's own bundle: `data-shuffle` elements animated by a small util, `iterations: 10`, `fps: 30`): the text is split into characters; spaces stay; each other character is classed lower case (a–z), upper case (A–Z) or symbol (everything else, digits too). A counter r runs from −10 to the number of non-space characters, one step per frame (30 fps). In every frame the first r characters show their real letter, the next 10 show a random character of their own class (lower → a–z0–9, upper → A–Z0–9, symbol → `,.?/\(^)![]{}*&^%$#'"`), the rest are empty. So a 10-character band of flickering characters sweeps left to right, leaving the real text behind and growing the line as it goes (a 16-character line takes ~0.9 s). The site fires it once on load for the clock and the place name; the dots next to them fade in (500 ms) when it completes.
- **Built:** `landing/shuffle.ts` (pure `shuffleFrame`, `shuffleFrameCount`, `runShuffle`, same algorithm and constants), `landing/ShuffleText.tsx` (`ShuffleText` for text with parts, keeping e.g. the blue accent; `useShuffledString` for attributes). The full text is laid out invisibly to size the box and the live copy grows from the left, so centred text and the layout do not move while it plays. Used for: logo lines, hook title and sub-line (shuffle again each time they fade back in after the logo reset), the label (appearing, "Where in <Country>?", "No match for …"), and the field placeholder (`[Country]` → `[City]`). Reduced motion shows the final text at once; `aria-label` carries the real text.
- **Checks:** 272 tests (6 new: frame content per r, classes, spaces, last frame = full text, 30 fps timing, cancel); build passes. Browser: at load the title/label/logo/placeholder sweep as above; label and placeholder switch with the effect after the zoom; the hook re-appears with it after reset; layout unchanged.
- **Open:** typed text, the ghost suggestion and the "G" toggle are not shuffled (not appearing/switching text). Nothing committed.

### 2026-10-16 · UI-1w — Label and field switch the moment the user proceeds
- **Built:** `CountryInput`: on submit the label shuffles to `Where in <Country>?` (country and ? blue) and the field empties and its placeholder shuffles to `[City]` immediately, while the globe is still panning (before: after the zoom). The 400 ms "show the corrected name" pause before the flight is gone (the label shows the proper name); the field clears on `step` instead of `phase`.
- **Checks:** 272 tests pass, build passes; browser: typed "Polnd" + submit → the label reads "Where in Poland?" ~0.9 s later (shuffling from the first frame) while the globe is at idle scale. Nothing committed.

### 2026-10-16 · UI-2 — City step: suggestions, pan, blue switch, zoom to map details
- **Flow:** zoomed into a country the field takes a city (label `Where in <Country>?`, placeholder `[City]`, same suggestions, misspelling fixes and Tab/→ as the country step, cities of that country ranked by population). On submit: the label and placeholder shuffle to `Where in <City>, <CC>?` / `[Address]`; the camera pans to the city (1.3 s) at the country's zoom; once the city boundary is known the blue moves from the whole country to the boundary (country dots and outline fade grey, dots inside the city stay blue, the city outline fades in blue, 0.6 s), a 0.4 s hold, then a rapid zoom (1.4 s, quartic ease) fits the city to half the frame; roads and rivers fade in over zoom levels 7–9 and the dots fade out over 9–11. The logo reverses everything (rapid zoom out, blue off, pan back, spin). The hook stays hidden through the city steps.
- **Data (all behind the server, `/api/geo/*`):**
  - `data/cities/<CC>.json` (new, committed, 34 165 cities ≥ 15 000 inhabitants in 244 countries, 4.5 MB): built by `scripts/build-cities.mjs` from GeoNames cities15000 (CC BY 4.0), name + up to 60 alternate Latin names + coordinates + population. `GET /api/geo/cities/:cc`.
  - `GET /api/geo/boundary?name&cc&lat&lon`: Nominatim `search` (`featuretype=settlement`, `polygon_geojson=1`, `polygon_threshold=0.0005`), picks the polygon nearest the GeoNames point; none → client draws a circle sized from the population (2 500 inhabitants/km², 2–25 km).
  - `GET /api/geo/details?s&w&n&e`: Overpass roads (motorway…secondary; + tertiary for boxes ≤ 0.12°) and rivers/lakes, box clipped to 0.35° (≈ 39 km); retries across `overpass.private.coffee` and `overpass-api.de` (the public instances are often at capacity).
  - Both cached on disk under `data/cache/_geo/` (offline mode replays, a miss answers 503). Endpoints/parameters checked against the live services; Nominatim's usage policy (identifying User-Agent, 1 req/s, no autocomplete) is respected: suggestions come from the local city list, not Nominatim.
- **Built (client):** `geoApi.ts` (city list + matcher per country, boundary/details fetch), `globe/cityGeo.ts` (point-in-polygon, circle fallback, **rewinding of GeoJSON rings to d3's winding**: RFC 7946 outer rings read by d3 mean "everything but the city", which made the camera zoom out instead of in), `landingStore` (city, `toCity`/`city` phases), `GlobeRenderer.toCity`, details layer (roads by class 1.8/1.4/1.1/0.8 hairlines, water), `DotLayer.draw` options (`inside`, `alpha`), `CountryInput` handles both steps, `matcher` entries accept an explicit `rank`.
- **Tests:** 284 pass (12 new: geo routes with a fake fetch incl. cache and offline, OSM parsing for both Overpass shapes, point-in-polygon with holes and multipolygons, d3 winding, circle fallback). Typecheck and build pass. Browser (NL → "dlft" → ghost `→ Delft`): pan to Delft, blue switches, zoom 5 430 → 220 879, Delft's boundary in blue over 1 427 roads, label `Where in Delft, NL?`, placeholder `[Address]`; logo reverses to the idle globe.
- **Open issues:**
  - Overpass is unreliable: a cold city needs 5–45 s for its roads (retries included); the zoom does not wait for them, they fade in on arrival. Water bodies came back empty in the one test (the water query is optional and may have been rejected); the first lookup of each city should be done online once, then it is cached (commit `data/cache/_geo` for the demo cities).
  - Outside the city boundary the detail data (up to 0.35° box) continues; there are no building footprints yet.
  - Cities under 15 000 inhabitants are not suggestable; the address and plot steps are still placeholders (`[Address]`).
  - The `npm run dev` server start-up hang (see the other session) still applies: I ran the API server standalone for this check.
- Nothing committed.

### 2026-10-16 · UI-2b — Dot density constant at every zoom
- **Problem:** the lattice stopped at level 7, so past a ~30 km frame the dots only grew apart (very sparse in a city view).
- **Built:** `maxLevel` 13 (4 px spacing at level 13 = a ~1.5 km frame); lattice key widened to 47 bits (4 level + 21 row + 22 index, exact in a double); city zoom capped at 2 M px/rad (`MAX_SCALE`); the dots no longer fade out when the map details arrive (they stay, only the details fade in). Screen spacing now stays between 1× and ~1.5× the nominal 4 px at any zoom (Delft view 4.9 px, country view 3.9 px, whole globe 4 px).
- **Cost:** a full-frame land view at the finest levels is ~10–40 k dots. Measures to keep it at 10 ms median / 13 ms p95 per frame in the Delft zoom (was 35 ms): the finer level fades in over the last 40 % of each doubling (was the last 60 %) so the 4× larger level is drawn for a shorter part, `forEachDotRaw` (no object per dot, cos/sin of the latitude once per row, key computed inline), and dot groups of more than 12 000 are drawn as 1.5 px squares instead of circles.
- **Tests:** 284 pass (key uniqueness at level 13 and nesting between levels 12 and 13). Browser: NL → Delft: dots stay uniform through the zoom, blue inside the boundary, 0–1 frames with dots missing. Nothing committed.

### 2026-10-16 · UI-2c — NOT BUILT YET: fill outside the city, neighbouring city borders (usage limit reached)
- **Requested:** (1) with a city selected, everything outside the city (rest of the country, other countries) is filled with the Background colour, no dots, only the city keeps its (blue) dots; (2) borders of the other cities in the frame are drawn.
- **Plan:** renderer: with `cityBlue` > 0 fill the selected country's pieces with `otherFill` (alpha `fill × cityBlue`), then fill the city polygon white, draw country dots outside the city at alpha `1 − cityBlue` (new `DrawOptions.outsideAlpha`). Server: `GET /api/geo/borders?s&w&n&e` = Overpass `rel["boundary"="administrative"]["admin_level"~"^(7|8)$"](bbox);way(r);out geom qt;` (the member ways are the borders; no ring assembly needed), cached like `/details`; client: `fetchBorders` in `geoApi`, a `Piece[]` of lines drawn in the Stroke hairline with alpha `cityBlue` before the blue city outline.
- **Checked:** the borders query works on `overpass.private.coffee` (HTTP 200, 790 kB for the Delft box, 1.8 s); the same host answers 500 to a plain `rel … out geom` query and `overpass-api.de` was at capacity (502), so keep using the `way(r)` form and the host fallback. admin_level differs by country (NL/DE/FR/ES 8, PL 7); `7|8` is an approximation.
- Nothing from UI-2c is in the code. Nothing committed.

### 2026-10-16 · UI-2c — Fill outside the city, neighbouring municipality borders (built; replaces the "not built" note above)
- **Built:** with a city selected the rest of its country is filled with Background (alpha `cityBlue`), the city polygon white, and the country's dots outside the city fade out (`DrawOptions.outsideAlpha`); only the city keeps (blue) dots. Other countries were already filled in the country view. New `GET /api/geo/borders?s&w&n&e` (`fetchBorders` in `server/src/geo/osm.ts`: `rel[boundary=administrative][admin_level~7|8](bbox);way(r);out geom qt;`, clamped to 0.35°, cached under `data/cache/_geo/borders-*`); client `fetchBorders` in `geoApi`, requested for the city bbox grown by 60 % per side; `GlobeRenderer.toCity` takes a `borders` callback and strokes them in the border hairline with alpha `cityBlue` under the blue city outline.
- **Checks:** typecheck, 285 tests (1 new: borders route incl. cache, offline 503, bad box 400). Browser (NL → Delft): outside filled, neighbours' borders drawn, city white with blue dots.
- **Open:** Overpass often answers 502 (all retries failed once, worked on the second request); a failed borders fetch just shows no borders. admin_level 7|8 is an approximation. Commit `data/cache/_geo` for demo cities. Nothing committed.

### 2026-10-16 · UI-2d — City view without simplified lines
- **Built:** city boundary from Nominatim unsimplified (`polygon_threshold` 0.0005 → 0; boundary cache key prefixed `full|`, so earlier cached boundaries are fetched again). When a city is chosen the client loads world-atlas 10m on demand (`loadDetailedWorld`, 3.6 MB) and `GlobeRenderer.useDetailed` swaps coastlines, borders, land fills, the selected-country outline and the dot lookup index for it (current dots re-warmed at once); `restoreBase` puts the 50m geometry back when the globe returns to idle.
- **Open:** Natural Earth 10m is still ~100s of metres off OSM, so the city outline and the coast can differ visibly at the closest zoom (Casablanca). Exact match would need the OSM coastline for the city's box (Overpass `way[natural=coastline]`). Nothing committed.

### 2026-10-16 · UI-2e — OSM coastline in the city view
- **Built:** `GET /api/geo/coast?s&w&n&e` (`fetchCoast`: Overpass `way[natural=coastline](bbox);out geom qt;`, box up to 1° (`COAST_SPAN_DEG`), cached under `data/cache/_geo/coast-*`); client `fetchCoast`, requested for the city bbox grown 60 % per side. In the city view the OSM coastline replaces the 10m coast line (crossfade with `cityBlue`), and `globe/coastSide.ts` (grid-bucketed segments; OSM puts land on the left of each way) decides land/sea for dots within ~3 km of the shore (`DrawOptions.coast`): sea-side dots are dropped, land-side ones the 10m lookup missed are added. 4 new tests (coastSide ×3, coast route).
- **Checks:** typecheck, 290 tests; browser (Morocco → Casablanca): the shore follows the city's outline, line spans the frame.
- **Open:** the background fill of the rest of the country still has the 10m edge, so a thin sliver can show between it and the OSM shore line. A failed coast request leaves the 10m coast. Overpass 502s are common: first look-up of a city may need a retry. Nothing committed.

### 2026-10-16 · UI-2f — City map from OpenFreeMap vector tiles (replaces UI-2d 10m world and UI-2e Overpass coast/borders)
- **Why:** the Overpass coast/borders queries were slow and unreliable (502s) and the shore never matched the city outline. OpenFreeMap (OpenMapTiles over OSM; free, no key, CDN, `cache-control` max-age 10 years) is fast and steady.
- **Verified against the live service (2026-10-16):** TileJSON `https://tiles.openfreemap.org/planet` → versioned `…/planet/<version>/{z}/{x}/{y}.pbf` (re-read hourly), zoom 0–14, extent 4096, buffer 64; layers `water` (polygons, `class` ocean/lake/river/dock; the ocean is a polygon at every zoom) and `boundary` (lines, `admin_level`, `maritime`). Policy: unique User-Agent, ≤ 4 parallel requests. Tile ≈ 25 ms.
- **Built:** `server/src/geo/tiles.ts` (`fetchTileData`: zoom from the box size (8–14, ~8 tiles across), 4 tiles at a time, 3 tries per tile, decode with `@mapbox/vector-tile` + `pbf` (pure JS), tile coords → lon/lat; water polygons ≥ 30 000 m² (ocean always); shore = ocean outlines without clip-edge segments; borders = admin level ≤ 8, land only). `GET /api/geo/tiles?s&w&n&e` (box ≤ 1.2°, cached under `data/cache/_geo/tiles-*`, key prefix `v3|`). Removed: `/api/geo/borders`, `/api/geo/coast`, `fetchBorders`/`fetchCoast`, `coastSide.ts`, the 10m world (`loadDetailedWorld`, `useDetailed`). Client: `fetchTiles`; `GlobeRenderer.toCity` fetches the tiles for the city box grown by its own size on every side (the zoom waits for them), fills the frame with Background and paints the water white over it, draws shore + municipality borders instead of the 50m coast/borders (crossfade with `cityBlue`), and `DotLayer.setOverride` makes dots follow the tiles' water (water → no dot, land the country polygons missed → selected country).
- **Tests:** 288 (server: tile zoom/range, decoding a real fixture tile `server/src/geo/fixtures/tile-14-7844-6566.pbf`, merge, retry, `/tiles` route incl. cache/offline/400). Browser: Casablanca (shore on the city outline, neighbours' borders), Rotterdam (Maas filled white, dots off the water).
- **Open:** the country view and globe still use world-atlas 50m/110m (only the city view uses tiles). Attribution (OpenFreeMap, OpenMapTiles, OpenStreetMap) is not shown in the UI yet: add before presenting. Nothing committed.

### 2026-10-16 · UI-2g — Tiles refine the map instead of swapping it; water outlined
- **Fix 1 (swap):** the tile layer used to appear at the blue stage over the whole country-scale frame. Now the tile box is centred on the city and is twice the *final* frame (computed from `cityView()`); `tileAlpha(view)` = smoothstep of how far the frame is inside that box (0 when the frame is as big as the box, 1 at twice the zoom, i.e. over the last doubling), and drives the Background land fill, the white water, the water outlines and the municipality borders; the 50m coast/borders fade out with it (`1 − tileA`). Nothing is replaced before the frame lies inside the tiles.
- **Fix 2 (water):** water bodies of notable size (a tile piece ≥ 14 px long and ≥ 2.5 px wide on average at the final frame, `tooSmall`/`pixelMetres` in `tiles.ts`; ocean always) are filled white and outlined in the border grey; inside the city boundary the outline is blue (`fillPieces(..., Infinity, () => ctx.clip())` clips to the city, then the same lines in blue) and there are no dots on water. Server: tile boxes up to 3° (`TILES_SPAN_DEG`), 150 tiles max, cache key `v5|`.
- **Checks:** typecheck, 288 tests; browser (NL → Rotterdam): frames during the zoom go from the country map through the same map smaller-scale to the detailed one without a jump; Maas and harbours outlined, blue inside the city.
- **Open:** attribution for OpenFreeMap/OpenMapTiles/OSM is not in the UI yet. Nothing committed.

### 2026-10-16 · UI-2h — The Hague: tiles for huge boxes, city cut to land
- **Bug 1:** the unsimplified Nominatim boundary of The Hague runs far out to sea, so the tile box needed 156 tiles and the server refused (`Too many tiles`): no tiles, no neighbour borders, 50m coast. Fix: `fetchTileData` lowers the tile zoom until the box needs ≤ 120 tiles (`MAX_TILES`); cache key `v6|`.
- **Bug 2:** the blue outline and the framing went into the sea. Fix: once the tiles are in, the city polygon is cut to land with `polygon-clipping` (`difference(city, ...water)`, client dependency added): its outline follows the shore and goes round notable lakes/rivers (holes), dots can only land inside it, the camera frames the land part. The earlier "blue clip of the water outlines" is gone (the holes are the blue outlines now).
- **Checks:** typecheck, 288 tests; browser (NL → The Hague): neighbours' borders, blue ends at the coast, no dots in the sea.
- **Open:** a thin blue spike still sticks out of the polygon at one coast point in The Hague (a sliver the clipping leaves where the boundary is thinner than the sea polygons' seam); not removed yet. Nothing committed.

### 2026-10-16 · UI-2i — Degenerate pieces and small water filtered out
- **Built:** `cleanPolygons` (`globe/cityGeo.ts`, 2 tests): after the city is cut to land, zero-width spikes are removed and polygons/holes thinner than 1.5 px or under 16 px² are dropped. Water filter in `tiles.ts` (`tooSmall`): a piece must be ≥ 30 px long, ≥ 3 px wide on average and ≥ 200 px² at the final frame (ocean exempt; holes in kept water too); cache key `v7|`.
- **Effect:** The Hague's spike is gone; Rotterdam shows no inland water inside the city any more (the Maas is cut into tile-sized pieces that fall under the 200 px² limit) and only the widest channels outside it.
- **Tuning:** limits are `tooSmall` in `server/src/geo/tiles.ts`. Nothing committed.

### 2026-10-16 · UI-2j — Water merged and filtered hard (no seam/double-line artifacts)
- **Cause of the artifacts:** the tiles' water pieces overlap (river + dock + basin features, tile buffers), and each piece was outlined on its own: doubled lines, inner seams, narrow rivers drawn as two hairlines with kinks.
- **Built:** `GlobeRenderer.mergeWater`: all water polygons are unioned (`polygon-clipping`) into single bodies, then cleaned with `cleanPolygons(…, {outer: 1 500 px², 8 px wide; hole: 100 px², 4 px})` (`cleanPolygons` now takes limits). The merged bodies are the fill, the outline (their rings, no tile-edge lines), the dot test and what is cut out of the city. The server's `shore` field is no longer used by the client.
- **Effect:** Rotterdam shows only borders (rivers are narrower than 8 px at the city frame), the double-line river artifact is gone; the sea and wide water still show. Tune the limits in `mergeWater`. Nothing committed.

### 2026-10-16 · UI-2k — Hybrid: OpenFreeMap tiles for the country view too
- **Why:** the 50m coast/borders and OSM differ by km, so the crossfade at the city step shifted lines. Now OSM tiles are on screen from the country view on, at two levels (country, then city), each refining the last.
- **Built:** `toCountry(shape, done, tiles)` fetches `/api/geo/tiles?…&maxLevel=2` for 1.5 × the final country frame during the pan (zoom waits ≤ 4 s for it); `TileLayer` (water fill, outline, borders, box, `factor`, `finalScale`, strip-index water test) for country and city layers; `tileAlpha` = smoothstep of the view scale between `finalScale/factor·1.1` and `finalScale`; country lines are drawn at `aCountry·(1 − aCity)`, the 50m lines at `1 − max(a)`. `frameBox` unprojects the frame outline from the screen, so tall frames at high latitude are covered. Dot override is composed (`applyOverride`): city tiles inside their box, country tiles elsewhere; only the city layer may turn sea into land. Outline chains drop segments on the merged data's outer edge (`outlineChains`). Server: tile zoom 3–14 (≈ 8 tiles across), box up to 120°, `maxLevel` query (2 or 8), coordinates rounded by zoom (100 m / 10 m / 1 m), duplicates dropped, the unused `shore` output removed; cache key `v9|<maxLevel>|`.
- **Measured:** Chile 2.0 MB / 0.65 s cold, Brazil 0.7 MB / 0.8 s, Russia 0.8 MB / 1.4 s; cached ≈ 10 ms. Chile → Santiago and Russia render; frame 6 ms in Russia.
- **Open:** payload for fjord coasts is large (Chile 2 MB uncompressed); no gzip on the API. Country view shows country borders only (level 2); the blue country outline is still the 50m one. Attribution still missing in the UI. Nothing committed.

### 2026-10-16 · UI-2l — Label and placeholder scramble through the flight, resolve after the zoom
- **Built:** `shuffle.ts` `runScramble` (whole text random every frame at 30 fps until cancelled) and `runResolve` (scrambled → real, left to right, 0.4 s for any length; the rest keeps scrambling, no empty characters). `ShuffleText`/`useShuffledString` take `scrambling`: while it is true the text scrambles; when it goes false for the same text it resolves (no sweep from empty). `CountryInput`: `flying = phase is toCountry | toCity` drives the label and the placeholder, so after a submit they scramble through pan, blue, hold and zoom and become readable when the globe settles. Reduced motion shows the text at once.
- **Checks:** 292 tests (2 new), typecheck; browser (NL): label/placeholder scrambled every 250 ms sample during the ~3.4 s flight, then "Where in Netherlands?" / "[City]". Nothing committed.

### 2026-10-16 · UI-2m — Busy text uses the normal sweep, looped (replaces UI-2l's all-letters scramble)
- **Why:** re-randomising every letter every frame (30, then 8, then 16 a second) had a different dynamic from the normal shuffle.
- **Built:** `runBusy` repeats exactly the normal sweep (band of 10 flickering characters, 30 fps, 0.4 s for any length) for as long as the globe flies, but never shows the real text: the characters the band has passed hold a random value of their own until the next pass, the ones ahead hold the previous pass's. `runResolve(text, rest, …)` is the last sweep: one normal sweep in which the real letters appear behind the band while the characters ahead keep the value they had when the loop stopped (`shuffleFrame` got `behind`/`rest`, `scrambled()` helper). `ShuffleText`/`useShuffledString` hand the last busy frame to the resolve. `SCRAMBLE_FPS`/`runScramble` are gone. Tests: busy never equals the text, 30 fps, moves/holds; resolve 13 frames for any length, ends on the text.
- **Checks:** 292 tests, typecheck; browser label sampled every 33 ms: a band moves across the text, passed characters hold, then "Where in Netherlands?" after the zoom. Nothing committed.

### 2026-10-16 · UI-2n — Borders cut out of water
- **Built:** `clipToLand` (`GlobeRenderer.ts`): municipality/country border lines of a tile layer are sampled every ~4 px of the final frame (≤ 400 samples per segment) against the layer's water index and only the runs outside notable water are kept, so no border runs over a river, lake or the sea. Applies to the country and the city layer.
- **Check:** browser (PL → Łomianki, on the Vistula): borders end at the river's banks; only the river's outline crosses the view. Nothing committed.

### 2026-10-16 · UI-2o — Text readable the moment the camera stops
- **Built:** the resolve sweep (0.4 s) now starts 0.5 s before the end of the zoom instead of at the settle: `GlobeRenderer.cueResolve(t, ms)` (called from the last stage of `toCountry` / `toCity`) fires `resolveCue` once, `SHUFFLE_DEFAULTS.durationMs` + 100 ms before the camera stops (the 100 ms covers React's render and timer drift); `landingStore.resolving` / `startResolve` (cleared on select, settle and reset); `CountryInput` `flying = in flight && !resolving`.
- **Measured (NL, 16 ms sampling):** the label is the full text 6 ms after the renderer's last stage ends (85 ms with the 400 ms lead alone). Nothing committed.

### 2026-10-16 · UI-3 — Address step: smart suggestions, then the plot (blue parcel, dot infill, 3DBAG surroundings)
- **Flow:** zoomed into a Dutch city the field takes an address (label `Where in <City>, NL?`, placeholder `[Address]`). Typing opens a list of up to 6 suggestions above the field (↑/↓ highlight, Enter or click chooses, Tab/→ copies the highlighted one into the field; the ghost shows the completion, or `→ name` when the typed text is not a prefix). On choosing: the label shuffles to `Plot at <address>` and scrambles through the flight; the camera pans to the address at city zoom (1.3 s), the blue moves from the city to the parcel (0.6 s, outside stays Background, the city's dots/outline fade), 0.4 s hold, then a rapid zoom (1.8 s, ≈ 300× in scale) to a frame 90–600 m wide. At the end: the parcel is white with a blue outline and blue dot infill, the buildings around it are white with grey hairlines. The logo reverses it (zoom out to the city, blue back to the city, then the usual zoom out and pan).
- **Data (server, `/api/geo/*`, endpoints checked against the live PDOK services):**
  - `GET /address/suggest?q&lat&lon`: municipality of the city centre via Locatieserver `reverse?type=gemeente` (kept in memory; The Hague → `'s-Gravenhage`), then `suggest` with `fq=type:adres` and `fq=gemeentenaam:"…"` (prefix search over street, number, postcode). No hit → suggest's own spell check (`spellcheck.collations`, the one with most hits) is asked again; still none → `free` (fuzzy). Items carry id, display name and the address point (`centroide_ll`). Not cached on disk (one request per typing pause, 120 ms debounce, stale answers aborted).
  - `GET /plot?id=adr-…`: `lookup` (point), Kadaster `perceel` at the point (**all polygons of the feature**, not only the one under the point; holes kept), 3DBAG `pand` footprints within 1.1 × the frame, converted RD → lon/lat. Frame = 3 × the parcel's longest side, 90–600 m. Every upstream answer goes through the disk cache (`data/cache/_adhoc/`, git-ignored; offline replays or answers 503).
  - New: `server/src/geo/address.ts`, routes in `routes/geo.ts`.
- **Client:** `globe/plotLayer.ts` (pure, 7 tests: plot view/scale, local-metre frame, parcel point-in-polygon with holes, staggered dot lattice that nests level to level, spacing 4–8 px with the finer level fading in over the last 40 % of a doubling, as on the globe); `GlobeRenderer.toPlot` / `PlotLayer` / `drawPlotDots` / `buildingAlpha` (buildings fade in over the last three doublings of the zoom); `toIdle` handles a parked plot; `advanceStages` ignores a stage that replaced the sequence (used by the abort path); `landingStore` has `address`, phases `toPlot`/`plot`, `selectAddress`, `plotFailed`; `geoApi` has `fetchAddressSuggestions`, `fetchPlot`; `CountryInput` address step + `.suggest` list in `landing.css`; `globeStyle.plotZoomMs`.
- **Checks:** typecheck, build, 308 tests (16 new: 7 plot layer, 9 server: query cleaning, suggest, typo repair via collation, free fallback, multi-polygon parcel, frame size, `/plot` incl. cache/400/503, `/address/suggest`). Browser (NL → Delft → "hendrik casimirtsraat 8"): the list offers Hendrik Casimirstraat 8, Enter → the flight above, K 2410 in blue with dots, 255 footprints around it, no console errors; logo returns to the globe; Poland → Warsaw shows `Plots work in the Netherlands only for now` and a disabled field.
- **Decisions / deviations:**
  - Address step works in the **Netherlands only** (parcels = Kadaster, buildings = 3DBAG). Other countries stop at the city; no other geocoder was added (Nominatim forbids autocomplete).
  - "Surroundings = the data the 3D model is built from" is read as the 3DBAG/BAG building footprints (outer rings; heights are not used on this screen). Neighbouring parcels are not drawn.
  - Dot infill on the parcel is its own metric lattice (the globe lattice stops at 17 m spacing); the globe's dots are hidden once the plot is blue.
- **Open issues:**
  - Suggestions need the network (PDOK) also in `CACHE_MODE=offline`; the chosen plot itself replays from cache once loaded online. For the demo address, run the flow once online.
  - A failed plot request pans back over the city and re-enables the field, but shows no error text.
  - The plot step ends there: nothing hands the address over to the studio (`#studio`) yet.
  - Zoom-out from a plot passes through scales with an almost empty map (only borders), same as the zoom in.
  - `npm run dev` still hangs at server start; I ran the API standalone (`SERVER_PORT=8788 npx tsx src/index.ts`) next to Vite on 5174.
- Nothing committed.

### 2026-10-16 · UI-3b — Wider field, suggestion list snapped to the grid
- **Built:** the field is 2 cells wider at every step (`LAYOUT.local.field` cols 3→11, button 11→12; still centred in the window). The address suggestion list now hangs from the field's bottom grid line with no gap, exactly as wide as the field (not the arrow button), one 32 px grid row per suggestion (max `SUGGEST_ROWS` = 5), so its bottom border sits on a grid line. `LANDING_MIN_ROWS` grew by the list rows, so short viewports scroll instead of clipping it. Grid tests updated (field 576/257 px at 1440×928; the tall-viewport case now 1000 px).
- **Checks:** client tests 88 pass, typecheck passes; browser (Delft, "hendrik cas"): 5 rows below the field, field-wide. Nothing committed.

### 2026-10-16 · UI-3c — Suggestions without the city; picking fills the field
- **Built:** suggestion rows (and the ghost completion) drop the trailing place name (`shortAddress` in `geoApi.ts`: "…8, 2628KJ Delft" → "…8, 2628KJ"; without a postcode ", Delft" goes). Picking a row (click, Tab/→ on the top one, or Enter on a highlighted row) puts its short text into the field, closes the list and does **not** proceed; the arrow (or Enter with nothing highlighted / after picking) does. The pick is remembered (`chosen`) only while the field still shows exactly its text, so editing it falls back to the live suggestions. The plot label still shows the full address.
- **Checks:** 1 new test, client typecheck; browser: click row 4 → field "Hendrik Casimirstraat 6, 2628KJ", list closed, globe unchanged; arrow → the plot flight. Nothing committed.

### 2026-10-16 · UI-3d — Bar widens only for the address (replaces the UI-3b widening)
- **Built:** `LAYOUT` is back to the original field (cols 4→10) and button (10→11); `CountryInput` widens the bar by one cell on each side (field 3→11, button 11→12, so it stays centred) while the step is `address` or `plot`, with a 600 ms ease on the field, button and label (`landing.css`, off with reduced motion). The suggestion list still hangs from the field's bottom line at the field's width, one grid row each. Grid tests are back to the original field numbers.
- **Checks:** 89 client tests, typecheck; browser: globe, country and city steps show the short bar, the address step the long one. Nothing committed.

### 2026-10-16 · UI-3e — Bar widens when the text resolves
- **Built:** the address bar widens (UI-3d) only once the label's final pass starts (`resolving`, fired 0.5 s before the city zoom ends) or the globe has settled on the city (`phase === "city"`), and stays wide for the plot step. During the pan and the zoom it keeps the short bar. Typecheck passes; browser: narrow while the label scrambles, wide at the end of the zoom. Nothing committed.

### 2026-10-16 · UI-3f — Bar widens just before the text resolves
- **Built:** a second cue in the renderer, `widenCue` (`WIDEN_LEAD_MS` = 650 ms before `resolveCue`, i.e. 1 150 ms before the camera stops): the store's `widen` flag starts the 600 ms widening of the address bar, so it is fully wide ~50 ms before the label's final 0.4 s sweep begins. `resolving` and `phase === "city"` still force it wide as a fallback; the plot step stays wide. Changing the CSS transition time means changing `WIDEN_LEAD_MS` too.
- **Checks:** typecheck, 89 client tests. **Not measured in the browser:** the preview pane ran at ~2 fps (the machine was loaded by other processes), too slow to time the bar against the sweep. Nothing committed.

### 2026-10-16 · UI-4 — Plot view: neighbouring parcels and BGT ground
- **Data (server, `server/src/geo/plotContext.ts`, endpoints checked against the live PDOK services):**
  - Neighbouring parcels: Kadaster `perceel` for the same box (limit 1000), the plot's own parcel left out (matched by "municipality section number").
  - BGT OGC API (`api.pdok.nl/lv/bgt/ogc/v1`): `wegdeel`, `ondersteunendwegdeel` (road), `begroeidterreindeel` (green), `onbegroeidterreindeel` (yard), `waterdeel`, `ondersteunendwaterdeel` (water), following `next` links (≤ 3 pages). **BGT keeps superseded object versions** (they carry `eind_registratie`), so every query uses CQL2 `filter=eind_registratie IS NULL AND relatieve_hoogteligging = 0` (current, ground level; no bridges or tunnels). Without it a 100 m box returned 182 road polygons instead of 53.
  - Rings are simplified to 5 cm (Douglas–Peucker, mm-precise BGT curves are dense chains) and rounded to 7 decimals: the Delft plot payload went from 1.75 MB to 235 kB (255 buildings, 111 parcels, 140 road / 63 green / 39 yard / 12 water polygons).
  - `/api/geo/plot` now also returns `parcels` and `ground`; every upstream answer goes through the disk cache.
- **Client:** `PlotLayer` holds the parcel lines and ground pieces; drawn with the buildings' fade-in (`buildingAlpha`), tokens only (`globeStyle.plot`): green flat `gridLine` fill, roads and paving white with a `gridLine` outline, yards outlined only, water white with the grey border line, neighbouring parcels grey dashed hairlines; then buildings (white, grey outline), the blue plot's dots and outline on top.
- **Checks:** typecheck, tests (+ 4 server tests: geometry reading, the BGT filter and bbox, own-parcel exclusion and kind grouping with pagination, ring simplification), browser (Hendrik Casimirstraat 8): dashed parcel grid, road/path outlines, green fills around the blue plot. Nothing committed.
- **Open:** the map is dense at the final zoom (all BGT road/path outlines); thin or drop `yard` and `road` outlines if it reads too busy. Not drawn: BGT street furniture, trees, bridges, railways.

### 2026-10-16 · UI-4b — Green areas and yards removed
- **Built:** BGT `begroeidterreindeel` and `onbegroeidterreindeel` are no longer fetched or drawn; the plot's `ground` is `{ road, water }` only (server `GROUND_COLLECTIONS`, client `GroundKind`, `globeStyle.plot` lost `greenFill`/`yardLine`). Delft payload 235 → 181 kB. Typecheck, 313 tests pass; the 8787 server was restarted. Nothing committed.

### 2026-10-16 · UI-4c — Paving/roads and neighbouring parcels removed
- **Built:** the plot no longer fetches or draws BGT roads and paving or the neighbouring cadastral parcels (`neighbourParcels`, `parcelsUrl` and the `parcels` field are gone). BGT is now water only (`waterdeel`, `ondersteunendwaterdeel`, same current/ground-level filter), white with the grey line; the plot view shows the blue parcel with dots, the 3DBAG footprints and any water. Delft payload 181 → 84 kB. Typecheck, 313 tests, browser check (Hendrik Casimirstraat 8) pass; the 8787 server was restarted. Nothing committed.

### 2026-10-16 · UI-4d — Roads back, simplified (carriageways only, merged)
- **Built:** BGT `wegdeel` is back, but only carriageways (CQL `functie LIKE 'rijbaan%' OR functie = 'woonerf'`; footpaths, cycle paths and parking stay out; `ondersteunendwegdeel` is not used). Per kind the pieces are rounded to 1 cm, **unioned** with polygon-clipping (server dependency added, already hoisted), simplified to 0.3 m and cleaned of holes under 40 m² and pieces under 25 m² (`mergePolygons`, `MERGE` in `plotContext.ts`; water gets the same). Delft: roads 3 polygons / 134 points (was 140 polygons), payload 79 kB. Roads are drawn white with a `gridLine` outline under the buildings; no neighbouring parcels, no green, no yards.
- **Checks:** typecheck, 315 tests (+2: merge/slivers, carriageway filter), browser (Hendrik Casimirstraat 8): the road reads as one smooth shape. 8787 server restarted. Nothing committed.
- **Tuning:** `MERGE.toleranceM` (0.3) is the simplification; raise it for smoother and blockier roads.

### 2026-10-16 · Live zoning from ruimtelijkeplannen.nl (M2/M7 data, no API key)
- **Built:**
  - `server/src/providers/nl/ruimtelijkePlannen.ts`: `RuimtelijkePlannenZoningProvider` behind the shared `ZoningProvider` interface. Parcel → a point inside it → plans at the point → the newest adopted municipal bestemmingsplan that has structured data → `SiteConstraints`.
    - Mapped: enkelbestemming names → `allowedFunctions`; bouwvlak polygon (RD) → `bouwvlak`; maatvoering `maximum bouwhoogte` / `maximum goothoogte` / `maximum bebouwingspercentage` → `maxHeight` / `maxGutterHeight` / `maxCoverage` (÷100).
    - Provenance: `extracted`, `quote` = the raw `"label"="value"`, `source` = plan name, id and date. Everything the plan does not give stays `null` + `assumed`, so the PLACEHOLDER state stays on until the user fills it.
    - Notes: link to the plan text for the bestemming, dubbelbestemmingen (archeologie etc.), maatvoeringen the generator cannot use, other plans on the point, and a standing warning that values are read at one point of a public viewer that can be outdated.
  - `FirstZoningProvider`: fixture first, live second; a failing live source counts as "no answer".
  - `createJsonFetcher` takes per-provider headers; a 200 response that is not JSON is never cached (the site answers with an HTML page when a request is not accepted).
  - `ZoningResult.label` / `SiteScene.zoning.label` (optional): source in words for the Constraints screen and `meta.sources`.
  - `server/scripts/probe-zoning.ts`: `npx tsx scripts/probe-zoning.ts ["address" ...]` prints what the live source fills per address.
  - Tests: 329 pass (was 327). Recorded real responses in `server/src/providers/nl/__fixtures__/rp-*.json`.
- **Endpoints (probed live, not documented APIs; the site's own viewer backend):**
  - `GET https://www.ruimtelijkeplannen.nl/plannenservice/plannen/xy/{x}/{y}` (RD metres)
  - `GET https://www.ruimtelijkeplannen.nl/web-roo/rest/bestemmplangebied/id/{planId}/xy/{x}/{y}?buffer=1`
  - Both need header `dummy: dummy` (published in the site's `/assets/config/http-security-header.config.json`); without it they return the HTML shell.
- **Coverage measured (16 addresses in and around Delft):** 14 had structured plan data. Filled: bestemming 14, bouwvlak 11, max height 7, max gutter height 4, max coverage 2. Setbacks, FAR, parking and street side are never filled by this source.
- **Decisions:**
  - Conflicting heights at one point → the lowest, with a note.
  - Plans in the `plangebied_pcp` format (old plans, e.g. TU-Noord 2009) and umbrella plans (Flitsbezorging, Facetherziening parkeren) have no structured data and are skipped.
  - Fixture wins over live data for the same parcel.
- **Deviations from SPEC.md:** the spec lists live zoning retrieval as out of scope (DSO key needed). This is a keyless partial source instead; zoning from fixtures stays the reliable path. The spec's "live DSO" future work is unchanged.
- **Open issues:**
  - **The stand-in plot K 2410 (Hendrik Casimirstraat 8) gets no live data**: its plan is the old TU-Noord (pcp) one, so the fixture / placeholder still applies there.
  - Unofficial backend: the `dummy` header, paths or response shape can change; the site itself says its data is incomplete and may be outdated since the Omgevingswet (rules move to DSO). Terms of use not checked.
  - Rules are read at one point (inside the parcel), not for the whole plot.
  - Max height is missing where the plan states it differently (bouwaanduiding, per-bestemming text). The plan text URL is stored in a note; feeding that text to the constraint interpreter (extract-rules) is the natural next step.
  - `maxCoverage` uses "bebouwingspercentage terrein" when that is the label given; plans that give it per bouwvlak read the same way.
  - Demo cache: live plan answers for the demo address are not seeded (none exist for K 2410). Other addresses cache in `data/cache/_adhoc/` (git-ignored).
- **Next:** fetch the plan text behind the `verwijzingNaarTekstURL` notes and feed it to `extract-rules`, so rules the maatvoering lacks (setbacks, extra height rules) can be filled with quotes; check the site's terms of use; swap for the DSO API if a key ever becomes available.

### 2026-10-16 · Plan text → Extract rules (live plan data)
- **Built:**
  - `server/src/providers/nl/planText.ts`: reads the plan article behind each live enkelbestemming (`verwijzingNaarTekstURL`) and cleans it to text. IMRO2008 plans = one small page per article; IMRO2012 plans = one big document, cut to the anchored article (`#_15_Wonen`). `isPlanTextUrl` only allows `https://(www.)ruimtelijkeplannen.nl/documents/<plan>/r_*.html` (the client sends the links, so they are validated). Max 3 links, 14 000 characters each.
  - `createTextFetcher` (disk cache, `.txt`), used under `data/cache/_adhoc/` only.
  - `ZoningResult.textRefs` → `scene.zoning.textRefs` → client sends them to `POST /api/ai/extract-rules` (`textRefs`, new optional field). Order of sources: request `excerpts` → fetched `textRefs` → site fixture excerpts. Fetch failure → 503; unreadable text → 422.
  - Client: the button reads "Extract from the plan text" when the scene has links.
  - Tests: 340 pass (was 329): HTML cleaning on a real page, anchor cut, URL allowlist (no foreign hosts, no fetch), shared-document fetched once, route with stubbed fetch.
  - Bug found by test and fixed: the anchor cut started inside the opening tag.
- **Live check (real model):** Schieweg 64A (BP0005, IMRO2008) 16 s and Voorhofdreef 20 (BP0031, IMRO2012, anchored article) 33 s. Every quote passed the verbatim check.
- **Finding:** on these plans the text adds **no new numbers**. Height, gutter height and coverage are written as "zoals aangegeven met de aanduiding 'maximum …'", i.e. they live on the map (already read by the maatvoering step). Setbacks, FAR and parking are not stated in the bestemming article. What the text does add: the bestemming list in the plan's words and ~10–15 notes with quotes (extension depth, dormers, fences, deviation powers, uses only at certain aanduidingen). Numbers in those notes stay in the quote, not in fields.
- **Open issues:**
  - Only the bestemming article is read. General articles (begrippen, algemene bouwregels, afwijkingsregels) are not, and may hold setback-like rules. Cheap to add for IMRO2012 documents (anchor `_<n>_Algemenebouwregels`).
  - A plan can name numbers per aanduiding (e.g. "maximaal 5,5 m aan de zuidzijde") that apply to part of the area; the model puts these in notes.
  - Extraction takes 16–33 s per call (long articles); cost is the Claude plan's.
- **Next:** decide whether to add the general-rules articles; otherwise zoning numbers beyond the map values need the DSO API or hand entry.

### 2026-10-16 · More automatic data: multi-point plan reading, general articles, street side, restrictions
- **Built:**
  - `ruimtelijkePlannen.ts`: reads the plan at up to 5 points of the plot (centre + 4 spread, none within 3 m of another) and merges objects by id. The bouwvlak used is the one holding most sample points; only the maatvoering that names that bouwvlak (`Bouwvlak=<id>`) or none counts (a 3 m outbuilding limit no longer wins over 18 m). Other bouwvlakken's maatvoering goes in a note. Aanduidingen (bouw-, functie-, gebiedsaanduidingen, figuren, e.g. "geluidzone - industrie") become notes.
  - `planText.ts`: `generalRefs` finds the general articles of the plan (algemene bouwregels / afwijkingsregels / aanduidingsregels, wijze van meten; not begrippen) for both layouts: anchors in the IMRO2012 document, chapter pages `_1.html` and `_3.html` for IMRO2008. `fetchPlanExcerpts(..., { general: true })` appends them (max 4, 10 000 chars each); "Extract rules" uses it. A failure there never blocks the bestemming text.
  - `streetSide.ts`: `streetSide` is derived from the nearest BGT carriageway (bearing from the plot boundary to the road; roads within 40 m; parcels over 20 000 m² skipped). It replaces a missing or `assumed` value only, never verified / extracted / overridden ones. On K 2410 it gives 67°, matching the earlier hand estimate of 65°.
  - `restrictions.ts`: notes from PDOK layers: heritage (RCE protected areas), Wkpb public-law restrictions still in force, foundation-risk attention areas. Flood-risk layer exists but is empty for Delft, so not used. None changes a number.
  - `scene.ts`: `enrichConstraints` + optional `streetSide` / `restrictions` in `SceneProviders`; both are optional and a failure only logs a warning. Sources list names them.
  - Demo cache seeded: 4 new files in `data/cache/placeholder/` (BGT road, 3 PDOK layers); verified the demo address loads with `CACHE_MODE=offline`.
  - `scripts/probe-zoning.ts` now also reports street side, notes and restriction counts.
  - Tests: 367 pass (was 343).
- **Coverage (16 addresses in and around Delft):** plan data 14/16. Fields: bestemming 14, bouwvlak 13 (was 11), max height 10 (was 7), gutter height 4, coverage 2. Street side 11/16. Restriction notes 16/16.
- **Findings:**
  - The general articles of the Delft plans contain no setback numbers; these plans use the bouwvlak as the buildable area, so setbacks stay unknown while the bouwvlak is used (envelope order: bouwvlak first).
  - With the real model the text step again adds only the bestemming list and notes with quotes; height and coverage are map values.
  - Parcels the cadastre returns for estates or blocks (e.g. 250 000 m²) have no single street side and several bouwvlakken.
- **Bugs found by tests/live runs and fixed:** anchor cut started inside a tag; bearing could round to 360; a low-rise bouwvlak's height won over the main one.
- **Open issues:**
  - Not automatable from the sources found: setbacks (when the plan has none), FAR, parking norm (municipal policy documents), the omgevingsplan rules that exist only in DSO (needs the key).
  - The restriction layers are indicative: the foundation layer is per postcode, Wkpb only lists registered restrictions.
  - Only the Netherlands. Other countries need their own providers behind the same interfaces.
  - Real-model extraction takes 11–33 s per call.
- **Next:** parking norm and FAR from municipal policy are the biggest remaining gaps; the DSO API would close the rest.

### 2026-10-16 · Municipal parking policy → parking norm
- **Built:**
  - `server/src/providers/nl/cvdr.ts`: finds a municipality's regulation in the national register of local regulations (CVDR) with the open SRU search (**SRU 1.2**; 2.0 answers 406) and fetches its XML from `repository.officiele-overheidspublicaties.nl`. No key. Text converter `regulationText`.
  - `parkingPolicy.ts`: reads the housing table of Delft's "Beleidsregels Parkeernormen Delft 2023" (CVDR714401): 5 dwelling-size bands + student + care rows × 6 zones (autoluw-plus, Binnenstad, rest bebouwde kom, buitengebied, TU campus, Schieoevers Noord), residents and visitors. The parser checks the header, the 12 numbers per row and that the size bands have no gaps; on anything else it returns an empty table (never a wrong norm). Also copies 4 housing sentences from the policy verbatim, and guesses the zone from the plan names at the plot (`suggestZone`).
  - Shared `constraints/parking.ts`: `ParkingPolicySchema`, `rowFor`, `parkingNormFrom` (residents + visitors, rounded to 2 decimals), `applyParking` (fills `parkingNorm` only when unknown or `assumed`; zone chosen by the user → `extracted`, zone guess → stays `assumed`, with "zone is a guess" in the source).
  - Scene: `scene.parking` (policy for the geocoded municipality); `GeocodeResult.municipality` from Locatieserver `gemeentenaam`; `planNamesAt` in the plan provider. Failures only log.
  - Client: `siteStore` holds `parkingZone`; `useConstraints` / `effectiveConstraints` apply the norm from the zone and the programme's unit size, so compliance, the AI directions request and the report all use it. New "Parking policy" panel on the Constraints screen (zone picker, the norm in words with residents + visitors, policy sentences). `siteStore` ⇄ `massingStore` import each other on purpose (read at call time only).
  - AI fallback for municipalities whose table cannot be parsed: `ExtractRulesRequest.policyUrl`; the server reads the regulation XML (official repository only), keeps the housing lines with numbers (max 12 000 chars) and adds them to the excerpts of "Extract rules".
  - `.claude/launch.json`: `massing-api-4` (server via `npm run start`, port 8801) and `massing-web-4` (client, 5190).
  - Demo cache seeded (`data/cache/placeholder/`: SRU answer, regulation text, plan list, BGT, PDOK layers); demo address loads offline with the policy.
  - Tests: 397 pass (was 367); typecheck and build pass. Browser check: guessed zone Campus TU Delft → 0,6 spaces for a 65 m² dwelling (assumed); picking Binnenstad → 0,4 (extracted, "a maximum"); Directions compliance shows "Needs 1 spaces (2 units × 0.4/unit, extracted)".
- **Decisions:**
  - Norm = residents + visitors, per dwelling, from the band of the programme's average unit size (treated as GO). The policy's cap of one resident space per dwelling is not needed for the current table values (max 1,0).
  - The zone map is only a figure in the policy; no data layer found. Plan names are a stand-in (`Binnenstad` → binnenstad, `Schieoevers Noord`, `TU`/`campus`, `Buitengebied`, else rest). The autoluw-plus part of the centre cannot be told apart; the user picks it.
  - A guessed zone keeps the norm `assumed`, so the PLACEHOLDER state stays on until the zone is chosen.
- **Deviations from SPEC.md:** none (parking was listed as a constraint, `parkingNorm`; compliance still reports it as `unknown` because parking is not modelled).
- **Open issues:**
  - Delft only for the table; other municipalities rely on the AI reading the policy text (`policyUrl`), not tested against a real model call yet.
  - The old cached Locatieserver answer for the demo address remains in `data/cache/placeholder/` next to the new one (the request now asks for `gemeentenaam`); harmless.
  - `massing-dev-alt` in launch.json cannot start the server: the server reads `PORT` first (hosting change), and that entry sets `PORT` for the client. Also `tsx watch` hangs the server in the preview environment (known SDK issue), so use `massing-api-4` + `massing-web-4`.
  - FAR: not regulated by Dutch plans; left unknown (not marked "not regulated" because absence in the map data does not prove the text has no such rule).
  - Mac check still pending; the user commits everything at the end.
- **Next:** pick the zone for the real site (M7); optional: add other municipalities' tables or test `policyUrl` with a real model call on one.

## Landing: back arrow (UI side session)
- **Built:** a "Back" button left of the search bar at the country, city and address levels. It is the mirror (scaleX(-1)) of the blue button's arrow, 16 px, drawn in `--stroke`, no background, one grid cell left of the field, so it keeps the same gap as the white arrow. It fades in (600 ms, same easing as the bar) once the camera has landed or at the widen/resolve cues, and moves with the bar when it widens for the address. It is a real `<button aria-label="Back">`, disabled during flights.
- **Behaviour:** `landingStore.back()`: plot -> address step (new phase `backToCity`), address step -> city step (`backToCountry`), city step -> `reset()` (zoom out to the idle globe). `GlobeRenderer.backToCity` / `backToCountry` zoom out and swap the blue back (new methods; `Globe.tsx` calls them when `address` / `city` become null).
- **Checked:** `npm test` (397) and typecheck pass; clicked through globe -> NL -> Delft -> Mekelweg 5 and back out at every level in the browser.
- **Deviations / open:** no unit test for the store transitions or the renderer methods (UI/canvas). The label scrambles briefly on back (no resolve cue on zoom-outs). Not committed.

## Landing: plot step and rules window (UI side session)
- **Built:** at the plot step the label reads "Address, Postcode, City, CC" in blue and the read-only field "Plot #<number> · <area> m²" (from the Kadaster parcel id and area; `landingStore.plot`, set by `Globe` via `onPlot`). The arrow is blue and clickable at once. It opens a second window right of the globe window (same size, border, white fill; the two are centred together, so the globe window moves left): `RulesPanel.tsx`. It loads the scene for the address (`siteStore.load`) and lists every number/list rule as KNOWN (blue, with source), PLACEHOLDER or NEEDS INPUT (dashed box, slider + text box, list text box). "Fill all with placeholders" fills only the missing rules. The continue arrow turns blue when all have a value; **not wired**.
- **Decision:** placeholder fills go through `siteStore.fillPlaceholders` and stay status `assumed` (new `placeholders` list, third arg of `applyOverrides`), so the PLACEHOLDER watermark logic is unchanged; editing one by hand makes it `user_override`. Polygon/line rules (bouwvlak, building line) are shown only when the plan has them; they cannot be typed.
- **Checked:** typecheck, 397 tests, clicked through NL → Delft → Mekelweg 5 → arrow → fill all in the browser (1440 wide). No unit tests for the panel; below ~33 grid columns (≈1060 px) the second window does not fit.
- **Next:** wire the continue arrow to the next screen.

## Landing: logo reload, country shore, city transition (UI side session)
- Logo click now does `window.location.reload()` (was `reset`).
- Grey outline under the blue country: the blue outline came from the Natural Earth polygon, the grey shore from the OpenStreetMap water tiles, so they differed. `GlobeRenderer.toCountry` now cuts the tiles' water out of the country polygon (`landOnly`, ~200 ms, during the pan) for the blue outline (`selectedPieces`); the whole polygon stays in `selectedFill` for the grey fill.
- Holes / white water on city zoom: when the blue fades to the grey fill, the country tiles' white water bodies (IJsselmeer, lakes) were suddenly the only white shapes in it. The country layer's water now fades in with the zoom (`aCountryWater`), together with the city's tiles.
- Open: a few small harbour inlets still show a grey line next to the blue (the clip drops tiny water pieces). Checked by jumping the renderer to states in the browser; no unit tests (canvas).

## Landing: "Found" strip and full-height map (UI side session)
- Plot step: the field is a read-only strip on `--background` reading "Found:" + a 16 px chip (`--stroke` fill, no border, 4 px side padding) with "Plot #… · … m²" (`.field.found`, `.chip` in landing.css).
- Arrow click (rules window opens): `CountryInput` renders nothing and the input band is removed, so the bottom section of the globe window is gone; `Landing.useExpand` grows the map canvas to the full window height over 450 ms and the renderer re-centres the plot each frame (`place`).
- Side effect: with the bottom section gone there is no back arrow while the rules window is open; the logo (reload) is the way out.

## Landing: site model after the rules (UI side session, 2026-10-17)
- **Built:** the rules window's continue arrow (blue once every rule has a value) opens the site model. At the same time: the rules window fades out (300 ms), the globe window grows to a square of its own height and moves to the page centre (1 200 ms, `modelWindow` / `lerpBox` in `grid.ts`), the 2D plot map fades out over an identical three.js copy (`model/SiteModel.tsx`, lazy chunk), and the camera turns from the top view (north up, the 2D view's px/m) to a true isometric from the south-west, pulling back to fit the model square (`fit` 0.9 of the final width). Buildings rise to their 3DBAG heights in a ripple from the plot outwards; the buildable envelope from the rules just filled rises last as a dashed blue ghost with a faint fill; then cars and people appear and move. Orbit (rotate + zoom, no pan, orthographic) is on once the camera lands.
- **Look (user choices):** line drawing — white faces, grey (`--stroke`) edges, no shading; ground square in `--background` with a grey edge (hard square clip, no plinth); roads white with the `--grid-line` outline at ground level; water as in the 2D view. The plot keeps its blue border and dots, drawn over everything (as the 2D view draws them). People are `--black` figures, cars white boxes with grey edges.
- **Data:**
  - `/api/geo/plot` buildings now carry the 3DBAG `height` (it was dropped before).
  - New `GET /api/geo/streets?s&w&n&e` (`fetchStreets` / `parseStreets` in `server/src/geo/osm.ts`): OSM highway lines through the same Overpass client and query form as `/details`, box clamped to 0.03°, cached via `cachedJson` (`data/cache/_geo/streets-*.json`; the demo plot's file is there now). Cars drive motorway…residential + living_street (keeping right, 1.6 m); people walk footway / path / pedestrian / living_street and pavements generated 1.5 m beyond each residential…primary carriageway, cut where they would cross a building or water. No streets (offline miss, Overpass down) = no traffic, everything else unchanged.
- **Code:** pure, tested modules `model/modelData.ts` (plot → local metres around the 2D view's centre, every layer clipped to the square with polygon-clipping; ripple order; envelope scene-RD → lon/lat → local, so RD's ~0.8° grid rotation does not shift the ghost) and `model/movers.ts` (Liang–Barsky line clipping, pavement offsets, graph from shared OSM nodes, movers that pick a random way at junctions, turn at inner dead ends and respawn at the model's edge). Timing and colours in `model/modelStyle.ts`.
- **Hand-over:** the 3D copy is built hidden 800 ms after the rules have loaded (`prewarmMs`; `frameloop="demand"` until it starts). Building it stalls the page for ~1 s, which is now spent while the user reads the rules: click → start measured at 13 ms (was 1.2 s), then 60 fps (median frame 16.7 ms) at 1622×862, dpr 1. A click before the prewarm builds it at once (`model: "waiting"`). Checked in the browser that the hidden 3D top view and the 2D map have the same rectangle (479×607) and line up.
- **Other:** `vite.config.ts` pre-bundles `three/examples/jsm/utils/BufferGeometryUtils.js`; without it the first dev visit reloaded the page in the middle of the flow.
- **Checks:** 413 tests (+ grid square/lerp, modelData 6, movers 8, streets route 1), typecheck, build. Browser (Hendrik Casimirstraat 8, Delft): full flow, final iso model with envelope ghost, people on the pavements and footpaths, cars on the street, orbit zoom.
- **Decisions / deviations:** heights unknown in 3DBAG draw as a flat 0.2 m footprint (visual context only, not a planning value). The model square's half side covers the whole 2D view at the hand-over (`0.51 × max(w, h) / px-per-m`), so the iso view shows a diamond ~1.3 × `frameM` wide. No SPEC deviation (the site model is a landing-flow view; the studio viewer is unchanged).
- **Open issues:**
  - The continue arrow of the site model's own next step does not exist yet: the model is the end of the landing flow for now; the logo reloads.
  - No back arrow from the model to the rules.
  - People and cars do not avoid each other; cars pass through each other at junctions.
  - Reduced motion: jumps to the final model, no traffic.
  - Overpass can be slow for a first visit to a new site (the traffic appears when the streets arrive). Commit `data/cache/_geo/streets-*.json` for the demo site if it must run offline.
  - Mac / dpr 2 not checked: lines use drei `Line` (1 CSS px), points are 1.5 CSS px.
- **Next:** decide what the model screen leads to (brief input / "Generate directions" in this window?), and whether the envelope ghost should follow live edits of the rules there.

## Landing: site model as a pannable world (UI side session, 2026-10-17, replaces parts of the entry above)
- **Changed on the user's review:**
  - **No cars.** `movers.ts` now builds only the walking graph (`walkGraph`, was `trafficGraphs`); people only (up to 120, 1 per 25 m of path/pavement).
  - **The model fills the window, no square base.** The ground (`--background`) runs 8× past the data, without an outline. The surroundings come from a second plot request with a wider radius: `GET /api/geo/plot?id&r=` (new optional `r`, 50–400 m; `fetchPlot(..., { radiusM })`), radius `contextRadius(frameM)` = 2.2 × frameM within 180–400 m (`modelStyle.context`). Landing starts that request as soon as the rules window opens; when it fails the model falls back to the 2D plot's data (and the limits then zoom in). Delft demo: 575 buildings, 9.1 s on the first (uncached) request, 211 kB.
  - **Pan and zoom limits keep the end of the data out of view.** `viewLimits(w, h, frameM, radius)`: the end view shows 1.15 × frameM across the window (closer than before). Zoom-out stops at 0.8× the end view, the tilt at 62°, and pan stops `0.3 × view width` from the plot (`PanLimit` clamps the orbit target). At the furthest zoom-out, steepest tilt and furthest pan, the visible ground still lies within 95 % of the data radius (unit-tested for frames of 90–600 m). Left drag pans over the ground, right drag turns, wheel zooms; one finger pans on touch.
  - **White wash at the edges**, the same as the 2D views: a CSS overlay (`.site-wash`, four gradients, 56 px, quadratic falloff = `globeStyle.vignetteWidth`), so the hand-over still matches.
  - **Simpler context buildings** (`mergeBlocks` in `modelData.ts`): footprints that touch (corner within 0.3 m of the other's wall) and are within 1.5 m in height become one block. Corners are first snapped onto the neighbour's wall so that the union closes; the block height is the area-weighted mean. Every outline is then simplified (Douglas–Peucker 0.6 m), holes under 9 m² and pieces under 2 m² are dropped. Unknown heights and the plot's own building(s) stay separate. Delft: 575 → 237 blocks, ~6 corners each, 80 ms. Terraces now read as one volume without party-wall lines.
  - **Rendering:** all buildings are one merged mesh plus one `LineSegments2`; the ripple rise runs in the vertex shader (per-vertex `aRise` = order, height; `onBeforeCompile` on the basic and line materials). This replaces ~2 objects per building. The ripple spreads over 1 × frameM from the plot (`rise.rippleFrames`), so the far context is up at once.
- **Checks:** 419 tests (+ merge/simplify 3, limits 3, `r` on the plot route), typecheck, build (SiteModel chunk 38.5 kB). Browser at 1440×928 (Hendrik Casimirstraat 8): the model fills the window with the edge wash; at the furthest zoom-out with a full pan, no plane edge or end of the data shows.
- **Not checked:** the steepest tilt in the browser (right-drag is not available in the test tool; covered by the limits test only); frame rate at the new size (the preview pane was hidden and throttled during the run); dpr 2 / Mac.
- **Open:** the back arrow from the model to the rules (asked earlier, not built yet). Cache for the wider demo request is in `data/cache/_adhoc/` (git-ignored); seed it into the demo site cache if the demo must run offline.

## Landing: site model lighting trial (UI side session, 2026-10-17)
- **Built:** five lighting looks for the site model, switchable live with a small control at the bottom left of the model window (and keys 1–5); the choice is remembered per browser (`localStorage` key `massing.siteLook`). Presets are in `LOOKS` (`model/modelStyle.ts`):
  1. **Lines**: the flat line drawing as before.
  2. **Sun** (like reference 1): crisp shadows falling to the right, light grey walls, grey edges. Sun at azimuth 300°, 40° high.
  3. **Soft** (like reference 2): shadows to the left, soft edges (PCF radius 4), N8AO ambient occlusion, faint edges. Sun 135°, 38°.
  4. **Low sun**: long shadows to the left, grey edges. Sun 150°, 18°.
  5. **Shaded**: no edges, stronger face contrast, AO. Sun 135°, 38°.
- **How:** lit looks use a Lambert material on the merged building mesh plus an ambient light and a shadow-casting sun (4096² map covering the model square). Intensities are × π because three r186's Lambert divides by π, so a preset's `ambient` / `sun` read as fractions of white. Ground shadows come from a shadow-only plane just above the ground layers, so roads and ground keep their exact colours in the sun. The shadow pass uses a depth material with the same rise shader, so the shadows grow with the buildings; people cast shadows too. The plot border and dots moved to the transparent pass, so the shadow plane never covers them.
- **Finding:** the camera looks north-east, so a sun behind it (south-west) hides every shadow behind its building. Shadows only read when they fall sideways across the view (south-east or north-west). Shadows to the right need a north-west sun: graphic, not a real Dutch sun.
- **Checks:** 419 tests, typecheck, build (SiteModel chunk 40.9 kB). Browser at 1440×928: all five looks screenshotted on Hendrik Casimirstraat 8.
- **Open (trial):** with AO on (Soft, Shaded) the effect composer mutes the roads and the plot dots a little; the hand-over from the 2D map was only checked for the Lines look; the switcher is a trial and should go once a look is chosen. No unit tests for the lighting (render-only).

## Landing: performance pass (2026-10-17, unattended run)
- **Built:** `?perf` probes (`landing/perf.ts`, overlay `PerfHud.tsx`; zero cost without the flag): draw times per phase and per draw section, named heavy calls, main-thread long tasks; `__perf.summary()` in the console. Globe stages got names (`pan`, `blue`, `hold`, `waitData`, `warmDots`, `zoom`, …). Profiled the full flow and fixed the worst items; numbers and the ranked rest in [docs/PERF_REPORT.md](docs/PERF_REPORT.md).
  - Country/city tile geometry (union/difference/closing of the water) in a module Web Worker: `globe/tileGeometry.ts` (pure, tested), `tileWorker.ts`, `tileJobs.ts` (falls back to the main thread). Country pick: 440 ms freeze in the pan → none.
  - `DotLayer` caches the city inside test per dot; the city override is staged and warmed with the dots, then committed at the blue (`stageOverride` / `commitOverride` / `dropStagedOverride`). City-view frames 37–72 ms → 7–13 ms; city step long tasks 2 → 0.
  - Server: `hono/compress` (JSON ~4× smaller). Client: `once()` in `geoApi.ts` shares requests per URL; `fetchScene` shares for 60 s; prefetch of the city boundary (typed name), the plot (picked/highlighted address), and scene + wider plot once the plot has landed. The rules window now opens with its data already loaded.
  - `.gitignore` keeps the demo address's two plot answers (`data/cache/_geo/plot-aeb2ca8e90d3.json`, `plot-813661c43408.json`) so the demo runs offline on a fresh clone.
  - `.claude/launch.json`: `massing-api-5` / `massing-web-5` (ports 8811 / 5195), since another session held 8801.
- **Checks:** 434 tests (+10: dot inside cache, staged override, tile geometry ×4, gzip, `once` ×3), typecheck, build (worker chunk `tileWorker-*.js` 32 kB). Browser (1024×768, dpr 1): full flow with zero long tasks from country to plot; screenshots of the city view, plot and rules unchanged.
- **Decisions:** no visual or timing change anywhere; prefetches wait for the plot flight to land (parsing during the zoom would cost frames); the scene memo is time-limited (60 s) so the studio still reloads a changed site.
- **Deviations from SPEC.md:** none.
- **Open issues:** rules-window prewarm still blocks 52–97 ms (model build; next: worker for `buildModel`/`walkGraph`); `makeLayer` 39 ms on the main thread at the country pick; worker not checked in the production server build (dev only; the build emits it); dpr 2 / Mac not measured; one ~36 ms frame at the city blue.
- **Next:** see the ranked list in docs/PERF_REPORT.md; first the site-model prewarm worker.

## Landing: site-model prewarm off the main thread (2026-10-17, side session)
- **Built:** the hidden site-model prewarm while the rules window is open no longer blocks the page (PERF_REPORT "Not fixed" item 1).
  - `model/modelWork.ts` (pure jobs): `prepareModel` = `buildModel` + the buildings' three.js geometry as typed arrays; `walkJob` = streets lon/lat → local → `walkGraph` (the `blocked` test is rebuilt from polygons in the worker, a function cannot cross). `modelWorker.ts` runs them and hands the geometry buffers over (transfer, no copy). `modelJobs.ts`: `prepareModelAsync` / `walkGraphAsync` / `modelGraph` (fetch streets + walk), same pattern as `globe/tileJobs.ts`: module worker, main-thread fallback when `Worker` is missing or fails, and one shared job per input (StrictMode asked twice).
  - `model/buildingGeometry.ts`: `shapeOf` / `prism` / `edgePoints` moved out of `SiteModel.tsx` unchanged; `buildingArrays` (the old `buildingGeometry` memo body, in the worker) and `buildingGeometries` (wraps the arrays as `BufferGeometry` + `LineSegmentsGeometry`, no copying, ~1 ms).
  - `SiteModel.tsx`: the outer component waits for the prepared model, then mounts `ModelView` (the old body). No canvas, no first frame and so no `onReady` before the model is there, so `modelReady` / `model: "waiting"` behave as before. When inputs change later, the last model stays up until the new one is in. People wait for the worker's graph.
  - `Precompile`: the canvas starts with `frameloop="never"` and calls `gl.compileAsync(scene, camera)` (`KHR_parallel_shader_compile`) in a task of its own; only then does the frame loop start and `FirstFrame` fire. The first frame no longer compiles shaders itself.
- **Measured** (`?perf`, massing-api-5 + massing-web-5, 1024×768, dev build with StrictMode, Netherlands → Delft → Hendrik Casimirstraat 8 → Go):
  - Before: rules phase 5 long tasks (108, 108, 91, 106, 78 ms). `buildModel` ×4 (max 61 ms), `buildingGeometry` ×2 (35 ms), `walkGraph` ×2 (22 ms).
  - After: rules phase **0 long tasks** (and 0 in plot and model:on through the hand-over). Worker wall times: `prepareModel` ~240 ms, `walkGraph` ~27 ms. Main thread: `buildingGeometry` ~1 ms, `compile` 7 ms, `compileAsync` 18–38 ms wall.
  - Steps on the way: worker only → 2–3 tasks (63–90 ms: canvas mount with `buildingGeometry` ×2, first frame's shader compile 50 ms). Geometry in the worker → 1 (first frame 50–74 ms). + `compileAsync` → 0–1 (51–53 ms: mount + sync compile in one task). Compile in its own task → 0.
- **Checks:** 441 tests (+7 in `modelJobs.test.ts`: a fake `Worker` runs the real `modelWorker.ts` with structured clones and transfers, and its model, geometry arrays and graph equal the direct calls; error fallback; one job per input; geometry wrapping), typecheck, build (`modelWorker-*.js` 417 kB, 124 kB gzip). Browser: hand-over to the model screenshotted in Lines and Sun, looks as before.
- **Decisions:** the geometry went to the worker instead of idle-callback slicing (no main-thread cost left to split). Three.js core geometry runs in the worker; nothing there touches WebGL. The `.catch` on `modelGraph` drops a failed street fetch from the cache, so a remount retries as before.
- **Deviations from SPEC.md:** none.
- **Open issues:**
  - The canvas mount itself (R3F + WebGLRenderer + scene objects) is ~45 ms in dev with StrictMode. Under 50 ms in every run measured, but close; production has no double render.
  - Switching to a lit look in the model (key 2) still costs one ~52 ms task (lit/shadow shaders, 4096² shadow map). It was like that before and happens outside the rules phase.
  - The worker chunk pulls in zod and proj4 through the `@massing/shared` barrel (`modelData.ts` imports `openRing` / `rdToWgs84` / `wgs84ToRd` for `envelopeRings`). It could be slimmed with a narrower import.
  - `docs/PERF_REPORT.md` still lists this as "Not fixed" item 1 (left untouched; this session's scope was `model/` + PROGRESS.md).
  - Production build not measured in the browser.
- **Next:** PERF_REPORT item 2 (`makeLayer` on the main thread at the country pick), or update the report with the numbers above.

## Landing: rules window restyled to the Figma table (2026-10-19)
- **Built:** `RulesPanel.tsx` + the rules block of `landing.css` follow Figma "Plot found + rules window" (node 19:2): header "Zoning and limits" with plot chip and address, rows of title · value · status tag · source (160/96/96/128 px), grey sub-rows for street/side/rear, "More limits" row, band with "N fields need input", "Fill with suggested values" and the arrow. Icons in `assets/rules/`.
- **Decisions:** values are inline text fields (no slider), coverage is typed as a 0–1 ratio; Setbacks row toggles its three sub-rows; "More limits" holds max gutter height and street side and opens by itself while one of them is missing; "Zoning plan ↗" links to the first plan text URL, parking links to the policy; an overridden or placeholder row shows its source with a reset icon; PLACEHOLDER tag (outlined) is not in the design.
- **Deviations from SPEC.md:** none.
- **Open issues:** the indicative-only note sits at the end of the scrolling list; plan values can arrive in Dutch ("Wonen"); checked in the browser with real Delft data driven through the store, not through the animated flow.
- **Next:** compare against the Figma at 1440×928 by eye; decide if the "indicative" note belongs in the band.
- **Rules window follow-up (2026-10-19):** allowed functions are shown in English (`shared/src/constraints/functions.ts`, `translateFunction`; applied to the plan provider and to extracted values, the quote keeps the Dutch); the list no longer scrolls (13 whole cells, header 95 px + window border, column widths 159/97/96 so row and cell borders land on grid lines; more than 3 functions show as 2 chips + "+N"); the address is two lines and "2628 SJ Delft, NL" never breaks; the "Indicative only" note is gone; gutter height and street side appear only after "+ More limits" is clicked.

## Landing → Directions hand-over (2026-10-20)
- **Built:** the site-model screen (last landing screen) has a "Directions" button, bottom right, once the model is live. It sets `#studio/directions`; `Root` opens the studio there (`client/src/routes.ts` holds the hash constants), `App` starts on the Directions tab.
- **Decisions:** `App` only calls `load()` when no scene is in the store, so the address, rules and overrides filled in on the landing carry over instead of being replaced by the default site. Plain `#studio` still opens the Site tab.
- **Deviations from SPEC.md:** none.
- **Open issues:** the button is a plain blue label, not yet from the Figma; browser back from the studio returns to the landing at its first step (state is kept in the stores but the globe restarts).
- **Checks:** 441 tests, build.
- **Next:** design the button in Figma; decide whether back from Directions should return to the model screen.

## Studio rebuilt in the landing's design language (2026-10-26, unattended run)
- **Asked first (user's answers):** rebuild Directions + Present and drop the old Site / Constraints tabs (the landing covers them); no Figma frames, so the landing's language is extended by hand; the 3D matches the landing's site model (line drawing, blue proposal), exports too; go live on the main Render site (master).
- **Built:**
  - `client/src/studio/`: the studio shell on the landing's 32 px page grid (`layout.ts` + tests: viewer window left, panel window right, one cell apart, centred, one free row under the logo, 19–25 rows tall), `ViewerWindow.tsx` (canvas, white edge wash, Envelope / Fit view tools, PLACEHOLDER DATA tag, and an input band with the A/B/C option buttons and the computed key numbers), `PanelFrame.tsx` (the rules window's frame: grow-in, header with heading / plot chip / back arrow / address, three tabs, table body, band with a scrambling status line, outlined button and the blue labelled arrow), `rows.tsx` (rules-table rows: line sliders with a typed value, choice cells, on/off box, menu pick, read-only values, PASS / FAIL / UNKNOWN tags, notes), `studio.css`.
  - Screens (hash routes in `routes.ts`, tested): `#studio/rules` = the landing's rules window, reused (`RulesPanel` got `onContinue` / `continueLabel` / `onBack` / `instant` props and `useSiteHeader()`); `#studio/directions` (Brief: brief + "Read brief", priorities, programme · Option X: the AI's name, intent and trade-offs, then the option's sliders · Check: computed numbers, rule check, clamps, assumptions; band: "Generate directions" + "Present"); `#studio/present` (Camera: presets, projection, saved view · Look: Lines / Sun, context, outline, toggles, sun date/time/softness/AO · Output: frame, resolution, size, report narrative toggle; band: "Write PDF report" + "Export PNG"). The design frame sits on the page background inside the viewer window. Plain `#studio` opens Directions.
  - Landing hand-over: the site model's "Directions" is now the blue labelled arrow on the grid (5 cells, one cell in from the model window's corner); the studio chunk preloads while the model animates; the studio's viewer window travels from the model window's place (1 200 ms) and then the panel grows in. A grid fallback shows while the chunk loads. Back from the studio to the landing reloads the landing (its globe cannot resume mid-flow); the logo does the same.
  - Viewer: `renderStyle` has `look: "lines" | "sun"` and token colours. Lines: context as one merged mesh, flat white with #DFDFDF edges (`EdgeLines`, fat lines in CSS px so exports keep the weight), parcel white with blue outline and dots, envelope blue dashed ghost, proposal in the blue token lit by a fixed light (roof full blue, walls darker) with 1 px white edges; a `RenderPass` draws the frame when no effect composer does (the label layer takes the loop over). Sun: the old lit pipeline in the same colours. Default camera: the site model's isometric from the south-west at its end-view scale.
  - Labels, watermark and the PDF in the tokens (blue tags, ABC Areal for labels, blue for failed rules).
- **Removed:** `client/src/screens/*` (old Site, Constraints, Directions, Present screens, AiPanels, controls, panel).
- **Checked:** 448 tests (+7: studio layout 5, routes 2), typecheck, build. Browser at 1440×928 (also 1280×800 and 1920×1080): full flow Netherlands → Delft → Hendrik Casimirstraat 8 → rules → model → Directions (hand-over), Generate directions (AI answered, tab switched to the option), typology menu, sliders (clamps shown in Check), rules screen in the studio (edits move the envelope live), Present in both looks, PNG export (opened and checked), PDF report with narrative (30 s).
- **Deviations from SPEC.md:**
  - §9: Site and Constraints are no longer studio tabs (the landing's globe + rules window do that work; the rules window is reachable from Directions' back arrow). The "Extract rules (AI)" diff panel and the parking-zone picker had their UI on the old Constraints screen and are **not reachable any more** (store code kept: `aiStore.extractRules`, `siteStore.setParkingZone`).
  - §10: default look is the flat line drawing (user's choice), the proposal is always the blue token with a white outline (no per-option colour, no colour picker; `MassingParams.colour` is ignored by the viewer). The sun look keeps shadows + AO.
  - §9 Directions: inputs, option and metrics share one panel with tabs (not left + right columns). The side-by-side compare view still does not exist.
- **Open issues:**
  - The 3D context in the studio is the scene's 3DBAG set, not the landing model's OSM roads / water / walkers, so the picture changes a little at the hand-over (same angle, scale and look).
  - Below ~1060 px wide the windows overlap the page edge (as on the landing); below 832 px tall the page scrolls.
  - Proposal light is fixed (south-west view in mind); from the north-east all walls are the darker blue.
  - Not checked on macOS / dpr 2. The landing's Lines / Sun trial switcher in the site model is still there.
- **Next:** review the studio by eye against the landing; decide on the compare view and whether "Extract rules" should come back (e.g. a row in the rules window's band).

## Studio around the landing's site model (2026-10-26, second pass)
- **Asked first (user's answers):** keep the 3D intro after "Start exploring", then open Directions around it; the landing's renderer everywhere (Directions, Present, PNG and PDF images); Lines / Sun as a row in the left panel; the output is always the square, resolution 1× / 2× / 4×.
- **Built:**
  - Rules window: "N fields need input" and "Fill with suggested values" stay hidden until the last row has unscrambled, then fade in together over 1.2 s (the count line's fade was being overridden by `label.t-label`'s transition).
  - "Start exploring" sets `#studio/directions`: the window becomes the square, the model's intro plays, and once it can be turned the studio's panels grow in at both sides. The separate "Directions" arrow and the Lines / Sun buttons on the model are gone.
  - Layout (`landing/grid.ts` `SQUARE` + `modelWindow`, `studio/layout.ts`, tests): the square is the landing's model window (19 cells at 1440×928, unchanged); it grows to 25 when both panels fit at 15 cells, shrinks so they keep 11 (1280 → 14). Panels are one cell from the square, as tall as it. Rules screen: the square slides left (600 ms, both ways) and the landing's rules window opens at its right.
  - `SiteModel` is the studio's only renderer now: look from the store, the shown option's mass (`ProposalVolume`, placed with one scene→model matrix from `sceneToModel`, tested against `envelopeRings`), rising with the people; envelope switch; label layer (Present); `siteView.ts` handle for presets (SW/SE/NE/NW/Top at the end-view zoom), saved views (per plot, relative zoom) and captures. A capture renders the same frame at a higher pixel ratio, then paints the edge wash, labels and the placeholder watermark (exports only; nothing on the viewport).
  - Panels: Directions = left `DirectionsControls` (Brief · Option X sliders with an A/B/C picker · View: Lines/Sun, envelope, start view; band "Generate directions") + right `OptionInfo` (tabs A/B/C with failed-rule counts; AI direction, parameters as set, computed numbers, rules, clamps, assumptions; header chip "Rules met / N rules not met", GFA, FAR, height; band arrow "Present"). Present = left `PresentControls` (Camera: presets, start view, saved view · Look: Lines/Sun, envelope, street name, annotations) + right `PresentOutput` (option, resolution, size, report narrative; band "PDF report" + "Export PNG"). `PanelFrame` fits 11–15 cells (narrow rows: 4-cell titles; band buttons shrink).
  - `#studio/…` opened directly (reload): the default site loads, its address is looked up for the plot, and the model starts at its end view (`landing/restore.ts`).
  - The studio chunk (panels, report writer) loads while the intro plays; the landing's own bundle is 378 kB again.
- **Removed:** `App.tsx`, `studio/ViewerWindow.tsx`, the R3F studio viewer (`viewer/Viewer`, `CameraRig`, `SceneContents`, `ContextModel`, `Ground`, `EnvelopeGhost`, `Effects`, `Sun`, `ExportCanvas`, `cameraHandle`, `project`) and its camera presets/tests; `renderStyle` keeps look, proposal and labels only.
- **Checked:** 437 tests (−11 with the removed viewer's camera/frame tests, +6 layout/sceneToModel), typecheck, build. Browser at 1440×928 (plus 1920×1080 and 1280×800): globe → Delft → Hendrik Casimirstraat 8 → rules (fade checked mid-way) → Start exploring → intro → Directions; Sun look (proposal casts its shadow), sliders and roof update the mass, back to rules (square slides), Present with labels, presets Top / SE, PNG 2160 px (opened: same view, wash, labels, watermark), PDF report, option C capture shows C; direct `#studio/directions` reload.
- **Deviations from SPEC.md:**
  - §10: Present lost perspective / eye level, the grey context, outline width, sun date/time, softness and AO: the site model's renderer has none of them (user's choice to use it everywhere). The PDF renders every option from the view on screen (not a fitted SE preset); the cover is that view at 2×.
  - §10: the export frame is always the square (no 4:5 / A3).
- **Open issues:**
  - During a PDF report the square briefly shows options B and C while they are captured.
  - The square's labels are CSS-px sized, so on a small square (1280 wide) they cover more of the model.
  - The proposal light is fixed for the south-west view; the Sun look's sun is the landing's graphic north-west sun, not the real date/time.
  - Not checked on macOS / dpr 2; not deployed (nothing committed this pass).
- **Next:** review by eye; commit and push to master for Render.

## Rules window opens beside the map; narrower studio panels (2026-10-26)
- **Built:** `besideRight` (`landing/grid.ts`): when the rules window opens, the globe/map window stays where it is and the rules window opens one cell to its right; only when the page is too narrow for both (1440 wide: by 4 cells) the window moves left, just enough. The studio's rules screen does the same with the model's square. Studio side panels are 11 cells wide at every size (`SQUARE.panelMax = 11`; Directions and Present); the square still grows to 25 on big pages. Option panel titles shortened to fit (GFA, FAR, Max height, In envelope…).
- **Checked:** 440 tests (+3 layout), build. Browser at 1920×1080: address → rules (window left edge 704 px before and after), Start exploring → Directions and Present with 11-cell panels, studio rules screen keeps the square in place.
- **Open:** at 1440 the map still shifts 4 cells left when the rules open (the pair does not fit otherwise).

## Directions: four presets + Custom (2026-10-27)
- **Asked first (user's answers):** presets Most homes · Most daylight · Most garden · Lowest profile; Custom holds one AI option from the brief + priorities that can be adjusted, deleted and generated again; the right panel follows the left tab (its redesign comes later); programme rows only on Custom. The View tab is gone. Every change is pushed to master so Render deploys it.
- **Built:**
  - `shared/src/massing/presets.ts` (+ tests): `PRESETS` (tab, name, intent, trade-offs, wished params) and `presetParams(id, envelope, rules, site)`: coverage capped at max coverage, "max" floors = what the generator can build (12 asked when a height limit is known, 6 when not), so a preset starts without clamps. Homes = courtyard, max floors, 0.70, 12 m, street, flat. Daylight = slab, east–west, 9 m, 5 floors, 0.35. Garden = slab, max floors, 0.20, 12 m. Low = L-block, 3 floors, pitched, 0.45, 10 m.
  - Option ids are `homes | daylight | garden | low | custom` (`PRESET_IDS`, `OPTION_IDS`). The strategy generator returns one option (`GenerateDirectionsResult.option`, prompt `strategyGenerator.v2`, id "custom", no contrast retry); the fixture is the v1 recording's first option. Report requests take up to 5 options.
  - `massingStore`: `edits` per preset (slider changes on top of the site-fitted preset; reset clears them), `custom: { direction, edits } | null`, `useOptionParams` / `optionParams` / `useOptionText` / `optionText`. `aiStore.generateDirections` sets the custom option and opens its tab; `deleteCustom` clears it.
  - Directions left panel: tabs Homes · Daylight · Garden · Low · Custom, the same shape rows on every tab (the old Option A/B/C picker is gone). Custom shows brief, priorities and programme until an option exists, then its sliders, Reset and "Delete option". "Generate option" (the band button) only shows on Custom without an option. Right panel: no tabs, shows the left tab's option ("Changed by hand since the preset").
  - Present: option picker is a menu with the five names (Custom disabled until generated); the AI narrative no longer needs generated directions (presets carry their own words). Labels, PNG name and PDF use the option names.
- **Checked:** 443 tests (+5 presets, −2 three-option strategy tests), typecheck, build. Browser 1440×928 (massing-api-5 + massing-web-5; `npm run dev`'s `tsx watch` server did not start here): every tab, slider edit → "changed by hand", Generate on Custom (live answer "Sunlit Low Slab", cached in `data/cache/placeholder/`), Delete back to the brief.
- **Deviations from SPEC.md:** §7/§9 the strategy generator proposes one option instead of three contrasting ones; contrast now comes from the four code-set presets.
- **Open issues:** on the tiny placeholder plot (111 m²) the presets look alike because the envelope clamps them; the cached v1 directions answers no longer replay (v2 prompt), so offline Custom needs a new cached answer per brief; right panel redesign pending (user).
- **Next:** the user's instructions for the right panel.
