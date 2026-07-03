// server/routes/steward.ts
import { Router } from "express";
import { recoverMessageAddress } from "viem";
import { enroll, listEnrollments, getEnrollment, getEnrollmentForRun, setStatus, editChores, getLog, ChoreConflictError } from "../steward/db";
import { runOne } from "../steward/cron";
import { upkeepFor } from "../steward/service";
import { snapshotFor } from "../steward/chain";
import { parseEnrollBody } from "../steward/validate";
import { soulStatsFor } from "../steward/soulStats";
import { readOnChainSeal, readOnChainSealsBatch } from "../soul/seal";
import { petOperatorAddress } from "../steward/petRelayer";
import { enrollMessage, mutateMessage, ENROLL_SIG_TTL_MS, type StewardAction } from "../../src/lib/steward/enrollAuth";
import type { Chores } from "../steward/db";

export const stewardRouter = Router();

// Local/e2e bypass for signature auth. HARD-IGNORED in production: a stray env line must
// never disable enroll/mutation auth on the VPS.
const devOpen = () => process.env.STEWARD_DEV_OPEN_ENROLL === "1" && process.env.NODE_ENV !== "production";

// Owner-signature gate for management actions on an existing enrollment. The signer must be
// the enrollment's owner (not just any wallet), the signature binds action+id (+chores for
// edit-chores) and expires with the same TTL as enroll. Writes the error response and
// returns false when unauthorized.
async function requireOwnerSig(
  req: any, res: any, action: StewardAction, ownerOf: string, chores?: Chores
): Promise<boolean> {
  if (devOpen()) return true;
  const { ownerSig, signedAt } = req.body ?? {};
  const id = Number(req.body?.id);
  if (typeof ownerSig !== "string" || typeof signedAt !== "number") {
    res.status(401).json({ error: "owner signature required" });
    return false;
  }
  if (Math.abs(Date.now() - signedAt) > ENROLL_SIG_TTL_MS) {
    res.status(401).json({ error: "signature expired" });
    return false;
  }
  const message = mutateMessage({ action, id, owner: ownerOf, signedAt, chores });
  let signer = "";
  try { signer = await recoverMessageAddress({ message, signature: ownerSig as `0x${string}` }); } catch { signer = ""; }
  if (signer.toLowerCase() !== ownerOf.toLowerCase()) {
    res.status(401).json({ error: "invalid owner signature" });
    return false;
  }
  return true;
}

