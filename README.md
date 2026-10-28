# Massing Studio

Group prototype for the TU Delft Generative AI Design course (IDEM307).

Enter a Dutch address and the tool retrieves the plot, the surrounding 3D buildings and the local planning rules, turns those rules into explicit design constraints, and generates contrasting building massing options in a 3D viewer. It exports a PNG and a PDF report. Everything it shows is indicative: it does not check permit compliance or financial viability.

The core rule is that numbers come from code and words and choices come from the model. The LLM picks parameters, writes text and extracts quoted rules. Geometry and metrics are computed deterministically, and every LLM answer is validated against a zod schema.

## Docs
- [SPEC.md](SPEC.md): the product and technical spec (source of truth).
- [CLAUDE.md](CLAUDE.md): working rules for building it with Claude Code.
- [PROGRESS.md](PROGRESS.md): the build log, one entry per session.
- [DEPLOY.md](DEPLOY.md): hosting on Render.
- [video/](video/README.md): the Remotion project for the demo video.

## Run it locally
Needs Node 24 (see `.nvmrc`).

```
npm install
cp .env.example .env
npm run dev
```

Then open http://127.0.0.1:5173. For the AI steps, either log in to Claude Code on the machine, set `ANTHROPIC_API_KEY` in `.env`, or set `LLM_PROVIDER=gemini` with a `GEMINI_API_KEY` (see `.env.example`). The demo site's data is cached in `data/cache/`, so it also runs offline.

Other commands: `npm test` (vitest), `npm run typecheck`, `npm run build`.

## Layout
- `client/`: Vite + React + three.js (`@react-three/fiber`) app.
- `server/`: Hono server for data fetching, the disk cache and LLM calls.
- `shared/`: geometry, metrics and zod schemas used by both.
