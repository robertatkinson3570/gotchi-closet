// server/megaphone/distribute.ts
// Fan a published video out to social channels via Postiz. The no-repeat guarantee lives in
// the store's UNIQUE(video_id, integration_id): reserveDistribution() returns null when a
// channel was already claimed, so we never post the same video to the same channel twice.
// Fully gated: does nothing unless Postiz is configured AND MEGAPHONE_AUTO_DISTRIBUTE=1.
import fs from "node:fs";
import path from "node:path";
import {
  getRow,
  markDistributionFailed,
  markDistributionPosted,
  mediaDir,
  reserveDistribution,
  setDistributionPostId,
} from "./store";
import {
  createPost,
  listIntegrations,
  postizConfigured,
  settingsFor,
  uploadMedia,
  type PostizIntegration,
} from "./postiz";

export function autoDistributeEnabled(): boolean {
  return postizConfigured() && process.env.MEGAPHONE_AUTO_DISTRIBUTE === "1";
}

/** Which connected channels to target. Env allowlist of integration ids, else all. */
function pickTargets(all: PostizIntegration[]): PostizIntegration[] {
  const allow = (process.env.MEGAPHONE_DISTRIBUTE_INTEGRATIONS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) return all;
  const set = new Set(allow);
  return all.filter((i) => set.has(i.id));
}

/**
 * Distribute one video to every target channel it hasn't been sent to yet. Idempotent and
 * safe to call more than once. Returns a short summary for logging. Never throws to the
 * caller — a publish should not fail because a social post hiccuped.
 */
export async function distributeVideo(videoId: number): Promise<{ posted: number; skipped: number; failed: number }> {
  const summary = { posted: 0, skipped: 0, failed: 0 };
  if (!autoDistributeEnabled()) return summary;

  const video = getRow(videoId);
  if (!video || video.status !== "published") return summary;

  let integrations: PostizIntegration[];
  try {
    integrations = pickTargets(await listIntegrations());
  } catch (e) {
    console.warn("[megaphone-distribute] could not list integrations:", (e as Error).message);
    return summary;
  }
  if (integrations.length === 0) return summary;

  // Upload the media to Postiz once, reuse across channels.
  const filePath = path.join(mediaDir(), video.video_file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[megaphone-distribute] media missing for video ${videoId}`);
    return summary;
  }
  let media;
  try {
    media = await uploadMedia(fs.readFileSync(filePath), video.video_file);
  } catch (e) {
    console.warn("[megaphone-distribute] upload failed:", (e as Error).message);
    return summary;
  }

  const nowIso = new Date(Date.now() + 60_000).toISOString(); // ~1 min out, gives Postiz a beat

  for (const integ of integrations) {
    // Reserve first: if another run already claimed this channel, skip without posting.
    const rowId = reserveDistribution({
      videoId,
      integrationId: integ.id,
      provider: integ.provider,
      scheduledFor: Date.now(),
    });
    if (rowId === null) {
      summary.skipped++;
      continue;
    }
    try {
      const result = await createPost({
        type: "now",
        date: nowIso,
        posts: [
          {
            integration: { id: integ.id },
            value: [{ content: video.caption || video.title, image: [media] }],
            settings: settingsFor(integ.provider, {
              title: video.title,
              tags: ["Aavegotchi", "GHST", "gotchi"],
            }),
          },
        ],
      });
      if (result.postId) setDistributionPostId(rowId, result.postId);
      // Postiz publishes async; the cron fills in the live URL. Mark posted optimistically
      // only when there is nothing to poll (no post id came back).
      if (!result.postId) markDistributionPosted(rowId, null);
      summary.posted++;
    } catch (e) {
      markDistributionFailed(rowId);
      summary.failed++;
      console.warn(`[megaphone-distribute] ${integ.provider} failed:`, (e as Error).message);
    }
  }

  console.log(
    `[megaphone-distribute] video ${videoId}: posted ${summary.posted}, skipped ${summary.skipped}, failed ${summary.failed}`
  );
  return summary;
}
