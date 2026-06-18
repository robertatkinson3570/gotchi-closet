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
