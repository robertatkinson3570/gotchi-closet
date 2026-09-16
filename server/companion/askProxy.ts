// KEEPER GOTCHI (07-analyst-chat.md §7.3): "the Closet CompanionChatPanel:
// an 'Ask your gotchi' toggle that sends to /api/analyst/ask". Closet has
// no GVR room ticket, so the panel signs the same keeper read message the
// Keeper tab already signs (keeperAuth.ts) and GVR verifies it as the
// wallet proof. Closet does NOT re-verify, route, or phrase anything: GVR
// is the one warehouse with the data, the one router, the one citation
// check; whatever GVR answers (200 with cites, 402 { refused: "holder" },
// 429 capped, 404 when the analyst is off) is forwarded unchanged. This
// file only shapes the request and never invents a wallet or a tokenId.

const GVR_API = process.env.GVR_API_URL || "https://gvr.gotchicloset.com";
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TOKEN_ID_RE = /^\d{1,12}$/;
/** A routed turn is one lookup and a phrasing; an open one is two tool
 *  rounds with thinking on. GVR's own analyst rail waits 45 s. */
const ASK_TIMEOUT_MS = 75_000;

export interface AskProxyResult {
  status: number;
  body: any;
}

export type AskProxyBody = {
  tokenId?: unknown; wallet?: unknown; message?: unknown; history?: unknown; signedAt?: unknown; signature?: unknown; gotchi?: unknown;
};

export async function proxyAnalystAsk(body: AskProxyBody): Promise<AskProxyResult> {
  const tokenId = String(body.tokenId ?? "");
  const wallet = String(body.wallet ?? "").toLowerCase();
  const message = String(body.message ?? "").slice(0, 500);
  if (!ADDR_RE.test(wallet)) return { status: 400, body: { error: "wallet (0x) required" } };
  if (!TOKEN_ID_RE.test(tokenId)) return { status: 400, body: { error: "tokenId required" } };
  if (!message.trim()) return { status: 400, body: { error: "message required" } };
  const signedAt = typeof body.signedAt === "number" ? body.signedAt : Number(body.signedAt);
  if (!Number.isFinite(signedAt) || typeof body.signature !== "string" || !body.signature.startsWith("0x")) {
    return { status: 400, body: { error: "signedAt and signature required" } };
  }
  const history = Array.isArray(body.history)
    ? body.history
        .filter((h: any) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
        .slice(-6)
        .map((h: any) => ({ role: h.role, content: String(h.content).slice(0, 400) }))
    : [];
  try {
    const res = await fetch(`${GVR_API}/api/analyst/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokenId, wallet, message, history, signedAt, signature: body.signature, collection: "aavegotchi", ...(body.gotchi ? { gotchi: body.gotchi } : {}) }),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
    const out = await res.json().catch(() => ({ error: "GVR answered with no body" }));
    return { status: res.status, body: out };
  } catch (err: any) {
    return { status: 502, body: { error: `couldn't reach GVR: ${err?.message ?? String(err)}` } };
  }
}
