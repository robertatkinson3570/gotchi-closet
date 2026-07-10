import { Router } from "express";
import { composeGotchiGlb, HASH_RE as COMPOSE_HASH_RE, PIPELINE_VERSION } from "../gotchi3d/compose";
import { officialPoster, resolveModel } from "../gotchi3d/mirror";

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
      job = composeGotchiGlb(hash).finally(() => inFlight.delete(hash));
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

// THE gotchi model endpoint: official primary render (mirrored to this box
// forever) when Pixelcraft made one, else our composed model. One URL, one
// source, one timing — the frontend never talks to CloudFront.
const modelInFlight = new Map<string, Promise<{ file: string; source: string } | null>>();

router.get("/model/:hash", async (req, res) => {
  const { hash } = req.params;
  if (!COMPOSE_HASH_RE.test(hash)) {
    res.status(400).json({ error: "bad hash" });
    return;
  }
  try {
    let job = modelInFlight.get(hash);
    if (!job) {
      job = resolveModel(hash).finally(() => modelInFlight.delete(hash));
      modelInFlight.set(hash, job);
    }
    const model = await job;
    if (!model) {
      res.status(404).json({ error: "no model" });
      return;
    }
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("X-Gotchi3d-Source", model.source);
    res.setHeader("Cache-Control", cacheHeader(req.query.v));
    res.sendFile(model.file);
  } catch (e) {
    console.error("GET /api/gotchi3d/model failed", e);
    res.status(500).json({ error: "model failed" });
  }
});

// Official poster PNG (exists only for Pixelcraft-rendered combos). Grids
// use it when available; per-hash content never changes, but the cache rule
// stays version-locked for symmetry with /model.
router.get("/poster/:hash", async (req, res) => {
  const { hash } = req.params;
  if (!COMPOSE_HASH_RE.test(hash)) {
    res.status(400).json({ error: "bad hash" });
    return;
  }
  try {
    const file = await officialPoster(hash);
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
