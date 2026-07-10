/**
 * Mirror of Pixelcraft's render CDN (dzqjok0x69zbl.cloudfront.net) plus our
 * own composed models, behind ONE resolution: official primary render if it
 * exists (mirrored to disk forever), else our composed model. The frontend
 * only ever talks to /api/gotchi3d/model|poster/:hash — no client-side
 * CloudFront probing, no dual-source timing differences, and the site keeps
 * working the day Pixelcraft's AWS bill stops being paid.
 */
import fs from "node:fs";
import path from "node:path";
import ndarray from "ndarray";
import { getPixels, savePixels } from "ndarray-pixels";
import { composeGotchiGlb, GOTCHI3D_CACHE_DIR, isGlb } from "./compose";

const CDN = "https://dzqjok0x69zbl.cloudfront.net";

const officialGlbFile = (hash: string) => path.join(GOTCHI3D_CACHE_DIR, `official-${hash}_GLB.glb`);
const officialPngFile = (hash: string) => path.join(GOTCHI3D_CACHE_DIR, `official-${hash}_Full.png`);
// Definitive CDN misses, remembered per process so repeat views don't re-probe
// CloudFront. Transient failures are NOT recorded.
const knownMissing = new Set<string>();

function isPng(buf: Uint8Array): boolean {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

async function mirrorFile(url: string, file: string, validate: (b: Uint8Array) => boolean): Promise<string | null> {
  if (fs.existsSync(file)) return file;
  if (knownMissing.has(file)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      knownMissing.add(file); // 403/404: asset genuinely absent upstream
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!validate(buf)) return null; // junk body: transient, retry next time
    fs.mkdirSync(GOTCHI3D_CACHE_DIR, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
    return file;
  } catch {
    return null; // transient network failure: retry next time
  }
}

/** Official render GLB for a hash, mirrored to disk. Null when the CDN
 *  definitively lacks it (or is unreachable right now). */
export async function officialModel(hash: string): Promise<string | null> {
  return mirrorFile(`${CDN}/${hash}/${hash}_GLB.glb`, officialGlbFile(hash), isGlb);
}

/**
 * Re-frame a poster so its content (feet-to-crown, found via alpha) renders
 * at 65% of the canvas height, centered — the same framing our composed
 * models bake in via anchors. Pixelcraft's own posters vary per scene (Slide
 * fills its frame, Grace's cacti shrink hers), which is why grids mixing raw
 * posters could never be size-uniform.
 */
const CARD_SIZE = 1024;
const CONTENT_FRACTION = 0.65;

async function normalizePoster(raw: Uint8Array): Promise<Uint8Array | null> {
  try {
    const px = await getPixels(raw, "image/png");
    const [w, h, channels] = px.shape as [number, number, number];
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = channels > 3 ? px.get(x, y, 3) : 255;
        if (a > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || maxY <= minY) return null; // fully transparent: keep raw
    const contentH = maxY - minY + 1;
    const contentW = maxX - minX + 1;
    const scale = (CARD_SIZE * CONTENT_FRACTION) / contentH;
    const outW = CARD_SIZE, outH = CARD_SIZE;
    const dstW = contentW * scale, dstH = contentH * scale;
    const offX = (outW - dstW) / 2, offY = (outH - dstH) / 2;
    const out = ndarray(new Uint8Array(outW * outH * 4), [outW, outH, 4]);
    for (let oy = 0; oy < outH; oy++) {
      for (let ox = 0; ox < outW; ox++) {
        const sx = minX + (ox - offX) / scale;
        const sy = minY + (oy - offY) / scale;
        if (sx < minX || sy < minY || sx > maxX || sy > maxY) continue; // transparent
        // bilinear
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
        const fx = sx - x0, fy = sy - y0;
        for (let c = 0; c < 4; c++) {
          const v = (cx: number, cy: number) => (c < channels ? px.get(cx, cy, c) : 255);
          const top = v(x0, y0) * (1 - fx) + v(x1, y0) * fx;
          const bot = v(x0, y1) * (1 - fx) + v(x1, y1) * fx;
          out.set(ox, oy, c, Math.round(top * (1 - fy) + bot * fy));
        }
      }
    }
    return await savePixels(out, "image/png");
  } catch {
    return null; // any decode/encode hiccup: serve the raw poster
  }
}

const cardPngFile = (hash: string) => path.join(GOTCHI3D_CACHE_DIR, `official-${hash}_Card.png`);

/** Official poster for a hash: mirrored, then re-framed to the uniform card
 *  framing. Falls back to the raw poster if normalization fails. */
export async function officialPoster(hash: string): Promise<string | null> {
  const card = cardPngFile(hash);
  if (fs.existsSync(card)) return card;
  const raw = await mirrorFile(`${CDN}/${hash}/${hash}_Full.png`, officialPngFile(hash), isPng);
  if (!raw) return null;
  const normalized = await normalizePoster(new Uint8Array(fs.readFileSync(raw)));
  if (!normalized) return raw;
  const tmp = `${card}.tmp`;
  fs.writeFileSync(tmp, normalized);
  fs.renameSync(tmp, card);
  return card;
}

/**
 * THE resolution every surface uses: official primary render when Pixelcraft
 * made one (their Unity output is the gold standard), otherwise our composed
 * model. Alt-hand-order officials are deliberately never used — those renders
 * have the hands physically mirrored vs the 2D art.
 */
export async function resolveModel(hash: string): Promise<{ file: string; source: "official" | "composed" } | null> {
  const official = await officialModel(hash);
  if (official) return { file: official, source: "official" };
  const composed = await composeGotchiGlb(hash);
  if (composed) return { file: composed, source: "composed" };
  return null;
}
