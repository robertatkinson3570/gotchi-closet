// server/routes/megaphone.ts
// Megaphone content-ops API. Public reads (published video library + the /pulse hero) and
// admin-signed writes (publish / pin / hide / delete). Video + poster bytes are served as
// static files from the media volume so the browser gets HTTP range requests (seeking).
import express, { Router } from "express";
import {
  deleteVideo,
  insertVideo,
  listAll,
  listPublished,
  mediaDir,
  pinnedPulseVideo,
  pinPulse,
  setStatus,
} from "../megaphone/store";
import { isAdmin, verifyAdminSignature } from "../megaphone/auth";
import { distributeVideo, distributeVideoTo } from "../megaphone/distribute";
import { listIntegrations, postizConfigured } from "../megaphone/postiz";
import { isTemplate } from "../../src/lib/megaphone/types";

const router = Router();

// Decoded-size ceiling for an uploaded MP4. Web-optimized vertical clips render well under
// this; the base64 body limit below is sized to match (~1.34x for base64 overhead).
const MAX_MP4_BYTES = 40 * 1024 * 1024;

// --- Public reads -----------------------------------------------------------

// Published library. Optional ?template= filter.
router.get("/", (req, res) => {
  const t = req.query.template;
  const template = typeof t === "string" && isTemplate(t) ? t : undefined;
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ videos: listPublished(template) });
});

// The single video pinned to /pulse (null when none pinned).
router.get("/pulse-hero", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ video: pinnedPulseVideo() });
});

// Cosmetic helper — the client uses it to decide whether to render the admin controls.
router.get("/is-admin", (req, res) => {
  const wallet = String(req.query.wallet || "");
  res.json({ admin: wallet ? isAdmin(wallet) : false });
});

// Media bytes (MP4 + poster). express.static gives Range support so <video> can seek.
router.use(
  "/media",
  express.static(mediaDir(), {
    immutable: true,
    maxAge: "365d",
    fallthrough: false,
    setHeaders: (res) => res.setHeader("Access-Control-Allow-Origin", "*"),
  })
);

// --- Admin writes -----------------------------------------------------------

// Bigger body limit only on the publish route (global limit is 2mb). Sized for a 40MB MP4
// (~53MB as base64) plus the poster and JSON overhead, with headroom.
const publishJson = express.json({ limit: "64mb" });

// Publish a rendered video. Admin-signed. Files are written by the store.
router.post("/publish", publishJson, async (req, res) => {
  const { title, caption, template, mp4Base64, posterBase64, durationS, gotchiId, wallet, signature, signedAt } = req.body ?? {};

  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  if (typeof title !== "string" || !title.trim()) return res.status(400).json({ error: "title required" });
  if (!isTemplate(template)) return res.status(400).json({ error: "bad template" });
  if (typeof mp4Base64 !== "string" || mp4Base64.length < 100) return res.status(400).json({ error: "mp4 required" });

  let mp4: Buffer;
  try {
    mp4 = Buffer.from(mp4Base64, "base64");
  } catch {
    return res.status(400).json({ error: "bad mp4 encoding" });
  }
  if (mp4.length > MAX_MP4_BYTES) return res.status(413).json({ error: "video too large (40MB max)" });

  let poster: Buffer | null = null;
  if (typeof posterBase64 === "string" && posterBase64.length > 100) {
    poster = Buffer.from(posterBase64, "base64");
  }

  const video = insertVideo({
    title: title.trim().slice(0, 120),
    caption: typeof caption === "string" ? caption.slice(0, 600) : "",
    template,
    mp4,
    poster,
    durationS: Number.isFinite(durationS) ? Math.round(durationS) : null,
    gotchiId: typeof gotchiId === "string" && gotchiId ? gotchiId.slice(0, 20) : null,
    publishedBy: wallet,
  });
  // Auto-distribute to social via Postiz (no-op unless enabled). Fire and forget so the
  // publish response is instant; the ledger + cron own the result and the no-repeat guard.
  void distributeVideo(video.id).catch(() => {});
  res.json({ ok: true, video });
});

// Admin: full list (any status) for the manage tab.
router.get("/all", async (req, res) => {
  const { wallet, signature, signedAt } = req.query;
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  res.json({ videos: listAll() });
});

// Admin: verify the Postiz connection + list connected channels (for setup / allowlist ids).
router.get("/postiz/integrations", async (req, res) => {
  const { wallet, signature, signedAt } = req.query;
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  if (!postizConfigured()) return res.json({ configured: false, integrations: [] });
  try {
    const integrations = await listIntegrations();
    res.json({ configured: true, integrations });
  } catch (e) {
    res.status(502).json({ configured: true, error: (e as Error).message, integrations: [] });
  }
});

// Admin: manually distribute a video to chosen channels now. Works whenever Postiz is
// configured (independent of the MEGAPHONE_AUTO_DISTRIBUTE auto-on-publish switch). The
// UNIQUE ledger still prevents any channel from receiving the same video twice.
router.post("/:id/distribute", async (req, res) => {
  const id = Number(req.params.id);
  const { integrationIds, wallet, signature, signedAt } = req.body ?? {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  if (!Array.isArray(integrationIds) || integrationIds.length === 0) {
    return res.status(400).json({ error: "no channels selected" });
  }
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  if (!postizConfigured()) return res.status(400).json({ error: "Postiz not configured" });
  const summary = await distributeVideoTo(
    id,
    integrationIds.map((x: unknown) => String(x)),
  );
  res.json({ ok: true, ...summary });
});

// Admin: pin a video as the /pulse hero (single slot).
router.post("/:id/pin-pulse", async (req, res) => {
  const id = Number(req.params.id);
  const { wallet, signature, signedAt } = req.body ?? {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  pinPulse(id);
  res.json({ ok: true });
});

// Admin: hide/show a video.
router.post("/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status, wallet, signature, signedAt } = req.body ?? {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  if (status !== "published" && status !== "hidden") return res.status(400).json({ error: "bad status" });
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  setStatus(id, status);
  res.json({ ok: true });
});

// Admin: hard-delete a video and its media files.
router.post("/:id/delete", async (req, res) => {
  const id = Number(req.params.id);
  const { wallet, signature, signedAt } = req.body ?? {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  if (!(await verifyAdminSignature(String(wallet || ""), Number(signedAt), String(signature || "")))) {
    return res.status(403).json({ error: "not authorized" });
  }
  deleteVideo(id);
  res.json({ ok: true });
});

export default router;
