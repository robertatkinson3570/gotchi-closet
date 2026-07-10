/**
 * Server-side poster generator: renders any gotchi model we can resolve
 * (mirrored official OR our composed GLB) to a poster PNG with the exact
 * same look as the live viewer (<model-viewer>, shadow-intensity 1, straight-on
 * 88° orbit) and the exact same framing as the normalized official cards.
 *
 * This is what makes 3D grids load like 2D: every card becomes a ~50 KB image
 * served from disk, and the multi-MB live model only loads when someone asks
 * for it (⟳). Renders happen in a shared headless Chromium (software WebGL,
 * ~2-6 s per poster) — slow once, image forever.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import pLimit from "p-limit";
import { chromium, type Browser } from "playwright";
import { GOTCHI3D_CACHE_DIR } from "./compose";
import { normalizePoster, resolveModel } from "./mirror";

const require = createRequire(import.meta.url);

const genPngFile = (hash: string) => path.join(GOTCHI3D_CACHE_DIR, `gen-${hash}_Card.png`);

/** Already-generated poster, disk only — never renders. */
export function generatedPosterOnDisk(hash: string): string | null {
  const file = genPngFile(hash);
  return fs.existsSync(file) ? file : null;
}

// One headless browser for the process, launched on first use. Renders are
// software-rasterized (no GPU on the VPS), so keep concurrency low — two at
// a time saturates the box without starving API requests.
let browserPromise: Promise<Browser> | null = null;
const renderLimit = pLimit(2);

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        // The Docker image ships Debian's chromium and points this env at it;
        // local dev uses Playwright's own registry browser.
        executablePath: process.env.GOTCHI3D_CHROMIUM || undefined,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
      })
      .then((b) => {
        b.on("disconnected", () => { browserPromise = null; });
        return b;
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

// The render page is fully self-contained: every request the page makes is
// answered from local disk (model-viewer bundle + the GLB), so a render
// never touches the network and needs no knowledge of the server's port.
const PAGE_URL = "http://gotchi3d.render/poster.html";
const RENDER_SIZE = 1024;

const pageHtml = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}model-viewer{width:${RENDER_SIZE}px;height:${RENDER_SIZE}px;background-color:transparent}</style>
<script type="module" src="/model-viewer.min.js"></script>
</head><body>
<!-- No shadow: it draws on the ground plane at the models' frame-anchor
     floor (below the feet), a detached blob that also stretches the alpha
     bbox and pushes the gotchi off-center in the normalized card. -->
<model-viewer id="mv" src="/gotchi.glb" shadow-intensity="0" interaction-prompt="none"></model-viewer>
<script>
  const el = document.getElementById("mv");
  el.addEventListener("load", async () => {
    // Same straight-on framing the live viewer applies post-load; the models'
    // baked frame anchors make auto-framing uniform across all gotchis.
    el.cameraOrbit = "0deg 88deg 105%";
    el.jumpCameraToGoal?.();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__done = true;
  });
  el.addEventListener("error", () => { window.__error = true; });
</script>
</body></html>`;

async function renderPoster(hash: string): Promise<string | null> {
  const model = await resolveModel(hash);
  if (!model) return null; // nothing to render (and /model 404s the same way)
  // One retry: model-viewer occasionally errors on a fresh browser (seen
  // once locally, likelier on the VPS's software GL). A failed attempt must
  // NOT produce a 404 the frontend session-caches.
  const attempt1 = await renderAttempt(hash, model.file).catch((e) => {
    console.error(`[gotchi3d] poster render attempt failed for ${hash}`, e);
    return null;
  });
  return attempt1 ?? renderAttempt(hash, model.file);
}

async function renderAttempt(hash: string, modelFile: string): Promise<string | null> {
  const glb = fs.readFileSync(modelFile);
  const mvBundle = require.resolve("@google/model-viewer/dist/model-viewer.min.js");

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: RENDER_SIZE + 64, height: RENDER_SIZE + 64 } });
  try {
    const consoleTail: string[] = [];
    page.on("console", (m) => { consoleTail.push(`${m.type()}: ${m.text()}`); if (consoleTail.length > 20) consoleTail.shift(); });
    page.on("pageerror", (e) => consoleTail.push(`pageerror: ${e.message}`));
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url === PAGE_URL) return route.fulfill({ contentType: "text/html", body: pageHtml });
      if (url.endsWith("/model-viewer.min.js")) return route.fulfill({ contentType: "text/javascript", path: mvBundle });
      if (url.endsWith("/gotchi.glb")) return route.fulfill({ contentType: "model/gltf-binary", body: glb });
      return route.abort();
    });
    await page.goto(PAGE_URL);
    await page.waitForFunction("window.__done === true || window.__error === true", null, { timeout: 60_000 });
    const failed = await page.evaluate("window.__error === true");
    if (failed) {
      console.error(`[gotchi3d] poster render: model-viewer failed to load ${hash}; page console: ${consoleTail.join(" | ")}`);
      return null;
    }
    const dataUrl = (await page.evaluate('document.getElementById("mv").toDataURL("image/png")')) as string;
    const raw = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    // Identical alpha-bbox re-framing as the mirrored official cards, so
    // generated and official posters are pixel-uniform in the same grid.
    const normalized = (await normalizePoster(new Uint8Array(raw))) ?? new Uint8Array(raw);
    const file = genPngFile(hash);
    fs.mkdirSync(GOTCHI3D_CACHE_DIR, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, normalized);
    fs.renameSync(tmp, file);
    return file;
  } finally {
    await page.close().catch(() => {});
  }
}

const genInFlight = new Map<string, Promise<string | null>>();

/**
 * Generated poster for a hash: disk hit, else render (deduped per hash).
 * Resolves to the file path, null when no model exists at all, or "pending"
 * when the render is still running after waitMs — the render keeps going in
 * the background, so a later request gets the disk hit.
 */
export async function generatedPoster(hash: string, waitMs = 45_000): Promise<string | null | "pending"> {
  const disk = generatedPosterOnDisk(hash);
  if (disk) return disk;
  let job = genInFlight.get(hash);
  if (!job) {
    job = renderLimit(() => renderPoster(hash))
      .catch((e) => {
        // Transient (browser crash, launch failure): log, don't cache — the
        // next request retries cleanly.
        console.error(`[gotchi3d] poster render failed for ${hash}`, e);
        return null;
      })
      .finally(() => genInFlight.delete(hash));
    genInFlight.set(hash, job);
  }
  if (!Number.isFinite(waitMs)) return job;
  return Promise.race([job, new Promise<"pending">((r) => setTimeout(() => r("pending"), waitMs))]);
}
