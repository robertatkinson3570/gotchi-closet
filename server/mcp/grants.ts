// Wallet grants: which wallets let which Wisp key read and add to their
// gotchi's shared chat history. A row exists only after the holder signed a
// grant message (companion/walletProof.ts), so a key can never grant itself.

import { getDb } from "../companion/db";

let ensured: object | null = null;
function db() {
  const d = getDb();
  if (ensured === d) return d;
  d.exec(`
    CREATE TABLE IF NOT EXISTS wisp_grants (
      api_key    TEXT NOT NULL,
      wallet     TEXT NOT NULL,
      domain     TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      PRIMARY KEY (api_key, wallet)
    );
    CREATE INDEX IF NOT EXISTS wisp_grants_wallet ON wisp_grants (wallet);
  `);
  ensured = d;
  return d;
}

export interface Grant {
  wallet: string;
  domain: string;
  grantedAt: number;
  expiresAt: number;
}

export function saveGrant(apiKey: string, g: Grant): Grant {
  db().prepare(
    `INSERT INTO wisp_grants (api_key, wallet, domain, granted_at, expires_at, revoked_at) VALUES (?,?,?,?,?,NULL)
     ON CONFLICT (api_key, wallet) DO UPDATE SET domain = excluded.domain, granted_at = excluded.granted_at, expires_at = excluded.expires_at, revoked_at = NULL`
  ).run(apiKey, g.wallet.toLowerCase(), g.domain, g.grantedAt, g.expiresAt);
  return { ...g, wallet: g.wallet.toLowerCase() };
}

export function hasGrant(apiKey: string, wallet: string, now: number = Date.now()): boolean {
  return !!db()
    .prepare(`SELECT 1 FROM wisp_grants WHERE api_key = ? AND wallet = ? AND revoked_at IS NULL AND expires_at > ?`)
    .get(apiKey, wallet.toLowerCase(), now);
}

type Row = { api_key: string; wallet: string; domain: string; granted_at: number; expires_at: number };
const toGrant = (r: Row): Grant => ({ wallet: r.wallet, domain: r.domain, grantedAt: r.granted_at, expiresAt: r.expires_at });

/** The key's live grants, newest first. */
export function grantsForKey(apiKey: string, now: number = Date.now()): Grant[] {
  return (db()
    .prepare(`SELECT * FROM wisp_grants WHERE api_key = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY granted_at DESC LIMIT 1000`)
    .all(apiKey, now) as Row[]).map(toGrant);
}

/** The wallet's live grants, with the app's public tag (never the key). */
export function grantsForWallet(wallet: string, now: number = Date.now()): (Grant & { app: string })[] {
  return (db()
    .prepare(`SELECT * FROM wisp_grants WHERE wallet = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY granted_at DESC LIMIT 200`)
    .all(wallet.toLowerCase(), now) as Row[]).map((r) => ({ ...toGrant(r), app: r.api_key.slice(0, 12) }));
}

/** The app drops its own grant. */
export function revokeGrant(apiKey: string, wallet: string, now: number = Date.now()): boolean {
  return db().prepare(`UPDATE wisp_grants SET revoked_at = ? WHERE api_key = ? AND wallet = ? AND revoked_at IS NULL`).run(now, apiKey, wallet.toLowerCase()).changes > 0;
}

/** The holder revokes an app by its public tag (every key sharing the tag). */
export function revokeGrantByTag(wallet: string, app: string, now: number = Date.now()): number {
  if (!/^wsp_[0-9a-f]{8}$/.test(app)) return 0;
  return db()
    .prepare(`UPDATE wisp_grants SET revoked_at = ? WHERE wallet = ? AND substr(api_key, 1, 12) = ? AND revoked_at IS NULL`)
    .run(now, wallet.toLowerCase(), app).changes;
}

/** Key rotation keeps the holders' grants with the account. */
export function moveGrants(oldKey: string, newKey: string): void {
  db().prepare(`UPDATE wisp_grants SET api_key = ? WHERE api_key = ?`).run(newKey, oldKey);
}
