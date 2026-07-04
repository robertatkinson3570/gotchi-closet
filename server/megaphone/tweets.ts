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

export function markTweetPosted(id: number, externalUrl: string | null, postizId: string | null): void {
  getDb()
    .prepare(`UPDATE tweets SET status='posted', external_url=?, postiz_post_id=?, posted_at=? WHERE id=?`)
    .run(externalUrl, postizId, Date.now(), id);
}

export function setTweetPostId(id: number, postizId: string): void {
  getDb().prepare(`UPDATE tweets SET postiz_post_id=? WHERE id=?`).run(postizId, id);
}

/** Recent tweet texts (any status) so the generator can avoid repeating itself. */
export function recentTweetTexts(limit = 200): string[] {
  const rows = getDb()
    .prepare(`SELECT text FROM tweets ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as { text: string }[];
  return rows.map((r) => r.text);
}

/** Posted tweets that have a postiz id but no live URL yet — the cron reconciles these. */
export function pendingTweetPosts(): { id: number; postiz_post_id: string }[] {
  return getDb()
    .prepare(`SELECT id, postiz_post_id FROM tweets WHERE status='posted' AND postiz_post_id IS NOT NULL AND external_url IS NULL`)
    .all() as { id: number; postiz_post_id: string }[];
}

export function setTweetUrl(id: number, url: string): void {
  getDb().prepare(`UPDATE tweets SET external_url=? WHERE id=?`).run(url, id);
}
