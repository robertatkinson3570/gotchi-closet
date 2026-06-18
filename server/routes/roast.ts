import { Router } from "express";
import { verifyRoomSignature } from "../companion/auth";
import { fetchGotchiState } from "../companion/gotchiState";
import { hasCredits } from "../companion/db";
import {
  enqueue,
  leaveQueue,
  getQueue,
  getQueued,
  claimQueued,
  getBattle,
  listBattlesFor,
  leaderboard,
  getStats,
  type QueueEntry,
  type BattleRow,
} from "../roast/store";
import { resolveBattle } from "../roast/engine";
import type { Request, Response } from "express";

const router = Router();

// ---------------------------------------------------------------------------
// Per-wallet battle rate limit: ~3 per 60s (token bucket, in-memory)
// ---------------------------------------------------------------------------

const battleBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(wallet: string): boolean {
  const now = Date.now();
  const b = battleBuckets.get(wallet);
  if (!b || b.resetAt < now) {
    battleBuckets.set(wallet, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  b.count += 1;
  return b.count > 3;
}

// ---------------------------------------------------------------------------
// Public view helpers (strip wallets)
// ---------------------------------------------------------------------------

function toPublicQueue(e: QueueEntry) {
  const stats = getStats(e.tokenId);
  return {
    tokenId: e.tokenId,
    name: e.gotchiName,
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    xp: stats?.xp ?? 0,
  };
}

function toPublicBattle(b: BattleRow) {
  return {
    id: b.id,
    aToken: b.aToken,
    aName: b.aName,
    bToken: b.bToken,
    bName: b.bName,
    winnerToken: b.winnerToken,
    transcript: b.transcript,
    verdict: b.verdict,
    aScore: b.aScore,
    bScore: b.bScore,
    createdAt: b.createdAt,
  };
}

// ---------------------------------------------------------------------------
// requireSignedOwner: verify sig + on-chain ownership
// ---------------------------------------------------------------------------

interface SignedBody {
  tokenId?: unknown;
  wallet?: unknown;
  signature?: unknown;
  signedAt?: unknown;
}

async function requireSignedOwner(
  body: SignedBody
): Promise<
  | { ok: true; state: NonNullable<Awaited<ReturnType<typeof fetchGotchiState>>> }
  | { ok: false; status: number; error: string }
> {
  const tokenId = String(body.tokenId ?? "");
  const wallet = String(body.wallet ?? "").toLowerCase();
  const signature = String(body.signature ?? "");
  const signedAt = Number(body.signedAt ?? 0);

  if (!tokenId || !wallet.startsWith("0x") || !signature.startsWith("0x")) {
    return { ok: false, status: 400, error: "tokenId, wallet (0x), signature (0x), signedAt required" };
  }

  const valid = await verifyRoomSignature(wallet, signedAt, signature);
  if (!valid) return { ok: false, status: 401, error: "invalid or expired signature" };

  const state = await fetchGotchiState(tokenId);
  if (!state) return { ok: false, status: 404, error: "gotchi not found" };
  if (state.owner !== wallet) return { ok: false, status: 403, error: "not the owner of this gotchi" };

  return { ok: true, state };
}

// ---------------------------------------------------------------------------
// GET /queue
// ---------------------------------------------------------------------------

router.get("/queue", (_req: Request, res: Response) => {
  res.json({ queue: getQueue().map(toPublicQueue) });
});

// ---------------------------------------------------------------------------
// POST /queue  — join
// ---------------------------------------------------------------------------

router.post("/queue", async (req: Request, res: Response) => {
  try {
    const result = await requireSignedOwner(req.body ?? {});
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    const tokenId = String((req.body ?? {}).tokenId ?? "");
    const wallet = String((req.body ?? {}).wallet ?? "").toLowerCase();
    enqueue({ tokenId, wallet, gotchiName: result.state.name });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /queue/leave
// ---------------------------------------------------------------------------

router.post("/queue/leave", async (req: Request, res: Response) => {
  try {
    const result = await requireSignedOwner(req.body ?? {});
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    const tokenId = String((req.body ?? {}).tokenId ?? "");
    leaveQueue(tokenId);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /battle
// ---------------------------------------------------------------------------

router.post("/battle", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const challengerTokenId = String(body.challengerTokenId ?? "");
    const wallet = String(body.wallet ?? "").toLowerCase();
    const opponentTokenId = String(body.opponentTokenId ?? "");
    const signature = String(body.signature ?? "");
    const signedAt = Number(body.signedAt ?? 0);

    // 1. Validate required fields
    if (!challengerTokenId || !wallet.startsWith("0x") || !opponentTokenId || !signature.startsWith("0x")) {
      return res.status(400).json({ error: "challengerTokenId, wallet (0x), opponentTokenId, signature (0x) required" });
    }

    // 2. Rate-limit by wallet
    if (rateLimited(wallet)) {
      return res.status(429).json({ error: "too many battles — slow down, fren" });
    }

    // 3. Verify challenger signature + ownership
    const sigValid = await verifyRoomSignature(wallet, signedAt, signature);
    if (!sigValid) return res.status(401).json({ error: "invalid or expired signature" });

    const challengerState = await fetchGotchiState(challengerTokenId);
    if (!challengerState) return res.status(404).json({ error: "challenger gotchi not found" });
    if (challengerState.owner !== wallet) return res.status(403).json({ error: "not the owner of challenger gotchi" });

    // 4. Check opponent is in queue
    const q = getQueued(opponentTokenId);
    if (!q) return res.status(404).json({ error: "opponent not in queue" });

    // 5. Reject same-token self-battle
    if (opponentTokenId === challengerTokenId) {
      return res.status(400).json({ error: "can't battle the same gotchi" });
    }

    // 6. Re-verify opponent still owned by its queued wallet
    const oppState = await fetchGotchiState(opponentTokenId);
    if (!oppState || oppState.owner !== q.wallet) {
      leaveQueue(opponentTokenId);
      return res.status(410).json({ error: "opponent no longer available" });
    }

    // 7. Atomic claim
    if (!claimQueued(opponentTokenId)) {
      return res.status(409).json({ error: "opponent already taken" });
    }

    // 8. Premium eligibility
    const challengerPremium = hasCredits(wallet);
    const opponentPremium = hasCredits(q.wallet);

    // 9. Resolve battle
    const result = await resolveBattle(
      { tokenId: challengerTokenId, wallet, premiumEligible: challengerPremium },
      { tokenId: opponentTokenId, wallet: q.wallet, premiumEligible: opponentPremium }
    );

    // 10. Return battle id
    return res.json({ ok: true, battleId: result.battleId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /battle/:id
// ---------------------------------------------------------------------------

router.get("/battle/:id", (req: Request, res: Response) => {
  const b = getBattle(Number(req.params.id));
  if (!b) return res.status(404).json({ error: "battle not found" });
  return res.json({ battle: toPublicBattle(b) });
});

// ---------------------------------------------------------------------------
// GET /battles?tokenId=
// ---------------------------------------------------------------------------

router.get("/battles", (req: Request, res: Response) => {
  const tokenId = req.query.tokenId;
  if (!tokenId) return res.status(400).json({ error: "tokenId query param required" });
  return res.json({ battles: listBattlesFor(String(tokenId), 20).map(toPublicBattle) });
});

// ---------------------------------------------------------------------------
// GET /leaderboard?limit=
// ---------------------------------------------------------------------------

router.get("/leaderboard", (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(req.query.limit)) || 50));
  return res.json({ rows: leaderboard(limit) });
});

export default router;
