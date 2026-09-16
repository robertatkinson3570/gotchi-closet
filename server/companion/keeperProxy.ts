// KEEPER GOTCHI (06-standing-questions.md §6.3): "GET /api/companion/keeper/
// :tokenId/:wallet on Closet, which proxies to GVR GET /api/analyst/standing/
// :wallet/:tokenId (Holder plan not required for this read; SIWE-proven
// wallet required)." Closet does NOT re-verify the signature -- GVR is the
// one warehouse with the data and the one that checks it; a signature that
// fails there comes back as GVR's own 401, forwarded unchanged. This file
// only shapes the request and never invents a wallet or a tokenId of its own.

const GVR_API = process.env.GVR_API_URL || "https://gvr.gotchicloset.com";
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TOKEN_ID_RE = /^\d{1,12}$/;

export interface KeeperProxyResult {
  status: number;
  body: any;
}

export async function proxyKeeperStanding(
  tokenId: string,
  wallet: string,
  query: { signedAt?: string; signature?: string }
): Promise<KeeperProxyResult> {
  if (!ADDR_RE.test(wallet)) return { status: 400, body: { error: "wallet (0x) required" } };
  if (!TOKEN_ID_RE.test(tokenId)) return { status: 400, body: { error: "tokenId required" } };
  if (!query.signedAt || !query.signature) return { status: 400, body: { error: "signedAt and signature required" } };
  const q = new URLSearchParams({ signedAt: query.signedAt, signature: query.signature });
  try {
    const res = await fetch(`${GVR_API}/api/analyst/standing/${wallet}/${tokenId}?${q}`, {
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(() => ({ error: "GVR answered with no body" }));
    return { status: res.status, body };
  } catch (err: any) {
    return { status: 502, body: { error: `couldn't reach GVR: ${err?.message ?? String(err)}` } };
  }
}
