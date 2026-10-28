# Massing Studio — demo video

Remotion project for the IDEM307 submission video (1920×1080, 30 fps, H.264, under 3:00).
The demo part is a real recorded run of the app, not mock-ups.

## Pieces
- `scripts/script.json`: voiceover text per scene.
- `scripts/tts.mjs`: one MP3 per scene with msedge-tts (voice en-US-AndrewNeural) → `public/vo/`, and the measured durations → `src/voDurations.json`. Scene lengths come from these.
- `scripts/record.mjs`: walks the flow in headless Chrome on the GPU (Playwright, 1600×900 page at device scale 1.5). Frames come from the DevTools screencast. A cursor and click ripple are drawn into the page at runtime; the app's code is not touched. Step markers → `out/rec/markers.json`, exported PDF → `out/rec/report.pdf`.
- `scripts/encode.mjs`: frames → `public/demo.mp4` (real time, 30 fps), markers → `src/markers.json`, PDF → `public/report.pdf`.
- `scripts/pdfshots.mjs`: renders the exported PDF's pages with pdf.js → `public/pdf/page-N.png`.
- `src/edit.ts`: the cut list. Clips are given relative to the step markers, so a new recording with different AI wait times still cuts right. Camera keys handle zoom/pan, and each step gets a caption.
- `src/Slides.tsx`: title, motivation and reflection slides. `src/Demo.tsx` handles footage, zoom, captions and PDF pages. `src/Main.tsx` holds the timeline.

## Re-render
Run these from `video/`, with the app running (server on 127.0.0.1:8811, client on 127.0.0.1:5195; see `.claude/launch.json` → `massing-api-5` and `massing-web-5`):

```
node scripts/tts.mjs            # only if script.json changed (pass scene ids to redo them)
node scripts/record.mjs         # live AI calls; about 2.5 min
node scripts/encode.mjs
REC=rec-slider STOP_AFTER=d4 node scripts/record.mjs   # re-shoots only the slider step (spliced in by edit.ts)
node scripts/encode.mjs rec-slider
node scripts/pdfshots.mjs
npx remotion render Demo out/demo.mp4 --codec=h264 --crf=18
```

`npx remotion studio` opens the editor preview.
