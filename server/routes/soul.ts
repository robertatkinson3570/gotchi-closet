import { Router } from "express";
import { fetchGotchiState } from "../companion/gotchiState";
import { getRecentMessages, getFacts } from "../companion/db";
import { newSoulDocument } from "../soul/soulDoc";
import { buildDepth } from "../soul/depth";
import { saveSoulDoc, getSoulDoc } from "../soul/soulStore";
import { reconcileSoul } from "../soul/transfer";

const router = Router();

router.get("/:tokenId", async (req, res) => {
  try {
    const { tokenId } = req.params;

    // Lazy reconcile: if the gotchi changed hands while we were offline,
    // distill the old owner's memories into echoes before we build depth.
    try { await reconcileSoul(tokenId); } catch (_) { /* non-fatal */ }

    const state = await fetchGotchiState(tokenId);
    if (!state) return res.status(404).json({ error: "Gotchi not found" });

    const owner = state.owner ?? "";
    const msgs = owner ? await getRecentMessages(owner, tokenId, 500) : [];
    const facts = owner ? await getFacts(owner, tokenId) : [];

    // Compute firstBondedAt (ms)
    const firstBondedAt =
      msgs.length > 0
        ? Math.min(...msgs.map((m) => m.ts))
        : state.createdAt
        ? state.createdAt * 1000
        : Date.now();

    // Calendar day buckets (UTC)
    const daySet = new Set(
      msgs.map((m) => {
        const d = new Date(m.ts);
        return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      })
    );
    const bondedDays = daySet.size;

    const lastInteractionTs =
      msgs.length > 0 ? Math.max(...msgs.map((m) => m.ts)) : 0;

    // Streak: count consecutive days ending today that have a message
    let streak = 0;
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      const checkTs = now - i * 86400000;
      const d = new Date(checkTs);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      if (daySet.has(key)) streak++;
      else break;
    }

    // Consistency history (last 7 days, 0 or 1), oldest-first
    const consistencyHistory = Array.from({ length: 7 }, (_, i) => {
      const checkTs = now - (6 - i) * 86400000;
      const d = new Date(checkTs);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      return daySet.has(key) ? 1 : 0;
    });

    const doc = newSoulDocument(tokenId, firstBondedAt);
    doc.bonding.bondedDays = bondedDays;
    doc.bonding.lastInteractionTs = lastInteractionTs;
    doc.bonding.streak = streak;
    doc.bonding.consistencyHistory = consistencyHistory;
    doc.memories = facts.map((f) => ({
      ts: Date.now(),
      summary: f,
      privacy: "normal" as const,
      weight: 1,
    }));
    // Load stored past-life echoes (from a previous owner's distilled memories).
    const storedDoc = getSoulDoc(tokenId);
    doc.pastLives = storedDoc?.pastLives ?? [];

    const kinship = state.kinship ?? 0;
    const xp = (state.level ?? 0) * 1000;

    const depth = buildDepth(doc, { kinship, xp });

    // sealStatus: "unconfigured" when no contract address is set, else "unsealed"
    // (full on-chain seal lookup is a later phase).
    const sealAddress = process.env.SOUL_SEAL_ADDRESS;
    const sealStatus: "unconfigured" | "unsealed" =
      sealAddress && sealAddress.trim() !== "" ? "unsealed" : "unconfigured";

    const pastLivesEchoes = doc.pastLives.map(({ eraHint, fragment }) => ({
      eraHint,
      fragment,
    }));

    try {
      saveSoulDoc(tokenId, owner || null, doc, {
        depth: depth.score,
        soulAgeDays: bondedDays,
        pastLivesCount: pastLivesEchoes.length,
      });
    } catch (_) {
      // Non-fatal: store best-effort
    }

    return res.json({
      tokenId,
      name: state.name,
      depth: depth.score,
      level: depth.level,
      breakdown: depth.breakdown,
      soulAgeDays: bondedDays,
      streak,
      kinship,
      memories: facts.length,
      pastLives: pastLivesEchoes,
      sealStatus,
    });
  } catch (err) {
    console.error("[soul route]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
