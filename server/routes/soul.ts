import { Router } from "express";
import { fetchGotchiState } from "../companion/gotchiState";
import { getRecentMessages, getFacts } from "../companion/db";
import { newSoulDocument, soulHash as computeSoulHash } from "../soul/soulDoc";
import { buildDepth } from "../soul/depth";
import { saveSoulDoc, getSoulDoc } from "../soul/soulStore";
import { reconcileSoul } from "../soul/transfer";
import {
  sealConfigured,
  buildSealAttestation,
  readOnChainSeal,
  readOnChainSealsBatch,
} from "../soul/seal";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: build soul doc + depth for a tokenId (shared by multiple routes)
// ---------------------------------------------------------------------------

async function buildSoulContext(tokenId: string) {
  try { await reconcileSoul(tokenId); } catch (_) { /* non-fatal */ }

  const state = await fetchGotchiState(tokenId);
  if (!state) return null;

  const owner = state.owner ?? "";
  const msgs = owner ? await getRecentMessages(owner, tokenId, 500) : [];
  const facts = owner ? await getFacts(owner, tokenId) : [];

  const firstBondedAt =
    msgs.length > 0
      ? Math.min(...msgs.map((m) => m.ts))
      : state.createdAt
      ? state.createdAt * 1000
      : Date.now();

  const daySet = new Set(
    msgs.map((m) => {
      const d = new Date(m.ts);
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    })
  );
  const bondedDays = daySet.size;

  const lastInteractionTs =
    msgs.length > 0 ? Math.max(...msgs.map((m) => m.ts)) : 0;

  let streak = 0;
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const checkTs = now - i * 86400000;
    const d = new Date(checkTs);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (daySet.has(key)) streak++;
    else break;
  }

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
  const storedDoc = getSoulDoc(tokenId);
  doc.pastLives = storedDoc?.pastLives ?? [];

  const kinship = state.kinship ?? 0;
  const xp = (state.level ?? 0) * 1000;
  const depth = buildDepth(doc, { kinship, xp });
  const hash = computeSoulHash(doc) as `0x${string}`;

  return { state, owner, doc, depth, hash, bondedDays, streak, facts };
}

// ---------------------------------------------------------------------------
// GET /verify/:tokenId — MUST be registered before /:tokenId
// ---------------------------------------------------------------------------

router.get("/verify/:tokenId", async (req, res) => {
  try {
    const { tokenId } = req.params;
    const ctx = await buildSoulContext(tokenId);

    if (!ctx) {
      return res.json({
        tokenId,
        configured: sealConfigured(),
        onChain: null,
        serverDepth: null,
        serverLevel: null,
        soulHash: null,
      });
    }

    const onChain = await readOnChainSeal(tokenId);

    return res.json({
      tokenId,
      configured: sealConfigured(),
      onChain,
      serverDepth: ctx.depth.score,
      serverLevel: ctx.depth.level,
      soulHash: ctx.hash,
    });
  } catch (err) {
    console.error("[soul verify route]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /seals — batch seal-status for many tokenIds (one Multicall3 eth_call).
// Registered before /:tokenId routes. Body: { tokenIds: string[] }.
// Returns { configured, sealed: { [tokenId]: boolean } }.
// ---------------------------------------------------------------------------

router.post("/seals", async (req, res) => {
  try {
    const raw = (req.body && (req.body as { tokenIds?: unknown }).tokenIds) || [];
    if (!Array.isArray(raw)) {
      return res.json({ configured: sealConfigured(), sealed: {} });
    }
    // Bound the request: at most 500 ids, coerced to strings, deduped.
    const ids = Array.from(new Set(raw.map((x) => String(x)))).slice(0, 500);
    const sealed = await readOnChainSealsBatch(ids);
    return res.json({ configured: sealConfigured(), sealed });
  } catch (err) {
    console.error("[soul seals batch route]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /:tokenId/seal
// ---------------------------------------------------------------------------

router.post("/:tokenId/seal", async (req, res) => {
  try {
    if (!sealConfigured()) {
      return res.status(503).json({ error: "sealing not available yet" });
    }

    const { tokenId } = req.params;
    const ctx = await buildSoulContext(tokenId);
    if (!ctx) return res.status(404).json({ error: "Gotchi not found" });

    const attestation = await buildSealAttestation({
      tokenId,
      soulHash:    ctx.hash,
      // depthBips/soulAgeDays are uint16 in the contract — clamp defensively so
      // an out-of-range value can never make viem throw mid-seal. depthBips maxes
      // at 10000 (depth ≤ 100); soulAgeDays only nears 65535 after ~179 years.
      depthBips:   Math.min(65535, Math.round(ctx.depth.score * 100)),
      soulAgeDays: Math.min(65535, ctx.bondedDays),
      nonce:       Date.now().toString(),
    });

    if (!attestation) {
      return res.status(503).json({ error: "sealing not available yet" });
    }

    return res.json(attestation);
  } catch (err) {
    console.error("[soul seal route]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:tokenId", async (req, res) => {
  try {
    const { tokenId } = req.params;

    const ctx = await buildSoulContext(tokenId);
    if (!ctx) return res.status(404).json({ error: "Gotchi not found" });

    const { state, owner, doc, depth, bondedDays, streak, facts } = ctx;

    // sealStatus reflects real on-chain state: "unconfigured" (no contract set),
    // "sealed" (a seal record exists on Base for this token), or "unsealed".
    // The on-chain read is best-effort — any RPC failure degrades to "unsealed"
    // and never blocks the certificate from loading.
    let sealStatus: "unconfigured" | "unsealed" | "sealed" = "unconfigured";
    if (sealConfigured()) {
      const onChain = await readOnChainSeal(tokenId).catch(() => null);
      sealStatus = onChain ? "sealed" : "unsealed";
    }

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
      kinship: state.kinship ?? 0,
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
