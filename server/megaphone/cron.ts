// server/megaphone/cron.ts
// Polls Postiz for the live URLs of scheduled distributions and writes them into the ledger
// so the UI can show "posted to X [link] 2h ago". No-op unless Postiz is configured. This is
// read-only against Postiz — it never creates posts, so it can never cause a repeat.
import cron from "node-cron";
import { markDistributionPosted, pendingDistributionRows } from "./store";
import { pendingTweetPosts, setTweetUrl } from "./tweets";
import { getPosts, postizConfigured } from "./postiz";

let started = false;

/** Best-effort extraction of a released/public URL from a Postiz post record. */
function releaseUrl(post: Record<string, unknown>): string | null {
  for (const key of ["releaseURL", "releaseUrl", "url", "link", "postUrl"]) {
    const v = post[key];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  // Some shapes nest it under an array of releases.
  const releases = (post.releaseURL ?? post.releases) as unknown;
  if (Array.isArray(releases) && typeof releases[0] === "string") return releases[0];
  return null;
}

async function reconcile(): Promise<void> {
  const pending = pendingDistributionRows();
  const pendingTweets = pendingTweetPosts();
  if (pending.length === 0 && pendingTweets.length === 0) return;
  let posts: Record<string, unknown>[];
  try {
    posts = await getPosts();
  } catch (e) {
    console.warn("[megaphone-cron] getPosts failed:", (e as Error).message);
    return;
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of posts) {
    const id = p.id ?? p.postId ?? p.group;
    if (id != null) byId.set(String(id), p);
  }
  for (const row of pending) {
    const post = row.postiz_post_id ? byId.get(row.postiz_post_id) : undefined;
    if (!post) continue;
    const state = String(post.state ?? post.status ?? "").toUpperCase();
    const url = releaseUrl(post);
    if (state === "PUBLISHED" || url) markDistributionPosted(row.id, url);
  }
  for (const t of pendingTweets) {
    const post = byId.get(t.postiz_post_id);
    const url = post ? releaseUrl(post) : null;
    if (url) setTweetUrl(t.id, url);
  }
}

export function startMegaphoneCron(): void {
  if (started) return;
  if (!postizConfigured()) {
    console.log("[megaphone-cron] disabled (Postiz not configured)");
    return;
  }
  started = true;
  // Every 5 minutes: fill in live URLs for anything Postiz has since published.
  cron.schedule("*/5 * * * *", () => {
    reconcile().catch((e) => console.warn("[megaphone-cron] reconcile error:", (e as Error).message));
  });
  console.log("[megaphone-cron] scheduled (URL reconcile every 5m)");
}
