import { Router, type Response } from "express";
import { filterInbound } from "../../src/lib/companion/contentFilter";
import { fetchGotchiState } from "../companion/gotchiState";
import { verifyRoomSignature } from "../companion/auth";
import { appendGlobalMessage, recentGlobalMessages, type StoredGlobalMessage } from "../companion/globalRoom";

const router = Router();

export interface PublicMessage { id: number; tokenId: string; name: string; text: string; isAI: boolean; ts: number; }
function toPublic(m: StoredGlobalMessage): PublicMessage {
  return { id: m.id, tokenId: m.tokenId, name: m.gotchiName, text: m.text, isAI: m.isAI, ts: m.ts };
}

// In-memory SSE client set (Task 5 wires /stream; broadcast is defined here so /post can use it).
const clients = new Set<Response>();
export function broadcast(msg: PublicMessage) {
  const payload = `event: message\ndata: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) { try { res.write(payload); } catch { /* drop */ } }
}
// Exposed so Task 5's /stream can register/unregister connections.
export const sseClients = clients;

// per-wallet token bucket: 5 msgs / 30s
const buckets = new Map<string, { count: number; resetAt: number }>();
function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return false; }
  b.count += 1;
  return b.count > limit;
}
// 5 msgs / 30s per wallet, plus a per-IP cap (req.ip via app.ts trust proxy).
function rateLimited(wallet: string, ip?: string): boolean {
  const w = hit("w:" + wallet, 5, 30_000);
  const i = ip ? hit("ip:" + ip, 20, 30_000) : false;
  return w || i;
}

router.get("/history", (req, res) => {
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(req.query.limit)) || 50));
  res.json({ messages: recentGlobalMessages(limit).map(toPublic) });
});

router.post("/post", async (req, res) => {
  try {
    const body = req.body ?? {};
    const tokenId = String(body.tokenId ?? "");
    const wallet = String(body.wallet ?? "").toLowerCase();
    const rawText = String(body.text ?? "").slice(0, 280).trim();
    const signedAt = Number(body.signedAt);
    const signature = String(body.signature ?? "");
    if (!tokenId || !wallet.startsWith("0x") || !rawText) {
      return res.status(400).json({ error: "tokenId, wallet (0x), text required" });
    }
    if (rateLimited(wallet, req.ip)) return res.status(429).json({ error: "slow down, fren 👻" });

    if (!(await verifyRoomSignature(wallet, signedAt, signature))) {
      return res.status(401).json({ error: "join signature required" });
    }
    const state = await fetchGotchiState(tokenId);
    if (!state) return res.status(404).json({ error: "gotchi not found" });
    if (!state.owner || state.owner !== wallet) {
      return res.status(403).json({ error: "you don't own that gotchi" });
    }

    const { masked } = filterInbound(rawText);
    const stored = appendGlobalMessage({ tokenId, gotchiName: state.name, wallet, text: masked, isAI: false });
    const pub = toPublic(stored);
    broadcast(pub);
    res.json({ ok: true, message: pub });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Tell nginx not to buffer this response, else SSE messages never flush to the client.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(": connected\n\n");
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* drop */ }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

export default router;
