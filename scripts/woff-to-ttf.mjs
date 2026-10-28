// Converts a WOFF font (as shipped by @fontsource) to TTF, which pdf-lib can embed: node scripts/woff-to-ttf.mjs <in.woff> <out.ttf>
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
const [src, dst] = process.argv.slice(2);
const w = readFileSync(src);
const flavor = w.readUInt32BE(4), n = w.readUInt16BE(12);
const tables = [];
for (let i = 0; i < n; i++) {
  const o = 44 + i * 20;
  const tag = w.readUInt32BE(o), off = w.readUInt32BE(o + 4), comp = w.readUInt32BE(o + 8), orig = w.readUInt32BE(o + 12), sum = w.readUInt32BE(o + 16);
  const raw = w.subarray(off, off + comp);
  tables.push({ tag, sum, data: comp < orig ? inflateSync(raw) : raw });
}
let es = 0; while (1 << (es + 1) <= n) es++;
const head = Buffer.alloc(12 + 16 * n);
head.writeUInt32BE(flavor, 0); head.writeUInt16BE(n, 4); head.writeUInt16BE(16 << es, 6); head.writeUInt16BE(es, 8); head.writeUInt16BE(n * 16 - (16 << es), 10);
let off = head.length; const parts = [head];
tables.forEach((t, i) => {
  head.writeUInt32BE(t.tag, 12 + i * 16); head.writeUInt32BE(t.sum, 16 + i * 16); head.writeUInt32BE(off, 20 + i * 16); head.writeUInt32BE(t.data.length, 24 + i * 16);
  const pad = (4 - (t.data.length % 4)) % 4; parts.push(t.data, Buffer.alloc(pad)); off += t.data.length + pad;
});
writeFileSync(dst, Buffer.concat(parts));
