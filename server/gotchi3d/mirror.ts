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

/** Official poster PNG for a hash, mirrored to disk. */
export async function officialPoster(hash: string): Promise<string | null> {
  return mirrorFile(`${CDN}/${hash}/${hash}_Full.png`, officialPngFile(hash), isPng);
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
