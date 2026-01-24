import { getWearableThumbs } from "../../server/aavegotchi/serverSvgService";
import { requireEnv } from "../_lib/env";
import { sendError, sendOk, upstreamError } from "../_lib/http";

export const config = { runtime: "nodejs" };

export default async function handler(req: any, res: any) {
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  try {
    requireEnv("VITE_GOTCHI_DIAMOND_ADDRESS");
    requireEnv("VITE_BASE_RPC_URL");
    requireEnv("VITE_GOTCHI_SUBGRAPH_URL");
    const wearableId = 418;
    let thumbs: Record<number, string>;
    try {
      thumbs = await getWearableThumbs(
        {
          hauntId: 1,
          collateral: "0x0000000000000000000000000000000000000000",
          numericTraits: [50, 50, 50, 50, 50, 50],
        },
        [wearableId]
      );
    } catch (err) {
      throw upstreamError((err as Error).message || "Upstream thumbs fetch failed");
    }
    sendOk(res, { ok: true, requestId, thumbs: { [wearableId]: thumbs[wearableId] } });
  } catch (error) {
    console.error("[thumbs-smoke] error", requestId, (error as Error).stack || error);
    sendError(res, error, requestId);
  }
}

