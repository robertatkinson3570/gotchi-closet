import { Router } from "express";
import {
  upsertTemplate,
  listEnabledTemplates,
  listTemplatesForOwner,
  setEnabled,
  getRecentRelists,
} from "../lending/db";
import { getOperatorAddress } from "../lending/relist";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    operator: getOperatorAddress(),
    enabledCount: listEnabledTemplates().length,
  });
});

// Register a listing template for auto-renew.
// Body: { tokenId, owner, template: { initialCostWei, periodSeconds, splitOwner, splitBorrower, splitOther, thirdParty, whitelistId, channelling } }
router.post("/listings", (req, res) => {
  try {
    const body = req.body ?? {};
    const tokenId = Number(body.tokenId);
    const owner = String(body.owner ?? "").toLowerCase();
    const t = body.template ?? {};
    if (!tokenId || !owner) {
      return res.status(400).json({ error: "tokenId and owner required" });
    }
    upsertTemplate({
      token_id: tokenId,
      owner,
      initial_cost_wei: String(t.initialCostWei ?? "0"),
      period_seconds: Number(t.periodSeconds ?? 0),
      split_owner: Number(t.splitOwner ?? 20),
      split_borrower: Number(t.splitBorrower ?? 75),
      split_other: Number(t.splitOther ?? 5),
      third_party: String(t.thirdParty ?? "0x0000000000000000000000000000000000000000"),
      whitelist_id: Number(t.whitelistId ?? 0),
      channelling: t.channelling ? 1 : 0,
      enabled: 1,
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

router.get("/listings/:owner", (req, res) => {
  res.json(listTemplatesForOwner(req.params.owner));
});

router.post("/listings/:tokenId/enable", (req, res) => {
  setEnabled(Number(req.params.tokenId), Boolean(req.body?.enabled ?? true));
  res.json({ ok: true });
});

router.get("/listings/:tokenId/log", (req, res) => {
  res.json(getRecentRelists(Number(req.params.tokenId), 20));
});

export default router;
