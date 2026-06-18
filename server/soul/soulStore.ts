import { getDb, closeDb as _closeDb } from "../companion/db";
import { encryptSoul, decryptSoul } from "./crypto";
import {
  canonicalSerialize,
  deserialize,
  soulHash,
  type SoulDocument,
} from "./soulDoc";

// ---------------------------------------------------------------------------
// Lazy schema — mirrors the ensuredDb guard in globalRoom.ts so the schema
// is re-created after closeDb() between tests.
// ---------------------------------------------------------------------------

let ensuredDb: object | null = null;

function ensureSchema() {
  const db = getDb();
  if (ensuredDb === db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS souls (
      token_id          TEXT PRIMARY KEY,
      owner_wallet      TEXT,
      blob_cipher       TEXT NOT NULL,
      blob_hash         TEXT NOT NULL,
      depth_cached      REAL,
      soul_age_days     INTEGER,
      past_lives_count  INTEGER,
      updated_at        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS soul_seals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id     TEXT    NOT NULL,
      owner_wallet TEXT,
      blob_hash    TEXT,
      depth        REAL,
      soul_age_days INTEGER,
      tx_hash      TEXT,
      block_number INTEGER,
      sealed_at    INTEGER
    );

    CREATE TABLE IF NOT EXISTS soul_transfers (
      token_id     TEXT    NOT NULL,
      new_owner    TEXT    NOT NULL,
      block_number INTEGER NOT NULL,
      processed_at INTEGER NOT NULL,
      PRIMARY KEY (token_id, new_owner, block_number)
    );
  `);
  ensuredDb = db;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedSoulRow {
  ownerWallet: string | null;
  blobHash: string;
  depthCached: number | null;
  soulAgeDays: number | null;
  pastLivesCount: number | null;
  updatedAt: number;
}

export interface SealRecord {
  id: number;
  tokenId: string;
  ownerWallet: string | null;
  blobHash: string | null;
  depth: number | null;
  soulAgeDays: number | null;
  txHash: string | null;
  blockNumber: number | null;
  sealedAt: number | null;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch, decrypt, and deserialize a SoulDocument.
 * Returns null if no row exists for the given tokenId.
 */
export function getSoulDoc(tokenId: string): SoulDocument | null {
  ensureSchema();
  const row = getDb()
    .prepare(`SELECT blob_cipher FROM souls WHERE token_id = ?`)
    .get(String(tokenId)) as { blob_cipher: string } | undefined;
  if (!row) return null;
  return deserialize(decryptSoul(row.blob_cipher));
}

/**
 * Read the cheap cached columns without decrypting the blob.
 * Returns null if no row exists.
 */
export function getCached(tokenId: string): CachedSoulRow | null {
  ensureSchema();
  const row = getDb()
    .prepare(
      `SELECT owner_wallet, blob_hash, depth_cached, soul_age_days, past_lives_count, updated_at
       FROM souls WHERE token_id = ?`
    )
    .get(String(tokenId)) as
    | {
        owner_wallet: string | null;
        blob_hash: string;
        depth_cached: number | null;
        soul_age_days: number | null;
        past_lives_count: number | null;
        updated_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    ownerWallet: row.owner_wallet,
    blobHash: row.blob_hash,
    depthCached: row.depth_cached,
    soulAgeDays: row.soul_age_days,
    pastLivesCount: row.past_lives_count,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Encrypt and upsert a SoulDocument plus its cached derived fields.
 */
export function saveSoulDoc(
  tokenId: string,
  ownerWallet: string | null,
  doc: SoulDocument,
  cached: {
    depth: number;
    soulAgeDays: number;
    pastLivesCount: number;
  }
): void {
  ensureSchema();
  const cipher = encryptSoul(canonicalSerialize(doc));
  const hash = soulHash(doc);
  getDb()
    .prepare(
      `INSERT INTO souls
         (token_id, owner_wallet, blob_cipher, blob_hash, depth_cached, soul_age_days, past_lives_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(token_id) DO UPDATE SET
         owner_wallet     = excluded.owner_wallet,
         blob_cipher      = excluded.blob_cipher,
         blob_hash        = excluded.blob_hash,
         depth_cached     = excluded.depth_cached,
         soul_age_days    = excluded.soul_age_days,
         past_lives_count = excluded.past_lives_count,
         updated_at       = excluded.updated_at`
    )
    .run(
      String(tokenId),
      ownerWallet ? ownerWallet.toLowerCase() : null,
      cipher,
      hash,
      cached.depth,
      cached.soulAgeDays,
      cached.pastLivesCount,
      Date.now()
    );
}

/**
 * Update the stored owner wallet (for transfer / lazy reconcile).
 */
export function setOwner(tokenId: string, ownerWallet: string): void {
  ensureSchema();
  getDb()
    .prepare(`UPDATE souls SET owner_wallet = ? WHERE token_id = ?`)
    .run(ownerWallet.toLowerCase(), String(tokenId));
}

// ---------------------------------------------------------------------------
// Seals
// ---------------------------------------------------------------------------

export interface RecordSealInput {
  tokenId: string;
  ownerWallet?: string | null;
  blobHash?: string | null;
  depth?: number | null;
  soulAgeDays?: number | null;
  txHash?: string | null;
  blockNumber?: number | null;
}

/**
 * Insert a seal record into soul_seals.
 */
export function recordSeal(input: RecordSealInput): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO soul_seals
         (token_id, owner_wallet, blob_hash, depth, soul_age_days, tx_hash, block_number, sealed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(input.tokenId),
      input.ownerWallet ? input.ownerWallet.toLowerCase() : null,
      input.blobHash ?? null,
      input.depth ?? null,
      input.soulAgeDays ?? null,
      input.txHash ?? null,
      input.blockNumber ?? null,
      Date.now()
    );
}

// ---------------------------------------------------------------------------
// Transfer tracking (idempotency)
// ---------------------------------------------------------------------------

/**
 * Returns true if this (tokenId, newOwner, blockNumber) triple has already
 * been processed, preventing double-distillation on replay.
 */
export function wasTransferProcessed(
  tokenId: string,
  newOwner: string,
  blockNumber: number
): boolean {
  ensureSchema();
  const row = getDb()
    .prepare(
      `SELECT 1 FROM soul_transfers WHERE token_id = ? AND new_owner = ? AND block_number = ?`
    )
    .get(String(tokenId), newOwner.toLowerCase(), blockNumber);
  return row != null;
}

/**
 * Mark a transfer as processed so it is never replayed.
 */
export function markTransferProcessed(
  tokenId: string,
  newOwner: string,
  blockNumber: number
): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO soul_transfers (token_id, new_owner, block_number, processed_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(String(tokenId), newOwner.toLowerCase(), blockNumber, Date.now());
}

/**
 * Return all seal records for a tokenId, newest first.
 */
export function getSeals(tokenId: string): SealRecord[] {
  ensureSchema();
  const rows = getDb()
    .prepare(
      `SELECT id, token_id, owner_wallet, blob_hash, depth, soul_age_days, tx_hash, block_number, sealed_at
       FROM soul_seals WHERE token_id = ? ORDER BY id DESC`
    )
    .all(String(tokenId)) as Array<{
    id: number;
    token_id: string;
    owner_wallet: string | null;
    blob_hash: string | null;
    depth: number | null;
    soul_age_days: number | null;
    tx_hash: string | null;
    block_number: number | null;
    sealed_at: number | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    tokenId: r.token_id,
    ownerWallet: r.owner_wallet,
    blobHash: r.blob_hash,
    depth: r.depth,
    soulAgeDays: r.soul_age_days,
    txHash: r.tx_hash,
    blockNumber: r.block_number,
    sealedAt: r.sealed_at,
  }));
}
