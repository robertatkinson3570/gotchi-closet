import { getGotchiSvgs, getPlaceholderSvg } from "../../server/aavegotchi/serverSvgService";

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
    const ids = Array.isArray(body?.tokenIds)
      ? body.tokenIds.map((value: unknown) => String(value))
      : [];
    const validIds = ids.filter((id) => /^\d+$/.test(id));
    const svgs = await getGotchiSvgs(validIds);
    for (const id of ids) {
      if (!svgs[id]) {
        svgs[id] = getPlaceholderSvg(`gotchi:${id}`);
      }
    }
    res.status(200).json({ svgs });
  } catch (error) {
    console.error("POST /api/gotchis/svgs failed", error);
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch gotchi svgs",
    });
  }
}

