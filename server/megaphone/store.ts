// server/megaphone/store.ts
// Megaphone video store. Metadata in SQLite; the MP4 + poster bytes live as files on the
// same writable volume the companion/pulse/games DBs use, served later via express.static
// (so the browser gets HTTP range requests for video seeking). Mirrors the Game Center
// store conventions (DB-path fallback, lowercase wallets, epoch-ms timestamps).
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type {
  DistributionPublic,
  DistributionStatus,
  Template,
  VideoPublic,
  VideoRow,
  VideoStatus,
} from "../../src/lib/megaphone/types";

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
    CREATE TABLE IF NOT EXISTS distributions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id       INTEGER NOT NULL,
      integration_id TEXT NOT NULL,
      provider       TEXT NOT NULL,
      postiz_post_id TEXT,
      external_url   TEXT,
      status         TEXT NOT NULL DEFAULT 'scheduled',
      scheduled_for  INTEGER,
      posted_at      INTEGER,
      created_at     INTEGER NOT NULL,
      UNIQUE(video_id, integration_id)
    );
    CREATE INDEX IF NOT EXISTS idx_dist_video ON distributions(video_id);
    CREATE INDEX IF NOT EXISTS idx_dist_status ON distributions(status);
    CREATE TABLE IF NOT EXISTS tweets (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      text           TEXT NOT NULL,
      source         TEXT NOT NULL,
      link           TEXT,
      hash           TEXT NOT NULL UNIQUE,
      status         TEXT NOT NULL DEFAULT 'draft',
      external_url   TEXT,
      postiz_post_id TEXT,
      created_at     INTEGER NOT NULL,
      posted_at      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tweets_status ON tweets(status, created_at);
  `);
  return db;
}

interface DistributionRow {
  id: number;
  video_id: number;
  integration_id: string;
  provider: string;
  postiz_post_id: string | null;
  external_url: string | null;
  status: DistributionStatus;
  scheduled_for: number | null;
  posted_at: number | null;
  created_at: number;
}

function distToPublic(r: DistributionRow): DistributionPublic {
  return {
    integrationId: r.integration_id,
    provider: r.provider,
    status: r.status,
    externalUrl: r.external_url,
    scheduledFor: r.scheduled_for,
    postedAt: r.posted_at,
  };
}

/** True once a video has ANY distribution row for a channel — the no-repeat guard. */
export function hasDistribution(videoId: number, integrationId: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM distributions WHERE video_id=? AND integration_id=? LIMIT 1`)
    .get(videoId, integrationId);
  return !!row;
}

/**
 * Reserve a distribution slot. INSERT OR IGNORE against the UNIQUE(video_id, integration_id)
 * constraint makes a repeat structurally impossible even under races. Returns the row id when
 * this call created it, or null when one already existed (caller must then NOT post).
 */
export function reserveDistribution(input: {
  videoId: number;
  integrationId: string;
  provider: string;
  scheduledFor: number | null;
}): number | null {
  const existing = getDb()
    .prepare(`SELECT id, status FROM distributions WHERE video_id=? AND integration_id=?`)
    .get(input.videoId, input.integrationId) as { id: number; status: DistributionStatus } | undefined;
  if (existing) {
    // A prior FAILED attempt may be retried; posted/scheduled are never touched (no-repeat).
    if (existing.status === "failed") {
      getDb()
        .prepare(`UPDATE distributions SET status='scheduled', postiz_post_id=NULL, external_url=NULL, posted_at=NULL, scheduled_for=? WHERE id=?`)
        .run(input.scheduledFor, existing.id);
      return existing.id;
    }
    return null;
  }
  const info = getDb()
    .prepare(
      `INSERT INTO distributions (video_id, integration_id, provider, status, scheduled_for, created_at)
       VALUES (?, ?, ?, 'scheduled', ?, ?)`
    )
    .run(input.videoId, input.integrationId, input.provider, input.scheduledFor, Date.now());
  return Number(info.lastInsertRowid);
}

export function setDistributionPostId(id: number, postizPostId: string): void {
  getDb().prepare(`UPDATE distributions SET postiz_post_id=? WHERE id=?`).run(postizPostId, id);
}

export function markDistributionPosted(id: number, externalUrl: string | null): void {
  getDb()
    .prepare(`UPDATE distributions SET status='posted', external_url=?, posted_at=? WHERE id=?`)
    .run(externalUrl, Date.now(), id);
}

export function markDistributionFailed(id: number): void {
  getDb().prepare(`UPDATE distributions SET status='failed' WHERE id=?`).run(id);
}

export function distributionsForVideo(videoId: number): DistributionPublic[] {
  const rows = getDb()
    .prepare(`SELECT * FROM distributions WHERE video_id=? ORDER BY created_at ASC`)
    .all(videoId) as DistributionRow[];
  return rows.map(distToPublic);
}

/** Scheduled rows that have a Postiz post id but no live URL yet — the cron polls these. */
export function pendingDistributionRows(): DistributionRow[] {
  return getDb()
    .prepare(`SELECT * FROM distributions WHERE status='scheduled' AND postiz_post_id IS NOT NULL`)
    .all() as DistributionRow[];
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
    distributions: distributionsForVideo(r.id),
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
  getDb().prepare(`DELETE FROM distributions WHERE video_id=?`).run(id);
  for (const f of [row.video_file, row.poster_file]) {
    if (!f) continue;
    const p = path.join(mediaDir(), f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}

/** Delete every video published by a given wallet (used to replace the demo seed set). */
export function deleteVideosByPublisher(publisher: string): number {
  const rows = getDb()
    .prepare(`SELECT id FROM videos WHERE published_by=?`)
    .all(publisher.toLowerCase()) as { id: number }[];
  for (const r of rows) deleteVideo(r.id);
  return rows.length;
}
