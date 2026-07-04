// server/megaphone/distribute.ts
// Fan a published video out to social channels via Postiz. The no-repeat guarantee lives in
// the store's UNIQUE(video_id, integration_id): reserveDistribution() returns null when a
// channel was already claimed, so we never post the same video to the same channel twice.
//
// Two entry points share one core:
//  - distributeVideo(id)         auto path, gated by MEGAPHONE_AUTO_DISTRIBUTE=1 (on publish)
//  - distributeVideoTo(id, ids)  manual admin path, works whenever Postiz is configured
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

export type DistributeSummary = { posted: number; skipped: number; failed: number };

export function autoDistributeEnabled(): boolean {
  return postizConfigured() && process.env.MEGAPHONE_AUTO_DISTRIBUTE === "1";
}

/** Which connected channels to target by default. Env allowlist of ids, else all. */
function pickTargets(all: PostizIntegration[]): PostizIntegration[] {
  const allow = (process.env.MEGAPHONE_DISTRIBUTE_INTEGRATIONS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) return all;
  const set = new Set(allow);
  return all.filter((i) => set.has(i.id));
}

/** Shared core: upload once, then reserve+post per channel. Never throws to the caller. */
async function runDistribution(videoId: number, integrations: PostizIntegration[]): Promise<DistributeSummary> {
  const summary: DistributeSummary = { posted: 0, skipped: 0, failed: 0 };
  const video = getRow(videoId);
  if (!video || video.status !== "published" || integrations.length === 0) return summary;

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
    // Reserve first: if this channel was already claimed, skip without posting.
    const rowId = reserveDistribution({ videoId, integrationId: integ.id, provider: integ.provider, scheduledFor: Date.now() });
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
            settings: settingsFor(integ.provider, { title: video.title, tags: ["Aavegotchi", "GHST", "gotchi"] }),
          },
        ],
      });
      if (result.postId) setDistributionPostId(rowId, result.postId);
      else markDistributionPosted(rowId, null); // nothing to poll -> mark done now
      summary.posted++;
    } catch (e) {
      markDistributionFailed(rowId);
      summary.failed++;
      console.warn(`[megaphone-distribute] ${integ.provider} failed:`, (e as Error).message);
    }
  }
  console.log(`[megaphone-distribute] video ${videoId}: posted ${summary.posted}, skipped ${summary.skipped}, failed ${summary.failed}`);
  return summary;
}

/** Auto path (on publish). No-op unless MEGAPHONE_AUTO_DISTRIBUTE=1. Targets the env allowlist. */
export async function distributeVideo(videoId: number): Promise<DistributeSummary> {
  if (!autoDistributeEnabled()) return { posted: 0, skipped: 0, failed: 0 };
  try {
    return await runDistribution(videoId, pickTargets(await listIntegrations()));
  } catch (e) {
    console.warn("[megaphone-distribute] auto failed:", (e as Error).message);
    return { posted: 0, skipped: 0, failed: 0 };
  }
}

/** Manual admin path: distribute to explicitly chosen channels. Works whenever Postiz is set. */
export async function distributeVideoTo(videoId: number, integrationIds: string[]): Promise<DistributeSummary> {
  if (!postizConfigured() || integrationIds.length === 0) return { posted: 0, skipped: 0, failed: 0 };
  const want = new Set(integrationIds);
  const integrations = (await listIntegrations()).filter((i) => want.has(i.id));
  return runDistribution(videoId, integrations);
}
