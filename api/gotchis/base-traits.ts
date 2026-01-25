import { getGotchiBaseTraits, getPlaceholderSvg } from "../_lib/aavegotchi.js";

export const config = { runtime: "nodejs" };

type BaseTraitsBody = {
  tokenId?: string | number;
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: true, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
    return;
  }

  try {
    const body: BaseTraitsBody = req.body || {};
    const tokenId = String(body.tokenId || "").trim();

    if (!tokenId || !/^\d+$/.test(tokenId)) {
      res.status(400).json({
        error: true,
        code: "INVALID_TOKEN_ID",
        message: "Invalid or missing tokenId",
      });
      return;
    }

    const baseTraits = await getGotchiBaseTraits(tokenId);

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

    res.status(200).json({ baseTraits: safeTraits });
  } catch (error) {
    console.error("POST /api/gotchis/base-traits failed", error);
    res.status(500).json({
      error: true,
      code: "RPC_ERROR",
      message: (error as Error).message || "Failed to fetch base traits from contract",
    });
  }
}
