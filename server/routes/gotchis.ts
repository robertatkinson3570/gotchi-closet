import { Router } from "express";
import { getGotchiSvg, getGotchiSvgs, previewGotchiSvg, getPlaceholderSvg, getGotchiBaseTraits } from "../aavegotchi/serverSvgService";

const router = Router();

router.get("/:id/svg", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
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
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  try {
    const { tokenId, hauntId, collateral, numericTraits, wearableIds } = req.body || {};
    const collateralStr = String(collateral || "");
    if (!Number.isFinite(Number(hauntId)) || !/^0x[a-fA-F0-9]{40}$/.test(collateralStr)) {
      console.log(`[PREVIEW] Invalid params: hauntId=${hauntId} collateral=${collateralStr}`);
      res.json({ svg: getPlaceholderSvg("preview:invalid") });
      return;
    }
    // CRITICAL: Include tokenId to ensure unique cache keys per gotchi
    const svg = await previewGotchiSvg({
      tokenId: tokenId ? Number(tokenId) : undefined,
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

router.post("/base-traits", async (req, res) => {
  try {
    const { tokenId } = req.body || {};
    const tokenIdStr = String(tokenId || "").trim();
    if (!tokenIdStr || !/^\d+$/.test(tokenIdStr)) {
      res.status(400).json({
        error: true,
        code: "INVALID_TOKEN_ID",
        message: "Invalid or missing tokenId",
      });
      return;
    }
    const baseTraits = await getGotchiBaseTraits(tokenIdStr);
    if (!Array.isArray(baseTraits) || baseTraits.length < 6) {
      res.status(500).json({
        error: true,
        code: "INVALID_RESPONSE",
        message: "Contract returned invalid base traits",
      });
      return;
    }
    const safeTraits = baseTraits.slice(0, 6).map((v) => {
      const num = Number(v);
      return Number.isFinite(num) ? num : 0;
    });
    res.json({ baseTraits: safeTraits });
  } catch (error) {
    console.error("POST /api/gotchis/base-traits failed", error);
    res.status(500).json({
      error: true,
      code: "RPC_ERROR",
      message: (error as Error).message || "Failed to fetch base traits from contract",
    });
  }
});

export default router;

