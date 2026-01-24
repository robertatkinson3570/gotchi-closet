import { getGotchiSvgs, getPlaceholderSvg } from "../../server/aavegotchi/serverSvgService";
import { readJsonBody } from "../_body";
import { logError, logInfo } from "../_log";

export const config = { runtime: "nodejs" };

type SvgsBody = {
  tokenIds?: Array<string | number>;
};

function badRequest(res: any, message: string, code: string) {
  res.status(400).json({ error: true, message, code });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: true, message: "Method not allowed", code: "method_not_allowed" });
    return;
  }
  try {
    const rawBody = await readJsonBody(req, res);
    if (!rawBody) return;
    const body = rawBody as SvgsBody;
    if (body.tokenIds && !Array.isArray(body.tokenIds)) {
      badRequest(res, "tokenIds must be an array", "invalid_token_ids");
      return;
    }
    const ids = Array.isArray(body.tokenIds)
      ? body.tokenIds.map((value: string | number) => String(value))
      : [];
    const validIds = ids.filter((id) => /^\d+$/.test(id));
    logInfo("gotchis.svgs.request", {
      path: req.url,
      totalIds: ids.length,
      validIds: validIds.length,
    });
    const svgs = await getGotchiSvgs(validIds);
    for (const id of ids) {
      if (!svgs[id]) {
        svgs[id] = getPlaceholderSvg(`gotchi:${id}`);
      }
    }
    res.status(200).json({ svgs });
  } catch (error) {
    logError("gotchis.svgs.error", {
      path: req.url,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    res.status(500).json({
      error: true,
      message: (error as Error).message || "Failed to fetch gotchi svgs",
      code: "internal_error",
    });
  }
}

