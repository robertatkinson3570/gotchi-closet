import { previewGotchiSvg, getPlaceholderSvg } from "../../server/aavegotchi/serverSvgService";
import { readJsonBody } from "../_body";
import { logError, logInfo } from "../_log";

export const config = { runtime: "nodejs" };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: true, message: "Method not allowed" });
    return;
  }
  try {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const { hauntId, collateral, numericTraits, wearableIds } = body || {};
    const collateralStr = String(collateral || "");
    logInfo("gotchis.preview.request", {
      path: req.url,
      hauntId: Number(hauntId) || null,
      wearables: Array.isArray(wearableIds) ? wearableIds.length : 0,
    });
    if (!Number.isFinite(Number(hauntId)) || !/^0x[a-fA-F0-9]{40}$/.test(collateralStr)) {
      res.status(200).json({ svg: getPlaceholderSvg("preview:invalid") });
      return;
    }
    const svg = await previewGotchiSvg({
      hauntId: Number(hauntId),
      collateral: collateralStr,
      numericTraits: Array.isArray(numericTraits)
        ? numericTraits.map((v: unknown) => Number(v) || 0)
        : [],
      wearableIds: Array.isArray(wearableIds)
        ? wearableIds.map((v: unknown) => Number(v) || 0)
        : [],
    });
    res.status(200).json({ svg });
  } catch (error) {
    logError("gotchis.preview.error", {
      path: req.url,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch preview svg",
      code: "internal_error",
    });
  }
}

