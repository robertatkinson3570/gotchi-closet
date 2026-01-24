import { getGotchiSvgs } from "../_lib/aavegotchi";
import { requireEnv } from "../_lib/env";
import { sendError, sendOk, upstreamError } from "../_lib/http";

export const config = { runtime: "nodejs" };

export default async function handler(req: any, res: any) {
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  try {
    requireEnv("VITE_GOTCHI_DIAMOND_ADDRESS");
    requireEnv("VITE_BASE_RPC_URL");
    requireEnv("VITE_GOTCHI_SUBGRAPH_URL");
    const tokenId = "21403";
    let svgs: Record<string, string>;
    try {
      svgs = await getGotchiSvgs([tokenId]);
    } catch (err) {
      throw upstreamError((err as Error).message || "Upstream SVG fetch failed");
    }
    sendOk(res, { ok: true, requestId, svgs: { [tokenId]: svgs[tokenId] } });
  } catch (error) {
    console.error("[svgs-smoke] error", requestId, (error as Error).stack || error);
    sendError(res, error, requestId);
  }
}

