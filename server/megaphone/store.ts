// server/megaphone/store.ts
// Megaphone video store. Metadata in SQLite; the MP4 + poster bytes live as files on the
// same writable volume the companion/pulse/games DBs use, served later via express.static
// (so the browser gets HTTP range requests for video seeking). Mirrors the Game Center
// store conventions (DB-path fallback, lowercase wallets, epoch-ms timestamps).
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Template, VideoPublic, VideoRow, VideoStatus } from "../../src/lib/megaphone/types";

let db: Database.Database | null = null;

function dataDir(): string {
  if (process.env.MEGAPHONE_DB_PATH) return path.dirname(process.env.MEGAPHONE_DB_PATH);
  if (process.env.COMPANION_DB_PATH) return path.dirname(process.env.COMPANION_DB_PATH);
  return path.resolve("./data");
}

function dbPath(): string {
  if (process.env.MEGAPHONE_DB_PATH) return process.env.MEGAPHONE_DB_PATH;
  return path.join(dataDir(), "megaphone.db");
}

/** Directory the MP4/poster files land in. Created on first use. */
export function mediaDir(): string {
  const dir = path.join(dataDir(), "megaphone-media");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
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
    CREATE TABLE IF NOT EXISTS videos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      caption       TEXT NOT NULL,
      template      TEXT NOT NULL,
      video_file    TEXT NOT NULL,
      poster_file   TEXT,
      duration_s    INTEGER,
      gotchi_id     TEXT,
      status        TEXT NOT NULL DEFAULT 'published',
      pinned_pulse  INTEGER NOT NULL DEFAULT 0,
      published_by  TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status, created_at);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare(`SELECT value FROM meta WHERE key=?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb().prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}

function toPublic(r: VideoRow): VideoPublic {
  return {
    id: r.id,
    title: r.title,
    caption: r.caption,
    template: r.template,
    videoUrl: `/api/megaphone/media/${r.video_file}`,
    posterUrl: r.poster_file ? `/api/megaphone/media/${r.poster_file}` : null,
    durationS: r.duration_s,
    gotchiId: r.gotchi_id,
    pinnedPulse: r.pinned_pulse === 1,
    createdAt: r.created_at,
  };
}

export interface NewVideo {
  title: string;
  caption: string;
  template: Template;
  mp4: Buffer;
  poster: Buffer | null;
  durationS: number | null;
  gotchiId: string | null;
  publishedBy: string;
}

/**
 * Writes the media files, inserts the metadata row, and returns the public projection.
 * The files are named by the row id so they are stable and collision-free.
 */
export function insertVideo(v: NewVideo): VideoPublic {
  const info = getDb()
    .prepare(
      `INSERT INTO videos (title, caption, template, video_file, poster_file, duration_s, gotchi_id, status, pinned_pulse, published_by, created_at)
       VALUES (?, ?, ?, '', NULL, ?, ?, 'published', 0, ?, ?)`
    )
    .run(v.title, v.caption, v.template, v.durationS, v.gotchiId, v.publishedBy.toLowerCase(), Date.now());
  const id = Number(info.lastInsertRowid);

  const videoFile = `${id}.mp4`;
  fs.writeFileSync(path.join(mediaDir(), videoFile), v.mp4);
  let posterFile: string | null = null;
  if (v.poster) {
    posterFile = `${id}.jpg`;
    fs.writeFileSync(path.join(mediaDir(), posterFile), v.poster);
  }
  getDb().prepare(`UPDATE videos SET video_file=?, poster_file=? WHERE id=?`).run(videoFile, posterFile, id);

  return toPublic(getRow(id)!);
}

export function getRow(id: number): VideoRow | null {
  const row = getDb().prepare(`SELECT * FROM videos WHERE id=?`).get(id) as VideoRow | undefined;
  return row ?? null;
}

/** Public list: published only, newest first. Optional template filter. */
export function listPublished(template?: Template): VideoPublic[] {
  const rows = template
    ? (getDb().prepare(`SELECT * FROM videos WHERE status='published' AND template=? ORDER BY created_at DESC`).all(template) as VideoRow[])
    : (getDb().prepare(`SELECT * FROM videos WHERE status='published' ORDER BY created_at DESC`).all() as VideoRow[]);
  return rows.map(toPublic);
}

/** Admin list: every video regardless of status, newest first. */
export function listAll(): VideoPublic[] {
  const rows = getDb().prepare(`SELECT * FROM videos ORDER BY created_at DESC`).all() as VideoRow[];
  return rows.map(toPublic);
}

/** The single video pinned to /pulse (most recent if somehow more than one). */
export function pinnedPulseVideo(): VideoPublic | null {
  const row = getDb()
    .prepare(`SELECT * FROM videos WHERE status='published' AND pinned_pulse=1 ORDER BY created_at DESC LIMIT 1`)
    .get() as VideoRow | undefined;
  return row ? toPublic(row) : null;
}

/** Pin exactly one video to /pulse — unpins any other first (single-slot hero). */
export function pinPulse(id: number): void {
  const d = getDb();
  const tx = d.transaction(() => {
    d.prepare(`UPDATE videos SET pinned_pulse=0 WHERE pinned_pulse=1`).run();
    d.prepare(`UPDATE videos SET pinned_pulse=1 WHERE id=?`).run(id);
  });
  tx();
}

export function setStatus(id: number, status: VideoStatus): void {
  getDb().prepare(`UPDATE videos SET status=? WHERE id=?`).run(status, id);
}

/** Hard-delete: removes the row and its media files. */
export function deleteVideo(id: number): void {
  const row = getRow(id);
  if (!row) return;
  getDb().prepare(`DELETE FROM videos WHERE id=?`).run(id);
  for (const f of [row.video_file, row.poster_file]) {
    if (!f) continue;
    const p = path.join(mediaDir(), f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}
