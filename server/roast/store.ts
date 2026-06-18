import { getDb, closeDb as _closeDb } from "../companion/db";

// ---------------------------------------------------------------------------
// Lazy schema — mirrors the globalRoom.ts pattern: track the DB instance
// identity so the schema is re-created after closeDb() in tests.
// ---------------------------------------------------------------------------

let ensuredDb: object | null = null;

function ensureSchema() {
  const db = getDb();
  if (ensuredDb === db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS roast_queue (
      token_id   TEXT PRIMARY KEY,
      wallet     TEXT NOT NULL,
      gotchi_name TEXT NOT NULL,
      queued_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roast_battles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      a_token       TEXT NOT NULL,
      a_name        TEXT NOT NULL,
      a_wallet      TEXT NOT NULL,
      b_token       TEXT NOT NULL,
      b_name        TEXT NOT NULL,
      b_wallet      TEXT NOT NULL,
      winner_token  TEXT NOT NULL,
      transcript    TEXT NOT NULL,
      verdict       TEXT NOT NULL,
      a_score       INTEGER NOT NULL,
      b_score       INTEGER NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_battles_a ON roast_battles(a_token, id);
    CREATE INDEX IF NOT EXISTS idx_battles_b ON roast_battles(b_token, id);

    CREATE TABLE IF NOT EXISTS roast_stats (
      token_id    TEXT PRIMARY KEY,
      wallet      TEXT NOT NULL,
      gotchi_name TEXT NOT NULL,
      wins        INTEGER NOT NULL DEFAULT 0,
      losses      INTEGER NOT NULL DEFAULT 0,
      xp          INTEGER NOT NULL DEFAULT 0,
      updated_at  INTEGER NOT NULL
    );
  `);
  ensuredDb = db;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueueEntry {
  tokenId: string;
  gotchiName: string;
  wallet: string;
  queuedAt: number;
}

export interface StatRow {
  tokenId: string;
  gotchiName: string;
  wins: number;
  losses: number;
  xp: number;
}

export interface BattleRow {
  id: number;
  aToken: string;
  aName: string;
  bToken: string;
  bName: string;
  winnerToken: string;
  transcript: { side: "a" | "b"; round: number; text: string }[];
  verdict: string;
  aScore: number;
  bScore: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Internal row mappers
// ---------------------------------------------------------------------------

interface QueueDbRow {
  token_id: string;
  gotchi_name: string;
  wallet: string;
  queued_at: number;
}

interface BattleDbRow {
  id: number;
  a_token: string;
  a_name: string;
  b_token: string;
  b_name: string;
  winner_token: string;
  transcript: string;
  verdict: string;
  a_score: number;
  b_score: number;
  created_at: number;
}

interface StatDbRow {
  token_id: string;
  gotchi_name: string;
  wins: number;
  losses: number;
  xp: number;
}

function toQueueEntry(r: QueueDbRow): QueueEntry {
  return { tokenId: r.token_id, gotchiName: r.gotchi_name, wallet: r.wallet, queuedAt: r.queued_at };
}

function toBattleRow(r: BattleDbRow): BattleRow {
  return {
    id: r.id,
    aToken: r.a_token,
    aName: r.a_name,
    bToken: r.b_token,
    bName: r.b_name,
    winnerToken: r.winner_token,
    transcript: JSON.parse(r.transcript),
    verdict: r.verdict,
    aScore: r.a_score,
    bScore: r.b_score,
    createdAt: r.created_at,
  };
}

function toStatRow(r: StatDbRow): StatRow {
  return { tokenId: r.token_id, gotchiName: r.gotchi_name, wins: r.wins, losses: r.losses, xp: r.xp };
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/** Upsert into roast_queue — one row per token; re-enqueue refreshes fields. */
export function enqueue(entry: { tokenId: string; wallet: string; gotchiName: string }): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO roast_queue (token_id, wallet, gotchi_name, queued_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(token_id) DO UPDATE SET
         wallet      = excluded.wallet,
         gotchi_name = excluded.gotchi_name,
         queued_at   = excluded.queued_at`
    )
    .run(String(entry.tokenId), entry.wallet.toLowerCase(), entry.gotchiName, Date.now());
}

/** Remove a token from the queue. Returns true if a row was deleted. */
export function leaveQueue(tokenId: string): boolean {
  ensureSchema();
  const info = getDb()
    .prepare(`DELETE FROM roast_queue WHERE token_id = ?`)
    .run(String(tokenId));
  return info.changes > 0;
}

/** All queued entries, newest first. */
export function getQueue(): QueueEntry[] {
  ensureSchema();
  const rows = getDb()
    .prepare(`SELECT * FROM roast_queue ORDER BY queued_at DESC`)
    .all() as QueueDbRow[];
  return rows.map(toQueueEntry);
}

/** Look up one queued entry by tokenId, or null. */
export function getQueued(tokenId: string): QueueEntry | null {
  ensureSchema();
  const row = getDb()
    .prepare(`SELECT * FROM roast_queue WHERE token_id = ?`)
    .get(String(tokenId)) as QueueDbRow | undefined;
  return row ? toQueueEntry(row) : null;
}

/**
 * Atomic claim: delete the queue row for tokenId and return true only if
 * exactly one row was removed.  A second concurrent caller gets false.
 */
export function claimQueued(tokenId: string): boolean {
  ensureSchema();
  const info = getDb()
    .prepare(`DELETE FROM roast_queue WHERE token_id = ?`)
    .run(String(tokenId));
  return info.changes === 1;
}

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

/** Insert a completed battle. Returns the new auto-increment id. */
export function insertBattle(
  b: Omit<BattleRow, "id" | "createdAt"> & { aWallet: string; bWallet: string }
): number {
  ensureSchema();
  const info = getDb()
    .prepare(
      `INSERT INTO roast_battles
         (a_token, a_name, a_wallet, b_token, b_name, b_wallet,
          winner_token, transcript, verdict, a_score, b_score, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      String(b.aToken),
      b.aName,
      b.aWallet.toLowerCase(),
      String(b.bToken),
      b.bName,
      b.bWallet.toLowerCase(),
      String(b.winnerToken),
      JSON.stringify(b.transcript),
      b.verdict,
      b.aScore,
      b.bScore,
      Date.now()
    );
  return Number(info.lastInsertRowid);
}

/** Fetch a single battle by id, or null. */
export function getBattle(id: number): BattleRow | null {
  ensureSchema();
  const row = getDb()
    .prepare(`SELECT * FROM roast_battles WHERE id = ?`)
    .get(id) as BattleDbRow | undefined;
  return row ? toBattleRow(row) : null;
}

/** Battles where the token was either side a or b, newest first. */
export function listBattlesFor(tokenId: string, limit = 20): BattleRow[] {
  ensureSchema();
  const rows = getDb()
    .prepare(
      `SELECT * FROM roast_battles
       WHERE a_token = ? OR b_token = ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(String(tokenId), String(tokenId), Math.max(1, limit)) as BattleDbRow[];
  return rows.map(toBattleRow);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Upsert roast_stats: increment wins or losses, add xpDelta, refresh name. */
export function recordResult(
  tokenId: string,
  wallet: string,
  gotchiName: string,
  won: boolean,
  xpDelta: number
): void {
  ensureSchema();
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO roast_stats (token_id, wallet, gotchi_name, wins, losses, xp, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(token_id) DO UPDATE SET
         wallet      = excluded.wallet,
         gotchi_name = excluded.gotchi_name,
         wins        = wins   + excluded.wins,
         losses      = losses + excluded.losses,
         xp          = xp    + excluded.xp,
         updated_at  = excluded.updated_at`
    )
    .run(
      String(tokenId),
      wallet.toLowerCase(),
      gotchiName,
      won ? 1 : 0,
      won ? 0 : 1,
      xpDelta,
      now
    );
}

/** Get stats for one token, or null. */
export function getStats(tokenId: string): StatRow | null {
  ensureSchema();
  const row = getDb()
    .prepare(`SELECT * FROM roast_stats WHERE token_id = ?`)
    .get(String(tokenId)) as StatDbRow | undefined;
  return row ? toStatRow(row) : null;
}

/** Top-N by XP desc, then wins desc. Limit clamped to 1..100. */
export function leaderboard(limit = 50): StatRow[] {
  ensureSchema();
  const clamped = Math.min(100, Math.max(1, limit));
  const rows = getDb()
    .prepare(`SELECT * FROM roast_stats ORDER BY xp DESC, wins DESC LIMIT ?`)
    .all(clamped) as StatDbRow[];
  return rows.map(toStatRow);
}

// ---------------------------------------------------------------------------
// Anti-grind
// ---------------------------------------------------------------------------

/**
 * Count battles between exactly this pair (either orientation) with
 * created_at >= sinceMs.  Used by the route for diminishing-XP logic.
 */
export function recentBattleCount(tokenIdA: string, tokenIdB: string, sinceMs: number): number {
  ensureSchema();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS cnt FROM roast_battles
       WHERE created_at >= ?
         AND (
           (a_token = ? AND b_token = ?)
           OR
           (a_token = ? AND b_token = ?)
         )`
    )
    .get(sinceMs, String(tokenIdA), String(tokenIdB), String(tokenIdB), String(tokenIdA)) as { cnt: number };
  return row.cnt;
}
