import { Router } from "express";
import { getGotchiSvg, getGotchiSvgs, previewGotchiSvg, getPlaceholderSvg } from "../aavegotchi/serverSvgService";

const router = Router();

router.get("/:id/svg", async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      res.json({ svg: getPlaceholderSvg(`gotchi:${id}`) });
      return;
    }
    const svg = await getGotchiSvg(id);
    res.json({ svg });
  } catch (error) {
    console.error("GET /api/gotchis/:id/svg failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch gotchi svg",
    });
  }
});

router.post("/svgs", async (req, res) => {
  try {
    const { tokenIds } = req.body || {};
    const ids = Array.isArray(tokenIds)
      ? tokenIds.map((value: unknown) => String(value))
      : [];
    const validIds = ids.filter((id) => /^\d+$/.test(id));
    const svgs = await getGotchiSvgs(validIds);
    for (const id of ids) {
      if (!svgs[id]) {
        svgs[id] = getPlaceholderSvg(`gotchi:${id}`);
      }
    }
    res.json({ svgs });
  } catch (error) {
    console.error("POST /api/gotchis/svgs failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch gotchi svgs",
    });
  }
});

router.post("/preview", async (req, res) => {
  try {
    const { hauntId, collateral, numericTraits, wearableIds } = req.body || {};
    const collateralStr = String(collateral || "");
    if (!Number.isFinite(Number(hauntId)) || !/^0x[a-fA-F0-9]{40}$/.test(collateralStr)) {
      res.json({ svg: getPlaceholderSvg("preview:invalid") });
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
    res.json({ svg });
  } catch (error) {
    console.error("POST /api/gotchis/preview failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch preview svg",
    });
  }
});

export default router;

