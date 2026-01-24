import { getGotchiSvg, getPlaceholderSvg } from "../../../server/aavegotchi/serverSvgService";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: true, message: "Method not allowed" });
    return;
  }
  try {
    const rawId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
    const id = String(rawId || "");
    if (!/^\d+$/.test(id)) {
      res.status(200).json({ svg: getPlaceholderSvg(`gotchi:${id}`) });
      return;
    }
    const svg = await getGotchiSvg(id);
    res.status(200).json({ svg });
  } catch (error) {
    console.error("GET /api/gotchis/:id/svg failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch gotchi svg",
    });
  }
}

