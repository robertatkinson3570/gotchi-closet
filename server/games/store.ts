// server/games/store.ts
// One table, image bytes inline. DB path mirrors the Pulse fallback so prod lands on
// the writable volume the companion DB lives on.
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Category, GameRow, GamePublic, GameStatus } from "../../src/lib/games/types";

let db: Database.Database | null = null;

function dbPath(): string {
  if (process.env.GAMES_DB_PATH) return process.env.GAMES_DB_PATH;
  if (process.env.COMPANION_DB_PATH) {
    return path.join(path.dirname(process.env.COMPANION_DB_PATH), "games.db");
  }
  return path.resolve("./data/games.db");
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
    CREATE TABLE IF NOT EXISTS games (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT NOT NULL,
      description      TEXT NOT NULL,
      url              TEXT NOT NULL,
      category         TEXT NOT NULL,
      image_mime       TEXT NOT NULL,
      image_data       TEXT NOT NULL,
      submitter_wallet TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      created_at       INTEGER NOT NULL,
      reviewed_at      INTEGER,
      reviewed_by      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_games_status_cat ON games(status, category);
  `);
  return db;
}

export interface NewGame {
  title: string;
  description: string;
  url: string;
  category: Category;
  image_mime: string;
  image_data: string;
  submitter_wallet: string;
}

export function insertPending(g: NewGame): number {
  const info = getDb()
    .prepare(
      `INSERT INTO games (title, description, url, category, image_mime, image_data, submitter_wallet, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(g.title, g.description, g.url, g.category, g.image_mime, g.image_data, g.submitter_wallet.toLowerCase(), Date.now());
  return Number(info.lastInsertRowid);
}

function toPublic(r: GameRow): GamePublic {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    url: r.url,
    category: r.category,
    imageUrl: `/api/games/${r.id}/image`,
    createdAt: r.created_at,
  };
}

export function listApproved(category?: Category): GamePublic[] {
  const rows = category
    ? (getDb().prepare(`SELECT * FROM games WHERE status='approved' AND category=? ORDER BY created_at DESC`).all(category) as GameRow[])
    : (getDb().prepare(`SELECT * FROM games WHERE status='approved' ORDER BY created_at DESC`).all() as GameRow[]);
  return rows.map(toPublic);
}

/** Admin view: full pending rows (minus image bytes, served separately). */
export function listPending(): Omit<GameRow, "image_data">[] {
  return getDb()
    .prepare(`SELECT id, title, description, url, category, image_mime, submitter_wallet, status, created_at, reviewed_at, reviewed_by FROM games WHERE status='pending' ORDER BY created_at ASC`)
    .all() as Omit<GameRow, "image_data">[];
}

/** Image bytes for a single row, regardless of status (route decides who may see it). */
export function getImage(id: number): { image_mime: string; image_data: string; status: GameStatus } | null {
  const row = getDb().prepare(`SELECT image_mime, image_data, status FROM games WHERE id=?`).get(id) as
    | { image_mime: string; image_data: string; status: GameStatus }
    | undefined;
  return row ?? null;
}

export function review(id: number, status: Exclude<GameStatus, "pending">, admin: string): void {
  getDb()
    .prepare(`UPDATE games SET status=?, reviewed_at=?, reviewed_by=? WHERE id=?`)
    .run(status, Date.now(), admin.toLowerCase(), id);
}

export function pendingCountForWallet(wallet: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM games WHERE status='pending' AND submitter_wallet=?`)
    .get(wallet.toLowerCase()) as { n: number };
  return row.n;
}
