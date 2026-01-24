import { Router } from "express";
import { getWearableThumbs, getPlaceholderSvg } from "../aavegotchi/serverSvgService";

const router = Router();

router.post("/thumbs", async (req, res) => {
  try {
    const { hauntId, collateral, numericTraits, wearableIds } = req.body || {};
    const ids = Array.isArray(wearableIds)
      ? wearableIds.map((value: unknown) => Number(value)).filter((id) => Number.isFinite(id))
      : [];

    const collateralStr = String(collateral || "");
    if (!Number.isFinite(Number(hauntId)) || !/^0x[a-fA-F0-9]{40}$/.test(collateralStr)) {
      const thumbs = ids.reduce<Record<number, string>>((acc, id) => {
        acc[id] = getPlaceholderSvg(`thumb:${id}`);
        return acc;
      }, {});
      res.json({ thumbs });
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

    res.json({ thumbs });
  } catch (error) {
    console.error("POST /api/wearables/thumbs failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch wearable thumbs",
    });
  }
});

export default router;

