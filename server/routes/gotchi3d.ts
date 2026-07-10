import { Router } from "express";
import { composeGotchiGlbDetached, HASH_RE as COMPOSE_HASH_RE, PIPELINE_VERSION } from "../gotchi3d/compose";
import { mirrorOfficialInBackground, officialExists, officialModelOnDisk, officialPoster, officialProxyUrl } from "../gotchi3d/mirror";
import { generatedPoster } from "../gotchi3d/poster-render";

/**
 * Render-kick relay: when the frontend finds a gotchi combo with no 3D model
 * on the render CDN, it reports the hash here and we ask Pixelcraft's render
 * service to generate it (force:true). Their batch API sends no CORS headers,
 * so browsers can't call it directly — hence this tiny relay.
 *
 * The generator upstream has been returning 502 since the Pixelcraft wind-down
 * (verified 2026-07-09); requests are fire-and-forget and cheap, so we relay
 * anyway — the day the service returns, missing combos viewed by users start
 * self-healing with no code change.
 */
const router = Router();

const BATCH_URL = "https://www.aavegotchi.com/api/renderer/batch";
const HASH_RE = /^[A-Za-z0-9_]+-[A-Za-z0-9_]+-[A-Za-z0-9_]+(-\d+){7}$/;
const THROTTLE_MS = 24 * 60 * 60 * 1000;

// One kick per hash per day per process — misses repeat on every page view.
const lastKick = new Map<string, number>();

router.post("/kick", async (req, res) => {
  const raw = (req.body?.hashes ?? []) as unknown[];
  const hashes = [...new Set(raw.filter((h): h is string => typeof h === "string" && HASH_RE.test(h)))].slice(0, 8);
  const now = Date.now();
  const fresh = hashes.filter((h) => (lastKick.get(h) ?? 0) + THROTTLE_MS < now);
  fresh.forEach((h) => lastKick.set(h, now));
  if (lastKick.size > 10_000) lastKick.clear(); // unbounded-growth guard

  // Respond immediately; the upstream call is best-effort background work.
  res.status(202).json({ queued: fresh.length });
  if (fresh.length === 0) return;
  try {
    await fetch(BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: fresh, renderTypes: ["GLB_3DModel", "PNG_Full"], force: true }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    /* generator offline — expected until Pixelcraft revives it */
  }
});

// Self-composed dressed models: built from the naked body + wearable GLBs
// (validated byte-level equivalent structure to official dressed renders).
// Slow first hit (~1-3s of fetching + merging), instant from disk after.
const inFlight = new Map<string, Promise<string | null>>();

router.get("/composed/:hash", async (req, res) => {
  const { hash } = req.params;
  if (!COMPOSE_HASH_RE.test(hash)) {
    res.status(400).json({ error: "bad hash" });
    return;
  }
  try {
    let job = inFlight.get(hash);
    if (!job) {
      job = composeGotchiGlbDetached(hash).finally(() => inFlight.delete(hash));
      inFlight.set(hash, job);
    }
    const file = await job;
    if (!file) {
      res.status(404).json({ error: "not composable" });
      return;
    }
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Cache-Control", cacheHeader(req.query.v));
    res.sendFile(file);
  } catch (e) {
    console.error("GET /api/gotchi3d/composed failed", e);
    res.status(500).json({ error: "compose failed" });
  }
});

// Requests whose ?v matches the live pipeline version are immutable: browsers
// keep the file on disk and revisits render with zero revalidation. The
// frontend bumps ?v in lockstep with PIPELINE_VERSION, so a version mismatch
// (old cached frontend, or a pipeline bump) safely degrades to no-cache.
const cacheHeader = (v: unknown) => (String(v) === PIPELINE_VERSION.replace(/^v/, "") ? "public, max-age=31536000, immutable" : "no-cache");

// THE gotchi model endpoint: official primary render when Pixelcraft made
// one, else our composed model. Cold officials are served by REDIRECTING to
// the CORS-open render proxy at CDN speed while this box mirrors the file in
// the background — without that, a grid/tab switch queued dozens of multi-MB
// server-side downloads and cards sat in 2D for minutes (user-reported on
// Baazaar/Owned/dress surfaces). Once mirrored (or prewarmed), it serves
// from local disk.
const composeInFlight = new Map<string, Promise<string | null>>();

router.get("/model/:hash", async (req, res) => {
  const { hash } = req.params;
  if (!COMPOSE_HASH_RE.test(hash)) {
    res.status(400).json({ error: "bad hash" });
    return;
  }
  try {
    const isProbe = !!req.query.gcprobe;
    const onDisk = officialModelOnDisk(hash);
    if (onDisk) {
      if (isProbe) {
        res.setHeader("Cache-Control", "no-cache");
        res.status(204).end();
        return;
      }
      res.setHeader("Content-Type", "model/gltf-binary");
      res.setHeader("X-Gotchi3d-Source", "official");
      res.setHeader("Cache-Control", cacheHeader(req.query.v));
      res.sendFile(onDisk);
      return;
    }
    const exists = await officialExists(hash);
    if (exists !== false) {
      // exists, or transiently unknown: kick the background mirror. PROBES
      // are answered right here with an empty 204 — redirecting a probe to
      // the CDN proxy makes its Range header trigger a cross-origin
      // preflight the proxy rejects, and every cold card silently fell back
      // to 2D (user-reported on Owned/Auction surfaces). Real model fetches
      // (no Range) follow the redirect fine.
      mirrorOfficialInBackground(hash);
      res.setHeader("Cache-Control", "no-cache");
      if (isProbe) {
        res.status(204).end();
        return;
      }
      res.redirect(302, officialProxyUrl(hash));
      return;
    }
    // Definitively no official render: our composed model.
    let job = composeInFlight.get(hash);
    if (!job) {
      job = composeGotchiGlbDetached(hash).finally(() => composeInFlight.delete(hash));
      composeInFlight.set(hash, job);
    }
    const file = await job;
    if (!file) {
      res.status(404).json({ error: "no model" });
      return;
    }
    if (isProbe) {
      res.setHeader("Cache-Control", "no-cache");
      res.status(204).end();
      return;
    }
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("X-Gotchi3d-Source", "composed");
    res.setHeader("Cache-Control", cacheHeader(req.query.v));
    res.sendFile(file);
  } catch (e) {
    console.error("GET /api/gotchi3d/model failed", e);
    res.status(500).json({ error: "model failed" });
  }
});

// Poster PNG for EVERY gotchi: Pixelcraft's official render when one exists,
// else our server-rendered card of the resolved model (official or composed)
// — this is what lets 3D grids load like 2D image grids. A cold generated
// poster renders during this request (bounded); past the wait we return 503
// (NOT 404 — the frontend session-caches 404s) and the render finishes in
// the background for the next request.
router.get("/poster/:hash", async (req, res) => {
  const { hash } = req.params;
  if (!COMPOSE_HASH_RE.test(hash)) {
    res.status(400).json({ error: "bad hash" });
    return;
  }
  try {
    const file = (await officialPoster(hash)) ?? (await generatedPoster(hash, 45_000));
    if (file === "pending") {
      res.setHeader("Retry-After", "30");
      res.setHeader("Cache-Control", "no-cache");
      res.status(503).json({ error: "poster rendering" });
      return;
    }
    if (!file) {
      res.status(404).json({ error: "no poster" });
      return;
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", cacheHeader(req.query.v));
    res.sendFile(file);
  } catch (e) {
    console.error("GET /api/gotchi3d/poster failed", e);
    res.status(500).json({ error: "poster failed" });
  }
});

export default router;
