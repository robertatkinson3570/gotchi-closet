// server/routes/analytics.ts
import { Router } from "express";
import type { Request } from "express";
import { insertEvent, listEvents, listVisitors, pruneOld } from "../analytics/store";
import { verifyAdminSignature } from "../analytics/auth";
import { windowMs, type WindowKey } from "../../src/lib/analytics/types";

const router = Router();

// Per-IP ingest limiter so a single host can't flood the table.
// (req.ip is the real client only because app.ts sets trust proxy.)
const buckets = new Map<string, { count: number; resetAt: number }>();
function hit(key: string, limit: number, windowMsArg: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { count: 1, resetAt: now + windowMsArg }); return false; }
  b.count += 1;
  return b.count > limit;
}

const PRUNE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
let insertsSincePrune = 0;

function readWindow(req: Request): WindowKey {
  const w = String(req.query.window || "7d");
  return w === "24h" || w === "30d" ? (w as WindowKey) : "7d";
}

async function requireAdmin(req: Request): Promise<boolean> {
  const wallet = String(req.header("x-wallet") || "");
  const signedAt = Number(req.header("x-signed-at"));
  const signature = String(req.header("x-signature") || "");
  return verifyAdminSignature(wallet, signedAt, signature);
}

// Public ingest. Fire-and-forget from the client beacon.
router.post("/track", (req, res) => {
  if (req.ip && hit("ip:" + req.ip, 300, 600_000)) return res.status(429).end();

  const { visitorId, eventType, path, wallet } = req.body ?? {};
  if (typeof visitorId !== "string" || !visitorId || visitorId.length > 64) return res.status(400).end();
  if (eventType !== "pageview" && eventType !== "connect") return res.status(400).end();

  insertEvent({
    visitor_id: visitorId,
    wallet: typeof wallet === "string" && wallet.startsWith("0x") ? wallet.toLowerCase() : null,
    ip: req.ip ?? null,
    path: typeof path === "string" ? path.slice(0, 512) : null,
    event_type: eventType,
    user_agent: (req.header("user-agent") || "").slice(0, 512) || null,
    created_at: Date.now(),
  });

  if (++insertsSincePrune >= 500) { insertsSincePrune = 0; pruneOld(Date.now() - PRUNE_AFTER_MS); }
  res.status(204).end();
});

// Admin: raw events for the grid.
router.get("/events", async (req, res) => {
  if (!(await requireAdmin(req))) return res.status(401).json({ error: "unauthorized" });
  const sinceMs = Date.now() - windowMs(readWindow(req));
  res.json({ events: listEvents({ sinceMs }) });
});

// Admin: visitor aggregate.
router.get("/visitors", async (req, res) => {
  if (!(await requireAdmin(req))) return res.status(401).json({ error: "unauthorized" });
  const sinceMs = Date.now() - windowMs(readWindow(req));
  res.json({ visitors: listVisitors({ sinceMs }) });
});

export default router;
