import { previewGotchiSvg, getPlaceholderSvg } from "../../server/aavegotchi/serverSvgService";

export const config = { runtime: "nodejs" };

function parseBody(req: any) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: true, message: "Method not allowed" });
    return;
  }
  try {
    const body = parseBody(req);
    const { hauntId, collateral, numericTraits, wearableIds } = body || {};
    const collateralStr = String(collateral || "");
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
    console.error("POST /api/gotchis/preview failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch preview svg",
    });
  }
}

