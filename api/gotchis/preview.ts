import { previewGotchiSvg, getPlaceholderSvg } from "../_lib/aavegotchi.js";
import { readJson } from "../_lib/readJson.js";
import { badRequest, sendError, sendJson, sendOk, upstreamError } from "../_lib/http.js";
import { requireEnv } from "../_lib/env.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: any, res: any) {
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: true, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
      return;
    }
    const contentType = req.headers?.["content-type"] || "";
    const contentLength = req.headers?.["content-length"] || "";
    console.log("[preview]", requestId, { method: req.method, url: req.url, contentType, contentLength });
    requireEnv("VITE_GOTCHI_DIAMOND_ADDRESS");
    requireEnv("VITE_BASE_RPC_URL");
    requireEnv("VITE_GOTCHI_SUBGRAPH_URL");
    const body = await readJson<{
      hauntId?: number | string;
      collateral?: string;
      numericTraits?: Array<number | string>;
      wearableIds?: Array<number | string>;
    }>(req);
    console.log("[preview]", requestId, { keys: Object.keys(body || {}) });
    const { hauntId, collateral, numericTraits, wearableIds } = body || {};
    const collateralStr = String(collateral || "");
    if (!Number.isFinite(Number(hauntId))) {
      throw badRequest("INVALID_HAUNT_ID", "hauntId must be a number");
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(collateralStr)) {
      throw badRequest("INVALID_COLLATERAL", "collateral must be a 0x address");
    }
    const svg = await previewGotchiSvg({
      hauntId: Number(hauntId),
      collateral: collateralStr,
      numericTraits: Array.isArray(numericTraits)
        ? numericTraits.map((v: number | string) => Number(v) || 0)
        : [],
      wearableIds: Array.isArray(wearableIds)
        ? wearableIds.map((v: number | string) => Number(v) || 0)
        : [],
    }).catch((err) => {
      throw upstreamError((err as Error).message || "Upstream preview fetch failed");
    });
    sendOk(res, { svg });
  } catch (error) {
    console.error("[preview] error", {
      requestId,
      message: (error as Error).message,
      stack: (error as Error).stack,
      method: req.method,
      url: req.url,
    });
    sendError(res, error, requestId);
  }
}

