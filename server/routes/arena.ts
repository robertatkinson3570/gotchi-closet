import { Router } from "express";
import { fetchPublicGotchi } from "../arena/publicState";
import { publicTasteChat } from "../arena/publicChat";
import { buildPersonality } from "../../src/lib/companion/personality";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/arena/gotchi/:tokenId
// Public — no auth. Returns public gotchi fields + personality archetype.
// ---------------------------------------------------------------------------

router.get("/gotchi/:tokenId", async (req, res) => {
  const { tokenId } = req.params;
  const gotchi = await fetchPublicGotchi(tokenId);
  if (!gotchi) {
    res.status(404).json({ error: "Gotchi not found or not yet summoned" });
    return;
  }

  const personality = buildPersonality({
    name: gotchi.name,
    numericTraits: gotchi.traits,
    kinship: gotchi.kinship,
    level: gotchi.level,
  });

  res.json({
    tokenId: gotchi.tokenId,
    name: gotchi.name,
    traits: gotchi.traits,
    owner: gotchi.owner
      ? `${gotchi.owner.slice(0, 6)}…${gotchi.owner.slice(-4)}`
      : undefined,
    kinship: gotchi.kinship,
    level: gotchi.level,
    archetype: personality.archetype,
    traitLines: personality.traitLines,
  });
});

// ---------------------------------------------------------------------------
// POST /api/arena/chat/:tokenId
// Public — no auth. Body: { message: string }
// Derives visitor from IP / x-forwarded-for.
// ---------------------------------------------------------------------------

router.post("/chat/:tokenId", async (req, res) => {
  const { tokenId } = req.params;
  const { message } = req.body ?? {};

  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (message.length > 300) {
    res.status(400).json({ error: "message too long (max 300 chars)" });
    return;
  }

  // Derive visitor identifier from IP (best-effort; no PII stored beyond hashed IP)
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]) ??
    req.ip ??
    "unknown";
  // Hash IP so we never store the raw address in SQLite
  const visitor = `v_${Buffer.from(rawIp.trim()).toString("base64url").slice(0, 16)}`;

  try {
    const result = await publicTasteChat(tokenId, message.trim(), visitor);
    res.json(result);
  } catch (err) {
    console.error("[arena/chat] error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
