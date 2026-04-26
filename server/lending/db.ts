import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.AUTORENEW_DB_PATH || path.resolve("./data/autorenew.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

function initSchema(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      token_id INTEGER PRIMARY KEY,
      owner TEXT NOT NULL,
      initial_cost_wei TEXT NOT NULL,
      period_seconds INTEGER NOT NULL,
      split_owner INTEGER NOT NULL,
      split_borrower INTEGER NOT NULL,
      split_other INTEGER NOT NULL,
      third_party TEXT NOT NULL,
      whitelist_id INTEGER NOT NULL,
      channelling INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_relist_at INTEGER,
      last_relist_listing_id INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_templates_enabled ON templates(enabled);
    CREATE INDEX IF NOT EXISTS idx_templates_owner ON templates(owner);

    CREATE TABLE IF NOT EXISTS relist_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id INTEGER NOT NULL,
      tx_hash TEXT,
      success INTEGER NOT NULL,
      error TEXT,
      ts INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_relist_log_token ON relist_log(token_id);

    -- Auto-renew subscriptions: paid in GHST, gates whether the cron actually
    -- relists. Cron checks expires_at > now() before each addGotchiListing.
    -- Strict: once expires_at passes, cron does nothing for this token until
    -- the user pays again to extend.
    CREATE TABLE IF NOT EXISTS subscriptions (
      token_id INTEGER PRIMARY KEY,
      owner TEXT NOT NULL,
      months_paid_total INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      last_payment_tx TEXT,
      last_payment_ghst TEXT,
      last_payment_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions(owner);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);

    -- Idempotency: prevent the same payment tx from crediting twice. Indexed
    -- so we can fast-reject replays.
    CREATE TABLE IF NOT EXISTS payment_tx_log (
      tx_hash TEXT PRIMARY KEY,
      token_id INTEGER NOT NULL,
      owner TEXT NOT NULL,
      months INTEGER NOT NULL,
      ghst_wei TEXT NOT NULL,
      credited_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
}

export type Template = {
  token_id: number;
  owner: string;
  initial_cost_wei: string;
  period_seconds: number;
  split_owner: number;
  split_borrower: number;
  split_other: number;
  third_party: string;
  whitelist_id: number;
  channelling: number;
  enabled: number;
  last_relist_at: number | null;
  last_relist_listing_id: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

export function upsertTemplate(t: Omit<Template, "created_at" | "updated_at" | "last_relist_at" | "last_relist_listing_id" | "last_error">) {
  const d = getDb();
  d.prepare(
    `INSERT INTO templates (
      token_id, owner, initial_cost_wei, period_seconds, split_owner, split_borrower,
      split_other, third_party, whitelist_id, channelling, enabled, updated_at
    ) VALUES (
      @token_id, @owner, @initial_cost_wei, @period_seconds, @split_owner, @split_borrower,
      @split_other, @third_party, @whitelist_id, @channelling, @enabled, strftime('%s','now')
    )
    ON CONFLICT(token_id) DO UPDATE SET
      owner = excluded.owner,
      initial_cost_wei = excluded.initial_cost_wei,
      period_seconds = excluded.period_seconds,
      split_owner = excluded.split_owner,
      split_borrower = excluded.split_borrower,
      split_other = excluded.split_other,
      third_party = excluded.third_party,
      whitelist_id = excluded.whitelist_id,
      channelling = excluded.channelling,
      enabled = excluded.enabled,
      updated_at = strftime('%s','now')
    `
  ).run(t);
}

export function listEnabledTemplates(): Template[] {
  return getDb()
    .prepare(`SELECT * FROM templates WHERE enabled = 1 ORDER BY token_id`)
    .all() as Template[];
}

export function listTemplatesForOwner(owner: string): Template[] {
  return getDb()
    .prepare(`SELECT * FROM templates WHERE owner = ? ORDER BY token_id`)
    .all(owner.toLowerCase()) as Template[];
}

export function setEnabled(tokenId: number, enabled: boolean) {
  getDb()
    .prepare(`UPDATE templates SET enabled = ?, updated_at = strftime('%s','now') WHERE token_id = ?`)
    .run(enabled ? 1 : 0, tokenId);
}

export function recordRelist(tokenId: number, txHash: string | null, success: boolean, error: string | null) {
  const d = getDb();
  d.prepare(
    `INSERT INTO relist_log (token_id, tx_hash, success, error) VALUES (?, ?, ?, ?)`
  ).run(tokenId, txHash, success ? 1 : 0, error);
  if (success) {
    d.prepare(
      `UPDATE templates SET last_relist_at = strftime('%s','now'), last_error = NULL, updated_at = strftime('%s','now') WHERE token_id = ?`
    ).run(tokenId);
  } else if (error) {
    d.prepare(
      `UPDATE templates SET last_error = ?, updated_at = strftime('%s','now') WHERE token_id = ?`
    ).run(error.slice(0, 500), tokenId);
  }
}

export function getRecentRelists(tokenId: number, limit = 10) {
  return getDb()
    .prepare(`SELECT * FROM relist_log WHERE token_id = ? ORDER BY ts DESC LIMIT ?`)
    .all(tokenId, limit);
}

// ----- Subscriptions ---------------------------------------------------------

export type Subscription = {
  token_id: number;
  owner: string;
  months_paid_total: number;
  expires_at: number;
  last_payment_tx: string | null;
  last_payment_ghst: string | null;
  last_payment_at: number | null;
  created_at: number;
  updated_at: number;
};

export function getSubscription(tokenId: number): Subscription | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM subscriptions WHERE token_id = ?`)
      .get(tokenId) as Subscription | undefined) ?? null
  );
}

export function listSubscriptionsForOwner(owner: string): Subscription[] {
  return getDb()
    .prepare(`SELECT * FROM subscriptions WHERE owner = ? ORDER BY token_id`)
    .all(owner.toLowerCase()) as Subscription[];
}

export function listAllActiveSubscriptions(): Subscription[] {
  return getDb()
    .prepare(`SELECT * FROM subscriptions WHERE expires_at > strftime('%s','now') ORDER BY token_id`)
    .all() as Subscription[];
}

export function listAllSubscriptions(): Subscription[] {
  return getDb()
    .prepare(`SELECT * FROM subscriptions ORDER BY expires_at DESC`)
    .all() as Subscription[];
}

export function isSubscriptionActive(tokenId: number): boolean {
  const row = getDb()
    .prepare(`SELECT expires_at FROM subscriptions WHERE token_id = ?`)
    .get(tokenId) as { expires_at: number } | undefined;
  if (!row) return false;
  return row.expires_at > Math.floor(Date.now() / 1000);
}

// Credit a payment. Extends from max(now, current expires_at) so users who
// renew early don't lose paid time. Throws if the txHash has already been
// used (idempotency).
export function creditSubscription(
  tokenId: number,
  owner: string,
  months: number,
  paymentTxHash: string,
  ghstWei: bigint
): Subscription {
  const d = getDb();
  const ownerLc = owner.toLowerCase();
  const tx = d.transaction(() => {
    // Idempotency check
    const existingTx = d
      .prepare(`SELECT 1 FROM payment_tx_log WHERE tx_hash = ?`)
      .get(paymentTxHash);
    if (existingTx) {
      throw new Error("payment tx already credited");
    }

    const now = Math.floor(Date.now() / 1000);
    const ext = months * 30 * 86400;
    const existing = d
      .prepare(`SELECT * FROM subscriptions WHERE token_id = ?`)
      .get(tokenId) as Subscription | undefined;
    const baseExpiry = existing && existing.expires_at > now ? existing.expires_at : now;
    const newExpiry = baseExpiry + ext;
    const newTotal = (existing?.months_paid_total ?? 0) + months;

    if (existing) {
      d.prepare(
        `UPDATE subscriptions
           SET owner = ?,
               months_paid_total = ?,
               expires_at = ?,
               last_payment_tx = ?,
               last_payment_ghst = ?,
               last_payment_at = ?,
               updated_at = strftime('%s','now')
         WHERE token_id = ?`
      ).run(ownerLc, newTotal, newExpiry, paymentTxHash, ghstWei.toString(), now, tokenId);
    } else {
      d.prepare(
        `INSERT INTO subscriptions
          (token_id, owner, months_paid_total, expires_at, last_payment_tx, last_payment_ghst, last_payment_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(tokenId, ownerLc, months, newExpiry, paymentTxHash, ghstWei.toString(), now);
    }

    d.prepare(
      `INSERT INTO payment_tx_log (tx_hash, token_id, owner, months, ghst_wei) VALUES (?, ?, ?, ?, ?)`
    ).run(paymentTxHash, tokenId, ownerLc, months, ghstWei.toString());
  });
  tx();

  return getSubscription(tokenId)!;
}
