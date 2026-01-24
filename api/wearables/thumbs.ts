import { getWearableThumbs, getPlaceholderSvg } from "../_lib/aavegotchi.js";
import { readJson } from "../_lib/readJson.js";
import { badRequest, sendError, sendJson, sendOk, upstreamError } from "../_lib/http.js";
import { requireEnv } from "../_lib/env.js";

export const config = { runtime: "nodejs" };

type ThumbsBody = {
  hauntId?: number | string;
  collateral?: string;
  numericTraits?: Array<number | string>;
  wearableIds?: Array<number | string>;
  ids?: Array<number | string>;
  itemIds?: Array<number | string>;
};

export default async function handler(req: any, res: any) {
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: true, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
      return;
    }
    const contentType = req.headers?.["content-type"] || "";
    const contentLength = req.headers?.["content-length"] || "";
    console.log("[thumbs]", requestId, { method: req.method, url: req.url, contentType, contentLength });
    requireEnv("VITE_GOTCHI_DIAMOND_ADDRESS");
    requireEnv("VITE_BASE_RPC_URL");
    requireEnv("VITE_GOTCHI_SUBGRAPH_URL");
    const body = await readJson<ThumbsBody>(req);
    const rawIds = body.wearableIds ?? body.ids ?? body.itemIds;
    console.log("[thumbs]", requestId, { keys: Object.keys(body || {}), idsLen: Array.isArray(rawIds) ? rawIds.length : 0 });
    if (rawIds && !Array.isArray(rawIds)) {
      throw badRequest("INVALID_WEARABLE_IDS", "wearableIds must be an array");
    }
    if (body.numericTraits && !Array.isArray(body.numericTraits)) {
      throw badRequest("INVALID_NUMERIC_TRAITS", "numericTraits must be an array");
    }
    const { hauntId, collateral, numericTraits, wearableIds } = body || {};
    const ids = Array.isArray(rawIds)
      ? rawIds
          .map((value: number | string) => Number(value))
          .filter((id) => Number.isFinite(id))
      : [];
    if (ids.length === 0) {
      throw badRequest("NO_VALID_IDS", "No valid wearableIds provided");
    }

    const collateralStr = String(collateral || "");
    if (!Number.isFinite(Number(hauntId)) || !/^0x[a-fA-F0-9]{40}$/.test(collateralStr)) {
      const thumbs = ids.reduce<Record<number, string>>((acc, id) => {
        acc[id] = getPlaceholderSvg(`thumb:${id}`);
        return acc;
      }, {});
      sendOk(res, { thumbs });
      return;
    }

    let thumbs: Record<number, string>;
    try {
      thumbs = await getWearableThumbs(
        {
          hauntId: Number(hauntId),
          collateral: collateralStr,
          numericTraits: Array.isArray(numericTraits)
            ? numericTraits.map((v: number | string) => Number(v) || 0)
            : [],
        },
        ids
      );
    } catch (err) {
      throw upstreamError((err as Error).message || "Upstream thumbs fetch failed");
    }

    sendOk(res, { thumbs });
  } catch (error) {
    console.error("[thumbs] error", {
      requestId,
      message: (error as Error).message,
      stack: (error as Error).stack,
      method: req.method,
      url: req.url,
    });
    sendError(res, error, requestId);
  }
}

