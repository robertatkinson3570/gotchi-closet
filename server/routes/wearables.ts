import { Router } from "express";
import { getWearableThumbs, getPlaceholderSvg } from "../aavegotchi/serverSvgService";

const router = Router();

// Single wearable thumbnail (cacheable GET) — parity with the Vercel function at
// api/wearables/[id]/thumb.ts. Deterministic from (haunt, collateral, traits, id),
// so it's safe to cache at a CDN (e.g. Cloudflare) if the client is served here.
router.get("/:id/thumb", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const haunt = Number(req.query.haunt);
    const collateral = String(req.query.collateral || "");
    const traits = String(req.query.traits || "")
      .split(",")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));

    if (!Number.isFinite(id) || id <= 0) {
      res.json({ svg: getPlaceholderSvg(`thumb:${req.params.id}`) });
      return;
    }
    if (!Number.isFinite(haunt) || !/^0x[a-fA-F0-9]{40}$/.test(collateral) || traits.length < 6) {
      res.json({ svg: getPlaceholderSvg(`thumb:${id}`) });
      return;
    }

    const thumbs = await getWearableThumbs(
      { hauntId: haunt, collateral, numericTraits: traits.slice(0, 6) },
      [id]
    );
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.json({ svg: thumbs[id] || getPlaceholderSvg(`thumb:${id}`) });
  } catch (error) {
    console.error("GET /api/wearables/:id/thumb failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch wearable thumb",
    });
  }
});

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

