/**
 * Build favicon from synapse.png: preserve alpha mask, render foreground black only
 * (equivalent to CSS brightness(0) on the logo mark).
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const input = path.join(publicDir, "synapse.png");
const outputPng = path.join(publicDir, "favicon.png");

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const out = Buffer.alloc(width * height * 4);

for (let i = 0; i < width * height; i++) {
  const src = i * channels;
  const dst = i * 4;
  const alpha = channels === 4 ? data[src + 3] : 255;

  out[dst] = 0;
  out[dst + 1] = 0;
  out[dst + 2] = 0;
  out[dst + 3] = alpha;
}

await sharp(out, { raw: { width, height, channels: 4 } })
  .trim({ threshold: 1 })
  .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(outputPng);

console.log(`Wrote ${outputPng}`);
