import { Router } from "express";
import { composeGotchiGlb, HASH_RE as COMPOSE_HASH_RE } from "../gotchi3d/compose";

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
    // no-cache ≠ no-store: browsers may keep the bytes but MUST revalidate
    // (sendFile sets ETag/Last-Modified, so unchanged files still 304). A
    // blind max-age here once pinned pipeline-broken GLBs in every visitor's
    // browser for a day — cache purges and redeploys were invisible.
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(file);
  } catch (e) {
    console.error("GET /api/gotchi3d/composed failed", e);
    res.status(500).json({ error: "compose failed" });
  }
});

export default router;
