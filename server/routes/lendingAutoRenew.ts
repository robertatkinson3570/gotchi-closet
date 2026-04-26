import { Router } from "express";
import {
  upsertTemplate,
  listEnabledTemplates,
  listTemplatesForOwner,
  setEnabled,
  getRecentRelists,
  getSubscription,
  listSubscriptionsForOwner,
  listAllActiveSubscriptions,
  listAllSubscriptions,
  creditSubscription,
} from "../lending/db";
import { getOperatorAddress } from "../lending/relist";
import { verifyGhstPayment } from "../lending/verifyPayment";
import { tierFor, expectedWeiForMonths } from "../lending/subscriptionPricing";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    operator: getOperatorAddress(),
    enabledCount: listEnabledTemplates().length,
    activeSubscriptions: listAllActiveSubscriptions().length,
  });
});

// Register a listing template for auto-renew. Idempotent — re-listing the
// same gotchi just overwrites the template.
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
      split_borrower: Number(t.splitBorrower ?? 80),
      split_other: 0,
      third_party: "0x0000000000000000000000000000000000000000",
      whitelist_id: Number(t.whitelistId ?? 0),
      channelling: t.channelling ? 1 : 0,
      enabled: 1,
    });
    const sub = getSubscription(tokenId);
    res.json({ ok: true, subscription: sub });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

router.get("/listings/:owner", (req, res) => {
  const owner = req.params.owner.toLowerCase();
  const templates = listTemplatesForOwner(owner);
  const subs = listSubscriptionsForOwner(owner);
  const subByToken = new Map(subs.map((s) => [s.token_id, s]));
  res.json(
    templates.map((t) => {
      const sub = subByToken.get(t.token_id) ?? null;
      const now = Math.floor(Date.now() / 1000);
      const subActive = sub ? sub.expires_at > now : false;
      const daysLeft = sub ? Math.max(0, Math.floor((sub.expires_at - now) / 86400)) : 0;
      return { ...t, subscription: sub, subscriptionActive: subActive, daysLeft };
    })
  );
});

router.post("/listings/:tokenId/enable", (req, res) => {
  setEnabled(Number(req.params.tokenId), Boolean(req.body?.enabled ?? true));
  res.json({ ok: true });
});

router.get("/listings/:tokenId/log", (req, res) => {
  res.json(getRecentRelists(Number(req.params.tokenId), 20));
});

// ----- Subscriptions ---------------------------------------------------------

// POST /subscriptions
// Body: { tokenId, owner, months, paymentTxHash }
//
// Verifies on-chain that the GHST transfer happened (correct from/to/value),
// then credits the subscription. Idempotent: replaying the same paymentTxHash
// fails with 409.
router.post("/subscriptions", async (req, res) => {
  try {
    const body = req.body ?? {};
    const tokenId = Number(body.tokenId);
    const owner = String(body.owner ?? "");
    const months = Number(body.months ?? 0);
    const paymentTxHash = String(body.paymentTxHash ?? "");
    if (!tokenId || !owner.startsWith("0x") || !paymentTxHash.startsWith("0x")) {
      return res.status(400).json({ error: "tokenId, owner (0x), paymentTxHash (0x) required" });
    }
    const tier = tierFor(months);
    if (!tier) {
      return res.status(400).json({ error: `unsupported subscription term: ${months} months` });
    }
    const expectedWei = expectedWeiForMonths(months);
    if (expectedWei === null) {
      return res.status(400).json({ error: "no price for tier" });
    }

    const operator = getOperatorAddress();
    if (!operator) {
      return res.status(503).json({ error: "operator wallet not initialized" });
    }

    const verify = await verifyGhstPayment({
      txHash: paymentTxHash as `0x${string}`,
      expectedFrom: owner as `0x${string}`,
      expectedTo: operator as `0x${string}`,
      expectedValueWei: expectedWei,
    });
    if (!verify.ok) {
      return res.status(402).json({ error: `payment verification failed: ${verify.error}` });
    }

    try {
      const sub = creditSubscription(tokenId, owner, months, paymentTxHash, expectedWei);
      const now = Math.floor(Date.now() / 1000);
      const daysLeft = Math.max(0, Math.floor((sub.expires_at - now) / 86400));
      res.json({ ok: true, subscription: sub, daysLeft });
    } catch (err: any) {
      if (String(err?.message).includes("already credited")) {
        return res.status(409).json({ error: "payment tx already credited" });
      }
      throw err;
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

router.get("/subscriptions/:tokenId", (req, res) => {
  const tokenId = Number(req.params.tokenId);
  const sub = getSubscription(tokenId);
  if (!sub) return res.json({ subscription: null, active: false, daysLeft: 0 });
  const now = Math.floor(Date.now() / 1000);
  const active = sub.expires_at > now;
  const daysLeft = Math.max(0, Math.floor((sub.expires_at - now) / 86400));
  res.json({ subscription: sub, active, daysLeft });
});

router.get("/subscriptions/by-owner/:owner", (req, res) => {
  res.json(listSubscriptionsForOwner(req.params.owner));
});

// ----- Admin (read-only, easy VPS inspection) -------------------------------

// `curl http://localhost:8791/api/lending/autorenew/admin/active`
router.get("/admin/active", (_req, res) => {
  const subs = listAllActiveSubscriptions();
  const now = Math.floor(Date.now() / 1000);
  res.json(
    subs.map((s) => ({
      tokenId: s.token_id,
      owner: s.owner,
      monthsPaidTotal: s.months_paid_total,
      expiresAt: s.expires_at,
      expiresIso: new Date(s.expires_at * 1000).toISOString(),
      daysLeft: Math.max(0, Math.floor((s.expires_at - now) / 86400)),
      lastPaymentTx: s.last_payment_tx,
    }))
  );
});

// All subscriptions, including expired (so you can see who used to be subscribed).
router.get("/admin/subscriptions", (_req, res) => {
  res.json(listAllSubscriptions());
});

export default router;
