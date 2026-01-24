import { getWearableThumbs, getPlaceholderSvg } from "../../server/aavegotchi/serverSvgService";
import { readJsonBody } from "../_body";
import { logError, logInfo } from "../_log";

export const config = { runtime: "nodejs" };

type ThumbsBody = {
  hauntId?: number | string;
  collateral?: string;
  numericTraits?: Array<number | string>;
  wearableIds?: Array<number | string>;
};

function badRequest(res: any, message: string, code: string) {
  res.status(400).json({ error: true, message, code });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: true, message: "Method not allowed", code: "method_not_allowed" });
    return;
  }
  try {
    const rawBody = await readJsonBody(req, res);
    if (!rawBody) return;
    const body = rawBody as ThumbsBody;
    if (body.wearableIds && !Array.isArray(body.wearableIds)) {
      badRequest(res, "wearableIds must be an array", "invalid_wearable_ids");
      return;
    }
    if (body.numericTraits && !Array.isArray(body.numericTraits)) {
      badRequest(res, "numericTraits must be an array", "invalid_numeric_traits");
      return;
    }
    const { hauntId, collateral, numericTraits, wearableIds } = body || {};
    const ids = Array.isArray(wearableIds)
      ? wearableIds
          .map((value: number | string) => Number(value))
          .filter((id) => Number.isFinite(id))
      : [];

    const collateralStr = String(collateral || "");
    logInfo("wearables.thumbs.request", {
      path: req.url,
      totalIds: ids.length,
      hauntId: Number(hauntId) || null,
      hasCollateral: Boolean(collateralStr),
    });
    if (!Number.isFinite(Number(hauntId)) || !/^0x[a-fA-F0-9]{40}$/.test(collateralStr)) {
      const thumbs = ids.reduce<Record<number, string>>((acc, id) => {
        acc[id] = getPlaceholderSvg(`thumb:${id}`);
        return acc;
      }, {});
      res.status(200).json({ thumbs });
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

    res.status(200).json({ thumbs });
  } catch (error) {
    logError("wearables.thumbs.error", {
      path: req.url,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch wearable thumbs",
      code: "internal_error",
    });
  }
}

