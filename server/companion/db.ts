import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Tier } from "../../src/lib/companion/types";

let db: Database.Database | null = null;

function dbPath(): string {
  return process.env.COMPANION_DB_PATH || path.resolve("./data/companion.db");
}

/** Close and discard the current connection. Used by tests between runs. */
export function closeDb(): void {
  if (db) { db.close(); db = null; }
}

export function getDb(): Database.Database {
  if (db) return db;
  const p = dbPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS companion_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL, token_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msg_key ON companion_messages(wallet, token_id, id);

    CREATE TABLE IF NOT EXISTS companion_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL, token_id TEXT NOT NULL,
      fact TEXT NOT NULL, ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fact_key ON companion_facts(wallet, token_id, id);

    CREATE TABLE IF NOT EXISTS companion_entitlements (
      wallet TEXT PRIMARY KEY, tier TEXT NOT NULL,
      expires_at INTEGER NOT NULL, last_tx_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS companion_premium_tx (
      tx_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, credited_at INTEGER NOT NULL
    );
  `);
  return db;
}

export interface StoredMessage { role: "user" | "assistant"; content: string; ts: number; }

export function appendMessage(wallet: string, tokenId: string, role: "user" | "assistant", content: string) {
  getDb().prepare(
    `INSERT INTO companion_messages (wallet, token_id, role, content, ts) VALUES (?,?,?,?,?)`
  ).run(wallet.toLowerCase(), String(tokenId), role, content, Date.now());
}

export function getRecentMessages(wallet: string, tokenId: string, limit = 20): StoredMessage[] {
  const rows = getDb().prepare(
    `SELECT role, content, ts FROM companion_messages
     WHERE wallet = ? AND token_id = ? ORDER BY id DESC LIMIT ?`
  ).all(wallet.toLowerCase(), String(tokenId), limit) as StoredMessage[];
  return rows.reverse(); // newest-last
}

export function upsertFact(wallet: string, tokenId: string, fact: string, cap = 10) {
  const d = getDb();
  d.prepare(`INSERT INTO companion_facts (wallet, token_id, fact, ts) VALUES (?,?,?,?)`)
    .run(wallet.toLowerCase(), String(tokenId), fact, Date.now());
  // Drop oldest beyond cap.
  d.prepare(
    `DELETE FROM companion_facts WHERE id IN (
       SELECT id FROM companion_facts WHERE wallet = ? AND token_id = ?
       ORDER BY id DESC LIMIT -1 OFFSET ?
     )`
  ).run(wallet.toLowerCase(), String(tokenId), cap);
}

export function getFacts(wallet: string, tokenId: string): string[] {
  return (getDb().prepare(
    `SELECT fact FROM companion_facts WHERE wallet = ? AND token_id = ? ORDER BY id ASC`
  ).all(wallet.toLowerCase(), String(tokenId)) as { fact: string }[]).map((r) => r.fact);
}

export interface Entitlement { wallet: string; tier: Tier; expires_at: number; last_tx_hash: string | null; }

export function getEntitlement(wallet: string): Entitlement | null {
  return (getDb().prepare(`SELECT * FROM companion_entitlements WHERE wallet = ?`)
    .get(wallet.toLowerCase()) as Entitlement | undefined) ?? null;
}

export function isPremiumActive(wallet: string): boolean {
  const e = getEntitlement(wallet);
  return !!e && e.tier === "premium" && e.expires_at > Date.now();
}

// Idempotent premium grant. Throws "tx already credited" on replay. Extends from
// max(now, current expiry) so early renewals don't lose paid time.
export function grantPremium(wallet: string, expiresAt: number, txHash: string): Entitlement {
  const d = getDb();
  const w = wallet.toLowerCase();
  const tx = d.transaction(() => {
    if (d.prepare(`SELECT 1 FROM companion_premium_tx WHERE tx_hash = ?`).get(txHash)) {
      throw new Error("tx already credited");
    }
    const existing = getEntitlement(w);
    const base = existing && existing.expires_at > Date.now() ? existing.expires_at : Date.now();
    const extended = base + (expiresAt - Date.now());
    d.prepare(
      `INSERT INTO companion_entitlements (wallet, tier, expires_at, last_tx_hash)
       VALUES (?, 'premium', ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET tier='premium', expires_at=excluded.expires_at, last_tx_hash=excluded.last_tx_hash`
    ).run(w, extended, txHash);
    d.prepare(`INSERT INTO companion_premium_tx (tx_hash, wallet, credited_at) VALUES (?,?,?)`)
      .run(txHash, w, Date.now());
  });
  tx();
  return getEntitlement(w)!;
}
