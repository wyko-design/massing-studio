# Deploying Massing Studio for the team

One Node server serves both the built client and `/api`, so a single web service is enough. Teammates only need the URL and the shared password.

## Render (free tier, from the GitHub repo)
1. Push this repo to GitHub (`origin` is already `wyko-design/massing-studio`).
2. On render.com: **New → Blueprint**, pick the repo. It reads `render.yaml` and builds the `Dockerfile`.
3. When asked, set the two secrets:
   - `ACCESS_PASSWORD`: the shared password (browser user name is `massing`).
   - `GEMINI_API_KEY`: a free key from https://aistudio.google.com/apikey (the blueprint sets `LLM_PROVIDER=gemini`). Without it, the AI buttons (Generate directions, Interpret brief, Write report) fail. To use Claude instead, remove `LLM_PROVIDER` and set `ANTHROPIC_API_KEY`.
4. Share the `https://<name>.onrender.com` URL and the password.

Notes:
- Free instances sleep after ~15 min idle; the first load then takes about 30 s.
- `AI_HOURLY_LIMIT` (default 60) caps model calls across all users, so a leaked password cannot run up a large bill.
- Addresses other than the demo site are fetched live from PDOK and cached on the instance disk, which is wiped on redeploy.
- Redeploys happen on every push to the branch.

## Run the production build locally
```bash
npm run build
ACCESS_PASSWORD=pw npm start   # http://127.0.0.1:8787
```
