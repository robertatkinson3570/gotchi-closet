// Wisp billing API — issue API keys + buy prepaid plan periods with ETH/USDC.
// Mounted at /api/mcp. Keyed by API key, paid to the operator wallet, verified
// on-chain and credited idempotently (mirrors the GHST premium-claim flow).

import { Router } from "express";
import { recoverMessageAddress } from "viem";
import { createAccount, getAccountByKey, getAccountByWallet, accountsByWallet, bestPaidAccountByWallet, rotateKey, activatePlan, effectivePlan, setContext, chatUsageOf, type WispAccount } from "../mcp/accounts";
import { priceUsd, isValidPurchase, PERIODS, PLAN_LIMITS, PARTNER_LIMITS, chatGranted } from "../../src/lib/wisp/pricing";
import { credentialOf, WISP_KEY_REQUIRED } from "../companion/wispCredential";
import { wispManageMessage, isSignedAtFresh } from "../../src/lib/wisp/auth";
import { usdToEthWei, usdToUsdcUnits } from "../payments/ethUsd";
import { verifyEthPayment, verifyUsdcPayment, verifyTokenPayment } from "../payments/verifyEthPayment";
import { GHST_BASE, usdToGhstWei } from "../payments/ghstUsd";
import { clientTagOfKey } from "../companion/db";
import { prepareProof, verifyProof, grantRateLimited, ProofError } from "../companion/walletProof";
import { saveGrant, grantsForKey, revokeGrant } from "../mcp/grants";

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
// Minting keys is free and writes a row, so each address gets a small allowance.
const mintHits = new Map<string, { count: number; resetAt: number }>();
function mintLimited(ip: string | undefined, now = Date.now()): boolean {
  const key = ip || "unknown";
  if (mintHits.size > 50_000) for (const [k, v] of mintHits) if (v.resetAt < now) mintHits.delete(k);
  const b = mintHits.get(key);
  if (!b || b.resetAt < now) { mintHits.set(key, { count: 1, resetAt: now + 3_600_000 }); return false; }
  b.count += 1;
  return b.count > 10;
}

