import { getGotchiSvgs, getPlaceholderSvg } from "../_lib/aavegotchi.js";
import { readJson } from "../_lib/readJson.js";
import { badRequest, sendError, sendJson, sendOk, upstreamError } from "../_lib/http.js";
import { requireEnv } from "../_lib/env.js";

export const config = { runtime: "nodejs" };

type SvgsBody = {
  tokenIds?: Array<string | number>;
  ids?: Array<string | number>;
  gotchiIds?: Array<string | number>;
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
    console.log("[svgs]", requestId, { method: req.method, url: req.url, contentType, contentLength });
    requireEnv("VITE_GOTCHI_DIAMOND_ADDRESS");
    requireEnv("VITE_BASE_RPC_URL");
    requireEnv("VITE_GOTCHI_SUBGRAPH_URL");
    const body = await readJson<SvgsBody>(req);
    const rawIds = body.tokenIds ?? body.ids ?? body.gotchiIds;
    console.log("[svgs]", requestId, { keys: Object.keys(body || {}), idsLen: Array.isArray(rawIds) ? rawIds.length : 0 });
    if (rawIds && !Array.isArray(rawIds)) {
      throw badRequest("INVALID_IDS", "ids must be an array");
    }
    const numericIds = Array.isArray(rawIds)
      ? rawIds.map((value: string | number) => Number(value)).filter((value) => Number.isFinite(value))
      : [];
    if (numericIds.length === 0) {
      throw badRequest("NO_VALID_IDS", "No valid ids provided");
    }
    const validIds = numericIds.map((value) => String(Math.trunc(value)));
    let svgs: Record<string, string>;
    try {
      svgs = await getGotchiSvgs(validIds);
    } catch (err) {
      throw upstreamError((err as Error).message || "Upstream SVG fetch failed");
    }
    for (const id of validIds) {
      if (!svgs[id]) {
        svgs[id] = getPlaceholderSvg(`gotchi:${id}`);
      }
    }
    sendOk(res, { svgs });
  } catch (error) {
    console.error("[svgs] error", {
      requestId,
      message: (error as Error).message,
      stack: (error as Error).stack,
      method: req.method,
      url: req.url,
    });
    sendError(res, error, requestId);
  }
}

