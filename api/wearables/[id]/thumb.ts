import { getWearableThumbs, getPlaceholderSvg } from "../../../server/aavegotchi/serverSvgService";

export const config = { runtime: "nodejs" };

// Single wearable thumbnail, rendered on a specific gotchi's body.
// GET so Vercel's CDN can cache it — POST is never CDN-cached, which is why the
// old batch /api/wearables/thumbs re-hit RPC on every panel view (the cost vector).
// The render is deterministic from (haunt, collateral, traits, wearableId) and
// changes ~never, so a long CDN cache is safe. Mirrors api/gotchis/[id]/svg.ts.
export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: true, message: "Method not allowed" });
    return;
  }
  try {
    const rawId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
    const id = Number(String(rawId || ""));
    const haunt = Number(req.query?.haunt);
    const collateral = String(req.query?.collateral || "");
    const traits = String(req.query?.traits || "")
      .split(",")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));

    if (!Number.isFinite(id) || id <= 0) {
      res.status(200).json({ svg: getPlaceholderSvg(`thumb:${rawId}`) });
      return;
    }

    // Missing/invalid gotchi context -> placeholder, and deliberately NOT cached:
    // the real context usually arrives on the next render.
    if (!Number.isFinite(haunt) || !/^0x[a-fA-F0-9]{40}$/.test(collateral) || traits.length < 6) {
      res.status(200).json({ svg: getPlaceholderSvg(`thumb:${id}`) });
      return;
    }

    const thumbs = await getWearableThumbs(
      { hauntId: haunt, collateral, numericTraits: traits.slice(0, 6) },
      [id]
    );
    const svg = thumbs[id] || getPlaceholderSvg(`thumb:${id}`);

    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json({ svg });
  } catch (error) {
    console.error("GET /api/wearables/:id/thumb failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch wearable thumb",
    });
  }
}
