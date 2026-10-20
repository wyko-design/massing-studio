# Landing flow — performance report (2026-10-17)

Measured with the new `?perf` probes (see "How to measure" below) on Windows, Chrome (preview pane), 1024 × 768, dpr 1,
warm server cache, dev build. Flow: globe → Netherlands → Delft → Hendrik Casimirstraat 8 → rules → fill placeholders → site model.
Long tasks are main-thread blocks > 50 ms (CPU time, so they are reliable even when the pane is throttled); draw times are
`GlobeRenderer.draw()` per frame (16.7 ms is the whole frame budget at 60 fps).

## Hotspots found (before)

| # | Phase | What | Cost | Cause |
|---|---|---|---|---|
| 1 | Country pan | One **417–440 ms freeze** in the middle of the pan | long task | Country tiles processed on the main thread: `mergeWater` (union of every water body) 205 ms, `waterOutside` (difference) 120 ms, `closePolygons` 64–72 ms, `makeLayer` 41 ms |
| 2 | City view, address pan / blue | **36–72 ms per frame** (15–25 fps) | draw | `dots.draw` ran the city's point-in-polygon test (`insideTest`, thousands of vertices) for every Dutch dot, every frame, uncached |
| 3 | City blue | One ~50 ms frame + 50–60 ms long tasks | draw / long task | `applyOverride` at the blue cleared the override cache: every dot re-tested (water index + city boundary) in one frame; zoom frames up to 49 ms for the inside test on the finer dot level |
| 4 | Rules window open | 77–109 ms long tasks (×4) | long task | Hidden site-model prewarm: `buildModel` ~87 ms (×2 in dev, StrictMode), building geometry ~30 ms, walk graph ~30 ms |
| 5 | Network | Uncompressed JSON; `/api/scene` fetched twice; scene + wider plot only requested when the rules open | wait | No `compress` middleware; StrictMode double effect; no prefetch |
| 6 | Demo offline | Demo plot answers git-ignored (`data/cache/_geo/plot-*`) | — | A fresh clone (the Mac) recomputes them from upstream (3.6 s for the wider plot, more without the upstream cache) |

## Fixed (after)

| # | Fix | Before → after |
|---|---|---|
| 1 | Country and city tile geometry moved to a module **Web Worker** (`globe/tileGeometry.ts` pure functions, `tileWorker.ts`, `tileJobs.ts` with main-thread fallback). The renderer awaits it inside the existing tile `.then`, guarded by the same tokens | Country pan: 440 ms freeze → **no long task** (the worker takes ~530 ms wall time while the pan keeps running; it finishes before the zoom as before) |
| 2 | `DotLayer` caches the `inside` answer per dot while the same test function is passed (cleared when it changes or the lattice changes) | Address pan/blue: 37–45 ms → **7–13 ms** per frame; final city frame 48 → 7 ms |
| 3 | The city override is **staged** when the city data is ready and filled by the time-sliced dot warm-up (which now also warms the inside test); the blue switches to it with its cache (`stageOverride` / `commitOverride`) | City: 2 long tasks (50–60 ms) → **0**; zoom frame max 38–49 → 24 ms; blue spike 48–51 → ~36 ms (one frame) |
| 5a | `hono/compress` on the server | tiles 907 → 238 kB, scene 257 → 68 kB, wider plot 204 → 63 kB, plot 67 → 20 kB |
| 5b | Shared requests: `once()` in `geoApi.ts` (one promise per URL, failures forgotten, 32 newest kept); `fetchScene` shares a request for 60 s | `/api/scene` 2 requests → 1 |
| 5c | Prefetch: city boundary while the typed name points at a city (300 ms pause); the plot of a picked/highlighted address; scene + wider plot as soon as the plot has **landed** (not during the flight, parsing would cost frames) | Rules window opens with its data already there: no request at open (was scene 180–490 ms + wider plot) |
| 6 | `.gitignore` now keeps the two demo plot answers (`plot-aeb2ca8e90d3.json`, `plot-813661c43408.json`) | Demo runs without upstream on a fresh clone |

Whole flow after the fixes: **zero long tasks** from the country pick to the plot. All visuals unchanged (same timings,
easing, colours, geometry; checked by screenshot at the city and plot steps and the site model).

## Not fixed — next candidates (ranked)

1. **Site-model prewarm (rules window): 52–97 ms long tasks.** Move `buildModel` (mergeBlocks: polygon-clipping +
   simplify) and `walkGraph` into a worker the same way (`model/modelData.ts` is already pure). Geometry building
   (three.js) stays on the main thread but could be split over idle callbacks. Felt as input lag if the user drags a rules
   slider right then. Halved in a production build (no StrictMode double render).
2. **`makeLayer` on the main thread: 39 ms (country), 19 ms (city)** — one or two dropped frames in the pan. The worker
   could also return the shore chains and the borders clipped to land (it would need its own water index); the main thread
   then only builds pieces and the `inWater` index.
3. **Draw cost on a dpr-2 screen (the Mac).** Not measured here (dpr 1). Every draw fills/strokes at full device
   resolution; if the Mac shows dropped frames, render at ≤ 1.25 dpr during flights and restore on the frame the camera
   stops, and cache static layers in an offscreen canvas while parked.
4. **One ~36 ms frame at the city blue.** Probably warm-up not finished when the pan frames are throttled; could wait in
   the `waitData` stage for the first warm generator to finish (invisible, the screen is still).
5. **Site model rendering cost** (4096² shadow map, N8AO `quality="high"` for the lit looks) — not profiled; the R3F
   frames are outside the probes. Worth a pass once a look is chosen.

## How to measure

- Open the app with `?perf` (e.g. `http://127.0.0.1:5173/?perf`). A small overlay (bottom right) shows the phase, draw
  p95 over 2 s and long tasks over 10 s. Without `?perf` the probes are plain calls (no observer, no timers).
- In the console: `__perf.summary()` → `byPhase` (draw p50/p95/max and long tasks per phase, e.g. `toCity/zoom`),
  `bySection` (draw split into fills / dots / lines / outlines / vignette), `byCall` (named heavy calls, worker wall
  times), `longTasks`. `__perf.reset()` clears.
- Phases are the landing phase plus the globe's stage (`pan`, `blue`, `hold`, `waitTiles`, `waitData`, `warmDots`,
  `zoom`, `zoomOut`), `rules`, `model:on`.
- The preview pane throttles rAF to ~1 fps at times; trust long tasks and draw ms over frame counts there.
