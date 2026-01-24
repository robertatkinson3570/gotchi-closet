import { getWearableThumbs, getPlaceholderSvg } from "../../server/aavegotchi/serverSvgService";

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
    const ids = Array.isArray(wearableIds)
      ? wearableIds.map((value: unknown) => Number(value)).filter((id) => Number.isFinite(id))
      : [];

    const collateralStr = String(collateral || "");
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
          ? numericTraits.map((v: unknown) => Number(v) || 0)
          : [],
      },
      ids
    );

    res.status(200).json({ thumbs });
  } catch (error) {
    console.error("POST /api/wearables/thumbs failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch wearable thumbs",
    });
  }
}

