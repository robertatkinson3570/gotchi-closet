// Wisp MCP billing ledger — external developer accounts + prepaid plan periods.
// Mirrors the idempotent, payment-verified pattern in server/companion/db.ts
// (grantPremium), but keyed by an API key and paid in ETH/USDC instead of GHST.
// Reuses the companion DB connection.

import { randomBytes } from "node:crypto";
import { getDb } from "../companion/db";
import type { WispPlan } from "../../src/lib/wisp/pricing";

let ensured: object | null = null;
function ensure() {
  const d = getDb();
  if (ensured === d) return d;
  d.exec(`
    CREATE TABLE IF NOT EXISTS wisp_accounts (
      api_key      TEXT PRIMARY KEY,
      owner_wallet TEXT,
      plan         TEXT NOT NULL DEFAULT 'free',
      expires_at   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wisp_payments (
      tx_hash    TEXT PRIMARY KEY,
      api_key    TEXT NOT NULL,
      plan       TEXT NOT NULL,
      months     INTEGER NOT NULL,
      asset      TEXT NOT NULL,
      amount_wei TEXT NOT NULL,
      paid_at    INTEGER NOT NULL
    );
  `);
  ensured = d;
  return d;
}

export interface WispAccount {
  apiKey: string;
  ownerWallet: string | null;
  plan: WispPlan;
  /** Epoch ms when the prepaid plan lapses (0 = free / never). */
  expiresAt: number;
  createdAt: number;
}

interface AccountRow {
  api_key: string;
  owner_wallet: string | null;
  plan: WispPlan;
  expires_at: number;
  created_at: number;
}

function toAccount(r: AccountRow): WispAccount {
  return {
    apiKey: r.api_key,
    ownerWallet: r.owner_wallet,
    plan: r.plan,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

/** Mint a new account with a fresh API key (prefixed `wsp_`). */
export function createAccount(ownerWallet?: string): WispAccount {
  const d = ensure();
  const apiKey = "wsp_" + randomBytes(24).toString("hex");
  const wallet = ownerWallet && ownerWallet.startsWith("0x") ? ownerWallet.toLowerCase() : null;
  const now = Date.now();
  d.prepare(
    `INSERT INTO wisp_accounts (api_key, owner_wallet, plan, expires_at, created_at) VALUES (?,?,?,?,?)`
  ).run(apiKey, wallet, "free", 0, now);
  return { apiKey, ownerWallet: wallet, plan: "free", expiresAt: 0, createdAt: now };
}

export function getAccountByKey(apiKey: string): WispAccount | null {
  const d = ensure();
  const r = d.prepare(`SELECT * FROM wisp_accounts WHERE api_key = ?`).get(apiKey) as
    | AccountRow
    | undefined;
  return r ? toAccount(r) : null;
}

/** The plan in force right now — a lapsed paid plan reverts to "free". */
export function effectivePlan(a: WispAccount, now: number = Date.now()): WispPlan {
  if (a.plan === "free") return "free";
  return a.expiresAt > now ? a.plan : "free";
}

/**
 * Idempotent: activate/extend `apiKey` to `plan` for `months`, verified by `txHash`.
 * If the plan is the same and still active, the period extends from the current
 * expiry; otherwise it starts now. Throws "tx already credited" on replay.
 */
export function activatePlan(args: {
  apiKey: string;
  plan: Exclude<WispPlan, "free">;
  months: number;
  asset: string;
  amountWei: bigint;
  txHash: string;
}): WispAccount {
  const d = ensure();
  const { apiKey, plan, months, asset, amountWei, txHash } = args;
  const run = d.transaction(() => {
    if (d.prepare(`SELECT 1 FROM wisp_payments WHERE tx_hash = ?`).get(txHash)) {
      throw new Error("tx already credited");
    }
    const acct = getAccountByKey(apiKey);
    if (!acct) throw new Error("account not found");
    const now = Date.now();
    const base = acct.plan === plan && acct.expiresAt > now ? acct.expiresAt : now;
    const expiresAt = base + months * 30 * 86_400_000;
    d.prepare(`UPDATE wisp_accounts SET plan = ?, expires_at = ? WHERE api_key = ?`).run(
      plan,
      expiresAt,
      apiKey
    );
    d.prepare(
      `INSERT INTO wisp_payments (tx_hash, api_key, plan, months, asset, amount_wei, paid_at)
       VALUES (?,?,?,?,?,?,?)`
    ).run(txHash, apiKey, plan, months, asset, amountWei.toString(), now);
  });
  run();
  return getAccountByKey(apiKey)!;
}

/** Most recent account owned by `wallet` — for wallet-sign-in management. */
export function getAccountByWallet(wallet: string): WispAccount | null {
  const d = ensure();
  const w = wallet.toLowerCase();
  const r = d
    .prepare(`SELECT * FROM wisp_accounts WHERE owner_wallet = ? ORDER BY created_at DESC LIMIT 1`)
    .get(w) as AccountRow | undefined;
  return r ? toAccount(r) : null;
}

/** Rotate the API key (revokes the old one). Returns the updated account. */
export function rotateKey(apiKey: string): WispAccount {
  const d = ensure();
  const acct = getAccountByKey(apiKey);
  if (!acct) throw new Error("account not found");
  const newKey = "wsp_" + randomBytes(24).toString("hex");
  const run = d.transaction(() => {
    d.prepare(`UPDATE wisp_accounts SET api_key = ? WHERE api_key = ?`).run(newKey, apiKey);
    d.prepare(`UPDATE wisp_payments SET api_key = ? WHERE api_key = ?`).run(newKey, apiKey);
  });
  run();
  return getAccountByKey(newKey)!;
}
