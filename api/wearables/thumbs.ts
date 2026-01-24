import { getWearableThumbs, getPlaceholderSvg } from "../../server/aavegotchi/serverSvgService";
import { readJson } from "../_lib/readJson";
import { badRequest, sendError, sendJson } from "../_lib/http";
import { requireEnv } from "../_lib/env";

export const config = { runtime: "nodejs" };

type ThumbsBody = {
  hauntId?: number | string;
  collateral?: string;
  numericTraits?: Array<number | string>;
  wearableIds?: Array<number | string>;
  ids?: Array<number | string>;
};

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: true, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
      return;
    }
    requireEnv("VITE_GOTCHI_DIAMOND_ADDRESS");
    const body = await readJson<ThumbsBody>(req);
    const rawIds = body.wearableIds ?? body.ids;
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
      sendJson(res, 200, { thumbs });
      return;
    }

    const thumbs = await getWearableThumbs(
      {
        hauntId: Number(hauntId),
        collateral: collateralStr,
        numericTraits: Array.isArray(numericTraits)
          ? numericTraits.map((v: number | string) => Number(v) || 0)
          : [],
      },
      ids
    );

    sendJson(res, 200, { thumbs });
  } catch (error) {
    console.error("[thumbs] error", {
      message: (error as Error).message,
      stack: (error as Error).stack,
      method: req.method,
      url: req.url,
      idsCount: Array.isArray((error as any)?.ids) ? (error as any).ids.length : undefined,
    });
    sendError(res, error);
  }
}