stewardRouter.post("/enroll", async (req, res) => {
  const parsed = parseEnrollBody(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const v = parsed.value;

  // Owner-pays invariant: operator mode makes OUR relayer pay gas, so it is enrollable only
  // when the operator has explicitly configured (= chosen to fund) a relayer key.
  if (v.authMode === "operator" && !petOperatorAddress()) {
    return res.status(400).json({ error: "operator mode is disabled — no pet relayer configured" });
  }

  // Authorize the enrollment (proves the caller controls `owner`, binds the terms, enforces
  // the soul-cert gate) unless explicitly opened for local dev / e2e.
  if (!devOpen()) {
    if (!v.ownerSig || !v.signedAt || !v.smartAccount) return res.status(401).json({ error: "owner signature required" });
    if (Math.abs(Date.now() - v.signedAt) > ENROLL_SIG_TTL_MS) return res.status(401).json({ error: "signature expired" });
    const message = enrollMessage({ owner: v.owner, gotchiId: v.gotchiId, chores: v.chores, smartAccount: v.smartAccount, signedAt: v.signedAt });
    let signer = "";
    try { signer = await recoverMessageAddress({ message, signature: v.ownerSig as `0x${string}` }); } catch { signer = ""; }
    if (signer.toLowerCase() !== v.owner.toLowerCase()) return res.status(401).json({ error: "invalid owner signature" });
    // Soul-cert gate: the steward gotchi must be sealed. SoulSeal v2 only lets the lender seal,
    // so a sealed token implies the owner did the cert. Enforced only where seals are readable.
    if (process.env.SOUL_SEAL_ADDRESS) {
      const seal = await readOnChainSeal(String(v.gotchiId));
      if (!seal) return res.status(403).json({ error: "gotchi has no soul cert — mint one first" });
    }
  }

  try { res.json(enroll(v)); }
  catch (e) {
    if (e instanceof ChoreConflictError) return res.status(409).json({ error: e.message, conflicts: e.conflicts });
    throw e;
  }
});

stewardRouter.get("/status", (req, res) => {
  const owner = String(req.query.owner || "");
  if (!owner) return res.status(400).json({ error: "owner required" });
  res.json({ enrollments: listEnrollments(owner) });
});

stewardRouter.get("/log", (req, res) => {
  const owner = String(req.query.owner || "");
  if (!owner) return res.status(400).json({ error: "owner required" });
  res.json({ log: getLog(owner) });
});

// Path 2 ("prepare + one-click"): what's due across the whole wallet, plus the encoded calls
// the owner's OWN wallet executes (their gas, no AA). Returns {summary, calls:[{to,data}]}.
stewardRouter.get("/upkeep", async (req, res) => {
  const owner = String(req.query.owner || "");
  if (!owner) return res.status(400).json({ error: "owner required" });
  try {
    const now = Math.floor(Date.now() / 1000);
    res.json(await upkeepFor(owner, { snapshotFor }, now));
  } catch (err) {
    res.status(502).json({ error: String((err as Error).message).slice(0, 200) });
  }
});

// The relayer address owners approve via setPetOperatorForAll for the Ledger-friendly,
// pet-only operator mode. `configured` is false when no STEWARD_PET_RELAYER_KEY is set.
stewardRouter.get("/pet-operator", (_req, res) => {
  const operator = petOperatorAddress();
  res.json({ operator, configured: !!operator });
});

// Which of these gotchis hold a minted soul cert (on-chain SoulSeal) — the steward gate.
// One batched Multicall3 read; fails safe to "unsealed". `configured` is false when no
// SOUL_SEAL_ADDRESS is set (then the UI can't gate and treats certs as unknown).
stewardRouter.get("/souls", async (req, res) => {
  const ids = String(req.query.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
  const configured = !!process.env.SOUL_SEAL_ADDRESS;
  if (!ids.length) return res.json({ sealed: [], configured });
  const map = await readOnChainSealsBatch(ids);
  res.json({ sealed: ids.filter((id) => map[id]).map(Number), configured });
});

// Single-source soul stats — the SAME level/xp/memories the companion chat shows.
stewardRouter.get("/soul", (req, res) => {
  const owner = String(req.query.owner || "");
  const gotchiId = Number(req.query.gotchiId);
  if (!owner || !Number.isFinite(gotchiId)) return res.status(400).json({ error: "owner + gotchiId required" });
  res.json(soulStatsFor(owner, gotchiId));
});

async function mutateStatus(req: any, res: any, action: StewardAction, status: "active" | "paused" | "revoked") {
  const id = Number(req.body?.id);
  const e = getEnrollment(id);
  if (!e) return res.status(404).json({ error: "not found" });
  if (!(await requireOwnerSig(req, res, action, e.owner))) return;
  setStatus(id, status);
  res.json(getEnrollment(id));
}
stewardRouter.post("/pause", (req, res) => mutateStatus(req, res, "pause", "paused"));
stewardRouter.post("/resume", (req, res) => mutateStatus(req, res, "resume", "active"));
stewardRouter.post("/revoke", (req, res) => mutateStatus(req, res, "revoke", "revoked"));

// Manual "run now": run a single enrollment immediately. Skips the per-enrollment interval gate,
// but on-chain cooldowns still apply (computeWork only returns due work; simulate drops reverts),
// so this can't pet a gotchi early or be used to drain gas. Rate-limited per enrollment.
const lastManualRun = new Map<number, number>();
const MANUAL_RUN_COOLDOWN_MS = 60_000;
stewardRouter.post("/run-now", async (req, res) => {
  const id = Number(req.body?.id);
  const e = getEnrollmentForRun(id);
  if (!e) return res.status(404).json({ error: "not found" });
  if (!(await requireOwnerSig(req, res, "run-now", e.owner))) return;
  if (e.status !== "active") return res.status(400).json({ error: "enrollment is not active" });
  const now = Date.now();
  if (now - (lastManualRun.get(id) ?? 0) < MANUAL_RUN_COOLDOWN_MS) {
    return res.status(429).json({ error: "just ran — give it a minute" });
  }
  lastManualRun.set(id, now);
  try {
    res.json(await runOne(e, Math.floor(now / 1000), { force: true }));
  } catch (err) {
    res.status(502).json({ error: String((err as Error).message).slice(0, 200) });
  }
});

stewardRouter.post("/edit-chores", async (req, res) => {
  const id = Number(req.body?.id);
  const e = getEnrollment(id);
  if (!e) return res.status(404).json({ error: "not found" });
  const chores = { pet: !!req.body.chores?.pet, channel: !!req.body.chores?.channel, claim: !!req.body.chores?.claim };
  if (!(await requireOwnerSig(req, res, "edit-chores", e.owner, chores))) return;
  try { res.json(editChores(id, chores)); }
  catch (err) {
    if (err instanceof ChoreConflictError) return res.status(409).json({ error: err.message, conflicts: err.conflicts });
    throw err;
  }
});
