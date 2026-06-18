import { getDb } from "../companion/db";

// ---------------------------------------------------------------------------
// Lazy schema creation — mirrors the pattern in server/companion/db.ts
// ---------------------------------------------------------------------------

let schemaReady = false;

function ensureSchema(): void {
  if (schemaReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS public_chat_cache (
      token_id TEXT NOT NULL,
      q_hash   TEXT NOT NULL,
      reply    TEXT NOT NULL,
      ts       INTEGER NOT NULL,
      PRIMARY KEY (token_id, q_hash)
    );

    CREATE TABLE IF NOT EXISTS public_visitor_usage (
      visitor  TEXT PRIMARY KEY,
      count    INTEGER NOT NULL DEFAULT 0,
      reset_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public_battle_cache (
      pair_key     TEXT PRIMARY KEY,
      a_token      TEXT NOT NULL,
      b_token      TEXT NOT NULL,
      transcript   TEXT NOT NULL,
      verdict      TEXT NOT NULL,
      winner_token TEXT NOT NULL,
      a_score      INTEGER NOT NULL,
      b_score      INTEGER NOT NULL,
      ts           INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public_battle_day (
      day   TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );
  `);
  schemaReady = true;
}

// ---------------------------------------------------------------------------
// Chat cache — keyed by (tokenId, normalised-question hash)
// ---------------------------------------------------------------------------

export function getCachedReply(tokenId: string, qHash: string): string | null {
  ensureSchema();
  const row = getDb()
    .prepare(`SELECT reply FROM public_chat_cache WHERE token_id = ? AND q_hash = ?`)
    .get(tokenId, qHash) as { reply: string } | undefined;
  return row?.reply ?? null;
}

export function putCachedReply(tokenId: string, qHash: string, reply: string): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO public_chat_cache (token_id, q_hash, reply, ts)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(token_id, q_hash) DO UPDATE SET reply = excluded.reply, ts = excluded.ts`
    )
    .run(tokenId, qHash, reply, Date.now());
}

// ---------------------------------------------------------------------------
// Per-visitor (IP) daily cap
// Returns true when the visitor is OVER the cap (i.e. should be blocked).
// ---------------------------------------------------------------------------

export function bumpVisitor(visitor: string, max: number, windowMs: number): boolean {
  ensureSchema();
  const db = getDb();
  const now = Date.now();

  const row = db
    .prepare(`SELECT count, reset_at FROM public_visitor_usage WHERE visitor = ?`)
    .get(visitor) as { count: number; reset_at: number } | undefined;

  if (!row || now >= row.reset_at) {
    // First call in window — insert/reset with count = 1
    db.prepare(
      `INSERT INTO public_visitor_usage (visitor, count, reset_at)
       VALUES (?, 1, ?)
       ON CONFLICT(visitor) DO UPDATE SET count = 1, reset_at = excluded.reset_at`
    ).run(visitor, now + windowMs);
    return false; // 1 <= max (max is at least 1)
  }

  // Already in window — increment
  db.prepare(
    `UPDATE public_visitor_usage SET count = count + 1 WHERE visitor = ?`
  ).run(visitor);

  // Return true (capped) only AFTER the increment; row.count is the value before
  return row.count + 1 > max;
}

/** Exposed for tests. */
export function resetSchemaFlag(): void {
  schemaReady = false;
}

// ---------------------------------------------------------------------------
// Battle cache
// ---------------------------------------------------------------------------

export interface BattleRow {
  pairKey: string;
  aToken: string;
  bToken: string;
  transcript: string; // JSON-serialised TranscriptLine[]
  verdict: string;
  winnerToken: string;
  aScore: number;
  bScore: number;
}

export function getCachedBattle(pairKey: string): BattleRow | null {
  ensureSchema();
  const row = getDb()
    .prepare(
      `SELECT pair_key, a_token, b_token, transcript, verdict, winner_token, a_score, b_score
       FROM public_battle_cache WHERE pair_key = ?`
    )
    .get(pairKey) as
    | {
        pair_key: string;
        a_token: string;
        b_token: string;
        transcript: string;
        verdict: string;
        winner_token: string;
        a_score: number;
        b_score: number;
      }
    | undefined;
  if (!row) return null;
  return {
    pairKey: row.pair_key,
    aToken: row.a_token,
    bToken: row.b_token,
    transcript: row.transcript,
    verdict: row.verdict,
    winnerToken: row.winner_token,
    aScore: row.a_score,
    bScore: row.b_score,
  };
}

export function putCachedBattle(row: BattleRow): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO public_battle_cache
         (pair_key, a_token, b_token, transcript, verdict, winner_token, a_score, b_score, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pair_key) DO UPDATE SET
         transcript = excluded.transcript,
         verdict    = excluded.verdict,
         winner_token = excluded.winner_token,
         a_score    = excluded.a_score,
         b_score    = excluded.b_score,
         ts         = excluded.ts`
    )
    .run(
      row.pairKey,
      row.aToken,
      row.bToken,
      row.transcript,
      row.verdict,
      row.winnerToken,
      row.aScore,
      row.bScore,
      Date.now()
    );
}

/**
 * Increment today's battle count.
 * Returns true when the count EXCEEDS maxPerDay (i.e. should be blocked).
 * Uses UTC date string "YYYY-MM-DD" as the day key.
 */
export function bumpDailyBattles(maxPerDay: number): boolean {
  ensureSchema();
  const db = getDb();
  // Build UTC day string without relying on locale
  const now = new Date();
  const day = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  db.prepare(
    `INSERT INTO public_battle_day (day, count) VALUES (?, 1)
     ON CONFLICT(day) DO UPDATE SET count = count + 1`
  ).run(day);

  const row = db
    .prepare(`SELECT count FROM public_battle_day WHERE day = ?`)
    .get(day) as { count: number } | undefined;

  return (row?.count ?? 1) > maxPerDay;
}
