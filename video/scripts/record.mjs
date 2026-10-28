// Records one real run of Massing Studio in headed Chrome (Playwright) for the demo video.
// Frames come from the Chrome DevTools screencast (sharper than Playwright's own video), with
// their timestamps, so ffmpeg can rebuild real-time footage. Every step logs a marker (time +
// on-screen rectangles of the regions to zoom to) to out/rec/markers.json for the edit.
// Needs the app running: server on 127.0.0.1:8811 and client on 127.0.0.1:5195 (see .claude/launch.json).
// Usage (from video/): node scripts/record.mjs   then   node scripts/encode.mjs
import { chromium } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// REC=<name> records into out/<name> (default rec); STOP_AFTER=d4 ends after the slider step
// (used to re-shoot that step alone); SLIDER / SLIDER_TO pick the slider and its two drag targets.
const recDir = path.join(root, "out", process.env.REC ?? "rec");
const STOP_AFTER = process.env.STOP_AFTER;
const SLIDER = process.env.SLIDER ?? "Coverage";
const SLIDER_TO = (process.env.SLIDER_TO ?? "0.2,0.55").split(",").map(Number);
const framesDir = path.join(recDir, "frames");
rmSync(recDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const APP = process.env.APP_URL ?? "http://127.0.0.1:5195/tool.html";
const BRIEF = "A ring of pitched-roof townhouse apartments with slim 8 m deep wings around a large green courtyard garden, five storeys, turned towards the sun.";
const VIEW = { width: 1600, height: 900 };
const DPR = 1.5;

// Headless Chrome on the GPU with a real device scale, so the screencast sends device pixels
// (2400x1350). A headed window is capped by the laptop screen, and viewport emulation only
// yields CSS-pixel frames.
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [`--force-device-scale-factor=${DPR}`, "--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
const context = await browser.newContext({ viewport: null, acceptDownloads: true });

// Visible cursor + click ripple, drawn into the page at runtime only (the app's code is untouched).
await context.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.innerHTML = `<svg width="28" height="28" viewBox="0 0 28 28"><path d="M3 2 L3 22 L8.5 17 L12.5 26 L16 24.5 L12 15.8 L19.5 15.8 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: 2147483647, pointerEvents: "none", translate: "-3px -2px" });
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("focusin", (e) => { if (e.target instanceof HTMLElement) e.target.spellcheck = false; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "fixed", left: e.clientX - 18 + "px", top: e.clientY - 18 + "px", width: "36px", height: "36px",
        borderRadius: "50%", border: "3px solid #2b50e0", background: "rgba(43,80,224,0.18)", zIndex: 2147483646,
        pointerEvents: "none", transition: "transform 450ms ease-out, opacity 450ms ease-out", transform: "scale(0.4)", opacity: "1",
      });
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.4)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  });
});

const page = await context.newPage();
const cdp = await context.newCDPSession(page);
{
  // Size the window so the page itself is exactly VIEW.
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: VIEW.width, height: VIEW.height } });
  const [iw, ih] = await page.evaluate(() => [innerWidth, innerHeight]);
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 2 * VIEW.width - iw, height: 2 * VIEW.height - ih } });
  console.log("inner", await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]));
}
const frames = [];
let frameNo = 0;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `f${String(frameNo++).padStart(6, "0")}.jpg`;
  writeFileSync(path.join(framesDir, file), Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});

const markers = [];
let t0 = null;
const now = () => Date.now() / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rectOf(sel) {
  const l = typeof sel === "string" ? page.locator(sel).first() : sel;
  const b = await l.boundingBox({ timeout: 800 }).catch(() => null);
  return b && { x: b.x / VIEW.width, y: b.y / VIEW.height, w: b.width / VIEW.width, h: b.height / VIEW.height };
}
async function mark(name, regions = {}) {
  const rects = {};
  for (const [k, sel] of Object.entries(regions)) rects[k] = await rectOf(sel);
  markers.push({ name, t: now(), rects });
  console.log(`${(now() - t0).toFixed(1).padStart(6)}s  ${name}`);
}

// Slow, visible mouse travel before every click.
let mouse = { x: VIEW.width / 2, y: VIEW.height / 2 };
async function moveTo(locator, { dx = 0.5, dy = 0.5, steps = 28 } = {}) {
  await locator.waitFor({ state: "visible", timeout: 60000 });
  const b = await locator.boundingBox();
  const x = b.x + b.width * dx, y = b.y + b.height * dy;
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
}
async function click(locator, opts) {
  await moveTo(locator, opts);
  await sleep(250);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}
async function type(text, delay = 75) {
  await page.keyboard.type(text, { delay });
}
async function dragRange(locator, toFraction) {
  const b = await locator.boundingBox();
  const { min, max, value } = await locator.evaluate((el) => ({ min: +el.min, max: +el.max, value: +el.value }));
  const f0 = (value - min) / (max - min);
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + b.width * f0, y, { steps: 25 });
  await sleep(250);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * toFraction, y, { steps: 60 });
  await sleep(150);
  await page.mouse.up();
}

const waitText = (re, timeout = 60000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout, polling: 250 });
const input = (ph) => page.locator(`input[placeholder="${ph}"]`);
const btn = (name, exact = true) => page.getByRole("button", { name, exact });

await page.goto(APP);
await input("[Country]").waitFor({ state: "visible" });
await sleep(2500);
await page.mouse.move(mouse.x, mouse.y);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1, maxWidth: VIEW.width * DPR, maxHeight: VIEW.height * DPR });
t0 = now();
await sleep(1500);

// 1 · Address
const win = "input[placeholder]";
await mark("d1_address", { field: win });
await click(input("[Country]"));
await type("Netherlands");
await sleep(700);
await page.keyboard.press("Enter");
await input("[City]").waitFor({ state: "visible", timeout: 30000 });
await sleep(3500);
await click(input("[City]"));
await type("Delft");
await sleep(700);
await page.keyboard.press("Enter");
await input("[Address]").waitFor({ state: "visible", timeout: 30000 });
await sleep(4000);
await click(input("[Address]"));
await type("Van Leeuwenhoekpark 1");
await sleep(2200);
await page.keyboard.press("Enter");
await waitText(/Plot #3458/);
await mark("d1_found", { field: win });
await sleep(3500);

// 2 · Zoning and limits
await click(page.locator('button[type="submit"]').first());
await mark("d2_rules_click");
await btn("Fill with suggested values").waitFor({ state: "visible", timeout: 60000 });
await sleep(6500); // the rows unscramble, then the count line fades in
await mark("d2_rules", { panel: page.getByText("Zoning").first().locator("xpath=ancestor::*[contains(@class,'rules')][1]") });
await moveTo(page.getByText("Max. building height").filter({ visible: true }).first(), { steps: 30 });
await sleep(2200);
await moveTo(page.getByText("Max. coverage").filter({ visible: true }).first(), { steps: 20 });
await sleep(1800);
await click(btn("Fill with suggested values"));
await mark("d2_filled");
await sleep(3500);
await click(btn("Start exploring"));
await mark("d3_intro");

// 3 · Directions: site model, envelope, presets
await page.getByRole("tab", { name: /daylight/i }).waitFor({ state: "visible", timeout: 60000 });
await sleep(5000); // model intro + panels grow in
await mark("d3_presets", {
  left: page.getByRole("tab", { name: /daylight/i }).locator("xpath=ancestor::*[contains(@class,'panel') or contains(@class,'window')][1]"),
  right: btn("Export"),
});
await sleep(2500);
for (const name of [/daylight/i, /greenery/i, /Low/i]) {
  await click(page.getByRole("tab", { name }));
  await mark(`d3_tab_${String(name).replace(/\W/g, "")}`);
  await sleep(3200);
}
await click(page.getByRole("tab", { name: /floor area/i }));
await mark("d3_tab_floor");
await sleep(3000);

// 4 · Sliders (no AI). Floors is capped by the max FAR on "Most floor area", so the mass would not
// move; coverage changes the footprint visibly.
const slider = page.getByRole("slider", { name: SLIDER });
await mark("d4_sliders", { slider });
await dragRange(slider, SLIDER_TO[0]);
await sleep(1800);
await dragRange(slider, SLIDER_TO[1]);
await mark("d4_done");
await sleep(2500);
if (STOP_AFTER === "d4") await finish();

// 5 · Your brief → AI
await click(page.getByRole("tab", { name: /brief/i }));
await mark("d5_brief");
const brief = page.getByRole("textbox", { name: "Brief" });
await click(brief);
await type(BRIEF, 45);
await sleep(800);
await click(btn("Read brief"));
await mark("d5_read_click");
await waitText(/Unclear:/, 120000);
await mark("d5_read_done");
await sleep(5000);
const gen = page.getByRole("button", { name: /Generate option/ }).first();
await click(gen);
await mark("d6_generate_click");
await waitText(/proposed by the AI from the brief/, 180000);
await mark("d6_generate_done");
await sleep(9000);

// 7 · Export
await click(btn("Export"));
await mark("d7_export");
await btn("SE").waitFor({ state: "visible", timeout: 30000 });
await sleep(3000);
await click(btn("SE"));
await sleep(2500);
await click(page.getByRole("checkbox", { name: "PNG" }));
await sleep(600);
await click(page.getByRole("checkbox", { name: "PDF" }));
await sleep(900);
const downloadP = page.waitForEvent("download", { timeout: 240000 });
await click(btn("Export"));
await mark("d7_export_click");
const download = await downloadP;
const pdfPath = path.join(recDir, "report.pdf");
await download.saveAs(pdfPath);
await mark("d7_export_done");
await sleep(2500);
await finish();

async function finish() {
  await cdp.send("Page.stopScreencast");
  writeFileSync(path.join(recDir, "markers.json"), JSON.stringify({ t0, view: VIEW, dpr: DPR, markers }, null, 2));
  writeFileSync(path.join(recDir, "frames.json"), JSON.stringify(frames));
  console.log(`frames: ${frames.length}`);
  await browser.close();
  process.exit(0);
}
