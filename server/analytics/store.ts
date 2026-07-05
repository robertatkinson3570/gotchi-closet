// server/analytics/store.ts
// One table of raw events. DB path mirrors the games/companion convention so prod
// lands on the same writable volume.
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { AnalyticsEvent, EventType, VisitorRow } from "../../src/lib/analytics/types";

let db: Database.Database | null = null;

function dbPath(): string {
  if (process.env.ANALYTICS_DB_PATH) return process.env.ANALYTICS_DB_PATH;
  if (process.env.COMPANION_DB_PATH) {
    return path.join(path.dirname(process.env.COMPANION_DB_PATH), "analytics.db");
  }
  return path.resolve("./data/analytics.db");
}

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
    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      wallet     TEXT,
      ip         TEXT,
      path       TEXT,
      event_type TEXT NOT NULL,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_events_wallet ON events(wallet);
    CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
  `);
  return db;
}

export interface NewEvent {
  visitor_id: string;
  wallet: string | null;
  ip: string | null;
  path: string | null;
  event_type: EventType;
  user_agent: string | null;
  created_at: number;
}

export function insertEvent(e: NewEvent): void {
  getDb()
    .prepare(
      `INSERT INTO events (visitor_id, wallet, ip, path, event_type, user_agent, created_at)
       VALUES (@visitor_id, @wallet, @ip, @path, @event_type, @user_agent, @created_at)`
    )
    .run(e);
}

export function listEvents(opts: { sinceMs: number; limit?: number }): AnalyticsEvent[] {
  return getDb()
    .prepare(
      `SELECT * FROM events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(opts.sinceMs, opts.limit ?? 5000) as AnalyticsEvent[];
}

export function listVisitors(opts: { sinceMs: number }): VisitorRow[] {
  return getDb()
    .prepare(
      `SELECT
         visitor_id,
         (SELECT wallet FROM events e2
            WHERE e2.visitor_id = e.visitor_id AND e2.wallet IS NOT NULL
              AND e2.created_at >= @since
            ORDER BY e2.created_at DESC LIMIT 1) AS wallet,
         (SELECT ip FROM events e3
            WHERE e3.visitor_id = e.visitor_id AND e3.created_at >= @since
            ORDER BY e3.created_at DESC LIMIT 1) AS ip,
         COUNT(*) AS events,
         MIN(created_at) AS first_seen,
         MAX(created_at) AS last_seen
       FROM events e
       WHERE created_at >= @since
       GROUP BY visitor_id
       ORDER BY last_seen DESC`
    )
    .all({ since: opts.sinceMs }) as VisitorRow[];
}

export function pruneOld(cutoffMs: number): number {
  const info = getDb().prepare(`DELETE FROM events WHERE created_at < ?`).run(cutoffMs);
  return info.changes;
}
