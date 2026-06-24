// server/routes/steward.ts
import { Router } from "express";
import { recoverMessageAddress } from "viem";
import { enroll, listEnrollments, getEnrollment, setStatus, editChores, getLog, ChoreConflictError } from "../steward/db";
import { parseEnrollBody } from "../steward/validate";
import { soulStatsFor } from "../steward/soulStats";
import { readOnChainSeal, readOnChainSealsBatch } from "../soul/seal";
import { petOperatorAddress } from "../steward/petRelayer";
import { enrollMessage, ENROLL_SIG_TTL_MS } from "../../src/lib/steward/enrollAuth";

export const stewardRouter = Router();

stewardRouter.post("/enroll", async (req, res) => {
  const parsed = parseEnrollBody(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const v = parsed.value;

  // Authorize the enrollment (proves the caller controls `owner`, binds the terms, enforces
  // the soul-cert gate) unless explicitly opened for local dev / e2e.
  if (process.env.STEWARD_DEV_OPEN_ENROLL !== "1") {
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

function mutateStatus(req: any, res: any, status: "active" | "paused" | "revoked") {
  const id = Number(req.body?.id);
  if (!getEnrollment(id)) return res.status(404).json({ error: "not found" });
  setStatus(id, status);
  res.json(getEnrollment(id));
}
stewardRouter.post("/pause", (req, res) => mutateStatus(req, res, "paused"));
stewardRouter.post("/resume", (req, res) => mutateStatus(req, res, "active"));
stewardRouter.post("/revoke", (req, res) => mutateStatus(req, res, "revoked"));

stewardRouter.post("/edit-chores", (req, res) => {
  const id = Number(req.body?.id);
  if (!getEnrollment(id)) return res.status(404).json({ error: "not found" });
  const chores = { pet: !!req.body.chores?.pet, channel: !!req.body.chores?.channel, claim: !!req.body.chores?.claim };
  try { res.json(editChores(id, chores)); }
  catch (err) {
    if (err instanceof ChoreConflictError) return res.status(409).json({ error: err.message, conflicts: err.conflicts });
    throw err;
  }
});
