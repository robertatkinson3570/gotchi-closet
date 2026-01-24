import { getGotchiSvgs, getPlaceholderSvg } from "../../server/aavegotchi/serverSvgService";
import { readJson } from "../_lib/readJson";
import { badRequest, sendError, sendJson } from "../_lib/http";
import { requireEnv } from "../_lib/env";

export const config = { runtime: "nodejs" };

type SvgsBody = {
  tokenIds?: Array<string | number>;
  ids?: Array<string | number>;
};

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: true, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
      return;
    }
    requireEnv("VITE_GOTCHI_DIAMOND_ADDRESS");
    const body = await readJson<SvgsBody>(req);
    const rawIds = body.tokenIds ?? body.ids;
    if (rawIds && !Array.isArray(rawIds)) {
      throw badRequest("INVALID_IDS", "ids must be an array");
    }
    const ids = Array.isArray(rawIds)
      ? rawIds.map((value: string | number) => String(value))
      : [];
    const validIds = ids.filter((id) => /^\d+$/.test(id));
    if (validIds.length === 0) {
      throw badRequest("NO_VALID_IDS", "No valid ids provided");
    }
    const svgs = await getGotchiSvgs(validIds);
    for (const id of ids) {
      if (!svgs[id]) {
        svgs[id] = getPlaceholderSvg(`gotchi:${id}`);
      }
    }
    sendJson(res, 200, { svgs });
  } catch (error) {
    console.error("[svgs] error", {
      message: (error as Error).message,
      stack: (error as Error).stack,
      method: req.method,
      url: req.url,
      idsCount: Array.isArray((error as any)?.ids) ? (error as any).ids.length : undefined,
    });
    sendError(res, error);
  }
}

