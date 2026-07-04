// server/megaphone/tweets.ts
// Promo-tweet queue for the Megaphone. Drafts are generated locally (see tweets/ generator),
// ingested here, reviewed in the Tweets tab, and posted to X via Postiz. A content hash with
// a UNIQUE constraint enforces "never the same tweet" at the DB level.
import crypto from "node:crypto";
import { getDb } from "./store";
import type { TweetPublic, TweetStatus } from "../../src/lib/megaphone/types";

interface TweetRow {
  id: number;
  text: string;
  source: string;
  link: string | null;
  hash: string;
  status: TweetStatus;
  external_url: string | null;
  postiz_post_id: string | null;
  scheduled_for: number | null;
  created_at: number;
  posted_at: number | null;
}

/** Normalize aggressively so trivially-different repeats collide (lowercase, strip urls/punct). */
export function tweetHash(text: string): string {
  const norm = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return crypto.createHash("sha1").update(norm).digest("hex");
}

function toPublic(r: TweetRow): TweetPublic {
  return {
    id: r.id,
    text: r.text,
    source: r.source,
    link: r.link,
    status: r.status,
    externalUrl: r.external_url,
    scheduledFor: r.scheduled_for,
    createdAt: r.created_at,
    postedAt: r.posted_at,
  };
}

export interface NewTweet {
  text: string;
  source: string;
  link?: string | null;
}

/** Insert draft candidates, skipping any whose content hash already exists. */
export function ingestTweets(candidates: NewTweet[]): { added: number; skipped: number } {
  const insert = getDb().prepare(
    `INSERT OR IGNORE INTO tweets (text, source, link, hash, status, created_at)
     VALUES (?, ?, ?, ?, 'draft', ?)`
  );
  let added = 0;
  const tx = getDb().transaction((rows: NewTweet[]) => {
    for (const c of rows) {
      const text = c.text.trim().slice(0, 4000);
      if (!text) continue;
      const info = insert.run(text, c.source || "app", c.link ?? null, tweetHash(text), Date.now());
      if (info.changes > 0) added++;
    }
  });
  tx(candidates);
  return { added, skipped: candidates.length - added };
}

export function listTweets(status?: TweetStatus): TweetPublic[] {
  const rows = status
    ? (getDb().prepare(`SELECT * FROM tweets WHERE status=? ORDER BY created_at DESC`).all(status) as TweetRow[])
    : (getDb().prepare(`SELECT * FROM tweets ORDER BY created_at DESC`).all() as TweetRow[]);
  return rows.map(toPublic);
}

export function getTweet(id: number): TweetRow | null {
  return (getDb().prepare(`SELECT * FROM tweets WHERE id=?`).get(id) as TweetRow | undefined) ?? null;
}

export function setTweetStatus(id: number, status: TweetStatus): void {
  getDb().prepare(`UPDATE tweets SET status=? WHERE id=?`).run(status, id);
}

/** Owner edit of the draft text (keeps it a draft; refreshes the dedupe hash). */
export function editTweet(id: number, text: string): void {
  const t = text.trim().slice(0, 4000);
  getDb().prepare(`UPDATE tweets SET text=?, hash=? WHERE id=?`).run(t, tweetHash(t), id);
}

/** Mark posted once Postiz actually published (must have a real live URL). */
export function markTweetPosted(id: number, externalUrl: string): void {
  getDb()
    .prepare(`UPDATE tweets SET status='posted', external_url=?, posted_at=? WHERE id=?`)
    .run(externalUrl, Date.now(), id);
}

/** Postiz accepted the post but hasn't confirmed yet — pending publish. */
export function markTweetPending(id: number, postizId: string | null, scheduledFor: number | null): void {
  getDb()
    .prepare(`UPDATE tweets SET status='scheduled', postiz_post_id=?, scheduled_for=? WHERE id=?`)
    .run(postizId, scheduledFor, id);
}

/** Postiz reported the publish failed (e.g. X token bad). Retryable from the UI. */
export function markTweetFailed(id: number): void {
  getDb().prepare(`UPDATE tweets SET status='failed' WHERE id=?`).run(id);
}

/** Recent tweet texts (any status) so the generator can avoid repeating itself. */
export function recentTweetTexts(limit = 200): string[] {
  const rows = getDb()
    .prepare(`SELECT text FROM tweets ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as { text: string }[];
  return rows.map((r) => r.text);
}

/** Tweets Postiz has accepted but not yet confirmed (scheduled/pending, or legacy posted with
 *  no URL). The cron checks each and flips it to posted (with the live URL) or failed. */
export function pendingTweetPosts(): { id: number; postiz_post_id: string }[] {
  return getDb()
    .prepare(`SELECT id, postiz_post_id FROM tweets WHERE status IN ('scheduled','posted') AND postiz_post_id IS NOT NULL AND external_url IS NULL`)
    .all() as { id: number; postiz_post_id: string }[];
}

export function setTweetUrl(id: number, url: string): void {
  getDb().prepare(`UPDATE tweets SET external_url=? WHERE id=?`).run(url, id);
}

// --- Scheduling: at most 5 tweets a day, spread across fixed UTC slots ---
const SLOTS_UTC = [14, 16, 18, 20, 22]; // 5 slots => hard cap of 5/day

function takenSlotTimes(): Set<number> {
  const rows = getDb()
    .prepare(`SELECT scheduled_for FROM tweets WHERE scheduled_for IS NOT NULL AND status IN ('scheduled','posted')`)
    .all() as { scheduled_for: number }[];
  return new Set(rows.map((r) => r.scheduled_for));
}

/** Earliest free future slot. Because there are exactly 5 slots/day, this enforces <=5/day. */
export function nextScheduleSlot(now = Date.now()): number {
  const taken = takenSlotTimes();
  for (let day = 0; day < 90; day++) {
    const base = new Date(now);
    base.setUTCHours(0, 0, 0, 0);
    base.setUTCDate(base.getUTCDate() + day);
    for (const h of SLOTS_UTC) {
      const t = base.getTime() + h * 3_600_000;
      if (t > now + 5 * 60_000 && !taken.has(t)) return t;
    }
  }
  return now + 3_600_000;
}

export function scheduleTweetRow(id: number, when: number, postizId: string | null): void {
  getDb()
    .prepare(`UPDATE tweets SET status='scheduled', scheduled_for=?, postiz_post_id=? WHERE id=?`)
    .run(when, postizId, id);
}

/** Public: what's live or on the way (posted + scheduled). No auth needed to view. */
export function listPublicTweets(): TweetPublic[] {
  const rows = getDb()
    .prepare(`SELECT * FROM tweets WHERE status IN ('posted','scheduled') ORDER BY COALESCE(posted_at, scheduled_for) DESC`)
    .all() as TweetRow[];
  return rows.map(toPublic);
}