router.post("/account", (req, res) => {
  if (mintLimited(req.ip)) return res.status(429).json({ error: "too many keys from this address, try again in an hour" });
  try {
    const wallet = String(req.body?.wallet ?? "");
    const acct = createAccount(wallet);
    res.json({ apiKey: acct.apiKey, plan: acct.plan });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

/** GET /api/mcp/plan/:wallet -> the wallet's effective plan + expiry, and nothing
 *  else (no key): what a client (GVR's Wisp/Desk dialogs, GVR's Holder gate)
 *  needs to show "active until" instead of Pay, and to grant the paid tier. */
router.get("/plan/:wallet", (req, res) => {
  const wallet = String(req.params.wallet ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return res.status(400).json({ error: "wallet (0x) required" });
  // QA SEC-23: the best active paid plan across every account the wallet owns,
  // never the newest row (anyone can mint an unsigned free key on a wallet).
  const acct = bestPaidAccountByWallet(wallet);
  if (!acct) return res.json({ wallet: wallet.toLowerCase(), plan: "free", expiresAt: 0 });
  res.json({ wallet: wallet.toLowerCase(), plan: effectivePlan(acct), expiresAt: acct.expiresAt });
});

/** KEEPER GOTCHI (08-wisp-chat.md §8.2): the account summary a third-party
 *  dashboard shows. `chat` is the grant (chatPerDay > 0 on the plan in
 *  force); the day's chat use rides beside it. Never the key itself. */
function accountSummary(acct: WispAccount) {
  const used = chatUsageOf(acct.apiKey);
  if (acct.partner) {
    return {
      plan: "partner", storedPlan: acct.plan, expiresAt: 0, partner: true,
      chat: true, chatPerDay: PARTNER_LIMITS.chatPerDay, chatPerMinute: PARTNER_LIMITS.chatPerMinute, chatUsedToday: used.usedToday,
      playerFreePerDay: PARTNER_LIMITS.playerFreePerDay, playerPaidPerDay: PARTNER_LIMITS.playerPaidPerDay, guestPerDay: PARTNER_LIMITS.guestPerDay,
      context: acct.context,
    };
  }
  const plan = effectivePlan(acct);
  const limits = PLAN_LIMITS[plan];
  return {
    plan, storedPlan: acct.plan, expiresAt: acct.expiresAt, partner: false,
    chat: chatGranted(plan), chatPerDay: limits.chatPerDay, chatPerMinute: limits.chatPerMinute, chatUsedToday: used.usedToday,
    context: acct.context,
  };
}

/** GET /api/mcp/account/:apiKey -> current effective plan + expiry (+ the chat grant). */
router.get("/account/:apiKey", (req, res) => {
  const acct = getAccountByKey(String(req.params.apiKey));
  if (!acct) return res.status(404).json({ error: "account not found" });
  res.json(accountSummary(acct));
});

/** GET /api/mcp/account (Authorization: Bearer wsp_…) -> the same summary, keyed by header. */
router.get("/account", (req, res) => {
  const cred = credentialOf(req);
  if (cred.kind !== "wisp") return res.status(401).json({ error: WISP_KEY_REQUIRED, ...(cred.kind === "bad" ? { reason: cred.reason } : {}) });
  res.json(accountSummary(cred.account));
});

/** PATCH /api/mcp/account (Bearer wsp_…) { context: { appName, appUrl?, kbLines?, navMap? } }
 *  -> sets the key's app context (08-wisp-chat.md §8.2). 400 names the field that failed. */
router.patch("/account", (req, res) => {
  const cred = credentialOf(req);
  if (cred.kind !== "wisp") return res.status(401).json({ error: WISP_KEY_REQUIRED, ...(cred.kind === "bad" ? { reason: cred.reason } : {}) });
  const ctx = req.body?.context;
  if (ctx === undefined) return res.status(400).json({ error: "context is required" });
  try {
    res.json(accountSummary(setContext(cred.apiKey, ctx)));
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

// WALLET GRANTS: a holder lets this key read and add to their gotchi's chat
// history. The app asks for a Sign-In with Ethereum message for its own page,
// the holder signs it in their wallet, the app sends it back. Without a grant
// the key still chats with any gotchi, as a guest with no memory.
function keyed(req: Parameters<typeof credentialOf>[0], res: { status(n: number): { json(b: unknown): void } }): WispAccount | null {
  const cred = credentialOf(req);
  if (cred.kind !== "wisp") {
    res.status(401).json({ error: WISP_KEY_REQUIRED, ...(cred.kind === "bad" ? { reason: cred.reason } : {}) });
    return null;
  }
  return cred.account;
}

/** POST /api/mcp/grants/prepare (Bearer wsp_…) { wallet, domain, uri, days? } -> { message } */
router.post("/grants/prepare", (req, res) => {
  const acct = keyed(req, res);
  if (!acct) return;
  // QA P4-04: per key (120 per 10 minutes), not per IP: one app server onboards many players.
  if (grantRateLimited(acct.apiKey)) return res.status(429).json({ error: "slow down" });
  const b = req.body ?? {};
  try {
    const message = prepareProof({
      purpose: { kind: "grant", keyTag: clientTagOfKey(acct.apiKey) },
      wallet: String(b.wallet ?? ""), domain: String(b.domain ?? ""), uri: String(b.uri ?? ""),
      appName: acct.context?.appName, days: b.days === undefined ? undefined : Number(b.days),
    });
    res.json({ message });
  } catch (err) {
    if (err instanceof ProofError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "could not prepare the grant message" });
  }
});

/** POST /api/mcp/grants (Bearer wsp_…) { message, signature } -> { wallet, domain, grantedAt, expiresAt } */
router.post("/grants", async (req, res) => {
  const acct = keyed(req, res);
  if (!acct) return;
  if (grantRateLimited(acct.apiKey)) return res.status(429).json({ error: "slow down" });
  const b = req.body ?? {};
  try {
    const v = await verifyProof({ purpose: { kind: "grant", keyTag: clientTagOfKey(acct.apiKey) }, message: b.message, signature: b.signature });
    res.json(saveGrant(acct.apiKey, { wallet: v.wallet, domain: v.domain, grantedAt: v.issuedAt, expiresAt: v.expiresAt }));
  } catch (err) {
    if (err instanceof ProofError) return res.status(401).json({ error: err.message });
    res.status(500).json({ error: "could not verify the grant" });
  }
});

/** GET /api/mcp/grants (Bearer wsp_…) -> { grants: [{ wallet, domain, grantedAt, expiresAt }] } */
router.get("/grants", (req, res) => {
  const acct = keyed(req, res);
  if (!acct) return;
  res.json({ grants: grantsForKey(acct.apiKey) });
});

/** DELETE /api/mcp/grants/:wallet (Bearer wsp_…) -> the app forgets a wallet. */
router.delete("/grants/:wallet", (req, res) => {
  const acct = keyed(req, res);
  if (!acct) return;
  const wallet = String(req.params.wallet ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return res.status(400).json({ error: "wallet (0x) required" });
  res.json({ ok: true, revoked: revokeGrant(acct.apiKey, wallet) });
});

/** GET /api/mcp/quote?plan=pro&months=3&asset=eth -> the amount to pay. */
router.get("/quote", async (req, res) => {
  try {
    const plan = String(req.query.plan ?? "");
    const months = Number(req.query.months ?? 0);
    const asset = String(req.query.asset ?? "eth");
    const ghosts = Math.max(0, Math.floor(Number(req.query.ghosts ?? 0)) || 0);
    if (!isValidPurchase(plan, months)) return res.status(400).json({ error: "invalid plan/period" });
    const usd = priceUsd(plan, months, ghosts);
    if (asset === "ghst") {
      // GHST at the LIVE rate (DeFiLlama); a stale/missing price throws → 502 below, never a fallback quote.
      const { wei, ghstUsd } = await usdToGhstWei(usd);
      return res.json({ usd, asset, amountWei: wei.toString(), ghst: Number(wei / 10n ** 12n) / 1_000_000, ghstUsd, receivingWallet: RECEIVING, goodUntil: Date.now() + 5 * 60_000 });
    }
    if (asset === "eth") {
      const wei = await usdToEthWei(usd);
      return res.json({ usd, asset, amountWei: wei.toString(), receivingWallet: RECEIVING });
    }
    if (asset === "usdc") {
      return res.json({ usd, asset, amountUnits: usdToUsdcUnits(usd).toString(), receivingWallet: RECEIVING });
    }
    return res.status(400).json({ error: "asset must be eth|usdc|ghst" });
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
    const ghosts = Math.max(0, Math.floor(Number(b.extraGhosts ?? 0)) || 0);

    if (!getAccountByKey(apiKey)) return res.status(404).json({ error: "account not found" });
    if (!isValidPurchase(plan, months)) return res.status(400).json({ error: "invalid plan/period" });
    if (!txHash.startsWith("0x")) return res.status(400).json({ error: "txHash (0x) required" });

    const usd = priceUsd(plan, months, ghosts);
    let result: Awaited<ReturnType<typeof verifyEthPayment>>;
    if (asset === "eth") {
      const expected = await usdToEthWei(usd);
      const minWei = (expected * (10_000n - SLIPPAGE_BPS)) / 10_000n;
      result = await verifyEthPayment({ txHash: txHash as `0x${string}`, expectedTo: RECEIVING, minValueWei: minWei, expectedFrom: wallet });
    } else if (asset === "usdc") {
      const minUnits = (usdToUsdcUnits(usd) * (10_000n - SLIPPAGE_BPS)) / 10_000n;
      result = await verifyUsdcPayment({ txHash: txHash as `0x${string}`, expectedTo: RECEIVING, minUnits, expectedFrom: wallet });
    } else if (asset === "ghst") {
      const { wei } = await usdToGhstWei(usd);
      const minUnits = (wei * (10_000n - SLIPPAGE_BPS)) / 10_000n;
      result = await verifyTokenPayment({ txHash: txHash as `0x${string}`, expectedTo: RECEIVING, minUnits, expectedFrom: wallet, token: GHST_BASE, label: "GHST" });
    } else {
      return res.status(400).json({ error: "asset must be eth|usdc|ghst" });
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

// --- Account management (sign-in-with-wallet) -------------------------------

/** Verify a wallet owns its account by recovering the signer of the manage message. */
async function verifyWalletSig(wallet: string, signedAt: number, signature: string): Promise<boolean> {
  if (!wallet?.startsWith("0x") || !signature?.startsWith("0x")) return false;
  if (!isSignedAtFresh(signedAt, Date.now())) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: wispManageMessage(wallet, signedAt),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

/** POST /api/mcp/manage  { wallet, signedAt, signature } -> the wallet's accounts (incl. keys).
 *  The top-level fields are the best active paid plan's key (or the newest
 *  key when none is paid); `keys` lists every key the wallet owns (QA SEC-23:
 *  a holder must see the free key someone else minted on their wallet). */
router.post("/manage", async (req, res) => {
  try {
    const { wallet, signedAt, signature } = req.body ?? {};
    if (!(await verifyWalletSig(String(wallet ?? ""), Number(signedAt), String(signature ?? "")))) {
      return res.status(401).json({ error: "signature invalid or expired" });
    }
    const all = accountsByWallet(String(wallet));
    const acct = bestPaidAccountByWallet(String(wallet)) ?? all[0];
    if (!acct) return res.status(404).json({ error: "no account for this wallet" });
    res.json({
      apiKey: acct.apiKey,
      plan: effectivePlan(acct),
      storedPlan: acct.plan,
      expiresAt: acct.expiresAt,
      keys: all.map((a) => ({ apiKey: a.apiKey, plan: effectivePlan(a), storedPlan: a.plan, expiresAt: a.expiresAt, createdAt: a.createdAt })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

/** POST /api/mcp/rotate  { wallet, signedAt, signature } -> rotate the wallet's API key. */
router.post("/rotate", async (req, res) => {
  try {
    const { wallet, signedAt, signature } = req.body ?? {};
    if (!(await verifyWalletSig(String(wallet ?? ""), Number(signedAt), String(signature ?? "")))) {
      return res.status(401).json({ error: "signature invalid or expired" });
    }
    const acct = getAccountByWallet(String(wallet));
    if (!acct) return res.status(404).json({ error: "no account for this wallet" });
    const rotated = rotateKey(acct.apiKey);
    res.json({ apiKey: rotated.apiKey });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

export default router;
