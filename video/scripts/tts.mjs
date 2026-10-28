// Voiceover: one MP3 per scene with msedge-tts (Andrew), then measures each file with ffprobe
// and writes src/voDurations.json so the composition's sequence lengths come from real durations.
// Usage (from video/): node scripts/tts.mjs [sceneId ...]   (no ids: only missing files are made)
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const scenes = JSON.parse(readFileSync(path.join(root, "scripts", "script.json"), "utf8"));
const outDir = path.join(root, "public", "vo");
const tmp = path.join(root, "out", "tts-tmp");
mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);

// A fresh connection per scene: the service closes the socket after one synthesis.
async function speak(text) {
  for (let attempt = 1; ; attempt++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata("en-US-AndrewNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(tmp, { recursive: true });
      return (await tts.toFile(tmp, text, { rate: "-3%" })).audioFilePath;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.warn("retry", attempt, e.message);
    } finally {
      try { tts.close(); } catch {}
    }
  }
}

for (const s of scenes) {
  const file = path.join(outDir, `${s.id}.mp3`);
  if (only.length ? !only.includes(s.id) : existsSync(file)) continue;
  renameSync(await speak(s.text), file);
  console.log("wrote", s.id);
}

const timeline = {};
for (const s of scenes) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(outDir, `${s.id}.mp3`)]);
  timeline[s.id] = Number(Number(out.toString().trim()).toFixed(3));
}
writeFileSync(path.join(root, "src", "voDurations.json"), JSON.stringify(timeline, null, 2) + "\n");
console.log(timeline, "total", Object.values(timeline).reduce((a, b) => a + b, 0).toFixed(1));
