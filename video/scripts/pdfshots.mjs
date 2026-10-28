// Renders every page of the PDF the tool exported (public/report.pdf) to PNG with pdf.js in
// headless Chrome, so the video can show the real report. Output: public/pdf/page-N.png
// Usage (from video/): node scripts/pdfshots.mjs
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pdfjs = path.join(root, "node_modules", "pdfjs-dist", "build");
const outDir = path.join(root, "public", "pdf");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const files = {
  "/pdf.mjs": [path.join(pdfjs, "pdf.mjs"), "text/javascript"],
  "/pdf.worker.mjs": [path.join(pdfjs, "pdf.worker.mjs"), "text/javascript"],
  "/report.pdf": [path.join(root, "public", "report.pdf"), "application/pdf"],
  "/": [null, "text/html"],
};
await page.route("http://pdf.local/**", (route) => {
  const [file, contentType] = files[new URL(route.request().url()).pathname] ?? [];
  if (!contentType) return route.fulfill({ status: 404 });
  route.fulfill({ contentType, body: file ? readFileSync(file) : "<!doctype html><body></body>" });
});
await page.goto("http://pdf.local/");
const pages = await page.evaluate(async () => {
  const lib = await import("http://pdf.local/pdf.mjs");
  lib.GlobalWorkerOptions.workerSrc = "http://pdf.local/pdf.worker.mjs";
  const doc = await lib.getDocument({ url: "http://pdf.local/report.pdf" }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 3 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await p.render({ canvasContext: canvas.getContext("2d"), viewport: vp, canvas }).promise;
    out.push(canvas.toDataURL("image/png"));
  }
  return out;
});
pages.forEach((d, i) => writeFileSync(path.join(outDir, `page-${i + 1}.png`), Buffer.from(d.split(",")[1], "base64")));
console.log("pages:", pages.length);
await browser.close();
