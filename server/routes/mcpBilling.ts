// Wisp billing API — issue API keys + buy prepaid plan periods with ETH/USDC.
// Mounted at /api/mcp. Keyed by API key, paid to the operator wallet, verified
// on-chain and credited idempotently (mirrors the GHST premium-claim flow).

import { Router } from "express";
import { createAccount, getAccountByKey, activatePlan, effectivePlan } from "../mcp/accounts";
import { priceUsd, isValidPurchase, PERIODS } from "../../src/lib/wisp/pricing";
import { usdToEthWei, usdToUsdcUnits } from "../payments/ethUsd";
import { verifyEthPayment, verifyUsdcPayment } from "../payments/verifyEthPayment";

const router = Router();

// Receiving wallet for Wisp payments (defaults to the operator wallet).
const RECEIVING = (process.env.WISP_RECEIVING_WALLET ||
  process.env.COMPANION_RECEIVING_WALLET ||
  "0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96") as `0x${string}`;

// 1% slippage tolerance on the oracle/price conversion (ETH price moves between quote and pay).
const SLIPPAGE_BPS = 100n;

router.get("/health", (_req, res) => res.json({ ok: true }));

/** Where to send payment + the catalog the client needs to render checkout. */
router.get("/pay-info", (_req, res) => {
  res.json({ receivingWallet: RECEIVING, periods: PERIODS });
});

/** POST /api/mcp/account  { wallet? } -> issue a new API key (free plan). */
router.post("/account", (req, res) => {
  try {
    const wallet = String(req.body?.wallet ?? "");
    const acct = createAccount(wallet);
    res.json({ apiKey: acct.apiKey, plan: acct.plan });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

/** GET /api/mcp/account/:apiKey -> current effective plan + expiry. */
router.get("/account/:apiKey", (req, res) => {
  const acct = getAccountByKey(String(req.params.apiKey));
  if (!acct) return res.status(404).json({ error: "account not found" });
  res.json({ plan: effectivePlan(acct), storedPlan: acct.plan, expiresAt: acct.expiresAt });
});

/** GET /api/mcp/quote?plan=pro&months=3&asset=eth -> the amount to pay. */
router.get("/quote", async (req, res) => {
  try {
    const plan = String(req.query.plan ?? "");
    const months = Number(req.query.months ?? 0);
    const asset = String(req.query.asset ?? "eth");
    if (!isValidPurchase(plan, months)) return res.status(400).json({ error: "invalid plan/period" });
    const usd = priceUsd(plan, months);
    if (asset === "eth") {
      const wei = await usdToEthWei(usd);
      return res.json({ usd, asset, amountWei: wei.toString(), receivingWallet: RECEIVING });
    }
    if (asset === "usdc") {
      return res.json({ usd, asset, amountUnits: usdToUsdcUnits(usd).toString(), receivingWallet: RECEIVING });
    }
    return res.status(400).json({ error: "asset must be eth|usdc" });
  } catch (err: any) {
    res.status(502).json({ error: `pricing unavailable: ${err?.message ?? String(err)}` });
  }
});

/**
 * POST /api/mcp/buy  { apiKey, plan, months, asset:'eth'|'usdc', txHash, wallet? }
 * Verify the on-chain payment, then idempotently activate/extend the plan.
 */
router.post("/buy", async (req, res) => {
  try {
    const b = req.body ?? {};
    const apiKey = String(b.apiKey ?? "");
    const plan = String(b.plan ?? "");
    const months = Number(b.months ?? 0);
    const asset = String(b.asset ?? "");
    const txHash = String(b.txHash ?? "");
    const wallet = b.wallet ? (String(b.wallet) as `0x${string}`) : undefined;

    if (!getAccountByKey(apiKey)) return res.status(404).json({ error: "account not found" });
    if (!isValidPurchase(plan, months)) return res.status(400).json({ error: "invalid plan/period" });
    if (!txHash.startsWith("0x")) return res.status(400).json({ error: "txHash (0x) required" });

    const usd = priceUsd(plan, months);
    let result: Awaited<ReturnType<typeof verifyEthPayment>>;
    if (asset === "eth") {
      const expected = await usdToEthWei(usd);
      const minWei = (expected * (10_000n - SLIPPAGE_BPS)) / 10_000n;
      result = await verifyEthPayment({ txHash: txHash as `0x${string}`, expectedTo: RECEIVING, minValueWei: minWei, expectedFrom: wallet });
    } else if (asset === "usdc") {
      const minUnits = (usdToUsdcUnits(usd) * (10_000n - SLIPPAGE_BPS)) / 10_000n;
      result = await verifyUsdcPayment({ txHash: txHash as `0x${string}`, expectedTo: RECEIVING, minUnits, expectedFrom: wallet });
    } else {
      return res.status(400).json({ error: "asset must be eth|usdc" });
    }

    if (!result.ok) return res.status(402).json({ error: `payment verification failed: ${result.error}` });

    try {
      const acct = activatePlan({ apiKey, plan, months, asset, amountWei: result.valueWei, txHash });
      return res.json({ ok: true, plan: acct.plan, expiresAt: acct.expiresAt });
    } catch (err: any) {
      if (String(err?.message).includes("already credited")) {
        return res.status(409).json({ error: "tx already credited" });
      }
      throw err;
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

export default router;
