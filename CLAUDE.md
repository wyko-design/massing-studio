# CLAUDE.md — Massing Studio

Group prototype for the TU Delft Generative AI Design course.
- Source of truth: [SPEC.md](SPEC.md). Where this file and the spec disagree, the spec wins. Log the conflict in PROGRESS.md.
- Session handoff log: [PROGRESS.md](PROGRESS.md).

## Every session
- **Start:** read CLAUDE.md, SPEC.md, then PROGRESS.md (the latest entry tells you what to run next).
- **End:** run tests + build, then append a PROGRESS.md entry: built, decisions, deviations from SPEC.md, open issues, next prompt.

## Core rule (SPEC §7): numbers come from code, words and choices come from the model
- The LLM never outputs geometry or computed metrics. It chooses parameters, writes text and extracts quoted rules.
- Every LLM response is parsed against a zod schema or rejected.
- Any number in a prompt, report or UI text is injected from computed values.
- The deterministic generator clamps LLM-chosen params to constraints and records every clamp.
- Sliders never call the LLM. Only "Generate directions", "Interpret brief" and "Write report" do.

## Working rules (SPEC §13)
- Build milestone by milestone (M0 → M7). Don't start one before the previous one runs. Start each milestone in plan mode, keep diffs small, commit per milestone.
- Geometry and metrics get vitest unit tests before UI depends on them.
- No silent defaults for planning values: missing = `null` = shown as **unknown**. Every constraint carries provenance (`verified | extracted | assumed | user_override`).
- All geometry is in RD New (EPSG:28992) metres and shifted to a local origin at the parcel centroid before it reaches three.js.
- Every data source sits behind a provider interface (`Geocoder`, `ParcelProvider`, `ContextProvider`, `ZoningProvider`, `CodeRules`). NL/Delft is just the first implementation.
- Verify every external endpoint, parameter and field name against the provider's OpenAPI/docs before writing a client. Don't guess. Cache every response under `data/cache/<site>/`.
- Secrets only in `.env` (`ANTHROPIC_API_KEY`), read by the server only. Never in client code, never `VITE_`-prefixed.
- Reference images are in `docs/references/`. Compare renders against them at M0 and M5.
- Everything is "indicative". Never claim permit compliance or financial viability.

## Cross-platform (develop on Windows, present on macOS in Chrome)
- Node version pinned in `.nvmrc` and `"engines"` in package.json.
- LF line endings via `.gitattributes` (`* text=auto eol=lf`).
- Build paths with `path.join` / `path.resolve`. Never hard-code `\` or `/` separators. Treat file names as case-sensitive: imports must match file casing exactly.
- npm scripts are plain cross-platform commands: no PowerShell/cmd syntax, no `rm -rf`, no `set VAR=`. Use `rimraf` / `cross-env` if needed.
- Avoid packages with native binaries (`canvas`, `sharp`, anything built with node-gyp). The accepted exception is Vite/esbuild/rollup prebuilt platform binaries.
- `.env` stays out of git, and `.env.example` lists every variable.
- Commit `data/cache/<site>/` for the demo site so the app runs offline.
- Never copy `node_modules` between machines. Run `npm install` on each one.
- Server and Vite proxy use `127.0.0.1`, not `localhost` (macOS may resolve `localhost` to IPv6).
- Target Chrome.

## Stack (SPEC §6)
- **Repo:** npm workspaces with `client/`, `server/`, `shared/`.
- **Client:** Vite + React + TypeScript, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` (N8AO), zustand, suncalc.
- **Geometry:** planar math in RD metres (`shared/src/geo`), `@turf/*` (planar-safe functions only), `polygon-clipping` for booleans/offsets (from M2), `proj4` for CRS.
- **Server:** Hono on Node (`@hono/node-server`), proxied by Vite at `/api`. Handles LLM calls, external data fetching and the disk cache.
- **In-app LLM:** Anthropic SDK, model from `LLM_MODEL` (default `claude-sonnet-5-5`).
- **Validation:** zod schemas in `shared/`, used by both client and server.
- **Export:** offscreen render → PNG. `pdf-lib` or `jsPDF` for the report.
- **Tests:** vitest.

## Commands
Run from the repo root:
- `npm run dev`: server (127.0.0.1:8787) and client (http://127.0.0.1:5173) together
- `npm test`: vitest, all workspaces
- `npm run typecheck`: tsc in every workspace
- `npm run build`: typecheck + production build of the client
