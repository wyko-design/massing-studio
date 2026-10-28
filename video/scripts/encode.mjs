// Turns the screencast frames from record.mjs into real-time footage (public/demo.mp4, 30 fps CFR),
// and rewrites the markers relative to the footage start (src/markers.json) for the edit.
// Usage (from video/): node scripts/encode.mjs [recName]   (recName other than "rec" writes public/<recName>.mp4
// and src/markers-<recName>.json, for a re-shot step spliced into the main take)
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const name = process.argv[2] ?? "rec";
const recDir = path.join(root, "out", name);
const frames = JSON.parse(readFileSync(path.join(recDir, "frames.json"), "utf8"));
const { markers } = JSON.parse(readFileSync(path.join(recDir, "markers.json"), "utf8"));
const start = frames[0].t;

// ffconcat: each frame lasts until the next one arrives (the screencast only sends changed frames).
const lines = ["ffconcat version 1.0"];
frames.forEach((f, i) => {
  const next = frames[i + 1]?.t ?? f.t + 1;
  lines.push(`file 'frames/${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
});
lines.push(`file 'frames/${frames.at(-1).file}'`);
writeFileSync(path.join(recDir, "list.ffconcat"), lines.join("\n"));

const out = path.join(root, "public", name === "rec" ? "demo.mp4" : `${name}.mp4`);
execFileSync("ffmpeg", [
  "-y", "-f", "concat", "-safe", "0", "-i", "list.ffconcat",
  "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
  "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-movflags", "+faststart", out,
], { cwd: recDir, stdio: "inherit" });

const rel = markers.map((m) => ({ ...m, t: Number((m.t - start).toFixed(3)) }));
writeFileSync(path.join(root, "src", name === "rec" ? "markers.json" : `markers-${name}.json`), JSON.stringify(rel, null, 2) + "\n");
const pdf = path.join(recDir, "report.pdf");
if (name === "rec" && existsSync(pdf)) copyFileSync(pdf, path.join(root, "public", "report.pdf"));
console.log(rel.map((m) => `${m.t.toFixed(1).padStart(6)}  ${m.name}`).join("\n"));
console.log("footage seconds:", (frames.at(-1).t - start).toFixed(1));
