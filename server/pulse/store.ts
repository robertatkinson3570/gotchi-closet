/**
 * Pulse SQLite store: one row per (UTC day, metric). Upserts are idempotent so
 * backfill and nightly refresh can safely regenerate recent days.
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { MetricRow, PulsePoint } from "../../src/lib/pulse/aggregate";

let db: Database.Database | null = null;

function dbPath(): string {
  if (process.env.PULSE_DB_PATH) return process.env.PULSE_DB_PATH;
  // Prod fallback: share the writable volume the companion DB lives on — the
  // container user cannot write the default ./data under /app (EACCES).
  if (process.env.COMPANION_DB_PATH) {
    return path.join(path.dirname(process.env.COMPANION_DB_PATH), "pulse.db");
  }
  return path.resolve("./data/pulse.db");
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
    CREATE TABLE IF NOT EXISTS daily_metrics (
      day    TEXT NOT NULL,
      metric TEXT NOT NULL,
      value  REAL NOT NULL,
      PRIMARY KEY (day, metric)
    );
    CREATE INDEX IF NOT EXISTS idx_metric_day ON daily_metrics(metric, day);

    CREATE TABLE IF NOT EXISTS pulse_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function upsertMetrics(rows: MetricRow[]): void {
  if (rows.length === 0) return;
  const d = getDb();
  const stmt = d.prepare(
    `INSERT INTO daily_metrics (day, metric, value) VALUES (?, ?, ?)
     ON CONFLICT(day, metric) DO UPDATE SET value = excluded.value`
  );
  const tx = d.transaction((rs: MetricRow[]) => {
    for (const r of rs) stmt.run(r.day, r.metric, r.value);
  });
  tx(rows);
}

export function getAllSeries(): Record<string, PulsePoint[]> {
  const rows = getDb()
    .prepare(`SELECT day, metric, value FROM daily_metrics ORDER BY day ASC`)
    .all() as { day: string; metric: string; value: number }[];
  const out: Record<string, PulsePoint[]> = {};
  for (const r of rows) (out[r.metric] ??= []).push({ day: r.day, value: r.value });
  return out;
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare(`SELECT value FROM pulse_meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare(`INSERT INTO pulse_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, value);
}
